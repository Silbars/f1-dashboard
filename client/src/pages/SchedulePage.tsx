import type { Race } from '@f1/shared';
import { Link } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { formatDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

export default function SchedulePage() {
  const [season, setSeason] = useSeason();
  const q = useApi<Race[]>(`/seasons/${season}/schedule`);
  return (
    <section>
      <PageHeader title={`${season} schedule`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(races) =>
          races.length === 0 ? (
            <p className="text-zinc-400">No races published for {season} yet.</p>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {races.map((r) => {
                const start = r.sessions.find((s) => s.type === 'race')?.startsAt;
                const past = start ? Date.parse(start) < Date.now() : false;
                return (
                  <li key={r.round}>
                    <Link
                      to={`/results/${season}/${r.round}`}
                      className={`block h-full rounded-lg border p-4 hover:border-red-600 ${past ? 'border-zinc-800 opacity-70' : 'border-zinc-700'}`}
                    >
                      <p className="text-xs text-zinc-400">
                        Round {r.round}
                        {r.sessions.some((s) => s.type === 'sprint') && ' · Sprint weekend'}
                      </p>
                      <h2 className="font-semibold">{r.name}</h2>
                      <p className="text-sm text-zinc-400">
                        {r.circuit.locality}, {r.circuit.country}
                      </p>
                      {start && (
                        <p className="mt-2 text-sm">
                          <time dateTime={start}>{formatDateTime(start)}</time>
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )
        }
      </QueryState>
    </section>
  );
}
