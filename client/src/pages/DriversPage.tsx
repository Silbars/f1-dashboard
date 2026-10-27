import type { DriverCard } from '@f1/shared';
import { Link } from 'react-router';
import { cardBackground, cardFrame, Headshot, shortTeam } from '../components/PaddockCard';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

export default function DriversPage() {
  const [season, setSeason] = useSeason();
  const q = useApi<DriverCard[]>(`/seasons/${season}/drivers`);
  return (
    <section>
      <PageHeader title={`${season} drivers`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(drivers) => {
          if (drivers.length === 0) return <p className="text-zinc-400">No drivers listed for {season} yet.</p>;
          // Jolpica also lists reserves who never started; once anyone has raced, show only those who did.
          const raced = drivers.filter((d) => d.teamId);
          const shown = raced.length ? raced : drivers;
          return (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {shown.map((d) => (
                <li key={d.driverId}>
                  <Link to={`/drivers/${season}/${d.driverId}`} className={cardFrame}>
                    <div className="relative h-80 overflow-hidden rounded-lg" style={{ background: cardBackground(d.colour) }}>
                      {d.number !== null && (
                        <span aria-hidden className="absolute right-3 top-16 text-[9rem] font-black leading-none text-white/10 tabular-nums">
                          {d.number}
                        </span>
                      )}
                      <Headshot
                        src={d.headshot}
                        code={d.code}
                        className="absolute bottom-0 left-1/2 h-[58%] w-[70%] origin-bottom -translate-x-1/2 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-safe:group-hover:scale-105"
                      />
                      <div className="relative p-5">
                        {d.teamId && d.teamName && (
                          <p className="text-sm font-medium text-zinc-200">{shortTeam(d.teamName)}</p>
                        )}
                        <p className="mt-4 text-sm text-zinc-300">{d.givenName}</p>
                        <h2 className="break-words text-4xl font-black leading-none tracking-tight">{d.familyName}</h2>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryState>
    </section>
  );
}
