/**
 * Calculate the total points from an array of Airtable Take records.
 * Skips records which are overwritten or hidden.
 */
export function sumTakePoints(records) {
  return records.filter(isVisibleTake).reduce((sum, rec) => sum + (rec.fields.takePTS || 0), 0);
}

// Determine whether a take record should be included (not overwritten or hidden)
export function isVisibleTake(rec) {
  const f = rec.fields || {};
  if (f.takeStatus === 'overwritten') return false;
  if (f.takeHide) return false;
  return true;
}
