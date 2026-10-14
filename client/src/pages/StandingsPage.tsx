import type { Standings } from '@f1/shared';
import { Link } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

export default function StandingsPage({ kind }: { kind: 'drivers' | 'constructors' }) {
  const [season, setSeason] = useSeason();
  const q = useApi<Standings>(`/seasons/${season}/standings/${kind}`);
  const title = kind === 'drivers' ? 'Drivers’ championship' : 'Constructors’ championship';
  return (
    <section>
      <PageHeader title={`${season} ${title}`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(s) =>
          s.entries.length === 0 ? (
            <p className="text-zinc-400">No standings yet for {season}.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-zinc-400">After round {s.afterRound}</p>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{title}</caption>
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">Pos</th>
                    <th className="pr-3">{kind === 'drivers' ? 'Driver' : 'Team'}</th>
                    {kind === 'drivers' && <th className="pr-3">Team</th>}
                    <th className="pr-3 text-right">Wins</th>
                    <th className="pr-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {s.entries.map((e) => (
                    <tr key={e.id} className="border-t border-zinc-800">
                      <td className="py-2 pr-3 font-semibold">{e.position ?? '—'}</td>
                      <td className="pr-3">
                        <Link to={`/${kind === 'drivers' ? 'drivers' : 'teams'}/${season}/${e.id}`} className="hover:underline">
                          {e.name}
                        </Link>
                      </td>
                      {kind === 'drivers' && <td className="pr-3 text-zinc-400">{e.teamName ?? '—'}</td>}
                      <td className="pr-3 text-right">{e.wins}</td>
                      <td className="pr-3 text-right font-semibold">{e.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        }
      </QueryState>
    </section>
  );
}
