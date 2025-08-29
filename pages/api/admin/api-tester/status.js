import { resolveSourceConfig } from "../../../../lib/apiSources";
import { normalizeMajorMlbScoreboard } from "../../../../lib/normalize";

export default async function handler(req, res) {

  // Default date to today in YYYYMMDD if not provided
  function formatDateYYYYMMDD(d) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}${mo}${da}`;
  }

  const { gameDate, gameID } = req.query || {};
  const src = resolveSourceConfig('major-mlb');
  const dateToUse = gameDate || formatDateYYYYMMDD(new Date());
  try {
    console.log('[api-tester/status] Incoming request', {
      gameDate: dateToUse,
      gameID: gameID || undefined,
      source: src.source,
    });
  } catch {}

  if (!src.ok) {
    return res.status(500).json({ success: false, error: src.error || 'Missing RAPIDAPI key/host for source' });
  }
  try {
    let url;
    if (src.source === 'major-mlb') {
      // major-mlb scoreboard expects year, month, day
      const yyyy = String(dateToUse).slice(0, 4);
      const mm = String(dateToUse).slice(4, 6);
      const dd = String(dateToUse).slice(6, 8);
      url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
      url.searchParams.set('year', yyyy);
      url.searchParams.set('month', mm);
      url.searchParams.set('day', dd);
      // limit optional; omit to use default
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported source for status' });
    }

    try {
      console.log('[api-tester/status] Fetch scoreboard', {
        source: src.source,
        url: url.toString(),
        params: Object.fromEntries(url.searchParams || []),
        host: src.host,
      });
    } catch {}

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: src.headers,
    });

    const upstreamText = await upstream.clone().text().catch(() => '');
    const data = await upstream.json().catch(() => ({}));
    try {
      console.log('[api-tester/status] Upstream response', {
        ok: upstream.ok,
        status: upstream.status,
        bodySample: upstreamText ? upstreamText.slice(0, 200) : null,
      });
    } catch {}
    // Normalize scoreboard into our common shape
    const raw = data?.body || data || {};
    const allGames = normalizeMajorMlbScoreboard(raw);

    // If gameID provided, filter locally to only that game (some upstreams ignore gameID)
    let games = allGames;
    let filteredCount = null;
    if (gameID) {
      try {
        const normalizeId = (val) => String(val || '').toUpperCase();
        const wanted = normalizeId(gameID);
        const matched = allGames.filter((g) => {
          const id1 = normalizeId(g?.id);
          const id2 = normalizeId(g?.gameID);
          return id1 === wanted || id2 === wanted;
        });
        filteredCount = matched.length;
        games = matched;
      } catch {}
    }

    try {
      const sample = games.slice(0, 3).map((g) => ({
        id: g?.id || g?.gameID || g?.gameId,
        away: g?.away || g?.awayTeam,
        home: g?.home || g?.homeTeam,
      }));
      console.log('[api-tester/status] Normalized result', {
        upstreamOk: upstream.ok,
        upstreamStatus: upstream.status,
        source: src.source,
        gamesCount: games.length,
        sample,
      });
    } catch {}

    const friendlyError = !upstream.ok
      ? (upstream.status === 429
          ? 'Rate limited by RapidAPI (429). Try again shortly.'
          : `RapidAPI request failed (${upstream.status}).`)
      : undefined;

    return res.status(200).json({
      success: upstream.ok,
      message: upstream.ok ? 'RapidAPI connection OK' : 'RapidAPI request failed',
      error: upstream.ok ? undefined : friendlyError,
      meta: {
        checkedAt: new Date().toISOString(),
        upstreamStatus: upstream.status,
        host: src.host,
        source: src.source,
        date: dateToUse,
        requestUrl: url.toString(),
        ...(gameID ? { filteredByGameID: String(gameID), matchedCount: filteredCount } : {}),
      },
      games,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}


