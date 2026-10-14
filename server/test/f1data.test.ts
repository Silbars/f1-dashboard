import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheMeta } from '../src/models/CacheMeta.ts';
import { DriverModel } from '../src/models/Driver.ts';
import { type MRData, toDriver, toRace } from '../src/services/jolpica.transform.ts';
import { clearDb, startDb, stopDb } from './db.ts';

vi.mock('../src/services/jolpica.ts', () => ({
  jolpica: { schedule: vi.fn(), results: vi.fn(), seasonResults: vi.fn(), standings: vi.fn(), drivers: vi.fn(), teams: vi.fn() },
}));
const { jolpica } = await import('../src/services/jolpica.ts');
const { f1data } = await import('../src/services/f1data.ts');

const fixture = (name: string): MRData =>
  JSON.parse(readFileSync(new URL(`./fixtures/jolpica/${name}.json`, import.meta.url), 'utf8')).MRData;
const schedule2025 = fixture('2025-schedule').RaceTable!.Races.map(toRace);
const drivers2025 = fixture('2025-drivers').DriverTable!.Drivers.map(toDriver);

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.mocked(jolpica.schedule).mockReset();
  vi.mocked(jolpica.drivers).mockReset();
});

describe('f1data', () => {
  it('fetches once, then serves from Mongo', async () => {
    vi.mocked(jolpica.schedule).mockResolvedValue(schedule2025);
    const first = await f1data.schedule(2025);
    const second = await f1data.schedule(2025);
    expect(first.data).toHaveLength(24);
    expect(second).toEqual({ data: first.data, stale: false });
    expect(second.data[0]).not.toHaveProperty('_id');
    expect(jolpica.schedule).toHaveBeenCalledTimes(1);
  });

  it('serves the stale copy with stale: true when Jolpica fails', async () => {
    vi.mocked(jolpica.drivers).mockResolvedValue(drivers2025);
    await f1data.drivers(2025);
    // pretend the cached copy is from mid-2025 so it counts as stale
    await CacheMeta.updateOne({ key: 'drivers:2025' }, { $set: { fetchedAt: new Date('2025-06-01T00:00:00Z') } });
    vi.mocked(jolpica.drivers).mockRejectedValue(new Error('down'));
    const r = await f1data.drivers(2025);
    expect(r.stale).toBe(true);
    expect(r.data.length).toBe(drivers2025.length);
  });

  it('replaces a season list instead of duplicating it on refetch', async () => {
    vi.mocked(jolpica.drivers).mockResolvedValue(drivers2025);
    await f1data.drivers(2025);
    await CacheMeta.updateOne({ key: 'drivers:2025' }, { $set: { fetchedAt: new Date('2025-06-01T00:00:00Z') } });
    vi.mocked(jolpica.drivers).mockResolvedValue(drivers2025.slice(0, 5));
    await f1data.drivers(2025);
    expect(await DriverModel.countDocuments({ season: 2025 })).toBe(5);
  });

  it('shares one refresh between concurrent callers of the same key', async () => {
    vi.mocked(jolpica.drivers).mockResolvedValue(drivers2025);
    await f1data.drivers(2025);
    await CacheMeta.updateOne({ key: 'drivers:2025' }, { $set: { fetchedAt: new Date('2025-06-01T00:00:00Z') } });
    await Promise.all([f1data.drivers(2025), f1data.drivers(2025)]);
    expect(jolpica.drivers).toHaveBeenCalledTimes(2); // initial fill + one shared refresh
  });

  it('caches "no results yet" as null', async () => {
    vi.mocked(jolpica.results).mockResolvedValue(null);
    const r = await f1data.results(2026, 30, 'race');
    expect(r.data).toBeNull();
  });
});
