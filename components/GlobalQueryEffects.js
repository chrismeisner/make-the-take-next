import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../contexts/ModalContext';

export default function GlobalQueryEffects() {
  const router = useRouter();
  const { openModal } = useModal();

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query || {};
    const code = Array.isArray(q.card) ? q.card[0] : q.card;
    if (code && typeof code === 'string') {
      try {
        if (typeof window !== 'undefined') {
          window.__MTT_SUPPRESS_GLOBAL_MODALS__ = true;
          window.__MTT_SUPPRESS_URL_SYNC__ = true;
        }
      } catch {}
      openModal('awardClaim', { code });
      const nextQuery = { ...q };
      delete nextQuery.card;
      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }
  }, [router.isReady]);

  return null;
}


