import type { ReplayBoard, ReplayMeta } from '@f1/shared';
import { stintSpan } from '../../lib/replay';
import { tyreOf, TYRE } from './tyres';

interface Props {
  meta: ReplayMeta;
  board: ReplayBoard | null;
  selected: number | null;
  onSelect: (n: number) => void;
}

/** One row per driver, one bar per tyre stint, with a playhead at the leader's lap. Rows follow the timing order. */
export function StrategyTimeline({ meta, board, selected, onSelect }: Props) {
  const total = meta.session.totalLaps;
  const order = [...new Set([...(board?.rows.map((r) => r.n) ?? []), ...meta.drivers.map((d) => d.n)])];
  const rows = order
    .map((n) => ({ driver: meta.drivers.find((d) => d.n === n), stints: meta.stints.filter(([sn]) => sn === n) }))
    .filter((row) => row.stints.length > 0);
  const playhead = total > 0 && board ? Math.min(100, (board.lap / total) * 100) : null;

  if (meta.stints.length === 0) return <p className="text-sm text-zinc-400">No tyre data for this session.</p>;

  return (
    <div className="grid gap-3">
      <ol className="grid gap-2">
        {rows.map(({ driver, stints }) => {
          const n = stints[0]![0];
          const code = driver?.code ?? String(n);
          const isSelected = selected === n;
          return (
            <li key={n} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(n)}
                className={`flex items-center gap-2 rounded px-1 py-0.5 text-left font-semibold ${isSelected ? 'bg-accent/15' : 'hover:bg-zinc-900'}`}
              >
                <span className="h-4 w-1 rounded" style={{ background: driver?.colour ?? '#888888' }} />
                {code}
              </button>
              <div className="relative h-7 rounded bg-zinc-900">
                {stints.map(([, lapStart, lapEnd, compound]) => {
                  const { left, width } = stintSpan(lapStart, lapEnd, total);
                  const tyre = tyreOf(compound);
                  const name = compound ? compound.toLowerCase() : 'unknown compound';
                  return (
                    <div
                      key={lapStart}
                      role="img"
                      aria-label={`${code}: ${name}, laps ${lapStart} to ${lapEnd}`}
                      title={`${name}, laps ${lapStart} to ${lapEnd}`}
                      className="absolute inset-y-0.5 grid place-items-center overflow-hidden rounded-sm text-[10px] font-bold"
                      style={{ left: `${left}%`, width: `${width}%`, background: tyre.hex, color: tyre.ink }}
                    >
                      <span aria-hidden>{width > 4 ? `${tyre.letter} ${lapEnd - lapStart + 1}` : tyre.letter}</span>
                    </div>
                  );
                })}
                {playhead !== null && (
                  <div aria-hidden className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${playhead}%` }} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
        <div className="flex flex-wrap items-center gap-3">
          {Object.entries(TYRE).map(([compound, t]) => (
            <span key={compound} className="flex items-center gap-1.5 capitalize">
              <span className="grid size-4 place-items-center rounded-sm text-[9px] font-bold" style={{ background: t.hex, color: t.ink }} aria-hidden>
                {t.letter}
              </span>
              {compound.toLowerCase()}
            </span>
          ))}
        </div>
        <span className="font-mono">
          Lap 1 to {total}
        </span>
      </div>
    </div>
  );
}
