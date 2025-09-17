import React from 'react';
import useCountdown from '../hooks/useCountdown';
import useHasMounted from '../hooks/useHasMounted';

export default function Countdown({ targetTime, prefix = '', showSeconds = true }) {
  const hasMounted = useHasMounted();
  const { days, hours, minutes, seconds, isCompleted } = useCountdown(targetTime);

  if (!targetTime) {
    return <span suppressHydrationWarning />;
  }
  if (!hasMounted) {
    return <span suppressHydrationWarning />;
  }
  if (isCompleted) {
    return <span suppressHydrationWarning />;
  }

  const parts = [`${days}d`, `${hours}h`, `${minutes}m`];
  if (showSeconds) parts.push(`${seconds}s`);
  const timeText = parts.join(' ');
  return (
    <span suppressHydrationWarning>
      {prefix ? `${prefix} ${timeText}` : timeText}
    </span>
  );
}


