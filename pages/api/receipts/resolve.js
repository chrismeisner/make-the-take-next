import Airtable from "airtable";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { packURL, profileID } = req.query;
  if (!packURL || !profileID) {
    return res.status(400).json({ success: false, error: "Missing packURL or profileID" });
  }

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
    // 1) Fetch pack to get propIDs for filtering
    const packRes = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
    const packJson = await packRes.json();
    if (!packRes.ok || !packJson?.success || !packJson?.pack) {
      return res.status(404).json({ success: false, error: "Pack not found" });
    }
    const propIDs = Array.isArray(packJson.pack.props)
      ? packJson.pack.props.map(p => p.propID).filter(Boolean)
      : [];
    if (propIDs.length === 0) {
      return res.status(404).json({ success: false, error: "No props for this pack" });
    }

    // 2) Resolve profile to get mobile (preferred for Takes lookups)
    let mobile = null;
    try {
      const profRes = await fetch(`${origin}/api/profile/${encodeURIComponent(profileID)}`);
      const profJson = await profRes.json();
      if (profRes.ok && profJson?.success && profJson?.profile?.profileMobile) {
        mobile = profJson.profile.profileMobile;
      }
    } catch {}

    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

    // 3) Build filter: by phone if available; otherwise by profileID (fallback)
    const orProps = propIDs.map((id) => `{propID}="${id}"`).join(',');
    let filterByFormula = '';
    if (mobile) {
      filterByFormula = `AND({takeMobile}="${mobile}", OR(${orProps}))`;
    } else {
      filterByFormula = `AND({profileID}="${profileID}", OR(${orProps}))`;
    }

    const takeRecords = await base('Takes').select({
      filterByFormula,
      maxRecords: 1000,
      sort: [{ field: 'Created', direction: 'desc' }]
    }).all();

    if (!takeRecords || takeRecords.length === 0) {
      return res.status(404).json({ success: false, error: "No takes found for user on this pack" });
    }

    // 4) Group by receiptID and pick the most recent group
    const byReceipt = new Map();
    for (const rec of takeRecords) {
      const rid = rec.fields.receiptID;
      if (!rid) continue;
      const created = rec._rawJson.createdTime;
      const prev = byReceipt.get(rid);
      if (!prev || new Date(created) > new Date(prev)) {
        byReceipt.set(rid, created);
      }
    }

    if (byReceipt.size === 0) {
      return res.status(404).json({ success: false, error: "No receipt found for user on this pack" });
    }

    let latestId = null;
    let latestTime = null;
    for (const [rid, ts] of byReceipt.entries()) {
      if (!latestTime || new Date(ts) > new Date(latestTime)) {
        latestTime = ts;
        latestId = rid;
      }
    }

    return res.status(200).json({ success: true, receiptId: latestId });
  } catch (err) {
    console.error('[api/receipts/resolve] Error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


