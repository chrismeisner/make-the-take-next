import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const providedKey = req.headers["x-cron-key"] || req.query.key;
  const expectedKey = process.env.CRON_SECRET;
  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const recordsToClose = await base("Props")
      .select({
        filterByFormula: 'AND({propStatus}="open", IS_AFTER(NOW(), {propCloseTime}))',
      })
      .all();

    const closedCount = recordsToClose.length;
    if (closedCount === 0) {
      return res.status(200).json({ success: true, closedCount: 0 });
    }

    const closingByPack = new Map();
    const withoutPack = [];
    for (const rec of recordsToClose) {
      const packs = Array.isArray(rec.fields.Packs) ? rec.fields.Packs : [];
      if (packs.length === 0) {
        withoutPack.push(rec);
        continue;
      }
      for (const packId of packs) {
        if (!closingByPack.has(packId)) closingByPack.set(packId, []);
        closingByPack.get(packId).push(rec);
      }
    }

    const updates = [];
    for (const rec of withoutPack) {
      updates.push({ id: rec.id, fields: { propStatus: "closed" } });
    }

    const assignedByPack = new Map();
    for (const [packId, recs] of closingByPack.entries()) {
      try {
        const packRec = await base("Packs").find(packId);
        const linkedPropIds = Array.isArray(packRec.fields.Props) ? packRec.fields.Props : [];

        let maxOrder = 0;
        if (linkedPropIds.length > 0) {
          const orFormula = `OR(${linkedPropIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
          const propsInPack = await base("Props")
            .select({ filterByFormula: orFormula, maxRecords: 1000 })
            .all();
          for (const p of propsInPack) {
            let perPackOrder = 0;
            try {
              const raw = p.fields && p.fields.propOrderByPack;
              if (typeof raw === "string" && raw.trim()) {
                try {
                  const map = JSON.parse(raw);
                  if (
                    map &&
                    Object.prototype.hasOwnProperty.call(map, packId) &&
                    typeof map[packId] === "number"
                  ) {
                    perPackOrder = map[packId];
                  } else if (
                    map &&
                    Object.prototype.hasOwnProperty.call(map, "default") &&
                    typeof map.default === "number"
                  ) {
                    perPackOrder = map.default;
                  }
                } catch {}
              }
            } catch {}
            const po = perPackOrder || (typeof p.fields.propOrder === "number" ? p.fields.propOrder : 0);
            if (po > maxOrder) maxOrder = po;
          }
        }

        const uniqueRecsMap = new Map();
        for (const r of recs) uniqueRecsMap.set(r.id, r);
        const uniqueRecs = Array.from(uniqueRecsMap.values());

        const sorted = uniqueRecs.slice().sort((a, b) => {
          const ao = typeof a.fields.propOrder === "number" ? a.fields.propOrder : 0;
          const bo = typeof b.fields.propOrder === "number" ? b.fields.propOrder : 0;
          if (ao !== bo) return ao - bo;
          return new Date(a._rawJson?.createdTime || 0) - new Date(b._rawJson?.createdTime || 0);
        });

        const packAssignments = new Map();
        for (const rec of sorted) {
          maxOrder += 1;
          packAssignments.set(rec.id, maxOrder);
        }
        assignedByPack.set(packId, packAssignments);
      } catch (err) {
        console.error(`[jobs/closePropsCron] Error computing reorder for pack ${packId}:`, err);
      }
    }

    const recIdToAssignedOrders = new Map();
    for (const [packId, assignments] of assignedByPack.entries()) {
      for (const [recId, ord] of assignments.entries()) {
        if (!recIdToAssignedOrders.has(recId)) recIdToAssignedOrders.set(recId, {});
        recIdToAssignedOrders.get(recId)[packId] = ord;
      }
    }

    for (const rec of recordsToClose) {
      const assignedForRec = recIdToAssignedOrders.get(rec.id) || null;
      if (!assignedForRec) {
        updates.push({ id: rec.id, fields: { propStatus: "closed" } });
        continue;
      }

      let newOrderMap = {};
      try {
        const raw = rec.fields && rec.fields.propOrderByPack;
        if (typeof raw === "string" && raw.trim()) {
          try {
            newOrderMap = JSON.parse(raw);
          } catch {
            newOrderMap = {};
          }
        }
      } catch {}
      let maxAssigned = 0;
      for (const [pid, ord] of Object.entries(assignedForRec)) {
        newOrderMap[pid] = ord;
        if (ord > maxAssigned) maxAssigned = ord;
      }

      updates.push({
        id: rec.id,
        fields: {
          propStatus: "closed",
          propOrder: maxAssigned || (typeof rec.fields.propOrder === "number" ? rec.fields.propOrder : 0),
          propOrderByPack: JSON.stringify(newOrderMap),
        },
      });
    }

    for (let i = 0; i < updates.length; i += 10) {
      const chunk = updates.slice(i, i + 10);
      await base("Props").update(chunk);
    }

    return res.status(200).json({ success: true, closedCount });
  } catch (error) {
    console.error("[jobs/closePropsCron] Error closing props:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


