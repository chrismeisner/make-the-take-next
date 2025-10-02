import React, { useEffect, useState, useCallback } from 'react';
import GlobalModal from './GlobalModal';
import { useModal } from '../../contexts/ModalContext';

export default function PromoFollowModal({ isOpen, onClose, code, justFollowed = false, previewState = '' }) {
  const { openModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { kind, targetType, targetSlug, targetSeriesId, imageUrl, hasUpcomingOrLive, name }
  const [busy, setBusy] = useState(false);
  const [followed, setFollowed] = useState(Boolean(justFollowed));

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
          setPreview(data);
          // Initialize success state for preview when applicable
          if (previewState === 'logged_following') {
            setFollowed(true);
          }
        }
      } catch (e) {
        if (!mounted) return;
        setError('Could not load');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (isOpen && code) load();
    return () => { mounted = false; };
  }, [isOpen, code, previewState]);

  const handleFollow = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const doFollow = async () => {
        if (preview.targetType === 'team' && preview.targetSlug) {
          const r = await fetch('/api/follow/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamSlug: preview.targetSlug }) });
          const j = await r.json();
          if (!r.ok || !j.success) throw new Error(j.error || 'Follow failed');
        } else if (preview.targetType === 'series' && (preview.targetSeriesId)) {
          const r = await fetch('/api/follow/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesId: String(preview.targetSeriesId) }) });
          const j = await r.json();
          if (!r.ok || !j.success) throw new Error(j.error || 'Follow failed');
        }
      };

      // In preview mode, simulate auth based on selected state
      const isPreview = Boolean(previewState);
      let isAuthed = false;
      if (isPreview) {
        isAuthed = previewState !== 'not_logged_not_following';
      } else {
        const me = await fetch('/api/auth/session');
        isAuthed = me.ok ? Boolean((await me.json())?.user) : false;
      }
      if (!isAuthed) {
        openModal('login', {
          title: 'Log in to follow',
          ctaLabel: 'Verify & Follow',
          onSuccess: async () => {
            if (!isPreview) {
              try { await doFollow(); } catch {}
            }
            // Reopen this modal in success state (preview or real)
            openModal('promoFollow', { code, justFollowed: true, previewState });
          },
        });
        return;
      }
      if (!isPreview) {
        await doFollow();
      }
      setFollowed(true);
    } catch (e) {
      setError(e.message || 'Follow failed');
    } finally {
      setBusy(false);
    }
  }, [preview, openModal, onClose]);

  const ctaLabel = (() => {
    if (!preview) return 'Follow';
    if (preview.targetType === 'team' && preview.requirementTeamName) return `Follow ${preview.requirementTeamName}`;
    if (preview.targetType === 'team' && preview.targetSlug) return `Follow ${preview.targetSlug}`;
    if (preview.targetType === 'series') return 'Follow this series';
    return 'Follow';
  })();

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {followed ? (
          <>
            <h2 className="text-2xl font-bold">You're all set!</h2>
            {!loading && preview?.targetType === 'team' && (
              <p className="text-gray-800">You'll get alerts when {preview.requirementTeamName || preview.targetSlug} packs open.</p>
            )}
            {!loading && preview?.targetType === 'series' && (
              <p className="text-gray-800">You'll get alerts for this series when packs open.</p>
            )}
            <div className="flex gap-2 mt-1">
              {preview?.targetType === 'team' && preview?.targetSlug ? (
                <a href={`/teams/${encodeURIComponent(preview.targetSlug)}`} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Go to Team</a>
              ) : null}
              <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Close</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold">Follow to get pack alerts</h2>
            {loading && <p>Loading…</p>}
            {!loading && error && <p className="text-red-600">{error}</p>}
            {!loading && !error && preview && (
              <>
                {preview.imageUrl ? (
                  <div className="w-full flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview.imageUrl} alt={preview.name || 'Promo'} className="max-h-40 object-contain rounded" />
                  </div>
                ) : null}
                {preview.hasUpcomingOrLive ? (
                  <p className="text-gray-800">Upcoming or live packs are available for this {preview.targetType}.</p>
                ) : (
                  <p className="text-gray-800">We’ll notify you when packs open for this {preview.targetType}.</p>
                )}
                <button onClick={handleFollow} disabled={busy} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 w-max">{busy ? 'Please wait…' : ctaLabel}</button>
              </>
            )}
          </>
        )}
      </div>
    </GlobalModal>
  );
}


