// pages/packs/[packURL]/h2h.js
import Head from 'next/head';
import { getToken } from 'next-auth/jwt';
import { query } from '../../../lib/db/postgres';
import { PostgresH2HRepository } from '../../../lib/dal/postgres/h2h';
import Layout from '../../../components/Layout';

function MaskedPick() {
  return (
    <div className="rounded bg-gray-100 text-gray-400 text-sm px-2 py-1">Hidden until lock</div>
  );
}

function Row({ label, left, right }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="flex items-center gap-4">
        <div className="min-w-[120px] text-right">{left}</div>
        <div className="min-w-[120px] text-right">{right}</div>
      </div>
    </div>
  );
}

export default function H2HPage({
  isChallenge,
  metaNoIndex,
  pack,
  a,
  b,
  state,
  stats,
  token
}) {
  const title = isChallenge ? 'Head-to-Head Challenge' : 'Head-to-Head Compare';
  const winnerBadge = state === 'final' && stats?.winner === 'A' ? 'Winner' : state === 'final' && stats?.winner === 'B' ? 'Winner' : null;

  return (
    <Layout>
      <Head>
        <title>{title} · {pack?.title || 'Pack'}</title>
        {metaNoIndex ? <meta name="robots" content="noindex" /> : null}
      </Head>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-2">{title}</h1>
        <div className="text-gray-600 mb-6">{pack?.title} · {pack?.league?.toUpperCase() || ''}</div>

        <div className="grid grid-cols-3 gap-3 items-end mb-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Player A</div>
          <div></div>
          <div className="text-right text-xs uppercase tracking-wide text-gray-500">Player B</div>
          <div className="text-base font-medium">{a?.username || a?.profile_id || 'Player A'}</div>
          <div className="text-center text-sm text-gray-400">vs</div>
          <div className="text-base font-medium text-right">{b?.username || b?.profile_id || 'Player B'}</div>
          {winnerBadge ? <div className="text-green-600 text-xs">{stats?.winner === 'A' ? 'Winner' : ''}</div> : <div></div>}
          <div></div>
          {winnerBadge ? <div className="text-green-600 text-xs text-right">{stats?.winner === 'B' ? 'Winner' : ''}</div> : <div></div>}
        </div>

        <div className="rounded border border-gray-200 p-4 mb-4">
          <Row label="Correct" left={state === 'final' ? stats?.aCorrect : '-'} right={state === 'final' ? stats?.bCorrect : '-'} />
          <Row label="Pack tokens" left={state === 'final' ? stats?.aTokens : '-'} right={state === 'final' ? stats?.bTokens : '-'} />
          {isChallenge ? (
            <Row label="Challenge bonus" left={state === 'final' ? stats?.bonusSplitA : pack?.bonusAmount} right={state === 'final' ? stats?.bonusSplitB : 0} />
          ) : null}
        </div>

        {state === 'pre-lock' ? (
          <div className="text-sm text-gray-600">
            Picks are hidden until lock. You can see your own picks; your opponent's are hidden.
          </div>
        ) : state === 'pre-grade' ? (
          <div className="text-sm text-gray-600">
            Picks are visible. Results will appear after grading.
          </div>
        ) : state === 'final' ? (
          <div className="text-sm text-gray-700">
            Results are final. {stats?.winner ? (stats.winner === 'A' ? (a?.username || 'Player A') : (b?.username || 'Player B')) + ' wins!' : 'Tie.'}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}

export async function getServerSideProps(ctx) {
  // Route: /packs/[packURL]/h2h; accept fallback query param packID for safety
  const packParam = ctx.query.packURL || ctx.query.packID;
  const token = await getToken({ req: ctx.req, secret: process.env.NEXTAUTH_SECRET });
  const viewerProfileId = token?.userId || null;

  const repo = new PostgresH2HRepository();

  // Load pack by slug, external id, or uuid
  const packRow = await repo.getPackRowByAny(packParam);
  if (!packRow) return { notFound: true };

  // Derive lock/grade state
  const packStatus = (packRow.pack_status || '').toLowerCase();
  const isGraded = packStatus === 'graded';
  const isOpen = packStatus === 'open' || packStatus === 'active' || packStatus === 'live';

  const queryObj = ctx.query || {};
  const tokenParam = queryObj.t || null;
  const u1 = queryObj.u1 || null;
  const u2 = queryObj.u2 || null;

  let isChallenge = false;
  let matchup = null;
  if (tokenParam) {
    isChallenge = true;
    matchup = await repo.getByToken(String(tokenParam));
    if (!matchup || String(matchup.pack_id) !== String(packRow.id)) {
      return { notFound: true };
    }
  }

  // Resolve participants
  let profileAId = null;
  let profileBId = null;
  if (isChallenge) {
    profileAId = matchup.profile_a_id;
    profileBId = matchup.profile_b_id;
  } else {
    // Ad-hoc compare requires session
    if (!viewerProfileId) return { redirect: { destination: '/login', permanent: false } };
    // Resolve profiles by profile_id text or UUID
    const resA = await query(`SELECT id, username, profile_id FROM profiles WHERE profile_id = $1 OR id::text = $1 LIMIT 1`, [String(u1 || '')]);
    const resB = await query(`SELECT id, username, profile_id FROM profiles WHERE profile_id = $1 OR id::text = $1 LIMIT 1`, [String(u2 || '')]);
    if (!resA.rows[0] || !resB.rows[0]) return { notFound: true };
    profileAId = resA.rows[0].id;
    profileBId = resB.rows[0].id;
  }

  // Load minimal profile info
  const { rows: profiles } = await query(
    `SELECT id, username, profile_id FROM profiles WHERE id IN ($1::uuid, $2::uuid)`,
    [profileAId, profileBId]
  );
  const prof = (id) => profiles.find(p => String(p.id) === String(id)) || null;

  // Determine visibility state
  let state = 'pre-lock';
  if (!isOpen && !isGraded) state = 'pre-grade';
  if (isGraded) state = 'final';

  // Compute stats when final; otherwise placeholders
  let stats = {
    aCorrect: null,
    bCorrect: null,
    aTokens: null,
    bTokens: null,
    winner: null,
    bonusSplitA: null,
    bonusSplitB: null,
  };
  if (state === 'final') {
    const aStats = await repo.computeUserStatsForPack({ packId: packRow.id, profileId: profileAId });
    const bStats = await repo.computeUserStatsForPack({ packId: packRow.id, profileId: profileBId });
    let winner = null;
    if (aStats.correct > bStats.correct) winner = 'A';
    else if (bStats.correct > aStats.correct) winner = 'B';
    else if (aStats.tokens > bStats.tokens) winner = 'A';
    else if (bStats.tokens > aStats.tokens) winner = 'B';
    stats = {
      aCorrect: aStats.correct,
      bCorrect: bStats.correct,
      aTokens: aStats.tokens,
      bTokens: bStats.tokens,
      winner,
      bonusSplitA: isChallenge ? (matchup?.bonus_split_a ?? null) : null,
      bonusSplitB: isChallenge ? (matchup?.bonus_split_b ?? null) : null,
    };
  }

  return {
    props: {
      isChallenge,
      metaNoIndex: Boolean(isChallenge),
      token: tokenParam || null,
      pack: { id: packRow.id, packId: packRow.pack_id, title: packRow.title, league: packRow.league, bonusAmount: isChallenge ? (matchup?.bonus_amount || 0) : 0 },
      a: prof(profileAId),
      b: prof(profileBId),
      state,
      stats,
    }
  };
}

// pages/packs/[packURL]/h2h.js
export { default, getServerSideProps } from '../[packID]/h2h';


