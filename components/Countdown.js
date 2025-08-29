import React from 'react';
import useCountdown from '../hooks/useCountdown';
import useHasMounted from '../hooks/useHasMounted';

export default function Countdown({ targetTime, prefix = '', showSeconds = true }) {
  const hasMounted = useHasMounted();
  const { days, hours, minutes, seconds, isCompleted } = useCountdown(targetTime);

  if (!targetTime) return null;
  if (!hasMounted) return null;
  if (isCompleted) return null;

  const parts = [`${days}d`, `${hours}h`, `${minutes}m`];
  if (showSeconds) parts.push(`${seconds}s`);
  const timeText = parts.join(' ');
  return (
    <span suppressHydrationWarning>
      {prefix ? `${prefix} ${timeText}` : timeText}
    </span>
  );
}


