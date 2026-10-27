import { createQueue, fetchJson, HttpError } from './queue.ts';

const BASE = 'https://api.openf1.org/v1';
// Free tier: 3 req/s and 30 req/min. One request every 2.1 s stays under 30/min; queued calls go out in turn.
const queue = createQueue({ perSecond: 1, perWindow: 1, windowMs: 2_100 });

/** OpenF1 answers 404 "No results found." for an empty result set; that is an empty list, not an error. */
export async function openf1<T>(path: string): Promise<T[]> {
  const url = `${BASE}/${path}`;
  try {
    return await queue.run(url, () => fetchJson<T[]>(url));
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return [];
    throw err;
  }
}

export interface OSession {
  session_key: number;
  session_name: string;
  session_type: string;
  meeting_key: number;
  date_start: string;
  date_end: string;
  year: number;
  country_name: string;
  location: string;
}

export interface OMeeting {
  meeting_key: number;
  meeting_name: string;
  country_name: string;
  circuit_short_name: string;
  year: number;
  date_start: string;
}

export interface ODriver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour: string | null;
}

export interface OLap {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
}

export interface OPosition {
  driver_number: number;
  date: string;
  position: number;
}

export interface OInterval {
  driver_number: number;
  date: string;
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

export interface OStint {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string | null;
}

export interface ORaceControl {
  date: string;
  category: string;
  flag: string | null;
  message: string;
}

export interface OSessionInfo {
  circuit_key: number;
  year: number;
}

export interface OPit {
  driver_number: number;
  date: string; // when the car left the pit lane
  lane_duration: number | null; // seconds from pit entry to pit exit
}

export interface OSessionResult {
  driver_number: number;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
}

export interface OLocation {
  date: string;
  driver_number: number;
  x: number;
  y: number;
}
