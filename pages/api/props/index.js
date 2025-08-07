// File: /pages/api/props/index.js
import fetch from "node-fetch";
import Airtable from "airtable";

/**
 * This version uses Airtable's REST API (instead of the Airtable.js client),
 * allowing you to pass `?limit=10` and `?offset=xyz` to do server-side pagination.
 *
 * Example usage:
 *  GET /api/props?limit=10
 *  => returns up to 10 records plus a `nextOffset` if more exist
 *  GET /api/props?limit=10&offset=itrx12345
 *  => returns the next 10
 */
export default async function handler(req, res) {
  if (req.method === "POST") {
    // Create a new Prop linked to a Pack
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    // Destructure core prop fields, including value model and moneylines
    const { propShort, propSummary, PropSideAShort, PropSideBShort, PropSideATake, PropSideBTake, propType, propStatus, packId, propOrder, teams, propValueModel, PropSideAMoneyline, PropSideBMoneyline, propCover,
            propCloseTime,
            // Event linkage fields
            eventId, eventTitle, eventTime, eventLeague } = req.body;
    // Parse moneyline inputs to numbers for Airtable numeric fields
    const moneylineA = (PropSideAMoneyline !== undefined && PropSideAMoneyline !== "")
      ? parseFloat(PropSideAMoneyline)
      : null;
    const moneylineB = (PropSideBMoneyline !== undefined && PropSideBMoneyline !== "")
      ? parseFloat(PropSideBMoneyline)
      : null;
    if (!propShort || (!packId && !eventId)) {
      return res.status(400).json({ success: false, error: "Missing propShort or packId/eventId" });
    }
    try {
      // Log incoming payload for debugging
      console.log('[api/props POST] req.body:', req.body);
      // Build fields object for Airtable
      const fieldsToCreate = {
        propShort,
        propSummary,
        PropSideAShort,
        PropSideBShort,
        PropSideATake,
        PropSideBTake,
        propType,
        propStatus: propStatus ?? "open",
        ...(packId ? { Packs: [packId] } : {}),
        ...(teams && teams.length ? { Teams: teams } : {}),
        ...(propOrder !== undefined ? { propOrder } : {}),
        ...(propValueModel ? { propValueModel } : {}),
        ...(moneylineA !== null && !isNaN(moneylineA) ? { PropSideAMoneyline: moneylineA } : {}),
        ...(moneylineB !== null && !isNaN(moneylineB) ? { PropSideBMoneyline: moneylineB } : {}),
        ...(propCover ? { propCover: [{ url: propCover }] } : {}),
      };
      console.log('[api/props POST] fieldsToCreate:', fieldsToCreate);
      // Determine eventRecordId: explicit, new, or pack's existing event
      let eventRecordId;
      if (eventId && typeof eventId === 'string' && eventId.startsWith('rec')) {
        eventRecordId = eventId;
      } else if (eventTitle && eventTime && eventLeague) {
        const [createdEvent] = await base("Events").create([{ fields: { eventTitle, eventTime, eventLeague } }]);
        eventRecordId = createdEvent.id;
      } else {
        const packRec = await base("Packs").find(packId);
        const packEventLink = packRec.fields.Event || [];
        if (Array.isArray(packEventLink) && packEventLink.length) {
          eventRecordId = packEventLink[0];
        }
      }
      // Parse and convert propCloseTime to ISO date string
      let closeTimeIso = null;
      if (propCloseTime) {
        closeTimeIso = new Date(propCloseTime).toISOString();
      }
      // Now that eventRecordId and closeTimeIso are defined, add them
      if (eventRecordId) {
        fieldsToCreate.Event = [eventRecordId];
        console.log('[api/props POST] fieldsToCreate.Event set to', eventRecordId);
      }
      if (closeTimeIso) {
        fieldsToCreate.propCloseTime = closeTimeIso;
        console.log('[api/props POST] fieldsToCreate.propCloseTime set to', closeTimeIso);
      }
      // Create the Prop record
      const created = await base("Props").create([
        {
          fields: fieldsToCreate,
        },
      ], { typecast: true });
      return res.status(200).json({ success: true, record: created[0] });
    } catch (err) {
      console.error("[api/props POST] Error =>", err);
      return res.status(500).json({ success: false, error: "Failed to create prop" });
    }
  }
  // PATCH: update propStatus of a specific prop
  if (req.method === "PATCH") {
    // Destructure updatable fields, including new ones
    const { propId, propStatus, propOrder, propShort, propSummary, PropSideAShort, PropSideBShort, PropSideATake, PropSideBTake, propType, teams, propValueModel, PropSideAMoneyline, PropSideBMoneyline, propCloseTime } = req.body;
    // Parse moneyline inputs for updates
    const updMoneylineA = (PropSideAMoneyline !== undefined && PropSideAMoneyline !== "")
      ? parseFloat(PropSideAMoneyline)
      : null;
    const updMoneylineB = (PropSideBMoneyline !== undefined && PropSideBMoneyline !== "")
      ? parseFloat(PropSideBMoneyline)
      : null;
    // Parse and convert propCloseTime to ISO for updates
    const updCloseTimeIso = propCloseTime ? new Date(propCloseTime).toISOString() : null;
    if (!propId) {
      return res.status(400).json({ success: false, error: "Missing propId" });
    }
    if (
      propStatus === undefined &&
      propOrder  === undefined &&
      propShort  === undefined &&
      propSummary=== undefined &&
      PropSideAShort=== undefined &&
      PropSideBShort=== undefined &&
      propType=== undefined
      && PropSideATake === undefined
      && PropSideBTake === undefined
    ) {
      return res.status(400).json({ success: false, error: "No fields provided to update" });
    }
    try {
      const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
      const fieldsToUpdate = {};
      if (propStatus     !== undefined) fieldsToUpdate.propStatus     = propStatus;
      if (propOrder      !== undefined) fieldsToUpdate.propOrder      = propOrder;
      if (propShort      !== undefined) fieldsToUpdate.propShort      = propShort;
      if (propSummary    !== undefined) fieldsToUpdate.propSummary    = propSummary;
      if (PropSideAShort !== undefined) fieldsToUpdate.PropSideAShort = PropSideAShort;
      if (PropSideBShort !== undefined) fieldsToUpdate.PropSideBShort = PropSideBShort;
      if (PropSideATake  !== undefined) fieldsToUpdate.PropSideATake  = PropSideATake;
      if (PropSideBTake  !== undefined) fieldsToUpdate.PropSideBTake  = PropSideBTake;
      if (propType       !== undefined) fieldsToUpdate.propType       = propType;
      if (teams          !== undefined) fieldsToUpdate.Teams          = teams;
      if (propValueModel !== undefined) fieldsToUpdate.propValueModel        = propValueModel;
      if (updMoneylineA !== null && !isNaN(updMoneylineA)) fieldsToUpdate.PropSideAMoneyline = updMoneylineA;
      if (updMoneylineB !== null && !isNaN(updMoneylineB)) fieldsToUpdate.PropSideBMoneyline = updMoneylineB;
      if (propCloseTime !== undefined) fieldsToUpdate.propCloseTime = updCloseTimeIso;
      const updated = await base("Props").update([
        { id: propId, fields: fieldsToUpdate }
      ], { typecast: true });
      return res.status(200).json({ success: true, record: updated[0] });
    } catch (err) {
      console.error("[api/props PATCH] Error =>", err);
      return res.status(500).json({ success: false, error: "Failed to update propStatus" });
    }
  }
  // Only GET and POST allowed beyond this point
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  
  try {
	// 1) Parse limit + offset from query
	const limit = parseInt(req.query.limit || "10", 10); // default to 10
	const offset = req.query.offset || ""; // if provided, use it; otherwise blank

	// 2) Build Airtable REST API URL, optionally using a specific view
	const baseID = process.env.AIRTABLE_BASE_ID;
	const apiKey = process.env.AIRTABLE_API_KEY;
	const tableName = "Props";
	// Determine view: use query param or default "Grid view"
	const viewParam = req.query.view || "Grid view";
	let url = `https://api.airtable.com/v0/${baseID}/${encodeURIComponent(tableName)}?pageSize=${limit}&view=${encodeURIComponent(viewParam)}`;
	if (offset) {
	  url += `&offset=${offset}`;
	}

	// 3) Fetch from Airtable
	const airtableRes = await fetch(url, {
	  headers: {
		Authorization: `Bearer ${apiKey}`,
	  },
	});
	if (!airtableRes.ok) {
	  const text = await airtableRes.text();
	  return res.status(airtableRes.status).json({ success: false, error: text });
	}
 
	const data = await airtableRes.json();
	// data => { records: [...], offset?: string }

	// 4) Convert each record to the shape we want
	// Fetch and map props, including linked Event title
	const propsData = await Promise.all(data.records.map(async (rec) => {
      const f = rec.fields;
      // Resolve linked Event title if available
      let eventTitle = null;
      let eventTime = null;
      let eventLeague = null;
      const eventLinks = Array.isArray(f.Event) ? f.Event : [];
      if (eventLinks.length) {
        try {
          const evRec = await base('Events').find(eventLinks[0]);
          eventTitle = evRec.fields.eventTitle || null;
          eventTime = evRec.fields.eventTime || null;
          eventLeague = evRec.fields.eventLeague || null;
        } catch {}
      }
      return {
        airtableId: rec.id,
        propID: f.propID || null,
        propTitle: f.propTitle || "Untitled",
        propSummary: f.propSummary || "",
        propStatus: f.propStatus || "open",
        // Important for custom short labels:
        PropSideAShort: f.PropSideAShort || "",
        PropSideBShort: f.PropSideBShort || "",
        propShort: f.propShort || "",
        // Provide linked Event title and time
        eventTitle,
        eventTime,
        eventLeague,
        propCloseTime: f.propCloseTime || null,
        // Example: subjectLogo, contentImage, etc.
        subjectLogoUrls: Array.isArray(f.subjectLogo)
          ? f.subjectLogo.map((img) => img.url)
          : [],
        contentImageUrls: Array.isArray(f.contentImage)
          ? f.contentImage.map((img) => img.url)
          : [],
        linkedPacks: Array.isArray(f.Packs) ? f.Packs : [],
        teams: Array.isArray(f.Teams) ? f.Teams : [],
        propOrder: f.propOrder || 0,
        createdAt: rec.createdTime,
      };
    }));

	// 5) If there's an offset in the response, that's for the next page
	const nextOffset = data.offset || null;

	// 6) Return partial success + nextOffset
	res.status(200).json({
	  success: true,
	  props: propsData,
	  nextOffset, // null if no more pages
	});
  } catch (err) {
	console.error("[/api/props] error =>", err);
	res.status(500).json({ success: false, error: err.message });
  }
}
