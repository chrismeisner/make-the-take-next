// components/H2HScoreboard.js
import React from 'react';

export default function H2HScoreboard({ a, b, state, stats, isChallenge }) {
  const Row = ({ label, left, right }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="flex items-center gap-4">
        <div className="min-w-[120px] text-right">{left}</div>
        <div className="min-w-[120px] text-right">{right}</div>
      </div>
    </div>
  );

  const winnerBadgeA = state === 'final' && stats?.winner === 'A' ? 'Winner' : '';
  const winnerBadgeB = state === 'final' && stats?.winner === 'B' ? 'Winner' : '';

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="grid grid-cols-3 gap-3 items-end mb-3">
        <div className="text-xs uppercase tracking-wide text-gray-500">Player A</div>
        <div></div>
        <div className="text-right text-xs uppercase tracking-wide text-gray-500">Player B</div>
        <div className="text-base font-medium">{a?.username || a?.profile_id || 'Player A'}</div>
        <div className="text-center text-sm text-gray-400">vs</div>
        <div className="text-base font-medium text-right">{b?.username || b?.profile_id || 'Player B'}</div>
        <div className="text-green-600 text-xs">{winnerBadgeA}</div>
        <div></div>
        <div className="text-green-600 text-xs text-right">{winnerBadgeB}</div>
      </div>

      <Row label="Correct" left={state === 'final' ? stats?.aCorrect : '-'} right={state === 'final' ? stats?.bCorrect : '-'} />
      <Row label="Pack tokens" left={state === 'final' ? stats?.aTokens : '-'} right={state === 'final' ? stats?.bTokens : '-'} />
      {isChallenge ? (
        <Row label="Challenge bonus" left={state === 'final' ? stats?.bonusSplitA : 0} right={state === 'final' ? stats?.bonusSplitB : 0} />
      ) : null}
    </div>
  );
}


