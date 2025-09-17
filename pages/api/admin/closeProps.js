import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  // Postgres path (primary going forward)
  if (getDataBackend() === 'postgres') {
    try {
      // Find open props whose close_time has passed
      const { rows: toClose } = await query(
        `SELECT id, pack_id, COALESCE(prop_order, 0) AS prop_order
           FROM props
          WHERE LOWER(COALESCE(prop_status, '')) = 'open'
            AND close_time IS NOT NULL
            AND close_time < NOW()`
      );
      const closedCount = (toClose || []).length;
      if (!toClose || toClose.length === 0) {
        return res.status(200).json({ success: true, closedCount: 0 });
      }

      // Group by pack_id (null pack handled separately)
      const byPack = new Map(); // pack_id -> prop rows
      const withoutPack = [];
      for (const r of toClose) {
        if (r.pack_id) {
          if (!byPack.has(r.pack_id)) byPack.set(r.pack_id, []);
          byPack.get(r.pack_id).push(r);
        } else {
          withoutPack.push(r);
        }
      }

      // Transactionally close and reorder
      await query('BEGIN');
      try {
        // Close props without pack (no reorder)
        if (withoutPack.length > 0) {
          const ids = withoutPack.map(r => r.id);
          await query(
            `UPDATE props
                SET prop_status = 'closed', updated_at = NOW()
              WHERE id = ANY($1::uuid[])`,
            [ids]
          );
        }

        // For each pack, compute current max order and push closing props to end
        for (const [packId, rows] of byPack.entries()) {
          const { rows: maxRows } = await query(
            `SELECT COALESCE(MAX(prop_order), 0) AS max_order FROM props WHERE pack_id = $1`,
            [packId]
          );
          let currentMax = maxRows && maxRows[0] ? Number(maxRows[0].max_order) : 0;
          // Sort stably by existing order to preserve relative ordering
          const sorted = rows.slice().sort((a, b) => Number(a.prop_order) - Number(b.prop_order));
          for (const r of sorted) {
            currentMax += 1;
            await query(
              `UPDATE props
                  SET prop_status = 'closed', prop_order = $1, updated_at = NOW()
                WHERE id = $2`,
              [currentMax, r.id]
            );
          }
        }

        await query('COMMIT');
      } catch (txErr) {
        await query('ROLLBACK').catch(() => {});
        throw txErr;
      }

      return res.status(200).json({ success: true, closedCount });
    } catch (error) {
      console.error("[admin/closeProps PG] Error closing props:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Airtable fallback (legacy)
  try {
    // Fetch props with status 'open' and close time before now
    const recordsToClose = await base("Props")
      .select({
        filterByFormula: 'AND({propStatus}="open", IS_AFTER(NOW(), {propCloseTime}))'
      })
      .all();

    const closedCount = recordsToClose.length;
    if (closedCount === 0) {
      return res.status(200).json({ success: true, closedCount: 0 });
    }

    // Group closing props by each linked Pack (support multipack)
    const closingByPack = new Map(); // packRecordId -> rec[]
    const noPack = []; // rec[] without any pack link
    for (const rec of recordsToClose) {
      const packs = Array.isArray(rec.fields.Packs) ? rec.fields.Packs : [];
      if (packs.length === 0) {
        noPack.push(rec);
        continue;
      }
      for (const packId of packs) {
        if (!closingByPack.has(packId)) closingByPack.set(packId, []);
        closingByPack.get(packId).push(rec);
      }
    }

    // Build updates: close all, and for those with a single pack, push to end by incrementing propOrder beyond current max
    const updates = [];

    // Always close props without any pack link (no reorder adjustment)
    for (const rec of noPack) {
      updates.push({ id: rec.id, fields: { propStatus: "closed" } });
    }

    // For each pack, compute current max propOrder among its linked Props,
    // then assign increasing orders to the closing ones (per pack)
    // We'll collect per-pack assigned orders, then emit one update per record merging all pack assignments
    const assignedByPack = new Map(); // packId -> Map(recId -> assignedOrder)
    for (const [packId, recs] of closingByPack.entries()) {
      try {
        // Fetch Pack to get its linked Props
        const packRec = await base("Packs").find(packId);
        const linkedPropIds = Array.isArray(packRec.fields.Props) ? packRec.fields.Props : [];

        let maxOrder = 0;
        if (linkedPropIds.length > 0) {
          const orFormula = `OR(${linkedPropIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
          const propsInPack = await base("Props").select({
            filterByFormula: orFormula,
            maxRecords: 1000,
          }).all();
          for (const p of propsInPack) {
            // Prefer per-pack order if present, else fallback to numeric propOrder
            let perPackOrder = 0;
            try {
              const raw = p.fields && p.fields.propOrderByPack;
              if (typeof raw === "string" && raw.trim()) {
                try {
                  const map = JSON.parse(raw);
                  if (map && Object.prototype.hasOwnProperty.call(map, packId) && typeof map[packId] === "number") {
                    perPackOrder = map[packId];
                  } else if (map && Object.prototype.hasOwnProperty.call(map, 'default') && typeof map.default === 'number') {
                    perPackOrder = map.default;
                  }
                } catch {}
              }
            } catch {}
            const po = perPackOrder || (typeof p.fields.propOrder === "number" ? p.fields.propOrder : 0);
            if (po > maxOrder) maxOrder = po;
          }
        }

        // Unique records in this pack to avoid duplicate assignment for the same rec
        const uniqueRecsMap = new Map();
        for (const r of recs) uniqueRecsMap.set(r.id, r);
        const uniqueRecs = Array.from(uniqueRecsMap.values());

        // Sort the closing props for stable ordering, using their current propOrder then createdTime fallback
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
        console.error(`[admin/closeProps] Error computing reorder for pack ${packId}:`, err);
        // Fallback: mark these as closed without per-pack assignment
      }
    }

    // Build final updates by merging per-pack assignments for each record
    const recIdToRecord = new Map(recordsToClose.map((r) => [r.id, r]));
    const recIdToAssignedOrders = new Map(); // recId -> { [packId]: order }
    for (const [packId, assignments] of assignedByPack.entries()) {
      for (const [recId, ord] of assignments.entries()) {
        if (!recIdToAssignedOrders.has(recId)) recIdToAssignedOrders.set(recId, {});
        recIdToAssignedOrders.get(recId)[packId] = ord;
      }
    }

    for (const rec of recordsToClose) {
      const assignedForRec = recIdToAssignedOrders.get(rec.id) || null;
      if (!assignedForRec) {
        // no per-pack assignment (no pack or error); just close
        updates.push({ id: rec.id, fields: { propStatus: "closed" } });
        continue;
      }

      // Start from existing map and merge assigned orders for all packs of this rec
      let newOrderMap = {};
      try {
        const raw = rec.fields && rec.fields.propOrderByPack;
        if (typeof raw === "string" && raw.trim()) {
          try { newOrderMap = JSON.parse(raw); } catch { newOrderMap = {}; }
        }
      } catch {}
      let maxAssigned = 0;
      for (const [packId, ord] of Object.entries(assignedForRec)) {
        newOrderMap[packId] = ord;
        if (ord > maxAssigned) maxAssigned = ord;
      }

      updates.push({
        id: rec.id,
        fields: {
          propStatus: "closed",
          // Set numeric fallback to the max across packs so it remains at the back in simple numeric sorts
          propOrder: maxAssigned || (typeof rec.fields.propOrder === "number" ? rec.fields.propOrder : 0),
          propOrderByPack: JSON.stringify(newOrderMap),
        },
      });
    }

    // Airtable limits to 10 records per update request; chunk the updates
    for (let i = 0; i < updates.length; i += 10) {
      const chunk = updates.slice(i, i + 10);
      // Update each chunk sequentially to avoid rate limits
      await base("Props").update(chunk);
    }

    return res.status(200).json({ success: true, closedCount });
  } catch (error) {
    console.error("[admin/closeProps] Error closing props:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
