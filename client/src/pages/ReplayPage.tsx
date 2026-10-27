import type { ReplayEvent } from '@f1/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { StrategyTimeline } from '../features/replay/StrategyTimeline';
import { TrackMap } from '../features/replay/TrackMap';
import { useReplay } from '../features/replay/useReplay';
import { ErrorState, Loading, PageHeader } from '../components/States';
import { formatDateTime } from '../lib/format';
import { clockAt, formatClock, SPEEDS } from '../lib/replay';
import { tyreOf } from '../features/replay/tyres';

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

/** A tyre chip. The compound name is spoken once: on the chip, or beside it when showName is set. */
function Tyre({ compound, showName = false }: { compound: string | null; showName?: boolean }) {
  if (!compound) return <span className="text-zinc-500">—</span>;
  const name = compound.toLowerCase();
  const tyre = tyreOf(compound);
  const chip = (
    <span
      role={showName ? undefined : 'img'}
      aria-label={showName ? undefined : name}
      aria-hidden={showName || undefined}
      className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
      style={{ background: tyre.hex, color: tyre.ink }}
    >
      {tyre.letter}
    </span>
  );
  if (!showName) return chip;
  return (
    <span className="flex items-center gap-2 capitalize">
      {chip}
      {name}
    </span>
  );
}

/** Position change since the previous timing update: positive means gained places. */
function Move({ places }: { places: number }) {
  if (places === 0) return null;
  const up = places > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`ml-1 inline-flex items-center text-xs ${up ? 'text-green-400' : 'text-red-400'}`}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{up ? `gained ${places}` : `lost ${-places}`}</span>
    </span>
  );
}

export default function ReplayPage() {
  const { sessionKey } = useParams();
  const key = Number(sessionKey);
  if (!Number.isInteger(key) || key <= 0) return <ErrorState error={new Error('That replay does not exist.')} onRetry={() => {}} />;
  return <ReplayView key={key} sessionKey={key} />;
}

function ReplayView({ sessionKey }: { sessionKey: number }) {
  const r = useReplay(sessionKey);
  const { meta, track, state, board, events, buffering, error, buffer, play, pause, seek } = r;
  const [selected, setSelected] = useState<number | null>(null);
  const [hideRetired, setHideRetired] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [moves, setMoves] = useState<Map<number, number>>(new Map());
  const lastPositions = useRef<Map<number, number>>(new Map());
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

  // Each timing update: remember who moved since the last one, for the arrows in the tower.
  useEffect(() => {
    if (!board) return;
    const changed = new Map<number, number>();
    for (const row of board.rows) {
      const before = lastPositions.current.get(row.n);
      if (before !== undefined && before !== row.position) changed.set(row.n, before - row.position);
    }
    lastPositions.current = new Map(board.rows.map((row) => [row.n, row.position]));
    setMoves(changed);
  }, [board]);

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
  const selectedDriver = meta?.drivers.find((d) => d.n === selected) ?? null;
  const selectedRow = board?.rows.find((row) => row.n === selected) ?? null;
  const retiredCount = track?.retired.length ?? 0;
  const totalLaps = meta?.session.totalLaps ?? 0;
  const lap = board?.lap ?? 0;

  return (
    <section>
      <Link to="/replay" className="text-sm text-zinc-400 hover:text-white">
        ← All replays
      </Link>
      {meta ? (
        <PageHeader title={`${meta.session.meetingName} · ${meta.session.sessionType}`}>
          <p className="text-sm text-zinc-400">{formatDateTime(meta.session.startsAt)}</p>
        </PageHeader>
      ) : (
        <PageHeader title="Replay" />
      )}

      {error && <ErrorState error={new Error(error.message)} onRetry={r.retry} />}
      {!meta && !error && <Loading />}

      {meta && (
        <>
          <div className="mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
            <p className={`rounded border px-3 py-2 text-sm sm:max-w-xl ${latest ? toneOf(latest) : 'border-zinc-800'}`} role="status">
              {latest ? latest.message : 'No race-control messages yet.'}
            </p>
            <div className="flex min-w-56 flex-1 items-center gap-3">
              <p className="font-mono text-sm tabular-nums whitespace-nowrap">
                Lap {lap} / {totalLaps}
              </p>
              <div
                role="progressbar"
                aria-label="Race progress"
                aria-valuemin={0}
                aria-valuemax={totalLaps}
                aria-valuenow={lap}
                aria-valuetext={`Lap ${lap} of ${totalLaps}`}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800"
              >
                <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${totalLaps ? Math.min(100, (lap / totalLaps) * 100) : 0}%` }} />
              </div>
            </div>
            {buffering && <p className="text-sm text-zinc-400">Buffering…</p>}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  role="switch"
                  aria-checked={hideRetired}
                  disabled={retiredCount === 0}
                  onClick={() => setHideRetired((h) => !h)}
                  className="flex items-center gap-2 disabled:opacity-50"
                >
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${hideRetired ? 'bg-accent' : 'bg-zinc-700'}`}>
                    <span
                      className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${hideRetired ? 'translate-x-4' : ''}`}
                    />
                  </span>
                  Hide retired cars
                </button>
                <span className="text-zinc-400">{track === null ? 'Checking retirements…' : retiredCount === 0 ? 'No retirements' : `${retiredCount} retired`}</span>
              </div>
              <div className="h-[60vh] min-h-72 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <TrackMap meta={meta} buffer={buffer} state={state} selected={selected} track={track} hideRetired={hideRetired} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-2 text-left text-zinc-400">Race order at the replay time. Select a driver to follow them.</caption>
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
                        className={`cursor-pointer border-t border-zinc-800 ${isSelected ? 'bg-accent/15' : 'hover:bg-zinc-900'}`}
                      >
                        <td className="py-2 pr-3 font-mono font-semibold">
                          {row.position}
                          <Move places={moves.get(row.n) ?? 0} />
                        </td>
                        <td className="pr-3">
                          <button type="button" aria-pressed={isSelected} className="flex items-center gap-2 font-semibold">
                            <span className="h-4 w-1 rounded" style={{ background: d?.colour ?? '#888888' }} />
                            {d?.code ?? row.n}
                          </button>
                        </td>
                        <td className="pr-3 font-mono text-zinc-300">{row.position === 1 ? 'Leader' : (row.gap ?? '—')}</td>
                        <td className="pr-3 font-mono text-zinc-400">{row.interval ?? '—'}</td>
                        <td className="pr-3">
                          <Tyre compound={row.compound} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="focus-heading" className="card" style={{ borderTopColor: selectedDriver?.colour }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="focus-heading" className="font-semibold">
                  {selectedDriver ? selectedDriver.name : 'Driver focus'}
                </h2>
                {selectedDriver && (
                  <button type="button" onClick={() => setSelected(null)} className="text-sm text-zinc-400 hover:text-white">
                    Stop following
                  </button>
                )}
              </div>
              {!selectedDriver && <p className="text-sm text-zinc-400">Select a driver in the timing table to follow them on the track.</p>}
              {selectedDriver && !selectedRow && <p className="text-sm text-zinc-400">Waiting for timing data…</p>}
              {selectedDriver && selectedRow && (
                <>
                  <p className="mb-4 text-sm text-zinc-400">{selectedDriver.teamName}</p>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-zinc-400">Position</dt>
                      <dd className="font-mono text-2xl font-black">P{selectedRow.position}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-400">Gap to leader</dt>
                      <dd className="font-mono font-semibold">{selectedRow.position === 1 ? 'Leader' : (selectedRow.gap ?? '—')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-400">Interval</dt>
                      <dd className="font-mono font-semibold">{selectedRow.interval ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-400">Tyre</dt>
                      <dd className="mt-1 text-sm">
                        <Tyre compound={selectedRow.compound} showName />
                      </dd>
                    </div>
                  </dl>
                </>
              )}
            </section>

            <section aria-labelledby="feed-heading" className="card">
              <h2 id="feed-heading" className="mb-3 font-semibold">
                Race control
              </h2>
              {events.length === 0 ? (
                <p className="text-sm text-zinc-400">No race-control messages yet. Play or seek to see them.</p>
              ) : (
                <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {events.map((e, i) => (
                    <li key={`${e.t}-${i}`} className={`rounded border-l-2 px-3 py-2 ${toneOf(e)}`}>
                      <p className="font-mono text-xs text-zinc-400 tabular-nums">{formatClock(e.t)}</p>
                      <p className="text-sm">{e.message}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section aria-labelledby="strategy-heading" className="card mt-6">
            <h2 id="strategy-heading" className="mb-3 font-semibold">
              Tyre strategy
            </h2>
            <StrategyTimeline meta={meta} board={board} selected={selected} onSelect={(n) => setSelected(selected === n ? null : n)} />
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-zinc-800 p-3">
            <button
              type="button"
              onClick={() => (playing ? pause() : play())}
              className="min-w-20 rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hi"
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
                  className={`rounded px-2 py-1 font-mono text-sm ${state?.speed === x ? 'bg-accent text-accent-ink' : 'bg-zinc-800 hover:bg-zinc-700'}`}
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
              className="min-w-40 flex-1 accent-accent"
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
