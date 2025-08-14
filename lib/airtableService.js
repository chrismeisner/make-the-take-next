// File: lib/airtableService.js
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

/**
 * Create a new take.
 *
 * @param {Object} params - The parameters for creating a take.
 * @param {string} params.propID - The proposition ID.
 * @param {string} params.propSide - The selected side ("A" or "B").
 * @param {string} params.phone - The user's phone number in E.164 format.
 *
 * @returns {Promise<Object>} - Returns an object with newTakeID, sideACount, and sideBCount.
 */
export async function createTake({ propID, propSide, phone }) {
  console.log("[airtableService] Starting createTake with parameters:", { propID, propSide, phone });
  if (!propID || !propSide || !phone) {
    console.error("[airtableService] Missing required fields:", { propID, propSide, phone });
    throw new Error("Missing required fields: propID, propSide, or phone");
  }

  // (A) Check that the prop exists and is open
  console.log("[airtableService] Checking existence and status of prop with ID:", propID);
  const propsFound = await base("Props")
    .select({ filterByFormula: `{propID}="${propID}"`, maxRecords: 1 })
    .firstPage();
  console.log("[airtableService] Number of props found:", propsFound.length);
  if (!propsFound.length) {
    console.error("[airtableService] Prop not found for propID:", propID);
    throw new Error("Prop not found");
  }
  const propRec = propsFound[0];
  const propStatus = propRec.fields.propStatus || "open";
  console.log("[airtableService] Prop status:", propStatus);
  if (propStatus !== "open") {
    console.error("[airtableService] Prop is not open. Status:", propStatus);
    throw new Error(`Prop is ${propStatus}, not open.`);
  }

  // (B) Overwrite older takes by this phone (if any)
  console.log("[airtableService] Looking for existing takes for propID:", propID, "and phone:", phone);
  const oldTakes = await base("Takes")
    .select({ filterByFormula: `AND({propID}="${propID}", {takeMobile}="${phone}")` })
    .all();
  console.log("[airtableService] Old takes count:", oldTakes.length);
  if (oldTakes.length > 0) {
    const updates = oldTakes.map((rec) => ({
      id: rec.id,
      fields: { takeStatus: "overwritten" },
    }));
    console.log("[airtableService] Updating old takes:", updates);
    await base("Takes").update(updates);
  }

  // (C) Create the new "latest" take
  console.log("[airtableService] Creating new take for propID:", propID, "with side:", propSide);
  const packLinks = propRec.fields.Packs || [];
  console.log("📦📝 [createTake] Submitting take:", { propID, propSide, phone, packLinks });
  const created = await base("Takes").create([
    {
      fields: {
        propID,
        propSide,
        takeMobile: phone,
        takeStatus: "latest",
        Pack: packLinks,
      },
    },
  ]);
  const newTakeID = created[0].id;
  console.log("[airtableService] New take created with ID:", newTakeID);

  // (D) Recount active takes for side A and B
  console.log("[airtableService] Recounting active takes for propID:", propID);
  const activeTakes = await base("Takes")
    .select({
      filterByFormula: `AND({propID}="${propID}", {takeStatus}!="overwritten")`,
    })
    .all();
  let sideACount = 0;
  let sideBCount = 0;
  activeTakes.forEach((t) => {
    console.log("[airtableService] Processing take:", t.id, "with side:", t.fields.propSide);
    if (t.fields.propSide === "A") sideACount++;
    if (t.fields.propSide === "B") sideBCount++;
  });
  console.log("[airtableService] Final counts - Side A:", sideACount, "Side B:", sideBCount);

  return { newTakeID, sideACount, sideBCount };
}

/* ---------------------------------------------------------------------------
   New Outbox Functions for SMS Message Queue
---------------------------------------------------------------------------*/

/**
 * Creates a new Outbox message.
 *
 * @param {Object} params
 * @param {string} params.outboxMessage - The SMS message to send.
 * @param {Array} params.recipients - An array of linked Profile record IDs.
 * @param {string} [params.outboxStatus] - The initial status (default "draft").
 * @returns {Promise<Object>} - The created Outbox record.
 */
export async function createOutboxMessage({ outboxMessage, recipients, outboxStatus = "draft" }) {
  try {
    const created = await base("Outbox").create([
      {
        fields: {
          outboxMessage,
          outboxRecipients: recipients, // Expecting an array of Profile record IDs
          outboxStatus,
        },
      },
    ]);
    return created[0];
  } catch (err) {
    console.error("[airtableService] createOutboxMessage error:", err);
    throw err;
  }
}

/**
 * Fetches Outbox records that are marked as "ready" to be sent.
 *
 * @returns {Promise<Array>} - Array of Airtable records.
 */
export async function fetchReadyOutboxMessages() {
  try {
    const records = await base("Outbox")
      .select({
        filterByFormula: `{outboxStatus} = "ready"`,
        maxRecords: 100,
      })
      .all();
    return records;
  } catch (err) {
    console.error("[airtableService] fetchReadyOutboxMessages error:", err);
    throw err;
  }
}

/**
 * Updates the outboxStatus field for a given Outbox record.
 *
 * @param {string} recordId - The Airtable record ID.
 * @param {string} status - New status ("sent", "error", etc.).
 * @returns {Promise<void>}
 */
export async function updateOutboxStatus(recordId, status) {
  try {
    await base("Outbox").update([
      {
        id: recordId,
        fields: { outboxStatus: status },
      },
    ]);
  } catch (err) {
    console.error("[airtableService] updateOutboxStatus error:", err);
    throw err;
  }
}

export async function upsertChallenge({ packURL, initiatorReceiptID, challengerReceiptID }) {
  if (!packURL || !initiatorReceiptID) {
    throw new Error("Missing required fields: packURL or initiatorReceiptID");
  }
  // 1. Find pack record by packURL
  const packRecs = await base("Packs")
    .select({ filterByFormula: `{packURL}="${packURL}"`, maxRecords: 1 })
    .firstPage();
  if (!packRecs.length) {
    throw new Error(`Pack not found for packURL="${packURL}"`);
  }
  const packId = packRecs[0].id;

  // 2. Find initiator profile via take
  let initiatorProfileId;
  const initiatorTakes = await base("Takes")
    .select({ filterByFormula: `{receiptID}="${initiatorReceiptID}"`, maxRecords: 1 })
    .firstPage();
  if (initiatorTakes.length && initiatorTakes[0].fields.Profile?.length) {
    initiatorProfileId = initiatorTakes[0].fields.Profile[0];
  }

  // 3. Find challenger profile via take (if provided)
  let challengerProfileId;
  if (challengerReceiptID) {
    const challengerTakes = await base("Takes")
      .select({ filterByFormula: `{receiptID}="${challengerReceiptID}"`, maxRecords: 1 })
      .firstPage();
    if (challengerTakes.length && challengerTakes[0].fields.Profile?.length) {
      challengerProfileId = challengerTakes[0].fields.Profile[0];
    }
  }

  // 4. Check for existing challenge using packURL lookup to avoid link-field issues
  const existing = await base("Challenges")
    .select({
      filterByFormula: `AND({initiatorReceiptID}="${initiatorReceiptID}", {packURL}="${packURL}")`,
      maxRecords: 1,
    })
    .firstPage();
  if (existing.length) {
    const rec = existing[0];
    const fieldsToUpdate = {};
    if (challengerReceiptID) fieldsToUpdate.challengerReceiptID = challengerReceiptID;
    if (challengerProfileId) fieldsToUpdate.challengerProfile = [challengerProfileId];
    const updated = await base("Challenges").update([{ id: rec.id, fields: fieldsToUpdate }]);
    return updated[0];
  } else {
    const fields = {
      initiatorReceiptID: initiatorReceiptID,
      pack: [packId],
    };
    if (initiatorProfileId) fields.initiatorProfile = [initiatorProfileId];
    if (challengerReceiptID) fields.challengerReceiptID = challengerReceiptID;
    if (challengerProfileId) fields.challengerProfile = [challengerProfileId];
    const created = await base("Challenges").create([{ fields }]);
    return created[0];
  }
}

export async function getChallengesByPack({ packURL }) {
  if (!packURL) {
    throw new Error("Missing required field: packURL");
  }
  // Directly query the Challenges table by the lookup field packURL (text)
  const challengeRecs = await base("Challenges")
    .select({
      filterByFormula: `{packURL}="${packURL}"`,
      maxRecords: 1000,
    })
    .all();
  return challengeRecs;
}

export async function createEvent({ eventTitle, eventTime, eventLeague }) {
  try {
    const created = await base("Events").create([{ fields: { eventTitle, eventTime, eventLeague } }]);
    return created[0];
  } catch (err) {
    console.error("[airtableService] createEvent error:", err);
    throw err;
  }
}

export async function getEventLeagues() {
  try {
    // Limit pageSize to 100 to comply with Airtable API limits
    const records = await base("Events").select({ fields: ["eventLeague"], pageSize: 100 }).all();
    const leagues = [...new Set(records.map(r => r.fields.eventLeague).filter(Boolean))];
    return leagues;
  } catch (err) {
    console.error("[airtableService] getEventLeagues error:", err);
    throw err;
  }
}

export async function getCustomEventsByDate({ date, timeZone = 'America/New_York' }) {
  try {
    // Use SET_TIMEZONE so date matching is done in the desired TZ
    const records = await base("Events").select({
      filterByFormula: `DATETIME_FORMAT(SET_TIMEZONE({eventTime}, '${timeZone}'), 'YYYY-MM-DD') = "${date}"`,
      sort: [{ field: "eventTime", direction: "asc" }],
      pageSize: 100,
    }).all();
    return records.map(rec => ({ id: rec.id, ...rec.fields }));
  } catch (err) {
    console.error("[airtableService] getCustomEventsByDate error:", err);
    throw err;
  }
}

/**
 * Upsert an event into Airtable: find by espnGameID, update or create, and return record ID.
 * @param {Object} event - The event object with fields from UI (id, eventTime, eventTitle, homeTeam, awayTeam, homeTeamLink, awayTeamLink).
 * @returns {Promise<string>} - The Airtable record ID for the event.
 */
export async function upsertEvent(event) {
  if (!event || typeof event !== 'object' || !event.id) {
    throw new Error('Invalid event object');
  }
  const espnGameID = event.id;
  // Try to find existing record by espnGameID
  const existing = await base('Events')
    .select({ filterByFormula: `{espnGameID}="${espnGameID}"`, maxRecords: 1 })
    .firstPage();
  let recordId;
  if (existing.length) {
    recordId = existing[0].id;
    // Update core event fields
    await base('Events').update([{ id: recordId, fields: {
      eventTime: event.eventTime,
      eventTitle: event.eventTitle
    }}]);
  } else {
    // Create a new Event record
    const [created] = await base('Events').create([{ fields: {
      espnGameID,
      eventTime: event.eventTime,
      eventTitle: event.eventTitle,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      homeTeamLink: event.homeTeamLink,
      awayTeamLink: event.awayTeamLink
    }}]);
    recordId = created.id;
  }
  return recordId;
}

/**
 * Fetches all Events records from Airtable.
 *
 * @returns {Promise<Array>} - Array of event objects with id and fields.
 */
export async function getAllEvents() {
  try {
    const records = await base('Events')
      .select({ sort: [{ field: 'eventTime', direction: 'asc' }], pageSize: 100 })
      .all();
    return records.map(rec => ({ id: rec.id, ...rec.fields }));
  } catch (err) {
    console.error('[airtableService] getAllEvents error:', err);
    throw err;
  }
}

/**
 * Fetch a single Event record by ID.
 *
 * @param {string} eventId - The Airtable record ID.
 * @returns {Promise<Object>} - Event object with id and fields.
 */
export async function getEventById(eventId) {
  try {
    const rec = await base('Events').find(eventId);
    return { id: rec.id, ...rec.fields };
  } catch (err) {
    console.error('[airtableService] getEventById error:', err);
    throw err;
  }
}
