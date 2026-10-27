import type { Driver, H2HStats, HeadToHead, Standings } from '@f1/shared';
import { Link, useSearchParams } from 'react-router';
import { SeasonSelect } from '../components/SeasonSelect';
import { PageHeader, QueryState } from '../components/States';
import { useApi } from '../lib/useApi';
import { useSeason } from '../lib/useSeason';

const STATS: [label: string, key: keyof Omit<H2HStats, 'driver'>, lowerIsBetter?: boolean][] = [
  ['Points', 'points'],
  ['Wins', 'wins'],
  ['Podiums', 'podiums'],
  ['Finished ahead in races', 'raceAhead'],
  ['Ahead in qualifying', 'qualiAhead'],
  ['Did not finish', 'dnfs', true],
];

const short = (d: Driver) => d.code ?? d.familyName;
const classified = (positionText: string | null) => positionText !== null && /^\d+$/.test(positionText);

export default function HeadToHeadPage() {
  const [season] = useSeason();
  const [params, setParams] = useSearchParams();
  const drivers = useApi<Driver[]>(`/seasons/${season}/drivers`);
  const standings = useApi<Standings>(`/seasons/${season}/standings/drivers`);
  // Default to the top two of the championship until the visitor picks.
  const a = params.get('a') ?? standings.data?.data.entries[0]?.id ?? null;
  const b = params.get('b') ?? standings.data?.data.entries[1]?.id ?? null;

  const pick = (key: 'a' | 'b', value: string) =>
    setParams((p) => {
      p.set('a', a ?? '');
      p.set('b', b ?? '');
      p.set(key, value);
      return p;
    });
  const changeSeason = (s: number) =>
    setParams((p) => {
      p.set('season', String(s));
      p.delete('a'); // the other season may not have these drivers
      p.delete('b');
      return p;
    });

  return (
    <section>
      <PageHeader title={`${season} head-to-head`}>
        <SeasonSelect value={season} onChange={changeSeason} />
      </PageHeader>
      <QueryState q={drivers}>
        {(list) =>
          list.length < 2 ? (
            <p className="text-zinc-400">Not enough drivers listed for {season} yet.</p>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap gap-4">
                {(['a', 'b'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    {key === 'a' ? 'Driver A' : 'Driver B'}
                    <select
                      value={(key === 'a' ? a : b) ?? ''}
                      onChange={(e) => pick(key, e.target.value)}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                    >
                      <option value="" disabled>
                        Choose a driver
                      </option>
                      {list.map((d) => (
                        <option key={d.driverId} value={d.driverId}>
                          {d.givenName} {d.familyName}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {a && b && a !== b ? (
                <Comparison season={season} a={a} b={b} />
              ) : (
                <p className="text-zinc-400">Pick two different drivers to compare.</p>
              )}
            </>
          )
        }
      </QueryState>
    </section>
  );
}

function Comparison({ season, a, b }: { season: number; a: string; b: string }) {
  const q = useApi<HeadToHead>(`/analytics/${season}/head-to-head?a=${a}&b=${b}`);
  return (
    <QueryState q={q}>
      {(h) => (
        <>
          <table className="mb-8 w-full max-w-xl text-left text-sm">
            <caption className="mb-2 text-left text-zinc-400">
              {season} season, {h.a.driver.givenName} {h.a.driver.familyName} against {h.b.driver.givenName} {h.b.driver.familyName}
            </caption>
            <thead className="text-zinc-400">
              <tr>
                <th className="py-2 pr-3 font-normal">Stat</th>
                {[h.a.driver, h.b.driver].map((d) => (
                  <th key={d.driverId} className="pr-3 text-right">
                    <Link to={`/drivers/${season}/${d.driverId}`} className="hover:underline">
                      {short(d)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATS.map(([label, key, lowerIsBetter]) => {
                const va = h.a[key];
                const vb = h.b[key];
                const aBetter = lowerIsBetter ? va < vb : va > vb;
                const bBetter = lowerIsBetter ? vb < va : vb > va;
                return (
                  <tr key={key} className="border-t border-zinc-800">
                    <th scope="row" className="py-2 pr-3 font-normal text-zinc-300">
                      {label}
                    </th>
                    <td className={`pr-3 text-right tabular-nums ${aBetter ? 'font-bold text-white' : 'text-zinc-400'}`}>{va}</td>
                    <td className={`pr-3 text-right tabular-nums ${bBetter ? 'font-bold text-white' : 'text-zinc-400'}`}>{vb}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {h.rounds.length === 0 ? (
            <p className="text-zinc-400">Neither driver has raced in {season} yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-zinc-400">Race by race</caption>
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-2 pr-3">Round</th>
                  <th className="pr-3">Race</th>
                  <th className="pr-3">{short(h.a.driver)}</th>
                  <th className="pr-3">{short(h.b.driver)}</th>
                  <th className="pr-3">Ahead</th>
                </tr>
              </thead>
              <tbody>
                {h.rounds.map((r) => (
                  <tr key={r.round} className="border-t border-zinc-800">
                    <td className="py-2 pr-3">{r.round}</td>
                    <td className="pr-3">
                      <Link to={`/results/${season}/${r.round}`} className="hover:underline">
                        {r.raceName}
                      </Link>
                    </td>
                    <td className="pr-3 font-semibold">{r.a ?? '—'}</td>
                    <td className="pr-3 font-semibold">{r.b ?? '—'}</td>
                    <td className="pr-3 text-zinc-300">
                      {r.gap === null || r.gap === 0
                        ? '—'
                        : classified(r.a) && classified(r.b)
                          ? `${short(r.gap > 0 ? h.a.driver : h.b.driver)} by ${Math.abs(r.gap)} ${Math.abs(r.gap) === 1 ? 'place' : 'places'}`
                          : short(r.gap > 0 ? h.a.driver : h.b.driver)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </QueryState>
  );
}
