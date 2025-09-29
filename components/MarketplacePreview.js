// File: components/MarketplacePreview.js

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useModal } from '../contexts/ModalContext';

export default function MarketplacePreview({ limit = 6, title = 'Marketplace', variant = 'default', preferFeatured = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { data: session, status } = useSession();
  const [tokenBalance, setTokenBalance] = useState(0);
  const router = useRouter();
  const { openModal } = useModal();

  useEffect(() => {
    let isMounted = true;
    async function fetchItems() {
      try {
        const start = Date.now();
        const q = new URLSearchParams();
        // If on team page, pass teamSlug for team-specific images
        const teamSlug = typeof router.query?.teamSlug === 'string' ? router.query.teamSlug : null;
        if (teamSlug) q.set('teamSlug', teamSlug);
        const url = q.toString() ? `/api/items?${q.toString()}` : '/api/items';
        const res = await fetch(url);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('[MarketplacePreview] Non-JSON response from /api/items', { status: res.status, elapsedMs: Date.now() - start, text });
          throw new Error('Invalid JSON from /api/items');
        }
        console.log('[MarketplacePreview] /api/items result', { status: res.status, ok: res.ok, elapsedMs: Date.now() - start, success: data?.success, count: Array.isArray(data?.items) ? data.items.length : 0 });
        if (!isMounted) return;
        if (data.success) {
          const all = (data.items || []).filter((it) => it.itemStatus === 'Available');
          let filtered = all;
          if (preferFeatured) {
            const featured = all.filter((it) => it.featured);
            filtered = featured.length > 0 ? featured : all;
          }
          const sorted = filtered.slice().sort((a, b) => (a.itemTokens || 0) - (b.itemTokens || 0));
          setItems(sorted.slice(0, limit));
        } else {
          console.error('[MarketplacePreview] /api/items error payload', data);
          setError(data.error || 'Failed to load items');
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('[MarketplacePreview] fetchItems failed', err);
        setError('Error fetching items');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchItems();
    return () => { isMounted = false; };
  }, [limit, preferFeatured, router.query?.teamSlug]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setTokenBalance(0);
      return;
    }
    let isMounted = true;
    async function fetchTokenBalance() {
      try {
        const profileRes = await fetch(`/api/profile/${encodeURIComponent(session.user.profileID)}?select=tokens`);
        const profileData = await profileRes.json();
        if (!isMounted) return;
        if (profileData?.success && typeof profileData.tokensBalance === 'number') {
          setTokenBalance(profileData.tokensBalance);
        } else {
          setTokenBalance(0);
        }
      } catch (err) {
        if (!isMounted) return;
        setTokenBalance(0);
      }
    }
    fetchTokenBalance();
    return () => { isMounted = false; };
  }, [status, session]);

  const isSidebar = variant === 'sidebar';
  const Wrapper = ({ children }) => (
    isSidebar ? (
      <div className="w-full">
        {children}
      </div>
    ) : (
      <section className="w-full bg-gray-50 border-t border-gray-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </section>
    )
  );

  const Header = () => (
    <div className={isSidebar ? "flex items-center justify-between mb-3" : "flex items-center justify-between mb-4"}>
      <h2 className={isSidebar ? "text-lg font-bold" : "text-xl sm:text-2xl font-bold"}>{title}</h2>
    </div>
  );

  function renderCard(item) {
    const canRedeem = Number(tokenBalance) >= Number(item.itemTokens || 0);
    const openInfo = () => {
      const itemPayload = { ...item };
      openModal('marketplaceInfo', {
        item: itemPayload,
        tokenBalance,
        onGo: () => router.push('/redeem'),
      });
    };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInfo(); } };
    return (
      <div
        key={item.itemID}
        className="w-full bg-white border rounded shadow-sm p-4 h-full cursor-pointer hover:shadow"
        role="button"
        tabIndex={0}
        onClick={openInfo}
        onKeyDown={onKey}
        aria-label={`View ${item.itemName || 'item'} details`}
      >
        {item.itemImage ? (
          <div className="mb-3 w-full overflow-hidden rounded border border-gray-200 bg-gray-100">
            <img
              src={item.itemImage}
              alt={item.itemName || 'Item image'}
              className="w-full h-auto object-contain block"
              loading="lazy"
            />
          </div>
        ) : null}
        <div className="text-sm text-gray-500">{item.itemBrand}</div>
        <div className="text-base sm:text-lg font-semibold">{item.itemName}</div>
        {item.itemDescription ? (
          <p className="text-sm text-gray-600 mt-1 line-clamp-3">{item.itemDescription}</p>
        ) : null}
        <div className="mt-3 text-sm text-gray-700"><strong>Cost:</strong> {item.itemTokens} tokens</div>
        <div className="mt-2">
          <p className="text-sm text-gray-600 mb-1">{tokenBalance} / {item.itemTokens} tokens</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min((tokenBalance / item.itemTokens) * 100, 100)}%` }}></div>
          </div>
        </div>
        <div className="mt-3">
          <div
            className={`w-full px-3 py-2 rounded text-center text-white ${canRedeem ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300'}`}
            role="button"
            aria-disabled={!canRedeem}
          >
            Redeem
          </div>
        </div>
      </div>
    );
  }

  return (
    <Wrapper>
      <Header />
      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-gray-600">No items available right now.</div>
      ) : (limit === 1 || items.length === 1 || isSidebar) ? (
        <div className="w-full">
          {renderCard(items[0])}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => renderCard(item))}
        </div>
      )}
    </Wrapper>
  );
}


