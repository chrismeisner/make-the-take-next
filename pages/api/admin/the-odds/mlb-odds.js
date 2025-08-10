export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const providedKey = (req.query.apiKey || '').toString().trim();
    const apiKey = providedKey || process.env.THE_ODDS_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'Missing THE_ODDS_API_KEY (or provide ?apiKey=...)' });
    }

    const upstream = new URL('https://api.the-odds-api.com/v4/sports/baseball_mlb/odds');
    upstream.searchParams.set('apiKey', apiKey);
    // Default params, can be overridden by query
    if (!upstream.searchParams.has('regions')) upstream.searchParams.set('regions', 'us');
    if (!upstream.searchParams.has('markets')) upstream.searchParams.set('markets', 'h2h');
    if (!upstream.searchParams.has('oddsFormat')) upstream.searchParams.set('oddsFormat', 'american');
    if (!upstream.searchParams.has('dateFormat')) upstream.searchParams.set('dateFormat', 'iso');

    Object.entries(req.query).forEach(([key, value]) => {
      if (key === 'apiKey') return;
      if (Array.isArray(value)) {
        value.forEach((v) => upstream.searchParams.append(key, v));
      } else if (value != null) {
        upstream.searchParams.set(key, String(value));
      }
    });

    const upstreamRes = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });
    const text = await upstreamRes.text();
    const remain = upstreamRes.headers.get('x-requests-remaining');
    const used = upstreamRes.headers.get('x-requests-used');
    if (remain != null) res.setHeader('x-requests-remaining', remain);
    if (used != null) res.setHeader('x-requests-used', used);

    try {
      const json = JSON.parse(text);
      return res.status(upstreamRes.status).json(json);
    } catch (_) {
      return res.status(upstreamRes.status).send(text);
    }
  } catch (err) {
    console.error('[the-odds/mlb-odds] Error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


