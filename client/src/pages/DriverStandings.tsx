import type { DriverCard, Standings } from '@f1/shared';
import { Link } from 'react-router';
import { cardBackground, Headshot, shortTeam } from '../components/PaddockCard';
import { SeasonCharts } from '../components/SeasonCharts';
import { useApi } from '../lib/useApi';

const FALLBACK = '#52525b';
const EXPANDED = { fontStretch: '125%' } as const;

/** Half points exist (shortened races), so trim float noise but keep one decimal when there is one. */
const pts = (n: number) => String(Math.round(n * 10) / 10);

export function DriverStandings({ s, season }: { s: Standings; season: number }) {
  // The standings carry no team colour or photo; the season's driver list does. Without it the page still works, in grey.
  const cards = useApi<DriverCard[]>(`/seasons/${season}/drivers`);
  const byId = new Map((cards.data?.data ?? []).map((d) => [d.driverId, d]));
  const leader = s.entries[0]!.points;

  return (
    <>
      <div className="mb-12">
        <SeasonCharts season={season} />
      </div>
      <p className="mb-6 text-sm text-zinc-400">
        After round {s.afterRound}. Bars show each driver’s points as a share of the leader’s.
      </p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Drivers’ championship</caption>
        <thead>
          <tr>
            <th className="w-14 py-2 pr-3">Pos</th>
            <th className="pr-3">Driver</th>
            <th className="hidden pr-3 md:table-cell">Team</th>
            <th className="hidden pr-16 text-right sm:table-cell">Wins</th>
            <th className="w-28 pr-3 sm:w-64 sm:pr-16">Points</th>
            <th className="hidden text-right sm:table-cell">Gap</th>
          </tr>
        </thead>
        <tbody>
          {s.entries.map((e, i) => {
            const card = byId.get(e.id);
            const colour = card?.colour ?? FALLBACK;
            const gap = leader - e.points;
            return (
              <tr key={e.id}>
                <td className="py-3 pr-3 text-xl font-semibold tabular-nums text-zinc-300">{e.position ?? '—'}</td>
                <td className="pr-3">
                  <Link to={`/drivers/${season}/${e.id}`} className="group flex items-center gap-3">
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-lg" style={{ background: cardBackground(colour) }}>
                      <Headshot src={card?.headshot ?? null} code={e.code} className="absolute inset-0 size-full [&]:pb-0 [&]:text-xs [&]:place-items-center" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-base font-semibold group-hover:underline">{e.name}</span>
                      <span className="block truncate text-xs text-zinc-400 md:hidden">{e.teamName ? shortTeam(e.teamName) : '—'}</span>
                    </span>
                  </Link>
                </td>
                <td className="hidden pr-3 text-zinc-300 md:table-cell">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-4 w-1 rounded-full" style={{ background: colour }} />
                    {e.teamName ? shortTeam(e.teamName) : '—'}
                  </span>
                </td>
                <td className="hidden pr-16 text-right text-zinc-300 sm:table-cell">{e.wins}</td>
                <td className="pr-3 sm:pr-16">
                  <span className="text-base font-black" style={EXPANDED}>
                    {pts(e.points)}
                  </span>
                  <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-zinc-800">
                    <span
                      className="block h-full origin-left rounded-full motion-safe:animate-bar-grow"
                      style={{ width: `${leader > 0 ? (e.points / leader) * 100 : 0}%`, background: colour, animationDelay: `${i * 30}ms` }}
                    />
                  </span>
                </td>
                <td className="hidden text-right text-zinc-400 sm:table-cell">{gap === 0 ? 'Leader' : `−${pts(gap)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
