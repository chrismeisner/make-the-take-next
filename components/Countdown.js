import React from 'react';
import useCountdown from '../hooks/useCountdown';
import useHasMounted from '../hooks/useHasMounted';

export default function Countdown({ targetTime, prefix = '', showSeconds = true, alwaysShowSeconds = false }) {
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

  // If alwaysShowSeconds is true, include seconds even when days > 0
  // Otherwise: if more than a day away, show days, hours, minutes (no seconds)
  // If less than a day, show hours, minutes, seconds (omit the day part when 0)
  const showOnlyDhM = days > 0 && !alwaysShowSeconds;
  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`, `${hours}h`, `${minutes}m`);
    if (alwaysShowSeconds) parts.push(`${seconds}s`);
  } else {
    parts.push(`${hours}h`, `${minutes}m`);
    if (showSeconds || alwaysShowSeconds) parts.push(`${seconds}s`);
  }
  const timeText = parts.join(' ');
  return (
    <span suppressHydrationWarning>
      {prefix ? `${prefix} ${timeText}` : timeText}
    </span>
  );
}


