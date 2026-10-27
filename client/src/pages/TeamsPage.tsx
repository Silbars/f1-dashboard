import type { TeamCard } from '@f1/shared';
import { Link } from 'react-router';
import { cardBackground, cardFrame, Headshot, shortTeam } from '../components/PaddockCard';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

export default function TeamsPage() {
  const [season, setSeason] = useSeason();
  const q = useApi<TeamCard[]>(`/seasons/${season}/teams`);
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
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* A team that changed a driver mid-season lists three; the card shows the two best placed. */}
              {teams.map((t) => (
                <li key={t.teamId}>
                  <Link to={`/teams/${season}/${t.teamId}`} className={cardFrame}>
                    <div className="relative h-80 overflow-hidden rounded-lg" style={{ background: cardBackground(t.colour) }}>
                      <div className="absolute inset-x-0 bottom-0 flex h-[55%] items-end">
                        {t.drivers.slice(0, 2).map((d) => (
                          <div key={d.driverId} className="relative h-full min-w-0 flex-1">
                            <Headshot
                              src={d.headshot}
                              code={d.code}
                              className="absolute bottom-0 left-1/2 h-full w-full origin-bottom -translate-x-1/2 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-safe:group-hover:scale-105"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="relative p-5">
                        <h2 className="break-words text-3xl font-black leading-none tracking-tight">{shortTeam(t.name)}</h2>
                        <p className="mt-1.5 text-sm text-zinc-300">{t.nationality}</p>
                      </div>
                      {t.drivers.length > 0 && (
                        <p className="absolute inset-x-0 bottom-0 flex justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-5 pb-3 pt-8 text-sm font-semibold">
                          {t.drivers.slice(0, 2).map((d) => (
                            <span key={d.driverId}>{d.familyName}</span>
                          ))}
                        </p>
                      )}
                    </div>
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
