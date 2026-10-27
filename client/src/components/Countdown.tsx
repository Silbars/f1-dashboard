import { useEffect, useState } from 'react';
import { countdownParts } from '../lib/countdown';

export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = countdownParts(target, now);
  if (c.done) return <p className="text-lg font-semibold text-accent-text">Session under way</p>;
  return (
    // The visible digits tick every second; screen readers get a static summary instead.
    <p className="flex gap-4">
      <span className="sr-only">{`${c.days} ${c.days === 1 ? 'day' : 'days'}, ${c.hours} ${c.hours === 1 ? 'hour' : 'hours'} and ${c.minutes} ${c.minutes === 1 ? 'minute' : 'minutes'} to go`}</span>
      {(
        [
          [c.days, 'days'],
          [c.hours, 'hrs'],
          [c.minutes, 'min'],
          [c.seconds, 'sec'],
        ] as const
      ).map(([n, label]) => (
        <span key={label} aria-hidden="true" className="text-center">
          <span className="block text-3xl font-black tabular-nums">{String(n).padStart(2, '0')}</span>
          <span className="text-xs text-zinc-400">{label}</span>
        </span>
      ))}
    </p>
  );
}
