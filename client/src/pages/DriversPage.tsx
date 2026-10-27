import type { Driver } from '@f1/shared';
import { Link } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

export default function DriversPage() {
  const [season, setSeason] = useSeason();
  const q = useApi<Driver[]>(`/seasons/${season}/drivers`);
  return (
    <section>
      <PageHeader title={`${season} drivers`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(drivers) =>
          drivers.length === 0 ? (
            <p className="text-zinc-400">No drivers listed for {season} yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {drivers.map((d) => (
                <li key={d.driverId}>
                  <Link to={`/drivers/${season}/${d.driverId}`} className="block rounded-lg border border-zinc-800 p-4 hover:border-accent">
                    <p className="text-xs text-zinc-400">
                      {d.code ?? ''} {d.number !== null && `#${d.number}`}
                    </p>
                    <p className="font-semibold">
                      {d.givenName} {d.familyName}
                    </p>
                    <p className="text-sm text-zinc-400">{d.nationality}</p>
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
