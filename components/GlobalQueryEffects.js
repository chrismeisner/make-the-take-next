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
        // Fetch preview to determine routing and which modal to show
        const res = await fetch(`/api/awards/preview?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        const reqSlug = res.ok && data?.success ? (data.requirementTeamRouteSlug || data.requirementTeamSlug || data.redirectTeamSlug || null) : null;
        const currentSlug = typeof router.query?.teamSlug === 'string' ? router.query.teamSlug : null;

        // If promo follow with a team target: ensure team page is behind the modal
        if (data?.kind === 'promo' && data?.targetType === 'team' && reqSlug) {
          if (router.pathname !== '/teams/[teamSlug]' || currentSlug !== reqSlug) {
            const asPath = `/teams/${encodeURIComponent(reqSlug)}`;
            router.replace({ pathname: '/teams/[teamSlug]', query: { teamSlug: reqSlug, card: code } }, asPath);
            return;
          }
          // Already on correct team page: open follow modal and clean URL
          try {
            if (typeof window !== 'undefined') {
              window.__MTT_SUPPRESS_GLOBAL_MODALS__ = true;
              window.__MTT_SUPPRESS_URL_SYNC__ = true;
            }
          } catch {}
          openModal('promoFollow', { code });
          {
            const nextQuery = { ...q };
            delete nextQuery.card;
            router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
          }
          return;
        }

        // Non-promo or no team target: if team required, route to team page first
        if (reqSlug && (router.pathname !== '/teams/[teamSlug]' || currentSlug !== reqSlug)) {
          const asPath = `/teams/${encodeURIComponent(reqSlug)}`;
          router.replace({ pathname: '/teams/[teamSlug]', query: { teamSlug: reqSlug, card: code } }, asPath);
          return;
        }

        // Otherwise, open award claim on current page and clean URL
        try {
          if (typeof window !== 'undefined') {
            window.__MTT_SUPPRESS_GLOBAL_MODALS__ = true;
            window.__MTT_SUPPRESS_URL_SYNC__ = true;
          }
        } catch {}
        openModal('awardClaim', { code });
        {
          const nextQuery = { ...q };
          delete nextQuery.card;
          router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
        }
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


