import React from 'react';
import useCountdown from '../hooks/useCountdown';
import useHasMounted from '../hooks/useHasMounted';

export default function Countdown({ targetTime, prefix = '' }) {
  const hasMounted = useHasMounted();
  const { days, hours, minutes, seconds, isCompleted } = useCountdown(targetTime);

  if (!targetTime) return null;
  if (!hasMounted) return null;
  if (isCompleted) return null;

  const timeText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  return (
    <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full" suppressHydrationWarning>
      {prefix ? `${prefix} ${timeText}` : timeText}
    </span>
  );
}


