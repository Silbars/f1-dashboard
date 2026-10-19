import type { BoardRow, ReplayBoard, ReplayDriver, ReplayEvent, ReplaySample } from '@f1/shared';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { ODriver, OInterval, OLap, OLocation, OPosition, ORaceControl, OStint } from '../openf1.ts';

const ms = (iso: string) => Date.parse(iso);

/** Race start is the earliest lap-1 start; the end is the latest lap end across all cars. */
export function raceWindow(laps: OLap[]): { start: number; durationMs: number; totalLaps: number } | null {
  const starts = laps.filter((l) => l.lap_number === 1 && l.date_start).map((l) => ms(l.date_start!));
  if (starts.length === 0) return null;
  const start = starts.reduce((a, b) => Math.min(a, b));
  const end = laps
    .filter((l) => l.date_start && l.lap_duration !== null)
    .reduce((a, l) => Math.max(a, ms(l.date_start!) + l.lap_duration! * 1000), -Infinity);
  const totalLaps = laps.reduce((a, l) => Math.max(a, l.lap_number), 0);
  return { start, durationMs: end - start, totalLaps };
}

/** The fastest clean lap (not lap 1, not a pit-out lap) is the one whose GPS trace draws the circuit. */
export function outlineLap(laps: OLap[]): { n: number; from: string; to: string } | null {
  type Clean = OLap & { date_start: string; lap_duration: number };
  const clean = laps.filter(
    (l): l is Clean => l.lap_number > 1 && !l.is_pit_out_lap && l.date_start !== null && l.lap_duration !== null,
  );
  if (clean.length === 0) return null;
  const best = clean.reduce((a, l) => (l.lap_duration < a.lap_duration ? l : a));
  const from = ms(best.date_start);
  return {
    n: best.driver_number,
    from: new Date(from).toISOString(),
    to: new Date(from + best.lap_duration * 1000).toISOString(),
  };
}

/** `(0, 0)` is OpenF1's no-signal value. */
export function toSamples(rows: OLocation[], start: number): ReplaySample[] {
  return rows
    .filter((r) => !(r.x === 0 && r.y === 0))
    .map((r): ReplaySample => [r.driver_number, ms(r.date) - start, r.x, r.y])
    .sort((a, b) => a[1] - b[1]);
}

export interface ReplayData {
  laps: [n: number, lap: number, t: number][];
  positions: [n: number, t: number, position: number][];
  intervals: [n: number, t: number, gap: string | null, interval: string | null][];
  stints: [n: number, lapStart: number, lapEnd: number, compound: string | null][];
  events: ReplayEvent[];
}

export function formatGap(v: number | string | null): string | null {
  if (v === null) return null;
  return typeof v === 'number' ? `+${v.toFixed(3)}` : v;
}

export function buildReplayData(
  raw: { laps: OLap[]; positions: OPosition[]; intervals: OInterval[]; stints: OStint[]; raceControl: ORaceControl[] },
  start: number,
): ReplayData {
  const t = (iso: string) => ms(iso) - start;
  const byT = <T extends { t: number }>(a: T, b: T) => a.t - b.t;
  return {
    laps: raw.laps
      .filter((l): l is OLap & { date_start: string } => l.date_start !== null)
      .map((l): [number, number, number] => [l.driver_number, l.lap_number, t(l.date_start)])
      .sort((a, b) => a[2] - b[2]),
    positions: raw.positions
      .map((p): [number, number, number] => [p.driver_number, t(p.date), p.position])
      .sort((a, b) => a[1] - b[1]),
    intervals: raw.intervals
      .map((i): [number, number, string | null, string | null] => [i.driver_number, t(i.date), formatGap(i.gap_to_leader), formatGap(i.interval)])
      .sort((a, b) => a[1] - b[1]),
    stints: raw.stints.map((s): [number, number, number, string | null] => [s.driver_number, s.lap_start, s.lap_end, s.compound]),
    events: raw.raceControl
      .map((r) => ({ t: t(r.date), category: r.category, flag: r.flag, message: r.message }))
      .sort(byT),
  };
}

/** The order, gaps and tyres at time t. Each list is sorted by t, so the scans stop at t. */
export function boardAt(d: ReplayData, t: number): ReplayBoard {
  const position = new Map<number, number>();
  for (const [n, pt, p] of d.positions) {
    if (pt > t) break;
    position.set(n, p);
  }
  const gaps = new Map<number, [string | null, string | null]>();
  for (const [n, it, gap, interval] of d.intervals) {
    if (it > t) break;
    gaps.set(n, [gap, interval]);
  }
  const lapOf = new Map<number, number>();
  for (const [n, lap, lt] of d.laps) {
    if (lt > t) break;
    lapOf.set(n, lap);
  }
  const rows: BoardRow[] = [...position].map(([n, p]) => {
    const lap = lapOf.get(n) ?? 0;
    const stint = d.stints.find(([sn, from, to]) => sn === n && from <= lap && lap <= to);
    const [gap, interval] = gaps.get(n) ?? [null, null];
    return { n, position: p, gap, interval, compound: stint ? stint[3] : null };
  });
  rows.sort((a, b) => a.position - b.position);
  return { t, lap: Math.max(0, ...lapOf.values()), rows };
}

export function toDrivers(rows: ODriver[]): ReplayDriver[] {
  return rows.map((d) => ({
    n: d.driver_number,
    code: d.name_acronym,
    name: d.full_name,
    teamName: d.team_name,
    colour: d.team_colour ? `#${d.team_colour}` : '#888888',
  }));
}

/** Chunks and session data are stored gzipped to keep the Atlas free tier comfortable. */
export function pack(value: unknown): Buffer {
  return gzipSync(JSON.stringify(value));
}

export function unpack<T>(buf: Buffer): T {
  return JSON.parse(gunzipSync(buf).toString('utf8')) as T;
}
