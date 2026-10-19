import { ReplayChunkModel } from '../../models/ReplayChunk.ts';
import { ReplaySessionModel } from '../../models/ReplaySession.ts';
import { type OMeeting, type OSession, openf1 } from '../openf1.ts';
import { forgetSession, getChunk, ingestSession, loadSession, minutesOf } from './store.ts';

const FINISHED_AFTER_MS = 30 * 60_000; // a session is "finished" 30 min after its scheduled end

export interface WarmResult {
  stored: number[];
  deleted: number[];
}

/** Race and Sprint sessions of the `count` most recent weekends that have finished. Meetings are ordered by date, not key. */
export function pickNewestWeekends(sessions: OSession[], now: number, count = 3): OSession[] {
  const finished = sessions.filter(
    (s) => (s.session_name === 'Race' || s.session_name === 'Sprint') && Date.parse(s.date_end) <= now - FINISHED_AFTER_MS,
  );
  const byMeeting = new Map<number, OSession[]>();
  for (const s of finished) byMeeting.set(s.meeting_key, [...(byMeeting.get(s.meeting_key) ?? []), s]);
  const newest = [...byMeeting.values()].sort((a, b) => latestStart(b) - latestStart(a)).slice(0, count);
  return newest.flat();
}

const latestStart = (sessions: OSession[]) => Math.max(...sessions.map((s) => Date.parse(s.date_start)));

/** This year's sessions, plus last year's until three weekends are found. */
async function listSessions(now: number): Promise<{ sessions: OSession[]; names: Map<number, string> }> {
  const year = new Date(now).getUTCFullYear();
  const sessions: OSession[] = [];
  const names = new Map<number, string>();
  for (const y of [year, year - 1]) {
    sessions.push(...(await openf1<OSession>(`sessions?year=${y}`)));
    for (const m of await openf1<OMeeting>(`meetings?year=${y}`)) names.set(m.meeting_key, m.meeting_name);
    if (new Set(pickNewestWeekends(sessions, now).map((s) => s.meeting_key)).size >= 3) break;
  }
  return { sessions, names };
}

/**
 * Stores the picked sessions and deletes every other stored session. Idempotent.
 * Deletion happens only after every fetch succeeded, so an OpenF1 outage never empties the picker.
 */
export async function warm(now = Date.now()): Promise<WarmResult> {
  const { sessions, names } = await listSessions(now);
  const kept = pickNewestWeekends(sessions, now);
  if (kept.length === 0) throw new Error('No finished Race or Sprint sessions found; nothing stored');

  const stored: number[] = [];
  for (const s of kept) {
    const k = s.session_key;
    const existing = await ReplaySessionModel.findOne({ sessionKey: k }, { complete: 1 });
    if (existing?.complete) continue;
    await ingestSession(s, names.get(s.meeting_key) ?? `Grand Prix ${s.meeting_key}`);
    forgetSession(k);
    const loaded = await loadSession(k);
    if (!loaded) throw new Error(`Session ${k} vanished after ingest`);
    for (let m = 0; m < minutesOf(loaded); m++) await getChunk(loaded, m);
    await ReplaySessionModel.updateOne({ sessionKey: k }, { $set: { complete: true } });
    stored.push(k);
  }

  const keep = kept.map((s) => s.session_key);
  const deleted = await ReplaySessionModel.distinct('sessionKey', { sessionKey: { $nin: keep } });
  await ReplayChunkModel.deleteMany({ sessionKey: { $in: deleted } });
  await ReplaySessionModel.deleteMany({ sessionKey: { $in: deleted } });
  deleted.forEach(forgetSession);
  return { stored, deleted };
}

export interface WarmStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  result: WarmResult | null;
  error: string | null;
}

let status: WarmStatus = { running: false, startedAt: null, finishedAt: null, result: null, error: null };

/** Starts one warm run in the background; a second call while one runs does nothing. */
export function startWarm(): { started: boolean } {
  if (status.running) return { started: false };
  status = { running: true, startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null };
  warm().then(
    (result) => {
      status = { ...status, running: false, finishedAt: new Date().toISOString(), result };
    },
    (err: unknown) => {
      console.error('Replay warm failed:', err);
      status = { ...status, running: false, finishedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
    },
  );
  return { started: true };
}

export function warmStatus(): WarmStatus {
  return status;
}
