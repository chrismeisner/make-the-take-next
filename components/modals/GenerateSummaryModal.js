import React, { useState } from 'react';
import GlobalModal from '../modals/GlobalModal';

export default function GenerateSummaryModal({ isOpen, onClose, defaultPrompt, onGenerate }) {
  const [context, setContext] = useState('');

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-semibold mb-4">Generate AI Summary</h2>

      {/* Prompt Section */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Prompt (copy to external AI)</label>
        <textarea
          readOnly
          rows={2}
          value={defaultPrompt}
          className="mt-1 block w-full border rounded px-2 py-1 bg-gray-100 text-sm"
        />
      </div>

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

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-300 text-gray-700 rounded"
        >
          Cancel
        </button>
        <button
          onClick={() => onGenerate(context)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Generate Summary
        </button>
      </div>
    </GlobalModal>
  );
}
