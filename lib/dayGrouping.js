// Shared utilities to group packs by day and extract identifiers

function normalizeStartOfDay(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getDayLabels() {
  return {
    today: 'Today',
    yesterday: 'Yesterday',
    tomorrow: 'Tomorrow',
    thisWeek: 'This Week',
    nextWeek: 'Next Week',
    later: 'Later',
  };
}

export function getDateGroupForTime(eventTime, options = {}) {
  if (!eventTime) return 'later';
  const { selectedDateIso = null } = options;
  try {
    const eventDate = normalizeStartOfDay(eventTime);
    const eventIso = eventDate.toISOString().slice(0, 10);
    if (selectedDateIso) {
      return eventIso === selectedDateIso ? 'today' : 'later';
    }
    const today = normalizeStartOfDay(new Date());
    const diffDays = Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === -1) return 'yesterday';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays >= 2 && diffDays <= 7) return 'thisWeek';
    if (diffDays >= 8 && diffDays <= 14) return 'nextWeek';
    return 'later';
  } catch {
    return 'later';
  }
}

export function getDayKeyForPack(pack, options = {}) {
  const eventTime = pack?.eventTime || pack?.packOpenTime || pack?.packCloseTime;
  return getDateGroupForTime(eventTime, options);
}

export function filterPacksByTeam(packs, teamSlug) {
  const teamFilterLc = (teamSlug || '').toString().toLowerCase().trim();
  if (!teamFilterLc) return Array.isArray(packs) ? packs : [];
  return (Array.isArray(packs) ? packs : []).filter((p) => {
    const h = (p?.homeTeamSlug || '').toString().toLowerCase();
    const a = (p?.awayTeamSlug || '').toString().toLowerCase();
    if (h === teamFilterLc || a === teamFilterLc) return true;
    // Also support packs that provide linkedTeams: [{ slug, name, logoUrl }]
    if (Array.isArray(p?.linkedTeams) && p.linkedTeams.length > 0) {
      return p.linkedTeams.some((t) => {
        const slug = (t?.slug || '').toString().toLowerCase();
        return slug === teamFilterLc;
      });
    }
    return false;
  });
}

export function groupPacksByDay(packs, options = {}) {
  const { selectedDateIso = null, teamSlug = '' } = options;
  const groups = {
    today: [],
    yesterday: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
  };
  const input = filterPacksByTeam(packs, teamSlug);
  input.forEach((pack) => {
    const key = getDayKeyForPack(pack, { selectedDateIso });
    groups[key].push(pack);
  });
  return groups;
}

export function computeAvailableDays(packs, options = {}) {
  const groups = groupPacksByDay(packs, options);
  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([key]) => key);
}

export function getPackIdentifier(pack) {
  return String(pack?.packID || pack?.id || pack?.airtableId || '').trim();
}

export function getPackIdsForDay(packs, dayKey, options = {}) {
  const groups = groupPacksByDay(packs, options);
  const arr = groups[dayKey] || [];
  const ids = [];
  arr.forEach((p) => {
    const id = getPackIdentifier(p);
    if (id) ids.push(id);
  });
  return ids;
}


