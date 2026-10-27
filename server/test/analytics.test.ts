import type { Driver, RaceResult, ResultEntry, ResultType } from '@f1/shared';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { headToHead } from '../src/services/analytics.ts';
import { type MRData, toDriver, toRaceResults } from '../src/services/jolpica.transform.ts';
import { clearDb, startDb, stopDb } from './db.ts';

vi.mock('../src/services/jolpica.ts', () => ({
  jolpica: { schedule: vi.fn(), results: vi.fn(), seasonResults: vi.fn(), standings: vi.fn(), drivers: vi.fn(), teams: vi.fn() },
}));
const { jolpica } = await import('../src/services/jolpica.ts');
const { createApp } = await import('../src/app.ts');

const driver = (driverId: string): Driver => ({ driverId, code: null, number: null, givenName: driverId, familyName: driverId, nationality: 'X', dateOfBirth: null });
const entry = (driverId: string, positionText: string, points = 0): ResultEntry => ({
  position: /^\d+$/.test(positionText) ? Number(positionText) : 20,
  positionText,
  number: null,
  driverId,
  driverCode: null,
  driverName: driverId,
  teamId: 't',
  teamName: 'T',
  grid: null,
  laps: null,
  status: null,
  points,
  time: null,
  fastestLap: null,
  q1: null,
  q2: null,
  q3: null,
});
const result = (round: number, type: ResultType, entries: ResultEntry[]): RaceResult => ({ season: 2025, round, type, raceName: `GP ${round}`, entries });

describe('headToHead', () => {
  const a = driver('alice');
  const b = driver('bob');
  const races = [
    result(1, 'race', [entry('alice', '1', 25), entry('bob', '3', 15)]),
    result(2, 'race', [entry('bob', '2', 18), entry('alice', 'R')]),
    result(3, 'race', [entry('bob', '5', 10)]), // alice missed the round
  ];
  const sprints = [result(2, 'sprint', [entry('alice', '1', 8), entry('bob', '2', 7)])];
  const qualifying = [result(1, 'qualifying', [entry('bob', '1'), entry('alice', '2')]), result(2, 'qualifying', [entry('bob', '1'), entry('alice', '2')])];
  const h = headToHead(2025, a, b, races, sprints, qualifying);

  it('adds race and sprint points and counts wins, podiums and DNFs', () => {
    expect(h.a).toMatchObject({ points: 33, wins: 1, podiums: 1, dnfs: 1 });
    expect(h.b).toMatchObject({ points: 50, wins: 0, podiums: 2, dnfs: 0 });
  });

  it('counts who finished ahead in races and in qualifying', () => {
    expect([h.a.raceAhead, h.b.raceAhead]).toEqual([1, 1]); // round 2: bob P2 ahead of alice, retired and placed 20th
    expect([h.a.qualiAhead, h.b.qualiAhead]).toEqual([0, 2]);
  });

  it('lists each round with both finishes and the gap, null when one driver is missing', () => {
    expect(h.rounds).toEqual([
      { round: 1, raceName: 'GP 1', a: '1', b: '3', gap: 2 },
      { round: 2, raceName: 'GP 2', a: 'R', b: '2', gap: -18 },
      { round: 3, raceName: 'GP 3', a: null, b: '5', gap: null },
    ]);
  });

  it('ignores a round where a driver never started: no gap, no DNF', () => {
    const w = headToHead(2026, a, b, [result(2, 'race', [entry('alice', 'W'), entry('bob', 'W')]), result(3, 'race', [entry('alice', '4'), entry('bob', 'W')])], [], []);
    expect(w.rounds.map((r) => r.gap)).toEqual([null, null]);
    expect([w.a.dnfs, w.b.dnfs, w.a.raceAhead, w.b.raceAhead]).toEqual([0, 0, 0, 0]);
  });
});

describe('GET /api/analytics/:year/head-to-head', () => {
  const fixture = (name: string): MRData =>
    JSON.parse(readFileSync(new URL(`./fixtures/jolpica/${name}.json`, import.meta.url), 'utf8')).MRData;
  const app = createApp();

  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await clearDb();
    vi.mocked(jolpica.drivers).mockResolvedValue(fixture('2025-drivers').DriverTable!.Drivers.map(toDriver));
    vi.mocked(jolpica.seasonResults).mockImplementation(async (_s, type) =>
      toRaceResults([fixture(type === 'race' ? '2025-1-results' : type === 'sprint' ? '2025-2-sprint' : '2025-1-qualifying')], type),
    );
  });

  it('compares two drivers over the season', async () => {
    const res = await request(app).get('/api/analytics/2025/head-to-head?a=norris&b=piastri');
    expect(res.status).toBe(200);
    expect(res.body.a.driver.driverId).toBe('norris');
    expect(res.body.a).toMatchObject({ wins: 1, raceAhead: 1 });
    expect(res.body.rounds).toHaveLength(1);
    expect(res.body.rounds[0].gap).toBeGreaterThan(0);
  });

  it('rejects the same driver twice and bad ids with 400', async () => {
    for (const q of ['a=norris&b=norris', 'a=norris', 'a=BAD!&b=piastri']) {
      const res = await request(app).get(`/api/analytics/2025/head-to-head?${q}`);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
  });

  it('answers 404 for a driver who did not race that season', async () => {
    const res = await request(app).get('/api/analytics/2025/head-to-head?a=norris&b=nobody');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('nobody');
  });
});
