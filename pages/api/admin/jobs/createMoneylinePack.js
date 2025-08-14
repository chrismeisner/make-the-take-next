import Airtable from 'airtable';
import { getToken } from 'next-auth/jwt';
import { getCustomEventsByDate } from '../../../../lib/airtableService';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

function formatDateInTZ(date, timeZone = 'America/New_York') {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date);
	const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
	return `${map.year}-${map.month}-${map.day}`;
}

export default async function handler(req, res) {
	if (req.method !== 'POST') {
		return res.status(405).json({ success: false, error: 'Method not allowed' });
	}

	// Require admin session when triggered from UI
	const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
	if (!token) {
		return res.status(401).json({ success: false, error: 'Unauthorized' });
	}

	const league = String(req.query.league || 'mlb').toLowerCase();
	const tz = req.query.tz || 'America/New_York';
	const providerId = String(req.query.providerId || '58');
	const dryRun = String(req.query.dryRun || 'false') === 'true';
	const mode = String(req.query.mode || 'both').toLowerCase(); // 'props' | 'pack' | 'both'
	const dateStr = req.query.date && req.query.date !== 'today'
		? String(req.query.date)
		: formatDateInTZ(new Date(), tz);

	console.log('[createMoneylinePack] START', { league, tz, providerId, dryRun, mode, date: dateStr });

	// Build base URL for internal API calls (vegas-odds, props, packs)
	const proto = (req.headers['x-forwarded-proto'] || 'http');
	const host = req.headers.host;
	const baseUrl = `${proto}://${host}`;

	const results = [];
	const createdPropIds = [];
	let packInfo = null;

	try {
		// 1) Fetch events for the date and league (timezone-aware)
		let events = await getCustomEventsByDate({ date: dateStr, timeZone: tz });
		events = events.filter(evt => String(evt.eventLeague).toLowerCase() === league);
		console.log(`[createMoneylinePack] Found ${events.length} events for ${league} on ${dateStr}`);

		// 2) Create props only if mode !== 'pack'
		if (mode !== 'pack') {
			for (const evt of events) {
				const { id: eventId, espnGameID, awayTeam, homeTeam, awayTeamLink, homeTeamLink, eventTime } = evt;
				if (!espnGameID) {
					results.push({ eventId, status: 'skipped', reason: 'missing espnGameID' });
					continue;
				}

				// Idempotency: skip if an ML prop already exists for this event (match by ESPN ID via lookup)
				try {
					console.log(`[createMoneylinePack] Idempotency check: eventId=${eventId}, espnGameID=${espnGameID}`);
					const existing = await base('Props')
						.select({
							filterByFormula: `AND(LOWER({propType}) = "moneyline", {propESPNLookup} = "${espnGameID}")`,
							maxRecords: 1,
						})
						.firstPage();
					if (existing.length) {
						results.push({ eventId, status: 'skipped', reason: 'already has moneyline prop' });
						continue;
					}
				} catch (e) {
					results.push({ eventId, status: 'error', reason: 'idempotency check failed', details: e.message });
					continue;
				}

				// Fetch odds from our vegas-odds endpoint
				const oddsUrl = `${baseUrl}/api/admin/vegas-odds?eventId=${encodeURIComponent(espnGameID)}&league=${encodeURIComponent(`baseball/${league}`)}&providerId=${encodeURIComponent(providerId)}`;
				let odds;
				try {
					const oddsRes = await fetch(oddsUrl, { headers: { Accept: 'application/json' } });
					if (!oddsRes.ok) {
						results.push({ eventId, status: 'error', reason: `odds ${oddsRes.status}` });
						continue;
					}
					odds = await oddsRes.json();
				} catch (e) {
					results.push({ eventId, status: 'error', reason: 'odds fetch failed', details: e.message });
					continue;
				}

				// Prefer Event names, but fall back to odds.summary names if missing
				let away = Array.isArray(awayTeam) ? (awayTeam[0] || null) : (awayTeam || null);
				let home = Array.isArray(homeTeam) ? (homeTeam[0] || null) : (homeTeam || null);
				if (!away || !home) {
					const t = odds && odds.teams ? odds.teams : {};
					away = away || t.awayName || 'Away';
					home = home || t.homeName || 'Home';
				}
				const mlA = String(odds?.awayTeamOdds?.moneyLine ?? '');
				const mlB = String(odds?.homeTeamOdds?.moneyLine ?? '');
				if (!mlA || !mlB) {
					results.push({ eventId, status: 'error', reason: 'missing moneylines' });
					continue;
				}

				const payload = {
					eventId,
					propType: 'moneyline',
					propValueModel: 'vegas',
					propShort: `Moneyline: ${away} vs ${home}`,
					PropSideAShort: away,
					PropSideBShort: home,
					PropSideATake: `${away} beat the ${home}`,
					PropSideBTake: `${home} beat the ${away}`,
					PropSideAMoneyline: mlA,
					PropSideBMoneyline: mlB,
					teams: [...(awayTeamLink || []), ...(homeTeamLink || [])],
					propCloseTime: eventTime,
					// Use Event cover by default for moneyline props
					propCoverSource: 'event',
					// ensure Airtable can compute lookups
					eventLeague,
					eventTitle: evt.eventTitle,
				};

				if (dryRun) {
					results.push({ eventId, status: 'dryRun', payload });
					continue;
				}

				try {
					const createRes = await fetch(`${baseUrl}/api/props`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload),
					});
					if (!createRes.ok) {
						const text = await createRes.text();
						results.push({ eventId, status: 'error', reason: `create ${createRes.status}`, details: text });
						continue;
					}
					const data = await createRes.json();
					const airtableId = data?.record?.id;
					if (airtableId) createdPropIds.push(airtableId);
					results.push({ eventId, status: 'created-prop', propRecordId: airtableId });
				} catch (e) {
					results.push({ eventId, status: 'error', reason: 'prop create failed', details: e.message });
				}
			}
		}

		// 3) Create/Update the pack if not a dry run and mode !== 'props'
		if (!dryRun && mode !== 'props') {
			let propIdsForPack = [];
			let totalPropsFound = 0;
			// For each event on the date+league, collect existing moneyline props (by propType and ESPN ID lookup)
			for (const evt of events) {
				const eventId = evt.id;
				try {
					console.log(`[createMoneylinePack] Gathering props for eventId=${eventId}, espnGameID=${evt.espnGameID}`);
					const props = await base('Props')
						.select({
							filterByFormula: `AND(LOWER({propType}) = "moneyline", {propESPNLookup} = "${evt.espnGameID}")`,
						})
						.firstPage();
					for (const p of props) propIdsForPack.push(p.id);
					totalPropsFound += props.length;
					console.log(`[createMoneylinePack] Event ${eventId} -> found ${props.length} moneyline props by ESPN ID ${evt.espnGameID}`);
				} catch (e) {
					console.warn('[createMoneylinePack] Failed to collect props for event', eventId, e.message);
				}
			}
			// Include any newly created prop ids just in case
			propIdsForPack.push(...createdPropIds);
			// Deduplicate
			propIdsForPack = Array.from(new Set(propIdsForPack));
			console.log(`[createMoneylinePack] Collected ${propIdsForPack.length} unique moneyline props across ${events.length} events (raw found=${totalPropsFound}, createdNow=${createdPropIds.length})`);

			const slug = `${league}-moneylines-${dateStr}`.toLowerCase();
			const packTitle = `${league.toUpperCase()} Moneylines ${dateStr}`;
			let packRecord = null;
			try {
				const existing = await base('Packs')
					.select({ filterByFormula: `{packURL}="${slug}"`, maxRecords: 1 })
					.firstPage();
				if (existing.length) {
					packRecord = existing[0];
					const existingProps = Array.isArray(packRecord.fields.Props) ? packRecord.fields.Props : [];
					const merged = Array.from(new Set([...existingProps, ...propIdsForPack]));
					console.log(`[createMoneylinePack] Existing pack found (${packRecord.id}). ExistingProps=${existingProps.length} -> Merged=${merged.length}`);
					if (merged.length !== existingProps.length) {
						await base('Packs').update([{ id: packRecord.id, fields: { Props: merged } }]);
					}
				} else {
					const body = {
						packTitle,
						packSummary: `Automatically created pack for ${league.toUpperCase()} moneylines on ${dateStr}`,
						packURL: slug,
						packLeague: league,
						packStatus: 'active',
						props: propIdsForPack,
					};
					console.log('[createMoneylinePack] Creating new pack', { slug, count: propIdsForPack.length });
					const packRes = await fetch(`${baseUrl}/api/packs`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					});
					if (!packRes.ok) {
						const txt = await packRes.text();
						console.error('[createMoneylinePack] Pack create failed', txt);
						return res.status(200).json({ success: true, date: dateStr, league, results, pack: null, packError: txt });
					}
					const data = await packRes.json();
					packRecord = data.record;
				}
			} catch (e) {
				// continue but report
				console.error('[createMoneylinePack] Pack upsert error', e.message);
				packRecord = null;
			}
			if (packRecord) {
				packInfo = { id: packRecord.id, packURL: packRecord.fields?.packURL || null, packTitle: packRecord.fields?.packTitle || null };
			}
		}

		console.log('[createMoneylinePack] DONE', { date: dateStr, league, mode, createdPropCount: createdPropIds.length, packInfo });
		return res.status(200).json({
			success: true,
			date: dateStr,
			league,
			mode,
			results,
			createdPropCount: createdPropIds.length,
			pack: packInfo
		});
	} catch (err) {
		return res.status(500).json({ success: false, error: err.message });
	}
}


