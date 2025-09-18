// File: pages/admin/sms.js

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import PageContainer from '../../components/PageContainer';

export default function AdminSmsPage() {
  const { data: session } = useSession();
  const [rules, setRules] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [form, setForm] = useState({ trigger_type: 'pack_open', league: '', title: '', template: 'Pack {packTitle} is open! {packUrl}', active: true });
  const [packInput, setPackInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rRes, lRes] = await Promise.all([
          fetch('/api/admin/sms/rules'),
          fetch('/api/admin/eventLeagues'),
        ]);
        const rData = await rRes.json();
        const lData = await lRes.json();
        if (rData?.success) setRules(rData.rules || []);
        if (lData?.success) setLeagues(lData.leagues || []);
      } catch {}
    })();
  }, []);

  async function saveRule(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data?.success) {
        setRules((prev) => {
          const others = prev.filter(r => r.rule_key !== data.rule.rule_key);
          return [data.rule, ...others];
        });
      }
    } catch {} finally {
      setBusy(false);
    }
  }

  async function setRuleActive(rule, nextActive) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, active: Boolean(nextActive) }),
      });
      const data = await res.json();
      if (data?.success) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: data.rule.active } : r)));
      }
    } catch {} finally {
      setBusy(false);
    }
  }

  async function queuePack() {
    if (!packInput) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/queuePackOpen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: packInput }),
      });
      const data = await res.json();
      // optional: toast
      console.log('queue result', data);
    } catch {} finally { setBusy(false); }
  }

  async function sendQueued() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/sendQueued', { method: 'POST' });
      const data = await res.json();
      console.log('send result', data);
    } catch {} finally { setBusy(false); }
  }

  return (
    <PageContainer>
      <h2 className="text-2xl font-bold mb-4">Admin: SMS</h2>
      {!session?.user?.superAdmin && (
        <p className="text-red-600">You must be an admin to view this page.</p>
      )}
      {session?.user?.superAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded p-4 bg-white">
            <h3 className="text-lg font-semibold mb-2">Rules</h3>
            <form onSubmit={saveRule} className="space-y-2">
              <div>
                <label className="block text-sm text-gray-600">Trigger</label>
                <select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} className="border rounded px-2 py-1 w-full">
                  <option value="pack_open">pack_open</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600">League (optional)</label>
                <select value={form.league} onChange={(e) => setForm({ ...form, league: e.target.value })} className="border rounded px-2 py-1 w-full">
                  <option value="">Global</option>
                  {leagues.map((lg) => (
                    <option key={lg} value={lg}>{lg.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600">Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Template</label>
                <textarea value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} rows={3} className="border rounded px-2 py-1 w-full" />
                <p className="text-xs text-gray-500 mt-1">Vars: {'{packTitle}'} {'{packUrl}'} {'{league}'}</p>
              </div>
              <div className="flex items-center gap-2">
                <input id="active" type="checkbox" className="w-4 h-4" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <label htmlFor="active" className="text-sm">Active</label>
              </div>
              <div>
                <button type="submit" disabled={busy} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">{busy ? 'Saving…' : 'Save Rule'}</button>
              </div>
            </form>

            <div className="mt-3 border rounded p-3 bg-gray-50">
              <h4 className="font-semibold mb-1">Template variable key</h4>
              <ul className="text-xs text-gray-700 space-y-1">
                <li><code>{'{packTitle}'}</code> — Pack title</li>
                <li><code>{'{packUrl}'}</code> — Link to the pack (relative)</li>
                <li><code>{'{league}'}</code> — League code (e.g., nfl, mlb)</li>
              </ul>
            </div>

            <div className="mt-4">
              <h4 className="font-semibold mb-1">Existing Rules</h4>
              <ul className="text-sm space-y-1">
                {rules.map((r) => (
                  <li key={r.id} className="border rounded px-2 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{r.rule_key}</div>
                        <div className="text-gray-600">{r.template}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${r.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                          {r.active ? 'Enabled' : 'Disabled'}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRuleActive(r, !r.active)}
                          className={`px-2 py-1 rounded text-white ${r.active ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'}`}
                        >
                          {r.active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border rounded p-4 bg-white">
            <h3 className="text-lg font-semibold mb-2">Queue and Send</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-sm text-gray-600">Pack ID or URL Slug</label>
                <input value={packInput} onChange={(e) => setPackInput(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="e.g. week1-nfl-pack or a1b2c3d4e5f6" />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={queuePack} disabled={busy || !packInput} className="px-3 py-1 bg-gray-800 hover:bg-black text-white rounded">{busy ? 'Queueing…' : 'Queue Pack Open'}</button>
                <button type="button" onClick={sendQueued} disabled={busy} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded">{busy ? 'Sending…' : 'Send Queued'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}


