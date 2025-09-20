// File: /pages/api/take.js

import { getToken } from "next-auth/jwt";
import { createRepositories } from "../../lib/dal/factory";
import { query } from "../../lib/db/postgres";
import { getCurrentUser } from "../../lib/auth";
import { sendSMS } from "../../lib/twilioService";

export default async function handler(req, res) {
  console.log("[/api/take] Received request with method:", req.method);

  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // 1) Validate user
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  console.log("[/api/take] Authenticated user:", { phone: currentUser.phone, backend: currentUser.backend });

  // 2) Extract propID and propSide (receiptId optional) from request body
  const { propID, propSide, receiptId } = req.body;
  if (!propID || !propSide) {
    return res.status(400).json({
      success: false,
      error: "Missing propID or propSide",
    });
  }

  // Determine if this take is part of a share by inspecting the referer URL
  const refHeader = req.headers.referer || req.headers.referrer || "";
  const isShared = refHeader.includes("?ref=");
  // Extract takeRef from the referer query if present (e.g., /packs/slug?ref=abcd123)
  let takeRef = null;
  try {
    const refUrl = new URL(refHeader);
    takeRef = refUrl.searchParams.get("ref");
  } catch {}
  console.log(
    `[ /api/take ] ${isShared ? "🎯 Shared submission detected" : "📦 Standard submission"}` +
      ` -> propID=${propID}, receiptId=${receiptId}`
  );

  try {
    const { props, takes, profiles, packs, awards } = createRepositories();
	// 3) Find the matching Prop record by propID
	const propRec = await props.getByPropID(propID);
	if (!propRec) {
	  return res.status(404).json({
		success: false,
		error: `Prop not found for propID="${propID}"`,
	  });
	}

	const propStatus = propRec.propStatus || "open";
	// Collect linked teams from the Prop record
	const teams = Array.isArray(propRec.Teams) ? propRec.Teams : [];
	if (propStatus !== "open") {
	  return res.status(400).json({
		success: false,
		error: `Prop is ${propStatus}, not open.`,
	  });
	}


	// 6) Calculate popularity of the chosen side before adding the new take
	const counts = await takes.countBySides(propID);
	const sideACount = counts.A || 0;
	const sideBCount = counts.B || 0;
	const totalCount = sideACount + sideBCount;
	const chosenCount = propSide === "A" ? sideACount : sideBCount;
	const takePopularity = totalCount > 0 ? chosenCount / totalCount : 0.5;

	// 7) Ensure a profile exists for this phone and capture its ID (backend-agnostic)
	const ensuredProfile = await profiles.ensureByPhone(currentUser.phone);
	const profileRecId = ensuredProfile?.id || null;
	const packLinks = propRec.Packs || [];
	console.log("📦📝 [api/take] Submitting take:", { propID, propSide, phone: currentUser.phone, receiptId, packLinks, teams, takePopularity });
	const takeFields = {
	  propID,
	  propSide,
	  takeMobile: currentUser.phone,
	  takeStatus: "latest",
	  Prop: [propRec.id],    // link to the Prop record
	  Profile: [profileRecId], // link to the user's Profile record
	  takeLivePopularity: takePopularity,
	  // Link the same teams to the Take record
	  Teams: teams,
	};
	// Include receiptID if provided
	if (receiptId) takeFields.receiptID = receiptId;
	// Include takeRef if present in referer URL
	if (takeRef) takeFields.takeRef = takeRef;
    const newTakeID = await takes.createLatestTake({ propID, propSide, phone: currentUser.phone, profileId: ensuredProfile?.id, fields: takeFields });

    // 7.5) If this came from a shared link, auto-award +5 tokens to the referrer per referred user per pack
    try {
      if (takeRef && ensuredProfile?.id) {
        // Prevent self-award when ref equals current user's profile_id
        const selfProfileId = ensuredProfile.profile_id || null;
        if (!selfProfileId) {
          // Resolve profile_id string if not on ensuredProfile
          try {
            const { rows } = await query('SELECT profile_id FROM profiles WHERE id = $1 LIMIT 1', [ensuredProfile.id]);
            if (rows.length) {
              // eslint-disable-next-line no-param-reassign
              ensuredProfile.profile_id = rows[0].profile_id;
            }
          } catch {}
        }
        const takerProfileIdStr = String(ensuredProfile.profile_id || '');
        const isSelfRef = String(takeRef) && String(takeRef) === takerProfileIdStr;
        if (!isSelfRef) {
          // Need packURL for scoping the award code
          let packURL = null;
          let packTitle = null;
          try {
            // Fetch packURL via prop -> pack_id
            const prop = await props.getByPropID(propID);
            if (prop?.Packs && prop.Packs.length) {
              const packRow = await query('SELECT pack_url, title FROM packs WHERE id = $1 LIMIT 1', [prop.Packs[0]]);
              packURL = packRow?.rows?.[0]?.pack_url || null;
              packTitle = packRow?.rows?.[0]?.title || null;
            }
          } catch {}
          if (packURL) {
            // Build a per-pack-per-referred-user award code so referrer can earn once per referred user
            // Format: ref5:<packURL>:<referredProfileID>
            const code = `ref5:${packURL}:${takerProfileIdStr}`;
            // Ensure award card exists with +5 tokens (available for many users to redeem one time each)
            try {
              await query(
                `INSERT INTO award_cards (code, name, tokens, status)
                 VALUES ($1, $2, $3, 'available')
                 ON CONFLICT (code) DO NOTHING`,
                [code, `Referral bonus for ${packURL} (by ${takerProfileIdStr})`, 5]
              );
            } catch {}
            // Redeem for the referrer (profile in takeRef) if not already redeemed
            try {
              const { rows: refRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [takeRef]);
              const refProfileRowId = refRows?.[0]?.id || null;
              if (refProfileRowId) {
                const awardResult = await awards.redeemAvailableByCode(code, refProfileRowId);
                // If newly redeemed (not already redeemed), notify the referrer via SMS (respect opt-out)
                if (awardResult && !awardResult.alreadyRedeemed) {
                  try {
                    const { rows: phoneRows } = await query(
                      `SELECT mobile_e164 AS phone, COALESCE(sms_opt_out_all, FALSE) AS opted_out FROM profiles WHERE id = $1 LIMIT 1`,
                      [refProfileRowId]
                    );
                    const refPhone = phoneRows?.[0]?.phone || null;
                    const refOptedOut = Boolean(phoneRows?.[0]?.opted_out);
                    if (refPhone && !refOptedOut) {
                      // Resolve display name for taker
                      let takerDisplay = takerProfileIdStr || 'A user';
                      try {
                        const { rows: takerRows } = await query(`SELECT COALESCE(NULLIF(username, ''), profile_id) AS handle FROM profiles WHERE id = $1 LIMIT 1`, [ensuredProfile.id]);
                        if (takerRows?.[0]?.handle) takerDisplay = takerRows[0].handle;
                      } catch {}
                      const packLabel = packTitle || packURL;
                      const message = `${takerDisplay} just made their takes on the pack ${packLabel}`;
                      // Create outbox record and recipient, then send and update status
                      let outboxId = null;
                      try {
                        const initLog = [{ at: new Date().toISOString(), level: 'info', message: 'created', details: { route: 'api/take referral_sms', packURL, code } }];
                        const { rows: obRows } = await query(
                          `INSERT INTO outbox (message, status, logs) VALUES ($1, 'ready', $2::jsonb) RETURNING id`,
                          [message, JSON.stringify(initLog)]
                        );
                        outboxId = obRows[0]?.id || null;
                        if (outboxId) {
                          await query(`INSERT INTO outbox_recipients (outbox_id, profile_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [outboxId, refProfileRowId]);
                        }
                      } catch (obErr) {
                        try { console.warn('[api/take] outbox create failed =>', obErr?.message || obErr); } catch {}
                      }

                      try {
                        await sendSMS({ to: refPhone, message });
                        if (outboxId) {
                          await query(`UPDATE outbox SET status = 'sent', logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb WHERE id = $1`, [outboxId, JSON.stringify([{ at: new Date().toISOString(), level: 'info', message: 'twilio sent', details: { to: refPhone } }])]);
                        }
                      } catch (smsErr) {
                        try { console.warn('[api/take] SMS to referrer failed =>', smsErr?.message || smsErr); } catch {}
                        if (outboxId) {
                          await query(`UPDATE outbox SET status = 'error', logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb WHERE id = $1`, [outboxId, JSON.stringify([{ at: new Date().toISOString(), level: 'error', message: 'twilio error', details: { error: String(smsErr?.message || smsErr) } }])]);
                        }
                      }
                    }
                  } catch (phErr) {
                    try { console.warn('[api/take] Could not resolve referrer phone =>', phErr?.message || phErr); } catch {}
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      // Non-fatal: continue even if award flow fails
      // eslint-disable-next-line no-console
      console.warn('[api/take] referral award attempt failed', e?.message || e);
    }

	// 8) Compute dynamic side counts for this prop
	const recount = await takes.countBySides(propID);
	let sideACount2 = recount.A || 0;
	let sideBCount2 = recount.B || 0;

	// Return success with updated dynamic counts
	return res.status(200).json({
	  success: true,
	  newTakeID,
	  sideACount: sideACount2,
	  sideBCount: sideBCount2,
	});
  } catch (err) {
	console.error("[/api/take] Exception:", err);
	return res.status(500).json({
	  success: false,
	  error: err.message || "Error creating take",
	});
  }
}
