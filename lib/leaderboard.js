/**
 * Shared helper to aggregate leaderboard stats from Airtable take records.
 *
 * Takes an array of Airtable record objects (with .fields) from the 'Takes' table,
 * filters out overwritten, draft, or archived records, and tallies per-phone:
 *   - takes: number of attempts
 *   - points: total takePTS
 *   - won, lost, pending, pushed: counts for takeResult categories
 *
 * Returns a sorted array of { phone, takes, points, won, lost, pending, pushed }
 * descending by points.
 */
export function aggregateTakeStats(records) {
  const statsMap = new Map();

  records.forEach((rec) => {
    const f = rec.fields;
    const propStatus = f.propStatus || 'open';
    if (propStatus === 'archived' || propStatus === 'draft') return;
    if (f.takeStatus === 'overwritten') return;

    const phone = f.takeMobile || 'Unknown';
    const points = f.takePTS || 0;
    const result = (f.takeResult || '').trim().toLowerCase();

    if (!statsMap.has(phone)) {
      statsMap.set(phone, {
        phone,
        takes: 0,
        points: 0,
        won: 0,
        lost: 0,
        pending: 0,
        pushed: 0,
      });
    }

    const s = statsMap.get(phone);
    s.takes += 1;
    s.points += points;

    if (result === 'won') {
      s.won += 1;
    } else if (result === 'lost') {
      s.lost += 1;
    } else if (result === 'pending') {
      s.pending += 1;
    } else if (result === 'pushed' || result === 'push') {
      s.pushed += 1;
    }
  });

  const arr = Array.from(statsMap.values());
  arr.sort((a, b) => b.points - a.points);
  return arr;
} 