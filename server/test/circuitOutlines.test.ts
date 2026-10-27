import type { Race } from '@f1/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitOutlineModel } from '../src/models/CircuitOutline.ts';
import { clearDb, startDb, stopDb } from './db.ts';

vi.mock('../src/services/openf1.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), openf1: vi.fn() }));
const { openf1 } = await import('../src/services/openf1.ts');
const { thin, withOutlines } = await import('../src/services/circuitOutlines.ts');

const race = (round: number, id: string): Race => ({
  season: 2025,
  round,
  name: `Round ${round}`,
  circuit: { id, name: id, locality: 'Somewhere', country: 'Nowhere', lat: 0, long: 0 },
  sessions: [],
});

// 300 location rows, none at the (0, 0) no-signal value, so toSamples keeps them all.
const rows = Array.from({ length: 300 }, (_, i) => ({ date: new Date(Date.UTC(2025, 2, 16, 5, 10) + i * 250).toISOString(), driver_number: 1, x: i * 10 + 5, y: i * 5 + 5 }));

/** Serves a finished race with one clean lap and its location trace, as OpenF1 would. */
function openf1Serves({ sessions, laps = [], locations = [] }: { sessions: unknown[]; laps?: unknown[]; locations?: unknown[] }) {
  vi.mocked(openf1).mockImplementation((async (path: string) => {
    if (path.startsWith('sessions?')) return sessions;
    if (path.startsWith('laps?')) return laps;
    if (path.startsWith('location?')) return locations;
    return [];
  }) as never);
}

const finishedRace = { session_key: 9001, date_start: '2025-03-16T05:00:00.000Z', date_end: '2025-03-16T07:00:00.000Z' };
const cleanLap = { driver_number: 1, lap_number: 2, date_start: '2025-03-16T05:10:00.000Z', lap_duration: 90, is_pit_out_lap: false };

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.mocked(openf1).mockReset();
});

describe('thin', () => {
  it('keeps at most 200 evenly spaced points, rounded', () => {
    const points = Array.from({ length: 1000 }, (_, i): [number, number] => [i + 0.4, i + 0.6]);
    const out = thin(points);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out[0]).toEqual([0, 1]);
    expect(out[1]).toEqual([5, 6]);
  });

  it('leaves a short outline in place, only rounding it', () => {
    expect(thin([[1.4, 2.6]])).toEqual([[1, 3]]);
  });
});

describe('withOutlines', () => {
  it('attaches the outline once the background fetch has stored it', async () => {
    openf1Serves({ sessions: [finishedRace], laps: [cleanLap], locations: rows });

    const first = await withOutlines([race(1, 'albert_park')]);
    expect(first[0]!.circuit.outline).toBeUndefined();

    await vi.waitFor(async () => expect(await CircuitOutlineModel.countDocuments({ circuitId: 'albert_park' })).toBe(1));
    const [second] = await withOutlines([race(1, 'albert_park')]);
    expect(second!.circuit.outline).toHaveLength(150);
    expect(second!.circuit.outline![0]).toEqual([5, 5]);
  });

  it('never asks OpenF1 for a circuit it has no key for', async () => {
    openf1Serves({ sessions: [finishedRace], laps: [cleanLap], locations: rows });
    const races = await withOutlines([race(1, 'unknown_circuit')]);
    expect(races[0]!.circuit.outline).toBeUndefined();
    expect(openf1).not.toHaveBeenCalled();
  });

  it('records a circuit with no usable lap, so it is not fetched again', async () => {
    openf1Serves({ sessions: [] });
    await withOutlines([race(1, 'monza')]);
    await vi.waitFor(async () => expect(await CircuitOutlineModel.countDocuments({ circuitId: 'monza' })).toBe(1));
    expect((await CircuitOutlineModel.findOne({ circuitId: 'monza' }).lean())?.outline).toEqual([]);

    vi.mocked(openf1).mockClear();
    const races = await withOutlines([race(1, 'monza')]);
    expect(races[0]!.circuit.outline).toBeUndefined();
    expect(openf1).not.toHaveBeenCalled();
  });
});
