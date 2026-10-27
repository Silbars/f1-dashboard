import type { TeamDetail } from '@f1/shared';
import { Link, useParams } from 'react-router';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';

export default function TeamPage() {
  const { season, teamId } = useParams();
  const q = useApi<TeamDetail>(`/seasons/${season}/teams/${teamId}`);
  return (
    <section>
      <Link to={`/teams?season=${season}`} className="text-sm text-zinc-400 hover:text-white">
        ← {season} teams
      </Link>
      <QueryState q={q}>
        {({ team, drivers, results, totalPoints }) => (
          <>
            <PageHeader title={team.name} />
            <p className="mb-4 text-sm text-zinc-400">
              {team.nationality} · {totalPoints} points in {season}
            </p>
            <h2 className="mb-2 font-semibold">Drivers</h2>
            {drivers.length === 0 ? (
              <p className="mb-6 text-zinc-400">No drivers have raced for this team in {season} yet.</p>
            ) : (
              <ul className="mb-6 flex flex-wrap gap-2">
                {drivers.map((d) => (
                  <li key={d.driverId}>
                    <Link to={`/drivers/${season}/${d.driverId}`} className="block rounded border border-zinc-800 px-3 py-1 hover:border-accent">
                      {d.givenName} {d.familyName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {results.length === 0 ? (
              <p className="text-zinc-400">No race results in {season}.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Points by round</caption>
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">Round</th>
                    <th className="pr-3">Race</th>
                    <th className="pr-3">Best finish</th>
                    <th className="pr-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.round} className="border-t border-zinc-800">
                      <td className="py-2 pr-3">{r.round}</td>
                      <td className="pr-3">{r.raceName}</td>
                      <td className="pr-3">{r.bestPosition ?? '—'}</td>
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
