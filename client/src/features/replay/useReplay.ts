import type { ReplayBoard, ReplayError, ReplayEvent, ReplayMeta, ReplaySample, ReplayState, ReplayTrack } from '@f1/shared';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { addSamples, clockAt } from '../../lib/replay';

export type LiveState = ReplayState & { at: number }; // at: this tab's performance.now() when the state arrived

interface Resume {
  t: number;
  playing: boolean;
  speed: number;
}

/** Joins a replay over Socket.io. One socket per mount; the server owns the clock, this hook buffers what it sends. */
export function useReplay(sessionKey: number) {
  const [meta, setMeta] = useState<ReplayMeta | null>(null);
  const [track, setTrack] = useState<ReplayTrack | null>(null); // arrives with the meta, or just after it the first time a session is viewed
  const [state, setState] = useState<LiveState | null>(null);
  const [board, setBoard] = useState<ReplayBoard | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]); // newest first
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<ReplayError | null>(null);
  const buffer: MutableRefObject<Map<number, ReplaySample[]>> = useRef(new Map());
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef<LiveState | null>(null);
  const durationRef = useRef(0);
  const resumeRef = useRef<Resume | null>(null); // where to pick up after a dropped connection

  useEffect(() => {
    const socket = io('/replay');
    socketRef.current = socket;
    const join = () => socket.emit('replay:join', { sessionKey });

    socket.on('connect', () => {
      setError(null);
      join();
    });
    socket.on('connect_error', () => setError({ code: 'NETWORK', message: 'Cannot reach the replay server. Retrying…' }));
    socket.on('disconnect', () => {
      const s = stateRef.current;
      if (s) resumeRef.current = { t: clockAt(s, performance.now(), durationRef.current), playing: s.playing, speed: s.speed };
    });
    // The server answers join asynchronously, so controls can only be sent once the meta has arrived.
    socket.on('replay:meta', (m: ReplayMeta) => {
      durationRef.current = m.session.durationMs;
      setMeta(m);
      setTrack(m.track);
      const resume = resumeRef.current;
      resumeRef.current = null;
      if (resume) {
        socket.emit('replay:speed', { x: resume.speed });
        socket.emit('replay:seek', { t: resume.t });
        if (resume.playing) socket.emit('replay:play');
      }
    });
    socket.on('replay:state', (s: ReplayState) => {
      const live = { ...s, at: performance.now() };
      stateRef.current = live;
      if (s.reset) {
        buffer.current.clear();
        setEvents([]);
      }
      setState(live);
    });
    socket.on('replay:track', (t: ReplayTrack) => setTrack(t));
    socket.on('replay:frames', ({ samples }: { samples: ReplaySample[] }) => addSamples(buffer.current, samples));
    socket.on('replay:board', (b: ReplayBoard) => setBoard(b));
    socket.on('replay:event', (e: ReplayEvent) => setEvents((prev) => [e, ...prev].slice(0, 40)));
    socket.on('replay:buffering', ({ on }: { on: boolean }) => setBuffering(on));
    socket.on('replay:error', (e: ReplayError) => setError(e));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionKey]);

  const send = useCallback((event: string, payload?: unknown) => socketRef.current?.emit(event, payload), []);

  return {
    meta,
    track,
    state,
    board,
    events,
    buffering,
    error,
    buffer,
    /** Re-joins after an error. */
    retry: useCallback(() => {
      setError(null);
      send('replay:join', { sessionKey });
    }, [send, sessionKey]),
    play: useCallback(() => send('replay:play'), [send]),
    pause: useCallback(() => send('replay:pause'), [send]),
    seek: useCallback((t: number) => send('replay:seek', { t }), [send]),
    setSpeed: useCallback((x: number) => send('replay:speed', { x }), [send]),
  };
}
