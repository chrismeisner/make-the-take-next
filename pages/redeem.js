import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function RedeemPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    specialInstructions: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [item, setItem] = useState(null);

  // Pre-fill phone number from session when available
  useEffect(() => {
    if (session?.user?.phone) {
      setFormData(prev => ({
        ...prev,
        phone: session.user.phone
      }));
    }
  }, [session?.user?.phone]);

  // Get item data from query params if available
  useEffect(() => {
    if (router.query.itemID) {
      // Fetch item details from API
      fetchItemDetails(router.query.itemID);
    }
  }, [router.query.itemID]);

  async function fetchItemDetails(itemID) {
    try {
      const res = await fetch(`/api/items/${itemID}`);
      const data = await res.json();
      if (data.success) {
        setItem(data.item);
      }
    } catch (err) {
      console.error('Error fetching item details:', err);
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!session?.user) {
      setError('You must be logged in to redeem prizes');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          itemID: router.query.itemID,
          profileID: session.user.profileID
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit redemption request');
      }

      setSuccess(true);
      // Reset form
      setFormData({
        fullName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        specialInstructions: ''
      });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return <div className="p-4">Loading...</div>;
  }

  if (status === 'unauthenticated') {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Redeem Prize</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <p className="text-yellow-800">
            You must be logged in to redeem prizes. Please <Link href="/login" className="underline text-blue-600">log in</Link> first.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Redemption Submitted</h1>
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
          <p className="text-green-800">
            Your redemption request has been submitted successfully! We'll process your request and contact you with further details.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Back to Home
          </Link>
          <button 
            onClick={() => setSuccess(false)} 
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Redeem Prize</h1>
      
      {item && (
        <div className="mb-6 p-4 border rounded bg-gray-50">
          <h2 className="text-lg font-semibold mb-2">Selected Item</h2>
          <p className="font-medium">{item.itemName}</p>
          <p className="text-sm text-gray-600">Brand: {item.itemBrand}</p>
          <p className="text-sm text-gray-600">Cost: {item.itemTokens} tokens</p>
          <p className="text-sm text-gray-700 mt-2">{item.itemDescription}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number *
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
            Street Address *
          </label>
          <input
            type="text"
            id="address"
            name="address"
            value={formData.address}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
              City *
            </label>
            <input
              type="text"
              id="city"
              name="city"
              value={formData.city}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
              State/Province *
            </label>
            <input
              type="text"
              id="state"
              name="state"
              value={formData.state}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-1">
              ZIP/Postal Code *
            </label>
            <input
              type="text"
              id="zipCode"
              name="zipCode"
              value={formData.zipCode}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
            Country *
          </label>
          <select
            id="country"
            name="country"
            value={formData.country}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Country</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="UK">United Kingdom</option>
            <option value="AU">Australia</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="specialInstructions" className="block text-sm font-medium text-gray-700 mb-1">
            Special Instructions (Optional)
          </label>
          <textarea
            id="specialInstructions"
            name="specialInstructions"
            value={formData.specialInstructions}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Any special delivery instructions or notes..."
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className={`px-6 py-2 rounded text-white ${
              submitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {submitting ? 'Submitting...' : 'Submit Redemption Request'}
          </button>
          <Link
            href="/"
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
