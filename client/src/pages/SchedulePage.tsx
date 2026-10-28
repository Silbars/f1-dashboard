import type { Race } from '@f1/shared';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { formatDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

const raceStart = (r: Race) => r.sessions.find((s) => s.type === 'race')?.startsAt;

// Mapbox GL is large, so it loads only on this page, and only when a public token is configured (VITE_MAPBOX_TOKEN in the root .env).
const ScheduleMap = lazy(() => import('../components/ScheduleMap'));
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Circuit.country is the country name from the API; keys cover the spellings it has used.
const COUNTRY_CODE: Record<string, string> = {
  Australia: 'AU', Austria: 'AT', Azerbaijan: 'AZ', Bahrain: 'BH', Belgium: 'BE', Brazil: 'BR', Canada: 'CA', China: 'CN',
  Hungary: 'HU', Italy: 'IT', Japan: 'JP', Malaysia: 'MY', Mexico: 'MX', Monaco: 'MC', Netherlands: 'NL', Qatar: 'QA', Singapore: 'SG',
  Spain: 'ES', 'Saudi Arabia': 'SA', UK: 'GB', 'United Kingdom': 'GB', USA: 'US', 'United States': 'US', UAE: 'AE', 'United Arab Emirates': 'AE',
};
/** Flag images live in public/flags, named by lowercase ISO code. */
const flagSrc = (country: string) => {
  const code = COUNTRY_CODE[country];
  return code ? `/flags/${code.toLowerCase()}.png` : undefined;
};

/** Path for the outline, flipped on y as the replay map is, so the track reads the same way round. */
function trackPath(outline: [number, number][]) {
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const d = outline.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x - minX} ${maxY - y}`).join(' ');
  return { d: `${d} Z`, width: Math.max(...xs) - minX || 1, height: maxY - minY || 1 };
}

function CircuitThumb({ outline, className }: { outline: [number, number][]; className: string }) {
  const { d, width, height } = trackPath(outline);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' });
const dayRange = (r: Race) => {
  const first = r.sessions[0]?.startsAt;
  const last = r.sessions.at(-1)?.startsAt;
  return first && last ? `${dayFormat.format(new Date(first))} – ${dayFormat.format(new Date(last))}` : '';
};

const pillClass = {
  Next: 'bg-accent text-accent-ink',
  Completed: 'bg-zinc-800 text-zinc-400',
  Upcoming: 'ring-1 ring-zinc-700 text-zinc-300',
};

export default function SchedulePage() {
  const [season, setSeason] = useSeason();
  const q = useApi<Race[]>(`/seasons/${season}/schedule`);
  return (
    <section>
      <PageHeader title={`${season} schedule`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(races) => {
          if (races.length === 0) return <p className="text-zinc-400">No races published for {season} yet.</p>;
          const now = Date.now();
          const isPast = (r: Race) => {
            const start = raceStart(r);
            return start ? Date.parse(start) < now : false;
          };
          const nextRound = races.find((r) => !isPast(r))?.round;
          const statusOf = (r: Race) => (isPast(r) ? 'Completed' : r.round === nextRound ? 'Next' : 'Upcoming');
          return (
            <>
              {MAPBOX_TOKEN && (
                <div className="mb-6">
                  <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-zinc-900 sm:h-96" />}>
                    <ScheduleMap races={races} nextRound={nextRound} token={MAPBOX_TOKEN} />
                  </Suspense>
                </div>
              )}
              {nextRound && (
                <a href={`#round-${nextRound}`} className="mb-4 inline-block text-sm text-accent-text hover:underline">
                  Jump to the next race
                </a>
              )}
              <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {races.map((r) => {
                  const start = raceStart(r);
                  const status = statusOf(r);
                  const sprint = r.sessions.some((s) => s.type === 'sprint');
                  const src = flagSrc(r.circuit.country);
                  return (
                    <li key={r.round} id={`round-${r.round}`} className="scroll-mt-6">
                      <Link
                        to={`/results/${season}/${r.round}`}
                        className={`block h-full rounded-xl p-1 bg-white/[0.03] ring-1 ring-white/10 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent/15 hover:ring-accent`}
                      >
                        <div className="flex h-full flex-col rounded-lg bg-zinc-900/80 p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                          <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                            <span className="flex items-center gap-2 tabular-nums">
                              {src && (
                                <img
                                  src={src}
                                  alt=""
                                  className="h-4 w-[26px] rounded-[3px] object-cover"
                                  onError={(e) => {
                                    e.currentTarget.hidden = true;
                                  }}
                                />
                              )}
                              Round {r.round}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {sprint && <span className="rounded-full bg-accent-2/15 px-2.5 py-0.5 font-medium text-accent-2">Sprint</span>}
                              <span className={`rounded-full px-2.5 py-0.5 font-medium ${pillClass[status]}`}>{status}</span>
                            </span>
                          </div>
                          {r.circuit.outline && (
                            <CircuitThumb
                              outline={r.circuit.outline}
                              className={`mt-5 h-28 w-full ${status === 'Next' ? 'text-accent' : status === 'Completed' ? 'text-zinc-600' : 'text-zinc-300'}`}
                            />
                          )}
                          <h2 className={`mt-6 text-2xl font-black tracking-tight ${status === 'Completed' ? 'text-zinc-300' : ''}`}>{r.name}</h2>
                          <p className="text-sm text-zinc-400">
                            {r.circuit.locality}, {r.circuit.country}
                          </p>
                          <p className="mt-auto pt-6 text-sm tabular-nums">{dayRange(r)}</p>
                          {start && (
                            <p className="text-xs text-zinc-500">
                              Race <time dateTime={start}>{formatDateTime(start)}</time>
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </>
          );
        }}
      </QueryState>
    </section>
  );
}
