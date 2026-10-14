import type {
  Driver,
  Race,
  RaceResult,
  ResultEntry,
  ResultType,
  SessionTime,
  SessionType,
  StandingEntry,
  Standings,
  StandingsKind,
  Team,
} from '@f1/shared';

// Minimal shapes of the Jolpica (Ergast-compatible) JSON that we read.
export interface JDriver {
  driverId: string;
  permanentNumber?: string;
  code?: string;
  givenName: string;
  familyName: string;
  dateOfBirth?: string;
  nationality: string;
}
export interface JConstructor {
  constructorId: string;
  name: string;
  nationality: string;
}
interface JWhen {
  date: string;
  time?: string;
}
export interface JResult {
  number?: string;
  position?: string;
  positionText?: string;
  points?: string;
  Driver: JDriver;
  Constructor: JConstructor;
  grid?: string;
  laps?: string;
  status?: string;
  Time?: { time: string };
  FastestLap?: { Time?: { time: string } };
  Q1?: string;
  Q2?: string;
  Q3?: string;
}
export interface JRace extends JWhen {
  season: string;
  round: string;
  raceName: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    Location: { lat: string; long: string; locality: string; country: string };
  };
  FirstPractice?: JWhen;
  SecondPractice?: JWhen;
  ThirdPractice?: JWhen;
  SprintShootout?: JWhen; // 2023 name for sprint qualifying
  SprintQualifying?: JWhen;
  Sprint?: JWhen;
  Qualifying?: JWhen;
  Results?: JResult[];
  SprintResults?: JResult[];
  QualifyingResults?: JResult[];
}
export interface JDriverStanding {
  position?: string;
  points: string;
  wins: string;
  Driver: JDriver;
  Constructors: JConstructor[];
}
export interface JConstructorStanding {
  position?: string;
  points: string;
  wins: string;
  Constructor: JConstructor;
}
export interface JStandingsList {
  season: string;
  round: string;
  DriverStandings?: JDriverStanding[];
  ConstructorStandings?: JConstructorStanding[];
}
export interface MRData {
  total: string;
  RaceTable?: { Races: JRace[] };
  StandingsTable?: { StandingsLists: JStandingsList[] };
  DriverTable?: { Drivers: JDriver[] };
  ConstructorTable?: { Constructors: JConstructor[] };
}

const int = (s: string | undefined): number | null => (s === undefined || s === '' || Number.isNaN(Number(s)) ? null : Number(s));
const iso = (w: JWhen): string => `${w.date}T${w.time ?? '00:00:00Z'}`;
const fullName = (d: JDriver): string => `${d.givenName} ${d.familyName}`;

const SESSION_KEYS: [keyof JRace, SessionType][] = [
  ['FirstPractice', 'fp1'],
  ['SecondPractice', 'fp2'],
  ['ThirdPractice', 'fp3'],
  ['SprintShootout', 'sprintQualifying'],
  ['SprintQualifying', 'sprintQualifying'],
  ['Sprint', 'sprint'],
  ['Qualifying', 'qualifying'],
];

export function toRace(r: JRace): Race {
  const sessions: SessionTime[] = [];
  for (const [key, type] of SESSION_KEYS) {
    const when = r[key] as JWhen | undefined;
    if (when?.date) sessions.push({ type, startsAt: iso(when) });
  }
  sessions.push({ type: 'race', startsAt: iso(r) });
  sessions.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const loc = r.Circuit.Location;
  return {
    season: Number(r.season),
    round: Number(r.round),
    name: r.raceName,
    circuit: {
      id: r.Circuit.circuitId,
      name: r.Circuit.circuitName,
      locality: loc.locality,
      country: loc.country,
      lat: Number(loc.lat),
      long: Number(loc.long),
    },
    sessions,
  };
}

export function toResultEntry(x: JResult): ResultEntry {
  return {
    position: int(x.position),
    positionText: x.positionText ?? x.position ?? '',
    number: int(x.number),
    driverId: x.Driver.driverId,
    driverCode: x.Driver.code ?? null,
    driverName: fullName(x.Driver),
    teamId: x.Constructor.constructorId,
    teamName: x.Constructor.name,
    grid: int(x.grid),
    laps: int(x.laps),
    status: x.status ?? null,
    points: Number(x.points ?? 0),
    time: x.Time?.time ?? null,
    fastestLap: x.FastestLap?.Time?.time ?? null,
    q1: x.Q1 ?? null,
    q2: x.Q2 ?? null,
    q3: x.Q3 ?? null,
  };
}

const RESULT_LIST = { race: 'Results', sprint: 'SprintResults', qualifying: 'QualifyingResults' } as const;

/** Jolpica paginates by result row, so one race can be split across pages: merge by round. */
export function toRaceResults(pages: MRData[], type: ResultType): RaceResult[] {
  const byRound = new Map<number, RaceResult>();
  for (const page of pages) {
    for (const r of page.RaceTable?.Races ?? []) {
      const round = Number(r.round);
      const merged = byRound.get(round) ?? { season: Number(r.season), round, type, raceName: r.raceName, entries: [] };
      merged.entries.push(...(r[RESULT_LIST[type]] ?? []).map(toResultEntry));
      byRound.set(round, merged);
    }
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

export function toStandings(pages: MRData[], kind: StandingsKind): Standings | null {
  const list = pages[0]?.StandingsTable?.StandingsLists[0];
  if (!list) return null;
  const entries: StandingEntry[] =
    kind === 'driver'
      ? (list.DriverStandings ?? []).map((s) => {
          const team = s.Constructors.at(-1); // a driver who switched teams lists all of them; the last is current
          return {
            position: int(s.position),
            points: Number(s.points),
            wins: Number(s.wins),
            id: s.Driver.driverId,
            name: fullName(s.Driver),
            code: s.Driver.code ?? null,
            teamId: team?.constructorId ?? null,
            teamName: team?.name ?? null,
          };
        })
      : (list.ConstructorStandings ?? []).map((s) => ({
          position: int(s.position),
          points: Number(s.points),
          wins: Number(s.wins),
          id: s.Constructor.constructorId,
          name: s.Constructor.name,
          code: null,
          teamId: s.Constructor.constructorId,
          teamName: s.Constructor.name,
        }));
  return { season: Number(list.season), afterRound: Number(list.round), kind, entries };
}

export const toDriver = (d: JDriver): Driver => ({
  driverId: d.driverId,
  code: d.code ?? null,
  number: int(d.permanentNumber),
  givenName: d.givenName,
  familyName: d.familyName,
  nationality: d.nationality,
  dateOfBirth: d.dateOfBirth ?? null,
});

export const toTeam = (c: JConstructor): Team => ({
  teamId: c.constructorId,
  name: c.name,
  nationality: c.nationality,
  colour: null,
});
