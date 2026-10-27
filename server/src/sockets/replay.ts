import type { ReplayMeta } from '@f1/shared';
import type { Server, Socket } from 'socket.io';
import { z, ZodError } from 'zod';
import { AppError } from '../errors.ts';
import { ensureTrack, loadSession, samplesBetween } from '../services/replay/store.ts';
import { toReplayTrack } from '../services/replay/track.ts';
import { ReplayEngine, TICK_MS, type Speed } from './replayEngine.ts';

const JoinPayload = z.object({ sessionKey: z.number().int().positive() });
const SeekPayload = z.object({ t: z.number().finite() });
const SpeedPayload = z.object({ x: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16)]) });

const engines = new Set<ReplayEngine>();

/** Engines alive right now; a test hook and a leak check. */
export function activeEngineCount(): number {
  return engines.size;
}

function fail(socket: Socket, code: string, message: string) {
  socket.emit('replay:error', { code, message });
}

/** Routes a thrown error to replay:error: bad input is VALIDATION, a missing session is NOT_FOUND, anything else is INTERNAL. */
function report(socket: Socket, err: unknown) {
  if (err instanceof ZodError) {
    fail(socket, 'VALIDATION', err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  } else if (err instanceof AppError) {
    fail(socket, err.code, err.message);
  } else {
    console.error(err);
    fail(socket, 'INTERNAL', 'Replay failed, please retry');
  }
}

export function attachReplay(io: Server) {
  io.of('/replay').on('connection', (socket) => {
    let engine: ReplayEngine | undefined;
    let timer: NodeJS.Timeout | undefined;

    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      if (engine) engines.delete(engine);
      engine = undefined;
    };
    const current = () => {
      if (!engine) throw new AppError(409, 'NOT_JOINED', 'Join a replay first');
      return engine;
    };
    const on = (event: string, handler: (payload: unknown) => void | Promise<void>) =>
      socket.on(event, async (payload: unknown) => {
        try {
          await handler(payload);
        } catch (err) {
          report(socket, err);
        }
      });

    on('replay:join', async (payload) => {
      const { sessionKey } = JoinPayload.parse(payload);
      const session = await loadSession(sessionKey);
      if (!session) throw new AppError(404, 'NOT_FOUND', `No stored replay ${sessionKey}`);
      stop();
      engine = new ReplayEngine(
        session,
        (event, data) => socket.emit(event, data),
        (from, to) => samplesBetween(session, from, to),
      );
      engines.add(engine);
      const meta: ReplayMeta = {
        session: session.summary,
        drivers: session.drivers,
        outline: session.outline,
        stints: session.data.stints,
        track: toReplayTrack(session.track, session.data.laps),
      };
      socket.emit('replay:meta', meta);
      engine.seek(0);
      const replay = engine;
      // First viewer of a session: look the track details up in the background, then send them if this socket is still here.
      if (!session.track) {
        void ensureTrack(session).then((track) => {
          if (track && engine === replay) socket.emit('replay:track', toReplayTrack(track, session.data.laps));
        });
      }
      timer = setInterval(() => {
        replay.tick().catch((err: unknown) => report(socket, err));
      }, TICK_MS);
    });

    on('replay:play', () => current().play());
    on('replay:pause', () => current().pause());
    on('replay:seek', (payload) => current().seek(SeekPayload.parse(payload).t));
    on('replay:speed', (payload) => current().setSpeed(SpeedPayload.parse(payload).x as Speed));

    socket.on('disconnect', stop);
  });
}
