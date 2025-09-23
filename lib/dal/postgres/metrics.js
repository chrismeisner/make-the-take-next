import { query } from '../../db/postgres';

export class PostgresMetricsRepository {
  async ensureSchema() {
    // Ensure pgcrypto for gen_random_uuid()
    try { await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`); } catch {}
    await query(
      `CREATE TABLE IF NOT EXISTS stat_metrics (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         league TEXT NOT NULL,
         entity TEXT NOT NULL,
         scope TEXT NOT NULL,
         key TEXT NOT NULL,
         label TEXT NOT NULL,
         description TEXT,
         source_key JSONB DEFAULT '{}'::jsonb,
         active BOOLEAN NOT NULL DEFAULT TRUE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       );`
    );
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS stat_metrics_unique
         ON stat_metrics(league, entity, scope, key)
         WHERE active;`
    );
  }

  async list(league, entity, scope) {
    const { rows } = await query(
      `SELECT key, label, description
         FROM stat_metrics
        WHERE active = TRUE
          AND ($1::text IS NULL OR league = $1)
          AND ($2::text IS NULL OR entity = $2)
          AND ($3::text IS NULL OR scope = $3)
        ORDER BY label`,
      [league || null, entity || null, scope || null]
    );
    return rows;
  }

  async upsertMany(items) {
    if (!Array.isArray(items) || items.length === 0) return 0;
    let inserted = 0;
    for (const m of items) {
      const { league, entity, scope, key, label, description = null, source_key = {} } = m;
      const res = await query(
        `INSERT INTO stat_metrics (league, entity, scope, key, label, description, source_key, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true)
           ON CONFLICT (league, entity, scope, key) WHERE active
           DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, source_key = EXCLUDED.source_key, updated_at = NOW()
           RETURNING id`,
        [league, entity, scope, key, label, description, JSON.stringify(source_key || {})]
      );
      if (res?.rows?.[0]?.id) inserted += 1;
    }
    return inserted;
  }
}


