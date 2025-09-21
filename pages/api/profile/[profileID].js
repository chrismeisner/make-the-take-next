// Postgres-only implementation
import { createRepositories } from '../../../lib/dal/factory';
import { query } from '../../../lib/db/postgres';

// No creator leaderboard cache needed; Airtable path removed

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
	return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { profileID } = req.query;
  const includeExchanges = String(req.query.includeExchanges || '').toLowerCase() === '1' || String(req.query.includeExchanges || '').toLowerCase() === 'true';
  const refreshBypass = String(req.query.refresh || '').toLowerCase() === '1' || String(req.query.refresh || '').toLowerCase() === 'true';
  const select = String(req.query.select || '').toLowerCase();

  try {
    // Fast path: tokens-only
    if (select === 'tokens') {
        let tokensEarned = 0;
        let tokensSpent = 0;
        let tokensAwarded = 0;
		try {
		  const { rows } = await query(
			`SELECT COALESCE(SUM(t.tokens),0) AS earned
			   FROM takes t
			   JOIN profiles p ON p.mobile_e164 = t.take_mobile
			  WHERE p.profile_id = $1 AND t.take_status = 'latest'`,
			[profileID]
		  );
		  tokensEarned = Number(rows?.[0]?.earned) || 0;
		} catch {}
		try {
		  const { rows } = await query(
			`SELECT COALESCE(SUM(e.exchange_tokens),0) AS spent
			   FROM exchanges e
			   JOIN profiles p ON e.profile_id = p.id
			  WHERE p.profile_id = $1`,
			[profileID]
		  );
		  tokensSpent = Number(rows?.[0]?.spent) || 0;
		} catch {}
        try {
          const { rows } = await query(
            `SELECT COALESCE(SUM(a.tokens),0) AS awarded
               FROM award_redemptions ar
               JOIN award_cards a ON a.id = ar.award_card_id
               JOIN profiles p ON p.id = ar.profile_id
              WHERE p.profile_id = $1`,
            [profileID]
          );
          tokensAwarded = Number(rows?.[0]?.awarded) || 0;
        } catch {}
        const tokensBalance = tokensEarned + tokensAwarded - tokensSpent;
        return res.status(200).json({ success: true, tokensEarned, tokensSpent, tokensAwarded, tokensBalance });
	}

    // 1) Fetch the profile record (Postgres)
	let profRec = null;
	let pf = null;
	let profileTeamData = null;
    {
	  const { profiles } = createRepositories();
	  const r = await profiles.getByProfileID(profileID);
	  if (!r) {
		return res.status(404).json({ success: false, error: 'Profile not found' });
	  }
	  // Synthesize structures expected later in the file
	  profRec = { id: r.id, _rawJson: { createdTime: r.created_at ? new Date(r.created_at).toISOString() : null } };
	  pf = {
		profileID: r.profile_id,
		profileMobile: r.mobile_e164,
		profileUsername: r.profile_id || '',
		profileAvatar: [],
	  };
	  // Resolve favorite team via Postgres if present
	  if (r.favorite_team_id) {
		try {
		  const { rows } = await query('SELECT id, team_id, team_slug, name, logo_url FROM teams WHERE id = $1 LIMIT 1', [r.favorite_team_id]);
		  if (rows.length) {
			const t = rows[0];
			profileTeamData = {
			  airtableId: t.id,
			  teamID: t.team_id || t.id,
			  teamName: t.name || '',
			  teamLogo: t.logo_url ? [{ url: t.logo_url, filename: 'team-logo' }] : [],
			};
		  }
		} catch {}
	  }
    }

	// Initialize arrays to hold user's takes & packs
	let userTakes = [];
	let userPackIDs = [];
	let totalPoints = 0;

    // 2) Fetch takes (Postgres)
    {
	  // Postgres: derive by phone number with joins for enrichment
	  try {
		const phone = pf.profileMobile;
		if (phone && typeof phone === 'string') {
		  const { rows } = await query(
			`SELECT 
			   t.id AS take_id,
			   t.prop_id_text,
			   t.prop_side,
			   t.take_mobile,
			   t.take_status,
			   t.created_at,
			   t.take_result,
			   t.take_pts,
			   t.tokens AS take_tokens,
			   t.pack_id AS take_pack_uuid,
			   p.prop_short,
			   p.prop_summary,
			   p.prop_status,
			   e.title AS event_title,
			   e.league AS event_league,
			   e.espn_game_id,
			   ht.team_slug AS home_team_slug,
			   at.team_slug AS away_team_slug,
			   ht.name AS home_team_name,
			   at.name AS away_team_name,
			   pts.prop_team_slugs,
			   pts.prop_team_names,
			   pk.pack_id AS pack_id_text,
			   pk.id AS pack_uuid
			 FROM takes t
			 LEFT JOIN props p ON t.prop_id = p.id
			 LEFT JOIN events e ON p.event_id = e.id
			 LEFT JOIN teams ht ON e.home_team_id = ht.id
			 LEFT JOIN teams at ON e.away_team_id = at.id
			 LEFT JOIN LATERAL (
			   SELECT ARRAY_AGG(DISTINCT tm.team_slug) AS prop_team_slugs,
			          ARRAY_AGG(DISTINCT tm.name) AS prop_team_names
			     FROM props_teams pt
			     JOIN teams tm ON tm.id = pt.team_id
			    WHERE pt.prop_id = p.id
			 ) pts ON TRUE
			 LEFT JOIN packs pk ON t.pack_id = pk.id
			 WHERE t.take_mobile = $1 AND t.take_status != 'overwritten'
			 ORDER BY t.created_at DESC LIMIT 5000`,
			[phone]
		  );
		  totalPoints = rows.reduce((sum, r) => sum + (Number(r.take_pts) || 0), 0);
		  for (const r of rows) {
			const packIdForDisplay = r.pack_id_text || r.pack_uuid || null;
			if (r.pack_uuid) userPackIDs.push(r.pack_uuid);
			// Build team tags for filtering: prefer explicit prop↔team links, else event home/away
			const eventTeamSlugs = [r.home_team_slug, r.away_team_slug].filter(Boolean);
			const eventTeamNames = [r.home_team_name, r.away_team_name].filter(Boolean);
			const propTeamSlugs = Array.isArray(r.prop_team_slugs) ? r.prop_team_slugs.filter(Boolean) : [];
			const propTeamNames = Array.isArray(r.prop_team_names) ? r.prop_team_names.filter(Boolean) : [];
			const chosenSlugs = (propTeamSlugs.length ? propTeamSlugs : eventTeamSlugs).filter(Boolean);
			const chosenNames = (propTeamNames.length ? propTeamNames : eventTeamNames).filter(Boolean);
			userTakes.push({
			  takeID: r.take_id,
			  propID: r.prop_id_text || '',
			  propSide: r.prop_side || null,
			  propTitle: r.prop_summary || '',
			  propShort: r.prop_short || '',
			  propSummary: r.prop_summary || '',
			  subjectTitle: '',
			  takePopularity: 0,
			  createdTime: r.created_at ? new Date(r.created_at).toISOString() : null,
			  takeStatus: r.take_status || '',
			  propResult: r.take_result || '',
			  propEventMatchup: r.event_title || '',
			  propLeague: r.event_league ? String(r.event_league).toLowerCase() : '',
			  propESPN: r.espn_game_id || '',
			  propStatus: r.prop_status || '',
			  takeResult: r.take_result || '',
			  takePTS: Number(r.take_pts) || 0,
			  takeTokens: (Number(r.take_tokens) || (Number(r.take_pts) || 0) * 0.05),
			  takeHide: false,
			  takeTitle: r.prop_summary || '',
			  takeContentImageUrls: [],
			  packIDs: packIdForDisplay ? [packIdForDisplay] : [],
			  teamSlugs: Array.from(new Set(chosenSlugs)),
			  teamNames: Array.from(new Set(chosenNames)),
			});
		  }
		}
	  } catch (fallbackErr) {
		console.error('[profile][pg] take fetch failed =>', fallbackErr);
	  }
    }

	// 3) Deduplicate and fetch pack details
	const uniquePackIDs = [...new Set(userPackIDs)];
	let validPacks = [];
  if (uniquePackIDs.length > 0) {
		const params = uniquePackIDs.map((_, i) => `$${i + 1}`).join(',');
		try {
		  const { rows } = await query(`SELECT id, pack_id, pack_url, title, cover_url, event_time, pack_status FROM packs WHERE id IN (${params})`, uniquePackIDs);
		  validPacks = rows.map(r => ({
			packID: r.pack_id || r.id,
			packURL: r.pack_url || '',
			packTitle: r.title || '',
			packStatus: r.pack_status || '',
			packCover: r.cover_url ? [{ url: r.cover_url, filename: 'cover' }] : [],
			eventTime: r.event_time || null,
		  }));
		} catch (pgPackErr) {
		  console.error('[profile][pg] pack fetch failed =>', pgPackErr);
		}
	}

	// 4) Build the profile data object
	const isCreator = Boolean(pf.creator || pf.Creator || pf.profileCreator || pf.isCreator);
	const profileData = {
	  airtableRecordId: profRec.id,
	  profileID: pf.profileID,
	  profileMobile: pf.profileMobile,
	  profileUsername: pf.profileUsername || '',
	  profileAvatar: pf.profileAvatar || [],
	  profileTeamData, // Contains favorite team info (from PG when available)
	  isCreator,
	  createdTime: profRec._rawJson.createdTime,
	};

	// 5) Compute tokensEarned from Takes instead of achievements
	let achievementsValueTotal = 0;
	let achievements = [];
	let tokensEarned = 0;
	let tokensAwarded = 0; // ensure defined for tokens balance/response
	if (isPG) {
	  try {
		const { rows } = await query(
		  `SELECT COALESCE(SUM(t.tokens),0) AS earned
		     FROM takes t
		     JOIN profiles p ON p.mobile_e164 = t.take_mobile
		    WHERE p.profile_id = $1 AND t.take_status = 'latest'`,
		  [profileID]
		);
		tokensEarned = Number(rows[0]?.earned) || 0;
	  } catch (err) {
		tokensEarned = 0;
	  }
	  // Also compute tokens awarded via awards redemptions (PG only)
	  try {
		const { rows } = await query(
		  `SELECT COALESCE(SUM(a.tokens),0) AS awarded
		     FROM award_redemptions ar
		     JOIN award_cards a ON a.id = ar.award_card_id
		     JOIN profiles p ON p.id = ar.profile_id
		    WHERE p.profile_id = $1`,
		  [profileID]
		);
		tokensAwarded = Number(rows[0]?.awarded) || 0;
	  } catch (err) {
		tokensAwarded = 0;
	  }
	} else {
	  try {
		const phone = pf.profileMobile;
		if (phone) {
		  const filterByFormula = `AND({takeMobile} = "${phone}", {takeStatus} = "latest")`;
		  const takes = await base('Takes').select({ filterByFormula, maxRecords: 5000 }).all();
		  const totalPoints = sumTakePoints(takes);
		  tokensEarned = Math.floor(totalPoints * 0.05);
		}
	  } catch (err) {
		tokensEarned = 0;
	  }
	}

	// 6) Exchanges list (Airtable/PG)
	let userExchanges = [];
	if (includeExchanges) {
	  if (isPG) {
		try {
		  const { rows } = await query(
			`SELECT e.id, e.exchange_tokens, e.created_at, i.item_id AS item_id_text
			   FROM exchanges e
			   JOIN profiles p ON e.profile_id = p.id
			   LEFT JOIN items i ON e.item_id = i.id
			  WHERE p.profile_id = $1
			  ORDER BY e.created_at DESC
			  LIMIT 5000`,
			[profileID]
		  );
		  userExchanges = rows.map(r => ({
			exchangeID: r.id,
			exchangeTokens: Number(r.exchange_tokens) || 0,
			exchangeItem: r.item_id_text ? [r.item_id_text] : [],
			createdTime: r.created_at ? new Date(r.created_at).toISOString() : null,
		  }));
		} catch (pgExErr) {
		  console.error('[profile][pg] Error fetching exchanges =>', pgExErr);
		}
	  } else {
		const exchangeFilter = `{profileID}="${profileID}"`;
		console.log('[profile] Filtering Exchanges with formula:', exchangeFilter);
		const exchRecs = await base('Exchanges')
		  .select({ filterByFormula: exchangeFilter, maxRecords: 5000 })
		  .all();
		console.log(`[profile] Retrieved ${exchRecs.length} Exchanges rows for profileID ${profileID}`);
		userExchanges = exchRecs.map((r) => ({
		  exchangeID: r.id,
		  exchangeTokens: r.fields.exchangeTokens || 0,
		  exchangeItem: r.fields.exchangeItem || [],
		  createdTime: r._rawJson.createdTime,
		}));
	  }
	}

  // Referral awards: prefer stored context on redemptions; no string parsing needed
  let referralAwards = [];
    if (isPG) {
      try {
        const { rows } = await query(
          `SELECT a.code,
                  a.name,
                  a.tokens,
                  ar.redeemed_at,
                  pk.pack_url,
                  COALESCE(rp.profile_id, NULL) AS referred_profile_id_text,
                  COALESCE(rp.profile_id, NULL) AS referred_handle,
                  rt.id AS referred_take_id,
                  rt.prop_side,
                  rt.created_at AS referred_take_created_at,
                  pr.prop_short,
                  pr.prop_summary
             FROM award_redemptions ar
             JOIN award_cards a ON a.id = ar.award_card_id
             JOIN profiles p ON p.id = ar.profile_id
        LEFT JOIN packs pk ON pk.id = ar.pack_id
        LEFT JOIN profiles rp ON rp.id = ar.referred_profile_id
        LEFT JOIN takes rt ON rt.id = ar.referred_take_id
        LEFT JOIN props pr ON pr.id = rt.prop_id
            WHERE p.profile_id = $1
              AND a.code LIKE 'ref5:%'
            ORDER BY ar.redeemed_at DESC
            LIMIT 5000`,
          [profileID]
        );
        referralAwards = rows.map((r) => ({
          code: r.code,
          name: r.name,
          tokens: Number(r.tokens) || 0,
          redeemedAt: r.redeemed_at ? new Date(r.redeemed_at).toISOString() : null,
          referredUser: r.referred_handle ? { handle: r.referred_handle } : undefined,
          take: r.referred_take_id ? {
            id: r.referred_take_id,
            side: r.prop_side || null,
            propShort: r.prop_short || null,
            propSummary: r.prop_summary || null,
            createdAt: r.referred_take_created_at ? new Date(r.referred_take_created_at).toISOString() : null,
          } : undefined,
        }));
      } catch (pgAwardsErr) {
        try { console.error('[profile][pg] Error fetching referral awards =>', pgAwardsErr); } catch {}
      }
    }

	// 7) Tokens summary consistent with Marketplace
	let tokensSpent = 0;
    {
	  try {
		const { rows } = await query(
		  `SELECT COALESCE(SUM(e.exchange_tokens),0) AS spent
		     FROM exchanges e
		     JOIN profiles p ON e.profile_id = p.id
		    WHERE p.profile_id = $1`,
		  [profileID]
		);
		tokensSpent = Number(rows[0]?.spent) || 0;
	  } catch (pgSpentErr) {
		console.error('[profile][pg] Error computing tokensSpent =>', pgSpentErr);
		tokensSpent = 0;
	  }
    }
	const tokensBalance = tokensEarned + tokensAwarded - tokensSpent;

    // Creator packs/leaderboard removed for Postgres-only path
    const creatorPacks = [];
    const creatorLeaderboard = [];
    const creatorLeaderboardUpdatedAt = null;

	// 8) Return the aggregated data
	return res.status(200).json({
	  success: true,
	  profile: profileData,
	  totalPoints,
	  totalTakes: userTakes.length,
	  userTakes: userTakes,
	  userPacks: validPacks,
	  userExchanges,
	  achievementsValueTotal,
	  achievements,
	  tokensEarned,
	  tokensSpent,
      tokensBalance,
      tokensAwarded,
	  referralAwards,
	  creatorPacks,
	  creatorLeaderboard,
	  creatorLeaderboardUpdatedAt,
	});
  } catch (err) {
	console.error('[GET /api/profile/:profileID] Error:', err);
	return res.status(500).json({ success: false, error: 'Server error fetching profile' });
  }
}
