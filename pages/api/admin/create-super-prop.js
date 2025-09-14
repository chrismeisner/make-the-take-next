import { createRepositories } from "../../../lib/dal/factory";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const {
    packTitle,
    propShort,
    propSummary,
    sideCount,
    // Manual event creation fields
    eventTitle,
    eventTime,
    eventLeague,
    // Existing event ID for linking
    eventId,
    // Pack-level cover URL
    packCoverUrl,
    // dynamic short/take labels and any additional prop fields
    ...rest
  } = req.body;

  if (!propShort || sideCount === undefined) {
    return res.status(400).json({ success: false, error: "Missing propShort or sideCount" });
  }

  // 1) Resolve or create Event (Postgres)
  let finalEventId = null;
  try {
    if (eventId && typeof eventId === 'string') {
      finalEventId = eventId;
    } else if (eventTitle && eventTime && eventLeague) {
      const { rows } = await query(
        `INSERT INTO events (title, event_time, league)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [eventTitle, new Date(eventTime).toISOString(), String(eventLeague).toLowerCase()]
      );
      finalEventId = rows?.[0]?.id || null;
    }
  } catch (e) {
    console.error("[api/admin/create-super-prop] PG event upsert error =>", e?.message || e);
    return res.status(500).json({ success: false, error: "Failed to create linked event" });
  }

  // 2) Create a Pack for this super prop (Postgres)
  try {
    const slugBase = (packTitle || propShort).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    const packURL = `${slugBase}-${Date.now()}`;
    const { packs } = createRepositories();
    const createdPack = await packs.createOne({
      packTitle: packTitle || propShort,
      packSummary: propSummary || "",
      packURL,
      packType: "superprop",
      packStatus: "active",
      packCoverUrl: packCoverUrl || null,
      eventId: finalEventId,
    });

    // 3) Create the Prop in Postgres and link to Pack
    const { props } = createRepositories();
    const createdProp = await props.createOne({
      prop_short: propShort,
      prop_summary: propSummary || "",
      side_count: typeof sideCount === 'number' ? sideCount : 2,
      prop_status: 'open',
      pack_id: createdPack?.id || null,
      event_id: finalEventId || null,
      // spread-through of additional fields if your repo maps them (safe subset only)
      ...rest,
    });

    return res.status(200).json({ success: true, record: createdProp });
  } catch (error) {
    console.error("[api/admin/create-super-prop PG] Error =>", error);
    return res.status(500).json({ success: false, error: "Failed to create super prop" });
  }
} 