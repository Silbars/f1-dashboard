import { useEffect, useState } from 'react';
import { countdownParts } from '../lib/countdown';

export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = countdownParts(target, now);
  if (c.done) return <p className="text-lg font-semibold text-red-400">Session under way</p>;
  return (
    // The visible digits tick every second; screen readers get one label instead of constant updates.
    <p className="flex gap-4" aria-label={`${c.days} days ${c.hours} hours ${c.minutes} minutes to go`}>
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
