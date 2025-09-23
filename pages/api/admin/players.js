import { getToken } from 'next-auth/jwt';
import { createRepositories } from '../../../lib/dal/factory';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    try { console.warn('[api/admin/players] Unauthorized'); } catch {}
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { players } = createRepositories();
  try { console.log('[api/admin/players] ensureSchema()'); } catch {}
  await players.ensureSchema();

  if (req.method === 'GET') {
    try {
      try { console.log('[api/admin/players] GET params', req.query); } catch {}
      const league = String((req.query?.league || '')).toLowerCase() || null;
      const teamAbv = String(req.query?.teamAbv || '').toUpperCase();
      const teams = teamAbv ? teamAbv.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const rows = await players.listByLeagueAndTeams(league, teams);
      try { console.log('[api/admin/players] GET result count', rows?.length || 0); } catch {}
      return res.status(200).json({ success: true, players: rows });
    } catch (e) {
      try { console.error('[api/admin/players] GET error', e); } catch {}
      return res.status(500).json({ success: false, error: e.message || 'Failed to fetch players' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      try { console.log('[api/admin/players] POST body items length', Array.isArray(body?.items) ? body.items.length : 0); } catch {}
      const items = Array.isArray(body?.items) ? body.items : [];
      const normalized = items.map((p) => ({
        league: String(p.league || '').toLowerCase(),
        source_player_id: p.id || p.source_player_id || null,
        full_name: p.longName || p.full_name || p.name,
        first_name: p.firstName || null,
        last_name: p.lastName || null,
        position: p.pos || p.position || null,
        team_abv: p.teamAbv || p.team_abv || null,
        headshot_url: (p.headshot_url || (/(^\d+$)/.test(String(p.id || '')) ? `https://a.espncdn.com/combiner/i?img=/i/headshots/${String(p.league || '').toLowerCase() === 'major-mlb' ? 'mlb' : String(p.league || '').toLowerCase()}/players/full/${p.id}.png` : null)),
      }));
      const n = await players.upsertMany(normalized);
      try { console.log('[api/admin/players] upserted', n); } catch {}
      return res.status(200).json({ success: true, upserted: n });
    } catch (e) {
      try { console.error('[api/admin/players] POST error', e); } catch {}
      return res.status(500).json({ success: false, error: e.message || 'Failed to upsert players' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


