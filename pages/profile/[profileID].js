import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import PageContainer from "../../components/PageContainer";
import Toast from "../../components/Toast";

export default function ProfilePage() {
  const router = useRouter();
  const { profileID } = router.query;
  const { data: session } = useSession();

  const [profile, setProfile] = useState(null);
  const [userTakes, setUserTakes] = useState([]);
  const [userStats, setUserStats] = useState({ points: 0, wins: 0, losses: 0, pending: 0, pushes: 0 });
  const [userPacks, setUserPacks] = useState([]);
  const [creatorPacks, setCreatorPacks] = useState([]);
  const [creatorLeaderboard, setCreatorLeaderboard] = useState([]);
  const [creatorLeaderboardUpdatedAt, setCreatorLeaderboardUpdatedAt] = useState(null);
  const [allTimeRank, setAllTimeRank] = useState(null);
  const [tokensEarned, setTokensEarned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [referralAwards, setReferralAwards] = useState([]);
  const [awardBonuses, setAwardBonuses] = useState([]);
  // Notification preferences state (own profile only)
  const [notifLeagues, setNotifLeagues] = useState([]);
  const [availableLeagues, setAvailableLeagues] = useState([]);
  const [smsOptOutAll, setSmsOptOutAll] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [notifTeams, setNotifTeams] = useState([]);
  const [toastMessage, setToastMessage] = useState("");

  // Fetch the profile data
  useEffect(() => {
	if (!profileID) return;
	async function fetchProfile() {
	  try {
		const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}`);
		const data = await res.json();
		if (data.success) {
		  setProfile(data.profile);
          if (typeof data.tokensEarned === 'number') {
            setTokensEarned(Math.round(data.tokensEarned));
          } else {
            setTokensEarned(0);
          }
		  if (data.userTakes) {
			// Takes are already filtered server-side; sort and set
			const sortedTakes = data.userTakes.sort(
			  (a, b) => new Date(b.createdTime) - new Date(a.createdTime)
			);
			setUserTakes(sortedTakes);
			// Compute wins/losses/pushes and use server totalPoints
			const wins = sortedTakes.filter(t => (t.takeResult||'').toLowerCase() === 'won').length;
			const losses = sortedTakes.filter(t => (t.takeResult||'').toLowerCase() === 'lost').length;
			const pending = sortedTakes.filter(t => (t.takeResult||'').toLowerCase() === 'pending').length;
			const pushes = sortedTakes.filter(t => {
			  const r = (t.takeResult||'').toLowerCase();
			  return r === 'push' || r === 'pushed';
			}).length;
			setUserStats({ points: Math.round(data.totalPoints || 0), wins, losses, pending, pushes });
		  }
          setUserPacks(data.userPacks || []);
          setCreatorPacks(Array.isArray(data.creatorPacks) ? data.creatorPacks : []);
          setCreatorLeaderboard(Array.isArray(data.creatorLeaderboard) ? data.creatorLeaderboard : []);
          setCreatorLeaderboardUpdatedAt(data.creatorLeaderboardUpdatedAt || null);
          setReferralAwards(Array.isArray(data.referralAwards) ? data.referralAwards : []);
          setAwardBonuses(Array.isArray(data.awardBonuses) ? data.awardBonuses : []);
		  // Debug: Marketplace Taker Token bonuses summary
		  try {
			const awards = Array.isArray(data.referralAwards) ? data.referralAwards : [];
			console.log('[Profile] Marketplace Taker Token bonuses loaded', {
			  profileID,
			  count: awards.length,
			  examples: awards.slice(0, 3).map((r) => ({
				code: r?.code,
				name: r?.name,
				tokens: r?.tokens,
				hasUser: Boolean(r?.referredUser?.handle),
				hasTake: Boolean(r?.take),
				packFromCode: (typeof r?.code === 'string' && r.code.startsWith('ref5:')) ? (r.code.split(':')[1] || null) : null,
			  })),
			});
			const missing = awards.filter((r) => !(r && r.referredUser && r.take));
			if (missing.length > 0) {
			  console.warn('[Profile] Referral awards missing user or take', {
				missingCount: missing.length,
				codes: missing.slice(0, 5).map((r) => r?.code),
			  });
			}
		  } catch (e) {}
		} else {
		  setError(data.error || "Error loading profile");
		}
	  } catch (err) {
		console.error("Error fetching profile:", err);
		setError("Error fetching profile");
	  } finally {
		setLoading(false);
	  }
	}
	fetchProfile();
  }, [profileID]);

  // Fetch all-time rank from global leaderboard
  useEffect(() => {
    if (!profile?.profileID) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/leaderboard');
        const data = await res.json();
        if (!aborted && data?.success && Array.isArray(data.leaderboard)) {
          const idx = data.leaderboard.findIndex((row) => (
            row?.profileID === profile.profileID || (profile.profileMobile && row?.phone === profile.profileMobile)
          ));
          setAllTimeRank(idx >= 0 ? idx + 1 : null);
        }
      } catch (_) {
        if (!aborted) setAllTimeRank(null);
      }
    })();
    return () => { aborted = true; };
  }, [profile?.profileID, profile?.profileMobile]);

  // Load available leagues (from events) when viewing own profile
  useEffect(() => {
    if (!profileID || !session?.user || session.user.profileID !== profileID) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/eventLeagues');
        const data = await res.json();
        if (!aborted && data?.success && Array.isArray(data.leagues)) {
          setAvailableLeagues(data.leagues);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { aborted = true; };
  }, [profileID, session?.user?.profileID]);

  // Load current user's notification preferences
  useEffect(() => {
    if (!profileID || !session?.user || session.user.profileID !== profileID) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications/preferences');
        const data = await res.json();
        if (!aborted && data?.success) {
          setNotifLeagues(Array.isArray(data.leagues) ? data.leagues : []);
          setSmsOptOutAll(Boolean(data.smsOptOutAll));
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { aborted = true; };
  }, [profileID, session?.user?.profileID]);

  // Load current user's team-level subscriptions
  useEffect(() => {
    if (!profileID || !session?.user || session.user.profileID !== profileID) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications/teamPreferences');
        const data = await res.json();
        if (!aborted && data?.success) {
          setNotifTeams(Array.isArray(data.teams) ? data.teams : []);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { aborted = true; };
  }, [profileID, session?.user?.profileID]);

  // calculateUserStats is no longer needed; stats computed inline after fetch
  if (loading) return <div className="p-4">Loading profile...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!profile) return <div className="p-4">Profile not found.</div>;
  const isOwnProfile = session?.user && session.user.profileID === profile.profileID;
  const packMap = userPacks.reduce((map, pack) => { map[pack.packID] = pack; return map; }, {});
  const totalDecisions = (userStats?.wins || 0) + (userStats?.losses || 0);
  const winningPer = totalDecisions > 0 ? ((userStats.wins / totalDecisions) * 100) : 0;

  // Computed Rating (0-10): starts at 5.00 for new users (0 decisions)
  const winsCount = userStats?.wins || 0;
  const decisions = winsCount + (userStats?.losses || 0);
  const winPct = decisions > 0 ? (winsCount / decisions) : 0.5; // neutral when no data
  const avgPtsPerDecision = decisions > 0 ? (userStats.points / decisions) : 0;
  const pointsNorm = Math.min(avgPtsPerDecision / 20, 1); // saturate around 20 pts/decision
  const confidence = 1 - Math.exp(-(decisions || 0) / 20); // grows with more takes
  const baseScore = 5;
  const variation = ((winPct - 0.5) * 6) + ((pointsNorm - 0.5) * 4);
  const rating = Math.max(0, Math.min(10, baseScore + confidence * variation));

  // Build team filter options from takes (PG: teamSlugs/teamNames; fallback: parse matchup)
  const normalizeKey = (v) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const extractMatchupTeams = (matchup) => {
    if (!matchup || typeof matchup !== 'string') return [];
    const parts = matchup.split(/\s+vs\.?\s+|\s+@\s+|\s+v\s+/i).map(s => s.trim()).filter(Boolean);
    return parts.length === 2 ? parts : [];
  };
  const teamOptionsMap = new Map();
  for (const t of userTakes) {
    const fromSlugs = Array.isArray(t.teamSlugs) ? t.teamSlugs.filter(Boolean) : [];
    const fromNames = Array.isArray(t.teamNames) ? t.teamNames.filter(Boolean) : [];
    if (fromSlugs.length || fromNames.length) {
      for (let i = 0; i < Math.max(fromSlugs.length, fromNames.length); i++) {
        const slug = fromSlugs[i] || null;
        const name = fromNames[i] || null;
        const key = slug ? normalizeKey(slug) : (name ? normalizeKey(name) : null);
        const label = name || slug || null;
        if (key && label && !teamOptionsMap.has(key)) teamOptionsMap.set(key, label);
      }
    } else if (t.propEventMatchup) {
      const names = extractMatchupTeams(t.propEventMatchup);
      for (const name of names) {
        const key = normalizeKey(name);
        if (key && name && !teamOptionsMap.has(key)) teamOptionsMap.set(key, name);
      }
    }
  }
  const teamOptions = Array.from(teamOptionsMap.entries()).map(([key, label]) => ({ key, label }));
  const filteredTakes = userTakes.filter((t) => {
    if (!teamFilter) return true;
    const keys = new Set();
    if (Array.isArray(t.teamSlugs)) t.teamSlugs.forEach((s) => { if (s) keys.add(normalizeKey(s)); });
    if (Array.isArray(t.teamNames)) t.teamNames.forEach((n) => { if (n) keys.add(normalizeKey(n)); });
    if (keys.size === 0 && t.propEventMatchup) {
      extractMatchupTeams(t.propEventMatchup).forEach((n) => keys.add(normalizeKey(n)));
    }
    return keys.has(teamFilter);
  });

  return (
    <PageContainer>
	  {/* Profile Header */}
	  <div className="flex items-center justify-between mb-4">
		<div className="flex items-center gap-3">
		  <h2 className="text-2xl font-bold">
			{isOwnProfile ? "Your Profile" : "User Profile"}
		  </h2>
		  {profile?.isCreator && (
			<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
			  <span role="img" aria-label="sparkles">✨</span>
			  Influencer
			</span>
		  )}
		</div>
		{isOwnProfile && (
		  <button
			onClick={() => signOut({ callbackUrl: "/?logout=1" })}
			className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded"
		  >
			Log Out
		  </button>
		)}
	  </div>

	  {/* Favorite Team */}
	  {profile.profileTeamData ? (
		<div className="mb-4 text-sm text-gray-700">
		  <span className="font-semibold block mb-1">Favorite Team:</span>
		  <p className="font-medium">
			{profile.profileTeamData.teamName || "Team not set"}
		  </p>
		</div>
	  ) : (
		<p className="mb-4 text-sm text-gray-700">No favorite team selected.</p>
	  )}

      {/* Award Bonuses (promo card redemptions) */}
      {Array.isArray(awardBonuses) && awardBonuses.length > 0 && (
        <div className="mt-6 border rounded p-4 bg-white">
          <h3 className="text-xl font-bold mb-2">Bonuses</h3>
          <p className="text-sm text-gray-600 mb-3">Promo card bonuses you’ve received.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Redeemed</th>
                </tr>
              </thead>
              <tbody>
                {awardBonuses.map((b, idx) => (
                  <tr key={`${b.code || 'bonus'}-${idx}`} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{b.name || b.code || 'Bonus'}</td>
                    <td className="py-2 pr-4">{b.tokens}</td>
                    <td className="py-2 pr-4">{b.redeemedAt ? new Date(b.redeemedAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscriptions (own profile only) */}
      {isOwnProfile && (
        <div className="mt-6 border rounded p-4 bg-white">
          <h3 className="text-xl font-bold mb-2">Subscriptions</h3>
          <p className="text-sm text-gray-600 mb-3">Get SMS when packs open by league or specific teams.</p>
          <div className="mb-3 flex items-center gap-2">
            <input
              id="sms-pause-all"
              type="checkbox"
              className="w-4 h-4"
              checked={smsOptOutAll}
              onChange={(e) => setSmsOptOutAll(e.target.checked)}
            />
            <label htmlFor="sms-pause-all" className="text-sm">Pause all SMS</label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {availableLeagues.map((lg) => {
              const id = `lg-${lg}`;
              const checked = notifLeagues.includes(lg);
              return (
                <label key={lg} htmlFor={id} className={`flex items-center gap-2 border rounded px-2 py-1 text-sm ${smsOptOutAll ? 'opacity-50' : ''}`}>
                  <input
                    id={id}
                    type="checkbox"
                    className="w-4 h-4"
                    disabled={smsOptOutAll}
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) setNotifLeagues((prev) => Array.from(new Set([...prev, lg])));
                      else setNotifLeagues((prev) => prev.filter((x) => x !== lg));
                    }}
                  />
                  <span className="uppercase">{lg}</span>
                </label>
              );
            })}
          </div>
          {Array.isArray(notifTeams) && notifTeams.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium text-gray-700 mb-1">Followed Teams</div>
              <div className="flex flex-wrap gap-2">
                {notifTeams.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-2 border rounded px-2 py-1 text-xs bg-gray-50">
                    <span className="uppercase text-gray-600">{t.league}</span>
                    <span className="text-gray-800">{t.abv || t.teamSlug || t.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3">
            <button
              type="button"
              disabled={savingPrefs}
              onClick={async () => {
                try {
                  setSavingPrefs(true);
                  const res = await fetch('/api/notifications/preferences', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: 'pack_open', leagues: notifLeagues, smsOptOutAll }),
                  });
                  const data = await res.json();
                  if (!data?.success) throw new Error(data?.error || 'Save failed');
                  setToastMessage('Preferences saved');
                } catch (e) {
                  try { console.error('Save preferences error', e); } catch {}
                  setToastMessage('Failed to save preferences');
                } finally {
                  setSavingPrefs(false);
                }
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              {savingPrefs ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

	  {/* Profile Avatar */}
	  {profile.profileAvatar && profile.profileAvatar[0]?.url && (
		<div className="mb-4 text-center">
		  <Image
			src={profile.profileAvatar[0].url}
			alt="Profile Avatar"
			width={120}
			height={120}
			className="rounded-full mx-auto"
		  />
		</div>
	  )}

	  {/* Basic Profile Details */}
	  <p>
		<strong>Profile ID:</strong> {profile.profileID}
	  </p>
	  <p>
		<strong>Mobile:</strong> {profile.profileMobile}
	  </p>
	  <p>
		<strong>Username:</strong> {profile.profileID}
	  </p>
	  <p>
		<strong>Created:</strong> {profile.createdTime}
	  </p>

	  {/* Quick Stats */}
	  <h3 className="text-xl font-bold mt-6 mb-2">Quick Stats</h3>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <div className="border rounded p-4 text-center">
          <span className="text-2xl font-bold">{rating.toFixed(2)}</span>
          <div className="text-sm text-gray-600 mt-1">Rating</div>
        </div>
		<div className="border rounded p-4 text-center">
		  <span className="text-2xl font-bold">{userStats.points}</span>
		  <div className="text-sm text-gray-600 mt-1">Points</div>
		</div>
		<div className="border rounded p-4 text-center">
		  <span className="text-2xl font-bold">{`${userStats.wins}-${userStats.losses}-${userStats.pushes}`}</span>
		  <div className="text-sm text-gray-600 mt-1">Record (W-L-P)</div>
		</div>
		<div className="border rounded p-4 text-center">
		  <span className="text-2xl font-bold">{allTimeRank ? `#${allTimeRank}` : '—'}</span>
		  <div className="text-sm text-gray-600 mt-1">All-time Rank</div>
		</div>
        <div className="border rounded p-4 text-center">
          <span className="text-2xl font-bold">{winningPer.toFixed(1)}%</span>
          <div className="text-sm text-gray-600 mt-1">Winning PER</div>
        </div>
        <div className="border rounded p-4 text-center">
          <span className="text-2xl font-bold">{tokensEarned}</span>
          <div className="text-sm text-gray-600 mt-1">Tokens</div>
        </div>
      </div>

	  {/* Created Packs */}
	  {Array.isArray(creatorPacks) && creatorPacks.length > 0 && (
	    <div className="mt-8">
	      <h3 className="text-xl font-bold mb-2">Created Packs</h3>
	      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
	        {creatorPacks.map((p) => (
	          <Link key={p.packID} href={`/packs/${encodeURIComponent(p.packURL || p.packID)}`} legacyBehavior>
	            <a className="block border rounded overflow-hidden bg-white hover:shadow">
	              <div className="w-full aspect-square relative bg-gray-100">
	                {/* eslint-disable-next-line @next/next/no-img-element */}
	                {p.packCover ? (
	                  <img src={Array.isArray(p.packCover) ? (p.packCover[0]?.url || '') : p.packCover} alt="Pack cover" className="absolute inset-0 w-full h-full object-cover" />
	                ) : (
	                  <div className="absolute inset-0 w-full h-full flex items-center justify-center text-xs text-gray-500">No Cover</div>
	                )}
	              </div>
	              <div className="p-3">
	                <div className="font-medium truncate">{p.packTitle || p.packURL || 'Untitled Pack'}</div>
	                <div className="text-xs text-gray-600 mt-1">{p.packStatus || ''}</div>
	                {p.eventTime && (
	                  <div className="text-xs text-gray-600">{new Date(p.eventTime).toLocaleString()}</div>
	                )}
	              </div>
	            </a>
	          </Link>
	        ))}
	      </div>
	    </div>
	  )}

	  {/* Creator All-time Leaderboard */}
	  {Array.isArray(creatorLeaderboard) && creatorLeaderboard.length > 0 && (
	    <div className="mt-8">
	      <h3 className="text-xl font-bold mb-2">All-time leaderboard (their packs)</h3>
	      <div className="flex items-center justify-between mb-2">
	        {creatorLeaderboardUpdatedAt ? (
	          <div className="text-xs text-gray-600">Last updated: {new Date(creatorLeaderboardUpdatedAt).toLocaleString()}</div>
	        ) : <div />}
	        <button
	          type="button"
	          className="text-xs text-blue-600 underline"
	          onClick={async () => {
	            try {
	              const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}?refresh=1`);
	              const data = await res.json();
	              if (data.success) {
	                setCreatorLeaderboard(Array.isArray(data.creatorLeaderboard) ? data.creatorLeaderboard : []);
	                setCreatorLeaderboardUpdatedAt(data.creatorLeaderboardUpdatedAt || null);
	              }
	            } catch {}
	          }}
	        >
	          Refresh now
	        </button>
	      </div>
	      <div className="overflow-x-auto">
	        <table className="min-w-full bg-white">
	          <thead>
	            <tr>
	              <th className="px-4 py-2 text-left">Rank</th>
	              <th className="px-4 py-2 text-left">User</th>
	              <th className="px-4 py-2 text-left">Bones</th>
	              <th className="px-4 py-2 text-left">W-L-P</th>
	              <th className="px-4 py-2 text-left">Takes</th>
	            </tr>
	          </thead>
	          <tbody>
	            {creatorLeaderboard.map((row, idx) => (
	              <tr key={row.phone || idx}>
	                <td className="border px-4 py-2">{idx + 1}</td>
	                <td className="border px-4 py-2">{row.phone}</td>
	                <td className="border px-4 py-2">{Math.round(row.points)}</td>
	                <td className="border px-4 py-2">{row.won}-{row.lost}-{row.pushed}</td>
	                <td className="border px-4 py-2">{row.takes}</td>
	              </tr>
	            ))}
	          </tbody>
	        </table>
	      </div>
	    </div>
	  )}

      {/* Referral Awards */}
      {Array.isArray(referralAwards) && referralAwards.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-bold mb-2">Marketplace Taker Token bonuses</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">Pack</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Take</th>
                  <th className="px-4 py-2 text-left">Tokens</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">View</th>
                </tr>
              </thead>
              <tbody>
                {referralAwards.map((row) => {
                  let packUrl = '';
                  if (typeof row.code === 'string' && row.code.startsWith('ref5:')) {
                    const parts = row.code.split(':');
                    // Format: ref5:<packURL>[:<referredProfileID>]
                    packUrl = parts[1] || '';
                  }
                  const href = packUrl ? `/packs/${encodeURIComponent(packUrl)}` : null;
                  const receiptHref = (packUrl && row.take?.id)
                    ? `/packs/${encodeURIComponent(packUrl)}/${encodeURIComponent(row.take.id)}`
                    : null;
                  return (
                    <tr key={`${row.code}-${row.redeemedAt}`}>
                      <td className="border px-4 py-2">
                        {href ? (
                          <Link href={href} className="text-blue-600 underline">{packUrl}</Link>
                        ) : (
                          packUrl || row.name || row.code
                        )}
                      </td>
                      <td className="border px-4 py-2">{row.referredUser?.handle || '—'}</td>
                      <td className="border px-4 py-2">
                        {row.take ? (
                          <span>
                            {(row.take.propShort || row.take.propSummary || 'Take')} {row.take.side ? `(${row.take.side})` : ''}
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="border px-4 py-2">+{row.tokens}</td>
                      <td className="border px-4 py-2">{row.redeemedAt ? new Date(row.redeemedAt).toLocaleString() : ''}</td>
                      <td className="border px-4 py-2">
                        {receiptHref ? (
                          <Link href={receiptHref} className="text-blue-600 underline">View takes</Link>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Takes Table */}
      <div className="mt-6 mb-2 flex items-center justify-between">
        <h3 className="text-xl font-bold">Your Takes</h3>
        {teamOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Team</label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white"
            >
              <option value="">All Teams</option>
              {teamOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {userTakes.length === 0 ? (
        <p>No takes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Event</th>
                <th className="px-4 py-2 text-left">Pack</th>
                <th className="px-4 py-2 text-left">Points</th>
                <th className="px-4 py-2 text-left">Tokens</th>
                <th className="px-4 py-2 text-left">Result</th>
                <th className="px-4 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredTakes.map((take) => (
                <tr key={take.takeID}>
                  <td className="border px-4 py-2">{take.propShort || take.takeTitle || take.propTitle || take.propID}</td>
                  <td className="border px-4 py-2">
                    {take.propLeague && take.propESPN ? (
                      <a
                        href={`https://www.espn.com/${take.propLeague}/game/_/gameId/${take.propESPN}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-blue-600"
                      >
                        {take.propEventMatchup}
                      </a>
                    ) : (
                      take.propEventMatchup || 'N/A'
                    )}
                  </td>
                  <td className="border px-4 py-2">
                    {take.packIDs && take.packIDs.length > 0 ? (
                      <span>
                        {take.packIDs.map((pid, idx) => {
                          const pk = packMap[pid];
                          const label = pk ? (pk.packTitle || pk.packURL || pid) : pid;
                          const href = pk && (pk.packURL || pk.packID)
                            ? `/packs/${encodeURIComponent(pk.packURL || pk.packID)}`
                            : null;
                          return (
                            <span key={`${pid}-${idx}`}>
                              {idx > 0 ? ', ' : null}
                              {href ? (
                                <Link href={href} className="text-blue-600 underline">{label}</Link>
                              ) : (
                                label
                              )}
                            </span>
                          );
                        })}
                      </span>
                    ) : 'N/A'}
                  </td>
                  <td className="border px-4 py-2">{Math.round(take.takePTS)}</td>
                  <td className="border px-4 py-2">{Math.round(take.takeTokens || (take.takePTS ? take.takePTS * 0.05 : 0))}</td>
                  <td className="border px-4 py-2">
                    {(() => {
                      const result = take.propStatus === 'closed' ? 'Pending' : take.takeResult;
                      const rLower = result.toLowerCase();
                      let classes = 'bg-gray-100 text-gray-800';
                      if (rLower === 'won') classes = 'bg-green-100 text-green-800';
                      else if (rLower === 'lost') classes = 'bg-red-100 text-red-800';
                      else if (rLower === 'pending') classes = 'bg-yellow-100 text-yellow-800';
                      else if (rLower === 'push' || rLower === 'pushed') classes = 'bg-teal-100 text-teal-800';
                      return (
                        <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${classes}`}>
                          {result}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="border px-4 py-2">{new Date(take.createdTime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

	  <p className="mt-4">
		<Link href="/" className="underline text-blue-600">
		  Back to Home
		</Link>
	  </p>
      <Toast message={toastMessage} onClose={() => setToastMessage("")} />
    </PageContainer>
  );
}

function PrizeCard({ prize }) {
  return (
	<div className="border rounded shadow-sm bg-white p-4">
	  {prize.prizeIMGs && prize.prizeIMGs.length > 0 && (
		<img
		  src={prize.prizeIMGs[0].url}
		  alt={`Prize ${prize.prizeTitle}`}
		  className="w-full h-32 object-cover rounded mb-2"
		/>
	  )}
	  <h2 className="text-lg font-semibold">{prize.prizeTitle}</h2>
	  <p className="text-sm text-gray-600">
		Points Required: <strong>{prize.prizePTS}</strong>
	  </p>
	  <p className="mt-2">
		<Link
		  href={`/prizes/${encodeURIComponent(prize.prizeID)}`}
		  className="inline-block text-blue-600 underline text-sm"
		>
		  View Details
		</Link>
	  </p>
	</div>
  );
}
