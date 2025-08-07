import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-cards';

export default function MarketplacePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { data: session, status } = useSession();
  const [tokenBalance, setTokenBalance] = useState(0);
  const [viewMode, setViewMode] = useState('grid');
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => {
    async function fetchItems() {
      try {
        const res = await fetch('/api/items');
        const data = await res.json();
        if (data.success) {
          const available = data.items.filter((item) => item.itemStatus === 'Available');
          setItems(available);
        } else {
          setError(data.error || 'Failed to load items');
        }
      } catch (err) {
        console.error('Error fetching items:', err);
        setError('Error fetching items');
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setTokenBalance(0);
      return;
    }
    async function fetchBalance() {
      try {
        const [pointsRes, profileRes] = await Promise.all([
          fetch('/api/userPoints'),
          fetch(`/api/profile/${encodeURIComponent(session.user.profileID)}`)
        ]);
        const pointsData = await pointsRes.json();
        const profileData = await profileRes.json();
        const totalPoints = pointsData.success ? pointsData.totalPoints : 0;
        const tokensEarned = Math.floor(totalPoints / 1000);
        const tokensSpent = profileData.success
          ? profileData.userExchanges.reduce((sum, ex) => sum + (ex.exchangeTokens || 0), 0)
          : 0;
        setTokenBalance(tokensEarned - tokensSpent);
      } catch (err) {
        console.error('Error fetching token balance:', err);
      }
    }
    fetchBalance();
  }, [status, session]);

  // Sort items by token cost based on sortOrder
  const sortedItems = items.slice().sort((a, b) =>
    sortOrder === 'asc' ? a.itemTokens - b.itemTokens : b.itemTokens - a.itemTokens
  );

  if (loading) return <div className="p-4">Loading marketplace...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Marketplace</h1>
      <div className="flex space-x-2 mb-4 items-center">
        <button onClick={() => setViewMode('grid')} className={`px-3 py-1 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Grid</button>
        <button onClick={() => setViewMode('stack')} className={`px-3 py-1 rounded ${viewMode === 'stack' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Stack</button>
        <div className="ml-auto flex items-center space-x-2">
          <label htmlFor="sortOrder" className="text-sm">Sort:</label>
          <select id="sortOrder" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="px-2 py-1 border rounded">
            <option value="asc">Lowest Cost</option>
            <option value="desc">Highest Cost</option>
          </select>
        </div>
      </div>
      {items.length === 0 ? (
        <p>No items available at this time.</p>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedItems.map((item) => {
            const canRedeem = session?.user && tokenBalance >= item.itemTokens;
            return (
              <div key={item.itemID} className="border rounded shadow-sm bg-white p-4">
                <h2 className="text-lg font-semibold mb-2">{item.itemName}</h2>
                <p className="text-sm text-gray-600 mb-1"><strong>Brand:</strong> {item.itemBrand}</p>
                <p className="text-sm text-gray-600 mb-1"><strong>Cost:</strong> {item.itemTokens} tokens</p>
                <p className="text-sm text-gray-700">{item.itemDescription}</p>
                <p className="text-sm text-gray-600 mb-1">{Math.min(tokenBalance, item.itemTokens)} / {item.itemTokens} tokens</p>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min((tokenBalance / item.itemTokens) * 100, 100)}%` }}></div>
                </div>
                <button
                  className={`mt-2 w-full px-3 py-1 rounded ${
                    canRedeem
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-400 text-gray-700 cursor-not-allowed'
                  }`}
                  disabled={!canRedeem}
                  onClick={() => console.log(`Redeem clicked for ${item.itemID}`)}
                >
                  Redeem
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Swiper effect="cards" grabCursor modules={[EffectCards]} className="w-full max-w-md mx-auto">
          {sortedItems.map((item) => {
            const canRedeem = session?.user && tokenBalance >= item.itemTokens;
            return (
              <SwiperSlide key={item.itemID}>
                <div className="border rounded shadow-sm bg-white p-4">
                  <h2 className="text-lg font-semibold mb-2">{item.itemName}</h2>
                  <p className="text-sm text-gray-600 mb-1"><strong>Brand:</strong> {item.itemBrand}</p>
                  <p className="text-sm text-gray-600 mb-1"><strong>Cost:</strong> {item.itemTokens} tokens</p>
                  <p className="text-sm text-gray-700">{item.itemDescription}</p>
                  <p className="text-sm text-gray-600 mb-1">{Math.min(tokenBalance, item.itemTokens)} / {item.itemTokens} tokens</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min((tokenBalance / item.itemTokens) * 100, 100)}%` }}></div>
                  </div>
                  <button
                    className={`mt-2 w-full px-3 py-1 rounded ${
                      canRedeem
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-400 text-gray-700 cursor-not-allowed'
                    }`}
                    disabled={!canRedeem}
                    onClick={() => console.log(`Redeem clicked for ${item.itemID}`)}
                  >
                    Redeem
                  </button>
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>
      )}
      <p className="mt-4">
        <Link href="/" className="underline text-blue-600">
          Back to Home
        </Link>
      </p>
    </div>
  );
}