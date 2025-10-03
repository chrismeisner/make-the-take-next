import { Client } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }
  const slug = process.argv[2] || process.env.SLUG;
  if (!slug) {
    console.error('Usage: node scripts/db-debug.mjs <pack_slug>');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const pack = await client.query(
      'select id, pack_url, title, event_id, pack_status from packs where pack_url = $1',
      [slug]
    );
    const packRow = pack.rows[0] || null;
    console.log('[PACK]', JSON.stringify(packRow));
    if (!packRow) return;

    const evt = await client.query(
      'select id, espn_game_id, title, event_time, league, home_team, away_team, week from events where id = $1',
      [packRow.event_id]
    );
    console.log('[EVENT]', JSON.stringify(evt.rows[0] || null));

    const props = await client.query(
      `select id, prop_id, prop_short, prop_summary, prop_status, grading_mode, formula_key, formula_params,
              prop_side_a_short, prop_side_b_short
         from props
        where pack_id = $1
        order by prop_order nulls last, created_at asc`,
      [packRow.id]
    );
    const simplified = props.rows.map(r => ({
      id: r.id,
      prop_id: r.prop_id,
      status: r.prop_status,
      key: r.formula_key,
      a: r.prop_side_a_short,
      b: r.prop_side_b_short,
      params: r.formula_params,
    }));
    console.log('[PROPS]', JSON.stringify(simplified));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


