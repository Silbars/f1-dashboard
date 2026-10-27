import type { RaceResult, ResultType } from '@f1/shared';
import { Link, useParams, useSearchParams } from 'react-router';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';

const TYPES: [ResultType, string][] = [
  ['race', 'Race'],
  ['sprint', 'Sprint'],
  ['qualifying', 'Qualifying'],
];

export default function ResultsPage() {
  const { season, round } = useParams();
  const [params, setParams] = useSearchParams();
  const type = (TYPES.find(([t]) => t === params.get('type'))?.[0] ?? 'race') as ResultType;
  const q = useApi<RaceResult>(`/seasons/${season}/races/${round}/results?type=${type}`);

  return (
    <section>
      <Link to={`/schedule?season=${season}`} className="text-sm text-zinc-400 hover:text-white">
        ← {season} schedule
      </Link>
      <div role="group" aria-label="Session" className="mb-4 flex gap-2">
        {TYPES.map(([t, label]) => (
          <button
            key={t}
            type="button"
            aria-pressed={t === type}
            onClick={() => setParams({ type: t }, { replace: true })}
            className={`rounded px-3 py-1 text-sm ${t === type ? 'bg-accent text-accent-ink' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <QueryState q={q}>
        {(r) => (
          <>
            <PageHeader title={`${r.raceName} ${season}`} />
            {r.entries.length === 0 ? (
              <p className="text-zinc-400">No results yet for this session.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    {r.raceName} {type} results
                  </caption>
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="py-2 pr-3">Pos</th>
                      <th className="pr-3">Driver</th>
                      <th className="pr-3">Team</th>
                      {type === 'qualifying' ? (
                        <>
                          <th className="pr-3">Q1</th>
                          <th className="pr-3">Q2</th>
                          <th className="pr-3">Q3</th>
                        </>
                      ) : (
                        <>
                          <th className="pr-3">Grid</th>
                          <th className="pr-3">Laps</th>
                          <th className="pr-3">Time / status</th>
                          <th className="pr-3 text-right">Pts</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {r.entries.map((e) => (
                      <tr key={e.driverId} className="border-t border-zinc-800">
                        <td className="py-2 pr-3 font-semibold">{e.positionText}</td>
                        <td className="pr-3">
                          <Link to={`/drivers/${season}/${e.driverId}`} className="hover:underline">
                            {e.driverName}
                          </Link>
                        </td>
                        <td className="pr-3 text-zinc-400">{e.teamName}</td>
                        {type === 'qualifying' ? (
                          <>
                            <td className="pr-3 tabular-nums">{e.q1 ?? '—'}</td>
                            <td className="pr-3 tabular-nums">{e.q2 ?? '—'}</td>
                            <td className="pr-3 tabular-nums">{e.q3 ?? '—'}</td>
                          </>
                        ) : (
                          <>
                            <td className="pr-3">{e.grid ?? '—'}</td>
                            <td className="pr-3">{e.laps ?? '—'}</td>
                            <td className="pr-3 tabular-nums">{e.time ?? e.status ?? '—'}</td>
                            <td className="pr-3 text-right font-semibold">{e.points}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
