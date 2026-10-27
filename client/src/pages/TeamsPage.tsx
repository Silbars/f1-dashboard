import type { Team } from '@f1/shared';
import { Link } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

export default function TeamsPage() {
  const [season, setSeason] = useSeason();
  const q = useApi<Team[]>(`/seasons/${season}/teams`);
  return (
    <section>
      <PageHeader title={`${season} teams`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(teams) =>
          teams.length === 0 ? (
            <p className="text-zinc-400">No teams listed for {season} yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <li key={t.teamId}>
                  <Link
                    to={`/teams/${season}/${t.teamId}`}
                    className="block rounded-lg border border-l-4 border-zinc-800 p-4 hover:border-accent"
                    style={{ borderLeftColor: t.colour ?? '#52525b' }}
                  >
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-zinc-400">{t.nationality}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </section>
  );
}
