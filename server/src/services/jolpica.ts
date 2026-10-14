import type { Driver, Race, RaceResult, ResultType, Standings, StandingsKind, Team } from '@f1/shared';
import { type MRData, toDriver, toRace, toRaceResults, toStandings, toTeam } from './jolpica.transform.ts';
import { createQueue, fetchJson } from './queue.ts';

const BASE = 'https://api.jolpi.ca/ergast/f1';
const PAGE = 100;
// Jolpica limits (docs/rate_limits.md): 4 requests/second burst, 500 requests/hour.
const queue = createQueue({ perSecond: 4, perWindow: 500, windowMs: 3_600_000 });

function page(path: string, offset: number): Promise<MRData> {
  const url = `${BASE}/${path}.json?limit=${PAGE}&offset=${offset}`;
  return queue.run(url, async () => (await fetchJson<{ MRData: MRData }>(url)).MRData);
}

async function allPages(path: string): Promise<MRData[]> {
  const first = await page(path, 0);
  const pages = [first];
  for (let offset = PAGE; offset < Number(first.total); offset += PAGE) pages.push(await page(path, offset));
  return pages;
}

const RESULT_PATH: Record<ResultType, string> = { race: 'results', sprint: 'sprint', qualifying: 'qualifying' };

export const jolpica = {
  async schedule(season: number): Promise<Race[]> {
    return (await allPages(`${season}`)).flatMap((p) => p.RaceTable?.Races ?? []).map(toRace);
  },
  async results(season: number, round: number, type: ResultType): Promise<RaceResult | null> {
    return toRaceResults(await allPages(`${season}/${round}/${RESULT_PATH[type]}`), type)[0] ?? null;
  },
  async seasonResults(season: number, type: ResultType): Promise<RaceResult[]> {
    return toRaceResults(await allPages(`${season}/${RESULT_PATH[type]}`), type);
  },
  async standings(season: number, kind: StandingsKind): Promise<Standings | null> {
    const path = kind === 'driver' ? 'driverstandings' : 'constructorstandings';
    return toStandings(await allPages(`${season}/${path}`), kind);
  },
  async drivers(season: number): Promise<Driver[]> {
    return (await allPages(`${season}/drivers`)).flatMap((p) => p.DriverTable?.Drivers ?? []).map(toDriver);
  },
  async teams(season: number): Promise<Team[]> {
    return (await allPages(`${season}/constructors`)).flatMap((p) => p.ConstructorTable?.Constructors ?? []).map(toTeam);
  },
};
