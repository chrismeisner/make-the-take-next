// File: pages/api/admin/sms/rules.js

import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';
import { getDataBackend } from '../../../../lib/runtimeConfig';

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
      const { rows } = await query(`SELECT id, rule_key, title, trigger_type, league, template, active, created_at, updated_at FROM sms_rules ORDER BY created_at DESC`);
      return res.status(200).json({ success: true, rules: rows });
    } catch (error) {
      console.error('[admin/sms/rules][GET] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to load rules' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const triggerType = String(body.trigger_type || '').trim().toLowerCase();
      const league = body.league != null && String(body.league).trim() !== '' ? String(body.league).trim().toLowerCase() : null;
      const template = String(body.template || '').trim();
      const title = String(body.title || '').trim() || null;
      const active = typeof body.active === 'boolean' ? body.active : true;
      if (!triggerType || !template) {
        return res.status(400).json({ success: false, error: 'trigger_type and template are required' });
      }
      const defaultKey = `${triggerType}_${league || 'global'}`;
      const ruleKey = String(body.rule_key || defaultKey).trim().toLowerCase();
      const { rows } = await query(
        `INSERT INTO sms_rules (rule_key, title, trigger_type, league, template, active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (rule_key)
         DO UPDATE SET title = EXCLUDED.title, trigger_type = EXCLUDED.trigger_type, league = EXCLUDED.league, template = EXCLUDED.template, active = EXCLUDED.active, updated_at = NOW()
         RETURNING id, rule_key, title, trigger_type, league, template, active`,
        [ruleKey, title, triggerType, league, template, active]
      );
      return res.status(200).json({ success: true, rule: rows[0] });
    } catch (error) {
      console.error('[admin/sms/rules][POST] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to save rule' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = body.id || null;
      const ruleKey = body.rule_key ? String(body.rule_key).trim().toLowerCase() : null;
      if (!id && !ruleKey) {
        return res.status(400).json({ success: false, error: 'id or rule_key required' });
      }
      const fields = [];
      const values = [];
      let idx = 1;
      function push(field, value) {
        fields.push(`${field} = $${idx++}`);
        values.push(value);
      }
      if (body.title != null) push('title', String(body.title));
      if (body.trigger_type != null) push('trigger_type', String(body.trigger_type).toLowerCase());
      if (body.league !== undefined) push('league', body.league != null && String(body.league).trim() !== '' ? String(body.league).toLowerCase() : null);
      if (body.template != null) push('template', String(body.template));
      if (typeof body.active === 'boolean') push('active', Boolean(body.active));
      if (fields.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }
      const where = id ? `id = $${idx}` : `rule_key = $${idx}`;
      values.push(id ? id : ruleKey);
      const { rows } = await query(
        `UPDATE sms_rules SET ${fields.join(', ')}, updated_at = NOW() WHERE ${where} RETURNING id, rule_key, title, trigger_type, league, template, active`,
        values
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }
      return res.status(200).json({ success: true, rule: rows[0] });
    } catch (error) {
      console.error('[admin/sms/rules][PUT] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to update rule' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = body.id || null;
      const ruleKey = body.rule_key ? String(body.rule_key).trim().toLowerCase() : null;
      if (!id && !ruleKey) {
        return res.status(400).json({ success: false, error: 'id or rule_key required' });
      }
      const where = id ? `id = $1` : `rule_key = $1`;
      const value = id ? id : ruleKey;
      const { rows } = await query(
        `DELETE FROM sms_rules WHERE ${where} RETURNING id, rule_key`,
        [value]
      );
      if (!rows.length) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }
      return res.status(200).json({ success: true, deleted: rows[0] });
    } catch (error) {
      console.error('[admin/sms/rules][DELETE] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to delete rule' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


