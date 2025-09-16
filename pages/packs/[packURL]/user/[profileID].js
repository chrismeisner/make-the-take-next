import Head from 'next/head';
import PageHeader from '../../../../components/PageHeader';
import PageContainer from '../../../../components/PageContainer';
import { query } from '../../../../lib/db/postgres';
import Link from 'next/link';

export async function getServerSideProps(ctx) {
  const { packURL, profileID } = ctx.params;
  try {
    // Find or create a shareId for this (packURL, profileID)
    try {
      const { rows } = await query('SELECT share_id FROM share_links WHERE pack_url = $1 AND profile_id = $2 LIMIT 1', [packURL, profileID]);
      if (rows && rows.length > 0) {
        return { redirect: { destination: `/${encodeURIComponent(packURL)}/${encodeURIComponent(rows[0].share_id)}`, permanent: false } };
      }
    } catch {}
    // Fallback: continue rendering below if mapping not yet created
    const { rows: packRows } = await query('SELECT id, title, cover_url FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
    if (packRows.length === 0) return { notFound: true };
    const pack = packRows[0];
    const packUuid = pack.id;
    const { rows } = await query(
      `SELECT t.prop_id_text as prop_id, t.prop_side, t.take_result, t.take_pts, t.tokens,
              p.prop_summary, p.prop_short, p.prop_side_a_short, p.prop_side_b_short
         FROM takes t
         JOIN props p ON p.id = t.prop_id
         JOIN profiles pr ON pr.mobile_e164 = t.take_mobile
        WHERE t.pack_id = $1 AND t.take_status = 'latest' AND pr.profile_id = $2
        ORDER BY t.created_at ASC`,
      [packUuid, profileID]
    );
    const takes = rows.map(r => ({
      propID: r.prop_id,
      side: r.prop_side,
      result: r.take_result || 'pending',
      pts: Number(r.take_pts) || 0,
      tokens: Number(r.tokens) || 0,
      label: r.prop_short || r.prop_summary || r.prop_id,
      sideALabel: r.prop_side_a_short || 'A',
      sideBLabel: r.prop_side_b_short || 'B',
    }));
    return { props: { packURL, profileID, packTitle: pack.title || packURL, takes } };
  } catch {
    return { notFound: true };
  }
}

export default function PackUserTakesPage({ packURL, profileID, packTitle, takes }) {
  let won = 0, lost = 0, pushed = 0, pts = 0, toks = 0;
  for (const t of takes) {
    pts += Number(t.pts || 0);
    toks += Number(t.tokens || 0);
    const r = String(t.result || '').toLowerCase();
    if (r === 'won') won += 1; else if (r === 'lost') lost += 1; else if (r === 'pushed' || r === 'push') pushed += 1;
  }
  return (
    <>
      <Head>
        <title>{packTitle} | @{profileID} results</title>
        <meta name="robots" content="noindex" />
      </Head>
      <PageHeader
        title={`@${profileID} on ${packTitle}`}
        breadcrumbs={[{ name: 'Home', href: '/' }, { name: packTitle, href: `/packs/${packURL}` }, { name: `@${profileID}` }]}
      />
      <PageContainer>
        <div className="mb-4 text-sm">
          <span className="font-medium">Record:</span> {won}-{lost}-{pushed}
          <span className="ml-4 font-medium">Points:</span> {pts}
          <span className="ml-4 font-medium">Tokens:</span> {toks}
        </div>
        <ul className="space-y-2">
          {takes.map((t) => {
            const side = t.side === 'A' ? t.sideALabel : (t.side === 'B' ? t.sideBLabel : t.side);
            const color = t.result === 'won' ? 'text-green-700' : t.result === 'lost' ? 'text-red-700' : t.result === 'pushed' ? 'text-yellow-700' : 'text-gray-700';
            return (
              <li key={t.propID} className="text-sm">
                <span className="font-medium">{t.label}</span>
                <span className="ml-2 text-gray-600">({side})</span>
                <span className={`ml-2 font-semibold ${color}`}>{t.result}</span>
                <span className="ml-4 text-gray-700">+{t.pts} pts</span>
                <span className="ml-2 text-gray-700">+{t.tokens} tokens</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-6">
          <Link href={`/packs/${packURL}`} className="text-blue-600 underline">Back to pack</Link>
        </div>
      </PageContainer>
    </>
  );
}


