import React from 'react';

export default function StatusPill({ status }) {
  const normalized = String(status || '').toLowerCase();

  const statusColorMap = {
    'open': 'bg-green-100 text-green-800',
    'active': 'bg-green-100 text-green-800',
    'graded': 'bg-green-100 text-green-800',
    'closed': 'bg-red-100 text-red-800',
    'completed': 'bg-blue-100 text-blue-800',
    'coming up': 'bg-yellow-100 text-yellow-800',
    'default': 'bg-gray-100 text-gray-800',
  };

  const colorClass = statusColorMap[normalized] || statusColorMap.default;

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const label = normalized ? normalized.split(' ').map(capitalize).join(' ') : '';
  const displayText = label;

  return (
    <span className={`inline-block ${colorClass} text-xs px-2 py-1 rounded-full`}>
      {displayText}
    </span>
  );
}