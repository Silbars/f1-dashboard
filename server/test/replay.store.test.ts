import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayChunkModel } from '../src/models/ReplayChunk.ts';
import { ReplaySessionModel } from '../src/models/ReplaySession.ts';
import type { OSession } from '../src/services/openf1.ts';
import { clearDb, startDb, stopDb } from './db.ts';

vi.mock('../src/services/openf1.ts', () => ({ openf1: vi.fn() }));
const { openf1 } = await import('../src/services/openf1.ts');
const store = await import('../src/services/replay/store.ts');

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/openf1/${name}.json`, import.meta.url), 'utf8'));
const session: OSession = {
  session_key: 11388,
  session_name: 'Race',
  session_type: 'Race',
  meeting_key: 1296,
  date_start: '2026-10-11T11:00:00+00:00',
  date_end: '2026-10-11T13:00:00+00:00',
  year: 2026,
  country_name: 'Singapore',
  location: 'Marina Bay',
};
const LIGHTS_OUT = Date.parse('2026-10-11T12:03:39.077Z');
const location10s = fixture('location-10s');

/** Answers OpenF1 paths from the fixtures. The 10 s window is minute 0 of the race. */
function answer(path: string): unknown[] {
  const name = path.split('?')[0]!;
  if (name === 'location') {
    if (path.includes('driver_number=')) return location10s; // stands in for a clean lap's outline
    const from = Date.parse(/date>=([^&]+)/.exec(path)![1]!);
    const to = Date.parse(/date<([^&]+)/.exec(path)![1]!);
    return location10s.filter((r: { date: string }) => Date.parse(r.date) >= from && Date.parse(r.date) < to);
  }
  return fixture(name);
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  store.clearChunkMemory();
  store.forgetSession(session.session_key);
  vi.mocked(openf1).mockReset();
  vi.mocked(openf1).mockImplementation(async (path: string) => answer(path) as never);
});

async function ingest() {
  await store.ingestSession(session, 'Singapore Grand Prix');
  return (await store.loadSession(session.session_key))!;
}

describe('replay store', () => {
  it('ingests metadata and loads it once from Mongo', async () => {
    const s = await ingest();
    expect(s.summary).toMatchObject({ sessionKey: 11388, sessionType: 'Race', totalLaps: 62, meetingName: 'Singapore Grand Prix' });
    expect(s.drivers).toHaveLength(22);
    expect(s.outline.length).toBeGreaterThan(100);
    expect(s.startsAtMs).toBe(LIGHTS_OUT);

    store.forgetSession(session.session_key);
    const spy = vi.spyOn(ReplaySessionModel, 'findOne');
    await store.loadSession(session.session_key);
    await store.loadSession(session.session_key);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('returns null for a session that was never stored', async () => {
    expect(await store.loadSession(999)).toBeNull();
  });

  it('getChunk fetches once, stores the chunk, then reads it back from Mongo', async () => {
    const s = await ingest();
    const first = await store.getChunk(s, 0);
    expect(first.length).toBe(836);
    expect(await ReplayChunkModel.countDocuments({ sessionKey: 11388, minute: 0 })).toBe(1);

    store.clearChunkMemory();
    vi.mocked(openf1).mockClear();
    expect(await store.getChunk(s, 0)).toEqual(first);
    expect(openf1).not.toHaveBeenCalled();
  });

  it('shares one OpenF1 call between concurrent getChunk calls', async () => {
    const s = await ingest();
    vi.mocked(openf1).mockClear();
    await Promise.all([store.getChunk(s, 0), store.getChunk(s, 0)]);
    const locationCalls = vi.mocked(openf1).mock.calls.filter(([p]) => p.startsWith('location'));
    expect(locationCalls).toHaveLength(1);
  });

  it('stores an empty minute and never refetches it', async () => {
    const s = await ingest();
    expect(await store.getChunk(s, 5)).toEqual([]);
    expect(await ReplayChunkModel.findOne({ sessionKey: 11388, minute: 5 })).not.toBeNull();

    vi.mocked(openf1).mockClear();
    expect(await store.getChunk(s, 5)).toEqual([]);
    expect(openf1).not.toHaveBeenCalled();
  });

  it('samplesBetween returns only samples in (from, to], sorted', async () => {
    const s = await ingest();
    const out = await store.samplesBetween(s, 500, 1500);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every(([, t]) => t > 500 && t <= 1500)).toBe(true);
    expect(out.every((x, i) => i === 0 || out[i - 1]![1] <= x[1])).toBe(true);
  });
});
