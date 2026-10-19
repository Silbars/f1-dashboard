import { describe, expect, it } from 'vitest';
import type { LoadedSession } from '../src/services/replay/store.ts';
import { type Emit, ReplayEngine } from '../src/sockets/replayEngine.ts';
import { boardAt, type ReplayData } from '../src/services/replay/transform.ts';

const DURATION = 120_000;

// Two cars, 250 ms samples for two minutes. Car 1 starts 2nd on the grid and swaps to 1st at 30 s.
const data: ReplayData = {
  laps: [
    [1, 1, 0],
    [2, 1, 0],
    [1, 2, 60_000],
    [2, 2, 60_000],
  ],
  positions: [
    [1, -1000, 2],
    [2, -1000, 1],
    [1, 30_000, 1],
    [2, 30_000, 2],
  ],
  intervals: [
    [1, 0, '+0.000', null],
    [2, 0, '+1.500', '+1.500'],
  ],
  stints: [
    [1, 1, 2, 'SOFT'],
    [2, 1, 1, 'MEDIUM'],
    [2, 2, 2, 'HARD'],
  ],
  events: [
    { t: 5_000, category: 'Flag', flag: 'YELLOW', message: 'YELLOW IN TRACK SECTOR 3' },
    { t: 50_000, category: 'SafetyCar', flag: null, message: 'SAFETY CAR DEPLOYED' },
  ],
};
const samples: [number, number, number, number][] = [];
for (let t = 0; t < DURATION; t += 250) {
  samples.push([1, t, t / 10, 0], [2, t, t / 10, 5]);
}
const getSamples = async (from: number, to: number) => samples.filter(([, t]) => t > from && t <= to);

const session: LoadedSession = {
  summary: {
    sessionKey: 1,
    meetingKey: 1,
    meetingName: 'Test GP',
    countryName: 'Testland',
    sessionType: 'Race',
    startsAt: '2026-10-11T12:00:00.000Z',
    durationMs: DURATION,
    totalLaps: 2,
  },
  drivers: [],
  outline: [],
  data,
  startsAtMs: Date.parse('2026-10-11T12:00:00.000Z'),
};

function harness() {
  let clock = 0;
  const emitted: [string, any][] = [];
  const emit: Emit = (event, payload) => emitted.push([event, payload]);
  const engine = new ReplayEngine(session, emit, getSamples, () => clock);
  return {
    engine,
    emitted,
    advance: (ms: number) => (clock += ms),
    named: (name: string) => emitted.filter(([e]) => e === name).map(([, p]) => p),
  };
}

describe('boardAt', () => {
  it('uses grid positions before lights out and flips the order at 30 s', () => {
    expect(boardAt(data, -500)).toMatchObject({ lap: 0, rows: [{ n: 2, position: 1 }, { n: 1, position: 2 }] });
    expect(boardAt(data, 30_000).rows.map((r) => r.n)).toEqual([1, 2]);
  });

  it('follows stint boundaries for the tyre compound', () => {
    expect(boardAt(data, 30_000).rows.map((r) => r.compound)).toEqual(['SOFT', 'MEDIUM']);
    expect(boardAt(data, 70_000).rows.find((r) => r.n === 2)?.compound).toBe('HARD');
    expect(boardAt(data, 70_000).lap).toBe(2);
  });
});

describe('ReplayEngine', () => {
  it('advances the clock by wall time × speed and sends the lookahead', async () => {
    const h = harness();
    h.engine.setSpeed(4);
    h.engine.play();
    h.advance(250);
    await h.engine.tick();
    expect(h.engine.t).toBe(1000);
    const frames = h.named('replay:frames');
    expect(frames).toHaveLength(1);
    expect(frames[0].samples.every(([, t]: [number, number]) => t <= 1000 + 8000)).toBe(true);
  });

  it('sends no duplicate samples when the clock has not moved', async () => {
    const h = harness();
    h.engine.setSpeed(4);
    h.engine.play();
    h.advance(250);
    await h.engine.tick();
    await h.engine.tick();
    expect(h.named('replay:frames')).toHaveLength(1);
  });

  it('emits each race-control event once, when the clock passes it', async () => {
    const h = harness();
    h.engine.setSpeed(4);
    h.engine.play();
    h.advance(1250); // t = 5000
    await h.engine.tick();
    h.advance(250);
    await h.engine.tick();
    h.advance(11_000); // t = 50000
    await h.engine.tick();
    expect(h.named('replay:event').map((e) => e.flag ?? e.category)).toEqual(['YELLOW', 'SafetyCar']);
  });

  it('clamps seeks: negative to 0, past the end to the duration, NaN to 0; each resets the client', () => {
    const h = harness();
    h.engine.seek(-5);
    expect(h.engine.t).toBe(0);
    h.engine.seek(1e9);
    expect(h.engine.t).toBe(DURATION);
    h.engine.seek(Number.NaN);
    expect(h.engine.t).toBe(0);
    expect(h.named('replay:state').every((s) => s.reset === true)).toBe(true);
  });

  it('stops at the end of the race', async () => {
    const h = harness();
    h.engine.setSpeed(16);
    h.engine.play();
    h.advance(60_000);
    await h.engine.tick();
    expect(h.engine.t).toBe(DURATION);
    expect(h.engine.playing).toBe(false);
    expect(h.named('replay:state').at(-1)).toMatchObject({ playing: false, t: DURATION });
  });

  it('emits buffering only when a fetch is slow', async () => {
    const slow = async (from: number, to: number) => {
      await new Promise((r) => setTimeout(r, 400));
      return getSamples(from, to);
    };
    let clock = 0;
    const emitted: [string, unknown][] = [];
    const engine = new ReplayEngine(session, (e, p) => emitted.push([e, p]), slow, () => clock);
    engine.play();
    clock = 250;
    await engine.tick();
    expect(emitted.filter(([e]) => e === 'replay:buffering')).toEqual([
      ['replay:buffering', { on: true }],
      ['replay:buffering', { on: false }],
    ]);
  });
});
