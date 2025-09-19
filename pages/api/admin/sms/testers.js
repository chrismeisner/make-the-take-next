import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';
import { getDataBackend } from '../../../../lib/runtimeConfig';

async function getTesters() {
  const { rows } = await query(`SELECT body FROM content WHERE key = $1 LIMIT 1`, ['sms_testers']);
  const body = (rows[0]?.body) || {};
  const testers = Array.isArray(body?.testers) ? body.testers : [];
  return testers;
}

async function saveTesters(testers) {
  const payload = { testers: Array.isArray(testers) ? testers : [] };
  await query(
    `INSERT INTO content (key, body)
     VALUES ($1, $2)
     ON CONFLICT (key)
     DO UPDATE SET body = EXCLUDED.body`,
    ['sms_testers', payload]
  );
}

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const testers = await getTesters();
      return res.status(200).json({ success: true, testers });
    } catch (error) {
      console.error('[admin/sms/testers][GET] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to load testers' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const rawPhone = String(body.phone || '').trim();
      const name = body.name != null ? String(body.name).trim() : null;
      if (!rawPhone) return res.status(400).json({ success: false, error: 'phone required' });
      // Basic normalization: keep as provided, require starts with + or digit
      const phone = rawPhone;
      const existing = await getTesters();
      const already = existing.find((t) => String(t.phone).trim() === phone);
      if (already) {
        // Update name if provided
        if (name && name !== already.name) {
          already.name = name;
          await saveTesters(existing);
        }
        return res.status(200).json({ success: true, testers: existing });
      }
      const next = [{ phone, name: name || null, added_at: new Date().toISOString() }, ...existing];
      await saveTesters(next);
      return res.status(200).json({ success: true, testers: next });
    } catch (error) {
      console.error('[admin/sms/testers][POST] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to add tester' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const rawPhone = String(body.phone || '').trim();
      if (!rawPhone) return res.status(400).json({ success: false, error: 'phone required' });
      const phone = rawPhone;
      const existing = await getTesters();
      const next = existing.filter((t) => String(t.phone).trim() !== phone);
      await saveTesters(next);
      return res.status(200).json({ success: true, testers: next });
    } catch (error) {
      console.error('[admin/sms/testers][DELETE] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to remove tester' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


