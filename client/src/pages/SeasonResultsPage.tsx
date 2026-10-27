import type { OverviewDriver, OverviewPerson, OverviewRound, SeasonOverview } from '@f1/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { flagSrc } from '../lib/flags';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

type Session = 'combined' | 'race' | 'sprint';
type View = 'points' | 'position';

const dayFormat = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' });

/** Jolpica's non-numeric positionText letters, as the broadcast abbreviations. */
const STATUS: Record<string, string> = { R: 'DNF', D: 'DSQ', E: 'DSQ', W: 'DNS', F: 'DNS', N: 'NC' };

const LEGEND: [label: string, className: string][] = [
  ['P1', 'bg-yellow-300 text-zinc-950'],
  ['P2', 'bg-zinc-300 text-zinc-950'],
  ['P3', 'bg-orange-500 text-zinc-950'],
  ['P4-P6', 'bg-accent/30 text-white'],
  ['P7-P10', 'bg-accent/15 text-zinc-100'],
  ['P11+', 'bg-zinc-800/70 text-zinc-300'],
];

/** Podium in medal colours, then the livery accent fading with distance from the points. */
function bandClass(positionText: string): string {
  const n = Number(positionText);
  if (!Number.isInteger(n)) return 'text-red-300';
  if (n === 1) return LEGEND[0]![1];
  if (n === 2) return LEGEND[1]![1];
  if (n === 3) return LEGEND[2]![1];
  if (n <= 6) return LEGEND[3]![1];
  if (n <= 10) return LEGEND[4]![1];
  return LEGEND[5]![1];
}

function Flag({ country, className = 'h-3.5 w-[22px]' }: { country: string; className?: string }) {
  const src = flagSrc(country);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className={`${className} shrink-0 rounded-[3px] object-cover`}
      onError={(e) => {
        e.currentTarget.hidden = true;
      }}
    />
  );
}

function Person({ p, season, strong }: { p: OverviewPerson | null; season: number; strong?: boolean }) {
  if (!p) return <span className="text-zinc-600">-</span>;
  return (
    <Link to={`/drivers/${season}/${p.driverId}`} className="inline-flex items-center gap-2 hover:underline" title={p.name}>
      <span className="h-4 w-1 shrink-0 rounded-full bg-zinc-600" style={p.colour ? { background: p.colour } : undefined} />
      <span className={strong ? 'font-semibold' : undefined}>
        <span className="hidden lg:inline">{p.name}</span>
        <span className="lg:hidden">{p.code ?? p.name}</span>
      </span>
    </Link>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2 text-sm">
      <span className="text-zinc-400">{label}</span>
      <div className="flex rounded bg-zinc-900 p-0.5 ring-1 ring-zinc-800">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === value}
            onClick={() => onChange(v)}
            className={`rounded px-3 py-1 font-medium transition-colors ${v === value ? 'bg-accent text-accent-ink' : 'text-zinc-300 hover:text-white'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function GrandPrixTable({ season, rounds }: { season: number; rounds: OverviewRound[] }) {
  const showSprint = rounds.some((r) => r.hasSprint);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{season} Grand Prix results</caption>
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-3">Round</th>
            <th scope="col" className="pr-3">Grand Prix</th>
            <th scope="col" className="pr-3">Date</th>
            {showSprint && <th scope="col" className="pr-3">Sprint winner</th>}
            <th scope="col" className="pr-3">Pole</th>
            <th scope="col" className="pr-3">Winner</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r.round} className={r.winner ? '' : 'text-zinc-500'}>
              <td className="py-2.5 pr-3 text-zinc-400">R{r.round}</td>
              <td className="pr-3">
                <Link to={`/results/${season}/${r.round}`} className="inline-flex items-center gap-2.5 font-medium hover:underline">
                  <Flag country={r.country} className="h-4 w-[26px]" />
                  {r.country}
                </Link>
              </td>
              <td className="pr-3 text-zinc-400">{r.date ? dayFormat.format(new Date(r.date)) : '-'}</td>
              {showSprint && <td className="pr-3">{r.hasSprint ? <Person p={r.sprintWinner} season={season} /> : <span className="text-zinc-600">-</span>}</td>}
              <td className="pr-3"><Person p={r.poleman} season={season} /></td>
              <td className="pr-3"><Person p={r.winner} season={season} strong /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What one driver shows in one round: the number to print, the position that colours it, and whether a result exists. */
function resultIn(d: OverviewDriver, round: number, session: Session) {
  const race = d.race[round];
  const sprint = d.sprint[round];
  const main = session === 'sprint' ? sprint : session === 'race' ? race : (race ?? sprint);
  const points = session === 'combined' ? (race?.points ?? 0) + (sprint?.points ?? 0) : (main?.points ?? 0);
  return { main, points };
}

function Matrix({ data, season }: { data: SeasonOverview; season: number }) {
  const hasSprints = data.rounds.some((r) => r.hasSprint);
  const [session, setSession] = useState<Session>('combined');
  const [view, setView] = useState<View>('points');

  const columns = session === 'sprint' ? data.rounds.filter((r) => r.hasSprint) : data.rounds;
  const raced = useMemo(() => new Set(data.drivers.flatMap((d) => [...Object.keys(d.race), ...Object.keys(d.sprint)].map(Number))), [data.drivers]);
  const rows = useMemo(() => {
    const withTotal = data.drivers.map((d) => ({
      d,
      total: columns.reduce((sum, r) => sum + resultIn(d, r.round, session).points, 0),
    }));
    return withTotal.sort((a, b) => b.total - a.total || a.d.name.localeCompare(b.d.name));
  }, [data.drivers, columns, session]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented
          label="Session"
          value={session}
          onChange={setSession}
          options={[
            ['combined', 'Combined'],
            ['race', 'Grand Prix'],
            ...(hasSprints ? ([['sprint', 'Sprint']] as [Session, string][]) : []),
          ]}
        />
        <Segmented
          label="Show"
          value={view}
          onChange={setView}
          options={[
            ['points', 'Points'],
            ['position', 'Position'],
          ]}
        />
      </div>
      {view === 'position' && session === 'combined' && (
        <p className="mb-3 text-xs text-zinc-500">Positions are the Grand Prix finish; the total includes sprint points.</p>
      )}
      <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-800">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">
            {season} driver {view} by round, {session === 'race' ? 'Grand Prix' : session}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-10 bg-[var(--surface)] py-3 pl-3 pr-2">Pos</th>
              <th scope="col" className="sticky left-10 z-10 min-w-36 bg-[var(--surface)] py-3 pr-4">Driver</th>
              <th scope="col" className="py-3 pr-3 text-right">Pts</th>
              {columns.map((r) => (
                <th key={r.round} scope="col" className={`px-0.5 pb-2 pt-3 text-center ${raced.has(r.round) ? '' : 'opacity-40'}`}>
                  <Link to={`/results/${season}/${r.round}`} title={r.raceName} className="flex flex-col items-center gap-1 hover:text-white">
                    <Flag country={r.country} />
                    R{r.round}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, total }, i) => (
              <tr key={d.driverId} className="group">
                <td className="sticky left-0 z-10 bg-[var(--surface)] py-1 pl-3 pr-2 font-semibold text-zinc-400 group-hover:bg-zinc-900">{i + 1}</td>
                <td className="sticky left-10 z-10 whitespace-nowrap bg-[var(--surface)] py-1 pr-4 group-hover:bg-zinc-900">
                  <Link to={`/drivers/${season}/${d.driverId}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                    <span className="h-4 w-1 shrink-0 rounded-full bg-zinc-600" style={d.colour ? { background: d.colour } : undefined} />
                    {d.name}
                  </Link>
                </td>
                <td className="py-1 pr-3 text-right text-base font-black">{total}</td>
                {columns.map((r) => {
                  const { main, points } = resultIn(d, r.round, session);
                  if (!main) {
                    return <td key={r.round} className="p-0.5 text-center text-zinc-700">-</td>;
                  }
                  const text = main?.positionText ?? '';
                  const status = STATUS[text];
                  const shown = view === 'points' ? points : (status ?? text);
                  return (
                    <td key={r.round} className="p-0.5" title={`${r.raceName}: ${status ?? `P${text}`}, ${points} pts`}>
                      <div className={`grid h-8 min-w-9 place-items-center rounded text-xs font-semibold ${bandClass(text)}`}>{shown}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-400">
        {LEGEND.map(([label, className]) => (
          <span key={label} className={`grid h-5 min-w-9 place-items-center rounded px-1 font-semibold ${className}`}>
            {label}
          </span>
        ))}
        <p className="ml-2">
          <span className="font-semibold text-red-300">DNF</span> did not finish, <span className="font-semibold text-red-300">DNS</span> did not start,{' '}
          <span className="font-semibold text-red-300">DSQ</span> disqualified, <span className="font-semibold text-red-300">NC</span> not classified, - no result
        </p>
      </div>
    </>
  );
}

export default function SeasonResultsPage() {
  const [season, setSeason] = useSeason();
  const q = useApi<SeasonOverview>(`/seasons/${season}/overview`);
  return (
    <section>
      <PageHeader title={`${season} results`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(data) =>
          data.rounds.length === 0 ? (
            <p className="text-zinc-400">No races published for {season} yet.</p>
          ) : (
            <div className="space-y-12">
              <div>
                <h2 className="mb-4 text-xl font-black tracking-tight">Grand Prix results</h2>
                <GrandPrixTable season={season} rounds={data.rounds} />
              </div>
              <div>
                <h2 className="mb-4 text-xl font-black tracking-tight">Driver points and positions by round</h2>
                {data.drivers.length === 0 ? (
                  <p className="text-zinc-400">No results yet for {season}. They appear here after the first race.</p>
                ) : (
                  <Matrix data={data} season={season} />
                )}
              </div>
            </div>
          )
        }
      </QueryState>
    </section>
  );
}
