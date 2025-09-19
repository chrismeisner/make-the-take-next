import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function RedeemAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRedemption, setSelectedRedemption] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (session?.user && !session.user.superAdmin) {
      router.push('/');
      return;
    }
    fetchRedemptions();
  }, [status, session]);

  async function fetchRedemptions() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/redemptions');
      const data = await res.json();
      if (data.success) {
        setRedemptions(data.redemptions || []);
      } else {
        setError(data.error || 'Failed to fetch redemptions');
      }
    } catch (err) {
      console.error('Error fetching redemptions:', err);
      setError('Error fetching redemptions');
    } finally {
      setLoading(false);
    }
  }

  async function updateRedemptionStatus(redemptionId, newStatus) {
    try {
      setUpdating(true);
      const res = await fetch('/api/admin/redemptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redemptionId,
          status: newStatus,
          adminNotes,
          trackingNumber
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchRedemptions(); // Refresh the list
        setSelectedRedemption(null);
        setAdminNotes('');
        setTrackingNumber('');
      } else {
        setError(data.error || 'Failed to update redemption');
      }
    } catch (err) {
      console.error('Error updating redemption:', err);
      setError('Error updating redemption');
    } finally {
      setUpdating(false);
    }
  }

  const filteredRedemptions = redemptions.filter(redemption => 
    statusFilter === 'all' || redemption.status === statusFilter
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'shipped': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (status === 'loading' || loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (status === 'unauthenticated') {
    return <div className="p-4">Please log in to access this page.</div>;
  }

  if (!session?.user?.superAdmin) {
    return <div className="p-4">Access denied. Super admin required.</div>;
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Redemption Management</h1>
        <Link href="/admin" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
          Back to Admin
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Status Filter */}
      <div className="mb-4">
        <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Status:
        </label>
        <select
          id="statusFilter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Redemptions Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {filteredRedemptions.map((redemption) => (
            <li key={redemption.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(redemption.status)}`}>
                        {redemption.status}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {redemption.full_name} - {redemption.item_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {redemption.email} • {redemption.phone}
                      </p>
                      <p className="text-sm text-gray-500">
                        {redemption.city}, {redemption.state} {redemption.zip_code}
                      </p>
                      <p className="text-xs text-gray-400">
                        Created: {new Date(redemption.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setSelectedRedemption(redemption)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    View Details
                  </button>
                  {redemption.status === 'pending' && (
                    <button
                      onClick={() => updateRedemptionStatus(redemption.id, 'processing')}
                      disabled={updating}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Start Processing
                    </button>
                  )}
                  {redemption.status === 'processing' && (
                    <button
                      onClick={() => updateRedemptionStatus(redemption.id, 'shipped')}
                      disabled={updating}
                      className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      Mark Shipped
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {filteredRedemptions.length === 0 && (
          <div className="px-6 py-4 text-center text-gray-500">
            No redemptions found.
          </div>
        )}
      </div>

      {/* Redemption Details Modal */}
      {selectedRedemption && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Redemption Details - {selectedRedemption.full_name}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-700">Item Information</h4>
                  <p className="text-sm text-gray-600">
                    <strong>Item:</strong> {selectedRedemption.item_name} ({selectedRedemption.item_brand})
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Cost:</strong> {selectedRedemption.exchange_tokens} tokens
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700">Contact Information</h4>
                  <p className="text-sm text-gray-600">
                    <strong>Name:</strong> {selectedRedemption.full_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Email:</strong> {selectedRedemption.email}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Phone:</strong> {selectedRedemption.phone}
                  </p>
                </div>

                <div>
                  <h4 className="font-medium text-gray-700">Shipping Address</h4>
                  <p className="text-sm text-gray-600">
                    {selectedRedemption.address}<br />
                    {selectedRedemption.city}, {selectedRedemption.state} {selectedRedemption.zip_code}<br />
                    {selectedRedemption.country}
                  </p>
                </div>

                {selectedRedemption.special_instructions && (
                  <div>
                    <h4 className="font-medium text-gray-700">Special Instructions</h4>
                    <p className="text-sm text-gray-600">{selectedRedemption.special_instructions}</p>
                  </div>
                )}

                <div>
                  <h4 className="font-medium text-gray-700">Admin Notes</h4>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Add admin notes..."
                  />
                </div>

                <div>
                  <h4 className="font-medium text-gray-700">Tracking Number</h4>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter tracking number..."
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <button
                  onClick={() => setSelectedRedemption(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Close
                </button>
                <button
                  onClick={() => updateRedemptionStatus(selectedRedemption.id, selectedRedemption.status)}
                  disabled={updating}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {updating ? 'Updating...' : 'Update Notes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
