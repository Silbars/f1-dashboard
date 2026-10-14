# F1 Dashboard — Design Spec

- **Date:** 2026-10-10 (revised 2026-10-15)
- **Status:** Draft, awaiting review
- **Submission deadline:** **2026-10-27, 11:59 PM IST** (end-term project; any stack allowed)

## 1. Purpose and context

A web dashboard for Formula 1 fans, built out of love for the sport. It is inspired by
[app.formula1dashboard.com](https://app.formula1dashboard.com/). Its signature feature is a **track
map with every car moving around the circuit**, inspired by
[this LED track video](https://www.youtube.com/watch?v=cgdjTIb8I3k).

Two audiences, in this order:

1. **Course evaluators (by Oct 27).** Any technology stack is allowed. The submission must be a
   functional product with meaningful workflows, sound engineering decisions and a complete user
   experience. We keep MERN (§4) because it is what the user knows and can explain.
2. **F1 fans (afterwards).** It may grow into a public product. It starts free and non-commercial.

### Success criteria for submission

- A deployed URL on which an evaluator can browse schedule, results, standings, drivers and teams for
  any season.
- Can replay the Race (and Sprint, where held) of any of the **3 most recent Grand Prix weekends** with all cars moving on the track map, a live-updating
  leaderboard and play/pause/seek/speed controls.
- Can register, log in and save a favourite driver/team, which personalises the home page.
- Head-to-Head and Pit Stops analytics pages work.
- Tests pass in CI, and the code follows MVC on the server.
- **Submission deliverables** (from the submission form): public GitHub repo, deployed URL reachable by
  evaluators, complete README and project docs, a demo video of the major workflows, and **no API keys,
  credentials or tokens in the repository**.

## 2. Scope

### In scope (submission, by Oct 27)

| Area               | Features                                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Group A, core data | Home (next-session countdown, top-10 driver and constructor standings, season progress, fastest pit stop), Schedule, Results (race, sprint, qualifying), Driver Standings, Constructor Standings, Drivers (list and detail), Teams (list and detail) |
| Group B, partial   | Head-to-Head, Pit Stops                                                                                                                                                                                                                              |
| Group C, partial   | **Race replay track map** for the **3 most recent Grand Prix weekends**: the Race, plus the Sprint on sprint weekends (up to 6 sessions), streamed over Socket.io. **Stretch goal:** live mode (§6.6), tested at the US GP (Oct 23–25). |
| Accounts           | Register, login, logout, favourite driver/team, delete account                                                                                                                                                                                       |
| Removed            | Gemini AI race summary (only existed to match the syllabus; any stack is now allowed) |

### After submission (not in this spec's implementation plan)

- Rest of Group B: Driver Stats, Consistency, Race Pace, Track DNA.
- Live mode, if the stretch goal (§6.6) is not finished by Oct 22.
- Replays of older weekends (retention is fixed at 3 weekends for now).
- A move to Next.js, if SEO becomes important.

### Out of scope

- Group D (tech updates, used power-unit elements, crash-damage costs, records feed). No API exists
  for these, so they would mean entering data by hand every race weekend.
- Practice and qualifying replays, watch-party rooms, per-circuit map rotation, hover tooltips on
  cars.
- Redux, Redis, a separate job runner, Playwright E2E tests.
- F1 or team logos and branding (trademark risk).

## 3. Data sources (verified 2026-10-10)

| Source                                             | Use                                                                                                 | Cost         | Limits                                                      | Notes                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Jolpica-F1** (`https://api.jolpi.ca/ergast/f1/`) | Schedule, results, qualifying, sprint, standings, drivers, constructors (1950 onwards)              | Free, no key | 4 req/s burst, 500 req/hour; page size max 100 (default 30) | Docs warn the limits _will decrease_. Must be cached server-side.                                                           |
| **OpenF1, free** (`https://api.openf1.org/v1/`)    | `sessions`, `drivers`, `laps`, `location`, `position`, `intervals`, `stints`, `pit`, `race_control` | Free         | 3 req/s, 30 req/min                                         | Historical only, 2023 onwards. Data counts as historical from 30 min after a session ends. "Personal / non-commercial use." |
| **OpenF1, Sponsor**                                | Live data (REST, MQTT, WebSocket)                                                                   | €9.90/month  | 6 req/s, 60 req/min                                         | Post-submission only. Commercial use requires contacting OpenF1.                                                            |

**Measured:** `GET /location?session_key=9839` for a 60-second window returned **4,480 rows,
574 KB, 1.5 s** (20 cars × ~3.7 Hz). A 2-hour race is therefore ~120 requests and ~69 MB of raw
JSON, about 4 minutes to fetch at 30 req/min. That's why replay data is fetched **progressively**
and stored **compressed** (§6.2).

**Known oddities:**

- OpenF1 lists future sessions (for example the 2026 Abu Dhabi race on Dec 6). The replay list must
  filter to `date_end` in the past.
- Driver identity differs between the two APIs. Jolpica uses `driverId` (e.g. `max_verstappen`);
  OpenF1 uses `driver_number` and `name_acronym`. We match on **number and acronym per season**,
  because numbers change between seasons.

## 4. Stack

The decision was researched on 2026-10-10 against current web sources. Option A was
chosen: **MERN in TypeScript**.

| Layer       | Choice                                   | Version (npm, 2026-10-10) | Why                                                                                                                                               |
| ----------- | ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | Node.js (LTS, `engines: >=24`)           | local v26.7               | Syllabus (MERN-1). Bun was rejected: the relay is a long-running process, where Node's GC is more proven.                                         |
| Server      | Express 5                                | 5.3.0                     | Syllabus (MERN-2). Framework speed is irrelevant here: upstream limits (30 req/min) are the bottleneck. Express 5 forwards async errors natively. |
| Database    | MongoDB Atlas M0 + Mongoose              | mongoose 9.11.1           | Syllabus (MERN-3). Free 512 MB, 100 ops/s.                                                                                                        |
| Real-time   | Socket.io                                | 4.8.4                     | Syllabus (MERN-12/13).                                                                                                                            |
| Client      | React + Vite + TypeScript                | react 19.3.0, vite 8.3.4  | Tight deadline and existing React skills. Vite over Next.js because SEO doesn't matter yet.                                                       |
| Client data | TanStack Query, React Router             | —                         | Fetch caching, loading/error states, code splitting (MERN-14).                                                                                    |
| Styling     | Tailwind CSS                             | —                         | —                                                                                                                                                 |
| Charts      | Recharts                                 | —                         | Only two chart pages for submission. Revisit for the rest of Group B.                                                                             |
| Track map   | Canvas 2D, no library                    | —                         | Canvas beats SVG for 20 moving dots (confirmed by a prior OpenF1 replay project).                                                                 |
| Validation  | zod                                      | 4.6.5                     | Every request body, URL parameter and query string.                                                                                               |
| Tests       | Vitest, Supertest, mongodb-memory-server | vitest 5.0.3              | —                                                                                                                                                 |
| Hosting     | One Render free web service + Atlas M0; Docker image for portability | — | See §8. A self-hosted laptop was evaluated (i3-6006U, 3.7 GB RAM, hostel Wi-Fi in another city) and rejected for the evaluator-facing deployment: storage no longer matters with 3-weekend retention, and uptime risk is high. |

**Repo:** npm workspaces monorepo.

```
f1_dashboard/
├── client/   React + Vite + TS: pages, charts, Canvas track map
├── server/   Express + TS, MVC
├── shared/   TypeScript types only (Driver, Race, ReplayFrame, …), imported by both sides
└── docs/
```

## 5. Architecture

### 5.1 Server layout (MVC, MERN-4)

```
server/src/
├── models/        Mongoose schemas (§5.3)
├── controllers/   races, standings, drivers, teams, analytics, replay, auth, users, home
├── routes/        Express routers → controllers
├── services/      jolpica.ts, openf1.ts: the ONLY code that calls upstream APIs
├── sockets/       replay.ts: /replay namespace, ReplayEngine, ChunkStore
├── middleware/    requireAuth, validate (zod), errorHandler
├── scripts/       warm.ts: fetches the newest finished race into Mongo and applies retention (§6.2)
└── index.ts       app + http server + Socket.io; serves client/dist in production
```

### 5.2 Data flow and caching

```
Browser ──REST──▶ controller ──▶ MongoDB (cache)
                                  │ missing or stale?
                                  ▼
                   services/jolpica|openf1 ──▶ upstream API
                   (per-service rate-limited queue) ◀── upsert into Mongo, return
Browser ◀─Socket.io── sockets/replay ◀── ReplayChunk (Mongo) ◀── OpenF1 /location
```

- **Fetched on request, not on a schedule.** Render free sleeps, so scheduled jobs would not run
  reliably.
- **Staleness rule:** documents for past seasons never go stale. Current-season documents are stale
  when `now - fetchedAt > 1 hour`.
- **Rate-limited queue per service:** Jolpica ≤ 4/s and ≤ 500/h; OpenF1 ≤ 3/s and ≤ 30/min. On 429:
  exponential backoff (1 s, 2 s, 4 s; 3 tries), honouring `Retry-After`.
- **In-flight dedup:** simultaneous requests for the same upstream resource share one promise.
- Browsers never call Jolpica or OpenF1 directly.

### 5.3 Mongoose models

Every cached model has a `fetchedAt: Date`. Lists are embedded in their parent document.

| Model             | Key fields                                                                                                                                                                                                    | Unique index          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **User**          | email (lowercased), passwordHash (`select: false`), displayName, favouriteDriverId?, favouriteTeamId?, timestamps                                                                                             | email                 |
| **Race**          | season, round, name, circuit {id, name, locality, country, lat, long}, sessions [{type, startsAt}], openf1SessionKey?                                                                             | (season, round)       |
| **RaceResult**    | season, round, type (`race`, `sprint`, `qualifying`), entries [{position, driverId, teamId, grid, laps, status, points, time, fastestLap}]                                                                    | (season, round, type) |
| **Standings**     | season, afterRound, kind (`driver`, `constructor`), entries [{position, points, wins, driverId or teamId}]                                                                                                    | (season, kind)        |
| **Driver**        | driverId, code, number, givenName, familyName, nationality, dateOfBirth                                                                                                                                       | driverId              |
| **Team**          | teamId, name, nationality, colour                                                                                                                                                                             | teamId                |
| **ReplaySession** | sessionKey, season, round, sessionType, startsAt, endsAt, drivers [{number, acronym, name, teamColour}], trackOutline [[x, y]], positions [], intervals [], stints [], pitStops [], raceControl [], totalLaps | sessionKey            |
| **ReplayChunk**   | sessionKey, minute, data (Buffer: gzipped compact samples)                                                                                                                                                    | (sessionKey, minute)  |

- Team colours come from OpenF1's `team_colour` (2023 onwards); earlier seasons fall back to neutral
  grey.
- ReplaySession must stay under the 16 MB document limit. The largest array, intervals, is
  ~18k rows (~2 MB).

### 5.4 REST API

`:year` is a number from 1950 to the current year, or `current`. All responses are JSON. Errors
have the shape `{ error: { code, message } }`.

| Method and path                                                             | Auth     | Returns                                                                                                                                                                               |
| --------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                           | —        | `{ ok: true }`                                                                                                                                                                        |
| `GET /api/home`                                                             | optional | Next race and session times, top-10 driver and constructor standings, season % complete, fastest pit stop of the season, plus the user's favourite driver/team summary when logged in |
| `GET /api/seasons/:year/schedule`                                           | —        | Races with session times                                                                                                                                                              |
| `GET /api/seasons/:year/races/:round/results?type=race\|sprint\|qualifying` | —        | Classification                                                                                                                                                                        |
| `GET /api/seasons/:year/standings/drivers`                                  | —        | Driver standings                                                                                                                                                                      |
| `GET /api/seasons/:year/standings/constructors`                             | —        | Constructor standings                                                                                                                                                                 |
| `GET /api/seasons/:year/drivers` and `/drivers/:driverId`                   | —        | List; detail with season results                                                                                                                                                      |
| `GET /api/seasons/:year/teams` and `/teams/:teamId`                         | —        | List; detail with drivers and results                                                                                                                                                 |
| `GET /api/analytics/:year/head-to-head?a=&b=`                               | —        | Race H2H, qualifying H2H, points, wins, podiums, DNFs, per-round finishing gap                                                                                                        |
| `GET /api/analytics/:year/pit-stops`                                        | —        | Fastest stop per race, average per team (2023+, OpenF1 `pit.stop_duration`)                                                                                                           |
| `GET /api/replay/sessions` | — | Race and Sprint sessions of the 3 most recent finished Grand Prix weekends, newest first |
| `POST /api/auth/register`                                                   | —        | Creates user, sets cookie                                                                                                                                                             |
| `POST /api/auth/login`                                                      | —        | Sets cookie                                                                                                                                                                           |
| `POST /api/auth/logout`                                                     | —        | Clears cookie                                                                                                                                                                         |
| `GET /api/auth/me`                                                          | required | Current user                                                                                                                                                                          |
| `PATCH /api/users/me`                                                       | required | Update displayName and favourites                                                                                                                                                     |
| `DELETE /api/users/me`                                                      | required | Delete account                                                                                                                                                                        |
| `POST /api/internal/warm` | `WARM_TOKEN` bearer | Runs the warm job (§6.2); called by the scheduled GitHub Action. 401 without a valid token |

Analytics are computed in the controller from at most ~600 rows per season; no Mongo aggregation
pipelines.

## 6. Replay track map

### 6.0 How it works, in plain words

1. **The track shape.** OpenF1 records every car's GPS-like position (x, y) about 4 times a second.
   We take the positions of one car over one clean lap and join the dots. That outline _is_ the
   circuit. No images are needed.
2. **The cars.** For every moment of the race we know where each car was. To show the race, we
   draw a coloured dot for each car at its position "right now", and move "now" forward.
3. **Smooth movement.** Positions arrive about 4 times a second, but the screen redraws about 60
   times a second. Between two known positions we place the dot partway along the straight line
   between them (_interpolation_), so the movement looks smooth instead of jumpy.
4. **Who controls "now".** The server holds the playback clock: where in the race we are, playing
   or paused, and the speed. When you press play or change speed, the browser tells the server. The
   server replies with the new clock and keeps sending the next few seconds of car positions ahead
   of time, over Socket.io. The browser just draws whatever "now" is.
5. **Why not download the whole race?** A full race is ~69 MB, and OpenF1 only allows 30 requests a
   minute. So the server fetches one minute at a time, just ahead of playback, and saves each minute
   (compressed) in MongoDB so it is never fetched twice.
6. **The leaderboard.** OpenF1 also records race position, gaps and tyres over time. The server
   works out the order at "now" and sends it to the browser about once a second.
7. **Live mode later.** In a live race, "now" is simply "the newest data minus 2 seconds". The
   drawing code stays the same.

### 6.1 Rendering principle

The client always renders cars at a `renderTime` by interpolating buffered timestamped samples.

- **Replay:** `renderTime = state.t + (Date.now() - state.serverNow) * state.speed` while playing.
- **Live (later):** `renderTime = newestSampleTime - 2000 ms`.

### 6.2 Server: `sockets/replay.ts` (`/replay` namespace)

- **ReplayEngine:** one per connected socket. Holds `cursor` (ms since session start), `playing`
  and `speed`. Every **250 ms** of wall time it:
  1. emits samples for `[cursor, cursor + lookahead]`;
  2. emits a board update if the order changed (≤ 1 Hz);
  3. emits new race-control messages;
  4. makes sure minutes `m+1` and `m+2` are being fetched.
  - The lookahead starts at 2 s × speed and gets tuned on a real race.
- **ChunkStore:** looks up a minute in an in-memory cache (~50 chunks), then the Mongo
  `ReplayChunk`, then OpenF1 `/location` for that 60-second window. In-flight fetches are deduped
  across sockets.
- **Chunk encoding:** rows reduced to `[driverNumber, tOffsetMs, x, y]`, JSON, then gzip
  (`node:zlib`). Estimated 2–7 MB per race, to be **measured on the first ingested race**.
- **Metadata ingest:** on the first `replay:join` for a session, ~9 OpenF1 calls: `drivers`, `laps`,
  `position`, `intervals`, `stints`, `race_control`, `pit`, plus one track-outline call. Stored in
  ReplaySession.
- **Track outline:** take the fastest-lap driver's lap with `is_pit_out_lap = false`, then fetch
  `/location?driver_number=N` from that lap's `date_start` to the next lap's `date_start`
  (~330 points).
- **Warm job and retention** (`scripts/warm.ts`, also exposed as `POST /api/internal/warm`):
  1. Find finished Race and Sprint sessions (`date_end` in the past) of the 3 most recent Grand Prix
     weekends (by `meeting_key`) that are not yet stored.
  2. Ingest their metadata and **all** their chunks, respecting the OpenF1 rate limit (~4 min per
     race, ~1.5 min per sprint).
  3. Delete `ReplaySession`s (and their `ReplayChunk`s) from older weekends.
  - Idempotent: if the newest race is already stored, it does nothing.
  - A replay viewer can still trigger on-demand fetching (above) if a chunk is missing.
- **Start point:** the earliest lap-1 `date_start`, falling back to the session's `date_start`.
  Verify at build time that lap 1's `date_start` is present.

### 6.3 Socket events

| Event                          | Direction | Payload                                                          |
| ------------------------------ | --------- | ---------------------------------------------------------------- |
| `replay:join`                  | C → S     | `{ sessionKey }`                                                 |
| `replay:meta`                  | S → C     | `{ drivers, trackOutline, startsAt, endsAt, totalLaps }`         |
| `replay:play` / `replay:pause` | C → S     | —                                                                |
| `replay:seek`                  | C → S     | `{ t }`                                                          |
| `replay:speed`                 | C → S     | `{ x: 1 \| 2 \| 4 \| 8 \| 16 }`                                  |
| `replay:state`                 | S → C     | `{ playing, speed, t, serverNow }`, sent on every control change |
| `replay:frames`                | S → C     | `{ samples: [{ n, t, x, y }] }`                                  |
| `replay:board`                 | S → C     | `{ t, lap, rows: [{ n, position, gap, interval, compound }] }`   |
| `replay:event`                 | S → C     | `{ t, category, flag, message }`                                 |
| `replay:buffering`             | S → C     | `{ on }`                                                         |
| `replay:error`                 | S → C     | `{ code, message }`                                              |

All client → server payloads are validated with zod. Invalid input gets `replay:error`.

### 6.4 Client: `client/src/features/replay/`

- **Picker page `/replay`:** lists the 3 most recent weekends, each with its Race and, where held, Sprint (from
  `GET /api/replay/sessions`).
- **Layout:** Canvas track map (left/top on mobile), leaderboard table (right/below), race-control
  banner (flag colour and latest message, current lap), transport bar (play/pause, 1×–16×, scrubber,
  session clock).
- **Canvas:**
  - Scaled by `devicePixelRatio`.
  - The outline is pre-drawn to an offscreen canvas.
  - Each `requestAnimationFrame` draws the outline image plus 20 dots in team colours with 3-letter
    labels. The selected driver gets a ring.
- **`fitToCanvas`:** bounding box, uniform scale with padding, flip y.
- **`interpolate`:**
  - Per driver, find the samples either side of `renderTime` and blend linearly.
  - If the gap is over **2 s**, hold the last position.
  - Drop `(0, 0)` samples (assumed no-signal; verify on real data).
- **Accessibility:**
  - The canvas has `role="img"` and an `aria-label`. The leaderboard is a real `<table>` and is the
    accessible equivalent.
  - Controls are labelled buttons.
  - Keyboard: Space plays/pauses; ← and → seek 10 s.
  - Clicking a leaderboard row selects that driver.

### 6.5 Build order (each step visible before the next)

1. Static track outline drawn from stored location data.
2. Dots frozen at a single moment.
3. Dots moving (local clock, one cached chunk).
4. Server clock over Socket.io with play/pause/seek/speed.
5. Progressive chunk fetching and buffering state.
6. Leaderboard and race-control banner.

### 6.6 Live mode (stretch goal, only after everything in §2 works)

- **Source:** OpenF1 Sponsor tier (€9.90/month, personal/non-commercial use), subscribed only for
  October. One server-side connection (OpenF1 MQTT or WebSocket); credentials in env
  `OPENF1_USERNAME` / `OPENF1_PASSWORD`, never in the repo.
- **Relay:** a `LiveEngine` on the same `/replay` namespace emits the same `frames`, `board` and
  `event` messages to a Socket.io room per live session. The client switches `renderTime` to
  newest sample − 2 s (§6.1). No seek or speed controls in live mode.
- **Schedule:** working against a replay of recorded live messages by **Oct 22**; tested in Austin
  practice/qualifying (Oct 23–24); race on Oct 25 recorded for the demo video.
- **Cut-off:** if it is not working by Oct 22, it is dropped from the submission with no effect on
  anything else.

## 7. Auth, security and error handling

### 7.1 Auth (MERN-7/8)

- **Passwords:** `bcryptjs`, minimum 8 characters, email lowercased and validated.
- **JWT:**
  - Signed with `JWT_SECRET`, 7-day expiry.
  - Stored in an `httpOnly`, `Secure` (production), `SameSite=Lax` cookie named `token`.
  - Same origin as the app (§8), so there are no cross-site cookie problems.
- **`requireAuth`:** verifies the cookie and sets `req.userId`; returns 401 `UNAUTHENTICATED`
  otherwise. `optionalAuth` (used by `/api/home`) sets `req.userId` when the cookie is valid and
  otherwise continues without it.
- **Hardening:**
  - `helmet` for security headers.
  - `express-rate-limit` on `/api/auth/login` and `/api/auth/register` (against brute force).
  - `/api/internal/warm` requires `Authorization: Bearer $WARM_TOKEN`, compared in constant time.
  - zod validation on all inputs.
  - CORS is enabled only in development, for the Vite dev server.

### 7.2 Error handling

| Where                              | Behaviour                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Express                            | Central `errorHandler`: `AppError(status, code, message)` becomes JSON. Unknown errors become 500 `INTERNAL` with a generic message; the stack is logged on the server only. |
| Upstream fails, stale cache exists | Serve the stale data with `X-Data-Stale: true`; the client shows an "may be out of date" badge.                                                                              |
| Upstream fails, no cache           | 503 `UPSTREAM_UNAVAILABLE`; the client shows a retry button.                                                                                                                 |
| Upstream 429                       | Queue backoff (§5.2).                                                                                                                                                        |
| Socket                             | `replay:error`. Socket.io auto-reconnects; the client re-joins and seeks to its last `t`.                                                                                    |
| Client                             | TanStack Query retries twice. Per-page error boundaries and skeleton loaders. After 5 s pending, show "Waking up the server…" (Render cold start ~1 min).                    |

## 8. Deployment, all free tier

- **One Render free web service.** Express serves `/api`, Socket.io and the built `client/dist` (SPA
  fallback) from one origin.
  - **Why not Vercel + Render:** that puts the frontend and backend on different sites, so the login
    cookie becomes a third-party cookie, which browsers increasingly block. Also, Vercel rewrites to
    an external backend don't proxy Socket.io.
  - **Build:** `npm ci && npm run build`. **Start:** `node server/dist/index.js`.
  - **Health check:** `/api/health`. Auto-deploys on push to `main`.
  - **Free-tier limits (Render docs):** sleeps after 15 min idle, ~1 min wake-up, local files wiped
    on sleep, 750 instance-hours/month.
- **MongoDB Atlas M0:** 512 MB. Network access must be `0.0.0.0/0` because Render free has no static
  IP, so use a strong generated DB password.
- **Environment variables:** `MONGODB_URI`, `JWT_SECRET`, `WARM_TOKEN`, `NODE_ENV`,
  `PORT`.
- **Demo prep:**
  - Confirm `GET /api/replay/sessions` lists the 3 weekends' sessions and each replays end to end (the warm job pre-fetches them).
  - Open the site ~2 min before the demo to wake Render.
- **CI (GitHub Actions):** on push, `npm ci`, typecheck, `npm test`, and a **gitleaks** secret scan
  that fails the build if a key or token is committed.
- **Scheduled warm job (GitHub Actions cron):** Mondays and Tuesdays 06:00 UTC, `curl -X POST` to
  `/api/internal/warm` with `WARM_TOKEN` from repository secrets. This also wakes Render. Cron runs
  can be delayed, which is fine for a weekly job.
- **Secrets hygiene:** `.env` is git-ignored; `.env.example` lists every variable with placeholder
  values; production secrets live only in Render's environment settings and GitHub secrets.
- **Docker:** a multi-stage `Dockerfile` and a `docker-compose.yml` (app + MongoDB with
  `--wiredTigerCacheSizeGB 0.5`) for local development. The same image could later run on the laptop
  or a VPS.
- **Footer:** "Unofficial fan project. Not associated with Formula 1, the FIA or Formula One
  Management." No F1 or team logos.

## 9. Testing

- **Unit (Vitest):**
  - Jolpica → model transforms
  - Jolpica ↔ OpenF1 driver matching
  - Head-to-head and pit-stop calculations
  - Staleness rule
  - Rate-limit queue (fake timers)
  - `interpolate`, `fitToCanvas`, `boardAt`, chunk encode/decode round-trip, playback clock math
- **API integration (Supertest + mongodb-memory-server):** every REST route, with upstream services
  mocked by **saved real API responses** stored under `server/test/fixtures/`.
- **Auth:** register, login, `/me`, 401 without cookie, logout, delete account.
- **Socket:** join → meta, play → frames, seek → state, against fixture chunks.
- **Retention:** warming a 4th weekend deletes the oldest weekend's `ReplaySession` and `ReplayChunk`s;
  the warm job is idempotent (running it twice changes nothing).
- **Manual demo checklist** in `docs/demo-checklist.md`, in place of E2E tests. It doubles as the
  shot list for the demo video.

## 10. Engineering decisions (for the README)

| Decision | Why |
|---|---|
| MERN in TypeScript | Any stack was allowed; the user knows MERN from the course and can explain it. Measured bottleneck is OpenF1 (30 req/min, 1.5 s per location request), not the framework or runtime. |
| Node over Bun | The relay is a long-running process; Node's GC is more proven there. |
| Vite SPA over Next.js | Tight deadline; SEO not needed yet. |
| One Render service, same origin | First-party auth cookie; Socket.io works without a proxy. Vercel rewrites don't proxy Socket.io. |
| Cache in Mongo, fetch on request | Upstream rate limits; Render free sleeps, so no reliable schedulers on the server. |
| Compressed minute chunks, 3-weekend retention | A race is ~69 MB raw; compressed and limited to 3 weekends (≤ 6 sessions) it stays far under Atlas's 512 MB. |
| Canvas for the track map | 20 moving dots at 60 fps; DOM table as the accessible equivalent. |
| Cloud over the self-hosted laptop | Evaluator uptime matters more than no cold starts; Docker keeps self-hosting possible later. |

## 11. Risks and open items

| Risk                                                   | Mitigation                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 12 days left (as of Oct 15) | Fixed scope (§2). Live mode is a stretch goal with an Oct 22 cut-off. Replay is built in visible steps, so a partial replay is still demoable. |
| OpenF1 or Jolpica down or rate-limited during the demo | All 3 replays pre-warmed into Atlas; stale-cache fallback. |
| Render cold start during the demo                      | Wake the site 2 min early; "Waking up the server…" UI.                                                                  |
| Atlas 512 MB filling up | 3-weekend retention (§6.2); measure per-race size on the first ingest. |
| OpenF1 commercial terms                                | Stay non-commercial. Contact OpenF1 before any ads or subscriptions.                                                    |
| Unverified data assumptions                            | Check at build time: `(0, 0)` samples, presence of lap 1 `date_start`, actual chunk size.                               |
| Secrets leaked into the repo | `.env` git-ignored, `.env.example`, gitleaks in CI (§8). |
| Demo video missing a workflow | `docs/demo-checklist.md` is the shot list (§9). |
