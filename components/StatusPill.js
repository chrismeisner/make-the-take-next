import React from 'react';
import useCountdown from '../hooks/useCountdown';

export default function StatusPill({ status, eventTime }) {
  const { days, hours, minutes, seconds, isCompleted } = useCountdown(eventTime);
  const isUpcoming = eventTime && !isCompleted;
  let displayText = status;

  if (isUpcoming) {
    displayText = `Starts in ${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  const statusColorMap = {
    open: 'bg-green-100 text-green-800',
    graded: 'bg-green-100 text-green-800',
    closed: 'bg-red-100 text-red-800',
    default: 'bg-gray-100 text-gray-800',
  };

  const colorClass = isUpcoming
    ? 'bg-blue-100 text-blue-800'
    : statusColorMap[status] || statusColorMap.default;

  return (
    <span className={`inline-block ${colorClass} text-xs px-2 py-1 rounded-full`}>
      {displayText}
    </span>
  );
} 