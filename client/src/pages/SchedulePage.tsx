import type { Race } from '@f1/shared';
import { Link } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { formatDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

const raceStart = (r: Race) => r.sessions.find((s) => s.type === 'race')?.startsAt;

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
          const nextRound = races.find((r) => (raceStart(r) ? Date.parse(raceStart(r)!) >= now : false))?.round;
          return (
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {races.map((r) => {
                const start = raceStart(r);
                const past = start ? Date.parse(start) < now : false;
                const isNext = r.round === nextRound;
                const status = past ? 'Completed' : isNext ? 'Next' : 'Upcoming';
                return (
                  <li key={r.round}>
                    <Link
                      to={`/results/${season}/${r.round}`}
                      className={`card block h-full transition-colors hover:border-red-600 ${past ? 'opacity-60' : ''} ${isNext ? 'border-red-600 bg-red-950/30' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                        <span>
                          Round {r.round}
                          {r.sessions.some((s) => s.type === 'sprint') && ' · Sprint weekend'}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${isNext ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>{status}</span>
                      </div>
                      <h2 className="mt-2 text-lg font-semibold">{r.name}</h2>
                      <p className="text-sm text-zinc-400">
                        {r.circuit.locality}, {r.circuit.country}
                      </p>
                      {start && (
                        <p className="mt-3 text-sm">
                          <time dateTime={start}>{formatDateTime(start)}</time>
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          );
        }}
      </QueryState>
    </section>
  );
}
