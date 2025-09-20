// Shared helpers for building AI summary prompts

const DEFAULT_EXAMPLE =
  'A good example is: "Matthews (5.67 ERA, 42 K) opposes Paddack (4.77 ERA, 88 K) as Tigers (66–48) aim to extend their four-game win streak over Twins (52–60)."';

/**
 * Build a concise game summary prompt.
 *
 * Options:
 * - away, home: when previewing a specific matchup
 * - eventTitle: alternative to away/home when a generic event title is preferred
 * - eventDateTime: human-readable date/time string
 * - league: league label string
 * - wordsMax: number (default 40)
 * - includeExample: whether to append the default example sentence
 * - example: override example sentence
 */
export function buildGameSummaryPrompt({
  away,
  home,
  eventTitle,
  eventDateTime,
  league,
  wordsMax = 40,
  includeExample = false,
  example,
} = {}) {
  const safeLeague = typeof league === 'string' ? league : '';
  const base = (typeof eventTitle === 'string' && eventTitle.trim().length > 0)
    ? `Write a ${wordsMax} words max summary previewing ${eventTitle} on ${eventDateTime} in the ${safeLeague}, use relevant narratives and stats.`
    : `Write a ${wordsMax} words max summary previewing the upcoming game between ${away} and ${home} on ${eventDateTime} in the ${safeLeague}, use relevant narratives and stats.`;

  if (includeExample) {
    return `${base} ${example || DEFAULT_EXAMPLE}`;
  }
  return base;
}

export { DEFAULT_EXAMPLE };


