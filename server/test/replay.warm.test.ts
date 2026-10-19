import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.ts';
import { ReplayChunkModel } from '../src/models/ReplayChunk.ts';
import { ReplaySessionModel } from '../src/models/ReplaySession.ts';
import { openf1, type OSession } from '../src/services/openf1.ts';
import { forgetSession } from '../src/services/replay/store.ts';
import { pack } from '../src/services/replay/transform.ts';
import { pickNewestWeekends, startWarm, warm, warmStatus } from '../src/services/replay/warm.ts';
import { clearDb, startDb, stopDb } from './db.ts';

vi.mock('../src/services/openf1.ts', () => ({ openf1: vi.fn() }));
const { createApp } = await import('../src/app.ts');

const NOW = Date.parse('2026-10-19T12:00:00Z');
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/openf1/${name}.json`, import.meta.url), 'utf8'));
const location10s = fixture('location-10s');

const session = (session_key: number, meeting_key: number, session_name: 'Race' | 'Sprint' | 'Practice', start: string, end: string): OSession => ({
  session_key,
  session_name,
  session_type: session_name,
  meeting_key,
  date_start: start,
  date_end: end,
  year: 2026,
  country_name: 'X',
  location: 'X',
});
// The measured meetings: Spain 1294, Azerbaijan 1295, Bahrain 1308 and Singapore 1296 (with a sprint).
const SESSIONS: OSession[] = [
  session(11300, 1294, 'Race', '2026-09-13T13:00:00+00:00', '2026-09-13T15:00:00+00:00'),
  session(11301, 1295, 'Race', '2026-09-26T13:00:00+00:00', '2026-09-26T15:00:00+00:00'),
  session(11302, 1308, 'Race', '2026-10-04T13:00:00+00:00', '2026-10-04T15:00:00+00:00'),
  session(11386, 1296, 'Sprint', '2026-10-10T19:00:00+00:00', '2026-10-10T20:00:00+00:00'),
  session(11388, 1296, 'Race', '2026-10-11T12:03:39+00:00', '2026-10-11T13:50:00+00:00'),
  session(11399, 1310, 'Race', '2026-10-19T11:00:00+00:00', '2026-10-19T11:59:00+00:00'), // ended 1 min ago: not finished
];
const MEETINGS = [
  { meeting_key: 1294, meeting_name: 'Spanish Grand Prix', year: 2026 },
  { meeting_key: 1295, meeting_name: 'Azerbaijan Grand Prix', year: 2026 },
  { meeting_key: 1308, meeting_name: 'Bahrain Grand Prix', year: 2026 },
  { meeting_key: 1296, meeting_name: 'Singapore Grand Prix', year: 2026 },
];

/** OpenF1 answers from the fixtures; location answers filter the 10 s window by its date range. */
function answer(path: string): unknown[] {
  if (path.startsWith('sessions?')) return path.endsWith('2026') ? SESSIONS : [];
  if (path.startsWith('meetings?')) return path.endsWith('2026') ? MEETINGS : [];
  const name = path.split('?')[0]!;
  if (name === 'location') {
    if (path.includes('driver_number=')) return location10s;
    const from = Date.parse(/date>=([^&]+)/.exec(path)![1]!);
    const to = Date.parse(/date<([^&]+)/.exec(path)![1]!);
    return location10s.filter((r: { date: string }) => Date.parse(r.date) >= from && Date.parse(r.date) < to);
  }
  return fixture(name);
}

async function waitForIdle() {
  while (warmStatus().running) await new Promise((r) => setTimeout(r, 20));
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await waitForIdle();
  vi.mocked(openf1).mockReset();
  vi.mocked(openf1).mockImplementation(async (path: string) => answer(path) as never);
});

describe('pickNewestWeekends', () => {
  it('keeps the Race and Sprint of the 3 newest weekends by date, not meeting key', () => {
    const keys = pickNewestWeekends(SESSIONS, NOW).map((s) => s.session_key);
    expect(keys.sort()).toEqual([11301, 11302, 11386, 11388].sort());
  });

  it('excludes a session that ended less than 30 minutes ago', () => {
    expect(pickNewestWeekends(SESSIONS, NOW).some((s) => s.session_key === 11399)).toBe(false);
  });
});

describe('warm', () => {
  it('stores the picked sessions completely and deletes older ones', async () => {
    await ReplaySessionModel.create({
      sessionKey: 1,
      meetingKey: 1000,
      meetingName: 'Old GP',
      countryName: 'X',
      sessionType: 'Race',
      startsAt: new Date('2025-01-01T00:00:00Z'),
      durationMs: 60_000,
      totalLaps: 1,
      drivers: [],
      outline: [],
      data: pack({}),
      complete: true,
    });
    await ReplayChunkModel.create({ sessionKey: 1, minute: 0, data: pack([]) });

    const result = await warm(NOW);
    expect(result.stored.sort()).toEqual([11301, 11302, 11386, 11388]);
    expect(result.deleted).toEqual([1]);
    const stored = await ReplaySessionModel.find({}, { sessionKey: 1, complete: 1 }).lean();
    expect(stored.every((d) => d.complete)).toBe(true);
    expect(await ReplayChunkModel.countDocuments({ sessionKey: 11388 })).toBe(104);
    expect(await ReplayChunkModel.countDocuments({ sessionKey: 1 })).toBe(0);
  });

  it('makes no OpenF1 location calls when run again', async () => {
    await warm(NOW);
    vi.mocked(openf1).mockClear();
    await warm(NOW);
    const calls = vi.mocked(openf1).mock.calls.map(([p]) => p);
    expect(calls.filter((p) => p.startsWith('location'))).toHaveLength(0);
  });

  it('keeps existing replays when OpenF1 fails', async () => {
    await ReplaySessionModel.create({
      sessionKey: 1,
      meetingKey: 1000,
      meetingName: 'Old GP',
      countryName: 'X',
      sessionType: 'Race',
      startsAt: new Date('2025-01-01T00:00:00Z'),
      durationMs: 60_000,
      totalLaps: 1,
      drivers: [],
      outline: [],
      data: pack({}),
      complete: true,
    });
    vi.mocked(openf1).mockRejectedValue(new Error('OpenF1 down'));
    await expect(warm(NOW)).rejects.toThrow('OpenF1 down');
    expect(await ReplaySessionModel.countDocuments({ sessionKey: 1 })).toBe(1);
  });

  it('starts at most one run at a time', async () => {
    forgetSession(11388);
    expect(startWarm()).toEqual({ started: true });
    expect(startWarm()).toEqual({ started: false });
    await waitForIdle();
    expect(warmStatus()).toMatchObject({ running: false, error: null });
  });
});

describe('replay routes', () => {
  const app = createApp();

  it('GET /api/replay/sessions lists stored sessions, newest first', async () => {
    const base = { meetingKey: 1, meetingName: 'GP', countryName: 'X', durationMs: 60_000, totalLaps: 1, drivers: [], outline: [], data: pack({}) };
    await ReplaySessionModel.create({ ...base, sessionKey: 1, sessionType: 'Race', startsAt: new Date('2026-10-01T00:00:00Z') });
    await ReplaySessionModel.create({ ...base, sessionKey: 2, sessionType: 'Sprint', startsAt: new Date('2026-10-11T00:00:00Z') });
    const res = await request(app).get('/api/replay/sessions');
    expect(res.status).toBe(200);
    expect(res.body.map((s: { sessionKey: number }) => s.sessionKey)).toEqual([2, 1]);
    expect(res.body[0]).not.toHaveProperty('data');
    expect(res.body[0]).toMatchObject({ sessionType: 'Sprint', startsAt: '2026-10-11T00:00:00.000Z' });
  });

  it('internal warm routes need the bearer token', async () => {
    const denied = await request(app).post('/api/internal/warm');
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('UNAUTHENTICATED');
    expect((await request(app).get('/api/internal/warm').set('Authorization', 'Bearer wrong')).status).toBe(401);

    const ok = await request(app).post('/api/internal/warm').set('Authorization', `Bearer ${config.WARM_TOKEN}`);
    expect(ok.status).toBe(202);
    expect(ok.body).toEqual({ started: true });
    await waitForIdle();

    const status = await request(app).get('/api/internal/warm').set('Authorization', `Bearer ${config.WARM_TOKEN}`);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ running: false, startedAt: expect.any(String), finishedAt: expect.any(String) });
  });
});
