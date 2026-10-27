import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { Server } from 'socket.io';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayChunkModel } from '../src/models/ReplayChunk.ts';
import { ReplaySessionModel } from '../src/models/ReplaySession.ts';
import { forgetSession } from '../src/services/replay/store.ts';
import { fetchTrack } from '../src/services/replay/track.ts';
import { pack, type ReplayData } from '../src/services/replay/transform.ts';
import { activeEngineCount, attachReplay } from '../src/sockets/replay.ts';
import { clearDb, startDb, stopDb } from './db.ts';

// The track lookup would call OpenF1 and MultiViewer; the socket only needs to see what happens with its result.
vi.mock('../src/services/replay/track.ts', async (importOriginal) => ({ ...(await importOriginal<object>()), fetchTrack: vi.fn() }));

const DURATION = 120_000;
const data: ReplayData = {
  laps: [[1, 1, 0], [1, 2, 60_000]],
  positions: [[1, -1000, 1]],
  intervals: [],
  stints: [[1, 1, 2, 'SOFT']],
  events: [],
};
const chunk = (minute: number) => {
  const samples: [number, number, number, number][] = [];
  for (let t = minute * 60_000; t < (minute + 1) * 60_000; t += 250) samples.push([1, t, t / 10, 0]);
  return samples;
};

let io: Server;
let url: string;

beforeAll(async () => {
  await startDb();
  const server = http.createServer();
  io = new Server(server);
  attachReplay(io);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}/replay`;
});
afterAll(async () => {
  io.close();
  await stopDb();
});

beforeEach(async () => {
  await clearDb();
  forgetSession(1);
  vi.mocked(fetchTrack).mockReset();
  vi.mocked(fetchTrack).mockResolvedValue({ corners: [{ number: 1, x: 10, y: 20, angle: 45 }], pitLane: [[0, 0], [100, 0]], dnf: [1] });
  await ReplaySessionModel.create({
    sessionKey: 1,
    meetingKey: 1296,
    meetingName: 'Singapore Grand Prix',
    countryName: 'Singapore',
    sessionType: 'Race',
    startsAt: new Date('2026-10-11T12:03:39.077Z'),
    durationMs: DURATION,
    totalLaps: 2,
    drivers: [{ n: 1, code: 'NOR', name: 'Lando Norris', teamName: 'McLaren', colour: '#F47600' }],
    outline: [[0, 0]],
    data: pack(data),
    complete: true,
  });
  for (const minute of [0, 1]) await ReplayChunkModel.create({ sessionKey: 1, minute, data: pack(chunk(minute)) });
});

async function connected(): Promise<ClientSocket> {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  await new Promise<void>((resolve) => s.on('connect', () => resolve()));
  return s;
}

/** Resolves with the next payload of `event`. Register before emitting the request that causes it. */
const nextEvent = <T = any>(s: ClientSocket, event: string) => new Promise<T>((resolve) => s.once(event, resolve));

async function waitFor(cond: () => boolean, ms = 500) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return cond();
}

describe('/replay socket', () => {
  it('join sends meta, then state at t = 0', async () => {
    const s = await connected();
    const meta = nextEvent(s, 'replay:meta');
    const state = nextEvent(s, 'replay:state');
    s.emit('replay:join', { sessionKey: 1 });
    expect(await meta).toMatchObject({ session: { sessionKey: 1, totalLaps: 2 }, drivers: [{ code: 'NOR' }], stints: expect.any(Array) });
    expect(await state).toMatchObject({ playing: false, speed: 1, t: 0 });
    s.disconnect();
  });

  it('sends the track details after the meta when they were not stored yet, and in the meta once they are', async () => {
    const s = await connected();
    const meta = nextEvent(s, 'replay:meta');
    const track = nextEvent(s, 'replay:track');
    s.emit('replay:join', { sessionKey: 1 });
    expect((await meta).track).toBeNull();
    // Driver 1 retired: parked only after its last lap began at 60 s.
    expect(await track).toEqual({ corners: [{ number: 1, x: 10, y: 20, angle: 45 }], pitLane: [[0, 0], [100, 0]], retired: [[1, 60_000]] });

    const again = nextEvent(s, 'replay:meta');
    s.emit('replay:join', { sessionKey: 1 });
    expect((await again).track).toMatchObject({ retired: [[1, 60_000]] });
    expect(fetchTrack).toHaveBeenCalledTimes(1);
    s.disconnect();
  });

  it('play sends frames with samples', async () => {
    const s = await connected();
    const frames = nextEvent(s, 'replay:frames');
    s.emit('replay:join', { sessionKey: 1 });
    s.emit('replay:play');
    const { samples } = await frames;
    expect(samples.length).toBeGreaterThan(0);
    s.disconnect();
  });

  it('seek answers with state at the new time and reset', async () => {
    const s = await connected();
    const state = nextEvent(s, 'replay:state');
    s.emit('replay:join', { sessionKey: 1 });
    await nextEvent(s, 'replay:meta');
    await state;
    const seeked = nextEvent(s, 'replay:state');
    s.emit('replay:seek', { t: 60_000 });
    expect(await seeked).toMatchObject({ t: 60_000, reset: true });
    s.disconnect();
  });

  it('rejects malformed input and unknown sessions, and keeps the socket usable', async () => {
    const s = await connected();
    const bad = nextEvent(s, 'replay:error');
    s.emit('replay:join', { sessionKey: 'abc' });
    expect(await bad).toMatchObject({ code: 'VALIDATION' });

    const missing = nextEvent(s, 'replay:error');
    s.emit('replay:join', { sessionKey: 999 });
    expect(await missing).toMatchObject({ code: 'NOT_FOUND' });

    const joined = nextEvent(s, 'replay:meta');
    s.emit('replay:join', { sessionKey: 1 });
    await joined;
    const speed = nextEvent(s, 'replay:error');
    s.emit('replay:speed', { x: 3 });
    expect(await speed).toMatchObject({ code: 'VALIDATION' });

    const meta = nextEvent(s, 'replay:meta');
    s.emit('replay:join', { sessionKey: 1 });
    expect(await meta).toMatchObject({ session: { sessionKey: 1 } });
    s.disconnect();
  });

  it('frees the engine when the viewer disconnects', async () => {
    const before = activeEngineCount();
    const s = await connected();
    const meta = nextEvent(s, 'replay:meta');
    s.emit('replay:join', { sessionKey: 1 });
    await meta;
    expect(activeEngineCount()).toBe(before + 1);
    s.disconnect();
    expect(await waitFor(() => activeEngineCount() === before)).toBe(true);
  });
});
