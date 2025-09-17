import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function AdminPackDetail() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { packId } = router.query;
  const [pack, setPack] = useState(null);
  const [winner, setWinner] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [showSmsDraft, setShowSmsDraft] = useState(false);
  const [smsDraftRows, setSmsDraftRows] = useState([]);
  const [smsOptions, setSmsOptions] = useState({ includeWinner: true, includeLink: true });
  const [smsTotals, setSmsTotals] = useState({ recipients: 0, segments: 0 });

  useEffect(() => {
    if (status !== 'authenticated' || !packId) return;
    const fetchPack = async () => {
      try {
        const res = await fetch(`/api/admin/packs/${encodeURIComponent(packId)}`);
        const data = await res.json();
        if (data.success) setPack(data.pack || null); else console.error(data.error);
      } catch (err) {
        console.error('Error fetching packs:', err);
      }
    };
    fetchPack();
  }, [status, packId]);

  useEffect(() => {
    if (!pack || !pack.packURL) return;
    let cancelled = false;
    const fetchLeaderboard = async () => {
      try {
        setLeaderboardLoading(true);
        const res = await fetch(`/api/packs/${encodeURIComponent(pack.packURL)}`);
        const data = await res.json();
        if (!cancelled && data?.success) {
          const lb = Array.isArray(data.leaderboard) ? data.leaderboard : [];
          setLeaderboard(lb);
          const top = lb.length > 0 ? lb[0] : null;
          setWinner(top || null);
        }
      } catch (err) {
        if (!cancelled) console.error('Failed to load leaderboard:', err);
      } finally {
        if (!cancelled) setLeaderboardLoading(false);
      }
    };
    fetchLeaderboard();
    return () => { cancelled = true; };
  }, [pack]);

  if (status === 'loading') return <div className="container mx-auto px-4 py-6">Loading...</div>;
  if (!session) return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  if (!pack) return <div className="container mx-auto px-4 py-6">Pack not found</div>;

  const coverUrl = Array.isArray(pack?.packCover)
    ? (pack.packCover[0]?.url || null)
    : (pack?.packCover || null);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{pack.packTitle}</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => router.push(`/admin/packs/${pack.airtableId}/create-prop`)}
          >
            Add Prop
          </button>
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => router.push(`/admin/packs/${pack.airtableId}/edit`)}
          >
            Edit
          </button>
          {String(pack.packStatus || '').toLowerCase() === 'graded' && (
            <button
              className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              onClick={() => {
                // Build simple SMS drafts from current leaderboard and pack
                try {
                  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                  const packUrl = pack.packURL ? `${baseUrl}/packs/${encodeURIComponent(pack.packURL)}` : baseUrl;
                  const buildRows = () => {
                    const top = Array.isArray(leaderboard) && leaderboard.length > 0 ? leaderboard[0] : null;
                    const winnerText = top ? `${top.profileID || top.phone || 'Winner'} (${Number(top.points || 0)} pts)` : 'N/A';
                    const rows = (leaderboard || []).map((row, idx) => {
                      const rank = idx + 1;
                      const wl = `${Number(row.won || 0)}-${Number(row.lost || 0)}-${Number(row.pushed || 0)}`;
                      const parts = [
                        `Your results for ${pack.packTitle}: ${wl}, ${Number(row.points || 0)} pts (#${rank}).`
                      ];
                      if (smsOptions.includeWinner) parts.push(`Winner: ${winnerText}.`);
                      if (smsOptions.includeLink && pack.packURL) parts.push(`Details: ${packUrl}`);
                      const body = parts.join(' ');
                      // Rough segment estimate: 160 chars per segment
                      const segments = Math.max(1, Math.ceil((body || '').length / 160));
                      return {
                        to: row.phone || 'Unknown',
                        profileID: row.profileID || null,
                        rank,
                        points: Number(row.points || 0),
                        won: Number(row.won || 0),
                        lost: Number(row.lost || 0),
                        pushed: Number(row.pushed || 0),
                        takes: Number(row.takes || 0),
                        body,
                        segments,
                      };
                    });
                    return rows;
                  };
                  const rows = buildRows();
                  setSmsDraftRows(rows);
                  setSmsTotals({ recipients: rows.length, segments: rows.reduce((s, r) => s + (r.segments || 0), 0) });
                  setShowSmsDraft(true);
                } catch (e) {
                  console.error('Failed to build SMS drafts:', e);
                }
              }}
            >
              Draft results SMS
            </button>
          )}
        </div>
      </div>
      {coverUrl && (
        <div className="mb-6">
          <div className="w-40 sm:w-48 md:w-56 lg:w-64 aspect-square relative rounded border border-gray-200 overflow-hidden bg-gray-100">
            <img
              src={coverUrl}
              alt={`${pack.packTitle || 'Pack'} cover`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      )}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <dt className="font-medium">ID</dt>
          <dd>{pack.airtableId}</dd>
        </div>
        <div>
          <dt className="font-medium">URL</dt>
          <dd>{pack.packURL}</dd>
        </div>
        <div>
          <dt className="font-medium">Status</dt>
          <dd>{pack.packStatus}</dd>
        </div>
        <div>
          <dt className="font-medium">Created At</dt>
          <dd>{new Date(pack.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-medium">Event</dt>
          <dd>{pack.eventTitle || '-'}</dd>
        </div>
        <div>
          <dt className="font-medium"># Props</dt>
          <dd>{pack.propsCount}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="font-medium">Summary</dt>
          <dd>{pack.packSummary}</dd>
        </div>
      </dl>
      {String(pack.packStatus || '').toLowerCase() === 'graded' && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-3">Winner</h2>
          {leaderboardLoading ? (
            <div className="text-gray-500">Loading winner...</div>
          ) : winner ? (
            <div className="border rounded p-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-medium">
                  {winner.profileID ? (
                    <a href={`/profile/${winner.profileID}`} className="text-blue-600 hover:underline">View Profile</a>
                  ) : (
                    winner.phone || 'Unknown'
                  )}
                </div>
                <div className="text-sm text-gray-600">{winner.phone || '—'}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{Number(winner.points || 0)} pts</div>
                <div className="text-sm text-gray-600">{Number(winner.won || 0)}-{Number(winner.lost || 0)}-{Number(winner.pushed || 0)} W-L-P</div>
                <div className="text-sm text-gray-600">{Number(winner.takes || 0)} takes</div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">No winner — no entries found.</div>
          )}
        </div>
      )}
      {/* Leaderboard */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Leaderboard</h2>
        {leaderboardLoading ? (
          <div className="text-gray-500">Loading leaderboard...</div>
        ) : Array.isArray(leaderboard) && leaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left border border-gray-200 rounded">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 border-b w-16">#</th>
                  <th className="px-3 py-2 border-b">User</th>
                  <th className="px-3 py-2 border-b">Points</th>
                  <th className="px-3 py-2 border-b">Record</th>
                  <th className="px-3 py-2 border-b">Takes</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => (
                  <tr key={`${row.phone}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b">{idx + 1}</td>
                    <td className="px-3 py-2 border-b">
                      {row.profileID ? (
                        <a href={`/profile/${row.profileID}`} className="text-blue-600 hover:underline">{row.profileID}</a>
                      ) : (
                        row.phone || 'Unknown'
                      )}
                      <div className="text-xs text-gray-500">{row.phone || '—'}</div>
                    </td>
                    <td className="px-3 py-2 border-b font-semibold">{Number(row.points || 0)}</td>
                    <td className="px-3 py-2 border-b">{Number(row.won || 0)}-{Number(row.lost || 0)}-{Number(row.pushed || 0)}</td>
                    <td className="px-3 py-2 border-b">{Number(row.takes || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500">No entries yet.</div>
        )}
      </div>
      {/* Props List */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-3">Props</h2>
        {Array.isArray(pack.props) && pack.props.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left border border-gray-200 rounded">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 border-b">Order</th>
                  <th className="px-3 py-2 border-b">Title</th>
                  <th className="px-3 py-2 border-b">Short</th>
                  <th className="px-3 py-2 border-b">Status</th>
                  <th className="px-3 py-2 border-b">ID</th>
                </tr>
              </thead>
              <tbody>
                {pack.props.map((p) => (
                  <tr key={p.airtableId} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b w-16">{p.propOrder ?? 0}</td>
                    <td className="px-3 py-2 border-b">{p.propTitle || '-'}</td>
                    <td className="px-3 py-2 border-b">{p.propShort || '-'}</td>
                    <td className="px-3 py-2 border-b">
                      <span className="inline-block px-2 py-1 text-xs rounded bg-gray-100">
                        {p.propStatus || 'unknown'}
                      </span>
                    </td>
                    <td className="px-3 py-2 border-b text-gray-500">{p.propID || p.airtableId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500">No props yet.</div>
        )}
      </div>
      {/* SMS Draft Modal */}
      {showSmsDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded shadow-xl max-w-5xl w-full mx-4">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Draft Results SMS</h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowSmsDraft(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-3">
              <div className="mb-3 text-sm text-gray-600 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  {`Pack:`} <span className="font-medium">{pack.packTitle}</span> {` · Recipients:`} <span className="font-medium">{smsTotals.recipients}</span> {` · Est. Segments:`} <span className="font-medium">{smsTotals.segments}</span>
                </div>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-gray-700">
                    <input
                      type="checkbox"
                      checked={smsOptions.includeWinner}
                      onChange={(e) => {
                        const next = { ...smsOptions, includeWinner: e.target.checked };
                        setSmsOptions(next);
                        try {
                          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                          const packUrl = pack.packURL ? `${baseUrl}/packs/${encodeURIComponent(pack.packURL)}` : baseUrl;
                          const top = Array.isArray(leaderboard) && leaderboard.length > 0 ? leaderboard[0] : null;
                          const winnerText = top ? `${top.profileID || top.phone || 'Winner'} (${Number(top.points || 0)} pts)` : 'N/A';
                          const rows = (leaderboard || []).map((row, idx) => {
                            const rank = idx + 1;
                            const wl = `${Number(row.won || 0)}-${Number(row.lost || 0)}-${Number(row.pushed || 0)}`;
                            const parts = [
                              `Your results for ${pack.packTitle}: ${wl}, ${Number(row.points || 0)} pts (#${rank}).`
                            ];
                            if (next.includeWinner) parts.push(`Winner: ${winnerText}.`);
                            if (next.includeLink && pack.packURL) parts.push(`Details: ${packUrl}`);
                            const body = parts.join(' ');
                            const segments = Math.max(1, Math.ceil((body || '').length / 160));
                            return { ...row, to: row.phone || 'Unknown', profileID: row.profileID || null, rank, points: Number(row.points || 0), won: Number(row.won || 0), lost: Number(row.lost || 0), pushed: Number(row.pushed || 0), takes: Number(row.takes || 0), body, segments };
                          });
                          setSmsDraftRows(rows);
                          setSmsTotals({ recipients: rows.length, segments: rows.reduce((s, r) => s + (r.segments || 0), 0) });
                        } catch {}
                      }}
                    />
                    Include winner
                  </label>
                  <label className="inline-flex items-center gap-2 text-gray-700">
                    <input
                      type="checkbox"
                      checked={smsOptions.includeLink}
                      onChange={(e) => {
                        const next = { ...smsOptions, includeLink: e.target.checked };
                        setSmsOptions(next);
                        try {
                          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                          const packUrl = pack.packURL ? `${baseUrl}/packs/${encodeURIComponent(pack.packURL)}` : baseUrl;
                          const top = Array.isArray(leaderboard) && leaderboard.length > 0 ? leaderboard[0] : null;
                          const winnerText = top ? `${top.profileID || top.phone || 'Winner'} (${Number(top.points || 0)} pts)` : 'N/A';
                          const rows = (leaderboard || []).map((row, idx) => {
                            const rank = idx + 1;
                            const wl = `${Number(row.won || 0)}-${Number(row.lost || 0)}-${Number(row.pushed || 0)}`;
                            const parts = [
                              `Your results for ${pack.packTitle}: ${wl}, ${Number(row.points || 0)} pts (#${rank}).`
                            ];
                            if (next.includeWinner) parts.push(`Winner: ${winnerText}.`);
                            if (next.includeLink && pack.packURL) parts.push(`Details: ${packUrl}`);
                            const body = parts.join(' ');
                            const segments = Math.max(1, Math.ceil((body || '').length / 160));
                            return { ...row, to: row.phone || 'Unknown', profileID: row.profileID || null, rank, points: Number(row.points || 0), won: Number(row.won || 0), lost: Number(row.lost || 0), pushed: Number(row.pushed || 0), takes: Number(row.takes || 0), body, segments };
                          });
                          setSmsDraftRows(rows);
                          setSmsTotals({ recipients: rows.length, segments: rows.reduce((s, r) => s + (r.segments || 0), 0) });
                        } catch {}
                      }}
                    />
                    Include link
                  </label>
                </div>
              </div>
              {smsDraftRows.length === 0 ? (
                <div className="text-gray-500">No recipients found.</div>
              ) : (
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="min-w-full text-left border border-gray-200 rounded">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 border-b w-10">#</th>
                        <th className="px-3 py-2 border-b">Phone</th>
                        <th className="px-3 py-2 border-b">Profile</th>
                        <th className="px-3 py-2 border-b">Pts</th>
                        <th className="px-3 py-2 border-b">W-L-P</th>
                        <th className="px-3 py-2 border-b">Msg (preview)</th>
                        <th className="px-3 py-2 border-b">Seg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smsDraftRows.map((m, i) => (
                        <tr key={`${m.to}-${i}`} className="hover:bg-gray-50 align-top">
                          <td className="px-3 py-2 border-b">{m.rank}</td>
                          <td className="px-3 py-2 border-b whitespace-nowrap">{m.to}</td>
                          <td className="px-3 py-2 border-b">
                            {m.profileID ? (
                              <a href={`/profile/${m.profileID}`} className="text-blue-600 hover:underline">{m.profileID}</a>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b">{m.points}</td>
                          <td className="px-3 py-2 border-b">{m.won}-{m.lost}-{m.pushed}</td>
                          <td className="px-3 py-2 border-b"><div className="max-w-xl text-sm text-gray-800 whitespace-pre-wrap break-words">{m.body}</div></td>
                          <td className="px-3 py-2 border-b">{m.segments}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <button
                className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-60"
                disabled={smsDraftRows.length === 0}
                onClick={async () => {
                  if (smsDraftRows.length === 0) return;
                  const confirmSend = window.confirm(`Send ${smsDraftRows.length} SMS now?`);
                  if (!confirmSend) return;
                  try {
                    const endpoint = `/api/admin/packs/${encodeURIComponent(pack.airtableId)}/send-results-sms`;
                    const payload = { messages: smsDraftRows.map(r => ({ to: r.to, body: r.body })), dryRun: false };
                    try { console.log('[SendResultsSMS] POST', endpoint, { total: payload.messages.length, sample: payload.messages.slice(0, 2) }); } catch {}
                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = await res.json();
                    try { console.log('[SendResultsSMS] Response', { ok: res.ok, status: res.status, data }); } catch {}
                    if (res.ok && data?.success) {
                      alert(`Sent: ${data.sent} / ${data.total}. Failed: ${data.failed}`);
                      if (Number(data.failed || 0) > 0 && Array.isArray(data.errors)) {
                        try {
                          console.error('[SendResultsSMS] Failed deliveries:', data.errors);
                        } catch {}
                      }
                    } else {
                      alert(`Failed to send. ${data?.error || 'Unknown error'}`);
                      try { console.error('[SendResultsSMS] Error response', data); } catch {}
                    }
                  } catch (e) {
                    console.error('Send SMS failed:', e);
                    alert('Send SMS failed. Check console for details.');
                  }
                }}
              >
                Send SMS
              </button>
              <button
                className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                onClick={() => {
                  try {
                    const header = ['phone','profileID','rank','points','won','lost','pushed','takes','segments','body'];
                    const rows = smsDraftRows.map(r => [r.to, r.profileID || '', r.rank, r.points, r.won, r.lost, r.pushed, r.takes, r.segments, (r.body || '').replace(/\n/g, ' ').replace(/"/g, '""')]);
                    const csv = [header.join(','), ...rows.map(cols => cols.map(v => typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v}"` : `${v}`).join(','))].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `sms-draft-${pack.packURL || pack.airtableId}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (e) { console.error('CSV export failed:', e); }
                }}
              >
                Export CSV
              </button>
              <button
                className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                onClick={() => {
                  try {
                    const text = smsDraftRows.map(r => `${r.to}\t${r.body}`).join('\n');
                    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text);
                  } catch (e) { console.error('Copy failed:', e); }
                }}
              >
                Copy all
              </button>
              <button
                className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                onClick={() => setShowSmsDraft(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}