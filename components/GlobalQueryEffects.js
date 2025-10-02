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
    if (!code || typeof code !== 'string') return;
    (async () => {
      try {
        // If already on team page, open immediately (URL already correct)
        if (router.pathname === '/teams/[teamSlug]') {
          try {
            if (typeof window !== 'undefined') {
              window.__MTT_SUPPRESS_GLOBAL_MODALS__ = false;
              window.__MTT_SUPPRESS_URL_SYNC__ = true;
            }
          } catch {}
          openModal('awardClaim', { code });
          const nextQuery = { ...q };
          delete nextQuery.card;
          router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
          return;
        }

        // Fetch preview to determine routing
        const res = await fetch(`/api/awards/preview?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        const reqSlug = res.ok && data?.success ? (data.requirementTeamRouteSlug || data.requirementTeamSlug || data.redirectTeamSlug || null) : null;
        const currentSlug = typeof router.query?.teamSlug === 'string' ? router.query.teamSlug : null;

        if (data?.kind === 'promo') {
          // Promo: open promo follow modal in-place (no redirect)
          try {
            if (typeof window !== 'undefined') {
              window.__MTT_SUPPRESS_GLOBAL_MODALS__ = true;
              window.__MTT_SUPPRESS_URL_SYNC__ = true;
            }
          } catch {}
          openModal('promoFollow', { code });
          const nextQuery = { ...q };
          delete nextQuery.card;
          router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
          return;
        }

        if (reqSlug && router.pathname !== '/teams/[teamSlug]') {
          // Forward to team page with the card param so modal opens there
          const asPath = `/teams/${encodeURIComponent(reqSlug)}`;
          router.replace({ pathname: '/teams/[teamSlug]', query: { teamSlug: reqSlug, card: code } }, asPath);
          return;
        }
        if (reqSlug && currentSlug && currentSlug !== reqSlug) {
          // Already on a team page but not the required one: navigate
          const asPath = `/teams/${encodeURIComponent(reqSlug)}`;
          router.replace({ pathname: '/teams/[teamSlug]', query: { teamSlug: reqSlug, card: code } }, asPath);
          return;
        }
        // Open modal on current page (already on correct team page or no team requirement)
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
      } catch {
        // Fallback: open modal on current page
        try {
          if (typeof window !== 'undefined') {
            window.__MTT_SUPPRESS_GLOBAL_MODALS__ = false;
            window.__MTT_SUPPRESS_URL_SYNC__ = true;
          }
        } catch {}
        openModal('awardClaim', { code });
        const nextQuery = { ...q };
        delete nextQuery.card;
        router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
      }
    })();
  }, [router.isReady, router.pathname, router.query?.card]);

  return null;
}


