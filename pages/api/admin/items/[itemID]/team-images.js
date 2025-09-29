import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../../lib/runtimeConfig';
import { query } from '../../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }
  const { itemID } = req.query;
  if (!itemID) return res.status(400).json({ success: false, error: 'Missing itemID' });

  try {
    // Resolve item UUID by item_id text
    const { rows: itemRows } = await query('SELECT id FROM items WHERE item_id = $1 LIMIT 1', [itemID]);
    if (!itemRows?.length) return res.status(404).json({ success: false, error: 'Item not found' });
    const itemUuid = itemRows[0].id;

    if (req.method === 'GET') {
      const { rows } = await query(
        `SELECT iti.id,
                iti.image_url,
                iti.priority,
                t.id AS team_id,
                t.team_slug,
                t.abbreviation,
                t.league,
                t.name
           FROM item_team_images iti
           JOIN teams t ON t.id = iti.team_id
          WHERE iti.item_id = $1
          ORDER BY iti.priority DESC, t.league, t.name`,
        [itemUuid]
      );
      const variations = rows.map(r => ({
        id: r.id,
        imageUrl: r.image_url,
        priority: Number(r.priority) || 0,
        teamId: r.team_id,
        teamSlug: r.team_slug,
        teamAbv: r.abbreviation,
        teamLeague: r.league,
        teamName: r.name,
      }));
      return res.status(200).json({ success: true, variations });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const teamSlug = body.teamSlug ? String(body.teamSlug).trim().toLowerCase() : '';
      const teamId = body.teamId ? String(body.teamId).trim() : '';
      const imageUrl = String(body.imageUrl || '').trim();
      const priority = Number(body.priority) || 0;
      if (!imageUrl) return res.status(400).json({ success: false, error: 'Missing imageUrl' });
      let teamUuid = teamId || null;
      if (!teamUuid && teamSlug) {
        const { rows } = await query('SELECT id FROM teams WHERE LOWER(team_slug) = LOWER($1) LIMIT 1', [teamSlug]);
        teamUuid = rows?.[0]?.id || null;
      }
      if (!teamUuid) return res.status(400).json({ success: false, error: 'Missing teamSlug or teamId' });
      await query(
        `INSERT INTO item_team_images (item_id, team_id, image_url, priority)
           VALUES ($1, $2, $3, $4)
         ON CONFLICT (item_id, team_id)
           DO UPDATE SET image_url = EXCLUDED.image_url, priority = EXCLUDED.priority`,
        [itemUuid, teamUuid, imageUrl, priority]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const teamSlug = body.teamSlug ? String(body.teamSlug).trim().toLowerCase() : '';
      const teamId = body.teamId ? String(body.teamId).trim() : '';
      let teamUuid = teamId || null;
      if (!teamUuid && teamSlug) {
        const { rows } = await query('SELECT id FROM teams WHERE LOWER(team_slug) = LOWER($1) LIMIT 1', [teamSlug]);
        teamUuid = rows?.[0]?.id || null;
      }
      if (!teamUuid) return res.status(400).json({ success: false, error: 'Missing teamSlug or teamId' });
      await query('DELETE FROM item_team_images WHERE item_id = $1 AND team_id = $2', [itemUuid, teamUuid]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[/api/admin/items/:itemID/team-images] Error =>', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
