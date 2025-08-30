// File: components/MarketplacePreview.js

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function MarketplacePreview({ limit = 6, title = 'Marketplace', variant = 'default', preferFeatured = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { data: session, status } = useSession();
  const [tokenBalance, setTokenBalance] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function fetchItems() {
      try {
        const res = await fetch('/api/items');
        const data = await res.json();
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
          setError(data.error || 'Failed to load items');
        }
      } catch (err) {
        if (!isMounted) return;
        setError('Error fetching items');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchItems();
    return () => { isMounted = false; };
  }, [limit, preferFeatured]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setTokenBalance(0);
      return;
    }
    let isMounted = true;
    async function fetchTokenBalance() {
      try {
        const profileRes = await fetch(`/api/profile/${encodeURIComponent(session.user.profileID)}`);
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
      <Link href="/marketplace" className="text-sm text-blue-600 underline">View all</Link>
    </div>
  );

  function renderCard(item) {
    return (
      <div key={item.itemID} className="w-full bg-white border rounded shadow-sm p-4 h-full">
        {item.itemImage ? (
          <div className="mb-3 w-full aspect-square overflow-hidden rounded border border-gray-200 bg-gray-100">
            <img
              src={item.itemImage}
              alt={item.itemName || 'Item image'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}
        <div className="text-sm text-gray-500">{item.itemBrand}</div>
        <div className="text-base sm:text-lg font-semibold">{item.itemName}</div>
        {item.itemDescription ? (
          <p className="text-sm text-gray-600 mt-1 line-clamp-3">{item.itemDescription}</p>
        ) : null}
        <div className="mt-3 text-sm text-gray-700"><strong>Cost:</strong> {item.itemTokens} diamonds</div>
        {session?.user ? (
          <div className="mt-2">
            <p className="text-sm text-gray-600 mb-1">{Math.min(tokenBalance, item.itemTokens)} / {item.itemTokens} diamonds</p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min((tokenBalance / item.itemTokens) * 100, 100)}%` }}></div>
            </div>
          </div>
        ) : null}
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


