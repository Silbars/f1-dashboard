import type { ReplayEvent } from '@f1/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { TrackMap } from '../features/replay/TrackMap';
import { useReplay } from '../features/replay/useReplay';
import { ErrorState, Loading, PageHeader } from '../components/States';
import { clockAt, formatClock, SPEEDS } from '../lib/replay';

const FLAG_TONE: Record<string, string> = {
  YELLOW: 'border-yellow-500 bg-yellow-950/50',
  'DOUBLE YELLOW': 'border-yellow-500 bg-yellow-950/50',
  RED: 'border-red-600 bg-red-950/60',
  GREEN: 'border-green-600 bg-green-950/50',
  CLEAR: 'border-green-600 bg-green-950/50',
  BLUE: 'border-blue-500 bg-blue-950/50',
};

function toneOf(e: ReplayEvent) {
  if (e.flag && FLAG_TONE[e.flag]) return FLAG_TONE[e.flag];
  if (e.category === 'SafetyCar') return 'border-yellow-500 bg-yellow-950/50';
  return 'border-zinc-700 bg-zinc-900';
}

export default function ReplayPage() {
  const { sessionKey } = useParams();
  const key = Number(sessionKey);
  if (!Number.isInteger(key) || key <= 0) return <ErrorState error={new Error('That replay does not exist.')} onRetry={() => {}} />;
  return <ReplayView key={key} sessionKey={key} />;
}

function ReplayView({ sessionKey }: { sessionKey: number }) {
  const r = useReplay(sessionKey);
  const { meta, state, board, events, buffering, error, buffer, play, pause, seek } = r;
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const duration = meta?.session.durationMs ?? 0;
  const playing = state?.playing ?? false;
  const t = state ? clockAt(state, now, duration) : 0;
  const tRef = useRef(t);
  tRef.current = t;

  // Re-render the clock and scrubber while playing; the Canvas draws itself every frame.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [playing]);

  // Space plays and pauses; ← and → seek 10 s. Native controls keep their own keys.
  useEffect(() => {
    if (!meta) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playing) pause();
        else play();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        seek(Math.min(Math.max(tRef.current + (e.key === 'ArrowLeft' ? -10_000 : 10_000), 0), duration));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [meta, playing, duration, play, pause, seek]);

  const latest = events[0];

  return (
    <section>
      <Link to="/replay" className="text-sm text-zinc-400 hover:text-white">
        ← All replays
      </Link>
      {meta ? (
        <PageHeader title={`${meta.session.meetingName} · ${meta.session.sessionType}`} />
      ) : (
        <PageHeader title="Replay" />
      )}

      {error && <ErrorState error={new Error(error.message)} onRetry={r.retry} />}
      {!meta && !error && <Loading />}

      {meta && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className={`rounded border px-3 py-2 text-sm ${latest ? toneOf(latest) : 'border-zinc-800'}`} role="status">
              {latest ? latest.message : 'No race-control messages yet.'}
            </p>
            <p className="text-sm text-zinc-400">
              Lap {board?.lap ?? 0} / {meta.session.totalLaps}
            </p>
            {buffering && <p className="text-sm text-zinc-400">Buffering…</p>}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="h-[60vh] min-h-72 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              <TrackMap meta={meta} buffer={buffer} state={state} selected={selected} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-2 text-left text-zinc-400">Race order at the replay time</caption>
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">P</th>
                    <th className="pr-3">Driver</th>
                    <th className="pr-3">Gap</th>
                    <th className="pr-3">Int</th>
                    <th className="pr-3">Tyre</th>
                  </tr>
                </thead>
                <tbody>
                  {!board && (
                    <tr>
                      <td colSpan={5} className="py-2 text-zinc-400">
                        Waiting for timing data…
                      </td>
                    </tr>
                  )}
                  {board?.rows.map((row) => {
                    const d = meta.drivers.find((x) => x.n === row.n);
                    const isSelected = selected === row.n;
                    return (
                      <tr
                        key={row.n}
                        aria-selected={isSelected}
                        onClick={() => setSelected(isSelected ? null : row.n)}
                        className={`cursor-pointer border-t border-zinc-800 ${isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-900'}`}
                      >
                        <td className="py-2 pr-3 font-semibold">{row.position}</td>
                        <td className="pr-3">
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            className="flex items-center gap-2 font-semibold"
                          >
                            <span className="h-4 w-1 rounded" style={{ background: d?.colour ?? '#888888' }} />
                            {d?.code ?? row.n}
                          </button>
                        </td>
                        <td className="pr-3 text-zinc-300">{row.position === 1 ? 'Leader' : (row.gap ?? '—')}</td>
                        <td className="pr-3 text-zinc-400">{row.interval ?? '—'}</td>
                        <td className="pr-3 text-zinc-400">{row.compound ? row.compound.toLowerCase() : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-zinc-800 p-3">
            <button
              type="button"
              onClick={() => (playing ? pause() : play())}
              className="min-w-20 rounded bg-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-500"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <div role="group" aria-label="Playback speed" className="flex gap-1">
              {SPEEDS.map((x) => (
                <button
                  key={x}
                  type="button"
                  aria-pressed={state?.speed === x}
                  onClick={() => r.setSpeed(x)}
                  className={`rounded px-2 py-1 text-sm ${state?.speed === x ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  {x}×
                </button>
              ))}
            </div>
            <input
              type="range"
              aria-label="Replay position"
              min={0}
              max={duration}
              step={1000}
              value={Math.round(t)}
              onChange={(e) => seek(Number(e.target.value))}
              className="min-w-40 flex-1"
            />
            <span className="font-mono text-sm tabular-nums">
              {formatClock(t)} / {formatClock(duration)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
