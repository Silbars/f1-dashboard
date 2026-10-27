# F1 Dashboard

An unofficial Formula 1 fan dashboard: the season's schedule, results, standings, drivers and teams in one place, a **race replay track map** with every car moving around the circuit, and optional accounts to follow a favourite driver and team. Built as an end-term project.

- **Live site:** https://f1-dashboard-5yf2.onrender.com
- **Demo video:** (link to be added)
- **Repository:** https://github.com/Silbars/f1-dashboard

> The live site runs on Render's free tier, which sleeps when idle. The first visit can take up to a minute while the server wakes; the app shows a "Waking up the server…" banner while it does.

## Features

- **Home**: a live countdown to the next session, season progress (rounds completed out of the total), the top 10 of the drivers' and constructors' standings, and, when logged in, your favourite driver and team with their current position and points.
- **Schedule**: every round of a season with its circuit, the race start in your local time zone and a "Sprint weekend" tag. A season selector goes back to 1950. Each round links to its results.
- **Results**: race, sprint and qualifying results for each round, switchable with tabs.
- **Standings**: drivers' and constructors' championship tables for any season, linking to each driver's or team's page.
- **Drivers and Teams**: a list for each season, and a detail page per driver (round-by-round grid, finish, status and points) and per team (its drivers and best finish per round). Teams are shown in their team colours.
- **Race replay** (`/replay`): the Race, and the Sprint on sprint weekends, of the 3 most recent Grand Prix weekends. Every car moves around a track map drawn from real GPS data, next to a live leaderboard (position, gap, interval, tyre) and a race-control banner (flags, safety car). Play, pause, seek and 1×–16× speed; Space plays and pauses, ← and → jump 10 seconds; clicking a driver in the leaderboard rings their car on the map.
- **Accounts**: register, log in and log out; pick a favourite driver and team on the profile page; delete the account.
- **Resilience**: if the upstream data source fails, the app serves the last saved copy and shows a "Showing saved data" notice instead of an error.

## Tech stack

| Layer    | Tools                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Language | TypeScript everywhere, run directly by Node 26 on the server (no build step)  |
| Server   | Express 5, Socket.io 4, Mongoose 9 (MongoDB), Zod validation, JWT in an httpOnly cookie, bcrypt, Helmet, express-rate-limit |
| Client   | React 19, Vite, React Router 7, TanStack Query 5, Tailwind CSS 4, Canvas 2D, socket.io-client |
| Tests    | Vitest, Supertest, mongodb-memory-server                                      |
| Ops      | Docker, Render (free web service), MongoDB Atlas, GitHub Actions, gitleaks    |

## Architecture

```
Browser (React SPA)
   │  same origin: /api/*, /socket.io and static files
   ▼
Express 5 + Socket.io server ──► MongoDB (Atlas): users, cached F1 data, stored replays
   │
   ├──► rate-limited queue ──► Jolpica-F1 API   (schedules, results, standings)
   └──► rate-limited queue ──► OpenF1 API       (car positions, laps, gaps, race control)

GitHub Actions (Mon + Tue) ──► POST /api/internal/warm ──► stores the newest replays
```

- **npm workspaces**: `shared/` (TypeScript types used by both sides), `server/` and `client/`.
- **Express MVC**: `routes/` declare endpoints and validate params, query and body with Zod; `controllers/` handle requests; `services/` hold the data logic; `models/` are the Mongoose schemas. Errors go through one error handler that returns `{ error: { code, message } }`.
- **Upstream queues**: every upstream request goes through a queue (`server/src/services/queue.ts`) that keeps to the API's limits, merges identical requests in flight and retries `429` responses. Jolpica allows 4 requests per second and 500 per hour; OpenF1 allows 30 per minute, so its queue sends one request every 2.1 seconds. If waiting would take longer than 10 seconds the queue fails fast, so the cache can answer instead.
- **Cache with stale fallback** (`server/src/services/cache.ts`): F1 data is stored in MongoDB and fetched from Jolpica on request. A copy older than one hour is refreshed; a past season fetched after it ended is never refetched. If the refresh fails, the old copy is served with an `X-Data-Stale: true` header, and the client shows the "saved data" notice. If nothing is cached, the API returns `503 UPSTREAM_UNAVAILABLE`.
- **Client**: TanStack Query fetches `/api/*` and reads the stale header; pages are lazy-loaded behind an error boundary so the nav and footer survive a failed page.
- **Deployment**: one Docker image builds the client and serves it from the Express server, so the API, the socket and the site share an origin (first-party auth cookie, no CORS).

### Race replay

1. **Track outline.** OpenF1 records each car's position (x, y) about four times a second. The server takes one car's fastest clean lap and joins the dots; that outline *is* the circuit, so no track images are needed.
2. **Storage.** The warm job (`server/src/services/replay/warm.ts`) picks the Race and Sprint sessions of the 3 newest finished weekends, ordered by date. For each one it stores the session's laps, positions, gaps, tyre stints and race-control messages as one gzipped document (`ReplaySession`), then every minute of car positions as a gzipped `[driver, t, x, y]` array (`ReplayChunk`). A race is about 104 minutes and 4 MB. Older weekends are deleted, but only after the new ones are fully stored, so an OpenF1 outage never empties the replay list. Running it twice changes nothing.
3. **Playback.** Each viewer gets their own `ReplayEngine` on the `/replay` Socket.io namespace (`server/src/sockets/`). The server owns the clock: every 250 ms it moves "now" forward by the elapsed time × speed and sends the next 2 seconds × speed of samples ahead of time, the leaderboard when it changes (at most once a second) and any new race-control messages. A missing minute is fetched from OpenF1 on demand, with a "Buffering…" notice if it takes longer than 300 ms.
4. **Drawing.** The browser keeps the samples in a buffer and, on every animation frame, draws each car where it was at "now", placing it partway between the two samples either side (linear interpolation) so movement is smooth at 60 frames per second. Across a gap of more than 2 seconds the car is held still. The outline is drawn once per resize to an offscreen canvas.
5. **Accessibility.** The canvas has `role="img"` and a label; the leaderboard is a real `<table>` and is its text equivalent. All controls are labelled buttons, the speed buttons report `aria-pressed`, and the position slider is a native range input.

| Socket event | Direction | Payload |
| ------------ | --------- | ------- |
| `replay:join` | client → server | `{ sessionKey }` |
| `replay:meta` | server → client | `{ session, drivers, outline }` |
| `replay:play`, `replay:pause` | client → server | – |
| `replay:seek` | client → server | `{ t }` (ms since lights out, clamped to the race) |
| `replay:speed` | client → server | `{ x: 1 \| 2 \| 4 \| 8 \| 16 }` |
| `replay:state` | server → client | `{ playing, speed, t, reset }` on every control change |
| `replay:frames` | server → client | `{ samples: [driver, t, x, y][] }` |
| `replay:board` | server → client | `{ t, lap, rows: [{ n, position, gap, interval, compound }] }` |
| `replay:event` | server → client | `{ t, category, flag, message }` |
| `replay:buffering` | server → client | `{ on }` |
| `replay:error` | server → client | `{ code, message }` (`VALIDATION`, `NOT_FOUND`, `INTERNAL`) |

Every client payload is validated with Zod; bad input gets `replay:error` and the socket keeps working. Closing the tab stops that viewer's engine.

### API

| Method | Path                                                      | Auth     |
| ------ | --------------------------------------------------------- | -------- |
| GET    | `/api/health`                                             | –        |
| GET    | `/api/home`                                               | optional |
| GET    | `/api/seasons/:year/schedule`                             | –        |
| GET    | `/api/seasons/:year/races/:round/results?type=race\|sprint\|qualifying` | – |
| GET    | `/api/seasons/:year/standings/drivers\|constructors`      | –        |
| GET    | `/api/seasons/:year/drivers`, `/drivers/:driverId`        | –        |
| GET    | `/api/seasons/:year/teams`, `/teams/:teamId`              | –        |
| GET    | `/api/replay/sessions` (stored replays, newest first)     | –        |
| POST   | `/api/auth/register`, `/api/auth/login` (rate-limited: 20 per 15 min) | – |
| POST   | `/api/auth/logout`                                        | –        |
| GET    | `/api/auth/me`                                            | required |
| PATCH  | `/api/users/me` (display name, favourite driver and team) | required |
| DELETE | `/api/users/me`                                           | required |
| POST   | `/api/internal/warm` (starts the warm job, answers `202`) | `Authorization: Bearer $WARM_TOKEN` |
| GET    | `/api/internal/warm` (status of the last warm run)        | `Authorization: Bearer $WARM_TOKEN` |

## Local setup

Requirements: Node.js 26 or later, npm, and a MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works).

1. Clone and install:

   ```bash
   git clone https://github.com/Silbars/f1-dashboard.git
   ```

   ```bash
   cd f1-dashboard
   ```

   ```bash
   npm ci
   ```

2. Create your environment file. `.env` is git-ignored; never commit it.

   ```bash
   cp .env.example .env
   ```

   Set `MONGODB_URI` to your Atlas connection string, and set `JWT_SECRET` and `WARM_TOKEN` each to the output of:

   ```bash
   openssl rand -hex 32
   ```

3. Start the API server (port 3000) and, in a second terminal, the client dev server (port 5173, which proxies `/api` and `/socket.io` to the server):

   ```bash
   npm run dev:server
   ```

   ```bash
   npm run dev:client
   ```

   Open http://localhost:5173.

4. Fill the replays (about 20 minutes, because of OpenF1's rate limit). Until this has run, `/replay` says no replays are stored yet.

   ```bash
   npm run warm -w server
   ```

5. Run the type checker and the tests (the server tests use an in-memory MongoDB and recorded OpenF1 responses, so they need no `.env` and no network):

   ```bash
   npm run typecheck
   ```

   ```bash
   npm test
   ```

**Troubleshooting:** if the server or the warm job exits with `querySrv EBADRESP` (or another `querySrv` error), Node could not resolve the Atlas `mongodb+srv://` address on your network. In Atlas, choose *Connect → Drivers* and copy the standard (legacy) `mongodb://` connection string that lists the three hosts instead.

### Environment variables

Read and validated at startup in `server/src/config.ts`; the server refuses to start if a value is invalid.

| Variable      | Required | Default                        | Purpose                                                                 |
| ------------- | -------- | ------------------------------ | ----------------------------------------------------------------------- |
| `MONGODB_URI` | yes (in practice) | `mongodb://localhost:27017/f1` | MongoDB connection string.                                     |
| `JWT_SECRET`  | yes      | –                              | Signs login tokens. At least 32 characters (`openssl rand -hex 32`).    |
| `WARM_TOKEN`  | for the warm endpoint | –                 | Bearer token for `/api/internal/warm`. At least 32 characters. If unset, the endpoint always answers `401`. |
| `PORT`        | no       | `3000`                         | HTTP port.                                                              |
| `NODE_ENV`    | no       | `development`                  | `development`, `test` or `production`. In production the server serves the built client, sets secure cookies and trusts Render's proxy. |

## Deployment

- **Render blueprint** (`render.yaml`): one free Docker web service with a `/api/health` health check that redeploys on every commit to `main`. `JWT_SECRET` and `WARM_TOKEN` are generated by Render; `MONGODB_URI` is entered once in the Render dashboard. No secrets are stored in the repository.
- **Dockerfile**: a two-stage build. The first stage builds the client with Vite; the second installs only production dependencies, copies the server source and the built client, and runs `node server/src/index.ts` as the unprivileged `node` user.
- **CI** (`.github/workflows/ci.yml`): on every push and pull request, gitleaks scans the full git history for secrets, then `npm ci`, `npm run typecheck` and `npm test` run on Node 26.
- **Weekly replay warm** (`.github/workflows/warm.yml`): every Monday and Tuesday at 06:00 UTC (and on demand), it calls `POST /api/internal/warm`, retrying while Render wakes up, then polls the status once a minute until the job finishes. Polling also keeps the free instance awake for the job. It needs two repository secrets: `APP_URL` (the site's address, no trailing slash) and `WARM_TOKEN`, which must equal the value Render generated.

## Engineering decisions

| Decision                          | Why                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| MERN in TypeScript                | Any stack was allowed, and MERN is the stack from the course. The bottleneck is the upstream APIs' rate limits, not the framework or runtime. |
| Node over Bun                     | The server is a long-running process; Node's garbage collector is more proven there.                                     |
| Vite SPA over Next.js             | A tight deadline, and SEO is not needed.                                                                                  |
| One Render service, same origin   | The auth cookie stays first-party and the socket needs no CORS or proxy setup.                                            |
| Cache in MongoDB, fetch on request | Upstream rate limits, and Render's free tier sleeps, so scheduled jobs on the server would not run reliably.             |
| Serve stale data over an error    | A slightly old standings table is more useful than an error page while the upstream API is down.                          |
| One shared queue per upstream API | Keeps every request inside each API's published limits, even when many pages load at once.                                |
| Replays stored ahead of time      | A full race is about 100 OpenF1 requests, which takes minutes at 30 requests per minute. Storing them weekly means a viewer never waits on OpenF1. |
| Weekly warm from GitHub Actions   | Render's free instance sleeps, so the server can't schedule its own jobs; an external cron wakes it and keeps it awake while the job runs. |
| Minute chunks, gzipped JSON       | Positions compress to about a third of their JSON size, and a minute is a natural unit to fetch on demand and to seek into. A whole race is about 4 MB, so 3 weekends fit easily in Atlas's free 512 MB. |
| Server owns the replay clock      | Play, pause, seek and speed have one source of truth, and the server knows exactly which samples to send next. The browser times the clock with its own `performance.now()`, so a wrong computer clock can't shift playback. |
| Interpolate in the browser        | Positions arrive about 4 times a second but the screen draws 60 times a second; blending between samples makes movement smooth without sending more data. |
| Team colours keyed by constructor id | OpenF1 and Jolpica name teams differently ("Red Bull Racing" vs "Red Bull"), so names can't be matched reliably. The colours are a short hand-kept list in `server/src/services/teamColours.ts`; a new team shows a grey fallback until it is added. |
| Cloud over a self-hosted laptop   | Uptime for evaluators matters more than avoiding cold starts; Docker keeps self-hosting possible later.                   |
| No Gemini, no Cloudinary          | They were only needed to match the syllabus; the app has no AI features or uploads.                                       |

## Roadmap

- Head-to-Head and Pit Stops analytics pages, and the fastest pit stop on Home.
- Live mode: follow a race while it happens, using the same track map.
- Replays of older weekends (retention is 3 weekends for now).

## Data sources

- **[Jolpica-F1](https://github.com/jolpica/jolpica-f1)**: schedules, results, standings, drivers and teams, through its Ergast-compatible API at `api.jolpi.ca`. Thanks to the Jolpica maintainers for keeping the Ergast data alive.
- **[OpenF1](https://openf1.org)**: car positions, laps, gaps, tyre stints, race-control messages and team colours for the race replay, on its free tier. Used non-commercially.

The app uses no F1 or team logos.

---

Unofficial fan project. Not associated with Formula 1, the FIA or Formula One Management.
