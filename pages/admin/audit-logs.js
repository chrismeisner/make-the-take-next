import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [severity, setSeverity] = useState('');
  const [packUrl, setPackUrl] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (eventKey) params.set('eventKey', eventKey);
      if (severity) params.set('severity', severity);
      if (packUrl) params.set('packUrl', packUrl);
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'failed');
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold">Admin Event Audit Log</h1>
        <Link href="/admin" className="text-blue-600 hover:underline">Back to Admin</Link>
      </div>
      <div className="border rounded p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-sm text-gray-700">Event Key</label>
            <input value={eventKey} onChange={(e)=>setEventKey(e.target.value)} className="px-2 py-1 border rounded" placeholder="e.g., packs_opened" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Severity</label>
            <select value={severity} onChange={(e)=>setSeverity(e.target.value)} className="px-2 py-1 border rounded">
              <option value="">Any</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700">Pack URL</label>
            <input value={packUrl} onChange={(e)=>setPackUrl(e.target.value)} className="px-2 py-1 border rounded" placeholder="pack-url" />
          </div>
          <button onClick={load} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Apply</button>
        </div>
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p className="text-red-600">Error: {error}</p>
      ) : logs.length === 0 ? (
        <p className="text-gray-600">No logs found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Severity</th>
                <th className="py-2 pr-3">Pack</th>
                <th className="py-2 pr-3">Prop</th>
                <th className="py-2 pr-3">Message</th>
                <th className="py-2 pr-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{l.event_key}</td>
                  <td className="py-2 pr-3">{l.severity}</td>
                  <td className="py-2 pr-3">{l.pack_url || (l.pack_id ? l.pack_id.slice(0,8) : '')}</td>
                  <td className="py-2 pr-3">{l.prop_id ? String(l.prop_id).slice(0,8) : ''}</td>
                  <td className="py-2 pr-3 max-w-[320px] truncate" title={l.message || ''}>{l.message || ''}</td>
                  <td className="py-2 pr-3 max-w-[420px]">
                    <pre className="whitespace-pre-wrap break-words">{l.details ? JSON.stringify(l.details, null, 2) : ''}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


