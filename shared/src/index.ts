// Types shared by server and client. Type-only: always `import type { ... } from '@f1/shared'`.

export interface Circuit {
  id: string;
  name: string;
  locality: string;
  country: string;
  lat: number;
  long: number;
}

export type SessionType = 'fp1' | 'fp2' | 'fp3' | 'sprintQualifying' | 'sprint' | 'qualifying' | 'race';

export interface SessionTime {
  type: SessionType;
  startsAt: string; // ISO 8601 UTC
}

export interface Race {
  season: number;
  round: number;
  name: string;
  circuit: Circuit;
  sessions: SessionTime[]; // sorted by startsAt
}

export type ResultType = 'race' | 'sprint' | 'qualifying';

export interface ResultEntry {
  position: number | null;
  positionText: string;
  number: number | null;
  driverId: string;
  driverCode: string | null;
  driverName: string;
  teamId: string;
  teamName: string;
  grid: number | null;
  laps: number | null;
  status: string | null;
  points: number;
  time: string | null;
  fastestLap: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
}

export interface RaceResult {
  season: number;
  round: number;
  type: ResultType;
  raceName: string;
  entries: ResultEntry[];
}

export type StandingsKind = 'driver' | 'constructor';

export interface StandingEntry {
  position: number | null;
  points: number;
  wins: number;
  id: string; // driverId or teamId
  name: string;
  code: string | null; // driver code, null for constructors
  teamId: string | null;
  teamName: string | null;
}

export interface Standings {
  season: number;
  afterRound: number;
  kind: StandingsKind;
  entries: StandingEntry[];
}

export interface Driver {
  driverId: string;
  code: string | null;
  number: number | null;
  givenName: string;
  familyName: string;
  nationality: string;
  dateOfBirth: string | null;
}

export interface Team {
  teamId: string;
  name: string;
  nationality: string;
  colour: string | null; // filled from OpenF1 in Plan 2
}

export interface DriverSeasonRow {
  round: number;
  raceName: string;
  position: number | null;
  positionText: string;
  points: number;
  grid: number | null;
  status: string | null;
  teamId: string;
}

export interface DriverDetail {
  season: number;
  driver: Driver;
  teams: Team[];
  results: DriverSeasonRow[];
  totalPoints: number; // race + sprint points
}

export interface TeamRoundRow {
  round: number;
  raceName: string;
  points: number; // race + sprint points that round
  bestPosition: number | null;
}

export interface TeamDetail {
  season: number;
  team: Team;
  drivers: Driver[];
  results: TeamRoundRow[];
  totalPoints: number;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  favouriteDriverId: string | null;
  favouriteTeamId: string | null;
}

export interface NextSession {
  raceName: string;
  round: number;
  country: string;
  session: SessionTime;
}

export interface FastestPitStop {
  driverName: string;
  teamName: string;
  duration: number;
  round: number;
  raceName: string;
}

export interface HomeData {
  season: number;
  totalRounds: number;
  completedRounds: number;
  progressPct: number;
  nextRace: Race | null;
  nextSession: NextSession | null;
  driverTop10: StandingEntry[];
  constructorTop10: StandingEntry[];
  fastestPitStop: FastestPitStop | null; // null until Plan 3
  favourites: { driver: StandingEntry | null; team: StandingEntry | null } | null; // null when logged out
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
