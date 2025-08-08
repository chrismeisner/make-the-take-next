import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { sumTakePoints, isVisibleTake } from "../../../lib/points";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.profileID || !token.phone) {
      return res
        .status(401)
        .json({ success: false, error: "Unauthorized" });
    }

    const { itemID } = req.body || {};
    if (!itemID) {
      return res
        .status(400)
        .json({ success: false, error: "Missing itemID" });
    }

    // 1) Load the item by itemID
    const items = await base("Items")
      .select({
        filterByFormula: `{itemID} = "${itemID}"`,
        maxRecords: 1,
      })
      .firstPage();

    if (!items.length) {
      return res
        .status(404)
        .json({ success: false, error: "Item not found" });
    }
    const itemRec = items[0];
    const itemFields = itemRec.fields || {};
    const itemStatus = itemFields.itemStatus || "";
    const itemTokens = Number(itemFields.itemTokens || 0);
    const itemName = itemFields.itemName || "";

    if (itemStatus && itemStatus.toLowerCase() !== "available") {
      return res.status(400).json({
        success: false,
        error: `Item is not available (status: ${itemStatus})`,
      });
    }
    if (!Number.isFinite(itemTokens) || itemTokens <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid itemTokens on item",
      });
    }

    // 2) Compute user's available token balance
    //    Replicate profile logic: totalPoints -> tokensEarned = floor(totalPoints/1000)
    //    tokensSpent = sum(exchangeTokens), balance = earned - spent
    const profs = await base("Profiles")
      .select({
        filterByFormula: `{profileID} = "${token.profileID}"`,
        maxRecords: 1,
      })
      .firstPage();
    if (!profs.length) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found" });
    }
    const profRec = profs[0];
    const pf = profRec.fields || {};

    let totalPoints = 0;
    if (Array.isArray(pf.Takes) && pf.Takes.length > 0) {
      const takeFilter = `OR(${pf.Takes.map((id) => `RECORD_ID()="${id}"`).join(
        ","
      )})`;
      const takeRecords = await base("Takes")
        .select({ filterByFormula: takeFilter, maxRecords: 5000 })
        .all();
      totalPoints = sumTakePoints(takeRecords);
    }

    const exchFilter = `{profileID} = "${token.profileID}"`;
    const exchRecs = await base("Exchanges")
      .select({ filterByFormula: exchFilter, maxRecords: 5000 })
      .all();
    const tokensSpent = exchRecs.reduce(
      (sum, r) => sum + Number(r.fields.exchangeTokens || 0),
      0
    );
    const tokensEarned = Math.floor(Math.round(totalPoints || 0) / 1000);
    const availableBalance = tokensEarned - tokensSpent;

    if (availableBalance < itemTokens) {
      return res.status(400).json({
        success: false,
        error: "Insufficient tokens for this exchange",
        availableBalance,
        required: itemTokens,
      });
    }

    // 3) Create Exchange record
    const created = await base("Exchanges").create([
      {
        fields: {
          profileID: token.profileID, // text field for easy lookups
          exchangeStatus: "requested",
          exchangeTokens: itemTokens,
          exchangeItem: [itemRec.id], // link to Items record (if field exists)
          // Optionally link to Profile record if you have a link field
          // exchangeProfile: [profRec.id],
        },
      },
    ]);

    const exchangeRecord = created[0];

    return res.status(200).json({
      success: true,
      exchangeID: exchangeRecord.id,
      exchangeTokens: itemTokens,
      itemID,
      balanceAfter: availableBalance - itemTokens,
    });
  } catch (err) {
    console.error("[/api/exchanges] Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Server error creating exchange" });
  }
}


