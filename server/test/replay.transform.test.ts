import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OLap, OLocation } from '../src/services/openf1.ts';
import {
  buildReplayData,
  formatGap,
  outlineLap,
  pack,
  raceWindow,
  toDrivers,
  toSamples,
  unpack,
} from '../src/services/replay/transform.ts';

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/openf1/${name}.json`, import.meta.url), 'utf8'));
const lap = (driver_number: number, lap_number: number, date_start: string | null, lap_duration: number | null, is_pit_out_lap = false): OLap => ({
  driver_number,
  lap_number,
  date_start,
  lap_duration,
  is_pit_out_lap,
});

describe('raceWindow', () => {
  it('starts at the earliest lap 1 and ends at the latest lap end', () => {
    const laps = [
      lap(1, 1, '2026-10-11T12:00:05Z', 90),
      lap(2, 1, '2026-10-11T12:00:03Z', 91),
      lap(1, 2, '2026-10-11T12:01:35Z', 88),
    ];
    expect(raceWindow(laps)).toEqual({ start: Date.parse('2026-10-11T12:00:03Z'), durationMs: 180_000, totalLaps: 2 });
  });

  it('returns null without lap 1', () => {
    expect(raceWindow([lap(1, 2, '2026-10-11T12:01:35Z', 88)])).toBeNull();
  });

  it('matches the measured Singapore race start and lap count', () => {
    const w = raceWindow(fixture<OLap[]>('laps'));
    expect(new Date(w!.start).toISOString()).toBe('2026-10-11T12:03:39.077Z');
    expect(w!.totalLaps).toBe(62);
  });
});

describe('outlineLap', () => {
  it('ignores lap 1 and pit-out laps and picks the fastest remaining lap', () => {
    const laps = [
      lap(1, 1, '2026-10-11T12:00:00Z', 60),
      lap(2, 2, '2026-10-11T12:01:00Z', 80, true),
      lap(3, 2, '2026-10-11T12:02:00Z', 92),
      lap(4, 2, '2026-10-11T12:03:00Z', 88),
      lap(5, 2, null, 70),
    ];
    expect(outlineLap(laps)).toEqual({ n: 4, from: '2026-10-11T12:03:00.000Z', to: '2026-10-11T12:04:28.000Z' });
  });

  it('returns null when no lap qualifies', () => {
    expect(outlineLap([lap(1, 1, '2026-10-11T12:00:00Z', 60)])).toBeNull();
  });
});

describe('toSamples', () => {
  it('drops (0,0), sorts by t and keeps the 10 s fixture window', () => {
    const rows = fixture<OLocation[]>('location-10s');
    const start = Date.parse('2026-10-11T12:03:39.077Z');
    const samples = toSamples(rows, start);
    expect(new Set(samples.map((s) => s[0])).size).toBe(22);
    expect(samples.every(([, t]) => t >= 0 && t < 10_000)).toBe(true);
    expect(samples.every((s, i) => i === 0 || samples[i - 1]![1] <= s[1])).toBe(true);
    expect(samples.some(([, , x, y]) => x === 0 && y === 0)).toBe(false);
  });
});

describe('formatGap', () => {
  it('formats numbers, keeps lap strings, and maps null to null', () => {
    expect(formatGap(1.2346)).toBe('+1.235');
    expect(formatGap('+1 LAP')).toBe('+1 LAP');
    expect(formatGap(null)).toBeNull();
  });
});

describe('buildReplayData', () => {
  const start = Date.parse('2026-10-11T12:03:39.077Z');
  const data = buildReplayData(
    {
      laps: fixture<OLap[]>('laps') as never,
      positions: fixture('position'),
      intervals: fixture('intervals'),
      stints: fixture('stints'),
      raceControl: fixture('race_control'),
    },
    start,
  );
  const isSorted = (rows: readonly (readonly unknown[])[], i: number) => rows.every((r, k) => k === 0 || (r[i] as number) >= (rows[k - 1]![i] as number));

  it('keeps every timed array sorted by t', () => {
    expect(isSorted(data.laps, 2)).toBe(true);
    expect(isSorted(data.positions, 1)).toBe(true);
    expect(isSorted(data.intervals, 1)).toBe(true);
    expect(isSorted(data.events.map((e) => [e.t]), 0)).toBe(true);
  });

  it('keeps grid positions from before lights out and every race-control message', () => {
    expect(data.positions.some(([, t]) => t < 0)).toBe(true);
    expect(data.events).toHaveLength(155);
  });
});

describe('toDrivers', () => {
  it('maps the 22 drivers with #RRGGBB colours', () => {
    const drivers = toDrivers(fixture('drivers'));
    expect(drivers).toHaveLength(22);
    expect(drivers.every((d) => /^#[0-9A-F]{6}$/i.test(d.colour))).toBe(true);
    expect(drivers[0]).toMatchObject({ n: 1, code: 'NOR', teamName: 'McLaren', colour: '#F47600' });
  });

  it('falls back to grey when the team colour is missing', () => {
    expect(toDrivers([{ driver_number: 9, name_acronym: 'X', full_name: 'X Y', team_name: 'Z', team_colour: null }])[0]!.colour).toBe('#888888');
  });
});

describe('pack / unpack', () => {
  it('round-trips real samples and shrinks them to under 40% of compact JSON', () => {
    const samples = toSamples(fixture<OLocation[]>('location-10s'), Date.parse('2026-10-11T12:03:39.077Z'));
    expect(unpack(pack(samples))).toEqual(samples);
    expect(pack(samples).length).toBeLessThan(JSON.stringify(samples).length * 0.4);
  });
});
