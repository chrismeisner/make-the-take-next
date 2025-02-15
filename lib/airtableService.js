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
  const created = await base("Takes").create([
    {
      fields: {
        propID,
        propSide,
        takeMobile: phone,
        takeStatus: "latest",
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
