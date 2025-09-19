import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import GlobalModal from './GlobalModal';
import { useModal } from '../../contexts/ModalContext';

export default function AwardClaimModal({ isOpen, onClose, code }) {
  const { data: session } = useSession();
  const { openModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { name, tokens, status, redirectTeamSlug }

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
          setPreview({ name: data.name, tokens: data.tokens, status: data.status, redirectTeamSlug: data.redirectTeamSlug || null });
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

  const handleClaim = useCallback(async () => {
    if (!preview || preview.status !== 'available') return;
    if (!session?.user) {
      openModal('login', {
        title: 'Log in to claim',
        ctaLabel: 'Verify & Claim',
        onSuccess: async () => {
          try {
            const res = await fetch('/api/awards/redeem', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code }),
            });
            const data = await res.json();
              if (res.ok && data.success) {
              openModal('awardSuccess', { name: data.name, tokens: data.tokens, redirectTeamSlug: data.redirectTeamSlug || preview.redirectTeamSlug || null });
            } else {
              openModal('awardSuccess', { name: preview.name, tokens: 0, error: data.error || 'Could not claim' });
            }
          } catch {
            openModal('awardSuccess', { name: preview.name, tokens: 0, error: 'Could not claim' });
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
        openModal('awardSuccess', { name: data.name, tokens: data.tokens, redirectTeamSlug: data.redirectTeamSlug || preview.redirectTeamSlug || null });
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
        {!loading && error && <p className="text-red-600">{error}</p>}
        {!loading && !error && preview && (
          <>
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


