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
  colour: string | null; // '#RRGGBB', from server/src/services/teamColours.ts
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

export interface H2HStats {
  driver: Driver;
  points: number; // race + sprint
  wins: number;
  podiums: number;
  dnfs: number; // races not classified (retired, disqualified, ...)
  raceAhead: number; // races finished ahead of the other driver
  qualiAhead: number; // qualifying sessions ahead of the other driver
}

export interface H2HRound {
  round: number;
  raceName: string;
  a: string | null; // positionText, null when the driver did not take part
  b: string | null;
  gap: number | null; // b's position minus a's: positive when a finished ahead
}

export interface HeadToHead {
  season: number;
  a: H2HStats;
  b: H2HStats;
  rounds: H2HRound[];
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

export type ReplaySessionType = 'Race' | 'Sprint';

export interface ReplaySessionSummary {
  sessionKey: number;
  meetingKey: number;
  meetingName: string;
  countryName: string;
  sessionType: ReplaySessionType;
  startsAt: string; // ISO 8601 UTC, lights out
  durationMs: number;
  totalLaps: number;
}

export interface ReplayDriver {
  n: number;
  code: string;
  name: string;
  teamName: string;
  colour: string; // '#RRGGBB', '#888888' when missing
}

/** [driver number, first lap, last lap, compound]; compound is null when OpenF1 did not say. */
export type ReplayStint = [n: number, lapStart: number, lapEnd: number, compound: string | null];

/** A numbered turn. x and y are in the outline's frame; angle is the direction (degrees, y up) to place its label, clear of the track. */
export interface ReplayCorner {
  number: number;
  x: number;
  y: number;
  angle: number;
}

/** [driver number, ms]: the replay time the car's last lap began. A retired car can only be parked after that. */
export type ReplayRetirement = [n: number, fromMs: number];

export interface ReplayTrack {
  corners: ReplayCorner[];
  pitLane: [number, number][];
  retired: ReplayRetirement[];
}

export interface ReplayMeta {
  session: ReplaySessionSummary;
  drivers: ReplayDriver[];
  outline: [number, number][];
  stints: ReplayStint[];
  /** null until the server has looked the track details up; a replay:track event follows when it has. */
  track: ReplayTrack | null;
}

export type ReplaySample = [n: number, t: number, x: number, y: number];

export interface ReplayState {
  playing: boolean;
  speed: number;
  t: number;
  reset: boolean;
}

export interface BoardRow {
  n: number;
  position: number;
  gap: string | null;
  interval: string | null;
  compound: string | null;
}

export interface ReplayBoard {
  t: number;
  lap: number;
  rows: BoardRow[];
}

export interface ReplayEvent {
  t: number;
  category: string;
  flag: string | null;
  message: string;
}

export interface ReplayError {
  code: string;
  message: string;
}
