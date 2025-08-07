import { sumTakePoints, isVisibleTake } from "./points";

/**
 * Shared helper to aggregate leaderboard stats from Airtable take records.
 * Uses sumTakePoints to centralize summing and skips overwritten or hidden takes.
 */
export function aggregateTakeStats(records) {
  // 1) Filter out archived/draft props and only include visible takes
  const filtered = records.filter((rec) => {
    const f = rec.fields || {};
    const propStatus = f.propStatus || 'open';
    if (propStatus === 'archived' || propStatus === 'draft') return false;
    if (!isVisibleTake(rec)) return false;
    return true;
  });

  // 2) Group by phone and tally wins/losses/pushes
  const statsMap = new Map();
  filtered.forEach((rec) => {
    const f = rec.fields || {};
    const phone = f.takeMobile || 'Unknown';
    if (!statsMap.has(phone)) {
      statsMap.set(phone, { phone, recs: [], won: 0, lost: 0, pending: 0, pushed: 0 });
    }
    const s = statsMap.get(phone);
    s.recs.push(rec);
    const result = (f.takeResult || '').trim().toLowerCase();
    if (result === 'won') s.won += 1;
    else if (result === 'lost') s.lost += 1;
    else if (result === 'pending') s.pending += 1;
    else if (result === 'pushed' || result === 'push') s.pushed += 1;
  });

  // 3) Build final array using shared sumTakePoints
  const arr = Array.from(statsMap.values()).map((s) => ({
    phone: s.phone,
    takes: s.recs.length,
    points: sumTakePoints(s.recs),
    won: s.won,
    lost: s.lost,
    pending: s.pending,
    pushed: s.pushed,
  }));
  arr.sort((a, b) => b.points - a.points);
  return arr;
} 