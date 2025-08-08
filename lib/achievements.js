import { sumTakePoints } from "./points";

/**
 * Resolve a map of phone -> profile recordId for a set of E.164 phones.
 */
export async function resolveProfilesByPhones(base, phones) {
  const uniquePhones = [...new Set(phones.filter(Boolean))];
  if (uniquePhones.length === 0) return new Map();

  // Chunk OR queries to stay within Airtable limits
  const phoneToProfileRecordId = new Map();
  const chunkSize = 50;
  for (let i = 0; i < uniquePhones.length; i += chunkSize) {
    const chunk = uniquePhones.slice(i, i + chunkSize);
    const formula = `OR(${chunk.map((p) => `{profileMobile} = "${p}"`).join(",")})`;
    const records = await base("Profiles")
      .select({ filterByFormula: formula, maxRecords: chunk.length })
      .all();
    records.forEach((rec) => {
      const f = rec.fields;
      const phone = f.profileMobile;
      if (phone) phoneToProfileRecordId.set(phone, rec.id);
    });
  }
  return phoneToProfileRecordId;
}

/**
 * Fetch a profile record by its Airtable record ID.
 */
export async function fetchProfileByRecordId(base, profileRecordId) {
  try {
    const rec = await base("Profiles").find(profileRecordId);
    return rec;
  } catch (err) {
    return null;
  }
}

/**
 * Compute the user's total points by fetching their linked Takes and summing visible takePTS.
 * Mirrors /api/profile behavior for totals (ignores overwritten/hidden via sumTakePoints).
 */
export async function computeUserTotalPoints(base, profileRecordId) {
  const prof = await fetchProfileByRecordId(base, profileRecordId);
  if (!prof) return 0;
  const pf = prof.fields || {};

  let takeRecords = [];

  // Preferred: fetch by explicit linked Takes on the Profile
  if (Array.isArray(pf.Takes) && pf.Takes.length > 0) {
    const filterByFormula = `OR(${pf.Takes.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
    takeRecords = await base("Takes")
      .select({ filterByFormula, maxRecords: 5000 })
      .all();
  } else {
    // Fallback: query Takes by link field to this profile record
    const filterByFormula = `FIND('${profileRecordId}', ARRAYJOIN({Profile}))>0`;
    takeRecords = await base("Takes")
      .select({ filterByFormula, maxRecords: 5000 })
      .all();
  }

  return sumTakePoints(takeRecords);
}

/**
 * Fetch the set of achievementKeys already awarded for a profile.
 */
export async function fetchExistingAchievementKeys(base, profileRecordId) {
  const keys = new Set();
  const filterByFormula = `FIND('${profileRecordId}', ARRAYJOIN({achievementProfile}))>0`;
  const records = await base("Achievements")
    .select({ filterByFormula, maxRecords: 5000 })
    .all();
  records.forEach((rec) => {
    const k = rec.fields.achievementKey;
    if (k) keys.add(String(k));
  });
  return keys;
}

/**
 * Determine missing 1,000-point threshold achievements based on current points
 * and what has already been awarded.
 */
export function determineMissingPointThresholds(currentPoints, existingKeys) {
  const maxK = Math.floor((currentPoints || 0) / 1000);
  const toAward = [];
  for (let k = 1; k <= maxK; k++) {
    const threshold = k * 1000;
    const key = `points_${threshold}`;
    if (!existingKeys.has(key)) toAward.push({ threshold, key });
  }
  return toAward;
}

/**
 * Create Achievements rows for the given profile for each missing threshold key.
 */
export async function awardThresholdAchievements(base, profileRecordId, missingThresholds) {
  if (!missingThresholds || missingThresholds.length === 0) return [];
  // Batch create in chunks of 10 to be safe
  const createdKeys = [];
  const chunkSize = 10;
  // Resolve profileID string for convenience if present on the Profile
  let profileIDStr = null;
  try {
    const prof = await fetchProfileByRecordId(base, profileRecordId);
    profileIDStr = prof?.fields?.profileID || null;
  } catch (_) {
    // ignore
  }
  for (let i = 0; i < missingThresholds.length; i += chunkSize) {
    const chunk = missingThresholds.slice(i, i + chunkSize);
    const payload = chunk.map(({ threshold, key }) => ({
      fields: {
        achievementProfile: [profileRecordId],
        ...(profileIDStr ? { profileID: profileIDStr } : {}),
        achievementKey: key,
        achievementTitle: "Points Milestone",
        achievementDescription: `Reached ${threshold} points`,
        achievementValue: 1,
      },
    }));
    const created = await base("Achievements").create(payload);
    created.forEach((rec) => {
      const k = rec.fields.achievementKey;
      if (k) createdKeys.push(String(k));
    });
  }
  return createdKeys;
}

/**
 * Check and award 1,000-point threshold achievements for a single profile.
 * Returns the list of achievementKeys created.
 */
export async function checkAndAwardPointsThresholds(base, profileRecordId) {
  const totalPoints = await computeUserTotalPoints(base, profileRecordId);
  const existing = await fetchExistingAchievementKeys(base, profileRecordId);
  const missing = determineMissingPointThresholds(totalPoints, existing);
  const created = await awardThresholdAchievements(base, profileRecordId, missing);
  return created;
}

/**
 * Given updated propIDs, find affected profiles (via latest, non-overwritten Takes),
 * then check and award threshold achievements for each. Returns a summary array.
 */
export async function awardThresholdsForUpdatedProps(base, updatedPropIDs) {
  if (!Array.isArray(updatedPropIDs) || updatedPropIDs.length === 0) return [];

  // Fetch latest, non-overwritten Takes for the updated props
  const orClause = updatedPropIDs.map((pid) => `({propID}="${pid}")`).join(",");
  const formula = `AND({takeStatus} = "latest", {takeStatus} != "overwritten", OR(${orClause}))`;
  const takes = await base("Takes")
    .select({ filterByFormula: formula, maxRecords: 10000 })
    .all();

  // Collect profile record IDs directly from link field if available
  const profileRecordIds = new Set();
  const phonesNeedingLookup = new Set();
  for (const t of takes) {
    const tf = t.fields || {};
    const links = Array.isArray(tf.Profile) ? tf.Profile : [];
    if (links.length > 0) {
      links.forEach((rid) => profileRecordIds.add(rid));
    } else if (tf.takeMobile) {
      phonesNeedingLookup.add(tf.takeMobile);
    }
  }

  // Resolve any remaining phones to profile record IDs
  if (phonesNeedingLookup.size > 0) {
    const phoneMap = await resolveProfilesByPhones(base, [...phonesNeedingLookup]);
    phoneMap.forEach((rid) => profileRecordIds.add(rid));
  }

  // For each affected profile, check and award thresholds
  const results = [];
  for (const rid of profileRecordIds) {
    try {
      const created = await checkAndAwardPointsThresholds(base, rid);
      if (created.length > 0) {
        results.push({ profileRecordId: rid, achievementKeys: created });
      }
    } catch (err) {
      // Continue processing other profiles
      // Optionally push an error entry
      results.push({ profileRecordId: rid, error: err.message });
    }
  }
  return results;
}


