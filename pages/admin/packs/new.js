import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useModal } from '../../../contexts/ModalContext';

export default function AdminNewPackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { openModal } = useModal();
  const [packTitle, setPackTitle] = useState('');
  const [packURL, setPackURL] = useState('');
  const [packSummary, setPackSummary] = useState('');
  const [propsList, setPropsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [packLeague, setPackLeague] = useState('');
  const [packCoverUrl, setPackCoverUrl] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [statusOptions, setStatusOptions] = useState([]);
  const [packStatus, setPackStatus] = useState('active');
  useEffect(() => {
    fetch('/api/admin/eventLeagues')
      .then(res => res.json())
      .then(data => { if (data.success) setLeagues(data.leagues); })
      .catch(err => console.error(err));
  }, []);
  useEffect(() => {
    fetch('/api/packs')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          let opts = Array.from(new Set(data.packs.map(p => p.packStatus)));
          if (!opts.includes('active')) opts.unshift('active');
          setStatusOptions(opts.sort());
        }
      })
      .catch(err => console.error(err));
  }, []);
  const handleCoverChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverPreviewUrl(URL.createObjectURL(file));
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        const res = await fetch('/api/admin/uploadPackCover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, fileData: base64data }),
        });
        const data = await res.json();
        if (data.success) {
          setPackCoverUrl(data.url);
        } else {
          setError(data.error || 'Failed to upload cover.');
        }
        setCoverUploading(false);
      };
    } catch (err) {
      setError(err.message || 'Failed to upload cover.');
      setCoverUploading(false);
    }
  };

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }
  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Build payload including event link and props
      const payload = { packTitle, packURL };
      if (packSummary) payload.packSummary = packSummary;
      if (packLeague) payload.packLeague = packLeague.toLowerCase();
      if (packCoverUrl) payload.packCoverUrl = packCoverUrl;
      if (packStatus) payload.packStatus = packStatus;
      if (propsList.length) payload.props = propsList.map(p => p.airtableId);
      const res = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        // Persist the chosen order onto each Prop via propOrder
        if (propsList.length > 0) {
          await Promise.all(
            propsList.map((prop, index) =>
              fetch('/api/props', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propId: prop.airtableId, packId: data.record.id, propOrder: index }),
              }).then(r => r.json()).catch(() => null)
            )
          );
        }
        router.push(`/admin/packs/${data.record.id}`);
      } else {
        setError(data.error || 'Failed to create pack.');
      }
    } catch (err) {
      setError(err.message || 'Failed to create pack.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to move a prop in the list
  const moveProp = (fromIndex, toIndex) => {
    setPropsList(pl => {
      const newList = [...pl];
      const [moved] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, moved);
      return newList;
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Create New Pack</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl mx-auto">
        <div>
          <label className="block text-sm font-medium text-gray-700">Pack Title</label>
          <input
            type="text"
            value={packTitle}
            onChange={(e) => setPackTitle(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
            required
          />
          <div className="mt-2">
            {/* Removed Generate from Event button */}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Pack URL</label>
          <input
            type="text"
            value={packURL}
            onChange={(e) => setPackURL(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
            required
          />
          <div className="mt-2 flex space-x-2">
            <button
              type="button"
              onClick={() => {
                const baseSlug = packTitle
                  .toLowerCase()
                  .trim()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '');
                const now = new Date();
                const YY = String(now.getFullYear() % 100).padStart(2, '0');
                const MM = String(now.getMonth() + 1).padStart(2, '0');
                const DD = String(now.getDate()).padStart(2, '0');
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                const timestamp = `${YY}${MM}${DD}${hh}${mm}`;
                setPackURL(`${baseSlug}-${timestamp}`);
              }}
              disabled={!packTitle}
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Generate from Title
            </button>
            <button
              type="button"
              onClick={() => {
                const rand = Math.random().toString(36).substring(2,8);
                setPackURL(rand);
              }}
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Generate Random URL
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea
            value={packSummary}
            onChange={(e) => setPackSummary(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">League</label>
          <select
            value={packLeague}
            onChange={(e) => setPackLeague(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="">Select a league</option>
            {leagues.map((lg) => (
              <option key={lg} value={lg}>{lg}</option>
            ))}
          </select>
        </div>
        {/* Removed Event selection section */}
        {/* Props section */}
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-2">Props to Add</h2>
          <div className="mb-2">
            <button
              type="button"
              onClick={() => openModal('addProp', { onPropsAdded: selectedProps => setPropsList(pl => [...pl, ...selectedProps]), initialLeague: packLeague, excludeIds: propsList.map(p => p.airtableId).filter(Boolean), viewName: 'Open' })}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Prop
            </button>
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2 border">Prop Short</th>
                <th className="px-4 py-2 border">Event</th>
                <th className="px-4 py-2 border">Event Time</th>
                <th className="px-4 py-2 border">Order</th>
                <th className="px-4 py-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {propsList.map((prop, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2 border">{prop.propShort || prop.propID || prop.airtableId}</td>
                  <td className="px-4 py-2 border">{prop.eventTitle || '-'}</td>
                  <td className="px-4 py-2 border">{prop.eventTime ? new Date(prop.eventTime).toLocaleString() : '-'}</td>
                  <td className="px-4 py-2 border whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => idx > 0 && moveProp(idx, idx - 1)}
                      className="px-2 py-1 mr-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                      disabled={idx === 0}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => idx < propsList.length - 1 && moveProp(idx, idx + 1)}
                      className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                      disabled={idx === propsList.length - 1}
                    >
                      ▼
                    </button>
                  </td>
                  <td className="px-4 py-2 border">
                    <button
                      type="button"
                      onClick={() => setPropsList(pl => pl.filter((_, i) => i !== idx))}
                      className="px-2 py-1 text-red-600"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {propsList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-center text-gray-500">No props added</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
        {/* Cover Image upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Cover Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleCoverChange}
            className="mt-1"
          />
          {coverUploading && <p className="text-gray-600 mt-2">Uploading cover...</p>}
          {coverPreviewUrl && (
            <img src={coverPreviewUrl} alt="Cover preview" className="mt-2 h-32 object-contain" />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            value={packStatus}
            onChange={(e) => setPackStatus(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            {statusOptions.map(status => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex space-x-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Pack'}
          </button>
          <Link href="/admin/packs">
            <button
              type="button"
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </Link>
        </div>
      </form>
    </div>
  );
}