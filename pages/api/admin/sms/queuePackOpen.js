// File: pages/api/admin/sms/queuePackOpen.js

import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';
import { getDataBackend } from '../../../../lib/runtimeConfig';

function renderTemplate(tpl, vars) {
  let out = String(tpl || '');
  Object.keys(vars || {}).forEach((k) => {
    out = out.replaceAll(`{${k}}`, String(vars[k] ?? ''));
  });
  return out;
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const packInput = String(body.packId || body.packURL || '').trim();
    if (!packInput) {
      return res.status(400).json({ success: false, error: 'packId or packURL required' });
    }

    const { rows: packRows } = await query(
      `SELECT id, pack_id, pack_url, title, league FROM packs WHERE pack_id = $1 OR pack_url = $1 LIMIT 1`,
      [packInput]
    );
    if (!packRows.length) {
      return res.status(404).json({ success: false, error: 'Pack not found' });
    }
    const pack = packRows[0];
    const league = (pack.league || '').toLowerCase();

    // Resolve rule/template
    const { rows: ruleRows } = await query(
      `SELECT template FROM sms_rules WHERE trigger_type = 'pack_open' AND active = TRUE AND (league = $1 OR league IS NULL) ORDER BY league NULLS LAST, updated_at DESC LIMIT 1`,
      [league]
    );
    const template = ruleRows.length ? ruleRows[0].template : 'Pack {packTitle} is open! {packUrl}';
    const packUrl = `/packs/${pack.pack_url || pack.pack_id}`;
    const message = renderTemplate(template, { packTitle: pack.title || 'New Pack', packUrl, league });

    // Find recipients
    const { rows: recRows } = await query(
      `SELECT p.id AS profile_id
         FROM profiles p
         JOIN notification_preferences np ON np.profile_id = p.id
        WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
          AND np.category = 'pack_open'
          AND np.league = $1
          AND np.opted_in = TRUE`,
      [league]
    );
    if (!recRows.length) {
      return res.status(200).json({ success: true, outboxId: null, recipientCount: 0, info: 'No opted-in recipients' });
    }

    // Create outbox and recipients
    const { rows: outboxRows } = await query(
      `INSERT INTO outbox (message, status) VALUES ($1, 'ready') RETURNING id`,
      [message]
    );
    const outboxId = outboxRows[0].id;

    const values = [];
    const params = [];
    recRows.forEach((r, i) => {
      values.push(`($1, $${i + 2})`);
      params.push(r.profile_id);
    });
    await query(
      `INSERT INTO outbox_recipients (outbox_id, profile_id) VALUES ${values.join(', ')}`,
      [outboxId, ...params]
    );

    return res.status(200).json({ success: true, outboxId, recipientCount: recRows.length });
  } catch (error) {
    console.error('[admin/sms/queuePackOpen] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to queue messages' });
  }
}


