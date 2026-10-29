import type { SeasonOverview } from '@f1/shared';
import { type KeyboardEvent, type PointerEvent, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { buildProgress, type Series } from '../lib/progress';
import { useApi } from '../lib/useApi';
import { QueryState } from './States';

type Metric = 'points' | 'position';

const W = 760;
const H = 420;
const M = { l: 42, r: 16, t: 16, b: 30 };
const FALLBACK = '#a1a1aa';

/** A team's second driver draws dashed and a third dotted, so teammates sharing a colour stay apart. */
function dashes(series: Series[]): Map<string, string | undefined> {
  const seen = new Map<string, number>();
  const out = new Map<string, string | undefined>();
  [...series]
    .sort((a, b) => (b.points.at(-1) ?? -1) - (a.points.at(-1) ?? -1))
    .forEach((s) => {
      const n = seen.get(s.teamName) ?? 0;
      seen.set(s.teamName, n + 1);
      out.set(s.id, n === 0 ? undefined : n === 1 ? '7 4' : '2 4');
    });
  return out;
}

/** Axis step that gives four to five gridlines. */
const pointStep = (max: number) => [10, 25, 50, 100, 200, 500].find((s) => max / s <= 5) ?? 500;

function Charts({ data, season }: { data: SeasonOverview; season: number }) {
  const { rounds, series } = useMemo(() => buildProgress(data), [data]);
  const dash = useMemo(() => dashes(series), [series]);
  const [metric, setMetric] = useState<Metric>('points');
  const [sel, setSel] = useState(rounds.length - 1);
  const [hover, setHover] = useState<string | null>(null);
  if (rounds.length === 0) return <p className="text-zinc-400">No races have been run in {season} yet.</p>;

  const n = rounds.length;
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const x = (i: number) => (n > 1 ? M.l + (i * plotW) / (n - 1) : M.l + plotW / 2);

  const maxPoints = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p ?? 0)));
  const step = pointStep(maxPoints);
  const yMax = Math.ceil(maxPoints / step) * step;
  const maxPos = Math.max(2, ...series.flatMap((s) => s.position.map((p) => p ?? 0)));
  const y = (v: number) => (metric === 'points' ? H - M.b - (v / yMax) * plotH : M.t + ((v - 1) / (maxPos - 1)) * plotH);
  const values = (s: Series) => (metric === 'points' ? s.points : s.position);
  const ticks = metric === 'points' ? Array.from({ length: yMax / step + 1 }, (_, i) => i * step) : [1, 5, 10, 15, 20].filter((p) => p <= maxPos);

  const path = (s: Series) =>
    values(s)
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)} ${y(v).toFixed(1)}`))
      .filter((p) => p !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`)
      .join(' ');

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setSel(Math.min(n - 1, Math.max(0, Math.round(((px - M.l) / plotW) * (n - 1)))));
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const next = { ArrowLeft: sel - 1, ArrowRight: sel + 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setSel(Math.min(n - 1, Math.max(0, next)));
  };

  const at = Math.min(sel, n - 1);
  const standing = series
    .filter((s) => s.position[at] !== null)
    .sort((a, b) => a.position[at]! - b.position[at]!);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Season progress</h2>
        <div role="group" aria-label="Chart" className="flex rounded-lg bg-zinc-900 p-1 text-sm">
          {(['points', 'position'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${metric === m ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {m === 'points' ? 'Points' : 'Position'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_17rem]">
        <div className="overflow-x-auto rounded-xl bg-zinc-900/40 p-3 ring-1 ring-white/10">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[600px]"
            role="group"
            tabIndex={0}
            aria-label={`${metric === 'points' ? 'Points' : 'Championship position'} by round. Use the arrow keys to move between rounds.`}
            onPointerMove={pick}
            onPointerLeave={() => setHover(null)}
            onKeyDown={key}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="stroke-zinc-800" />
                <text x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-500 text-[11px] tabular-nums">
                  {metric === 'position' ? `P${t}` : t}
                </text>
              </g>
            ))}
            {rounds.map((r, i) => (
              <text key={r.round} x={x(i)} y={H - 8} textAnchor="middle" className={`text-[11px] tabular-nums ${i === at ? 'fill-zinc-100 font-semibold' : 'fill-zinc-500'}`}>
                {n > 12 && i % 2 === 1 && i !== at ? '' : r.round}
              </text>
            ))}
            <line x1={x(at)} x2={x(at)} y1={M.t} y2={H - M.b} className="stroke-zinc-600" strokeDasharray="3 3" />

            <g key={metric} className="motion-safe:animate-chart-reveal">
              {series.map((s) => (
                <g key={s.id} style={{ opacity: hover && hover !== s.id ? 0.12 : 1, transition: 'opacity 150ms' }}>
                  <path
                    d={path(s)}
                    fill="none"
                    stroke={s.colour ?? FALLBACK}
                    strokeWidth={hover === s.id ? 3.5 : 2}
                    strokeDasharray={dash.get(s.id)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {values(s)[at] !== null && <circle cx={x(at)} cy={y(values(s)[at]!)} r={hover === s.id ? 5 : 3.5} fill={s.colour ?? FALLBACK} />}
                  <path d={path(s)} fill="none" stroke="transparent" strokeWidth={12} onPointerEnter={() => setHover(s.id)} />
                </g>
              ))}
            </g>
          </svg>
        </div>

        <div className="relative">
          <div className="max-h-80 overflow-y-auto rounded-xl bg-zinc-900/40 ring-1 ring-white/10 lg:absolute lg:inset-0 lg:max-h-none">
            <p className="sticky top-0 border-b border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
              <span className="font-semibold">After round {rounds[at]!.round}</span>
              <span className="block truncate text-xs text-zinc-400">{rounds[at]!.raceName}</span>
            </p>
            <ul onPointerLeave={() => setHover(null)}>
              {standing.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/drivers/${season}/${s.id}`}
                    onPointerEnter={() => setHover(s.id)}
                    onFocus={() => setHover(s.id)}
                    onBlur={() => setHover(null)}
                    className={`flex items-center gap-3 px-4 py-1.5 text-sm transition-colors hover:bg-zinc-800/70 ${hover === s.id ? 'bg-zinc-800/70' : ''}`}
                  >
                    <span className="w-6 tabular-nums text-zinc-400">{s.position[at]}</span>
                    <svg aria-hidden width="18" height="4" className="shrink-0">
                      <line x1="0" x2="18" y1="2" y2="2" stroke={s.colour ?? FALLBACK} strokeWidth="3" strokeDasharray={dash.get(s.id)} />
                    </svg>
                    <span className="min-w-0 flex-1 truncate font-medium">{s.code ?? s.name}</span>
                    <span className="tabular-nums text-zinc-300">{s.points[at]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SeasonCharts({ season }: { season: number }) {
  const q = useApi<SeasonOverview>(`/seasons/${season}/overview`);
  return <QueryState q={q}>{(data) => <Charts data={data} season={season} />}</QueryState>;
}
