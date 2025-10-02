import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import GlobalModal from './GlobalModal';
import { useModal } from '../../contexts/ModalContext';

export default function AwardClaimModal({ isOpen, onClose, code, previewState = '' }) {
  const { data: session } = useSession();
  const { openModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { name, tokens, status, redirectTeamSlug, imageUrl, requirementKey, requirementTeamSlug, requirementTeamName }
  const [checking, setChecking] = useState(false);
  const [followStatus, setFollowStatus] = useState(null); // { followsTeam: boolean } or null
  const [smsConsent, setSmsConsent] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/awards/preview?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || !data.success) {
          setError(data.error || 'Invalid code');
        } else {
          setPreview({ name: data.name, tokens: data.tokens, status: data.status, redirectTeamSlug: data.redirectTeamSlug || null, imageUrl: data.imageUrl || null, requirementKey: data.requirementKey || null, requirementTeamSlug: data.requirementTeamSlug || null, requirementTeamName: data.requirementTeamName || null });
        }
      } catch (err) {
        if (!mounted) return;
        setError('Could not load award');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (isOpen && code) load();
    return () => { mounted = false; };
  }, [isOpen, code]);

  // If user is logged in and already redeemed this code, skip straight to success modal
  useEffect(() => {
    let mounted = true;
    async function check() {
      // Skip check if preview simulates not logged in
      if (!isOpen || !code) return;
      const isPreviewNotLogged = previewState === 'not_logged_not_following';
      if (isPreviewNotLogged) return;
      // Simulate logged in for preview when needed by short-circuiting session
      if (!session?.user && (previewState === 'logged_not_following' || previewState === 'logged_following')) {
        return; // don't fetch check since there's no real session; rely on UI state below
      }
      setChecking(true);
      try {
        const res = await fetch(`/api/awards/check?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!mounted) return;
        if (res.ok && data?.success && data?.already) {
          // Reuse preview data if present for name/tokens redirect. Fallbacks for safety.
          const name = preview?.name || 'Bonus';
          const tokens = preview?.tokens || 0;
          const redirectTeamSlug = preview?.redirectTeamSlug || null;
          const imageUrl = preview?.imageUrl || null;
          openModal('awardSuccess', { name, tokens, redirectTeamSlug, imageUrl });
        }
      } catch {}
      finally {
        if (mounted) setChecking(false);
      }
    }
    check();
    return () => { mounted = false; };
  }, [isOpen, code, session, preview, openModal, previewState]);

  // Fetch follow status for required team when preview available and user logged in
  useEffect(() => {
    let mounted = true;
    async function fetchFollow() {
      const isPreviewNotLogged = previewState === 'not_logged_not_following';
      if (!isOpen || !preview?.requirementTeamSlug || (!session?.user && !previewState) || isPreviewNotLogged) {
        setFollowStatus(null);
        return;
      }
      if (previewState === 'logged_following') {
        setFollowStatus({ followsTeam: true });
        return;
      }
      if (previewState === 'logged_not_following') {
        setFollowStatus({ followsTeam: false });
        return;
      }
      try {
        const res = await fetch(`/api/follow/status?teamSlug=${encodeURIComponent(preview.requirementTeamSlug)}`);
        const data = await res.json();
        if (!mounted) return;
        if (res.ok && data?.success) setFollowStatus({ followsTeam: !!data.followsTeam });
        else setFollowStatus({ followsTeam: false });
      } catch {
        if (mounted) setFollowStatus({ followsTeam: false });
      }
    }
    fetchFollow();
    return () => { mounted = false; };
  }, [isOpen, preview, session, previewState]);

  const handleClaim = useCallback(async () => {
    if (!preview || preview.status !== 'available') return;
    if (!session?.user) {
      openModal('login', {
        title: 'Log in to claim',
        ctaLabel: 'Verify & Claim',
        onSuccess: async () => {
          try {
            // First, check if already redeemed for this user
            const chk = await fetch(`/api/awards/check?code=${encodeURIComponent(code)}`);
            const chkJson = await chk.json();
            if (chk.ok && chkJson?.success && chkJson?.already) {
              const name = preview?.name || 'Bonus';
              const tokens = preview?.tokens || 0;
              const redirectTeamSlug = preview?.redirectTeamSlug || null;
              const imageUrl = preview?.imageUrl || null;
              openModal('awardSuccess', { name, tokens, redirectTeamSlug, imageUrl });
              return;
            }

            // Otherwise, attempt to redeem now that user is logged in
            const res = await fetch('/api/awards/redeem', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              openModal('awardSuccess', { name: data.name, tokens: data.tokens, redirectTeamSlug: data.redirectTeamSlug || preview?.redirectTeamSlug || null, imageUrl: data.imageUrl || preview?.imageUrl || null });
            } else {
              if (data?.code === 'requirement_follow_team') {
                openModal('favoriteTeam', {
                  onTeamSelected: async () => {
                    try {
                      // If requirement specifies a team, set it directly before retry
                      if (preview?.requirementTeamSlug) {
                        await fetch('/api/profile/updateFavoriteTeam', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ teamSlug: preview.requirementTeamSlug }),
                        });
                      }
                      const retry = await fetch('/api/awards/redeem', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code }),
                      });
                      const retryJson = await retry.json();
                      if (retry.ok && retryJson.success) {
                        openModal('awardSuccess', { name: retryJson.name, tokens: retryJson.tokens, redirectTeamSlug: retryJson.redirectTeamSlug || preview?.redirectTeamSlug || null, imageUrl: retryJson.imageUrl || preview?.imageUrl || null });
                      } else {
                        openModal('awardSuccess', { name: preview?.name || 'Bonus', tokens: 0, error: retryJson.error || 'Could not claim', imageUrl: preview?.imageUrl || null });
                      }
                    } catch {
                      openModal('awardSuccess', { name: preview?.name || 'Bonus', tokens: 0, error: 'Could not claim', imageUrl: preview?.imageUrl || null });
                    }
                  }
                });
              } else {
                openModal('awardSuccess', { name: preview?.name || 'Bonus', tokens: 0, error: data.error || 'Could not claim', imageUrl: preview?.imageUrl || null });
              }
            }
          } catch {
            openModal('awardSuccess', { name: preview?.name || 'Bonus', tokens: 0, error: 'Could not claim', imageUrl: preview?.imageUrl || null });
          }
        },
      });
      return;
    }
    try {
      const res = await fetch('/api/awards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
        if (res.ok && data.success) {
        openModal('awardSuccess', { name: data.name, tokens: data.tokens, redirectTeamSlug: data.redirectTeamSlug || preview.redirectTeamSlug || null, imageUrl: data.imageUrl || preview.imageUrl || null });
      } else {
        if (data?.code === 'requirement_follow_team') {
          openModal('favoriteTeam', {
            onTeamSelected: async () => {
              try {
                if (preview?.requirementTeamSlug) {
                  await fetch('/api/profile/updateFavoriteTeam', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamSlug: preview.requirementTeamSlug }),
                  });
                }
                const retry = await fetch('/api/awards/redeem', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code }),
                });
                const retryJson = await retry.json();
                if (retry.ok && retryJson.success) {
                  openModal('awardSuccess', { name: retryJson.name, tokens: retryJson.tokens, redirectTeamSlug: retryJson.redirectTeamSlug || preview?.redirectTeamSlug || null, imageUrl: retryJson.imageUrl || preview?.imageUrl || null });
                } else {
                  setError(retryJson.error || 'Could not claim');
                }
              } catch {
                setError('Could not claim');
              }
            }
          });
        } else {
          setError(data.error || 'Could not claim');
        }
      }
    } catch (err) {
      setError('Could not claim');
    }
  }, [session, preview, openModal, code]);

  const followRequiredTeamAndRedeem = useCallback(async () => {
    if (!preview || preview.status !== 'available' || preview.requirementKey !== 'follow_team' || !preview.requirementTeamSlug) return;
    const teamSlug = preview.requirementTeamSlug;
    // If not logged in, prompt login first, then follow and redeem
    if (!session?.user) {
      openModal('login', {
        title: 'Log in to follow',
        ctaLabel: 'Verify & Follow',
        onSuccess: async () => {
          try {
            await fetch('/api/profile/updateFavoriteTeam', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ teamSlug }),
            });
          } catch {}
          try {
            const res = await fetch('/api/awards/redeem', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              openModal('awardSuccess', { name: data.name, tokens: data.tokens, redirectTeamSlug: data.redirectTeamSlug || preview?.redirectTeamSlug || null, imageUrl: data.imageUrl || preview?.imageUrl || null });
            } else {
              openModal('awardSuccess', { name: preview?.name || 'Bonus', tokens: 0, error: data.error || 'Could not claim', imageUrl: preview?.imageUrl || null });
            }
          } catch {
            openModal('awardSuccess', { name: preview?.name || 'Bonus', tokens: 0, error: 'Could not claim', imageUrl: preview?.imageUrl || null });
          }
        },
      });
      return;
    }

    // Logged in: set favorite to required team, then redeem
    try {
      await fetch('/api/profile/updateFavoriteTeam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamSlug }),
      });
      // Optimistically update follow status
      setFollowStatus({ followsTeam: true });
    } catch {}
    try {
      const res = await fetch('/api/awards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        openModal('awardSuccess', { name: data.name, tokens: data.tokens, redirectTeamSlug: data.redirectTeamSlug || preview?.redirectTeamSlug || null, imageUrl: data.imageUrl || preview?.imageUrl || null });
      } else {
        setError(data.error || 'Could not claim');
      }
    } catch {
      setError('Could not claim');
    }
  }, [session, preview, openModal, code]);

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">{
          (preview?.requirementKey === 'follow_team' && (!session?.user || (followStatus != null && !followStatus.followsTeam)))
            ? `Get notified when ${(preview?.requirementTeamName || preview?.requirementTeamSlug)} packs drop`
            : 'Claim your bonus'
        }</h2>
        {loading && <p>Loading…</p>}
        {!loading && checking && <p>Checking your redemption…</p>}
        {!loading && error && <p className="text-red-600">{error}</p>}
        {!loading && !error && preview && (
          <>
            {preview.imageUrl ? (
              <div className="w-full flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.imageUrl} alt={preview.name || 'Award'} className="max-h-40 object-contain rounded" />
              </div>
            ) : null}
            {(() => {
              // Hide token messaging entirely for follow-team flows
              if (preview.requirementKey === 'follow_team') {
                return null;
              }
              const team = preview.requirementTeamName || preview.requirementTeamSlug;
              const needsFollowUnknown = preview.requirementKey === 'follow_team' && !session?.user;
              const needsFollow = preview.requirementKey === 'follow_team' && !!session?.user && followStatus != null && !followStatus.followsTeam;
              const isFollowing = preview.requirementKey === 'follow_team' && !!session?.user && followStatus != null && followStatus.followsTeam;
              if (needsFollow || needsFollowUnknown) {
                return (
                  <p className="text-gray-800">
                    Claim <span className="font-semibold">+{preview.tokens}</span> <a href="/marketplace" target="_blank" rel="noopener noreferrer" className="underline text-blue-700">Marketplace Tokens</a> when you sign up for {team} pack drops.
                  </p>
                );
              }
              if (isFollowing) {
                return (
                  <p className="text-gray-800">Claim this <span className="font-semibold">+{preview.tokens}</span>.</p>
                );
              }
              return (
                <p className="text-gray-800">{preview.name} <span className="font-semibold">+{preview.tokens}</span> Taker marketplace tokens available</p>
              );
            })()}
            {preview.status !== 'available' ? (
              <p className="text-gray-500">This code is not available to claim.</p>
            ) : (
              (() => {
                const teamName = preview.requirementTeamName || preview.requirementTeamSlug;
                const shouldShowFollowCta = preview.requirementKey === 'follow_team' && (!session?.user || (followStatus != null && !followStatus.followsTeam));
                const label = shouldShowFollowCta ? `Follow the ${teamName}` : 'Claim Bonus';
                const onClick = shouldShowFollowCta ? followRequiredTeamAndRedeem : handleClaim;
                const disabled = preview.requirementKey === 'follow_team' && !!session?.user && followStatus == null; // waiting for follow status
                return (
                  <>
                    <button onClick={onClick} disabled={disabled} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 w-max">{label}</button>
                    {shouldShowFollowCta && (
                      <div className="flex items-start gap-2 mt-2">
                        <input
                          id="smsConsent"
                          type="checkbox"
                          checked={smsConsent}
                          onChange={(e) => setSmsConsent(e.target.checked)}
                          className="mt-1"
                        />
                        <label htmlFor="smsConsent" className="text-xs text-gray-600">
                          I agree to receive SMS notifications about {teamName} pack drops. Message and data rates may apply.
                        </label>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </>
        )}
      </div>
    </GlobalModal>
  );
}


