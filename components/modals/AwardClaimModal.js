import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import GlobalModal from './GlobalModal';
import { useModal } from '../../contexts/ModalContext';

export default function AwardClaimModal({ isOpen, onClose, code }) {
  const { data: session } = useSession();
  const { openModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { name, tokens, status, redirectTeamSlug, imageUrl }
  const [checking, setChecking] = useState(false);

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
          setPreview({ name: data.name, tokens: data.tokens, status: data.status, redirectTeamSlug: data.redirectTeamSlug || null, imageUrl: data.imageUrl || null });
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
      if (!isOpen || !code || !session?.user) return;
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
  }, [isOpen, code, session, preview, openModal]);

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
              openModal('awardSuccess', { name: preview?.name || 'Bonus', tokens: 0, error: data.error || 'Could not claim', imageUrl: preview?.imageUrl || null });
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
        setError(data.error || 'Could not claim');
      }
    } catch (err) {
      setError('Could not claim');
    }
  }, [session, preview, openModal, code]);

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Claim your bonus</h2>
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
            <p className="text-gray-800">{preview.name} <span className="font-semibold">+{preview.tokens}</span> Taker marketplace tokens available</p>
            {preview.status !== 'available' ? (
              <p className="text-gray-500">This code is not available to claim.</p>
            ) : (
              <button onClick={handleClaim} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 w-max">Claim</button>
            )}
          </>
        )}
      </div>
    </GlobalModal>
  );
}


