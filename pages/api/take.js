// File: /pages/api/take.js

import { getToken } from "next-auth/jwt";
import { createRepositories } from "../../lib/dal/factory";
import { query } from "../../lib/db/postgres";
import { getCurrentUser } from "../../lib/auth";

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

    // 7.5) If this came from a shared link, auto-award +5 tokens to the referrer once per pack
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
        const isSelfRef = String(takeRef) && String(takeRef) === String(ensuredProfile.profile_id || '');
        if (!isSelfRef) {
          // Need packURL for scoping the award code
          let packURL = null;
          try {
            // Fetch packURL via prop -> pack_id
            const prop = await props.getByPropID(propID);
            if (prop?.Packs && prop.Packs.length) {
              const packRow = await query('SELECT pack_url FROM packs WHERE id = $1 LIMIT 1', [prop.Packs[0]]);
              packURL = packRow?.rows?.[0]?.pack_url || null;
            }
          } catch {}
          if (packURL) {
            const code = `ref5:${packURL}`;
            // Ensure award card exists with +5 tokens
            try {
              await query(
                `INSERT INTO award_cards (code, name, tokens, status)
                 VALUES ($1, $2, $3, 'available')
                 ON CONFLICT (code) DO NOTHING`,
                [code, `Referral bonus for ${packURL}`, 5]
              );
            } catch {}
            // Redeem for the referrer (profile in takeRef) if not already redeemed
            try {
              const { rows: refRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [takeRef]);
              const refProfileRowId = refRows?.[0]?.id || null;
              if (refProfileRowId) {
                await awards.redeemAvailableByCode(code, refProfileRowId);
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
