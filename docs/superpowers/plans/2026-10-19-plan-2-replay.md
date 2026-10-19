# Plan 2: Race Replay Track Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay the Race and Sprint of the 3 most recent Grand Prix weekends on a Canvas track map with every car moving, a live-updating leaderboard and play/pause/seek/speed controls, streamed over Socket.io.

**Architecture:** A weekly warm job (CLI + token-protected HTTP endpoint driven by a GitHub Actions cron) fetches each session's metadata and per-minute car positions from OpenF1, compresses them and stores them in MongoDB, deleting older weekends. A per-socket `ReplayEngine` on the `/replay` Socket.io namespace holds the playback clock and streams sample batches, leaderboard snapshots and race-control events; a missing minute is fetched on demand. The React client buffers samples and draws dots at an interpolated render time on a Canvas.

**Tech Stack:** Existing Plan 1 stack plus `socket.io` ^4.8 (server), `socket.io-client` ^4.8 (client, and server tests), Node `zlib` (gzip).

**Spec:** `docs/superpowers/specs/2026-10-10-f1-dashboard-design.md` — §6.0–6.5 (replay), §5.2 B (data flow), §5.3 (ReplaySession/ReplayChunk), §5.4 (`/api/replay/sessions`, `/api/internal/warm`), §8 (warm cron). Plan 1 (`2026-10-15-plan-1-foundation.md`) built everything this plan sits on.

## Global Constraints

Everything in Plan 1's Global Constraints still binds (Node ≥26 with native type stripping: no `enum`/`namespace`/parameter properties, relative imports end in `.ts`; `@f1/shared` via `import type` only; JSON error shape; secrets only in env).

- **OpenF1 free tier:** base `https://api.openf1.org/v1`, 3 req/s and 30 req/min. Browsers never call it.
- **OpenF1 empty results:** it answers **HTTP 404 `{"detail":"No results found."}`** for an empty result set (measured). Treat 404 as `[]`.
- **Retention:** keep the Race and (where held) Sprint of the **3 most recent finished Grand Prix weekends, newest chosen by session date** (meeting keys are not chronological — measured: Bahrain 1308 raced between Azerbaijan 1295 and Singapore 1296). Delete everything older.
- **Time base:** `t` = milliseconds since lights out = the earliest lap-1 `date_start` of the session.
- **Chunk:** minute `m` covers `[t = m·60000, (m+1)·60000)`; stored gzipped as JSON `[n, t, x, y][]`, sorted by `t`. Drop samples with `x === 0 && y === 0`.
- **Socket events and payloads:** exactly spec §6.3 (`replay:join|meta|play|pause|seek|speed|state|frames|board|event|buffering|error`), with the shapes defined in Task 1.
- **Speeds:** `1 | 2 | 4 | 8 | 16`. Engine tick: **250 ms**. Lookahead: **2000 ms × speed**. Interpolation hold: if neighbouring samples are **> 2000 ms** apart, hold the last position.
- **Warm endpoint:** `Authorization: Bearer $WARM_TOKEN`, compared in constant time; 401 `UNAUTHENTICATED` otherwise.

### Measured on the 2026 Singapore GP race (session 11388), 2026-10-19

| What | Value |
|---|---|
| Lights out | 2026-10-11T12:03:39.077Z; race length ≈ 103.5 min, 62 laps, 22 cars |
| `location`, one minute, all cars | ≈ 4,860 rows, 610 KB raw, **34 KB compact+gzip** |
| Whole race compressed | ≈ 4 MB (6 sessions ≈ 20 MB, far under Atlas 512 MB) |
| `intervals` | 28,131 rows, 3.9 MB raw (store compressed) |
| `laps` 1,240 rows · `position` 396 · `stints` 47 · `race_control` 155 · `pit` 25 · `drivers` 22 | all small |
| Lap-1 `date_start` null | 0 of 22 · `(0,0)` samples seen: 0 · team colours present (`F47600`, no `#`) |
| Location before lights out | data exists (grid); after the finish: 404 |

### Decisions this plan makes that refine the spec

- **Session metadata is stored as one gzipped `data` Buffer** on `ReplaySession` (laps, positions, intervals, stints, events) instead of separate arrays: intervals alone are 3.9 MB raw, and nothing queries inside them.
- **OpenF1 queue = one request per 2.1 s** (`perSecond: 1, perWindow: 1, windowMs: 2100`): stays under 30/min and every slot wait is ≤ 2.1 s, so Plan 1's 10 s fail-fast never trips on normal queueing.
- **Client clock uses its own receive time** (`performance.now()` when `replay:state` arrives), not `serverNow`, so client/server clock skew can't shift playback.
- **The warm endpoint starts the job and returns 202**; `GET` reports status. The GitHub Action polls once a minute, which also keeps Render's free instance awake for the ~15–20 min job.
- **`replay:meta` is `ReplayMeta { session, drivers, outline }`** (Task 1): the spec's `startsAt`/`endsAt`/`totalLaps` live in `session` (`startsAt`, `durationMs`, `totalLaps`), so the picker and the page share one summary type.
- **The picker lists only stored sessions** (`ReplaySession` docs), so every listed replay is playable without waiting for OpenF1.

## Review Focus

1. **Seek to garbage** (`t` negative, past the end, `NaN`, string) → validation error or clamped to `[0, durationMs]`; the engine keeps working. Test in Task 4.
2. **Join an unknown or malformed session** → `replay:error` (`NOT_FOUND` / `VALIDATION`), socket stays connected and can join a valid one after. Test in Task 4.
3. **A minute with no upstream data** (OpenF1 404) → stored as an empty chunk; playback continues; no refetch loop. Test in Task 2.
4. **Viewer closes the tab mid-playback** → its tick timer is cleared; no leaked engines. Test in Task 4 (`activeEngineCount()` back to 0).
5. **Warm job while OpenF1 is down, or started twice** → existing replays are not deleted; a second start while running does not start a second job. Tests in Task 5.

---

## File Structure

```
shared/src/index.ts                      + replay types (Task 1)
server/src/services/openf1.ts            OpenF1 client: queue + 404→[] + raw row types (Task 1)
server/src/services/replay/transform.ts  pure: raceWindow, outlineLap, toSamples, buildReplayData, boardAt, pack/unpack (Task 1, boardAt Task 3)
server/src/models/ReplaySession.ts       (Task 2)
server/src/models/ReplayChunk.ts         (Task 2)
server/src/services/replay/store.ts      ingestSession, loadSession, getChunk, samplesBetween (Task 2)
server/src/sockets/replayEngine.ts       ReplayEngine class (Task 3)
server/src/sockets/replay.ts             attachReplay(io), activeEngineCount() (Task 4)
server/src/index.ts                      attach Socket.io (Task 4)
server/src/services/replay/warm.ts       pickNewestWeekends, warm, startWarm, warmStatus (Task 5)
server/src/routes/replay.ts              GET /api/replay/sessions, POST|GET /api/internal/warm (Task 5)
server/scripts/warm.ts                   CLI (Task 5)
server/test/fixtures/openf1/*.json       trimmed real responses (Task 1)
client/src/lib/replay.ts                 pure: positionAt, addSamples, fitToCanvas, clockAt, formatClock, SPEEDS (Task 6)
client/src/pages/ReplayPickerPage.tsx    (Task 7)
client/src/features/replay/useReplay.ts  socket hook (Task 8)
client/src/features/replay/TrackMap.tsx  Canvas (Task 8)
client/src/pages/ReplayPage.tsx          layout: map, leaderboard, banner, transport (Task 8)
.github/workflows/warm.yml               cron (Task 9)
```

---

### Task 1: Shared replay types, OpenF1 client and pure transforms

**Files:**
- Modify: `shared/src/index.ts`
- Create: `server/src/services/openf1.ts`, `server/src/services/replay/transform.ts`
- Create fixtures: `server/test/fixtures/openf1/` (`drivers.json`, `laps.json`, `position.json`, `intervals.json`, `stints.json`, `race_control.json`, `location-10s.json`)
- Test: `server/test/replay.transform.test.ts`

**Interfaces:**
- Produces in `@f1/shared` (exact):
  ```ts
  export type ReplaySessionType = 'Race' | 'Sprint';
  export interface ReplaySessionSummary { sessionKey: number; meetingKey: number; meetingName: string; countryName: string; sessionType: ReplaySessionType; startsAt: string; durationMs: number; totalLaps: number; }
  export interface ReplayDriver { n: number; code: string; name: string; teamName: string; colour: string } // colour '#RRGGBB', '#888888' when missing
  export interface ReplayMeta { session: ReplaySessionSummary; drivers: ReplayDriver[]; outline: [number, number][] }
  export type ReplaySample = [n: number, t: number, x: number, y: number];
  export interface ReplayState { playing: boolean; speed: number; t: number; reset: boolean }
  export interface BoardRow { n: number; position: number; gap: string | null; interval: string | null; compound: string | null }
  export interface ReplayBoard { t: number; lap: number; rows: BoardRow[] }
  export interface ReplayEvent { t: number; category: string; flag: string | null; message: string }
  export interface ReplayError { code: string; message: string }
  ```
- Produces in `openf1.ts`: `openf1<T>(path: string): Promise<T[]>` (404 → `[]`); raw row types `OSession, OMeeting, ODriver, OLap, OPosition, OInterval, OStint, ORaceControl, OLocation` with the OpenF1 field names used below.
- Produces in `transform.ts`:
  - `raceWindow(laps: OLap[]): { start: number; durationMs: number; totalLaps: number } | null` — start = min lap-1 `date_start` (ms epoch); end = max over laps of `date_start + lap_duration·1000`; null if no lap 1.
  - `outlineLap(laps: OLap[]): { n: number; from: string; to: string } | null` — the fastest lap with `lap_number > 1`, not `is_pit_out_lap`, non-null `date_start` and `lap_duration`; `from`/`to` ISO strings.
  - `toSamples(rows: OLocation[], start: number): ReplaySample[]` — drops `(0,0)`, `t = Date.parse(date) − start`, sorted by `t`.
  - `interface ReplayData { laps: [n: number, lap: number, t: number][]; positions: [n: number, t: number, position: number][]; intervals: [n: number, t: number, gap: string | null, interval: string | null][]; stints: [n: number, lapStart: number, lapEnd: number, compound: string | null][]; events: ReplayEvent[] }` — every timed array sorted by `t`.
  - `buildReplayData(raw: { laps: OLap[]; positions: OPosition[]; intervals: OInterval[]; stints: OStint[]; raceControl: ORaceControl[] }, start: number): ReplayData` — keeps rows before lights out (negative `t`; the grid order matters).
  - `formatGap(v: number | string | null): string | null` — number → `'+' + v.toFixed(3)`, string unchanged (e.g. `'+1 LAP'`), null → null.
  - `toDrivers(rows: ODriver[]): ReplayDriver[]` — colour `'#' + team_colour`, `'#888888'` if missing.
  - `pack(value: unknown): Buffer` (JSON + `gzipSync`) and `unpack<T>(buf: Buffer): T`.

- [ ] **Step 1: Add the shared types** listed above to `shared/src/index.ts`.

- [ ] **Step 2: Save trimmed real fixtures** (Singapore 2026 race, session 11388) with a one-off script (run from the repo root, ≥ 2.1 s between requests):

```bash
mkdir -p server/test/fixtures/openf1 && cd server/test/fixtures/openf1
B=https://api.openf1.org/v1; S=11388
for ep in drivers laps position stints race_control; do curl -s "$B/$ep?session_key=$S" -o $ep.json; sleep 2.2; done
curl -s "$B/intervals?session_key=$S" | python3 -c "import sys,json;json.dump(json.load(sys.stdin)[:2000],sys.stdout)" > intervals.json; sleep 2.2
curl -s "$B/location?session_key=$S&date>=2026-10-11T12:03:39.077Z&date<2026-10-11T12:03:49.077Z" -o location-10s.json
cd -
```
Expected: 7 files; `drivers.json` has 22 rows, `laps.json` 1,240.

- [ ] **Step 3: Write the failing tests** in `server/test/replay.transform.test.ts`:
  - `raceWindow` on synthetic laps `[{n:1,lap:1,start:'…T12:00:05Z',dur:90},{n:2,lap:1,start:'…T12:00:03Z',dur:91},{n:1,lap:2,start:'…T12:01:35Z',dur:88}]` → `start` = epoch of 12:00:03, `durationMs` = (12:01:35 + 88 s) − 12:00:03 = 180,000, `totalLaps` 2; returns null when no lap 1.
  - `raceWindow` on the fixture → `new Date(start).toISOString() === '2026-10-11T12:03:39.077Z'`, `totalLaps === 62`.
  - `outlineLap` ignores lap 1 and pit-out laps and picks the smallest `lap_duration`; null when none qualify.
  - `toSamples` drops `(0,0)`, sorts by `t`, and the fixture's 10 s window yields 22 distinct `n` with every `t` in `[0, 10000)`.
  - `formatGap(1.2345) === '+1.235'`, `formatGap('+1 LAP') === '+1 LAP'`, `formatGap(null) === null`.
  - `buildReplayData` on fixtures: every array sorted by `t`; `positions` contains entries with `t < 0`; `events.length === 155`.
  - `toDrivers` → 22 drivers, every colour matches `/^#[0-9A-F]{6}$/i`.
  - `unpack(pack(x))` deep-equals `x` for a 5,000-sample array, and `pack` output is < 25% of `JSON.stringify(x).length`.

- [ ] **Step 4: Run** `npm test -w server -- replay.transform` → FAIL (modules missing).

- [ ] **Step 5: Implement `openf1.ts`** — `createQueue({ perSecond: 1, perWindow: 1, windowMs: 2_100 })`; `openf1` wraps `fetchJson` in `queue.run(url, …)` and returns `[]` on `HttpError` 404. One-line comment citing the 3/s + 30/min limit.

- [ ] **Step 6: Implement `transform.ts`** per the Interfaces block (use `reduce`, not spread, for min/max over large arrays).

- [ ] **Step 7: Run** `npm test -w server -- replay.transform && npm run typecheck` → PASS.

- [ ] **Step 8: Commit** `feat(server): OpenF1 client, replay types and transforms`

---

### Task 2: Replay models and store (ingest, load, chunk cache)

**Files:**
- Create: `server/src/models/ReplaySession.ts`, `server/src/models/ReplayChunk.ts`, `server/src/services/replay/store.ts`
- Test: `server/test/replay.store.test.ts`

**Interfaces:**
- Consumes: Task 1 (`openf1`, transforms, `pack/unpack`, raw types), `startDb/clearDb/stopDb` (Plan 1 `server/test/db.ts`).
- Produces:
  - `ReplaySessionModel` fields: `sessionKey` (unique), `meetingKey`, `meetingName`, `countryName`, `sessionType`, `startsAt: Date`, `durationMs`, `totalLaps`, `drivers: ReplayDriver[]`, `outline: [number, number][]`, `data: Buffer` (packed `ReplayData`), `complete: boolean`, timestamps.
  - `ReplayChunkModel`: `sessionKey`, `minute`, `data: Buffer` (packed `ReplaySample[]`); unique `(sessionKey, minute)`.
  - `interface LoadedSession { summary: ReplaySessionSummary; drivers: ReplayDriver[]; outline: [number, number][]; data: ReplayData; startsAtMs: number }`
  - `ingestSession(s: OSession, meetingName: string): Promise<void>` — fetches `drivers, laps, position, intervals, stints, race_control` for `session_key`, then the outline lap's `location?session_key=…&driver_number=…&date>=from&date<to`; upserts the doc with `complete: false`. Throws `Error('No lap data')` if `raceWindow` is null.
  - `loadSession(sessionKey: number): Promise<LoadedSession | null>` — memoised in memory per sessionKey.
  - `minutesOf(s: LoadedSession): number` = `Math.ceil(durationMs / 60000)`.
  - `getChunk(s: LoadedSession, minute: number): Promise<ReplaySample[]>` — memory (Map used as LRU, max **60** chunks) → Mongo → OpenF1 `location?session_key=…&date>=…&date<…` (empty ⇒ store an empty chunk); concurrent calls for the same `(sessionKey, minute)` share one promise.
  - `samplesBetween(s: LoadedSession, from: number, to: number): Promise<ReplaySample[]>` — samples with `from < t ≤ to` across the minutes touched (minutes clamped to `[0, minutesOf(s) − 1]`).

- [ ] **Step 1: Write the failing tests** (mock `../src/services/openf1.ts` with `vi.mock`, answering from the Task 1 fixtures by path prefix):
  - `ingestSession` + `loadSession` → summary `{ sessionKey: 11388, sessionType: 'Race', totalLaps: 62 }`, 22 drivers, outline length > 100, `startsAtMs` = epoch of `2026-10-11T12:03:39.077Z`; a second `loadSession` doesn't hit Mongo again (spy on `ReplaySessionModel.findOne` → called once).
  - `getChunk` first call fetches and stores a `ReplayChunk`; the second call (after clearing the in-memory cache via an exported `clearChunkMemory()` test helper) reads Mongo and makes **no** new `openf1` call.
  - Two concurrent `getChunk(s, 0)` calls → one `openf1('location…')` call.
  - **Review Focus 3:** `openf1` returns `[]` for a minute → `getChunk` resolves `[]`, a `ReplayChunk` with an empty packed array exists, and a later call doesn't call `openf1` again.
  - `samplesBetween(s, 500, 1500)` returns only samples with `500 < t ≤ 1500`, sorted.

- [ ] **Step 2: Run** `npm test -w server -- replay.store` → FAIL.

- [ ] **Step 3: Implement** the two models and `store.ts` per the Interfaces block. `meetingName`/`countryName`/`sessionType` come from the `OSession`/argument; `sessionType` is `s.session_name` (`'Race' | 'Sprint'`).

- [ ] **Step 4: Run** `npm test -w server && npm run typecheck` → PASS (all Plan 1 tests still pass).

- [ ] **Step 5: Commit** `feat(server): replay session store with compressed minute chunks`

---

### Task 3: Leaderboard and the replay engine

**Files:**
- Modify: `server/src/services/replay/transform.ts` (add `boardAt`)
- Create: `server/src/sockets/replayEngine.ts`
- Test: `server/test/replay.engine.test.ts`

**Interfaces:**
- Consumes: `ReplayData`, `LoadedSession`, `samplesBetween` (Tasks 1–2).
- Produces:
  - `boardAt(d: ReplayData, t: number): ReplayBoard` — per driver: latest position with `t' ≤ t`, latest gap/interval with `t' ≤ t`, current lap = highest lap started at `t' ≤ t`, compound = stint covering that lap; rows sorted by position; `lap` = max current lap (0 before lights out).
  - `type Emit = (event: string, payload: unknown) => void`
  - `class ReplayEngine` with constructor `(session: LoadedSession, emit: Emit, getSamples: (from: number, to: number) => Promise<ReplaySample[]>, now: () => number = Date.now)` (assign fields explicitly — no parameter properties). Public: `t`, `playing`, `speed`, `play()`, `pause()`, `seek(t: number)`, `setSpeed(x: 1|2|4|8|16)`, `tick(): Promise<void>`.
  - Constants exported: `TICK_MS = 250`, `LOOKAHEAD_MS = 2000`.

Engine rules (the part the signatures don't determine):
- Every control change emits `replay:state` `{ playing, speed, t, reset }`; `reset: true` only from `seek`.
- `tick()`: if playing, advance `t` by `(now − lastTick) × speed`, clamped to `durationMs`; reaching the end pauses and emits state. Then send `samples (sentUntil, min(t + LOOKAHEAD_MS × speed, durationMs)]` as `replay:frames { samples }` if non-empty. If `getSamples` hasn't resolved after **300 ms** (a chunk is being fetched from OpenF1), emit `replay:buffering { on: true }`, and `{ on: false }` once it resolves; fast (cached) fetches emit nothing. Emit `replay:board` only when its JSON differs from the last one sent. Emit each `replay:event` with `lastEventT < event.t ≤ t` once.
- `seek(t)`: clamp to `[0, durationMs]` (non-finite → 0), set `sentUntil = t − 1000` (so the client has a sample just before `t`), `lastEventT = t`, emit state with `reset: true`.
- Overlapping ticks are skipped (a `busy` flag).

- [ ] **Step 1: Write the failing tests** with a synthetic `LoadedSession` (2 drivers, `durationMs` 120,000, samples every 250 ms, a few positions/intervals/events) and a fake clock:
  - `boardAt`: before lights out uses grid positions (negative-`t` rows), `lap` 0; after a position swap at `t = 30,000` the order flips; compound follows stint boundaries.
  - play at speed 4, advance the clock 250 ms, `tick()` → `t === 1000`, one `replay:frames` whose samples all satisfy `t ≤ 1000 + 8000`.
  - a second tick with no clock change sends no duplicate samples.
  - a `replay:event` is emitted exactly once when `t` passes it.
  - **Review Focus 1:** `seek(-5)` → `t === 0`; `seek(1e9)` → `t === 120000`; `seek(NaN)` → `t === 0`; each emits `reset: true`.
  - playing past the end stops at `120000` with `playing: false`.

- [ ] **Step 2: Run** `npm test -w server -- replay.engine` → FAIL.

- [ ] **Step 3: Implement** `boardAt` and `ReplayEngine`.

- [ ] **Step 4: Run** `npm test -w server -- replay && npm run typecheck` → PASS.

- [ ] **Step 5: Commit** `feat(server): replay engine and leaderboard`

---

### Task 4: Socket.io `/replay` namespace

**Files:**
- Create: `server/src/sockets/replay.ts`
- Modify: `server/src/index.ts`, `server/package.json` (deps)
- Test: `server/test/replay.socket.test.ts`

**Interfaces:**
- Consumes: `ReplayEngine`, `TICK_MS`, `loadSession`, `samplesBetween`.
- Produces: `attachReplay(io: Server): void`, `activeEngineCount(): number`.

- [ ] **Step 1: Install** `npm install -w server socket.io@^4.8` and `npm install -D -w server socket.io-client@^4.8`.

- [ ] **Step 2: Write the failing tests** — start `http.createServer(createApp())` on port 0, `new Server(server)`, `attachReplay(io)`; seed one session via `ReplaySessionModel.create` + `ReplayChunkModel.create` using `pack` (synthetic data as in Task 3); connect `socket.io-client` to `http://localhost:<port>/replay` with `transports: ['websocket']`:
  - join `{ sessionKey }` → `replay:meta` with the summary and drivers, then `replay:state` `{ playing: false, speed: 1, t: 0 }`.
  - `replay:play` → within 1 s at least one `replay:frames` with samples.
  - `replay:seek { t: 60000 }` → `replay:state` with `t: 60000, reset: true`.
  - **Review Focus 2:** join `{ sessionKey: 'abc' }` → `replay:error` `{ code: 'VALIDATION' }`; join `{ sessionKey: 999 }` → `{ code: 'NOT_FOUND' }`; the same socket then joins the seeded session and gets `replay:meta`.
  - `replay:speed { x: 3 }` → `replay:error` `VALIDATION`.
  - **Review Focus 4:** after joining, `activeEngineCount() === 1`; after `client.disconnect()` it returns to 0 within 500 ms.

- [ ] **Step 3: Run** `npm test -w server -- replay.socket` → FAIL.

- [ ] **Step 4: Implement `attachReplay`** — namespace `io.of('/replay')`; per connection at most one engine and one `setInterval(…, TICK_MS)`; payloads validated with zod (`sessionKey: z.number().int().positive()`, `t: z.number().finite()`, `x: z.union([z.literal(1),z.literal(2),z.literal(4),z.literal(8),z.literal(16)])`); invalid → `replay:error {code:'VALIDATION'}`; unknown session → `NOT_FOUND`; any thrown error inside a handler or tick → `replay:error {code:'INTERNAL', message:'Replay failed, please retry'}` (log the error server-side). Re-join replaces the previous engine. `disconnect` clears the interval and decrements the count.

- [ ] **Step 5: Wire it into `server/src/index.ts`** — `const io = new Server(server); attachReplay(io);` (same origin, no CORS options).

- [ ] **Step 6: Run** `npm test -w server && npm run typecheck` → PASS.

- [ ] **Step 7: Commit** `feat(server): /replay Socket.io namespace`

---

### Task 5: Warm job, retention and replay REST routes

**Files:**
- Create: `server/src/services/replay/warm.ts`, `server/src/routes/replay.ts`, `server/scripts/warm.ts`
- Modify: `server/src/app.ts` (mount routes), `server/package.json` (script `"warm": "node --env-file-if-exists=../.env scripts/warm.ts"`)
- Test: `server/test/replay.warm.test.ts`

**Interfaces:**
- Consumes: `openf1`, `ingestSession`, `loadSession`, `getChunk`, `minutesOf`, models, `config.WARM_TOKEN`, `AppError`.
- Produces:
  - `pickNewestWeekends(sessions: OSession[], now: number, count = 3): OSession[]` — keep `session_name` `'Race' | 'Sprint'` with `date_end` ≥ 30 min before `now`; group by `meeting_key`; order meetings by their latest `date_start` descending; return every kept session of the first `count` meetings.
  - `warm(now = Date.now()): Promise<{ stored: number[]; deleted: number[] }>` — sessions from `sessions?year=Y` (also `Y−1` when fewer than 3 meetings qualify) and names from `meetings?year=…`; ingest missing sessions, fill missing chunks for every minute, mark `complete: true`; **only after all of that succeeds**, delete `ReplaySession` and `ReplayChunk` docs whose `sessionKey` isn't kept. Idempotent.
  - `startWarm(): { started: boolean }` (single-flight) and `warmStatus(): { running: boolean; startedAt: string | null; finishedAt: string | null; result: { stored: number[]; deleted: number[] } | null; error: string | null }`.
  - Routes: `GET /api/replay/sessions` → `ReplaySessionSummary[]` from stored sessions, newest `startsAt` first; `POST /api/internal/warm` → 202 `startWarm()`; `GET /api/internal/warm` → 200 `warmStatus()`. Both internal routes behind a `requireWarmToken` middleware (constant-time compare with `crypto.timingSafeEqual` on equal-length buffers; missing/unset/wrong → 401 `UNAUTHENTICATED`).

- [ ] **Step 1: Write the failing tests:**
  - `pickNewestWeekends` with the measured order (meetings 1294 Spain 09-13, 1295 Azerbaijan 09-26, 1308 Bahrain 10-04, 1296 Singapore 10-11 with a sprint) → sessions of 1296 (race + sprint), 1308, 1295; excludes a session whose `date_end` is 10 min before `now`.
  - `warm` (openf1 mocked from fixtures for every session key) stores the picked sessions with `complete: true` and chunks for every minute; a pre-existing older session and its chunks are deleted; running `warm` again makes no `location` calls.
  - **Review Focus 5:** with `openf1` throwing for `sessions?…`, `warm` rejects and a pre-existing session is **not** deleted; `startWarm()` twice in a row → `{started:true}` then `{started:false}`.
  - Routes: `GET /api/replay/sessions` lists seeded sessions newest first; `POST /api/internal/warm` without a token → 401, with `Authorization: Bearer <test WARM_TOKEN>` → 202; `GET` returns the status shape.

- [ ] **Step 2: Run** `npm test -w server -- replay.warm` → FAIL.

- [ ] **Step 3: Implement** `warm.ts`, `routes/replay.ts` (mount `replayRouter()` at `/api/replay` and the internal router at `/api/internal` in `app.ts`, before `app.use('/api', notFound)`), and the CLI (`await mongoose.connect(config.MONGODB_URI)`, run `warm()`, print the result, disconnect; non-zero exit on error).

- [ ] **Step 4: Run** `npm test -w server && npm run typecheck` → PASS.

- [ ] **Step 5: Real smoke run against Atlas** (needs the user's `.env`): `npm run warm -w server`. Expected: 3 weekends' sessions stored in ~15–20 min, then `curl -s localhost:3000/api/replay/sessions` (with `npm run dev:server`) lists them. Record the stored size per race (Atlas → collection stats) in the report.

- [ ] **Step 6: Commit** `feat(server): weekly replay warm job, retention and replay routes`

---

### Task 6: Client replay math

**Files:**
- Create: `client/src/lib/replay.ts`
- Test: `client/test/replay.test.ts`

**Interfaces:**
- Produces:
  - `SPEEDS = [1, 2, 4, 8, 16] as const`, `HOLD_MS = 2000`.
  - `addSamples(buf: Map<number, ReplaySample[]>, samples: ReplaySample[]): void` — append per driver, keep each list sorted by `t`.
  - `pruneBefore(buf: Map<number, ReplaySample[]>, t: number): void` — drop samples older than `t − 5000`, always keeping the last one at or before `t`.
  - `positionAt(list: ReplaySample[], t: number): [number, number] | null` — binary-search the last sample with `t' ≤ t`; linear interpolation to the next one; hold when the gap > `HOLD_MS`; null before the first sample.
  - `fitToCanvas(outline: [number, number][], w: number, h: number, pad = 24): (x: number, y: number) => [number, number]` — uniform scale into `w × h` minus padding, centred, **y flipped**.
  - `clockAt(s: { t: number; playing: boolean; speed: number; at: number }, now: number, durationMs: number): number`.
  - `formatClock(ms: number): string` — `h:mm:ss` (e.g. `3_723_000 → '1:02:03'`, negative → `'0:00:00'`).

- [ ] **Step 1: Write the failing tests** — `positionAt` midpoint interpolation `([1,0,0,0],[1,1000,10,20])` at `t=500` → `[5,10]`; hold across a 3,000 ms gap; null before first; exact hit. `fitToCanvas` maps the bbox corners inside the padding and flips y (the outline's top-most point maps to the smallest canvas y). `clockAt` paused returns `t`; playing at speed 4, 250 ms later → `t + 1000`; never exceeds `durationMs`. `addSamples` keeps order across two batches; `pruneBefore` keeps the last sample ≤ t. `formatClock` cases above.

- [ ] **Step 2: Run** `npm test -w client -- replay` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, plus `npm run typecheck -w client`.

- [ ] **Step 5: Commit** `feat(client): replay interpolation, canvas fitting and clock math`

---

### Task 7: Replay picker page and nav

**Files:**
- Create: `client/src/pages/ReplayPickerPage.tsx`
- Modify: `client/src/App.tsx` (lazy routes `replay` and `replay/:sessionKey` — the latter points to a placeholder until Task 8 replaces it), `client/src/components/Layout.tsx` (nav item `['/replay', 'Replay']`)

**Interfaces:**
- Consumes: `GET /api/replay/sessions` → `ReplaySessionSummary[]`; `useApi`, `QueryState`, `PageHeader`, `formatDateTime`.
- Produces: route `/replay` — sessions grouped by `meetingKey` (newest first), one card per weekend titled `meetingName`, each with a link per session (`Race`, `Sprint`) to `/replay/:sessionKey` showing date and `totalLaps`. Empty list → "No replays are stored yet. They are added automatically after each race weekend." Follow the existing pages' patterns (empty states, headings, `QueryState`).

- [ ] **Step 1: Implement** the page, routes and nav item.
- [ ] **Step 2: Verify** `npm run typecheck -w client && npm run build -w client`; with `npm run dev:server` + `npm run dev:client` and the Task 5 smoke data, `/replay` lists the stored weekends.
- [ ] **Step 3: Commit** `feat(client): replay picker page`

---

### Task 8: Replay page — socket hook, Canvas track map, leaderboard, controls

**Files:**
- Create: `client/src/features/replay/useReplay.ts`, `client/src/features/replay/TrackMap.tsx`, `client/src/pages/ReplayPage.tsx`
- Modify: `client/src/App.tsx` (route `replay/:sessionKey` → `ReplayPage`), `client/package.json` (`npm install -D -w client socket.io-client@^4.8`)

**Interfaces:**
- Consumes: Task 1 shared types, Task 6 helpers, socket events (Global Constraints).
- Produces:
  - `useReplay(sessionKey: number): { meta: ReplayMeta | null; state: (ReplayState & { at: number }) | null; board: ReplayBoard | null; events: ReplayEvent[] /* newest first, max 3 */; buffering: boolean; error: ReplayError | null; buffer: React.RefObject<Map<number, ReplaySample[]>>; play(): void; pause(): void; seek(t: number): void; setSpeed(x: number): void }` — one `io('/replay')` per mount, closed on unmount; `state.at = performance.now()` on receipt; `reset: true` clears the buffer; on reconnect re-join and seek to the last clock value.
  - `<TrackMap meta buffer state selected />` — `<canvas role="img" aria-label="Track map: positions of all cars">`, sized by `ResizeObserver`, scaled by `devicePixelRatio`; outline pre-drawn to an offscreen canvas on resize; a `requestAnimationFrame` loop draws the outline image plus one dot per driver (team colour, 3-letter label) at `positionAt(buffer, clockAt(state, performance.now(), durationMs))`, ringing the `selected` driver; calls `pruneBefore` once a second.
  - `ReplayPage` (`/replay/:sessionKey`): back link to `/replay`; `PageHeader` with `meetingName · sessionType`; grid with TrackMap (left; above on mobile) and a leaderboard `<table>` (caption, P / driver code with team-colour bar / gap / interval / tyre; clicking a row selects that driver); race-control banner (latest event, coloured by flag: yellow, red, green, blue → neutral) plus "Lap X / totalLaps"; transport bar: play/pause button, `role="group"` of speed buttons with `aria-pressed`, `<input type="range" aria-label="Replay position">` seeking on change, `formatClock` time; "Buffering…" status when `buffering`; `ErrorState` on `error` with retry = re-join. Keyboard on `window`: Space toggles play (ignored when focus is in an input or button), ←/→ seek ∓/± 10 s.

- [ ] **Step 1: Install** the client dependency. **Step 2: Implement** the three files and the route.
- [ ] **Step 3: Verify** `npm run typecheck -w client && npm test -w client && npm run build -w client`.
- [ ] **Step 4: Visual check in the browser pane** against local dev servers with the Task 5 data: cars move smoothly at 1× and 16×, seek jumps cleanly, leaderboard updates, banner shows Safety Car / flags, keyboard works, a 375 px-wide viewport stacks map above the table. Take one screenshot for the report.
- [ ] **Step 5: Commit** `feat(client): replay page with canvas track map, leaderboard and controls`

---

### Task 9: Weekly warm cron and production rollout

**Files:**
- Create: `.github/workflows/warm.yml`

**Interfaces:**
- Consumes: `POST|GET /api/internal/warm` (Task 5); GitHub repo secrets `APP_URL` (`https://f1-dashboard-5yf2.onrender.com`) and `WARM_TOKEN` (the value set on Render).

- [ ] **Step 1: Write `warm.yml`** — triggers `schedule: cron '0 6 * * 1,2'` and `workflow_dispatch`; one job, `timeout-minutes: 60`: POST with `curl -fsS --retry 5 --retry-delay 20 --retry-all-errors` (the first request may wake Render), then poll `GET` every 60 s up to 50 times until `"running":false`, printing each status, and fail the job if `"error"` isn't `null`. Secrets come only from `${{ secrets.* }}`.
- [ ] **Step 2: Commit, push** (`git push` triggers the Render deploy and CI) — only after the user has approved pushing this branch to `main`.
- [ ] **Step 3: Set the two repo secrets** with `gh secret set` (the `WARM_TOKEN` value piped from where it lives, never printed) — user approval required, as it changes their GitHub settings.
- [ ] **Step 4: Run** `gh workflow run warm.yml` and watch it; expected: success, then `GET https://f1-dashboard-5yf2.onrender.com/api/replay/sessions` lists 3 weekends and a replay plays on the live site.

---

## Done when

- `npm run typecheck && npm test` pass locally and in CI; the warm workflow succeeds on GitHub.
- The live site's `/replay` lists the Race (and Sprint where held) of the 3 newest weekends, and each plays end to end with moving cars, leaderboard, banner, seek and speed.
- Next: Plan 3 (analytics), and the Oct 21 live-mode cut-off decision.
