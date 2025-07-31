import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

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
    // dynamic short/take labels
    ...rest
  } = req.body;

  if (!propShort || sideCount === undefined) {
    return res.status(400).json({ success: false, error: "Missing propShort or sideCount" });
  }

  // Link to existing event or create new one if needed
  let eventRecordId;
  if (eventId) {
    // Link to existing event
    eventRecordId = eventId;
  } else if (eventTitle && eventTime && eventLeague) {
    // Create a new Event record if event details provided
    try {
      const [createdEvent] = await base("Events").create([
        { fields: { eventTitle, eventTime, eventLeague } }
      ]);
      eventRecordId = createdEvent.id;
    } catch (err) {
      console.error("[api/admin/create-super-prop] Event creation error =>", err);
      return res.status(500).json({ success: false, error: "Failed to create linked event" });
    }
  }

  // Build Airtable fields
  const fields = {
    propShort,
    propSummary: propSummary || "",
    sideCount,
    propStatus: "open",
    ...rest,
    // Link newly created Event to this prop
    ...(eventRecordId ? { Event: [eventRecordId] } : {}),
  };

  // Create a Pack for this super prop
  const slugBase = (packTitle || propShort).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  const packURL = `${slugBase}-${Date.now()}`;
  const packFields = {
    packTitle: packTitle || propShort,
    packSummary: propSummary || "",
    packURL,
    packType: "superprop",
    packStatus: "active",
    ...(eventRecordId ? { Event: [eventRecordId] } : {}),
    // Attach pack-level cover if provided
    ...(packCoverUrl ? { packCover: [{ url: packCoverUrl }] } : {}),
  };
  const [createdPack] = await base("Packs").create([{ fields: packFields }]);
  // Fallback: ensure the Event link is set on the Pack record
  if (eventRecordId) {
    try {
      await base("Packs").update([
        { id: createdPack.id, fields: { Event: [eventRecordId] } }
      ]);
    } catch (err) {
      console.error("[api/admin/create-super-prop] Pack event link update error =>", err);
    }
  }
  fields.Packs = [createdPack.id];

  try {
    const [created] = await base("Props").create([
      { fields }
    ]);
    return res.status(200).json({ success: true, record: created });
  } catch (error) {
    console.error("[api/admin/create-super-prop] Airtable create error =>", error);
    return res.status(500).json({ success: false, error: "Failed to create super prop" });
  }
} 