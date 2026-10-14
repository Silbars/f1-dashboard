import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHome } from '../src/services/home.ts';
import { type MRData, toRace, toStandings } from '../src/services/jolpica.transform.ts';
import { clearDb, startDb, stopDb } from './db.ts';

const fixture = (name: string): MRData =>
  JSON.parse(readFileSync(new URL(`./fixtures/jolpica/${name}.json`, import.meta.url), 'utf8')).MRData;
const schedule = fixture('2025-schedule').RaceTable!.Races.map(toRace);
const drivers = toStandings([fixture('2025-driverstandings')], 'driver');
const constructors = toStandings([fixture('2025-constructorstandings')], 'constructor');

describe('buildHome', () => {
  const base = { season: 2025, schedule, drivers, constructors, user: null };

  it('finds the next session and race mid-season', () => {
    // Between the Chinese GP sprint (Mar 22 03:00Z) and qualifying (Mar 22 07:00Z)
    const h = buildHome({ ...base, now: new Date('2025-03-22T05:00:00Z') });
    expect(h.nextRace?.round).toBe(2);
    expect(h.nextSession).toMatchObject({ round: 2, session: { type: 'qualifying' } });
    expect(h.completedRounds).toBe(1);
    expect(h.totalRounds).toBe(24);
    expect(h.progressPct).toBeCloseTo(4.2, 1);
    expect(h.driverTop10).toHaveLength(10);
    expect(h.favourites).toBeNull();
    expect(h.fastestPitStop).toBeNull();
  });

  it('handles a finished season', () => {
    const h = buildHome({ ...base, now: new Date('2025-12-31T00:00:00Z') });
    expect(h.nextRace).toBeNull();
    expect(h.nextSession).toBeNull();
    expect(h.progressPct).toBe(100);
  });

  it('handles a season with no standings yet', () => {
    const h = buildHome({ ...base, drivers: null, constructors: null, now: new Date('2025-01-01T00:00:00Z') });
    expect(h.driverTop10).toEqual([]);
    expect(h.completedRounds).toBe(0);
  });

  it('looks up favourites for a logged-in user', () => {
    const h = buildHome({ ...base, now: new Date('2025-12-31T00:00:00Z'), user: { favouriteDriverId: 'leclerc', favouriteTeamId: null } });
    expect(h.favourites?.driver?.id).toBe('leclerc');
    expect(h.favourites?.team).toBeNull();
  });
});

vi.mock('../src/services/jolpica.ts', () => ({
  jolpica: { schedule: vi.fn(), results: vi.fn(), seasonResults: vi.fn(), standings: vi.fn(), drivers: vi.fn(), teams: vi.fn() },
}));
const { jolpica } = await import('../src/services/jolpica.ts');
const { createApp } = await import('../src/app.ts');

describe('GET /api/home', () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await clearDb();
    vi.mocked(jolpica.schedule).mockResolvedValue(schedule);
    vi.mocked(jolpica.standings).mockImplementation(async (_s, kind) => (kind === 'driver' ? drivers : constructors));
  });

  it('works logged out', async () => {
    const res = await request(createApp()).get('/api/home');
    expect(res.status).toBe(200);
    expect(res.body.favourites).toBeNull();
    expect(res.body.driverTop10).toHaveLength(10);
  });

  it('includes favourites when logged in, and falls back to logged-out for a deleted account', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ email: 'a@b.co', password: 'password123', displayName: 'A' });
    await agent.patch('/api/users/me').send({ favouriteDriverId: 'norris' });
    expect((await agent.get('/api/home')).body.favourites.driver.id).toBe('norris');

    const cookie = reg.headers['set-cookie'] as unknown as string[];
    await agent.delete('/api/users/me');
    const res = await request(app).get('/api/home').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.favourites).toBeNull();
  });
});
