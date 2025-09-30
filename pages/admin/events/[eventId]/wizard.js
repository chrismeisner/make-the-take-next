import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function AIPropCreationWizardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { eventId } = router.query;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState('');
  const [editableResponse, setEditableResponse] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4.1');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(300);
  const [useCustomMax, setUseCustomMax] = useState(false);
  const [citations, setCitations] = useState([]);
  const [sources, setSources] = useState([]);
  const [numProps, setNumProps] = useState(10);
  const [step1Prompt, setStep1Prompt] = useState('');
  const [hasEditedStep1Prompt, setHasEditedStep1Prompt] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error, setStep2Error] = useState('');
  const [step2Result, setStep2Result] = useState('');
  const [step2Citations, setStep2Citations] = useState([]);
  const [step2Sources, setStep2Sources] = useState([]);

  useEffect(() => {
    if (status !== 'authenticated' || !eventId) return;
    const fetchEvent = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`);
        const j = await r.json();
        if (j?.success) setEvent(j.event);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load event for wizard:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [status, eventId]);

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }
  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-2">AI Prop Creation Wizard</h1>
      <p className="text-sm text-gray-600 mb-6">Linked to event <span className="font-mono">{eventId}</span></p>

      <div className="mb-6 p-4 bg-white border rounded">
        <h2 className="text-lg font-semibold mb-2">Event</h2>
        {loading && <div>Loading event…</div>}
        {!loading && event && (
          <div className="text-sm text-gray-800 space-y-1">
            <div><span className="font-medium">Title:</span> {event.eventTitle || '—'}</div>
            <div><span className="font-medium">Time:</span> {event.eventTime || '—'}</div>
            <div><span className="font-medium">League:</span> {event.eventLeague || '—'}</div>
          </div>
        )}
        {!loading && !event && (
          <div className="text-sm text-gray-700">No event details found.</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        <section className="p-4 bg-white border rounded">
          <h3 className="text-base font-semibold mb-2">Step 1: Generate prompt</h3>
          <p className="text-sm text-gray-600 mb-3">Copy this prompt and paste into your external AI tool.</p>
          {(() => {
            const homeName = event?.homeTeamName || (Array.isArray(event?.homeTeam) ? event?.homeTeam?.[0] : null);
            const awayName = event?.awayTeamName || (Array.isArray(event?.awayTeam) ? event?.awayTeam?.[0] : null);
            const titleOrMatchup = (homeName && awayName) ? `${awayName} at ${homeName}` : (event?.eventTitle || 'this event');
            const time = event?.eventTime ? new Date(event.eventTime).toLocaleString() : 'the scheduled time';
            const defaultPrompt = `Look into the storyline and narratives around the ${titleOrMatchup} at ${time}, create ${numProps} things that fans are looking for and watching for in the game, and for each have each be based on a "vegas style bet" ie a bet that would be made and graded in an app like draft kings, that would "settle" this narrative or storyline, making a list of top ${numProps} betting propositions around this game.\n\nFor the final output, only list the ${numProps} propositions in a format like (below are 3 examples, but all ${numProps} will follow this format): \n\n1. Which QB throws for more yards?\n2. Will Saquon Barkley score a touchdown at any time in the game?\n3. Will Chris Godwin record over 3.5 receptions in the game?\n\nprint ONLY the ${numProps} propositions numbered, NO additional text in the response`;
            return (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-sm text-gray-700">Props to ask for</label>
                  <select
                    className="px-2 py-2 border rounded text-sm bg-white"
                    value={numProps}
                    onChange={(e) => setNumProps(Number(e.target.value))}
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prompt</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={6}
                  value={hasEditedStep1Prompt ? step1Prompt : defaultPrompt}
                  onChange={(e) => { setHasEditedStep1Prompt(true); setStep1Prompt(e.target.value); }}
                />
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <label className="text-sm text-gray-700">Model</label>
                  <select
                    className="px-2 py-2 border rounded text-sm bg-white"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    <option value="gpt-4.1">gpt-4.1 (web search)</option>
                    <option value="gpt-4.1-mini">gpt-4.1-mini (web search)</option>
                    <option value="gpt-4o">gpt-4o (web search)</option>
                    <option value="gpt-4o-mini">gpt-4o-mini (web search)</option>
                  </select>
                  <label className="ml-2 text-sm text-gray-700">Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    className="px-2 py-2 border rounded text-sm w-20"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                  />
                  <label className="ml-2 text-sm text-gray-700" title="Allowed range: 1 to (128000 - input tokens)">Max output tokens</label>
                  {!useCustomMax ? (
                    <>
                      <select
                        className="px-2 py-2 border rounded text-sm bg-white"
                        value={[300,400,420,500,600,750,1000].includes(Number(maxTokens)) ? Number(maxTokens) : 300}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                      >
                        <option value={300}>300</option>
                        <option value={400}>400</option>
                        <option value={420}>420</option>
                        <option value={500}>500</option>
                        <option value={600}>600</option>
                        <option value={750}>750</option>
                        <option value={1000}>1000</option>
                      </select>
                      <button
                        type="button"
                        className="text-xs text-blue-600 underline ml-1"
                        onClick={() => setUseCustomMax(true)}
                      >
                        custom
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        max="128000"
                        className="px-2 py-2 border rounded text-sm w-28"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                      />
                      <button
                        type="button"
                        className="text-xs text-blue-600 underline ml-1"
                        onClick={() => setUseCustomMax(false)}
                      >
                        presets
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                    disabled={!event}
                    onClick={async () => {
                      try {
                        const effectivePrompt = hasEditedStep1Prompt ? step1Prompt : defaultPrompt;
                        await navigator.clipboard.writeText(effectivePrompt);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch (e) {
                        // eslint-disable-next-line no-alert
                        alert('Failed to copy prompt');
                      }
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy prompt'}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                    disabled={!event || genLoading}
                    onClick={async () => {
                      try {
                        setGenLoading(true);
                        setGenError('');
                        setGenResult('');
                        const effectivePrompt = hasEditedStep1Prompt ? step1Prompt : defaultPrompt;
                        const r = await fetch('/api/admin/testAI', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: effectivePrompt, useWebSearch: true, model: selectedModel, temperature, max_tokens: maxTokens })
                        });
                        const j = await r.json();
                        if (!r.ok || !j?.success) throw new Error(j?.error || 'AI request failed');
                        setGenResult(j.summary || '');
                        setEditableResponse(j.summary || '');
                        setCitations(Array.isArray(j.citations) ? j.citations : []);
                        setSources(Array.isArray(j.sources) ? j.sources : []);
                      } catch (e) {
                        setGenError(e.message || 'Failed to generate');
                      } finally {
                        setGenLoading(false);
                      }
                    }}
                  >
                    {genLoading ? 'Generating…' : 'Generate'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  <div className="inline-block px-2 py-1 bg-gray-50 border rounded">
                    <span className="mr-2">Endpoint: responses</span>
                    <span className="mr-2">tools: [web_search]</span>
                    <span className="mr-2">model: {selectedModel}</span>
                    <span className="mr-2">temperature: {typeof temperature === 'number' ? temperature : 0.7}</span>
                    <span>max_output_tokens: {Math.min(128000, Number(maxTokens) || 150)}</span>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Generated response (editable)</label>
                  <textarea
                    className="w-full border rounded px-3 py-2 text-sm"
                    rows={8}
                    placeholder="Paste an external AI response here, or edit the generated response..."
                    value={editableResponse}
                    onChange={(e) => setEditableResponse(e.target.value)}
                  />
                </div>
              </div>
            );
          })()}
        </section>
        <section className="p-4 bg-white border rounded">
          <h3 className="text-base font-semibold mb-2">Step 2: Summaries for each proposition</h3>
          {(() => {
            const list = (editableResponse || '').trim();
            const step2Prompt = list
              ? `For each of the following proposition(s):\n\n${list}\n\nresearch and create a brief but informative and stat filled summary for each of the listed propositions. Each summary should be 50 words maximum and only include the final stat-filled copy listed cleanly ie:\n\n1. Rodgers (447 yds, 5 TD) leads favored Steelers vs. Maye’s surging Patriots, who miss CB Gonzalez but boast offensive momentum.\n2. Webb (3.21 ERA, 181 K) faces Miller (3.88 ERA, 152 K) as Giants (78–70) chase a Wild Card spot against division-leading Dodgers (92–56) in a crucial NL West clash.\n3. Strider (6–13, 4.64 ERA) faces Mize (14–5, 3.88) as surging Braves seek eighth straight vs. slumping, desperate Tigers.`
              : 'Add propositions in Step 1 to generate summaries.';
            return (
              <div>
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <label className="text-sm text-gray-700">Model</label>
                  <select
                    className="px-2 py-2 border rounded text-sm bg-white"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    <option value="gpt-4.1">gpt-4.1 (web search)</option>
                    <option value="gpt-4.1-mini">gpt-4.1-mini (web search)</option>
                    <option value="gpt-4o">gpt-4o (web search)</option>
                    <option value="gpt-4o-mini">gpt-4o-mini (web search)</option>
                  </select>
                  <label className="ml-2 text-sm text-gray-700">Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    className="px-2 py-2 border rounded text-sm w-20"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                  />
                  <label className="ml-2 text-sm text-gray-700" title="Allowed range: 1 to (128000 - input tokens)">Max output tokens</label>
                  {!useCustomMax ? (
                    <>
                      <select
                        className="px-2 py-2 border rounded text-sm bg-white"
                        value={[300,400,420,500,600,750,1000].includes(Number(maxTokens)) ? Number(maxTokens) : 300}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                      >
                        <option value={300}>300</option>
                        <option value={400}>400</option>
                        <option value={420}>420</option>
                        <option value={500}>500</option>
                        <option value={600}>600</option>
                        <option value={750}>750</option>
                        <option value={1000}>1000</option>
                      </select>
                      <button
                        type="button"
                        className="text-xs text-blue-600 underline ml-1"
                        onClick={() => setUseCustomMax(true)}
                      >
                        custom
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        max="128000"
                        className="px-2 py-2 border rounded text-sm w-28"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                      />
                      <button
                        type="button"
                        className="text-xs text-blue-600 underline ml-1"
                        onClick={() => setUseCustomMax(false)}
                      >
                        presets
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                    disabled={!list || step2Loading}
                    onClick={async () => {
                      try {
                        setStep2Loading(true);
                        setStep2Error('');
                        setStep2Result('');
                        setStep2Citations([]);
                        setStep2Sources([]);
                        const r = await fetch('/api/admin/testAI', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: step2Prompt, useWebSearch: true, model: selectedModel, temperature, max_tokens: maxTokens })
                        });
                        const j = await r.json();
                        if (!r.ok || !j?.success) throw new Error(j?.error || 'AI request failed');
                        setStep2Result(j.summary || '');
                        setStep2Citations(Array.isArray(j.citations) ? j.citations : []);
                        setStep2Sources(Array.isArray(j.sources) ? j.sources : []);
                      } catch (e) {
                        setStep2Error(e.message || 'Failed to generate');
                      } finally {
                        setStep2Loading(false);
                      }
                    }}
                  >
                    {step2Loading ? 'Generating…' : 'Generate'}
                  </button>
                  {!list && (
                    <span className="text-xs text-gray-600">Provide propositions in Step 1 to enable generation.</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  <div className="inline-block px-2 py-1 bg-gray-50 border rounded">
                    <span className="mr-2">Endpoint: responses</span>
                    <span className="mr-2">tools: [web_search]</span>
                    <span className="mr-2">model: {selectedModel}</span>
                    <span className="mr-2">temperature: {typeof temperature === 'number' ? temperature : 0.7}</span>
                    <span>max_output_tokens: {Math.min(128000, Number(maxTokens) || 150)}</span>
                  </div>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Step 2 Prompt</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={6}
                  readOnly
                  value={step2Prompt}
                />
              </div>
            );
          })()}

          {!step2Loading && !step2Error && !step2Result && (
            <p className="mt-3 text-sm text-gray-600">Click Generate to fetch summaries using web search.</p>
          )}
          {step2Loading && (
            <p className="mt-3 text-sm text-gray-700">Generating…</p>
          )}
          {step2Error && (
            <p className="mt-3 text-sm text-red-700">{step2Error}</p>
          )}
          {!step2Loading && !step2Error && step2Result && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Summaries</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                rows={10}
                readOnly
                value={step2Result}
              />
              {(Array.isArray(step2Citations) && step2Citations.length > 0) && (
                <div className="mt-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">Citations</div>
                  <ul className="list-disc list-inside text-sm text-blue-700">
                    {step2Citations.map((c, idx) => (
                      <li key={`${c.url}-${idx}`}>
                        <a className="underline" href={c.url} target="_blank" rel="noopener noreferrer">{c.title || c.url}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(Array.isArray(step2Sources) && step2Sources.length > 0) && (
                <div className="mt-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">All sources</div>
                  <ul className="list-disc list-inside text-sm text-blue-700">
                    {step2Sources.map((s, idx) => (
                      <li key={`${s.url}-${idx}`}>
                        <a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
        <section className="p-4 bg-white border rounded">
          <h3 className="text-base font-semibold mb-1">Step 3: Review and create</h3>
          <p className="text-sm text-gray-600">Confirm selections and create props for this event.</p>
        </section>
      </div>
    </div>
  );
}


