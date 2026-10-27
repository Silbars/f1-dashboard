import type { ReplayCorner, ReplayRetirement, ReplayTrack } from '@f1/shared';
import type { StoredTrack } from '../../models/ReplaySession.ts';
import { type OLocation, type OPit, type OSessionInfo, type OSessionResult, openf1 } from '../openf1.ts';
import { fetchJson, HttpError } from '../queue.ts';
import type { ReplayData } from './transform.ts';

const MULTIVIEWER = 'https://api.multiviewer.app/api/v1/circuits';
/** Seconds either side of the pit lane window, so the trace joins the track at both ends. */
const PIT_PAD_MS = 2500;
/** Samples closer than this (1/10 m) to the last kept one are dropped; a car parked in its box would otherwise add hundreds. */
const MIN_STEP = 30;

interface MvCircuit {
  corners: { number: number; angle: number; trackPosition: { x: number; y: number } }[];
}

/**
 * MultiViewer's circuit map shares OpenF1's coordinate frame, so its corner positions land on the replay outline as they are.
 * shortcut: unofficial community API, no guarantees; a failure is retried on the next join, a 404 means no corners.
 */
export function toCorners(mv: MvCircuit): ReplayCorner[] {
  return mv.corners
    .map((c) => ({ number: c.number, x: Math.round(c.trackPosition.x), y: Math.round(c.trackPosition.y), angle: Math.round(c.angle) }))
    .sort((a, b) => a.number - b.number);
}

async function fetchCorners(circuitKey: number, year: number): Promise<ReplayCorner[]> {
  try {
    return toCorners(await fetchJson<MvCircuit>(`${MULTIVIEWER}/${circuitKey}/${year}`));
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return [];
    throw err;
  }
}

/** The quickest pit stop's lane window: that car drove straight through the lane. In OpenF1's data `date` is the moment the car leaves the lane. */
export function pitLaneWindow(pits: OPit[]): { n: number; from: number; to: number } | null {
  const timed = pits.filter((p): p is OPit & { lane_duration: number } => p.lane_duration !== null && p.lane_duration > 0);
  if (timed.length === 0) return null;
  const quickest = timed.reduce((a, p) => (p.lane_duration < a.lane_duration ? p : a));
  const exit = Date.parse(quickest.date);
  return { n: quickest.driver_number, from: exit - quickest.lane_duration * 1000 - PIT_PAD_MS, to: exit + PIT_PAD_MS };
}

/** `(0, 0)` is OpenF1's no-signal value. */
export function toPitLane(rows: OLocation[]): [number, number][] {
  const lane: [number, number][] = [];
  for (const r of [...rows].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    if (r.x === 0 && r.y === 0) continue;
    const last = lane.at(-1);
    if (!last || Math.hypot(r.x - last[0], r.y - last[1]) >= MIN_STEP) lane.push([r.x, r.y]);
  }
  return lane;
}

/** Everything lazily looked up for a session. Throws if any source fails, so nothing half-empty is stored. */
export async function fetchTrack(sessionKey: number): Promise<StoredTrack> {
  const [info] = await openf1<OSessionInfo>(`sessions?session_key=${sessionKey}`);
  if (!info) throw new Error(`No OpenF1 session ${sessionKey}`);
  const [corners, pits, results] = await Promise.all([
    fetchCorners(info.circuit_key, info.year),
    openf1<OPit>(`pit?session_key=${sessionKey}`),
    openf1<OSessionResult>(`session_result?session_key=${sessionKey}`),
  ]);
  const win = pitLaneWindow(pits);
  const rows = win
    ? await openf1<OLocation>(
        `location?session_key=${sessionKey}&driver_number=${win.n}&date>=${new Date(win.from).toISOString()}&date<${new Date(win.to).toISOString()}`,
      )
    : [];
  return { corners, pitLane: toPitLane(rows), dnf: results.filter((r) => r.dnf).map((r) => r.driver_number) };
}

/** A retired car is only ever parked after its last lap began; a car with no laps is retired from the start. */
export function retirementsOf(dnf: number[], laps: ReplayData['laps']): ReplayRetirement[] {
  return dnf.map((n): ReplayRetirement => [n, laps.filter(([ln]) => ln === n).reduce((last, [, , t]) => Math.max(last, t), 0)]);
}

export function toReplayTrack(track: StoredTrack | null, laps: ReplayData['laps']): ReplayTrack | null {
  return track && { corners: track.corners, pitLane: track.pitLane, retired: retirementsOf(track.dnf, laps) };
}
