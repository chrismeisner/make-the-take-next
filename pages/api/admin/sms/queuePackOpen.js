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

function humanizeTimeDelta(toTs) {
  try {
    const now = Date.now();
    const target = new Date(toTs).getTime();
    if (!Number.isFinite(target)) return '';
    let diffMs = target - now;
    if (diffMs <= 0) return 'now';
    const minutes = Math.floor(diffMs / 60000);
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const mins = Math.floor(minutes % 60);
    if (days >= 2) return `${days} days`;
    if (days === 1) return hours > 0 ? `1 day ${hours}h` : '1 day';
    if (hours >= 2) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    if (hours === 1) return mins > 0 ? `1h ${mins}m` : '1h';
    if (mins >= 1) return `${mins}m`;
    return 'soon';
  } catch { return ''; }
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
      `SELECT id, pack_id, pack_url, title, league, pack_open_sms_template, pack_open_time, pack_close_time FROM packs WHERE pack_id = $1 OR pack_url = $1 LIMIT 1`,
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
    const template = pack.pack_open_sms_template || (ruleRows.length ? ruleRows[0].template : '{packTitle} is open; {timeLeft} to make your takes {packUrl}');
    const site = (process.env.SITE_URL || 'https://makethetake.com').replace(/\/$/, '');
    const packPath = `/packs/${pack.pack_url || pack.pack_id}`;
    const packUrl = `${site}${packPath}`;
    const timeLeft = pack.pack_close_time ? humanizeTimeDelta(pack.pack_close_time) : 'now';
    const message = renderTemplate(template, { packTitle: pack.title || 'New Pack', packUrl, league, timeLeft });

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

    // Create outbox and recipients with initial logs
    const initLog = [{ at: new Date().toISOString(), level: 'info', message: 'queued', details: { route: 'admin/sms/queuePackOpen', pack_id: pack.pack_id, league } }];
    const { rows: outboxRows } = await query(
      `INSERT INTO outbox (message, status, logs) VALUES ($1, 'ready', $2::jsonb) RETURNING id`,
      [message, JSON.stringify(initLog)]
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


