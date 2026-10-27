import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MRData, toDriver, toRace, toRaceResults, toStandings, toTeam } from '../src/services/jolpica.transform.ts';
import { CacheMeta } from '../src/models/CacheMeta.ts';
import { clearDb, startDb, stopDb } from './db.ts';

vi.mock('../src/services/jolpica.ts', () => ({
  jolpica: { schedule: vi.fn(), results: vi.fn(), seasonResults: vi.fn(), standings: vi.fn(), drivers: vi.fn(), teams: vi.fn() },
}));
const { jolpica } = await import('../src/services/jolpica.ts');
const { createApp } = await import('../src/app.ts');

const fixture = (name: string): MRData =>
  JSON.parse(readFileSync(new URL(`./fixtures/jolpica/${name}.json`, import.meta.url), 'utf8')).MRData;
const schedule = fixture('2025-schedule').RaceTable!.Races.map(toRace);
const round1 = toRaceResults([fixture('2025-1-results')], 'race');
const sprint2 = toRaceResults([fixture('2025-2-sprint')], 'sprint');

const app = createApp();
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.mocked(jolpica.schedule).mockResolvedValue(schedule);
  vi.mocked(jolpica.results).mockImplementation(async (_s, round) => (round === 1 ? round1[0]! : null));
  vi.mocked(jolpica.seasonResults).mockImplementation(async (_s, type) => (type === 'race' ? round1 : sprint2));
  vi.mocked(jolpica.standings).mockImplementation(async (_s, kind) =>
    toStandings([fixture(kind === 'driver' ? '2025-driverstandings' : '2025-constructorstandings')], kind),
  );
  vi.mocked(jolpica.drivers).mockResolvedValue(fixture('2025-drivers').DriverTable!.Drivers.map(toDriver));
  vi.mocked(jolpica.teams).mockResolvedValue(fixture('2025-constructors').ConstructorTable!.Constructors.map(toTeam));
});

describe('season endpoints', () => {
  it('GET schedule', async () => {
    const res = await request(app).get('/api/seasons/2025/schedule');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(24);
    expect(res.headers['x-data-stale']).toBeUndefined();
  });

  it('GET results for a raced round', async () => {
    const res = await request(app).get('/api/seasons/2025/races/1/results');
    expect(res.status).toBe(200);
    expect(res.body.entries[0].driverId).toBe('norris');
  });

  it('GET results for a round with no results yet returns empty entries', async () => {
    const res = await request(app).get('/api/seasons/2025/races/24/results?type=sprint');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ season: 2025, round: 24, type: 'sprint', raceName: 'Abu Dhabi Grand Prix', entries: [] });
  });

  it('GET results for a round not on the schedule is 404', async () => {
    const res = await request(app).get('/api/seasons/2025/races/25/results');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects bad input with 400', async () => {
    for (const path of ['/api/seasons/abc/schedule', '/api/seasons/2099/schedule', '/api/seasons/2025/races/1/results?type=practice', '/api/seasons/2025/drivers/BAD!']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
  });

  it('GET driver and constructor standings', async () => {
    const d = await request(app).get('/api/seasons/2025/standings/drivers');
    expect(d.body.entries[0]).toMatchObject({ id: 'norris', points: 423 });
    const c = await request(app).get('/api/seasons/2025/standings/constructors');
    expect(c.body.entries[0]).toMatchObject({ id: 'mclaren', points: 833 });
  });

  it('GET standings before a season starts returns an empty table', async () => {
    vi.mocked(jolpica.standings).mockResolvedValue(null);
    const res = await request(app).get('/api/seasons/current/standings/drivers');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ afterRound: 0, kind: 'driver', entries: [] });
  });

  it('GET driver detail adds race + sprint points', async () => {
    const res = await request(app).get('/api/seasons/2025/drivers/hamilton');
    expect(res.status).toBe(200);
    const raceRow = round1[0]!.entries.find((e) => e.driverId === 'hamilton')!;
    const sprintRow = sprint2[0]!.entries.find((e) => e.driverId === 'hamilton')!;
    expect(res.body.driver.familyName).toBe('Hamilton');
    expect(res.body.results).toHaveLength(1);
    expect(res.body.totalPoints).toBe(raceRow.points + sprintRow.points);
    expect(res.body.teams.map((t: { teamId: string }) => t.teamId)).toEqual(['ferrari']);
  });

  it('GET unknown driver is 404', async () => {
    const res = await request(app).get('/api/seasons/2025/drivers/nobody');
    expect(res.status).toBe(404);
  });

  it('GET teams includes a colour for every 2025 team', async () => {
    const res = await request(app).get('/api/seasons/2025/teams');
    expect(res.status).toBe(200);
    expect(res.body.find((t: { teamId: string }) => t.teamId === 'mclaren')).toMatchObject({ colour: '#F47600' });
    expect(res.body.every((t: { colour: string | null }) => /^#[0-9A-F]{6}$/i.test(t.colour ?? ''))).toBe(true);
  });

  it('GET team detail lists its drivers and per-round points', async () => {
    const res = await request(app).get('/api/seasons/2025/teams/mclaren');
    expect(res.status).toBe(200);
    expect(res.body.drivers.map((d: { driverId: string }) => d.driverId).sort()).toEqual(['norris', 'piastri']);
    expect(res.body.results[0]).toMatchObject({ round: 1, bestPosition: 1 });
  });

  it('returns 503 JSON when Jolpica is down and nothing is cached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(jolpica.schedule).mockRejectedValue(new Error('down'));
    const res = await request(app).get('/api/seasons/2025/schedule');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    vi.restoreAllMocks();
  });

  it('returns cached data with stale header when upstream is down', async () => {
    await request(app).get('/api/seasons/2025/schedule');
    await CacheMeta.updateOne({ key: 'schedule:2025' }, { $set: { fetchedAt: new Date('2025-06-01T00:00:00Z') } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vi.mocked(jolpica.schedule).mockRejectedValue(new Error('down'));
      const res = await request(app).get('/api/seasons/2025/schedule');
      expect(res.status).toBe(200);
      expect(res.headers['x-data-stale']).toBe('true');
      expect(res.body).toHaveLength(24);
    } finally {
      warn.mockRestore();
    }
  });
});
