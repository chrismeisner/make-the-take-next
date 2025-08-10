import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import EventSelector from "../../components/EventSelector";

export default function AdminTestAIPage() {
  const { data: session } = useSession();

  const [league, setLeague] = useState("mlb");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState("");
  const [model, setModel] = useState("gpt-5");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(150);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [defaultServerModel, setDefaultServerModel] = useState(null);
  const [lastRunMs, setLastRunMs] = useState(null);
  const [lastStatus, setLastStatus] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/aiConfig");
        const data = await res.json();
        if (data.success) setDefaultServerModel(data.defaultModel);
      } catch {}
    })();
  }, []);

  const defaultSummaryPrompt = useMemo(() => {
    if (!selectedEvent) return "";
    const awayRaw = selectedEvent.awayTeam;
    const homeRaw = selectedEvent.homeTeam;
    const away = Array.isArray(awayRaw) ? awayRaw[0] : awayRaw || "";
    const home = Array.isArray(homeRaw) ? homeRaw[0] : homeRaw || "";
    const eventDate = selectedEvent?.eventTime
      ? new Date(selectedEvent.eventTime).toLocaleString()
      : "";
    const lg = selectedEvent.eventLeague || league || "";
    return `Write a 30 words max summary previewing the upcoming game between ${away} and ${home} on ${eventDate} in the ${lg}, use relevant narratives and stats. A good example is: "Matthews (5.67 ERA, 42 K) opposes Paddack (4.77 ERA, 88 K) as Tigers (66–48) aim to extend their four-game win streak over Twins (52–60)."`;
  }, [selectedEvent, league]);

  useEffect(() => {
    if (defaultSummaryPrompt) {
      setPrompt(defaultSummaryPrompt);
    }
  }, [defaultSummaryPrompt]);

  async function handleRunTest() {
    setLoading(true);
    setError("");
    setResult(null);
    const startedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    try {
      // Log request parameters (truncate long text for readability)
      console.log("[Test AI] Run Test clicked", {
        model,
        temperature,
        maxTokens,
        league,
        selectedEventId: selectedEvent?.id || null,
        eventTitle: selectedEvent?.eventTitle || null,
        promptLength: prompt?.length || 0,
        promptPreview: (prompt || "").slice(0, 200),
        contextLength: context?.length || 0,
        contextPreview: (context || "").slice(0, 200),
      });

      const payload = { prompt, context, model, max_tokens: maxTokens };
      if (!(typeof model === 'string' && model.startsWith('gpt-5'))) {
        payload.temperature = temperature;
      }
      const res = await fetch("/api/admin/testAI", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const elapsedMs = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - startedAt;
      console.log("[Test AI] Response received", { status: res.status, ok: res.ok, elapsedMs });
      setLastRunMs(Math.round(elapsedMs));
      setLastStatus(res.status);

      const data = await res.json();
      console.log("[Test AI] Parsed response", {
        success: data?.success,
        model: data?.model,
        total_tokens: data?.total_tokens,
        prompt_tokens: data?.prompt_tokens,
        completion_tokens: data?.completion_tokens,
        summaryPreview: (data?.summary || "").slice(0, 200),
      });

      if (!data.success) throw new Error(data.error || "Test failed");
      setResult(data);
    } catch (err) {
      console.error("[Test AI] Error during run", err);
      setError(err.message);
    } finally {
      const finishedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      console.log("[Test AI] Run finished", { totalElapsedMs: finishedAt - startedAt });
      setLoading(false);
    }
  }

  if (!session?.user) {
    return <div className="p-4">Not logged in.</div>;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Test AI (Prompts)</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Controls */}
        <div className="space-y-4">
          <div className="p-3 border rounded">
            <h2 className="text-lg font-semibold mb-2">Select League & Event</h2>
            <div className="flex items-center gap-2 mb-2">
              <label htmlFor="league" className="text-sm">League</label>
              <select
                id="league"
                value={league}
                onChange={(e) => setLeague(e.target.value)}
                className="px-2 py-1 border rounded"
              >
                <option value="mlb">MLB</option>
                <option value="nfl">NFL</option>
              </select>
              <EventSelector
                league={league}
                selectedEvent={selectedEvent}
                onSelect={(evt) => setSelectedEvent(evt)}
              />
            </div>
            {selectedEvent && (
              <div className="text-sm text-gray-700">
                <div className="font-medium">{selectedEvent.eventTitle}</div>
                <div>{new Date(selectedEvent.eventTime).toLocaleString()}</div>
              </div>
            )}
          </div>

          <div className="p-3 border rounded">
            <h2 className="text-lg font-semibold mb-2">Prompt</h2>
            <textarea
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full border rounded px-2 py-1"
              placeholder="Enter your test prompt here"
            />
            <p className="text-xs text-gray-500 mt-1">Default is generated from the Generate Summary format for the selected event.</p>
          </div>

          <div className="p-3 border rounded">
            <h2 className="text-lg font-semibold mb-2">Additional Context (optional)</h2>
            <textarea
              rows={6}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full border rounded px-2 py-1"
              placeholder="Paste any latest news or stats here to condition the model."
            />
          </div>

          <div className="p-3 border rounded">
            <h2 className="text-lg font-semibold mb-2">Model & Settings</h2>
            <div className="text-sm text-gray-600 mb-2">
              {defaultServerModel ? (
                <span>Default summary model: <span className="font-medium">{defaultServerModel}</span></span>
              ) : (
                <span>Loading default model…</span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-sm">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="px-2 py-1 border rounded"
                >
                  <option value="gpt-5-mini">gpt-5-mini</option>
                  <option value="gpt-5">gpt-5</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                </select>
              </div>
              <div>
                <label className="block text-sm">Temperature</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="px-2 py-1 border rounded w-24"
                  disabled={typeof model === 'string' && model.startsWith('gpt-5')}
                />
                {typeof model === 'string' && model.startsWith('gpt-5') && (
                  <p className="text-xs text-gray-500 mt-1">Temperature not used for GPT‑5 models.</p>
                )}
              </div>
              <div>
                <label className="block text-sm">Max tokens</label>
                <input
                  type="number"
                  min="1"
                  max="4096"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 0)}
                  className="px-2 py-1 border rounded w-24"
                />
              </div>
              <button
                onClick={handleRunTest}
                disabled={loading}
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Running..." : "Run Test"}
              </button>
            </div>
          </div>

          {error && <div className="p-3 border rounded text-red-600">{error}</div>}
        </div>

        {/* Right: Response */}
        <div className="space-y-4">
          <div className="p-3 border rounded min-h-[200px]">
            <h2 className="text-lg font-semibold mb-2">Response</h2>
            {loading && <div className="text-sm text-gray-600">Running…</div>}
            {!loading && !result && !error && (
              <div className="text-sm text-gray-500">No response yet. Run a test to see output.</div>
            )}
            {result && (
              <>
                <div>
                  <h3 className="font-medium mb-1">Summary</h3>
                  <div className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-2 max-h-[40vh] overflow-auto">
                    {typeof result.summary === 'string' && result.summary.length > 0 ? (
                      result.summary
                    ) : (
                      <em>(empty completion)</em>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-700 space-x-3">
                  {typeof lastStatus === 'number' && <span>Status: {lastStatus}</span>}
                  {typeof lastRunMs === 'number' && <span>Time: {lastRunMs} ms</span>}
                  {result.model && <span>Model: {result.model}</span>}
                  {typeof result.total_tokens === 'number' && <span>Tokens: {result.total_tokens}</span>}
                </div>
              </>
            )}
          </div>
          {result && (
            <div className="p-3 border rounded">
              <h3 className="font-medium mb-2">Raw JSON</h3>
              <pre className="text-xs bg-gray-50 border rounded p-2 overflow-auto max-h-[50vh]">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


