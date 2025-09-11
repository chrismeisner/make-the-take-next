// File: /pages/api/packs/index.js
 
import Airtable from "airtable";
import { getToken } from "next-auth/jwt";
import { upsertEvent } from "../../../lib/airtableService";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";
import { createRepositories } from "../../../lib/dal/factory";
import { withRouteTiming } from "../../../lib/timing";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

// Ensure all timestamps are serialized as ISO 8601 UTC strings
const toIso = (t) => (t ? new Date(t).toISOString() : null);

// Helper: Fetch all packs from Airtable and map to our data structure
// If a view name is provided, we will use that Airtable view to drive filtering/sorting.
// Otherwise, default to active/graded filter.
async function fetchAllPacks(viewName) {
  const selectOptions = { maxRecords: 100 };
  if (viewName && typeof viewName === "string") {
    selectOptions.view = viewName;
  } else {
    // include active, graded, and coming-soon (case-insensitive)
    selectOptions.filterByFormula = `OR(LOWER({packStatus})='active', LOWER({packStatus})='graded', LOWER({packStatus})='coming-soon')`;
  }

  const packRecords = await base("Packs").select(selectOptions).all();

  const packsData = await Promise.all(packRecords.map(async (record) => {
	const fields = record.fields;
	let eventTitle = null;
	if (fields.Event?.length) {
	  try {
		const ev = await base("Events").find(fields.Event[0]);
		eventTitle = ev.fields.eventTitle;
	  } catch (err) {
		console.error("[api/packs] error fetching linked Event:", err);
	  }
	}
	return {
	  airtableId: record.id,
	  eventTitle,
	  propEventRollup: Array.isArray(fields.propEventRollup) ? fields.propEventRollup : [],
	  packID: fields.packID || record.id,
	  packTitle: fields.packTitle || "Untitled Pack",
	  packURL: fields.packURL || "",
	  packCover: fields.packCover ? fields.packCover[0]?.url : null,
	  packPrize: fields.packPrize || "",
	  prizeSummary: fields.prizeSummary || "",
	  packSummary: fields.packSummary || "",
	  packType: fields.packType || "unknown",
	  packLeague: fields.packLeague || null,
	  packStatus: fields.packStatus || "Unknown",
	  packOpenTime: toIso(fields.packOpenTime) || null,
	  packCloseTime: toIso(fields.packCloseTime) || null,
	  eventTime: toIso(fields.eventTime) || null,
	  firstPlace: fields.firstPlace || "",
	  createdAt: record._rawJson.createdTime,
	  propsCount: (fields.Props || []).length,
      // Winner info (from Airtable): either lookup or derive from linked record id
      winnerProfileID: fields.winnerProfileID || null,
      packWinnerRecordIds: Array.isArray(fields.packWinner) ? fields.packWinner : [],
	};
  }));
  return packsData;
}

// Helper: If user is logged in, attach userTakeCount for each pack.
async function attachUserTakeCount(packsData, token) {
  // 1. Fetch all latest takes by this user
  const filterByFormula = `AND({takeMobile} = '${token.phone}', {takeStatus} = 'latest')`;
  const userTakeRecords = await base('Takes')
    .select({ filterByFormula, maxRecords: 5000 })
    .all();

  // Count user takes per pack via the 'packID' lookup field
  const packIdToUserCount = {};
  userTakeRecords.forEach((rec) => {
    const f = rec.fields;
    // 'packID' may be a string or an array if multiple
    const packIDs = Array.isArray(f.packID) ? f.packID : f.packID ? [f.packID] : [];
    packIDs.forEach((pid) => {
      packIdToUserCount[pid] = (packIdToUserCount[pid] || 0) + 1;
    });
  });

  // 2. Map counts onto the packs data
  return packsData.map((p) => ({
    ...p,
    userTakesCount: packIdToUserCount[p.packID] || 0,
  }));
}

// Helper: Attach total take count for each pack.
async function attachTotalTakeCount(packsData) {
  // Fetch all latest takes.
  const takeRecords = await base("Takes").select({
    filterByFormula: '{takeStatus}="latest"',
    maxRecords: 5000,
  }).all();

  const packIdToCount = {};
  takeRecords.forEach((takeRec) => {
    const packIDValue = takeRec.fields.packID;
    if (!packIDValue) return;
    if (Array.isArray(packIDValue)) {
      packIDValue.forEach((pid) => {
        packIdToCount[pid] = (packIdToCount[pid] || 0) + 1;
      });
    } else {
      packIdToCount[packIDValue] = (packIdToCount[packIDValue] || 0) + 1;
    }
  });

  return packsData.map((p) => ({
    ...p,
    takeCount: packIdToCount[p.packID] || 0,
  }));
}

async function handler(req, res) {
  // Postgres path for GET (staging/prod Postgres runtime)
  if (req.method === "GET" && getDataBackend() === 'postgres') {
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      const userPhone = token?.phone || null;

      // Ensure all timestamps returned to the client are ISO 8601 UTC strings
      const toIso = (t) => (t ? new Date(t).toISOString() : null);

      // Filter: active/graded/coming-soon (case-insensitive) if status present
      const { rows: packRows } = await query(
        `SELECT p.id,
                p.pack_id,
                p.pack_url,
                p.title,
                p.summary,
                p.prize,
                p.cover_url,
                p.league,
                p.created_at,
                p.pack_status,
                p.pack_open_time,
                p.pack_close_time,
                p.event_id,
                e.event_time,
                e.title AS event_title
           FROM packs p
           LEFT JOIN events e ON e.id = p.event_id
          WHERE LOWER(COALESCE(p.pack_status, '')) IN ('active','graded','coming-soon','draft')
             OR p.pack_status IS NULL
          ORDER BY p.created_at DESC NULLS LAST
          LIMIT 200`
      );

      const packIdToUrl = new Map(packRows.map(r => [r.id, r.pack_url]));

      // Total take counts per pack (latest only)
      const { rows: totalCounts } = await query(
        `SELECT pack_id, COUNT(*)::int AS c
           FROM takes
          WHERE take_status = 'latest'
          GROUP BY pack_id`
      );
      const totalMap = new Map(totalCounts.map(r => [r.pack_id, Number(r.c)]));

      // User-specific take counts per pack (if logged in)
      let userMap = new Map();
      if (userPhone) {
        const { rows } = await query(
          `SELECT pack_id, COUNT(*)::int AS c
             FROM takes
            WHERE take_status = 'latest' AND take_mobile = $1
            GROUP BY pack_id`,
          [userPhone]
        );
        userMap = new Map(rows.map(r => [r.pack_id, Number(r.c)]));
      }

      // Props counts per pack
      const { rows: propsCounts } = await query(
        `SELECT pack_id, COUNT(*)::int AS c
           FROM props
          WHERE pack_id IS NOT NULL
          GROUP BY pack_id`
      );
      const propsCountMap = new Map(propsCounts.map(r => [r.pack_id, Number(r.c)]));

      // Open/close window derived from props per pack (optional)
      const { rows: windowRows } = await query(
        `SELECT pack_id,
                MIN(open_time) AS open_time,
                MAX(close_time) AS close_time
           FROM props
          WHERE pack_id IS NOT NULL
          GROUP BY pack_id`
      );
      const openTimeMap = new Map(windowRows.map(r => [r.pack_id, r.open_time]));
      const closeTimeMap = new Map(windowRows.map(r => [r.pack_id, r.close_time]));

      const packsData = packRows.map((r) => ({
        airtableId: r.id, // legacy field name kept for shape compatibility
        eventId: r.event_id || null,
        eventTitle: r.event_title || null,
        propEventRollup: [],
        packID: r.pack_id || r.id, // expose external text id if present, else fallback to internal uuid
        packTitle: r.title || "Untitled Pack",
        packURL: r.pack_url || "",
        packCover: r.cover_url || null,
        packPrize: r.prize || "",
        prizeSummary: "",
        packSummary: r.summary || "",
        packType: "",
        packLeague: r.league || null,
        packStatus: r.pack_status || "",
        packOpenTime: toIso(r.pack_open_time) || toIso(openTimeMap.get(r.id)) || null,
        packCloseTime: toIso(r.pack_close_time) || toIso(closeTimeMap.get(r.id)) || null,
        eventTime: toIso(r.event_time),
        firstPlace: "",
        createdAt: toIso(r.created_at) || null,
        propsCount: propsCountMap.get(r.id) || 0,
        winnerProfileID: null,
        packWinnerRecordIds: [],
        takeCount: totalMap.get(r.id) || 0,
        userTakesCount: userMap.get(r.id) || 0,
      }));

      // Readable, emoji-enhanced summary for terminal
      try {
        const statusEmoji = (s) => {
          const v = String(s || '').toLowerCase().replace(/\s+/g, '-');
          if (v === 'open' || v === 'active') return '🟢 open';
          if (v === 'coming-soon' || v === 'coming-up') return '🟠 coming-soon';
          if (v === 'closed') return '🔴 closed';
          if (v === 'completed') return '⚫ completed';
          if (v === 'graded') return '🔵 graded';
          return '⚪ unknown';
        };
        const fmt = (t) => (t ? new Date(t).toISOString() : '—');
        const yesNo = (v) => (v ? '✅' : '❌');
        console.log(`\n=== /api/packs [postgres] count=${packsData.length} ===`);
        packsData.slice(0, 20).forEach((p, i) => {
          const coverUrl = Array.isArray(p?.packCover) && p.packCover.length > 0
            ? p.packCover[0]?.url
            : (typeof p?.packCover === 'string' ? p.packCover : null);
          console.log(`\n#${String(i + 1).padStart(2, '0')} ${p.packURL ? `(${p.packURL})` : ''}`);
          console.log(`  🆔 id: ${p.packID || p.id || p.airtableId}`);
          console.log(`  📛 title: ${p.packTitle || 'Untitled'}`);
          console.log(`  🏷️ league: ${p.packLeague || '—'}`);
          console.log(`  📊 status: ${statusEmoji(p.packStatus)}`);
          console.log(`  🧩 props: ${p.propsCount ?? 0}`);
          console.log(`  👥 takes: ${p.takeCount ?? 0} total, ${p.userTakesCount ?? 0} you`);
          console.log(`  🕒 window: ${fmt(p.packOpenTime)} → ${fmt(p.packCloseTime)}`);
          console.log(`  🖼️ cover: ${yesNo(!!coverUrl)}`);
        });
      } catch (logErr) {
        console.warn('[api/packs PG] pretty log failed =>', logErr?.message || logErr);
      }

      // Optional shadow read: compare with Airtable list and log differences
      try {
        if (process.env.SHADOW_READS === '1') {
          const atPacks = await fetchAllPacks(undefined);
          const pgSet = new Set(packsData.map(p => p.packURL));
          const atSet = new Set(atPacks.map(p => p.packURL));
          const onlyPg = [...pgSet].filter(u => !atSet.has(u));
          const onlyAt = [...atSet].filter(u => !pgSet.has(u));
          const countDiff = packsData.length !== atPacks.length;
          if (onlyPg.length || onlyAt.length || countDiff) {
            console.warn('[shadow /api/packs] diff', { countPg: packsData.length, countAt: atPacks.length, onlyPg: onlyPg.slice(0,10), onlyAt: onlyAt.slice(0,10) });
          }
        }
      } catch (shadowErr) {
        console.warn('[shadow /api/packs] shadow compare failed =>', shadowErr?.message || shadowErr);
      }

      return res.status(200).json({ success: true, packs: packsData });
    } catch (error) {
      console.error("[api/packs PG] Error =>", error);
      return res.status(500).json({ success: false, error: "Failed to fetch packs." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const packId = req.query.packId || req.body?.packId;
      if (!packId || typeof packId !== 'string' || !packId.startsWith('rec')) {
        return res.status(400).json({ success: false, error: 'Missing or invalid packId' });
      }
      const deleted = await base('Packs').destroy([packId]);
      return res.status(200).json({ success: true, deleted: deleted?.[0]?.id || packId });
    } catch (error) {
      console.error('[api/packs DELETE] Error =>', error);
      const msg = error.message || 'Failed to delete pack';
      return res.status(500).json({ success: false, error: msg });
    }
  }
  if (req.method === "PATCH") {
    // Update pack fields
    const { packId, packURL } = req.body;
    if (!packId && !packURL) {
      return res.status(400).json({ success: false, error: "Missing packId or packURL" });
    }
    try {
      // Prefer DAL when packURL is provided
      if (packURL) {
        const { packs } = createRepositories();
        const updated = await packs.updateByPackURL(packURL, req.body || {});
        // In Postgres mode, if client provided a props[] list, sync membership to this pack
        if (getDataBackend() === 'postgres' && Array.isArray(req.body?.props)) {
          try {
            const packUUID = updated?.id;
            if (packUUID) {
              // Fetch current prop ids linked to this pack
              const { rows: existingRows } = await query('SELECT id FROM props WHERE pack_id = $1', [packUUID]);
              const existing = new Set(existingRows.map(r => r.id));
              const desired = new Set(req.body.props.filter((x) => typeof x === 'string' && x));
              const toLink = [...desired].filter((id) => !existing.has(id));
              const toUnlink = [...existing].filter((id) => !desired.has(id));
              if (toLink.length > 0) {
                await query('UPDATE props SET pack_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])', [packUUID, toLink]);
              }
              if (toUnlink.length > 0) {
                await query('UPDATE props SET pack_id = NULL, updated_at = NOW() WHERE id = ANY($1::uuid[]) AND pack_id = $2', [toUnlink, packUUID]);
              }
            }
          } catch (mErr) {
            console.error('[api/packs PATCH PG] props membership sync failed =>', mErr?.message || mErr);
          }
        }
        // Optional dual-write to Airtable for safety during staging
        if (getDataBackend() === 'postgres' && process.env.DUAL_WRITE_AIRTABLE === '1') {
          try {
            const fields = {};
            const { packTitle, packSummary, packType, packLeague, packStatus, packOpenTime, packCloseTime, packCoverUrl, props, events } = req.body || {};
            if (packTitle !== undefined) fields.packTitle = packTitle;
            if (packSummary !== undefined) fields.packSummary = packSummary;
            if (packType !== undefined) fields.packType = packType;
            if (packLeague !== undefined) fields.packLeague = packLeague;
            if (packStatus !== undefined) fields.packStatus = packStatus;
            if (packOpenTime !== undefined) fields.packOpenTime = packOpenTime;
            if (packCloseTime !== undefined) fields.packCloseTime = packCloseTime;
            if (packCoverUrl) fields.packCover = [{ url: packCoverUrl }];
            if (Array.isArray(props)) fields.Props = props;
            if (Array.isArray(events)) fields.Event = events;
            const safe = packURL.replace(/"/g, '\\"');
            const recs = await base('Packs').select({ filterByFormula: `{packURL} = "${safe}"`, maxRecords: 1 }).firstPage();
            if (recs?.length) {
              await base('Packs').update([{ id: recs[0].id, fields }], { typecast: true });
            }
          } catch (dwErr) {
            console.error('[api/packs PATCH] dual-write Airtable failed =>', dwErr);
          }
        }
        return res.status(200).json({ success: true, record: updated });
      }

      const {
        packTitle,
        packSummary,
        packType,
        packLeague,
        packStatus,
        packOpenTime,
        packCloseTime,
        packCoverUrl,
        props,
        events,
      } = req.body;

      const fields = {};
      if (packTitle !== undefined) fields.packTitle = packTitle;
      if (packSummary !== undefined) fields.packSummary = packSummary;
      if (packType !== undefined) fields.packType = packType;
      if (packLeague !== undefined) fields.packLeague = packLeague;
      if (packStatus !== undefined) fields.packStatus = packStatus;
      if (packOpenTime !== undefined) fields.packOpenTime = packOpenTime;
      if (packCloseTime !== undefined) fields.packCloseTime = packCloseTime;
      if (packCoverUrl !== undefined && packCoverUrl) {
        fields.packCover = [{ url: packCoverUrl }];
      }
      if (Array.isArray(props)) {
        fields.Props = props;
      }
      if (Array.isArray(events)) {
        // Expect array of Airtable record IDs
        fields.Event = events;
      }

      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ success: false, error: "No updatable fields provided" });
      }

      const updated = await base("Packs").update([
        { id: packId, fields }
      ], { typecast: true });
      return res.status(200).json({ success: true, record: updated[0] });
    } catch (error) {
      console.error("[api/packs PATCH] Error =>", error);
      const msg = error.message || "Failed to update pack";
      return res.status(500).json({ success: false, error: msg });
    }
  }
  if (req.method === "POST") {
    try {
      const { packTitle, packSummary, packURL, packType, packLeague, packStatus, packOpenTime, packCloseTime, event, eventId, events, teams, packCoverUrl, props, packCreator, firstPlace } = req.body;
      // Prize can be provided directly or aliased from firstPlace
      const prize = (req.body && (req.body.prize || firstPlace)) || null;
      if (!packTitle || !packURL) {
        return res.status(400).json({ success: false, error: "Missing required fields: packTitle and packURL" });
      }

      const { packs } = createRepositories();
      // Map linked Event(s) to Postgres event UUID if backend is Postgres
      let pgEventUUID = null;
      let derivedLeague = null;
      if (getDataBackend() === 'postgres') {
        try {
          const atEventIds = Array.isArray(events) && events.length > 0
            ? events
            : (typeof eventId === 'string' && eventId.startsWith('rec') ? [eventId] : []);
          if (atEventIds.length > 0) {
            const atId = atEventIds[0];
            console.log('[api/packs POST] Resolving Airtable Event to Postgres:', { atId });
            const evRec = await base('Events').find(atId);
            const f = evRec?.fields || {};
            const espnGameID = f.espnGameID || null;
            const title = f.eventTitle || f.title || null;
            const league = f.eventLeague || null;
            const eventTimeISO = f.eventTime ? new Date(f.eventTime).toISOString() : null;
            if (espnGameID) {
              const upsertSql = `INSERT INTO events (espn_game_id, title, event_time, league, event_id)
                                 VALUES ($1,$2,$3,$4,$5)
                                 ON CONFLICT (espn_game_id) DO UPDATE SET
                                   title = EXCLUDED.title,
                                   event_time = EXCLUDED.event_time,
                                   league = EXCLUDED.league
                                 RETURNING id`;
              const { rows } = await query(upsertSql, [espnGameID, title, eventTimeISO, league, espnGameID]);
              pgEventUUID = rows[0]?.id || null;
            } else {
              const upsertSql = `INSERT INTO events (title, event_time, league, event_id)
                                 VALUES ($1,$2,$3,$4)
                                 ON CONFLICT (event_id) DO UPDATE SET
                                   title = EXCLUDED.title,
                                   event_time = EXCLUDED.event_time,
                                   league = EXCLUDED.league
                                 RETURNING id`;
              const { rows } = await query(upsertSql, [title, eventTimeISO, league, atId]);
              pgEventUUID = rows[0]?.id || null;
            }
            console.log('[api/packs POST] Resolved PG event UUID:', pgEventUUID);
            if (league) {
              try { derivedLeague = String(league).toLowerCase(); } catch {}
            }
          }
        } catch (mapErr) {
          console.error('[api/packs POST] Failed to map/link Event to Postgres =>', mapErr);
        }
      }
      // If still not resolved from Airtable mapping, allow direct Postgres UUID passthrough
      let finalEventId = pgEventUUID;
      if (getDataBackend() === 'postgres' && !finalEventId) {
        // Prefer explicit eventId if it's a UUID
        if (eventId && typeof eventId === 'string' && !eventId.startsWith('rec')) {
          finalEventId = eventId;
        }
        // Or use first element from events[] if that looks like a UUID
        if (!finalEventId && Array.isArray(events) && events.length > 0) {
          const candidate = events.find((e) => typeof e === 'string' && !e.startsWith('rec'));
          if (candidate) finalEventId = candidate;
        }
        // If we have a finalEventId, derive league from Postgres events table
        if (finalEventId && !derivedLeague) {
          try {
            const { rows } = await query('SELECT league FROM events WHERE id = $1 LIMIT 1', [finalEventId]);
            const leagueVal = rows?.[0]?.league || null;
            if (leagueVal) derivedLeague = String(leagueVal).toLowerCase();
          } catch (e) {
            console.warn('[api/packs POST] Failed to derive league from Postgres event =>', e?.message || e);
          }
        }
      }

      // Prefer DAL create in both backends
      const created = await packs.createOne({
        packTitle, packSummary, packURL, packType,
        packLeague: (packLeague ? String(packLeague).toLowerCase() : null) || derivedLeague || null,
        packStatus,
        packOpenTime, packCloseTime, packCoverUrl,
        prize,
        eventId: finalEventId,
        events, props,
      });
      // Optional dual-write to Airtable
      if (getDataBackend() === 'postgres' && process.env.DUAL_WRITE_AIRTABLE === '1') {
        try {
          const fields = { packTitle, packSummary, packURL, packType, packLeague, packStatus };
          if (created?.packID) fields.packID = created.packID;
          if (packOpenTime) fields.packOpenTime = packOpenTime;
          if (packCloseTime) fields.packCloseTime = packCloseTime;
          if (packCoverUrl) fields.packCover = [{ url: packCoverUrl }];
          if (Array.isArray(events)) fields.Event = events;
          if (Array.isArray(props)) fields.Props = props;
          if (prize) fields.packPrize = prize;
          await base('Packs').create([{ fields }], { typecast: true });
        } catch (dwErr) {
          console.error('[api/packs POST] dual-write Airtable failed =>', dwErr);
        }
      }
      return res.status(200).json({ success: true, record: created });
    } catch (error) {
      console.error("[api/packs POST] Error =>", error);
      // Return the underlying error message if available
      const msg = error.message || "Failed to create pack.";
      return res.status(500).json({ success: false, error: msg });
    }
  }
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }
  try {
	const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
	const userIsLoggedIn = !!token;

	// Optional: allow clients to specify an Airtable view name for fetching packs
	const { view } = req.query;

	let packsData = await fetchAllPacks(view);

	// Attach total take count for each pack.
	packsData = await attachTotalTakeCount(packsData);

	if (userIsLoggedIn) {
	  packsData = await attachUserTakeCount(packsData, token);
	}

	console.log('[api/packs AT] count=', packsData.length, 'examples=', packsData.slice(0,5).map(p=>p.packURL));
	return res.status(200).json({ success: true, packs: packsData });
  } catch (error) {
	console.error("[api/packs] Error =>", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Failed to fetch packs." });
  }
}

export default withRouteTiming('/api/packs', handler);
