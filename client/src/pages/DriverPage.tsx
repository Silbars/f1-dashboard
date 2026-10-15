import type { DriverDetail } from '@f1/shared';
import { Link, useParams } from 'react-router';
import { PageHeader, QueryState } from '../components/States';
import { formatDate } from '../lib/format';
import { useApi } from '../lib/useApi';

export default function DriverPage() {
  const { season, driverId } = useParams();
  const q = useApi<DriverDetail>(`/seasons/${season}/drivers/${driverId}`);
  return (
    <section>
      <Link to={`/drivers?season=${season}`} className="text-sm text-zinc-400 hover:text-white">
        ← {season} drivers
      </Link>
      <QueryState q={q}>
        {({ driver: d, teams, results, totalPoints }) => (
          <>
            <PageHeader title={`${d.givenName} ${d.familyName}`} />
            <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['Team', teams.map((t) => t.name).join(', ') || '—'],
                ['Nationality', d.nationality],
                ['Born', d.dateOfBirth ? formatDate(d.dateOfBirth) : '—'],
                [`${season} points`, String(totalPoints)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-zinc-800 p-3">
                  <dt className="text-xs text-zinc-400">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {results.length === 0 ? (
              <p className="text-zinc-400">No race results in {season}.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Race-by-race results</caption>
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">Round</th>
                    <th className="pr-3">Race</th>
                    <th className="pr-3">Grid</th>
                    <th className="pr-3">Finish</th>
                    <th className="pr-3">Status</th>
                    <th className="pr-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.round} className="border-t border-zinc-800">
                      <td className="py-2 pr-3">{r.round}</td>
                      <td className="pr-3">
                        <Link to={`/results/${season}/${r.round}`} className="hover:underline">
                          {r.raceName}
                        </Link>
                      </td>
                      <td className="pr-3">{r.grid ?? '—'}</td>
                      <td className="pr-3 font-semibold">{r.positionText}</td>
                      <td className="pr-3 text-zinc-400">{r.status ?? '—'}</td>
                      <td className="pr-3 text-right">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
