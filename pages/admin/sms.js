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
  const [outbox, setOutbox] = useState([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [testers, setTesters] = useState([]);
  const [testerPhone, setTesterPhone] = useState('');
  const [testerName, setTesterName] = useState('');
  const [testMessage, setTestMessage] = useState('Test message from Admin: SMS');
  const [testBusy, setTestBusy] = useState(false);
  // Rule-based test flow state
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [selectedRuleLeague, setSelectedRuleLeague] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [selectedRecipientPhone, setSelectedRecipientPhone] = useState('');
  const [upcomingPacks, setUpcomingPacks] = useState([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState('');

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
      try {
        await fetchOutbox();
      } catch {}
      try {
        await fetchTesters();
      } catch {}
    })();
  }, []);

  async function fetchOutbox() {
    setOutboxLoading(true);
    try {
      const res = await fetch('/api/outbox');
      const data = await res.json();
      if (data?.success) setOutbox(data.outbox || []);
    } catch {
      // noop
    } finally {
      setOutboxLoading(false);
    }
  }

  async function fetchTesters() {
    try {
      const res = await fetch('/api/admin/sms/testers');
      const data = await res.json();
      if (data?.success) setTesters(Array.isArray(data.testers) ? data.testers : []);
    } catch {
      // noop
    }
  }

  function renderTemplate(tpl, vars) {
    let out = String(tpl || '');
    Object.keys(vars || {}).forEach((k) => {
      out = out.replaceAll(`{${k}}`, String(vars[k] ?? ''));
    });
    return out;
  }

  function findRuleById(id) {
    return (rules || []).find((r) => String(r.id) === String(id));
  }

  function computePreviewMessage() {
    const rule = findRuleById(selectedRuleId);
    if (!rule) return '';
    const pack = (upcomingPacks || []).find((p) => String(p.id) === String(selectedPackId));
    const league = (selectedRuleLeague || rule.league || '').toLowerCase();
    const template = String(rule.template || '');
    const packUrlPart = pack ? (pack.pack_url || pack.pack_id) : '';
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin.replace(/\/$/, '') : (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const packUrl = packUrlPart ? ((origin ? `${origin}/packs/${packUrlPart}` : `/packs/${packUrlPart}`)) : '';
    return renderTemplate(template, {
      packTitle: pack?.title || 'New Pack',
      packUrl,
      league,
    });
  }

  async function fetchRecipientsForRule() {
    const rule = findRuleById(selectedRuleId);
    if (!rule) return;
    setRecipientsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('ruleId', rule.id);
      const useLeague = (selectedRuleLeague || rule.league || '').trim().toLowerCase();
      if (!useLeague) {
        // If rule has no league, require selectedRuleLeague
        setRecipients([]);
        return;
      }
      params.set('league', useLeague);
      const res = await fetch(`/api/admin/sms/recipients?${params.toString()}`);
      const data = await res.json();
      if (data?.success) {
        setRecipients(Array.isArray(data.recipients) ? data.recipients : []);
        setSelectedRecipientPhone('');
      }
    } catch {
      // noop
    } finally {
      setRecipientsLoading(false);
    }
  }

  async function fetchUpcomingPacksForRule() {
    const rule = findRuleById(selectedRuleId);
    if (!rule) return;
    setPacksLoading(true);
    try {
      const params = new URLSearchParams();
      const useLeague = (selectedRuleLeague || rule.league || '').trim().toLowerCase();
      if (useLeague) params.set('league', useLeague);
      const res = await fetch(`/api/admin/sms/nextPacks?${params.toString()}`);
      const data = await res.json();
      if (data?.success) {
        setUpcomingPacks(Array.isArray(data.packs) ? data.packs : []);
        setSelectedPackId('');
      }
    } catch {
      // noop
    } finally {
      setPacksLoading(false);
    }
  }

  async function sendTestFromRuleFlow() {
    const msg = computePreviewMessage();
    if (!msg || !selectedRecipientPhone) return;
    setTestBusy(true);
    try {
      // find selected recipient's profileId
      const selectedRecipient = (recipients || []).find((r) => String(r.phone) === String(selectedRecipientPhone));
      const profileId = selectedRecipient?.profile_id;
      const res = await fetch('/api/admin/sms/sendTest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, profileId, phone: selectedRecipientPhone }),
      });
      const data = await res.json();
      console.log('send test (rule flow) result', data);
      try { await fetchOutbox(); } catch {}
    } catch {} finally {
      setTestBusy(false);
    }
  }

  async function addTester(e) {
    e?.preventDefault?.();
    if (!testerPhone) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/testers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testerPhone, name: testerName || undefined }),
      });
      const data = await res.json();
      if (data?.success) {
        setTesters(Array.isArray(data.testers) ? data.testers : []);
        setTesterPhone('');
        setTesterName('');
      }
    } catch {} finally {
      setBusy(false);
    }
  }

  async function removeTester(phone) {
    if (!phone) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/testers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data?.success) setTesters(Array.isArray(data.testers) ? data.testers : []);
    } catch {} finally {
      setBusy(false);
    }
  }

  async function sendTestToNumber() {
    if (!testMessage || !testerPhone) return;
    setTestBusy(true);
    try {
      const res = await fetch('/api/admin/sms/sendTest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testerPhone, message: testMessage }),
      });
      const data = await res.json();
      console.log('send test (number) result', data);
      try { await fetchOutbox(); } catch {}
    } catch {} finally {
      setTestBusy(false);
    }
  }

  async function sendTestToAll() {
    if (!testMessage) return;
    setTestBusy(true);
    try {
      const res = await fetch('/api/admin/sms/sendTest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toAll: true, message: testMessage }),
      });
      const data = await res.json();
      console.log('send test (all) result', data);
      try { await fetchOutbox(); } catch {}
    } catch {} finally {
      setTestBusy(false);
    }
  }

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

  async function deleteRule(rule) {
    if (!confirm(`Are you sure you want to delete the rule "${rule.rule_key}"?`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id }),
      });
      const data = await res.json();
      if (data?.success) {
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
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
      try { await fetchOutbox(); } catch {}
    } catch {} finally { setBusy(false); }
  }

  async function sendQueued() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sms/sendQueued', { method: 'POST' });
      const data = await res.json();
      console.log('send result', data);
      try { await fetchOutbox(); } catch {}
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
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteRule(r)}
                          className="px-2 py-1 rounded text-white bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

      <div className="border rounded p-4 bg-white">
        <h3 className="text-lg font-semibold mb-2">Testers</h3>
        <form onSubmit={addTester} className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-sm text-gray-600">Phone (E.164)</label>
              <input value={testerPhone} onChange={(e) => setTesterPhone(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="+15551234567" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Name (optional)</label>
              <input value={testerName} onChange={(e) => setTesterName(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="Alice" />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={busy || !testerPhone} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded w-full sm:w-auto">{busy ? 'Adding…' : 'Add Tester'}</button>
            </div>
          </div>
        </form>

        <div className="mt-3">
          <h4 className="font-semibold mb-1">Current Testers</h4>
          <ul className="text-sm space-y-1">
            {Array.isArray(testers) && testers.length > 0 ? testers.map((t) => (
              <li key={t.phone} className="border rounded px-2 py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.phone}</div>
                  {t.name ? <div className="text-gray-600">{t.name}</div> : null}
                </div>
                <div>
                  <button type="button" disabled={busy} onClick={() => removeTester(t.phone)} className="px-2 py-1 rounded text-white bg-red-600 hover:bg-red-700">Remove</button>
                </div>
              </li>
            )) : (
              <li className="text-gray-600">No testers added yet.</li>
            )}
          </ul>
        </div>

        <div className="mt-4 space-y-2">
          <div>
            <label className="block text-sm text-gray-600">Test Message</label>
            <textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={2} className="border rounded px-2 py-1 w-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={sendTestToNumber} disabled={testBusy || !testerPhone || !testMessage} className="px-3 py-1 bg-gray-800 hover:bg-black text-white rounded">{testBusy ? 'Sending…' : 'Send Test to Number'}</button>
            <button type="button" onClick={sendTestToAll} disabled={testBusy || !testMessage || (Array.isArray(testers) && testers.length === 0)} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded">{testBusy ? 'Sending…' : 'Send Test to All Testers'}</button>
          </div>
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
                <button type="button" onClick={fetchOutbox} disabled={outboxLoading} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded">{outboxLoading ? 'Refreshing…' : 'Refresh Outbox'}</button>
              </div>
            </div>
          </div>

          <div className="border rounded p-4 bg-white">
            <h3 className="text-lg font-semibold mb-2">Rule-based Test</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600">Select Rule</label>
                <select value={selectedRuleId} onChange={(e) => { setSelectedRuleId(e.target.value); setSelectedRuleLeague(''); setRecipients([]); setUpcomingPacks([]); setSelectedRecipientPhone(''); setSelectedPackId(''); }} className="border rounded px-2 py-1 w-full">
                  <option value="">Select…</option>
                  {rules.map((r) => (
                    <option key={r.id} value={r.id}>{r.rule_key}</option>
                  ))}
                </select>
              </div>
              {!!selectedRuleId && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm text-gray-600">League</label>
                    <select value={selectedRuleLeague} onChange={(e) => setSelectedRuleLeague(e.target.value)} className="border rounded px-2 py-1 w-full">
                      <option value="">{findRuleById(selectedRuleId)?.league ? findRuleById(selectedRuleId)?.league?.toUpperCase() : 'Select League'}</option>
                      {leagues.map((lg) => (
                        <option key={lg} value={lg}>{lg.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={fetchRecipientsForRule} disabled={!selectedRuleId} className="px-3 py-1 bg-gray-800 hover:bg-black text-white rounded w-full sm:w-auto">{recipientsLoading ? 'Loading…' : 'Get Users'}</button>
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={fetchUpcomingPacksForRule} disabled={!selectedRuleId} className="px-3 py-1 bg-gray-800 hover:bg-black text-white rounded w-full sm:w-auto">{packsLoading ? 'Loading…' : 'Next Packs'}</button>
                  </div>
                </div>
              )}

              {recipients.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-600">Select User</label>
                  <select value={selectedRecipientPhone} onChange={(e) => setSelectedRecipientPhone(e.target.value)} className="border rounded px-2 py-1 w-full">
                    <option value="">Select…</option>
                    {recipients.map((r) => (
                      <option key={r.profile_id} value={r.phone}>{r.profile_text_id || r.phone}</option>
                    ))}
                  </select>
                </div>
              )}

              {upcomingPacks.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-600">Select Pack (coming-soon)</label>
                  <select value={selectedPackId} onChange={(e) => setSelectedPackId(e.target.value)} className="border rounded px-2 py-1 w-full">
                    <option value="">Select…</option>
                    {upcomingPacks.map((p) => (
                      <option key={p.id} value={p.id}>{p.title} ({p.pack_url})</option>
                    ))}
                  </select>
                </div>
              )}

              {!!selectedRuleId && (
                <div>
                  <label className="block text-sm text-gray-600">Preview Message</label>
                  <textarea readOnly value={computePreviewMessage()} rows={2} className="border rounded px-2 py-1 w-full bg-gray-50" />
                </div>
              )}

              <div>
                <button type="button" onClick={sendTestFromRuleFlow} disabled={testBusy || !selectedRuleId || !selectedPackId || !selectedRecipientPhone} className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded">{testBusy ? 'Sending…' : 'Send Test SMS'}</button>
              </div>
            </div>
          </div>

          <div className="border rounded p-4 bg-white md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Outbox</h3>
              <button type="button" onClick={fetchOutbox} disabled={outboxLoading} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded">{outboxLoading ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="px-2 py-1">Created</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Recipients</th>
                    <th className="px-2 py-1">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {outbox.map((ob) => {
                    const recCount = Array.isArray(ob.profile_ids) ? ob.profile_ids.length : 0;
                    const created = ob.created_at ? new Date(ob.created_at).toLocaleString() : '';
                    const status = String(ob.status || '').toLowerCase();
                    const badge = status === 'sent' ? 'bg-green-100 text-green-800' : (status === 'ready' ? 'bg-yellow-100 text-yellow-800' : (status === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'));
                    return (
                      <tr key={ob.id} className="border-t">
                        <td className="px-2 py-1 whitespace-nowrap">{created}</td>
                        <td className="px-2 py-1 whitespace-nowrap"><span className={`text-xs px-2 py-0.5 rounded ${badge}`}>{status || 'unknown'}</span></td>
                        <td className="px-2 py-1 whitespace-nowrap">{recCount}</td>
                        <td className="px-2 py-1">
                          <div className="max-w-xl truncate" title={ob.message || ''}>{ob.message || ''}</div>
                        </td>
                      </tr>
                    );
                  })}
                  {(!outbox || outbox.length === 0) && (
                    <tr>
                      <td className="px-2 py-2 text-gray-500" colSpan={4}>{outboxLoading ? 'Loading…' : 'No outbox messages yet.'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}


