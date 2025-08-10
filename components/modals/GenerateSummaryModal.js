import React, { useState } from 'react';
import GlobalModal from '../modals/GlobalModal';

export default function GenerateSummaryModal({ isOpen, onClose, defaultPrompt, serverPrompt, defaultModel = 'gpt-4.1', onGenerate, onUse }) {
  const [context, setContext] = useState('');
  const [model, setModel] = useState(defaultModel || 'gpt-5-mini');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState('');
  const [showOutgoingPrompt, setShowOutgoingPrompt] = useState(false);
  const outgoingPrompt = `${serverPrompt || ''} Below is additional news and context to be used to inform the preview ${context || ''}`.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(defaultPrompt || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-semibold mb-4">Generate AI Summary</h2>

      {/* Prompt Section */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Prompt (copy to external AI)</label>
        <div className="flex items-start gap-2">
          <textarea
            readOnly
            rows={2}
            value={defaultPrompt}
            className="mt-1 block w-full border rounded px-2 py-1 bg-gray-100 text-sm"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="mt-1 h-8 px-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm whitespace-nowrap"
            aria-label="Copy prompt"
            title="Copy prompt"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Outgoing Prompt Toggle */}
      {serverPrompt && (
        <div className="mb-2">
          {!showOutgoingPrompt ? (
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => setShowOutgoingPrompt(true)}
            >
              Show outgoing prompt
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Outgoing Prompt</label>
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:underline"
                  onClick={() => setShowOutgoingPrompt(false)}
                >
                  Hide outgoing prompt
                </button>
              </div>
              <textarea
                readOnly
                rows={4}
                value={outgoingPrompt}
                className="mt-1 block w-full border rounded px-2 py-1 bg-gray-50 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">This preview matches the exact text submitted to the API.</p>
            </div>
          )}
        </div>
      )}

      {/* Context Section */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Additional Context (optional)</label>
        <textarea
          rows={4}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
        />
      </div>

      {/* Model selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
        >
          <option value="gpt-5-mini">gpt-5-mini</option>
          <option value="gpt-5">gpt-5</option>
          <option value="gpt-4.1">gpt-4.1</option>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
        </select>
      </div>

      {/* Response Section */}
      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700">Response</label>
        <textarea
          rows={5}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          className="mt-1 block w-full border rounded px-2 py-1"
          placeholder="Click Generate to see the model response here"
        />
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-300 text-gray-700 rounded"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            try {
              setError('');
              setGenerating(true);
              const result = await onGenerate?.(context, model);
              if (typeof result === 'string') setResponse(result);
              else if (result && typeof result.summary === 'string') setResponse(result.summary);
              else if (!result) setError('No response received');
            } catch (e) {
              setError(e?.message || 'Generation failed');
            } finally {
              setGenerating(false);
            }
          }}
          disabled={generating}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate'}
        </button>
        <button
          onClick={() => onUse?.(response)}
          disabled={!response || generating}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Use
        </button>
      </div>
    </GlobalModal>
  );
}
