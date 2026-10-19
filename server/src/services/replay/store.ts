import type { ReplayDriver, ReplaySample, ReplaySessionSummary, ReplaySessionType } from '@f1/shared';
import { ReplayChunkModel } from '../../models/ReplayChunk.ts';
import { ReplaySessionModel } from '../../models/ReplaySession.ts';
import { type OInterval, type ODriver, type OLap, type OLocation, type OPosition, type ORaceControl, type OSession, type OStint, openf1 } from '../openf1.ts';
import { buildReplayData, outlineLap, pack, type ReplayData, raceWindow, toDrivers, toSamples, unpack } from './transform.ts';

const MINUTE = 60_000;
const CHUNK_CACHE_MAX = 60;

export interface LoadedSession {
  summary: ReplaySessionSummary;
  drivers: ReplayDriver[];
  outline: [number, number][];
  data: ReplayData;
  startsAtMs: number;
}

const sessions = new Map<number, LoadedSession>();
const chunks = new Map<string, ReplaySample[]>(); // insertion order = recency, oldest first
const pendingChunks = new Map<string, Promise<ReplaySample[]>>();

/** Test helper: forget in-memory chunks so the next read goes to Mongo. */
export function clearChunkMemory() {
  chunks.clear();
}

/** Drops a session from memory, e.g. after the warm job deletes it. */
export function forgetSession(sessionKey: number) {
  sessions.delete(sessionKey);
}

/** Fetches a session's metadata from OpenF1 and stores it, marked incomplete until its chunks are stored. */
export async function ingestSession(s: OSession, meetingName: string): Promise<void> {
  const k = s.session_key;
  const [drivers, laps, positions, intervals, stints, raceControl] = await Promise.all([
    openf1<ODriver>(`drivers?session_key=${k}`),
    openf1<OLap>(`laps?session_key=${k}`),
    openf1<OPosition>(`position?session_key=${k}`),
    openf1<OInterval>(`intervals?session_key=${k}`),
    openf1<OStint>(`stints?session_key=${k}`),
    openf1<ORaceControl>(`race_control?session_key=${k}`),
  ]);
  const win = raceWindow(laps);
  if (!win) throw new Error('No lap data');
  const lap = outlineLap(laps);
  const outlineRows = lap ? await openf1<OLocation>(`location?session_key=${k}&driver_number=${lap.n}&date>=${lap.from}&date<${lap.to}`) : [];
  const outline = toSamples(outlineRows, win.start).map(([, , x, y]): [number, number] => [x, y]);
  const data = buildReplayData({ laps, positions, intervals, stints, raceControl }, win.start);

  await ReplaySessionModel.updateOne(
    { sessionKey: k },
    {
      $set: {
        meetingKey: s.meeting_key,
        meetingName,
        countryName: s.country_name,
        sessionType: s.session_name as ReplaySessionType,
        startsAt: new Date(win.start),
        durationMs: win.durationMs,
        totalLaps: win.totalLaps,
        drivers: toDrivers(drivers),
        outline,
        data: pack(data),
        complete: false,
      },
    },
    { upsert: true },
  );
}

/** Reads a stored session once and keeps it in memory; null when it was never stored. */
export async function loadSession(sessionKey: number): Promise<LoadedSession | null> {
  const cached = sessions.get(sessionKey);
  if (cached) return cached;
  const doc = await ReplaySessionModel.findOne({ sessionKey });
  if (!doc) return null;
  const loaded: LoadedSession = {
    summary: {
      sessionKey,
      meetingKey: doc.meetingKey,
      meetingName: doc.meetingName,
      countryName: doc.countryName,
      sessionType: doc.sessionType,
      startsAt: doc.startsAt.toISOString(),
      durationMs: doc.durationMs,
      totalLaps: doc.totalLaps,
    },
    drivers: doc.drivers,
    outline: doc.outline,
    data: unpack<ReplayData>(doc.data),
    startsAtMs: doc.startsAt.getTime(),
  };
  sessions.set(sessionKey, loaded);
  return loaded;
}

export const minutesOf = (s: LoadedSession) => Math.ceil(s.summary.durationMs / MINUTE);

function remember(key: string, samples: ReplaySample[]) {
  chunks.set(key, samples);
  if (chunks.size > CHUNK_CACHE_MAX) chunks.delete(chunks.keys().next().value!);
}

async function fetchChunk(s: LoadedSession, minute: number): Promise<ReplaySample[]> {
  const { sessionKey } = s.summary;
  const stored = await ReplayChunkModel.findOne({ sessionKey, minute });
  if (stored) return unpack<ReplaySample[]>(stored.data);

  const from = new Date(s.startsAtMs + minute * MINUTE).toISOString();
  const to = new Date(s.startsAtMs + (minute + 1) * MINUTE).toISOString();
  const rows = await openf1<OLocation>(`location?session_key=${sessionKey}&date>=${from}&date<${to}`);
  const samples = toSamples(rows, s.startsAtMs);
  // An empty minute is stored too, so it is never fetched again.
  await ReplayChunkModel.updateOne({ sessionKey, minute }, { $set: { data: pack(samples) } }, { upsert: true });
  return samples;
}

/** Samples for one minute: memory, then Mongo, then OpenF1. Concurrent callers share one fetch. */
export function getChunk(s: LoadedSession, minute: number): Promise<ReplaySample[]> {
  const key = `${s.summary.sessionKey}:${minute}`;
  const hit = chunks.get(key);
  if (hit) {
    chunks.delete(key); // move to the back: most recently used
    chunks.set(key, hit);
    return Promise.resolve(hit);
  }
  const pending = pendingChunks.get(key);
  if (pending) return pending;
  const p = fetchChunk(s, minute)
    .then((samples) => {
      remember(key, samples);
      return samples;
    })
    .finally(() => pendingChunks.delete(key));
  pendingChunks.set(key, p);
  return p;
}

/** Samples with from < t ≤ to, across every minute the window touches. */
export async function samplesBetween(s: LoadedSession, from: number, to: number): Promise<ReplaySample[]> {
  const last = minutesOf(s) - 1;
  const clamp = (m: number) => Math.min(Math.max(Math.floor(m / MINUTE), 0), last);
  const first = clamp(from);
  const lastMinute = clamp(to);
  const minutes = Array.from({ length: lastMinute - first + 1 }, (_, i) => first + i);
  const parts = await Promise.all(minutes.map((m) => getChunk(s, m)));
  return parts.flat().filter(([, t]) => t > from && t <= to).sort((a, b) => a[1] - b[1]);
}
