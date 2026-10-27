import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplaySessionModel } from '../src/models/ReplaySession.ts';
import type { OLocation, OPit } from '../src/services/openf1.ts';
import { ensureTrack, forgetSession, loadSession } from '../src/services/replay/store.ts';
import { fetchTrack, pitLaneWindow, retirementsOf, toCorners, toPitLane, toReplayTrack } from '../src/services/replay/track.ts';
import { pack, type ReplayData } from '../src/services/replay/transform.ts';
import { clearDb, startDb, stopDb } from './db.ts';

// Only the lookup is replaced; the pure helpers below are the real ones.
vi.mock('../src/services/replay/track.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), fetchTrack: vi.fn() }));

const pit = (driver_number: number, date: string, lane_duration: number | null): OPit => ({ driver_number, date, lane_duration });
const loc = (date: string, x: number, y: number): OLocation => ({ date, driver_number: 1, x, y });

describe('toCorners', () => {
  it('keeps number, rounded position and label angle, in turn order', () => {
    const corners = toCorners({
      corners: [
        { number: 2, angle: -200.6, trackPosition: { x: 3414.02, y: -1696.49 } },
        { number: 1, angle: -44.65, trackPosition: { x: 3743.5, y: -4013.36 } },
      ],
    });
    expect(corners).toEqual([
      { number: 1, x: 3744, y: -4013, angle: -45 },
      { number: 2, x: 3414, y: -1696, angle: -201 },
    ]);
  });
});

describe('pitLaneWindow', () => {
  it('uses the quickest stop and ends at the pit exit, padded either side', () => {
    const exit = Date.parse('2026-10-25T20:31:36.000Z');
    const win = pitLaneWindow([pit(1, '2026-10-25T20:20:00.000Z', 31), pit(16, '2026-10-25T20:31:36.000Z', 24), pit(3, '2026-10-25T20:40:00.000Z', null)]);
    expect(win).toEqual({ n: 16, from: exit - 24_000 - 2500, to: exit + 2500 });
  });

  it('is null when no stop has a lane time', () => {
    expect(pitLaneWindow([])).toBeNull();
    expect(pitLaneWindow([pit(1, '2026-10-25T20:20:00.000Z', null)])).toBeNull();
  });
});

describe('toPitLane', () => {
  it('orders by time, drops no-signal rows and thins out a parked car', () => {
    const lane = toPitLane([
      loc('2026-10-25T20:31:03.000Z', 300, 0),
      loc('2026-10-25T20:31:01.000Z', 0, 0),
      loc('2026-10-25T20:31:00.000Z', 100, 0),
      loc('2026-10-25T20:31:02.000Z', 105, 3), // 5 units from the last kept sample: parked
      loc('2026-10-25T20:31:02.500Z', 200, 0),
    ]);
    expect(lane).toEqual([[100, 0], [200, 0], [300, 0]]);
  });
});

describe('retirementsOf', () => {
  const laps: ReplayData['laps'] = [[1, 1, 0], [1, 2, 90_000], [1, 3, 180_000], [7, 1, 0]];

  it('marks each retired car from the start of its last lap', () => {
    expect(retirementsOf([1, 7], laps)).toEqual([[1, 180_000], [7, 0]]);
  });

  it('starts a car with no laps from the beginning', () => {
    expect(retirementsOf([99], laps)).toEqual([[99, 0]]);
  });

  it('turns a missing stored track into null', () => {
    expect(toReplayTrack(null, laps)).toBeNull();
  });
});

describe('ensureTrack', () => {
  const stored = { corners: [], pitLane: [[1, 2]] as [number, number][], dnf: [4] };
  const data: ReplayData = { laps: [[1, 1, 0]], positions: [], intervals: [], stints: [], events: [] };

  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await clearDb();
    forgetSession(5);
    vi.mocked(fetchTrack).mockReset();
    await ReplaySessionModel.create({
      sessionKey: 5,
      meetingKey: 1,
      meetingName: 'Test GP',
      countryName: 'Testland',
      sessionType: 'Race',
      startsAt: new Date('2026-10-11T12:00:00Z'),
      durationMs: 60_000,
      totalLaps: 1,
      drivers: [],
      outline: [[0, 0]],
      data: pack(data),
    });
  });

  it('looks the details up once, stores them and keeps them for the next load', async () => {
    vi.mocked(fetchTrack).mockResolvedValue(stored);
    const session = (await loadSession(5))!;
    expect(session.track).toBeNull();

    // Two joins at once share one lookup.
    const [a, b] = await Promise.all([ensureTrack(session), ensureTrack(session)]);
    expect(a).toEqual(stored);
    expect(b).toEqual(stored);
    expect(await ensureTrack(session)).toEqual(stored);
    expect(fetchTrack).toHaveBeenCalledTimes(1);

    forgetSession(5);
    expect((await loadSession(5))!.track).toEqual(stored);
  });

  it('stores nothing when a source fails, so the next join tries again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetchTrack).mockRejectedValueOnce(new Error('OpenF1 down')).mockResolvedValueOnce(stored);
    const session = (await loadSession(5))!;
    expect(await ensureTrack(session)).toBeNull();
    expect(session.track).toBeNull();
    expect((await ReplaySessionModel.findOne({ sessionKey: 5 }))!.track).toBeUndefined();

    expect(await ensureTrack(session)).toEqual(stored);
  });
});
