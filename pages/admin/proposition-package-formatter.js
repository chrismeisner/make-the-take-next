import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export default function PropositionPackageFormatterPage() {
  const { data: session } = useSession();
  const [raw, setRaw] = useState("");
  const [context, setContext] = useState("");
  const [model, setModel] = useState("gpt-4.1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [defaultServerModel, setDefaultServerModel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [writeSummary, setWriteSummary] = useState(false);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packs, setPacks] = useState([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState("");
  const [statPrompt, setStatPrompt] = useState("");
  const [statPromptPhase, setStatPromptPhase] = useState("idle"); // 'idle' | 'creating' | 'ready' | 'copied'
  const MODEL_OPTIONS = [
    "gpt-5-mini",
    "gpt-5",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
  ];

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/aiConfig");
        const data = await res.json();
        if (data.success) setDefaultServerModel(data.defaultModel);
      } catch {}
    })();
  }, []);

  const effectiveModel = useMemo(() => model || defaultServerModel || "gpt-5-mini", [model, defaultServerModel]);

  // Editable fields populated from AI output (or left blank initially)
  const [fields, setFields] = useState({
    propShort: "",
    propSummary: "",
    PropSideAShort: "",
    PropSideBShort: "",
    PropSideATake: "",
    PropSideBTake: "",
    PropSideAMoneyline: "",
    PropSideBMoneyline: "",
    eventId: "",
    packId: "",
  });

  const toQuestion = (val) => {
    try {
      const s = String(val || "").trim();
      if (!s) return "";
      if (/\?$/.test(s)) return s;
      if (/^(how|what|who|which|will|does|do|is|are|can|should|could|would|did|has|have|had)\b/i.test(s)) {
        return `${s}?`;
      }
      // Default to a "Will ...?" phrasing
      const withoutWill = s.replace(/^\s*will\s+/i, "");
      return `Will ${withoutWill}?`;
    } catch { return String(val || ""); }
  };

  const formattedOutput = useMemo(() => {
    const fmtMl = (val) => {
      try {
        if (val === "" || val == null) return "";
        const n = parseInt(val, 10);
        if (!Number.isFinite(n)) return String(val);
        return n > 0 ? `+${n}` : String(n);
      } catch { return String(val || ""); }
    };
    const lines = [];
    if (fields.propShort) lines.push(`A. Proposition: ${fields.propShort}`);
    if (fields.PropSideAShort) lines.push(`B. Take side 1: ${fields.PropSideAShort}`);
    if (fields.PropSideAMoneyline !== "") lines.push(`C. Take side 1 value: ${fmtMl(fields.PropSideAMoneyline)}`);
    if (fields.PropSideBShort) lines.push(`D. Take side 2: ${fields.PropSideBShort}`);
    if (fields.PropSideBMoneyline !== "") lines.push(`E. Take side 2 value: ${fmtMl(fields.PropSideBMoneyline)}`);
    if (fields.PropSideATake) lines.push(`F. Prop side A take statement: ${fields.PropSideATake}`);
    if (fields.PropSideBTake) lines.push(`G. Prop side B take statement: ${fields.PropSideBTake}`);
    return lines.join("\n");
  }, [fields]);

  const generateStatPrompt = async () => {
    const base = (raw || '').trim();
    if (!base) return;
    try {
      setStatPromptPhase('creating');
      const res = await fetch('/api/admin/formatProposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base, context, model: effectiveModel, includeSummary: false }),
      });
      const data = await res.json().catch(() => ({}));
      const shortQ = (data && data.formatted && data.formatted.propShort) ? String(data.formatted.propShort) : base;
      const header = 'Research stats, recent performance, injuries, and relevant metrics to evaluate the following proposition:';
      const text = `${header}\n${shortQ}`;
      setStatPrompt(text);
      setStatPromptPhase('ready');
    } catch {
      const baseOnly = (raw || '').trim();
      if (!baseOnly) return;
      const header = 'Research stats, recent performance, injuries, and relevant metrics to evaluate the following proposition:';
      setStatPrompt(`${header}\n${baseOnly}`);
      setStatPromptPhase('ready');
    }
  };

  const handleCopyStatPrompt = async () => {
    try {
      if (statPromptPhase === 'creating') return;
      if (statPromptPhase !== 'ready' || !statPrompt) {
        await generateStatPrompt();
        return;
      }
      await navigator.clipboard.writeText(statPrompt);
      setStatPromptPhase('copied');
      setTimeout(() => setStatPromptPhase('ready'), 1200);
    } catch {}
  };

  const canCreate = useMemo(() => Boolean(fields.propShort && (fields.packId || fields.eventId)), [fields]);
  const canCreateViaModal = useMemo(() => Boolean(fields.propShort), [fields]);

  async function handleFormat() {
    const t0 = Date.now();
    try { console.log('[formatter] Format clicked', { model: effectiveModel, rawLength: (raw||'').length, contextLength: (context||'').length }); } catch {}
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const payload = { raw, context, model: effectiveModel, includeSummary: !!writeSummary };
      try { console.log('[formatter] POST /api/admin/formatProposition payload', payload); } catch {}
      const res = await fetch("/api/admin/formatProposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const status = res.status;
      const data = await res.json().catch(() => ({}));
      try { console.log('[formatter] Response', { status, ok: res.ok, success: data?.success, keys: Object.keys(data||{}) }); } catch {}
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to format proposition");
      setResult(data);
      const f = data.formatted || {};
      setFields({
        propShort: toQuestion(f.propShort || ""),
        propSummary: String(f.propSummary || ""),
        PropSideAShort: f.PropSideAShort || "",
        PropSideBShort: f.PropSideBShort || "",
        PropSideATake: f.PropSideATake || "",
        PropSideBTake: f.PropSideBTake || "",
        PropSideAMoneyline: Number.isFinite(f?.PropSideAMoneyline) ? String(f.PropSideAMoneyline) : "",
        PropSideBMoneyline: Number.isFinite(f?.PropSideBMoneyline) ? String(f.PropSideBMoneyline) : "",
        eventId: f.eventId || "",
        packId: f.packId || "",
      });
      try { console.log('[formatter] Success', { propShort: f.propShort, PropSideAShort: f.PropSideAShort, PropSideBShort: f.PropSideBShort }); } catch {}
    } catch (e) {
      try { console.error('[formatter] Error', e?.message || e); } catch {}
      setError(e.message);
    } finally {
      const dt = Date.now() - t0;
      try { console.log('[formatter] Done', { elapsedMs: dt }); } catch {}
      setLoading(false);
    }
  }

  async function handleCreateProp() {
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");
    try {
      const payload = {
        propShort: toQuestion(fields.propShort),
        ...(writeSummary && fields.propSummary ? { propSummary: fields.propSummary } : {}),
        PropSideAShort: fields.PropSideAShort,
        PropSideBShort: fields.PropSideBShort,
        PropSideATake: fields.PropSideATake || undefined,
        PropSideBTake: fields.PropSideBTake || undefined,
        ...(fields.PropSideAMoneyline !== "" ? { PropSideAMoneyline: parseInt(fields.PropSideAMoneyline, 10) } : {}),
        ...(fields.PropSideBMoneyline !== "" ? { PropSideBMoneyline: parseInt(fields.PropSideBMoneyline, 10) } : {}),
        ...(fields.eventId ? { eventId: fields.eventId } : {}),
        ...(fields.packId ? { packId: fields.packId } : {}),
        propType: "moneyline",
      };
      const res = await fetch("/api/props", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create prop");
      setCreateSuccess("Prop created.");
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }

  if (!session?.user) {
    return <div className="p-4">Not logged in.</div>;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Proposition Package Formatter</h1>
        <Link href="/admin">
          <span className="text-blue-600 hover:underline">Back to Admin</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-4">
          <div className="p-3 border rounded">
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">{`Default (${defaultServerModel || "gpt-5-mini"})`}</option>
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 border rounded">
              <label className="block text-sm font-medium text-gray-700 mb-1">Raw Proposition</label>
              <textarea
                className="w-full h-40 px-3 py-2 border rounded"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="e.g., Yankees vs Red Sox tonight. Over/Under 8.5 runs, lines around -110 each."
              />
            </div>

            <div className="p-3 border rounded">
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Context (optional)</label>
              <textarea
                className="w-full h-32 px-3 py-2 border rounded"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Any extra notes, links, or constraints."
              />
            </div>
          </div>

          <button
            onClick={handleFormat}
            disabled={loading || !raw}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Formatting…" : "Format Proposition"}
          </button>

          <div className="flex items-center gap-2">
            <input
              id="write-summary"
              type="checkbox"
              checked={writeSummary}
              onChange={(e) => setWriteSummary(e.target.checked)}
            />
            <label htmlFor="write-summary" className="text-sm text-gray-800">Write summary</label>
            <button
              type="button"
              onClick={handleCopyStatPrompt}
              className="ml-3 px-3 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={statPromptPhase === 'creating'}
              title="Copy a prompt to search for stats and metrics">
              {statPromptPhase === 'creating' ? 'Creating prompt' : (statPromptPhase === 'copied' ? 'Copied!' : 'Copy prompt')}
            </button>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="space-y-4">
          <div className="p-3 border rounded">
            <h2 className="text-lg font-semibold mb-2">Fields</h2>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">propShort</label>
              <input className="w-full px-3 py-2 border rounded" value={fields.propShort} onChange={(e) => setFields((s) => ({ ...s, propShort: e.target.value }))} />
            </div>
            {writeSummary && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">propSummary</label>
                <textarea className="w-full px-3 py-2 border rounded" rows={2} value={fields.propSummary} onChange={(e) => setFields((s) => ({ ...s, propSummary: e.target.value }))} placeholder="e.g., Rodgers (447 yds, 5 TD) leads favored Steelers vs. Maye’s surging Patriots..." />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded p-3 bg-gray-50">
                <div className="text-sm font-semibold mb-2">Side A</div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Short label</label>
                <input className="w-full px-3 py-2 border rounded mb-2" value={fields.PropSideAShort} onChange={(e) => setFields((s) => ({ ...s, PropSideAShort: e.target.value }))} />
                <label className="block text-sm font-medium text-gray-700 mb-1">Take statement</label>
                <input className="w-full px-3 py-2 border rounded mb-2" placeholder="e.g., Cristopher Sanchez throws 7+ strikeouts" value={fields.PropSideATake} onChange={(e) => setFields((s) => ({ ...s, PropSideATake: e.target.value }))} />
                <label className="block text-sm font-medium text-gray-700 mb-1">Moneyline</label>
                <input className="w-full px-3 py-2 border rounded" type="number" value={fields.PropSideAMoneyline} onChange={(e) => setFields((s) => ({ ...s, PropSideAMoneyline: e.target.value }))} />
              </div>
              <div className="border rounded p-3 bg-gray-50">
                <div className="text-sm font-semibold mb-2">Side B</div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Short label</label>
                <input className="w-full px-3 py-2 border rounded mb-2" value={fields.PropSideBShort} onChange={(e) => setFields((s) => ({ ...s, PropSideBShort: e.target.value }))} />
                <label className="block text-sm font-medium text-gray-700 mb-1">Take statement</label>
                <input className="w-full px-3 py-2 border rounded mb-2" placeholder="e.g., Jose Ramirez hits a home run" value={fields.PropSideBTake} onChange={(e) => setFields((s) => ({ ...s, PropSideBTake: e.target.value }))} />
                <label className="block text-sm font-medium text-gray-700 mb-1">Moneyline</label>
                <input className="w-full px-3 py-2 border rounded" type="number" value={fields.PropSideBMoneyline} onChange={(e) => setFields((s) => ({ ...s, PropSideBMoneyline: e.target.value }))} />
              </div>
            </div>
            {result && !result.formatted && (
              <div className="mt-3">
                <p className="text-sm text-amber-700">Model returned non-JSON. Raw text:</p>
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-64">{result.rawText || result.outputText || ""}</pre>
              </div>
            )}
          </div>

          <div className="p-3 border rounded">
            <h3 className="text-md font-semibold mb-2">Formatted Output (A–E)</h3>
            <pre className="text-sm bg-gray-50 p-2 rounded overflow-auto min-h-[4rem]">{formattedOutput || "(empty)"}</pre>
          </div>

          <div className="p-3 border rounded">
            <h3 className="text-md font-semibold mb-2">Raw Output</h3>
            <pre className="text-sm bg-gray-50 p-2 rounded overflow-auto max-h-64">{(result && (result.rawText || result.outputText)) || "(empty)"}</pre>
          </div>

          <div className="p-3 border rounded">
            <h3 className="text-md font-semibold mb-2">Create Prop</h3>
            <p className="text-xs text-gray-600 mb-2">Creates a moneyline prop using the formatted output. You can edit fields after creation on the prop editor page.</p>
            <button
              onClick={handleCreateProp}
              disabled={creating || !canCreate}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create Prop"}
            </button>
            {createError && <p className="text-red-600 text-sm mt-2">{createError}</p>}
            {createSuccess && <p className="text-green-700 text-sm mt-2">{createSuccess}</p>}
            <div className="mt-3">
              <button
                type="button"
                onClick={async () => {
                  setPackModalOpen(true);
                  setPacksLoading(true);
                  setPacksError("");
                  try {
                    const res = await fetch('/api/packs');
                    const data = await res.json();
                    if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load packs');
                    const list = Array.isArray(data.packs) ? data.packs.filter(p => String(p.packStatus || '').toLowerCase() !== 'graded') : [];
                    setPacks(list);
                  } catch (e) {
                    setPacksError(e.message || 'Failed to load packs');
                  } finally {
                    setPacksLoading(false);
                  }
                }}
                disabled={!canCreateViaModal}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Create proposition
              </button>
            </div>
          </div>
        </div>
      </div>
      {packModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded shadow-lg w-full max-w-4xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Select a Pack</h3>
              <button type="button" onClick={() => setPackModalOpen(false)} className="text-gray-600 hover:text-gray-900">✕</button>
            </div>
            {packsError && <div className="mb-2 text-sm text-red-600">{packsError}</div>}
            {packsLoading ? (
              <div className="text-sm text-gray-600">Loading packs…</div>
            ) : (
              <div className="overflow-auto max-h-[60vh] border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">Title</th>
                      <th className="text-left px-3 py-2">League</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Props</th>
                      <th className="text-left px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(packs || []).map((p) => (
                      <tr key={p.airtableId} className="border-t">
                        <td className="px-3 py-2">{p.packTitle}</td>
                        <td className="px-3 py-2">{p.packLeague || '—'}</td>
                        <td className="px-3 py-2">{p.packStatus || '—'}</td>
                        <td className="px-3 py-2">{p.propsCount ?? 0}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            onClick={() => {
                              try {
                                const qs = new URLSearchParams();
                                qs.set('prefill', '1');
                                qs.set('propShort', fields.propShort || '');
                                if (fields.propSummary) qs.set('propSummary', fields.propSummary);
                                if (fields.PropSideAShort) qs.set('PropSideAShort', fields.PropSideAShort);
                                if (fields.PropSideBShort) qs.set('PropSideBShort', fields.PropSideBShort);
                                if (fields.PropSideATake) qs.set('PropSideATake', fields.PropSideATake);
                                if (fields.PropSideBTake) qs.set('PropSideBTake', fields.PropSideBTake);
                                if (fields.PropSideAMoneyline !== '') qs.set('PropSideAMoneyline', String(fields.PropSideAMoneyline));
                                if (fields.PropSideBMoneyline !== '') qs.set('PropSideBMoneyline', String(fields.PropSideBMoneyline));
                                const href = `/admin/packs/${encodeURIComponent(p.airtableId)}/create-prop?${qs.toString()}`;
                                window.location.assign(href);
                              } catch {}
                            }}
                          >
                            Use this pack
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!packs || packs.length === 0) && (
                      <tr>
                        <td className="px-3 py-4 text-center text-gray-600" colSpan={5}>No packs found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setPackModalOpen(false)} className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


