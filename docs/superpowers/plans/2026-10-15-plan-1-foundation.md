# Plan 1: Foundation, Group A Pages, Auth and Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed MERN app where anyone can browse schedule, results, standings, drivers and teams for any season, and users can register, log in and pick a favourite driver and team.

**Architecture:** npm-workspaces monorepo (`shared` types, `server` Express 5 + Mongoose in MVC, `client` React + Vite). The server is the only thing that calls Jolpica: every upstream call goes through a rate-limited queue, and every result is cached in MongoDB with an hourly staleness rule and a stale-data fallback. One Docker image serves the API and the built client from one origin on Render.

**Tech Stack:** Node 26 (native TypeScript type stripping), Express 5.3, Mongoose 9.11, zod 4.6, bcryptjs 3, jsonwebtoken 9, helmet 8, express-rate-limit 8, React 19 + Vite 8 + React Router 7 + TanStack Query 5 + Tailwind 4, Vitest 5, Supertest 7, mongodb-memory-server 11, TypeScript 5.9.

**Spec:** `docs/superpowers/specs/2026-10-10-f1-dashboard-design.md` (read §4, §5, §7, §8 before starting). Overview of all plans: `docs/superpowers/plans/2026-10-15-f1-dashboard-overview.md`.

## Global Constraints

- **Runtime:** Node `>=26`. The server runs `.ts` files directly (`node server/src/index.ts`) using Node's built-in type stripping, so: **no `enum`, no `namespace`, no constructor parameter properties** (`erasableSyntaxOnly`), and **relative imports end in `.ts`**.
- **Shared types:** `@f1/shared` contains types only. Import it with `import type` everywhere; it is never loaded at runtime.
- **Pinned majors:** TypeScript `~5.9.3`, React Router `^7.18`, Express `^5.3`, Mongoose `^9.11`, zod `^4.6`.
- **Error shape:** every API error is JSON `{ "error": { "code": string, "message": string } }`.
- **Upstream:** browsers never call Jolpica or OpenF1. Jolpica limits: 4 requests/second, 500 requests/hour. Base URL `https://api.jolpi.ca/ergast/f1`, page size 100.
- **Staleness:** data for a past season fetched after that season ended never goes stale; everything else is stale after 1 hour.
- **Stale fallback:** upstream failure + cached copy → serve it with header `X-Data-Stale: true`; no cached copy → `503 UPSTREAM_UNAVAILABLE`.
- **Auth cookie:** name `token`, `httpOnly`, `SameSite=Lax`, `Secure` in production, 7-day expiry, JWT HS256 signed with `JWT_SECRET` (≥ 32 chars).
- **Secrets:** `.env` is git-ignored; `.env.example` lists every variable with placeholders. Nothing secret is ever committed.
- **Branding:** footer text exactly `Unofficial fan project. Not associated with Formula 1, the FIA or Formula One Management.` No F1 or team logos.

### Decisions this plan makes that refine the spec

- **Freshness is tracked in one `CacheMeta` collection** (`{ key, fetchedAt }`, one row per upstream fetch such as `schedule:2025`) instead of a `fetchedAt` field on every model. It handles lists (a season's drivers) and single documents the same way.
- **`Driver` and `Team` documents are keyed by `(season, id)`**, because numbers and teams change between seasons (spec §3).
- **No CORS at all.** In development Vite proxies `/api` to the server, so the browser always talks to one origin.
- **Render deploys the Dockerfile** (`node:26-slim`), so production runs the same Node version as development.
- **Team colours stay `null`** until Plan 2 brings OpenF1's `team_colour`. **Home's `fastestPitStop` is `null`** until Plan 3.

## Review Focus

1. **Odd season values** (`/api/seasons/abc/...`, `/api/seasons/2099/...`, `/current/`) should give `400 VALIDATION` or resolve `current`, never a 500. Test in Task 6.
2. **A round that hasn't been raced yet** should return `200` with `entries: []` and the UI should say "No results yet", not crash. A round that doesn't exist at all → 404. Test in Task 6.
3. **Jolpica down:** with a cached copy → data plus `X-Data-Stale: true`; without → 503 with the JSON error shape. Tests in Task 5 and Task 6.
4. **Same email with different case** (`Fan@Example.com` then `fan@example.com`) → 409 on the second register; login works with either case. Test in Task 7.
5. **A deleted account's still-valid cookie** → `/api/auth/me` returns 401, and `/api/home` still works as a logged-out visitor. Tests in Task 7 and Task 8.

---

## File Structure

```
package.json                 workspaces, root scripts
tsconfig.base.json           shared compiler options
.gitignore  .env.example  .dockerignore
docker-compose.yml           mongo (Task 1), app (Task 14)
Dockerfile                   (Task 14)
.github/workflows/ci.yml     (Task 15)
shared/
  package.json
  src/index.ts               all shared types
server/
  package.json  tsconfig.json  vitest.config.ts
  src/
    config.ts                env parsing (zod)
    errors.ts                AppError
    schemas.ts               yearSchema, idSchema
    app.ts                   createApp(): middleware, routers, static client, error handler
    index.ts                 connect Mongo, start HTTP server
    middleware/errorHandler.ts  middleware/validate.ts  middleware/auth.ts
    services/queue.ts        rate-limited queue, HttpError, fetchJson
    services/jolpica.transform.ts  raw Jolpica JSON → shared types
    services/jolpica.ts      paginated Jolpica client (uses queue)
    services/cache.ts        isStale, cachedQuery
    services/f1data.ts       cached data access used by controllers
    services/home.ts         buildHome() pure function
    models/Race.ts  RaceResult.ts  Standings.ts  Driver.ts  Team.ts  CacheMeta.ts  User.ts
    controllers/send.ts  seasons.ts  auth.ts  users.ts  home.ts
    routes/seasons.ts  auth.ts  users.ts  home.ts
  test/
    db.ts                    mongodb-memory-server helpers
    fixtures/jolpica/*.json  saved real API responses
    *.test.ts
client/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/
    main.tsx  App.tsx  index.css
    lib/api.ts  lib/useApi.ts  lib/format.ts  lib/countdown.ts  lib/useSeason.ts  lib/useMe.ts
    components/Layout.tsx  components/States.tsx  components/SeasonSelect.tsx  components/Countdown.tsx
    pages/HomePage.tsx  SchedulePage.tsx  ResultsPage.tsx  StandingsPage.tsx
          DriversPage.tsx  DriverPage.tsx  TeamsPage.tsx  TeamPage.tsx
          LoginPage.tsx  RegisterPage.tsx  ProfilePage.tsx  NotFoundPage.tsx
  test/*.test.ts
```

---

### Task 1: Monorepo scaffold and health endpoint

**Files:**

- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`
- Create: `shared/package.json`, `shared/src/index.ts`
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/config.ts`, `server/src/app.ts`, `server/src/index.ts`
- Test: `server/test/health.test.ts`

**Interfaces:**

- Produces: `createApp(opts?: { clientDir?: string }): express.Express`; `config` object `{ NODE_ENV, PORT, MONGODB_URI, JWT_SECRET, WARM_TOKEN? }`; every shared type used by later tasks.

- [ ] **Step 1: Root files**

`package.json`:

```json
{
  "name": "f1-dashboard",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "client"],
  "engines": { "node": ">=26" },
  "scripts": {
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "build": "npm run build -w client",
    "start": "node server/src/index.ts",
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true
  }
}
```

`.gitignore`:

```
node_modules/
client/dist/
coverage/
.env
.DS_Store
```

`.env.example`:

```
# Copy to .env for local development. Never commit .env.
# Generate secrets with: openssl rand -hex 32
MONGODB_URI=mongodb://localhost:27017/f1
JWT_SECRET=change-me-to-64-random-hex-characters-0000000000
WARM_TOKEN=
PORT=3000
```

`docker-compose.yml` (the `app` service is added in Task 14):

```yaml
services:
  mongo:
    image: mongo:8
    command: ["--wiredTigerCacheSizeGB", "0.5"]
    ports: ["27017:27017"]
    volumes: [mongo-data:/data/db]
volumes:
  mongo-data: {}
```

- [ ] **Step 2: Shared types package**

`shared/package.json`:

```json
{
  "name": "@f1/shared",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts" } }
}
```

`shared/src/index.ts`:

```ts
// Types shared by server and client. Type-only: always `import type { ... } from '@f1/shared'`.

export interface Circuit {
  id: string;
  name: string;
  locality: string;
  country: string;
  lat: number;
  long: number;
}

export type SessionType =
  "fp1" | "fp2" | "fp3" | "sprintQualifying" | "sprint" | "qualifying" | "race";

export interface SessionTime {
  type: SessionType;
  startsAt: string; // ISO 8601 UTC
}

export interface Race {
  season: number;
  round: number;
  name: string;
  circuit: Circuit;
  sessions: SessionTime[]; // sorted by startsAt
}

export type ResultType = "race" | "sprint" | "qualifying";

export interface ResultEntry {
  position: number | null;
  positionText: string;
  number: number | null;
  driverId: string;
  driverCode: string | null;
  driverName: string;
  teamId: string;
  teamName: string;
  grid: number | null;
  laps: number | null;
  status: string | null;
  points: number;
  time: string | null;
  fastestLap: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
}

export interface RaceResult {
  season: number;
  round: number;
  type: ResultType;
  raceName: string;
  entries: ResultEntry[];
}

export type StandingsKind = "driver" | "constructor";

export interface StandingEntry {
  position: number | null;
  points: number;
  wins: number;
  id: string; // driverId or teamId
  name: string;
  code: string | null; // driver code, null for constructors
  teamId: string | null;
  teamName: string | null;
}

export interface Standings {
  season: number;
  afterRound: number;
  kind: StandingsKind;
  entries: StandingEntry[];
}

export interface Driver {
  driverId: string;
  code: string | null;
  number: number | null;
  givenName: string;
  familyName: string;
  nationality: string;
  dateOfBirth: string | null;
}

export interface Team {
  teamId: string;
  name: string;
  nationality: string;
  colour: string | null; // filled from OpenF1 in Plan 2
}

export interface DriverSeasonRow {
  round: number;
  raceName: string;
  position: number | null;
  positionText: string;
  points: number;
  grid: number | null;
  status: string | null;
  teamId: string;
}

export interface DriverDetail {
  season: number;
  driver: Driver;
  teams: Team[];
  results: DriverSeasonRow[];
  totalPoints: number; // race + sprint points
}

export interface TeamRoundRow {
  round: number;
  raceName: string;
  points: number; // race + sprint points that round
  bestPosition: number | null;
}

export interface TeamDetail {
  season: number;
  team: Team;
  drivers: Driver[];
  results: TeamRoundRow[];
  totalPoints: number;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  favouriteDriverId: string | null;
  favouriteTeamId: string | null;
}

export interface NextSession {
  raceName: string;
  round: number;
  country: string;
  session: SessionTime;
}

export interface FastestPitStop {
  driverName: string;
  teamName: string;
  duration: number;
  round: number;
  raceName: string;
}

export interface HomeData {
  season: number;
  totalRounds: number;
  completedRounds: number;
  progressPct: number;
  nextRace: Race | null;
  nextSession: NextSession | null;
  driverTop10: StandingEntry[];
  constructorTop10: StandingEntry[];
  fastestPitStop: FastestPitStop | null; // null until Plan 3
  favourites: {
    driver: StandingEntry | null;
    team: StandingEntry | null;
  } | null; // null when logged out
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
```

- [ ] **Step 3: Server package and install dependencies**

`server/package.json`:

```json
{
  "name": "@f1/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --env-file-if-exists=../.env src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  },
  "dependencies": {
    "@f1/shared": "*"
  }
}
```

`server/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "vitest.config.ts"]
}
```

Run from the repo root:

```bash
npm install -w server express@^5.3 mongoose@^9.11 zod@^4.6 helmet@^8 cookie-parser@^1.4 express-rate-limit@^8 bcryptjs@^3 jsonwebtoken@^9
npm install -D -w server typescript@~5.9.3 vitest@^5 supertest@^7 mongodb-memory-server@^11 @types/node @types/express@^5 @types/cookie-parser @types/jsonwebtoken @types/supertest
```

Expected: `package-lock.json` created; no errors.

- [ ] **Step 4: Write the failing test**

`server/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-test-secret-test-secret-0000",
      WARM_TOKEN: "test-warm-token-test-warm-token-00000000",
    },
    testTimeout: 30_000,
    hookTimeout: 120_000, // first run downloads a MongoDB binary
    fileParallelism: false,
  },
});
```

`server/test/health.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `../src/app.ts`.

- [ ] **Step 6: Implement config, app and entry point**

`server/src/config.ts`:

```ts
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const Env = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/f1"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  WARM_TOKEN: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
});

export const config = Env.parse(process.env);
```

`server/src/app.ts`:

```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { config } from "./config.ts";

export function createApp(_opts: { clientDir?: string } = {}) {
  const app = express();
  if (config.NODE_ENV === "production") app.set("trust proxy", 1); // Render's proxy; needed for rate limiting by IP
  // Render serves HTTPS itself; upgrade-insecure-requests would break plain-http local runs (Docker on localhost).
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
```

`server/src/index.ts`:

```ts
import http from "node:http";
import path from "node:path";
import mongoose from "mongoose";
import { createApp } from "./app.ts";
import { config } from "./config.ts";

await mongoose.connect(config.MONGODB_URI);

const clientDir =
  config.NODE_ENV === "production"
    ? path.resolve(import.meta.dirname, "../../client/dist")
    : undefined;
const server = http.createServer(createApp({ clientDir }));
server.listen(config.PORT, () => {
  console.log(`F1 dashboard server listening on :${config.PORT}`);
});
```

- [ ] **Step 7: Run the test and typecheck**

Run: `npm test -w server && npm run typecheck -w server`
Expected: 1 test PASS; typecheck prints nothing.

- [ ] **Step 8: Smoke-run the server**

```bash
cp .env.example .env    # then set JWT_SECRET to the output of: openssl rand -hex 32
docker compose up -d mongo   # or put an Atlas connection string in MONGODB_URI instead
npm run dev:server
```

In another terminal: `curl -s localhost:3000/api/health` → `{"ok":true}`. Stop the server (Ctrl-C).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore .env.example docker-compose.yml shared server
git commit -m "chore: scaffold monorepo with shared types and Express health endpoint"
```

---

### Task 2: Error handling and validation middleware

**Files:**

- Create: `server/src/errors.ts`, `server/src/middleware/errorHandler.ts`, `server/src/middleware/validate.ts`, `server/src/schemas.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/errors.test.ts`

**Interfaces:**

- Produces:
  - `class AppError extends Error { status: number; code: string }` — `new AppError(404, 'NOT_FOUND', 'msg')`
  - `notFound: RequestHandler`, `errorHandler: ErrorRequestHandler`
  - `validate({ params?, query?, body? }: ZodType each): RequestHandler` — parsed values land in `res.locals.params`, `res.locals.query`, `res.locals.body` (Express 5's `req.query` is read-only)
  - `yearSchema` (accepts `current` or 1950…this year, outputs a number), `idSchema` (`/^[a-z0-9_]{1,64}$/`)

- [ ] **Step 1: Write the failing tests**

`server/test/errors.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../src/errors.ts";
import { errorHandler, notFound } from "../src/middleware/errorHandler.ts";
import { validate } from "../src/middleware/validate.ts";
import { yearSchema } from "../src/schemas.ts";

function testApp() {
  const app = express();
  app.use(express.json());
  app.get("/app-error", () => {
    throw new AppError(418, "TEAPOT", "I am a teapot");
  });
  app.get("/crash", async () => {
    throw new Error("secret internal detail");
  });
  app.get(
    "/year/:year",
    validate({ params: z.object({ year: yearSchema }) }),
    (_req, res) => {
      res.json(res.locals.params);
    },
  );
  app.post("/echo", (req, res) => {
    res.json(req.body);
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe("error handling", () => {
  it("turns AppError into the JSON error shape", async () => {
    const res = await request(testApp()).get("/app-error");
    expect(res.status).toBe(418);
    expect(res.body).toEqual({
      error: { code: "TEAPOT", message: "I am a teapot" },
    });
  });

  it("hides unknown error details behind a generic 500", async () => {
    const res = await request(testApp()).get("/crash");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(testApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 BAD_JSON for a malformed body", async () => {
    const res = await request(testApp())
      .post("/echo")
      .set("content-type", "application/json")
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_JSON");
  });
});

describe("yearSchema via validate()", () => {
  const thisYear = new Date().getUTCFullYear();

  it('resolves "current" to this year', async () => {
    const res = await request(testApp()).get("/year/current");
    expect(res.body).toEqual({ year: thisYear });
  });

  it("accepts a past season as a number", async () => {
    const res = await request(testApp()).get("/year/2021");
    expect(res.body).toEqual({ year: 2021 });
  });

  it.each(["abc", "1949", String(thisYear + 1), "2020.5"])(
    "rejects %s with 400 VALIDATION",
    async (year) => {
      const res = await request(testApp()).get(`/year/${year}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION");
    },
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- errors`
Expected: FAIL, cannot find module `../src/errors.ts`.

- [ ] **Step 3: Implement**

`server/src/errors.ts`:

```ts
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
```

`server/src/middleware/errorHandler.ts`:

```ts
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors.ts";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    res.status(400).json({ error: { code: "VALIDATION", message } });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res
      .status(400)
      .json({ error: { code: "BAD_JSON", message: "Malformed JSON body" } });
    return;
  }
  console.error(err);
  res
    .status(500)
    .json({ error: { code: "INTERNAL", message: "Something went wrong" } });
};
```

`server/src/middleware/validate.ts`:

```ts
import type { RequestHandler } from "express";
import type { ZodType } from "zod";

/** Parses params/query/body with zod; results go to res.locals because Express 5's req.query is read-only. */
export function validate(schemas: {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}): RequestHandler {
  return (req, res, next) => {
    res.locals.params = schemas.params
      ? schemas.params.parse(req.params)
      : req.params;
    res.locals.query = schemas.query
      ? schemas.query.parse(req.query)
      : req.query;
    res.locals.body = schemas.body ? schemas.body.parse(req.body) : req.body;
    next();
  };
}
```

`server/src/schemas.ts`:

```ts
import { z } from "zod";

const thisYear = () => new Date().getUTCFullYear();

export const yearSchema = z
  .union([
    z.literal("current").transform(() => thisYear()),
    z.coerce.number().int().min(1950),
  ])
  .refine((y) => y <= thisYear(), { message: "Season is in the future" });

export const idSchema = z.string().regex(/^[a-z0-9_]{1,64}$/, "Invalid id");
```

Modify `server/src/app.ts`: add the imports and register the 404 + error handler last:

```ts
import { errorHandler, notFound } from "./middleware/errorHandler.ts";
```

and, just before `return app;`:

```ts
app.use("/api", notFound);
app.use(errorHandler);
```

- [ ] **Step 4: Run tests**

Run: `npm test -w server`
Expected: all PASS (health + errors).

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): JSON error handling and zod validation middleware"
```

---

### Task 3: Rate-limited request queue

**Files:**

- Create: `server/src/services/queue.ts`
- Test: `server/test/queue.test.ts`

**Interfaces:**

- Produces:
  - `class HttpError extends Error { status: number; retryAfterMs: number | null }`
  - `fetchJson<T>(url: string): Promise<T>` — throws `HttpError` on non-2xx, 15 s timeout
  - `createQueue(opts: QueueOptions): { run<T>(key: string, task: () => Promise<T>): Promise<T> }` — limits task _starts_ to `perSecond` per 1 s and `perWindow` per `windowMs`; concurrent `run` calls with the same `key` share one promise; on `HttpError` 429 it retries up to `retries` (default 3) times, waiting `Retry-After` or 1 s / 2 s / 4 s.

- [ ] **Step 1: Write the failing tests**

`server/test/queue.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createQueue, HttpError } from "../src/services/queue.ts";

/** A fake clock: sleep() advances time instantly so tests run fast and deterministically. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

describe("createQueue", () => {
  it("limits starts per second and per window", async () => {
    const clock = fakeClock();
    const q = createQueue({
      perSecond: 3,
      perWindow: 5,
      windowMs: 60_000,
      ...clock,
    });
    const starts: number[] = [];
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        q.run(`k${i}`, async () => void starts.push(clock.now())),
      ),
    );
    expect(starts.slice(0, 3)).toEqual([0, 0, 0]);
    expect(starts[3]).toBeGreaterThanOrEqual(1000); // 4th waits for the per-second limit
    expect(starts[5]).toBeGreaterThanOrEqual(60_000); // 6th waits for the window
  });

  it("shares one in-flight promise per key", async () => {
    const q = createQueue({
      perSecond: 10,
      perWindow: 100,
      windowMs: 60_000,
      ...fakeClock(),
    });
    const task = vi.fn(async () => 42);
    const [a, b] = await Promise.all([
      q.run("same", task),
      q.run("same", task),
    ]);
    expect([a, b]).toEqual([42, 42]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs the same key again once the first call has settled", async () => {
    const q = createQueue({
      perSecond: 10,
      perWindow: 100,
      windowMs: 60_000,
      ...fakeClock(),
    });
    const task = vi.fn(async () => 1);
    await q.run("k", task);
    await q.run("k", task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 using Retry-After, then succeeds", async () => {
    const clock = fakeClock();
    const q = createQueue({
      perSecond: 10,
      perWindow: 100,
      windowMs: 60_000,
      ...clock,
    });
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(429, 5000, "slow down"))
      .mockResolvedValueOnce("ok");
    await expect(q.run("k", task)).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(2);
    expect(clock.now()).toBeGreaterThanOrEqual(5000);
  });

  it("gives up after the retry budget", async () => {
    const q = createQueue({
      perSecond: 10,
      perWindow: 100,
      windowMs: 60_000,
      retries: 2,
      ...fakeClock(),
    });
    const task = vi.fn(async () => {
      throw new HttpError(429, null, "slow down");
    });
    await expect(q.run("k", task)).rejects.toBeInstanceOf(HttpError);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const q = createQueue({
      perSecond: 10,
      perWindow: 100,
      windowMs: 60_000,
      ...fakeClock(),
    });
    const task = vi.fn(async () => {
      throw new HttpError(500, null, "boom");
    });
    await expect(q.run("k", task)).rejects.toThrow("boom");
    expect(task).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- queue`
Expected: FAIL, cannot find module `../src/services/queue.ts`.

- [ ] **Step 3: Implement**

`server/src/services/queue.ts`:

```ts
export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, retryAfterMs: number | null, message: string) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new HttpError(
      res.status,
      retryAfter > 0 ? retryAfter * 1000 : null,
      `${res.status} from ${url}`,
    );
  }
  return (await res.json()) as T;
}

export interface QueueOptions {
  perSecond: number;
  perWindow: number;
  windowMs: number;
  retries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createQueue(opts: QueueOptions) {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retries = opts.retries ?? 3;
  const starts: number[] = []; // start times inside the current window, oldest first
  const inflight = new Map<string, Promise<unknown>>();
  let slotChain: Promise<void> = Promise.resolve();

  async function takeSlot(): Promise<void> {
    for (;;) {
      const t = now();
      while (starts.length > 0 && t - starts[0]! >= opts.windowMs)
        starts.shift();
      const lastSecond = starts.filter((s) => t - s < 1000);
      if (
        starts.length < opts.perWindow &&
        lastSecond.length < opts.perSecond
      ) {
        starts.push(t);
        return;
      }
      const waitWindow =
        starts.length >= opts.perWindow ? starts[0]! + opts.windowMs - t : 0;
      const waitSecond =
        lastSecond.length >= opts.perSecond ? lastSecond[0]! + 1000 - t : 0;
      await sleep(Math.max(waitWindow, waitSecond, 1));
    }
  }

  // Slots are handed out one at a time so concurrent callers can't overshoot the limits.
  function nextSlot(): Promise<void> {
    const slot = slotChain.then(takeSlot);
    slotChain = slot.catch(() => {});
    return slot;
  }

  function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = (async () => {
      for (let attempt = 0; ; attempt++) {
        await nextSlot();
        try {
          return await task();
        } catch (err) {
          if (
            err instanceof HttpError &&
            err.status === 429 &&
            attempt < retries
          ) {
            await sleep(err.retryAfterMs ?? 1000 * 2 ** attempt);
            continue;
          }
          throw err;
        }
      }
    })().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  return { run };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w server -- queue`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): rate-limited upstream queue with dedup and 429 backoff"
```

---

### Task 4: Jolpica client and transforms

**Files:**

- Create: `server/src/services/jolpica.transform.ts`, `server/src/services/jolpica.ts`
- Create fixtures: `server/test/fixtures/jolpica/*.json`
- Test: `server/test/jolpica.transform.test.ts`

**Interfaces:**

- Consumes: `createQueue`, `fetchJson` (Task 3).
- Produces:
  - `type MRData` (raw Jolpica envelope), `toRace(r): Race`, `toResultEntry(x): ResultEntry`, `toRaceResults(pages: MRData[], type: ResultType): RaceResult[]`, `toStandings(pages: MRData[], kind: StandingsKind): Standings | null`, `toDriver(d): Driver`, `toTeam(c): Team`
  - `jolpica.schedule(season): Promise<Race[]>`, `jolpica.results(season, round, type): Promise<RaceResult | null>`, `jolpica.seasonResults(season, type): Promise<RaceResult[]>`, `jolpica.standings(season, kind): Promise<Standings | null>`, `jolpica.drivers(season): Promise<Driver[]>`, `jolpica.teams(season): Promise<Team[]>`

- [ ] **Step 1: Save real API responses as fixtures**

```bash
mkdir -p server/test/fixtures/jolpica && cd server/test/fixtures/jolpica
J=https://api.jolpi.ca/ergast/f1
curl -s "$J/2025.json?limit=100" -o 2025-schedule.json
curl -s "$J/2025/1/results.json?limit=100" -o 2025-1-results.json
curl -s "$J/2025/1/qualifying.json?limit=100" -o 2025-1-qualifying.json
curl -s "$J/2025/2/sprint.json?limit=100" -o 2025-2-sprint.json
curl -s "$J/2025/driverstandings.json?limit=100" -o 2025-driverstandings.json
curl -s "$J/2025/constructorstandings.json?limit=100" -o 2025-constructorstandings.json
curl -s "$J/2025/drivers.json?limit=100" -o 2025-drivers.json
curl -s "$J/2025/constructors.json?limit=100" -o 2025-constructors.json
cd -
```

Expected: 8 files, each starting with `{"MRData":`. Values the tests rely on (checked 2026-10-15): round 1 Australian GP won by Norris (NOR, McLaren) from grid 1, 57 laps, `1:42:06.304`, fastest lap `1:22.167`, 25 points; Norris's Q3 in round 1 `1:15.096`; round 2 sprint won by Hamilton, 8 points; 24 races in 2025, round 2 (Chinese GP) has a Sprint at `2025-03-22T03:00:00Z`; final driver standings after round 24: Norris 423 points, 7 wins; constructors: McLaren 833 points, 14 wins.

- [ ] **Step 2: Write the failing tests**

`server/test/jolpica.transform.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type MRData,
  toDriver,
  toRace,
  toRaceResults,
  toStandings,
  toTeam,
} from "../src/services/jolpica.transform.ts";

const fixture = (name: string): MRData =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/jolpica/${name}.json`, import.meta.url),
      "utf8",
    ),
  ).MRData;

describe("toRace", () => {
  const races = fixture("2025-schedule").RaceTable!.Races.map(toRace);

  it("maps the season schedule", () => {
    expect(races).toHaveLength(24);
    expect(races[0]).toMatchObject({
      season: 2025,
      round: 1,
      name: "Australian Grand Prix",
      circuit: {
        id: "albert_park",
        locality: "Melbourne",
        country: "Australia",
      },
    });
  });

  it("includes sprint sessions, sorted by time, ending with the race", () => {
    const china = races[1]!;
    expect(china.sessions.map((s) => s.type)).toEqual([
      "fp1",
      "sprintQualifying",
      "sprint",
      "qualifying",
      "race",
    ]);
    expect(china.sessions.find((s) => s.type === "sprint")?.startsAt).toBe(
      "2025-03-22T03:00:00Z",
    );
  });
});

describe("toRaceResults", () => {
  it("maps race results", () => {
    const [r] = toRaceResults([fixture("2025-1-results")], "race");
    expect(r).toMatchObject({
      season: 2025,
      round: 1,
      type: "race",
      raceName: "Australian Grand Prix",
    });
    expect(r!.entries).toHaveLength(20);
    expect(r!.entries[0]).toMatchObject({
      position: 1,
      driverId: "norris",
      driverCode: "NOR",
      driverName: "Lando Norris",
      teamId: "mclaren",
      teamName: "McLaren",
      grid: 1,
      laps: 57,
      points: 25,
      time: "1:42:06.304",
      fastestLap: "1:22.167",
    });
  });

  it("maps qualifying times", () => {
    const [r] = toRaceResults([fixture("2025-1-qualifying")], "qualifying");
    expect(r!.entries[0]).toMatchObject({
      driverId: "norris",
      q3: "1:15.096",
      points: 0,
    });
  });

  it("maps sprint results", () => {
    const [r] = toRaceResults([fixture("2025-2-sprint")], "sprint");
    expect(r!.entries[0]).toMatchObject({
      driverId: "hamilton",
      position: 1,
      points: 8,
    });
  });

  it("merges a race split across two pages", () => {
    const full = fixture("2025-1-results");
    const race = full.RaceTable!.Races[0]!;
    const page1: MRData = {
      ...full,
      RaceTable: { Races: [{ ...race, Results: race.Results!.slice(0, 12) }] },
    };
    const page2: MRData = {
      ...full,
      RaceTable: { Races: [{ ...race, Results: race.Results!.slice(12) }] },
    };
    const results = toRaceResults([page1, page2], "race");
    expect(results).toHaveLength(1);
    expect(results[0]!.entries).toHaveLength(20);
  });
});

describe("toStandings", () => {
  it("maps driver standings", () => {
    const s = toStandings([fixture("2025-driverstandings")], "driver");
    expect(s).toMatchObject({ season: 2025, afterRound: 24, kind: "driver" });
    expect(s!.entries[0]).toMatchObject({
      position: 1,
      id: "norris",
      name: "Lando Norris",
      code: "NOR",
      points: 423,
      wins: 7,
      teamId: "mclaren",
    });
  });

  it("maps constructor standings", () => {
    const s = toStandings(
      [fixture("2025-constructorstandings")],
      "constructor",
    );
    expect(s!.entries[0]).toMatchObject({
      position: 1,
      id: "mclaren",
      name: "McLaren",
      points: 833,
      wins: 14,
      code: null,
    });
  });

  it("returns null when there are no standings yet", () => {
    expect(
      toStandings(
        [{ total: "0", StandingsTable: { StandingsLists: [] } }],
        "driver",
      ),
    ).toBeNull();
  });
});

describe("toDriver / toTeam", () => {
  it("maps drivers and teams", () => {
    const d = fixture("2025-drivers").DriverTable!.Drivers.map(toDriver);
    expect(d.find((x) => x.driverId === "albon")).toEqual({
      driverId: "albon",
      code: "ALB",
      number: 23,
      givenName: "Alexander",
      familyName: "Albon",
      nationality: "Thai",
      dateOfBirth: "1996-03-23",
    });
    const t =
      fixture("2025-constructors").ConstructorTable!.Constructors.map(toTeam);
    expect(t.find((x) => x.teamId === "alpine")).toEqual({
      teamId: "alpine",
      name: "Alpine F1 Team",
      nationality: "French",
      colour: null,
    });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -w server -- jolpica`
Expected: FAIL, cannot find module `../src/services/jolpica.transform.ts`.

- [ ] **Step 4: Implement the transforms**

`server/src/services/jolpica.transform.ts`:

```ts
import type {
  Driver,
  Race,
  RaceResult,
  ResultEntry,
  ResultType,
  SessionTime,
  SessionType,
  StandingEntry,
  Standings,
  StandingsKind,
  Team,
} from "@f1/shared";

// Minimal shapes of the Jolpica (Ergast-compatible) JSON that we read.
export interface JDriver {
  driverId: string;
  permanentNumber?: string;
  code?: string;
  givenName: string;
  familyName: string;
  dateOfBirth?: string;
  nationality: string;
}
export interface JConstructor {
  constructorId: string;
  name: string;
  nationality: string;
}
interface JWhen {
  date: string;
  time?: string;
}
export interface JResult {
  number?: string;
  position?: string;
  positionText?: string;
  points?: string;
  Driver: JDriver;
  Constructor: JConstructor;
  grid?: string;
  laps?: string;
  status?: string;
  Time?: { time: string };
  FastestLap?: { Time?: { time: string } };
  Q1?: string;
  Q2?: string;
  Q3?: string;
}
export interface JRace extends JWhen {
  season: string;
  round: string;
  raceName: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    Location: { lat: string; long: string; locality: string; country: string };
  };
  FirstPractice?: JWhen;
  SecondPractice?: JWhen;
  ThirdPractice?: JWhen;
  SprintShootout?: JWhen; // 2023 name for sprint qualifying
  SprintQualifying?: JWhen;
  Sprint?: JWhen;
  Qualifying?: JWhen;
  Results?: JResult[];
  SprintResults?: JResult[];
  QualifyingResults?: JResult[];
}
export interface JDriverStanding {
  position?: string;
  points: string;
  wins: string;
  Driver: JDriver;
  Constructors: JConstructor[];
}
export interface JConstructorStanding {
  position?: string;
  points: string;
  wins: string;
  Constructor: JConstructor;
}
export interface JStandingsList {
  season: string;
  round: string;
  DriverStandings?: JDriverStanding[];
  ConstructorStandings?: JConstructorStanding[];
}
export interface MRData {
  total: string;
  RaceTable?: { Races: JRace[] };
  StandingsTable?: { StandingsLists: JStandingsList[] };
  DriverTable?: { Drivers: JDriver[] };
  ConstructorTable?: { Constructors: JConstructor[] };
}

const int = (s: string | undefined): number | null =>
  s === undefined || s === "" || Number.isNaN(Number(s)) ? null : Number(s);
const iso = (w: JWhen): string => `${w.date}T${w.time ?? "00:00:00Z"}`;
const fullName = (d: JDriver): string => `${d.givenName} ${d.familyName}`;

const SESSION_KEYS: [keyof JRace, SessionType][] = [
  ["FirstPractice", "fp1"],
  ["SecondPractice", "fp2"],
  ["ThirdPractice", "fp3"],
  ["SprintShootout", "sprintQualifying"],
  ["SprintQualifying", "sprintQualifying"],
  ["Sprint", "sprint"],
  ["Qualifying", "qualifying"],
];

export function toRace(r: JRace): Race {
  const sessions: SessionTime[] = [];
  for (const [key, type] of SESSION_KEYS) {
    const when = r[key] as JWhen | undefined;
    if (when?.date) sessions.push({ type, startsAt: iso(when) });
  }
  sessions.push({ type: "race", startsAt: iso(r) });
  sessions.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const loc = r.Circuit.Location;
  return {
    season: Number(r.season),
    round: Number(r.round),
    name: r.raceName,
    circuit: {
      id: r.Circuit.circuitId,
      name: r.Circuit.circuitName,
      locality: loc.locality,
      country: loc.country,
      lat: Number(loc.lat),
      long: Number(loc.long),
    },
    sessions,
  };
}

export function toResultEntry(x: JResult): ResultEntry {
  return {
    position: int(x.position),
    positionText: x.positionText ?? x.position ?? "",
    number: int(x.number),
    driverId: x.Driver.driverId,
    driverCode: x.Driver.code ?? null,
    driverName: fullName(x.Driver),
    teamId: x.Constructor.constructorId,
    teamName: x.Constructor.name,
    grid: int(x.grid),
    laps: int(x.laps),
    status: x.status ?? null,
    points: Number(x.points ?? 0),
    time: x.Time?.time ?? null,
    fastestLap: x.FastestLap?.Time?.time ?? null,
    q1: x.Q1 ?? null,
    q2: x.Q2 ?? null,
    q3: x.Q3 ?? null,
  };
}

const RESULT_LIST = {
  race: "Results",
  sprint: "SprintResults",
  qualifying: "QualifyingResults",
} as const;

/** Jolpica paginates by result row, so one race can be split across pages: merge by round. */
export function toRaceResults(pages: MRData[], type: ResultType): RaceResult[] {
  const byRound = new Map<number, RaceResult>();
  for (const page of pages) {
    for (const r of page.RaceTable?.Races ?? []) {
      const round = Number(r.round);
      const merged = byRound.get(round) ?? {
        season: Number(r.season),
        round,
        type,
        raceName: r.raceName,
        entries: [],
      };
      merged.entries.push(...(r[RESULT_LIST[type]] ?? []).map(toResultEntry));
      byRound.set(round, merged);
    }
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

export function toStandings(
  pages: MRData[],
  kind: StandingsKind,
): Standings | null {
  const list = pages[0]?.StandingsTable?.StandingsLists[0];
  if (!list) return null;
  const entries: StandingEntry[] =
    kind === "driver"
      ? (list.DriverStandings ?? []).map((s) => {
          const team = s.Constructors.at(-1); // a driver who switched teams lists all of them; the last is current
          return {
            position: int(s.position),
            points: Number(s.points),
            wins: Number(s.wins),
            id: s.Driver.driverId,
            name: fullName(s.Driver),
            code: s.Driver.code ?? null,
            teamId: team?.constructorId ?? null,
            teamName: team?.name ?? null,
          };
        })
      : (list.ConstructorStandings ?? []).map((s) => ({
          position: int(s.position),
          points: Number(s.points),
          wins: Number(s.wins),
          id: s.Constructor.constructorId,
          name: s.Constructor.name,
          code: null,
          teamId: s.Constructor.constructorId,
          teamName: s.Constructor.name,
        }));
  return {
    season: Number(list.season),
    afterRound: Number(list.round),
    kind,
    entries,
  };
}

export const toDriver = (d: JDriver): Driver => ({
  driverId: d.driverId,
  code: d.code ?? null,
  number: int(d.permanentNumber),
  givenName: d.givenName,
  familyName: d.familyName,
  nationality: d.nationality,
  dateOfBirth: d.dateOfBirth ?? null,
});

export const toTeam = (c: JConstructor): Team => ({
  teamId: c.constructorId,
  name: c.name,
  nationality: c.nationality,
  colour: null,
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -w server -- jolpica`
Expected: all PASS. If a fixture value differs because Jolpica corrected historical data, update the expected value in the test to match the saved fixture (the fixture is the source of truth).

- [ ] **Step 6: Implement the paginated client**

`server/src/services/jolpica.ts`:

```ts
import type {
  Driver,
  Race,
  RaceResult,
  ResultType,
  Standings,
  StandingsKind,
  Team,
} from "@f1/shared";
import {
  type MRData,
  toDriver,
  toRace,
  toRaceResults,
  toStandings,
  toTeam,
} from "./jolpica.transform.ts";
import { createQueue, fetchJson } from "./queue.ts";

const BASE = "https://api.jolpi.ca/ergast/f1";
const PAGE = 100;
// Jolpica limits (docs/rate_limits.md): 4 requests/second burst, 500 requests/hour.
const queue = createQueue({
  perSecond: 4,
  perWindow: 500,
  windowMs: 3_600_000,
});

function page(path: string, offset: number): Promise<MRData> {
  const url = `${BASE}/${path}.json?limit=${PAGE}&offset=${offset}`;
  return queue.run(
    url,
    async () => (await fetchJson<{ MRData: MRData }>(url)).MRData,
  );
}

async function allPages(path: string): Promise<MRData[]> {
  const first = await page(path, 0);
  const pages = [first];
  for (let offset = PAGE; offset < Number(first.total); offset += PAGE)
    pages.push(await page(path, offset));
  return pages;
}

const RESULT_PATH: Record<ResultType, string> = {
  race: "results",
  sprint: "sprint",
  qualifying: "qualifying",
};

export const jolpica = {
  async schedule(season: number): Promise<Race[]> {
    return (await allPages(`${season}`))
      .flatMap((p) => p.RaceTable?.Races ?? [])
      .map(toRace);
  },
  async results(
    season: number,
    round: number,
    type: ResultType,
  ): Promise<RaceResult | null> {
    return (
      toRaceResults(
        await allPages(`${season}/${round}/${RESULT_PATH[type]}`),
        type,
      )[0] ?? null
    );
  },
  async seasonResults(season: number, type: ResultType): Promise<RaceResult[]> {
    return toRaceResults(
      await allPages(`${season}/${RESULT_PATH[type]}`),
      type,
    );
  },
  async standings(
    season: number,
    kind: StandingsKind,
  ): Promise<Standings | null> {
    const path = kind === "driver" ? "driverstandings" : "constructorstandings";
    return toStandings(await allPages(`${season}/${path}`), kind);
  },
  async drivers(season: number): Promise<Driver[]> {
    return (await allPages(`${season}/drivers`))
      .flatMap((p) => p.DriverTable?.Drivers ?? [])
      .map(toDriver);
  },
  async teams(season: number): Promise<Team[]> {
    return (await allPages(`${season}/constructors`))
      .flatMap((p) => p.ConstructorTable?.Constructors ?? [])
      .map(toTeam);
  },
};
```

- [ ] **Step 7: Live smoke check (optional, uses the real API)**

```bash
cd server && node -e "import('./src/services/jolpica.ts').then(async ({ jolpica }) => { const r = await jolpica.seasonResults(2025, 'race'); console.log(r.length, r[0].entries.length); })" && cd ..
```

Expected: `24 20` (24 rounds; merged across 5 pages).

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck -w server
git add server
git commit -m "feat(server): Jolpica client with pagination merge and transforms"
```

---

### Task 5: Mongo models and the cache layer

**Files:**

- Create: `server/src/models/Race.ts`, `RaceResult.ts`, `Standings.ts`, `Driver.ts`, `Team.ts`, `CacheMeta.ts`
- Create: `server/src/services/cache.ts`, `server/src/services/f1data.ts`
- Create: `server/test/db.ts`
- Test: `server/test/cache.test.ts`, `server/test/f1data.test.ts`

**Interfaces:**

- Consumes: `jolpica` (Task 4), `AppError` (Task 2).
- Produces:
  - `isStale(season: number, fetchedAt: Date, now: Date): boolean`
  - `interface CacheResult<T> { data: T; stale: boolean }`
  - `cachedQuery<T>({ season, load, fetch, save, now? }): Promise<CacheResult<T>>`
  - `f1data.schedule(season): Promise<CacheResult<Race[]>>`, `f1data.results(season, round, type): Promise<CacheResult<RaceResult | null>>`, `f1data.seasonResults(season, type): Promise<CacheResult<RaceResult[]>>`, `f1data.standings(season, kind): Promise<CacheResult<Standings | null>>`, `f1data.drivers(season): Promise<CacheResult<Driver[]>>`, `f1data.teams(season): Promise<CacheResult<Team[]>>`
  - Test helpers `startDb()`, `clearDb()`, `stopDb()`

- [ ] **Step 1: Write the failing cache tests**

`server/test/cache.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors.ts";
import { cachedQuery, isStale } from "../src/services/cache.ts";

const at = (iso: string) => new Date(iso);

describe("isStale", () => {
  const now = at("2026-10-15T12:00:00Z");

  it("never expires a past season fetched after it ended", () => {
    expect(isStale(2024, at("2025-01-10T00:00:00Z"), now)).toBe(false);
  });

  it("expires a past season that was fetched while it was still running", () => {
    expect(isStale(2025, at("2025-12-01T00:00:00Z"), now)).toBe(true);
  });

  it("expires current-season data after one hour", () => {
    expect(isStale(2026, at("2026-10-15T11:30:00Z"), now)).toBe(false);
    expect(isStale(2026, at("2026-10-15T10:59:00Z"), now)).toBe(true);
  });
});

describe("cachedQuery", () => {
  const now = () => at("2026-10-15T12:00:00Z");
  const fresh = { data: "cached", fetchedAt: at("2026-10-15T11:50:00Z") };
  const old = { data: "cached", fetchedAt: at("2026-10-15T09:00:00Z") };

  it("returns fresh cache without calling upstream", async () => {
    const fetch = vi.fn();
    const r = await cachedQuery({
      season: 2026,
      load: async () => fresh,
      fetch,
      save: vi.fn(),
      now,
    });
    expect(r).toEqual({ data: "cached", stale: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refetches and saves when the cache is stale", async () => {
    const save = vi.fn();
    const r = await cachedQuery({
      season: 2026,
      load: async () => old,
      fetch: async () => "new",
      save,
      now,
    });
    expect(r).toEqual({ data: "new", stale: false });
    expect(save).toHaveBeenCalledWith("new", now());
  });

  it("fetches when nothing is cached", async () => {
    const r = await cachedQuery({
      season: 2026,
      load: async () => null,
      fetch: async () => "new",
      save: vi.fn(),
      now,
    });
    expect(r).toEqual({ data: "new", stale: false });
  });

  it("serves the stale copy when upstream fails", async () => {
    const r = await cachedQuery({
      season: 2026,
      load: async () => old,
      fetch: async () => {
        throw new Error("down");
      },
      save: vi.fn(),
      now,
    });
    expect(r).toEqual({ data: "cached", stale: true });
  });

  it("throws 503 UPSTREAM_UNAVAILABLE when upstream fails and nothing is cached", async () => {
    const p = cachedQuery({
      season: 2026,
      load: async () => null,
      fetch: async () => {
        throw new Error("down");
      },
      save: vi.fn(),
      now,
    });
    await expect(p).rejects.toMatchObject({
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
    });
    await expect(p).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- cache`
Expected: FAIL, cannot find module `../src/services/cache.ts`.

- [ ] **Step 3: Implement the cache layer**

`server/src/services/cache.ts`:

```ts
import { AppError } from "../errors.ts";

const HOUR = 3_600_000;

/** A past season fetched after it ended never changes; anything else is refreshed hourly. */
export function isStale(season: number, fetchedAt: Date, now: Date): boolean {
  if (season < now.getUTCFullYear() && fetchedAt.getUTCFullYear() > season)
    return false;
  return now.getTime() - fetchedAt.getTime() > HOUR;
}

export interface CacheResult<T> {
  data: T;
  stale: boolean;
}

export async function cachedQuery<T>(opts: {
  season: number;
  load: () => Promise<{ data: T; fetchedAt: Date } | null>;
  fetch: () => Promise<T>;
  save: (data: T, fetchedAt: Date) => Promise<void>;
  now?: () => Date;
}): Promise<CacheResult<T>> {
  const now = (opts.now ?? (() => new Date()))();
  const cached = await opts.load();
  if (cached && !isStale(opts.season, cached.fetchedAt, now))
    return { data: cached.data, stale: false };

  let fresh: T;
  try {
    fresh = await opts.fetch();
  } catch (err) {
    if (cached) {
      console.warn(
        "Upstream failed, serving stale cache:",
        (err as Error).message,
      );
      return { data: cached.data, stale: true };
    }
    throw new AppError(
      503,
      "UPSTREAM_UNAVAILABLE",
      "The F1 data source is unavailable right now. Please try again shortly.",
    );
  }
  await opts.save(fresh, now);
  return { data: fresh, stale: false };
}
```

- [ ] **Step 4: Run cache tests**

Run: `npm test -w server -- cache`
Expected: 8 PASS.

- [ ] **Step 5: Models**

`server/src/models/Race.ts`:

```ts
import type { Race } from "@f1/shared";
import { model, Schema } from "mongoose";

const RaceSchema = new Schema<Race>({
  season: { type: Number, required: true },
  round: { type: Number, required: true },
  name: { type: String, required: true },
  circuit: {
    type: new Schema(
      {
        id: String,
        name: String,
        locality: String,
        country: String,
        lat: Number,
        long: Number,
      },
      { _id: false },
    ),
    required: true,
  },
  sessions: [
    new Schema(
      {
        type: { type: String, required: true },
        startsAt: { type: String, required: true },
      },
      { _id: false },
    ),
  ],
});
RaceSchema.index({ season: 1, round: 1 }, { unique: true });

export const RaceModel = model<Race>("Race", RaceSchema);
```

`server/src/models/RaceResult.ts`:

```ts
import type { RaceResult } from "@f1/shared";
import { model, Schema } from "mongoose";

const EntrySchema = new Schema(
  {
    position: Number,
    positionText: String,
    number: Number,
    driverId: { type: String, required: true },
    driverCode: String,
    driverName: String,
    teamId: { type: String, required: true },
    teamName: String,
    grid: Number,
    laps: Number,
    status: String,
    points: { type: Number, default: 0 },
    time: String,
    fastestLap: String,
    q1: String,
    q2: String,
    q3: String,
  },
  { _id: false },
);

const RaceResultSchema = new Schema<RaceResult>({
  season: { type: Number, required: true },
  round: { type: Number, required: true },
  type: {
    type: String,
    enum: ["race", "sprint", "qualifying"],
    required: true,
  },
  raceName: { type: String, required: true },
  entries: [EntrySchema],
});
RaceResultSchema.index({ season: 1, round: 1, type: 1 }, { unique: true });

export const RaceResultModel = model<RaceResult>(
  "RaceResult",
  RaceResultSchema,
);
```

`server/src/models/Standings.ts`:

```ts
import type { Standings } from "@f1/shared";
import { model, Schema } from "mongoose";

const StandingSchema = new Schema<Standings>({
  season: { type: Number, required: true },
  afterRound: { type: Number, required: true },
  kind: { type: String, enum: ["driver", "constructor"], required: true },
  entries: [
    new Schema(
      {
        position: Number,
        points: Number,
        wins: Number,
        id: String,
        name: String,
        code: String,
        teamId: String,
        teamName: String,
      },
      { _id: false },
    ),
  ],
});
StandingSchema.index({ season: 1, kind: 1 }, { unique: true });

export const StandingsModel = model<Standings>("Standings", StandingSchema);
```

`server/src/models/Driver.ts`:

```ts
import type { Driver } from "@f1/shared";
import { model, Schema } from "mongoose";

export type SeasonDriver = Driver & { season: number };

const DriverSchema = new Schema<SeasonDriver>({
  season: { type: Number, required: true },
  driverId: { type: String, required: true },
  code: String,
  number: Number,
  givenName: String,
  familyName: String,
  nationality: String,
  dateOfBirth: String,
});
DriverSchema.index({ season: 1, driverId: 1 }, { unique: true });

export const DriverModel = model<SeasonDriver>("Driver", DriverSchema);
```

`server/src/models/Team.ts`:

```ts
import type { Team } from "@f1/shared";
import { model, Schema } from "mongoose";

export type SeasonTeam = Team & { season: number };

const TeamSchema = new Schema<SeasonTeam>({
  season: { type: Number, required: true },
  teamId: { type: String, required: true },
  name: String,
  nationality: String,
  colour: { type: String, default: null },
});
TeamSchema.index({ season: 1, teamId: 1 }, { unique: true });

export const TeamModel = model<SeasonTeam>("Team", TeamSchema);
```

`server/src/models/CacheMeta.ts`:

```ts
import { model, Schema } from "mongoose";

// One row per upstream fetch (e.g. "schedule:2025"), recording when it was last fetched.
const CacheMetaSchema = new Schema({
  key: { type: String, required: true, unique: true },
  fetchedAt: { type: Date, required: true },
});

export const CacheMeta = model("CacheMeta", CacheMetaSchema);
```

- [ ] **Step 6: Test DB helper**

`server/test/db.ts`:

```ts
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | undefined;

export async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes
}

export async function clearDb() {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
}

export async function stopDb() {
  await mongoose.disconnect();
  await mongod?.stop();
}
```

- [ ] **Step 7: Write the failing f1data tests**

`server/test/f1data.test.ts`:

```ts
import { readFileSync } from "node:fs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CacheMeta } from "../src/models/CacheMeta.ts";
import { DriverModel } from "../src/models/Driver.ts";
import {
  type MRData,
  toDriver,
  toRace,
} from "../src/services/jolpica.transform.ts";
import { clearDb, startDb, stopDb } from "./db.ts";

vi.mock("../src/services/jolpica.ts", () => ({
  jolpica: {
    schedule: vi.fn(),
    results: vi.fn(),
    seasonResults: vi.fn(),
    standings: vi.fn(),
    drivers: vi.fn(),
    teams: vi.fn(),
  },
}));
const { jolpica } = await import("../src/services/jolpica.ts");
const { f1data } = await import("../src/services/f1data.ts");

const fixture = (name: string): MRData =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/jolpica/${name}.json`, import.meta.url),
      "utf8",
    ),
  ).MRData;
const schedule2025 = fixture("2025-schedule").RaceTable!.Races.map(toRace);
const drivers2025 = fixture("2025-drivers").DriverTable!.Drivers.map(toDriver);

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.mocked(jolpica.schedule).mockReset();
  vi.mocked(jolpica.drivers).mockReset();
});

describe("f1data", () => {
  it("fetches once, then serves from Mongo", async () => {
    vi.mocked(jolpica.schedule).mockResolvedValue(schedule2025);
    const first = await f1data.schedule(2025);
    const second = await f1data.schedule(2025);
    expect(first.data).toHaveLength(24);
    expect(second).toEqual({ data: first.data, stale: false });
    expect(second.data[0]).not.toHaveProperty("_id");
    expect(jolpica.schedule).toHaveBeenCalledTimes(1);
  });

  it("serves the stale copy with stale: true when Jolpica fails", async () => {
    vi.mocked(jolpica.drivers).mockResolvedValue(drivers2025);
    await f1data.drivers(2025);
    // pretend the cached copy is from mid-2025 so it counts as stale
    await CacheMeta.updateOne(
      { key: "drivers:2025" },
      { $set: { fetchedAt: new Date("2025-06-01T00:00:00Z") } },
    );
    vi.mocked(jolpica.drivers).mockRejectedValue(new Error("down"));
    const r = await f1data.drivers(2025);
    expect(r.stale).toBe(true);
    expect(r.data.length).toBe(drivers2025.length);
  });

  it("replaces a season list instead of duplicating it on refetch", async () => {
    vi.mocked(jolpica.drivers).mockResolvedValue(drivers2025);
    await f1data.drivers(2025);
    await CacheMeta.updateOne(
      { key: "drivers:2025" },
      { $set: { fetchedAt: new Date("2025-06-01T00:00:00Z") } },
    );
    vi.mocked(jolpica.drivers).mockResolvedValue(drivers2025.slice(0, 5));
    await f1data.drivers(2025);
    expect(await DriverModel.countDocuments({ season: 2025 })).toBe(5);
  });

  it('caches "no results yet" as null', async () => {
    vi.mocked(jolpica.results).mockResolvedValue(null);
    const r = await f1data.results(2026, 30, "race");
    expect(r.data).toBeNull();
  });
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `npm test -w server -- f1data`
Expected: FAIL, cannot find module `../src/services/f1data.ts`.

- [ ] **Step 9: Implement f1data**

`server/src/services/f1data.ts`:

```ts
import type {
  Driver,
  Race,
  RaceResult,
  ResultType,
  Standings,
  StandingsKind,
  Team,
} from "@f1/shared";
import type { Model } from "mongoose";
import { CacheMeta } from "../models/CacheMeta.ts";
import { DriverModel } from "../models/Driver.ts";
import { RaceModel } from "../models/Race.ts";
import { RaceResultModel } from "../models/RaceResult.ts";
import { StandingsModel } from "../models/Standings.ts";
import { TeamModel } from "../models/Team.ts";
import { type CacheResult, cachedQuery } from "./cache.ts";
import { jolpica } from "./jolpica.ts";

const HIDE = { _id: 0, __v: 0 } as const;

function withMeta<T>(
  key: string,
  season: number,
  load: () => Promise<T>,
  fetch: () => Promise<T>,
  save: (data: T) => Promise<void>,
): Promise<CacheResult<T>> {
  return cachedQuery({
    season,
    load: async () => {
      const meta = await CacheMeta.findOne({ key }).lean();
      return meta ? { data: await load(), fetchedAt: meta.fetchedAt } : null;
    },
    fetch,
    save: async (data, fetchedAt) => {
      await save(data);
      await CacheMeta.updateOne(
        { key },
        { $set: { fetchedAt } },
        { upsert: true },
      );
    },
  });
}

/** Upserts every doc by its key and deletes docs in `scope` that are no longer present. Safe to run concurrently. */
async function replaceAll<T extends object>(
  model: Model<T>,
  docs: T[],
  keyOf: (d: T) => Record<string, unknown>,
  scope: Record<string, unknown>,
) {
  if (docs.length === 0) {
    await model.deleteMany(scope);
    return;
  }
  await model.bulkWrite(
    docs.map((d) => ({
      replaceOne: { filter: keyOf(d), replacement: d, upsert: true },
    })) as never,
  );
  await model.deleteMany({ ...scope, $nor: docs.map(keyOf) });
}

export const f1data = {
  schedule: (season: number) =>
    withMeta<Race[]>(
      `schedule:${season}`,
      season,
      () => RaceModel.find({ season }, HIDE).sort({ round: 1 }).lean<Race[]>(),
      () => jolpica.schedule(season),
      (races) =>
        replaceAll(
          RaceModel,
          races,
          (r) => ({ season: r.season, round: r.round }),
          { season },
        ),
    ),

  results: (season: number, round: number, type: ResultType) =>
    withMeta<RaceResult | null>(
      `results:${season}:${round}:${type}`,
      season,
      async () =>
        (await RaceResultModel.findOne(
          { season, round, type },
          HIDE,
        ).lean<RaceResult>()) ?? null,
      () => jolpica.results(season, round, type),
      async (r) => {
        if (r)
          await RaceResultModel.replaceOne({ season, round, type }, r, {
            upsert: true,
          });
      },
    ),

  seasonResults: (season: number, type: ResultType) =>
    withMeta<RaceResult[]>(
      `seasonResults:${season}:${type}`,
      season,
      () =>
        RaceResultModel.find({ season, type }, HIDE)
          .sort({ round: 1 })
          .lean<RaceResult[]>(),
      () => jolpica.seasonResults(season, type),
      (list) =>
        replaceAll(
          RaceResultModel,
          list,
          (r) => ({ season: r.season, round: r.round, type: r.type }),
          { season, type },
        ),
    ),

  standings: (season: number, kind: StandingsKind) =>
    withMeta<Standings | null>(
      `standings:${season}:${kind}`,
      season,
      async () =>
        (await StandingsModel.findOne(
          { season, kind },
          HIDE,
        ).lean<Standings>()) ?? null,
      () => jolpica.standings(season, kind),
      async (s) => {
        if (s)
          await StandingsModel.replaceOne({ season, kind }, s, {
            upsert: true,
          });
      },
    ),

  drivers: (season: number) =>
    withMeta<Driver[]>(
      `drivers:${season}`,
      season,
      () =>
        DriverModel.find({ season }, { ...HIDE, season: 0 })
          .sort({ familyName: 1 })
          .lean<Driver[]>(),
      () => jolpica.drivers(season),
      (drivers) =>
        replaceAll(
          DriverModel,
          drivers.map((d) => ({ ...d, season })),
          (d) => ({ season, driverId: d.driverId }),
          { season },
        ),
    ),

  teams: (season: number) =>
    withMeta<Team[]>(
      `teams:${season}`,
      season,
      () =>
        TeamModel.find({ season }, { ...HIDE, season: 0 })
          .sort({ name: 1 })
          .lean<Team[]>(),
      () => jolpica.teams(season),
      (teams) =>
        replaceAll(
          TeamModel,
          teams.map((t) => ({ ...t, season })),
          (t) => ({ season, teamId: t.teamId }),
          { season },
        ),
    ),
};
```

- [ ] **Step 10: Run all server tests and typecheck**

Run: `npm test -w server && npm run typecheck -w server`
Expected: all PASS (first run may take a minute while mongodb-memory-server downloads MongoDB).

- [ ] **Step 11: Commit**

```bash
git add server
git commit -m "feat(server): Mongo models and cached data layer with stale fallback"
```

---

### Task 6: Season REST endpoints (schedule, results, standings, drivers, teams)

**Files:**

- Create: `server/src/controllers/send.ts`, `server/src/controllers/seasons.ts`, `server/src/routes/seasons.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/seasons.test.ts`

**Interfaces:**

- Consumes: `f1data` (Task 5), `validate`, `yearSchema`, `idSchema`, `AppError` (Task 2).
- Produces:
  - `send<T>(res: Response, result: CacheResult<T>): void` — sets `X-Data-Stale: true` when stale, then `res.json(data)`
  - `stale(...results: CacheResult<unknown>[]): boolean` — true if any is stale
  - `seasonsRouter(): Router` mounted at `/api/seasons`, serving:
    - `GET /:year/schedule` → `Race[]`
    - `GET /:year/races/:round/results?type=race|sprint|qualifying` → `RaceResult` (empty `entries` if not raced yet; 404 if the round isn't on the schedule)
    - `GET /:year/standings/drivers|constructors` → `Standings` (empty `entries` and `afterRound: 0` before the season starts)
    - `GET /:year/drivers` → `Driver[]`; `GET /:year/drivers/:driverId` → `DriverDetail`
    - `GET /:year/teams` → `Team[]`; `GET /:year/teams/:teamId` → `TeamDetail`

- [ ] **Step 1: Write the failing tests**

`server/test/seasons.test.ts`:

```ts
import { readFileSync } from "node:fs";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type MRData,
  toDriver,
  toRace,
  toRaceResults,
  toStandings,
  toTeam,
} from "../src/services/jolpica.transform.ts";
import { clearDb, startDb, stopDb } from "./db.ts";

vi.mock("../src/services/jolpica.ts", () => ({
  jolpica: {
    schedule: vi.fn(),
    results: vi.fn(),
    seasonResults: vi.fn(),
    standings: vi.fn(),
    drivers: vi.fn(),
    teams: vi.fn(),
  },
}));
const { jolpica } = await import("../src/services/jolpica.ts");
const { createApp } = await import("../src/app.ts");

const fixture = (name: string): MRData =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/jolpica/${name}.json`, import.meta.url),
      "utf8",
    ),
  ).MRData;
const schedule = fixture("2025-schedule").RaceTable!.Races.map(toRace);
const round1 = toRaceResults([fixture("2025-1-results")], "race");
const sprint2 = toRaceResults([fixture("2025-2-sprint")], "sprint");

const app = createApp();
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.mocked(jolpica.schedule).mockResolvedValue(schedule);
  vi.mocked(jolpica.results).mockImplementation(async (_s, round) =>
    round === 1 ? round1[0]! : null,
  );
  vi.mocked(jolpica.seasonResults).mockImplementation(async (_s, type) =>
    type === "race" ? round1 : sprint2,
  );
  vi.mocked(jolpica.standings).mockImplementation(async (_s, kind) =>
    toStandings(
      [
        fixture(
          kind === "driver"
            ? "2025-driverstandings"
            : "2025-constructorstandings",
        ),
      ],
      kind,
    ),
  );
  vi.mocked(jolpica.drivers).mockResolvedValue(
    fixture("2025-drivers").DriverTable!.Drivers.map(toDriver),
  );
  vi.mocked(jolpica.teams).mockResolvedValue(
    fixture("2025-constructors").ConstructorTable!.Constructors.map(toTeam),
  );
});

describe("season endpoints", () => {
  it("GET schedule", async () => {
    const res = await request(app).get("/api/seasons/2025/schedule");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(24);
    expect(res.headers["x-data-stale"]).toBeUndefined();
  });

  it("GET results for a raced round", async () => {
    const res = await request(app).get("/api/seasons/2025/races/1/results");
    expect(res.status).toBe(200);
    expect(res.body.entries[0].driverId).toBe("norris");
  });

  it("GET results for a round with no results yet returns empty entries", async () => {
    const res = await request(app).get(
      "/api/seasons/2025/races/24/results?type=sprint",
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      season: 2025,
      round: 24,
      type: "sprint",
      raceName: "Abu Dhabi Grand Prix",
      entries: [],
    });
  });

  it("GET results for a round not on the schedule is 404", async () => {
    const res = await request(app).get("/api/seasons/2025/races/25/results");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects bad input with 400", async () => {
    for (const path of [
      "/api/seasons/abc/schedule",
      "/api/seasons/2099/schedule",
      "/api/seasons/2025/races/1/results?type=practice",
      "/api/seasons/2025/drivers/BAD!",
    ]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });

  it("GET driver and constructor standings", async () => {
    const d = await request(app).get("/api/seasons/2025/standings/drivers");
    expect(d.body.entries[0]).toMatchObject({ id: "norris", points: 423 });
    const c = await request(app).get(
      "/api/seasons/2025/standings/constructors",
    );
    expect(c.body.entries[0]).toMatchObject({ id: "mclaren", points: 833 });
  });

  it("GET standings before a season starts returns an empty table", async () => {
    vi.mocked(jolpica.standings).mockResolvedValue(null);
    const res = await request(app).get(
      "/api/seasons/current/standings/drivers",
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      afterRound: 0,
      kind: "driver",
      entries: [],
    });
  });

  it("GET driver detail adds race + sprint points", async () => {
    const res = await request(app).get("/api/seasons/2025/drivers/hamilton");
    expect(res.status).toBe(200);
    const raceRow = round1[0]!.entries.find((e) => e.driverId === "hamilton")!;
    const sprintRow = sprint2[0]!.entries.find(
      (e) => e.driverId === "hamilton",
    )!;
    expect(res.body.driver.familyName).toBe("Hamilton");
    expect(res.body.results).toHaveLength(1);
    expect(res.body.totalPoints).toBe(raceRow.points + sprintRow.points);
    expect(res.body.teams.map((t: { teamId: string }) => t.teamId)).toEqual([
      "ferrari",
    ]);
  });

  it("GET unknown driver is 404", async () => {
    const res = await request(app).get("/api/seasons/2025/drivers/nobody");
    expect(res.status).toBe(404);
  });

  it("GET team detail lists its drivers and per-round points", async () => {
    const res = await request(app).get("/api/seasons/2025/teams/mclaren");
    expect(res.status).toBe(200);
    expect(
      res.body.drivers.map((d: { driverId: string }) => d.driverId).sort(),
    ).toEqual(["norris", "piastri"]);
    expect(res.body.results[0]).toMatchObject({ round: 1, bestPosition: 1 });
  });

  it("returns 503 JSON when Jolpica is down and nothing is cached", async () => {
    vi.mocked(jolpica.schedule).mockRejectedValue(new Error("down"));
    const res = await request(app).get("/api/seasons/2025/schedule");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- seasons`
Expected: FAIL (404s, since the router doesn't exist).

- [ ] **Step 3: Implement**

`server/src/controllers/send.ts`:

```ts
import type { Response } from "express";
import type { CacheResult } from "../services/cache.ts";

export const stale = (...results: CacheResult<unknown>[]): boolean =>
  results.some((r) => r.stale);

export function send<T>(res: Response, result: CacheResult<T>): void {
  if (result.stale) res.set("X-Data-Stale", "true");
  res.json(result.data);
}
```

`server/src/controllers/seasons.ts`:

```ts
import type {
  DriverDetail,
  ResultType,
  Standings,
  TeamDetail,
} from "@f1/shared";
import type { Request, Response } from "express";
import { AppError } from "../errors.ts";
import { f1data } from "../services/f1data.ts";
import { send, stale } from "./send.ts";

type P = {
  year: number;
  round: number;
  kind: "drivers" | "constructors";
  driverId: string;
  teamId: string;
};
const params = (res: Response) => res.locals.params as P;

export async function schedule(_req: Request, res: Response) {
  send(res, await f1data.schedule(params(res).year));
}

export async function results(_req: Request, res: Response) {
  const { year, round } = params(res);
  const { type } = res.locals.query as { type: ResultType };
  const r = await f1data.results(year, round, type);
  if (r.data) return send(res, r);
  const sched = await f1data.schedule(year);
  const race = sched.data.find((x) => x.round === round);
  if (!race)
    throw new AppError(
      404,
      "NOT_FOUND",
      `There is no round ${round} in ${year}`,
    );
  send(res, {
    data: { season: year, round, type, raceName: race.name, entries: [] },
    stale: stale(r, sched),
  });
}

export async function standings(_req: Request, res: Response) {
  const { year, kind } = params(res);
  const k = kind === "drivers" ? "driver" : "constructor";
  const s = await f1data.standings(year, k);
  const empty: Standings = {
    season: year,
    afterRound: 0,
    kind: k,
    entries: [],
  };
  send(res, { data: s.data ?? empty, stale: s.stale });
}

export async function drivers(_req: Request, res: Response) {
  send(res, await f1data.drivers(params(res).year));
}

export async function driver(_req: Request, res: Response) {
  const { year, driverId } = params(res);
  const [ds, races, sprints, teams] = await Promise.all([
    f1data.drivers(year),
    f1data.seasonResults(year, "race"),
    f1data.seasonResults(year, "sprint"),
    f1data.teams(year),
  ]);
  const d = ds.data.find((x) => x.driverId === driverId);
  if (!d)
    throw new AppError(404, "NOT_FOUND", `No driver "${driverId}" in ${year}`);

  const rows = races.data.flatMap((r) =>
    r.entries
      .filter((e) => e.driverId === driverId)
      .map((e) => ({
        round: r.round,
        raceName: r.raceName,
        position: e.position,
        positionText: e.positionText,
        points: e.points,
        grid: e.grid,
        status: e.status,
        teamId: e.teamId,
      })),
  );
  const sprintPoints = sprints.data
    .flatMap((r) => r.entries)
    .filter((e) => e.driverId === driverId)
    .reduce((sum, e) => sum + e.points, 0);
  const teamIds = new Set(rows.map((r) => r.teamId));
  const detail: DriverDetail = {
    season: year,
    driver: d,
    teams: teams.data.filter((t) => teamIds.has(t.teamId)),
    results: rows,
    totalPoints: rows.reduce((sum, r) => sum + r.points, 0) + sprintPoints,
  };
  send(res, { data: detail, stale: stale(ds, races, sprints, teams) });
}

export async function teams(_req: Request, res: Response) {
  send(res, await f1data.teams(params(res).year));
}

export async function team(_req: Request, res: Response) {
  const { year, teamId } = params(res);
  const [ts, races, sprints, ds] = await Promise.all([
    f1data.teams(year),
    f1data.seasonResults(year, "race"),
    f1data.seasonResults(year, "sprint"),
    f1data.drivers(year),
  ]);
  const t = ts.data.find((x) => x.teamId === teamId);
  if (!t)
    throw new AppError(404, "NOT_FOUND", `No team "${teamId}" in ${year}`);

  const sprintByRound = new Map(
    sprints.data.map((r) => [
      r.round,
      r.entries
        .filter((e) => e.teamId === teamId)
        .reduce((s, e) => s + e.points, 0),
    ]),
  );
  const driverIds = new Set<string>();
  const rows = races.data.map((r) => {
    const mine = r.entries.filter((e) => e.teamId === teamId);
    mine.forEach((e) => driverIds.add(e.driverId));
    const positions = mine
      .map((e) => e.position)
      .filter((p): p is number => p !== null);
    return {
      round: r.round,
      raceName: r.raceName,
      points:
        mine.reduce((s, e) => s + e.points, 0) +
        (sprintByRound.get(r.round) ?? 0),
      bestPosition: positions.length ? Math.min(...positions) : null,
    };
  });
  const detail: TeamDetail = {
    season: year,
    team: t,
    drivers: ds.data.filter((d) => driverIds.has(d.driverId)),
    results: rows,
    totalPoints: rows.reduce((s, r) => s + r.points, 0),
  };
  send(res, { data: detail, stale: stale(ts, races, sprints, ds) });
}
```

`server/src/routes/seasons.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import * as seasons from "../controllers/seasons.ts";
import { validate } from "../middleware/validate.ts";
import { idSchema, yearSchema } from "../schemas.ts";

export function seasonsRouter() {
  const r = Router();
  const Year = z.object({ year: yearSchema });

  r.get("/:year/schedule", validate({ params: Year }), seasons.schedule);
  r.get(
    "/:year/races/:round/results",
    validate({
      params: Year.extend({ round: z.coerce.number().int().min(1).max(40) }),
      query: z.object({
        type: z.enum(["race", "sprint", "qualifying"]).default("race"),
      }),
    }),
    seasons.results,
  );
  r.get(
    "/:year/standings/:kind",
    validate({
      params: Year.extend({ kind: z.enum(["drivers", "constructors"]) }),
    }),
    seasons.standings,
  );
  r.get("/:year/drivers", validate({ params: Year }), seasons.drivers);
  r.get(
    "/:year/drivers/:driverId",
    validate({ params: Year.extend({ driverId: idSchema }) }),
    seasons.driver,
  );
  r.get("/:year/teams", validate({ params: Year }), seasons.teams);
  r.get(
    "/:year/teams/:teamId",
    validate({ params: Year.extend({ teamId: idSchema }) }),
    seasons.team,
  );
  return r;
}
```

Modify `server/src/app.ts`: import and mount it after the health route:

```ts
import { seasonsRouter } from "./routes/seasons.ts";
```

```ts
app.use("/api/seasons", seasonsRouter());
```

- [ ] **Step 4: Run tests**

Run: `npm test -w server`
Expected: all PASS.

- [ ] **Step 5: Manual check against the real API**

With Mongo running and `npm run dev:server`:

```bash
curl -s localhost:3000/api/seasons/2025/standings/drivers | head -c 300; echo
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/seasons/2025/drivers/norris
```

Expected: JSON standings with Norris first; `200`.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): season schedule, results, standings, driver and team endpoints"
```

---

### Task 7: Accounts — register, login, logout, me, favourites, delete

**Files:**

- Create: `server/src/models/User.ts`, `server/src/middleware/auth.ts`, `server/src/controllers/auth.ts`, `server/src/controllers/users.ts`, `server/src/routes/auth.ts`, `server/src/routes/users.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/auth.test.ts`

**Interfaces:**

- Consumes: `config.JWT_SECRET`, `validate`, `idSchema`, `AppError`.
- Produces:
  - `UserModel`, `toPublicUser(doc): PublicUser`
  - `requireAuth: RequestHandler` (sets `res.locals.userId: string` or 401 `UNAUTHENTICATED`), `optionalAuth: RequestHandler` (sets `res.locals.userId: string | null`)
  - `POST /api/auth/register {email, password, displayName}` → 201 `{ user: PublicUser }` + cookie; 409 `EMAIL_TAKEN`
  - `POST /api/auth/login {email, password}` → 200 `{ user }` + cookie; 401 `INVALID_CREDENTIALS`
  - `POST /api/auth/logout` → 204, clears cookie
  - `GET /api/auth/me` → `{ user }` or 401
  - `PATCH /api/users/me {displayName?, favouriteDriverId?: string|null, favouriteTeamId?: string|null}` → `{ user }`
  - `DELETE /api/users/me` → 204, clears cookie

- [ ] **Step 1: Write the failing tests**

`server/test/auth.test.ts`:

```ts
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { clearDb, startDb, stopDb } from "./db.ts";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const fan = {
  email: "Fan@Example.com",
  password: "lights-out-2026",
  displayName: "Fan",
};

describe("auth", () => {
  it("registers, sets an httpOnly cookie and returns the public user", async () => {
    const res = await request(createApp()).post("/api/auth/register").send(fan);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: "fan@example.com",
      displayName: "Fan",
      favouriteDriverId: null,
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("rejects the same email in a different case with 409", async () => {
    const app = createApp();
    await request(app).post("/api/auth/register").send(fan);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...fan, email: "fan@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a short password and a bad email with 400", async () => {
    const app = createApp();
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({ ...fan, password: "short" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({ ...fan, email: "not-an-email" })
      ).status,
    ).toBe(400);
  });

  it("logs in case-insensitively and rejects a wrong password with the same generic error", async () => {
    const app = createApp();
    await request(app).post("/api/auth/register").send(fan);
    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: "FAN@example.com", password: fan.password });
    expect(ok.status).toBe(200);
    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: fan.email, password: "wrong-password" });
    const nobody = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(bad.body).toEqual(nobody.body);
  });

  it("/me works with the cookie and is 401 without it", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(fan);
    expect((await agent.get("/api/auth/me")).body.user.email).toBe(
      "fan@example.com",
    );
    const anon = await request(app).get("/api/auth/me");
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a tampered cookie", async () => {
    const res = await request(createApp())
      .get("/api/auth/me")
      .set("Cookie", "token=not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("logout clears the cookie", async () => {
    const agent = request.agent(createApp());
    await agent.post("/api/auth/register").send(fan);
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("updates favourites and display name", async () => {
    const agent = request.agent(createApp());
    await agent.post("/api/auth/register").send(fan);
    const res = await agent
      .patch("/api/users/me")
      .send({
        favouriteDriverId: "leclerc",
        favouriteTeamId: "ferrari",
        displayName: "Tifosi",
      });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      favouriteDriverId: "leclerc",
      favouriteTeamId: "ferrari",
      displayName: "Tifosi",
    });
    const cleared = await agent
      .patch("/api/users/me")
      .send({ favouriteDriverId: null });
    expect(cleared.body.user.favouriteDriverId).toBeNull();
    expect(
      (
        await agent
          .patch("/api/users/me")
          .send({ favouriteDriverId: "Bad Id!" })
      ).status,
    ).toBe(400);
  });

  it("PATCH and DELETE require login", async () => {
    const app = createApp();
    expect(
      (await request(app).patch("/api/users/me").send({ displayName: "x" }))
        .status,
    ).toBe(401);
    expect((await request(app).delete("/api/users/me")).status).toBe(401);
  });

  it("a deleted account's still-valid cookie no longer works", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send(fan);
    const cookie = reg.headers["set-cookie"] as unknown as string[];
    expect((await agent.delete("/api/users/me")).status).toBe(204);
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- auth`
Expected: FAIL (404s).

- [ ] **Step 3: Implement the model and middleware**

`server/src/models/User.ts`:

```ts
import type { PublicUser } from "@f1/shared";
import { model, Schema, type Types } from "mongoose";

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  displayName: string;
  favouriteDriverId: string | null;
  favouriteTeamId: string | null;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 40 },
    favouriteDriverId: { type: String, default: null },
    favouriteTeamId: { type: String, default: null },
  },
  { timestamps: true },
);

export const UserModel = model<UserDoc>("User", UserSchema);

export const toPublicUser = (u: UserDoc): PublicUser => ({
  id: u._id.toString(),
  email: u.email,
  displayName: u.displayName,
  favouriteDriverId: u.favouriteDriverId ?? null,
  favouriteTeamId: u.favouriteTeamId ?? null,
});
```

`server/src/middleware/auth.ts`:

```ts
import type { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.ts";
import { AppError } from "../errors.ts";

const COOKIE = "token";
const WEEK_MS = 7 * 24 * 3600 * 1000;
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

export function setAuthCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: WEEK_MS });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE, cookieOptions());
}

function readUserId(
  cookies: Record<string, unknown> | undefined,
): string | null {
  const token = cookies?.[COOKIE];
  if (typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return typeof payload === "object" && typeof payload.sub === "string"
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const userId = readUserId(req.cookies);
  if (!userId)
    return next(new AppError(401, "UNAUTHENTICATED", "Please log in"));
  res.locals.userId = userId;
  next();
};

export const optionalAuth: RequestHandler = (req, res, next) => {
  res.locals.userId = readUserId(req.cookies);
  next();
};
```

- [ ] **Step 4: Implement controllers and routes**

`server/src/controllers/auth.ts`:

```ts
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { AppError } from "../errors.ts";
import { clearAuthCookie, setAuthCookie } from "../middleware/auth.ts";
import { toPublicUser, UserModel } from "../models/User.ts";

const ROUNDS = 12;
// Compared against when the email doesn't exist, so both failure cases take the same time.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", ROUNDS);
const invalid = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");

export async function register(_req: Request, res: Response) {
  const { email, password, displayName } = res.locals.body as {
    email: string;
    password: string;
    displayName: string;
  };
  if (await UserModel.exists({ email }))
    throw new AppError(
      409,
      "EMAIL_TAKEN",
      "An account with this email already exists",
    );
  try {
    const user = await UserModel.create({
      email,
      displayName,
      passwordHash: await bcrypt.hash(password, ROUNDS),
    });
    setAuthCookie(res, user._id.toString());
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000)
      throw new AppError(
        409,
        "EMAIL_TAKEN",
        "An account with this email already exists",
      );
    throw err;
  }
}

export async function login(_req: Request, res: Response) {
  const { email, password } = res.locals.body as {
    email: string;
    password: string;
  };
  const user = await UserModel.findOne({ email }).select("+passwordHash");
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw invalid();
  setAuthCookie(res, user._id.toString());
  res.json({ user: toPublicUser(user) });
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.status(204).end();
}

export async function me(_req: Request, res: Response) {
  const user = await UserModel.findById(res.locals.userId);
  if (!user) {
    clearAuthCookie(res);
    throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  }
  res.json({ user: toPublicUser(user) });
}
```

`server/src/controllers/users.ts`:

```ts
import type { Request, Response } from "express";
import { AppError } from "../errors.ts";
import { clearAuthCookie } from "../middleware/auth.ts";
import { toPublicUser, UserModel } from "../models/User.ts";

export async function updateMe(_req: Request, res: Response) {
  const user = await UserModel.findByIdAndUpdate(
    res.locals.userId,
    { $set: res.locals.body },
    { new: true, runValidators: true },
  );
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  res.json({ user: toPublicUser(user) });
}

export async function deleteMe(_req: Request, res: Response) {
  await UserModel.findByIdAndDelete(res.locals.userId);
  clearAuthCookie(res);
  res.status(204).end();
}
```

`server/src/routes/auth.ts`:

```ts
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import * as auth from "../controllers/auth.ts";
import { requireAuth } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email"));
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);
const Login = z.object({ email, password });
const Register = Login.extend({
  displayName: z.string().trim().min(1).max(40),
});

export function authRouter() {
  const r = Router();
  // A new limiter per app instance keeps tests isolated.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  r.post("/register", limiter, validate({ body: Register }), auth.register);
  r.post("/login", limiter, validate({ body: Login }), auth.login);
  r.post("/logout", auth.logout);
  r.get("/me", requireAuth, auth.me);
  return r;
}
```

`server/src/routes/users.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import * as users from "../controllers/users.ts";
import { requireAuth } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { idSchema } from "../schemas.ts";

const UpdateMe = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    favouriteDriverId: idSchema.nullable(),
    favouriteTeamId: idSchema.nullable(),
  })
  .partial()
  .strict();

export function usersRouter() {
  const r = Router();
  r.patch("/me", requireAuth, validate({ body: UpdateMe }), users.updateMe);
  r.delete("/me", requireAuth, users.deleteMe);
  return r;
}
```

Modify `server/src/app.ts`: import and mount:

```ts
import { authRouter } from "./routes/auth.ts";
import { usersRouter } from "./routes/users.ts";
```

```ts
app.use("/api/auth", authRouter());
app.use("/api/users", usersRouter());
```

- [ ] **Step 5: Run tests**

Run: `npm test -w server && npm run typecheck -w server`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): JWT cookie auth, favourites and account deletion"
```

---

### Task 8: Home endpoint

**Files:**

- Create: `server/src/services/home.ts`, `server/src/controllers/home.ts`, `server/src/routes/home.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/home.test.ts`

**Interfaces:**

- Consumes: `f1data`, `optionalAuth`, `UserModel`, `send`, `stale`.
- Produces:
  - `buildHome(input: { season: number; schedule: Race[]; drivers: Standings | null; constructors: Standings | null; now: Date; user: { favouriteDriverId: string | null; favouriteTeamId: string | null } | null }): HomeData`
  - `GET /api/home` → `HomeData` (current season; `favourites` is `null` when logged out)

- [ ] **Step 1: Write the failing tests**

`server/test/home.test.ts`:

```ts
import { readFileSync } from "node:fs";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { buildHome } from "../src/services/home.ts";
import {
  type MRData,
  toRace,
  toStandings,
} from "../src/services/jolpica.transform.ts";
import { clearDb, startDb, stopDb } from "./db.ts";

const fixture = (name: string): MRData =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/jolpica/${name}.json`, import.meta.url),
      "utf8",
    ),
  ).MRData;
const schedule = fixture("2025-schedule").RaceTable!.Races.map(toRace);
const drivers = toStandings([fixture("2025-driverstandings")], "driver");
const constructors = toStandings(
  [fixture("2025-constructorstandings")],
  "constructor",
);

describe("buildHome", () => {
  const base = { season: 2025, schedule, drivers, constructors, user: null };

  it("finds the next session and race mid-season", () => {
    // Between the Chinese GP sprint (Mar 22 03:00Z) and qualifying (Mar 22 07:00Z)
    const h = buildHome({ ...base, now: new Date("2025-03-22T05:00:00Z") });
    expect(h.nextRace?.round).toBe(2);
    expect(h.nextSession).toMatchObject({
      round: 2,
      session: { type: "qualifying" },
    });
    expect(h.completedRounds).toBe(1);
    expect(h.totalRounds).toBe(24);
    expect(h.progressPct).toBeCloseTo(4.2, 1);
    expect(h.driverTop10).toHaveLength(10);
    expect(h.favourites).toBeNull();
    expect(h.fastestPitStop).toBeNull();
  });

  it("handles a finished season", () => {
    const h = buildHome({ ...base, now: new Date("2025-12-31T00:00:00Z") });
    expect(h.nextRace).toBeNull();
    expect(h.nextSession).toBeNull();
    expect(h.progressPct).toBe(100);
  });

  it("handles a season with no standings yet", () => {
    const h = buildHome({
      ...base,
      drivers: null,
      constructors: null,
      now: new Date("2025-01-01T00:00:00Z"),
    });
    expect(h.driverTop10).toEqual([]);
    expect(h.completedRounds).toBe(0);
  });

  it("looks up favourites for a logged-in user", () => {
    const h = buildHome({
      ...base,
      now: new Date("2025-12-31T00:00:00Z"),
      user: { favouriteDriverId: "leclerc", favouriteTeamId: null },
    });
    expect(h.favourites?.driver?.id).toBe("leclerc");
    expect(h.favourites?.team).toBeNull();
  });
});

vi.mock("../src/services/jolpica.ts", () => ({
  jolpica: {
    schedule: vi.fn(),
    results: vi.fn(),
    seasonResults: vi.fn(),
    standings: vi.fn(),
    drivers: vi.fn(),
    teams: vi.fn(),
  },
}));
const { jolpica } = await import("../src/services/jolpica.ts");
const { createApp } = await import("../src/app.ts");

describe("GET /api/home", () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await clearDb();
    vi.mocked(jolpica.schedule).mockResolvedValue(schedule);
    vi.mocked(jolpica.standings).mockImplementation(async (_s, kind) =>
      kind === "driver" ? drivers : constructors,
    );
  });

  it("works logged out", async () => {
    const res = await request(createApp()).get("/api/home");
    expect(res.status).toBe(200);
    expect(res.body.favourites).toBeNull();
    expect(res.body.driverTop10).toHaveLength(10);
  });

  it("includes favourites when logged in, and falls back to logged-out for a deleted account", async () => {
    const app = createApp();
    const agent = request.agent(app);
    const reg = await agent
      .post("/api/auth/register")
      .send({ email: "a@b.co", password: "password123", displayName: "A" });
    await agent.patch("/api/users/me").send({ favouriteDriverId: "norris" });
    expect((await agent.get("/api/home")).body.favourites.driver.id).toBe(
      "norris",
    );

    const cookie = reg.headers["set-cookie"] as unknown as string[];
    await agent.delete("/api/users/me");
    const res = await request(app).get("/api/home").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.favourites).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- home`
Expected: FAIL, cannot find module `../src/services/home.ts`.

- [ ] **Step 3: Implement**

`server/src/services/home.ts`:

```ts
import type { HomeData, NextSession, Race, Standings } from "@f1/shared";

const raceStart = (r: Race): number =>
  Date.parse(r.sessions.find((s) => s.type === "race")?.startsAt ?? "");

export function buildHome(input: {
  season: number;
  schedule: Race[];
  drivers: Standings | null;
  constructors: Standings | null;
  now: Date;
  user: {
    favouriteDriverId: string | null;
    favouriteTeamId: string | null;
  } | null;
}): HomeData {
  const now = input.now.getTime();
  const totalRounds = input.schedule.length;
  const completedRounds = input.schedule.filter(
    (r) => raceStart(r) <= now,
  ).length;

  let nextSession: NextSession | null = null;
  for (const r of input.schedule) {
    const s = r.sessions.find((x) => Date.parse(x.startsAt) > now);
    if (s) {
      nextSession = {
        raceName: r.name,
        round: r.round,
        country: r.circuit.country,
        session: s,
      };
      break;
    }
  }

  const driverEntries = input.drivers?.entries ?? [];
  const teamEntries = input.constructors?.entries ?? [];
  return {
    season: input.season,
    totalRounds,
    completedRounds,
    progressPct: totalRounds
      ? Math.round((completedRounds / totalRounds) * 1000) / 10
      : 0,
    nextRace: input.schedule.find((r) => raceStart(r) > now) ?? null,
    nextSession,
    driverTop10: driverEntries.slice(0, 10),
    constructorTop10: teamEntries.slice(0, 10),
    fastestPitStop: null,
    favourites: input.user
      ? {
          driver:
            driverEntries.find((e) => e.id === input.user!.favouriteDriverId) ??
            null,
          team:
            teamEntries.find((e) => e.id === input.user!.favouriteTeamId) ??
            null,
        }
      : null,
  };
}
```

`server/src/controllers/home.ts`:

```ts
import type { Request, Response } from "express";
import { UserModel } from "../models/User.ts";
import { f1data } from "../services/f1data.ts";
import { buildHome } from "../services/home.ts";
import { send, stale } from "./send.ts";

export async function home(_req: Request, res: Response) {
  const season = new Date().getUTCFullYear();
  const [schedule, drivers, constructors] = await Promise.all([
    f1data.schedule(season),
    f1data.standings(season, "driver"),
    f1data.standings(season, "constructor"),
  ]);
  const userId = res.locals.userId as string | null;
  const user = userId ? await UserModel.findById(userId).lean() : null;
  const data = buildHome({
    season,
    schedule: schedule.data,
    drivers: drivers.data,
    constructors: constructors.data,
    now: new Date(),
    user,
  });
  send(res, { data, stale: stale(schedule, drivers, constructors) });
}
```

`server/src/routes/home.ts`:

```ts
import { Router } from "express";
import { home } from "../controllers/home.ts";
import { optionalAuth } from "../middleware/auth.ts";

export function homeRouter() {
  const r = Router();
  r.get("/", optionalAuth, home);
  return r;
}
```

Modify `server/src/app.ts`:

```ts
import { homeRouter } from "./routes/home.ts";
```

```ts
app.use("/api/home", homeRouter());
```

- [ ] **Step 4: Run tests**

Run: `npm test -w server && npm run typecheck -w server`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): home endpoint with next session, progress, top 10 and favourites"
```

---

### Task 9: Client scaffold — Vite, routing, API client, layout

**Files:**

- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`
- Create: `client/src/main.tsx`, `client/src/App.tsx`, `client/src/index.css`
- Create: `client/src/lib/api.ts`, `client/src/lib/useApi.ts`, `client/src/lib/format.ts`, `client/src/lib/useSeason.ts`
- Create: `client/src/components/Layout.tsx`, `client/src/components/States.tsx`, `client/src/components/SeasonSelect.tsx`, `client/src/pages/NotFoundPage.tsx`
- Test: `client/test/api.test.ts`

**Interfaces:**

- Produces:
  - `class ApiError extends Error { status: number; code: string }`
  - `interface ApiResult<T> { data: T; stale: boolean }`
  - `api.get<T>(path)`, `api.post<T>(path, body?)`, `api.patch<T>(path, body)`, `api.del(path)` — `path` excludes the `/api` prefix; all return `Promise<ApiResult<T>>`; network failure → `ApiError(0, 'NETWORK', …)`
  - `useApi<T>(path: string): UseQueryResult<ApiResult<T>, Error>` (query key `[path]`)
  - `<QueryState q={...}>{(data, stale) => …}</QueryState>`, `<StaleBadge />`, `<ErrorState error onRetry />`, `<PageHeader title>{children}</PageHeader>`
  - `useSeason(): [number, (s: number) => void]` (from `?season=`, default this year), `<SeasonSelect value onChange />`
  - `formatDateTime(iso)`, `formatDate(iso)` (viewer's local time zone)

- [ ] **Step 1: Package, config and install**

`client/package.json`:

```json
{
  "name": "@f1/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  },
  "devDependencies": {
    "@f1/shared": "*"
  }
}
```

All client packages are devDependencies on purpose: they are bundled at build time, so the production image (`npm ci --omit=dev`) doesn't install them.

```bash
npm install -D -w client react@^19 react-dom@^19 react-router@^7.18 @tanstack/react-query@^5 vite@^8 @vitejs/plugin-react@^6 tailwindcss@^4 @tailwindcss/vite@^4 typescript@~5.9.3 vitest@^5 @types/react@^19 @types/react-dom@^19
```

`client/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

`client/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server proxies the API so the browser only ever talks to one origin (no CORS needed).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
  test: { environment: "node" },
});
```

`client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Unofficial Formula 1 fan dashboard: schedule, results, standings and race replays."
    />
    <title>F1 Dashboard</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`client/src/index.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: dark;
}
```

- [ ] **Step 2: Write the failing API client test**

`client/test/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers,
        }),
    ),
  );

describe("api", () => {
  it("returns data and the stale flag", async () => {
    respond(200, [1, 2], { "X-Data-Stale": "true" });
    await expect(api.get("/seasons/2025/schedule")).resolves.toEqual({
      data: [1, 2],
      stale: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/seasons/2025/schedule",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws ApiError with the server code and message", async () => {
    respond(409, { error: { code: "EMAIL_TAKEN", message: "Taken" } });
    await expect(api.post("/auth/register", {})).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_TAKEN",
      message: "Taken",
    });
  });

  it("handles a non-JSON error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>Bad gateway</html>", { status: 502 }),
      ),
    );
    await expect(api.get("/home")).rejects.toMatchObject({
      status: 502,
      code: "HTTP_502",
    });
  });

  it("turns a network failure into ApiError NETWORK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const err = await api.get("/home").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NETWORK");
  });

  it("handles 204 No Content", async () => {
    respond(204, undefined);
    await expect(api.del("/users/me")).resolves.toEqual({
      data: undefined,
      stale: false,
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w client`
Expected: FAIL, cannot find `../src/lib/api`.

- [ ] **Step 4: Implement the lib files**

`client/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ApiResult<T> {
  data: T;
  stale: boolean;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK",
      "Cannot reach the server. Check your connection and try again.",
    );
  }
  const stale = res.headers.get("x-data-stale") === "true";
  if (res.status === 204) return { data: undefined as T, stale };
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } } | null)
      ?.error;
    throw new ApiError(
      res.status,
      e?.code ?? `HTTP_${res.status}`,
      e?.message ?? `Request failed (${res.status})`,
    );
  }
  return { data: json as T, stale };
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: (path: string) => request<undefined>("DELETE", path),
};
```

`client/src/lib/useApi.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const useApi = <T>(path: string) =>
  useQuery({ queryKey: [path], queryFn: () => api.get<T>(path) });
```

`client/src/lib/format.ts`:

```ts
const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));

export const SESSION_LABEL: Record<string, string> = {
  fp1: "Practice 1",
  fp2: "Practice 2",
  fp3: "Practice 3",
  sprintQualifying: "Sprint Qualifying",
  sprint: "Sprint",
  qualifying: "Qualifying",
  race: "Race",
};
```

`client/src/lib/useSeason.ts`:

```ts
import { useSearchParams } from "react-router";

export const THIS_YEAR = new Date().getUTCFullYear();

export function useSeason(): [number, (s: number) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("season"));
  const season =
    Number.isInteger(raw) && raw >= 1950 && raw <= THIS_YEAR ? raw : THIS_YEAR;
  return [season, (s) => setParams((p) => (p.set("season", String(s)), p))];
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -w client`
Expected: 5 PASS.

- [ ] **Step 6: Components, app shell and entry**

`client/src/components/States.tsx`:

```tsx
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ApiResult } from "../lib/api";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

export function StaleBadge() {
  return (
    <p
      role="status"
      className="mb-4 inline-block rounded bg-amber-900/60 px-2 py-1 text-xs text-amber-200"
    >
      Showing saved data — the live source is unavailable, so this may be out of
      date.
    </p>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-900 bg-red-950/40 p-4"
    >
      <p className="mb-3">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded bg-red-600 px-3 py-1 text-sm font-medium hover:bg-red-500"
      >
        Try again
      </button>
    </div>
  );
}

export function Loading() {
  return (
    <p role="status" className="animate-pulse text-zinc-400">
      Loading…
    </p>
  );
}

export function QueryState<T>({
  q,
  children,
}: {
  q: UseQueryResult<ApiResult<T>, Error>;
  children: (data: T, stale: boolean) => ReactNode;
}) {
  if (q.isPending) return <Loading />;
  if (q.isError)
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      {q.data.stale && <StaleBadge />}
      {children(q.data.data, q.data.stale)}
    </>
  );
}
```

`client/src/components/SeasonSelect.tsx`:

```tsx
import { THIS_YEAR } from "../lib/useSeason";

const SEASONS = Array.from(
  { length: THIS_YEAR - 1949 },
  (_, i) => THIS_YEAR - i,
);

export function SeasonSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (s: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      Season
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
      >
        {SEASONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
```

`client/src/components/Layout.tsx` (the account link is completed in Task 13):

```tsx
import { useIsFetching } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";

const NAV = [
  ["/", "Home"],
  ["/schedule", "Schedule"],
  ["/standings/drivers", "Drivers’ standings"],
  ["/standings/constructors", "Constructors’ standings"],
  ["/drivers", "Drivers"],
  ["/teams", "Teams"],
] as const;

/** Render's free tier sleeps; the first request can take about a minute. */
function WakingBanner() {
  const fetching = useIsFetching() > 0;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!fetching) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [fetching]);
  if (!slow) return null;
  return (
    <p role="status" className="bg-zinc-800 px-4 py-2 text-center text-sm">
      Waking up the server… this can take up to a minute on the first visit.
    </p>
  );
}

export function Layout({ account }: { account?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-800">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3"
        >
          <span className="mr-4 font-black tracking-tight text-red-500">
            F1 DASHBOARD
          </span>
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `text-sm ${isActive ? "text-white underline decoration-red-600 underline-offset-8" : "text-zinc-400 hover:text-white"}`
              }
            >
              {label}
            </NavLink>
          ))}
          <div className="ml-auto">{account}</div>
        </nav>
      </header>
      <WakingBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-800 px-4 py-6 text-center text-xs text-zinc-500">
        Unofficial fan project. Not associated with Formula 1, the FIA or
        Formula One Management.
      </footer>
    </div>
  );
}
```

`client/src/pages/NotFoundPage.tsx`:

```tsx
import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <Link to="/" className="text-red-400 underline">
        Back to the home page
      </Link>
    </section>
  );
}
```

`client/src/App.tsx` (pages are added in Tasks 10–13; start with the 404 page only):

```tsx
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { Loading } from "./components/States";

const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
```

`client/src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ApiError } from "./lib/api";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry twice, but never on 4xx: those won't fix themselves.
      retry: (count, err) =>
        count < 2 &&
        !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: Typecheck, build and run**

```bash
npm run typecheck -w client && npm run build -w client
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2
```

Open `http://localhost:5173/anything`. Expected: header nav, "Page not found", footer disclaimer. `curl -s localhost:5173/api/health` → `{"ok":true}` (proxy works).

- [ ] **Step 8: Commit**

```bash
git add client package.json package-lock.json
git commit -m "feat(client): Vite React shell with API client, layout and query states"
```

---

### Task 10: Schedule, Results and Standings pages

**Files:**

- Create: `client/src/pages/SchedulePage.tsx`, `client/src/pages/ResultsPage.tsx`, `client/src/pages/StandingsPage.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**

- Consumes: `useApi`, `QueryState`, `PageHeader`, `useSeason`, `SeasonSelect`, `formatDate`, `formatDateTime`, `SESSION_LABEL` (Task 9); endpoints from Task 6.
- Produces: routes `/schedule`, `/results/:season/:round` (`?type=race|sprint|qualifying`), `/standings/drivers`, `/standings/constructors`.

- [ ] **Step 1: Schedule page**

`client/src/pages/SchedulePage.tsx`:

```tsx
import type { Race } from "@f1/shared";
import { Link } from "react-router";
import { SeasonSelect } from "../components/SeasonSelect";
import { PageHeader, QueryState } from "../components/States";
import { formatDateTime } from "../lib/format";
import { useApi } from "../lib/useApi";
import { useSeason } from "../lib/useSeason";

export default function SchedulePage() {
  const [season, setSeason] = useSeason();
  const q = useApi<Race[]>(`/seasons/${season}/schedule`);
  return (
    <section>
      <PageHeader title={`${season} schedule`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(races) =>
          races.length === 0 ? (
            <p className="text-zinc-400">
              No races published for {season} yet.
            </p>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {races.map((r) => {
                const start = r.sessions.find(
                  (s) => s.type === "race",
                )?.startsAt;
                const past = start ? Date.parse(start) < Date.now() : false;
                return (
                  <li key={r.round}>
                    <Link
                      to={`/results/${season}/${r.round}`}
                      className={`block h-full rounded-lg border p-4 hover:border-red-600 ${past ? "border-zinc-800 opacity-70" : "border-zinc-700"}`}
                    >
                      <p className="text-xs text-zinc-400">
                        Round {r.round}
                        {r.sessions.some((s) => s.type === "sprint") &&
                          " · Sprint weekend"}
                      </p>
                      <h2 className="font-semibold">{r.name}</h2>
                      <p className="text-sm text-zinc-400">
                        {r.circuit.locality}, {r.circuit.country}
                      </p>
                      {start && (
                        <p className="mt-2 text-sm">
                          <time dateTime={start}>{formatDateTime(start)}</time>
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )
        }
      </QueryState>
    </section>
  );
}
```

- [ ] **Step 2: Results page**

`client/src/pages/ResultsPage.tsx`:

```tsx
import type { RaceResult, ResultType } from "@f1/shared";
import { Link, useParams, useSearchParams } from "react-router";
import { PageHeader, QueryState } from "../components/States";
import { useApi } from "../lib/useApi";

const TYPES: [ResultType, string][] = [
  ["race", "Race"],
  ["sprint", "Sprint"],
  ["qualifying", "Qualifying"],
];

export default function ResultsPage() {
  const { season, round } = useParams();
  const [params, setParams] = useSearchParams();
  const type = (TYPES.find(([t]) => t === params.get("type"))?.[0] ??
    "race") as ResultType;
  const q = useApi<RaceResult>(
    `/seasons/${season}/races/${round}/results?type=${type}`,
  );

  return (
    <section>
      <Link
        to={`/schedule?season=${season}`}
        className="text-sm text-zinc-400 hover:text-white"
      >
        ← {season} schedule
      </Link>
      <QueryState q={q}>
        {(r) => (
          <>
            <PageHeader title={`${r.raceName} ${season}`} />
            <div
              role="tablist"
              aria-label="Session"
              className="mb-4 flex gap-2"
            >
              {TYPES.map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={t === type}
                  onClick={() => setParams({ type: t })}
                  className={`rounded px-3 py-1 text-sm ${t === type ? "bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {r.entries.length === 0 ? (
              <p className="text-zinc-400">No results yet for this session.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    {r.raceName} {type} results
                  </caption>
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="py-2 pr-3">Pos</th>
                      <th className="pr-3">Driver</th>
                      <th className="pr-3">Team</th>
                      {type === "qualifying" ? (
                        <>
                          <th className="pr-3">Q1</th>
                          <th className="pr-3">Q2</th>
                          <th className="pr-3">Q3</th>
                        </>
                      ) : (
                        <>
                          <th className="pr-3">Grid</th>
                          <th className="pr-3">Laps</th>
                          <th className="pr-3">Time / status</th>
                          <th className="pr-3 text-right">Pts</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {r.entries.map((e) => (
                      <tr key={e.driverId} className="border-t border-zinc-800">
                        <td className="py-2 pr-3 font-semibold">
                          {e.positionText}
                        </td>
                        <td className="pr-3">
                          <Link
                            to={`/drivers/${season}/${e.driverId}`}
                            className="hover:underline"
                          >
                            {e.driverName}
                          </Link>
                        </td>
                        <td className="pr-3 text-zinc-400">{e.teamName}</td>
                        {type === "qualifying" ? (
                          <>
                            <td className="pr-3 tabular-nums">{e.q1 ?? "—"}</td>
                            <td className="pr-3 tabular-nums">{e.q2 ?? "—"}</td>
                            <td className="pr-3 tabular-nums">{e.q3 ?? "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className="pr-3">{e.grid ?? "—"}</td>
                            <td className="pr-3">{e.laps ?? "—"}</td>
                            <td className="pr-3 tabular-nums">
                              {e.time ?? e.status ?? "—"}
                            </td>
                            <td className="pr-3 text-right font-semibold">
                              {e.points}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
```

- [ ] **Step 3: Standings page**

`client/src/pages/StandingsPage.tsx`:

```tsx
import type { Standings } from "@f1/shared";
import { Link } from "react-router";
import { SeasonSelect } from "../components/SeasonSelect";
import { PageHeader, QueryState } from "../components/States";
import { useApi } from "../lib/useApi";
import { useSeason } from "../lib/useSeason";

export default function StandingsPage({
  kind,
}: {
  kind: "drivers" | "constructors";
}) {
  const [season, setSeason] = useSeason();
  const q = useApi<Standings>(`/seasons/${season}/standings/${kind}`);
  const title =
    kind === "drivers" ? "Drivers’ championship" : "Constructors’ championship";
  return (
    <section>
      <PageHeader title={`${season} ${title}`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(s) =>
          s.entries.length === 0 ? (
            <p className="text-zinc-400">No standings yet for {season}.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-zinc-400">
                After round {s.afterRound}
              </p>
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{title}</caption>
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">Pos</th>
                    <th className="pr-3">
                      {kind === "drivers" ? "Driver" : "Team"}
                    </th>
                    {kind === "drivers" && <th className="pr-3">Team</th>}
                    <th className="pr-3 text-right">Wins</th>
                    <th className="pr-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {s.entries.map((e) => (
                    <tr key={e.id} className="border-t border-zinc-800">
                      <td className="py-2 pr-3 font-semibold">
                        {e.position ?? "—"}
                      </td>
                      <td className="pr-3">
                        <Link
                          to={`/${kind === "drivers" ? "drivers" : "teams"}/${season}/${e.id}`}
                          className="hover:underline"
                        >
                          {e.name}
                        </Link>
                      </td>
                      {kind === "drivers" && (
                        <td className="pr-3 text-zinc-400">
                          {e.teamName ?? "—"}
                        </td>
                      )}
                      <td className="pr-3 text-right">{e.wins}</td>
                      <td className="pr-3 text-right font-semibold">
                        {e.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )
        }
      </QueryState>
    </section>
  );
}
```

- [ ] **Step 4: Register the routes**

In `client/src/App.tsx`, add the lazy imports next to `NotFoundPage`:

```tsx
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const ResultsPage = lazy(() => import("./pages/ResultsPage"));
const StandingsPage = lazy(() => import("./pages/StandingsPage"));
```

and inside `<Route element={<Layout />}>`, before the `*` route:

```tsx
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="results/:season/:round" element={<ResultsPage />} />
          <Route path="standings/drivers" element={<StandingsPage kind="drivers" />} />
          <Route path="standings/constructors" element={<StandingsPage kind="constructors" />} />
```

- [ ] **Step 5: Verify in the browser**

`npm run typecheck -w client`, then with both dev servers running:

- `/schedule?season=2025` → 24 cards; round 2 says "Sprint weekend".
- Click round 1 → Australian GP race results, Norris P1. Click **Qualifying** → Q1–Q3 columns. Click **Sprint** → "No results yet for this session."
- `/standings/drivers?season=2025` → Norris first with 423 points. Change the season dropdown to 2021 → table updates.
- Stop the server (Ctrl-C) and reload a page you haven't visited → the error box with **Try again** appears.

- [ ] **Step 6: Commit**

```bash
git add client
git commit -m "feat(client): schedule, results and standings pages"
```

---

### Task 11: Drivers and Teams pages

**Files:**

- Create: `client/src/pages/DriversPage.tsx`, `client/src/pages/DriverPage.tsx`, `client/src/pages/TeamsPage.tsx`, `client/src/pages/TeamPage.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**

- Consumes: Task 9 components/hooks; endpoints `/seasons/:year/drivers[/:id]`, `/seasons/:year/teams[/:id]`.
- Produces: routes `/drivers`, `/drivers/:season/:driverId`, `/teams`, `/teams/:season/:teamId`.

- [ ] **Step 1: Drivers list and detail**

`client/src/pages/DriversPage.tsx`:

```tsx
import type { Driver } from "@f1/shared";
import { Link } from "react-router";
import { SeasonSelect } from "../components/SeasonSelect";
import { PageHeader, QueryState } from "../components/States";
import { useApi } from "../lib/useApi";
import { useSeason } from "../lib/useSeason";

export default function DriversPage() {
  const [season, setSeason] = useSeason();
  const q = useApi<Driver[]>(`/seasons/${season}/drivers`);
  return (
    <section>
      <PageHeader title={`${season} drivers`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(drivers) => (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {drivers.map((d) => (
              <li key={d.driverId}>
                <Link
                  to={`/drivers/${season}/${d.driverId}`}
                  className="block rounded-lg border border-zinc-800 p-4 hover:border-red-600"
                >
                  <p className="text-xs text-zinc-400">
                    {d.code ?? ""} {d.number !== null && `#${d.number}`}
                  </p>
                  <p className="font-semibold">
                    {d.givenName} {d.familyName}
                  </p>
                  <p className="text-sm text-zinc-400">{d.nationality}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </section>
  );
}
```

`client/src/pages/DriverPage.tsx`:

```tsx
import type { DriverDetail } from "@f1/shared";
import { Link, useParams } from "react-router";
import { PageHeader, QueryState } from "../components/States";
import { formatDate } from "../lib/format";
import { useApi } from "../lib/useApi";

export default function DriverPage() {
  const { season, driverId } = useParams();
  const q = useApi<DriverDetail>(`/seasons/${season}/drivers/${driverId}`);
  return (
    <section>
      <Link
        to={`/drivers?season=${season}`}
        className="text-sm text-zinc-400 hover:text-white"
      >
        ← {season} drivers
      </Link>
      <QueryState q={q}>
        {({ driver: d, teams, results, totalPoints }) => (
          <>
            <PageHeader title={`${d.givenName} ${d.familyName}`} />
            <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Team", teams.map((t) => t.name).join(", ") || "—"],
                ["Nationality", d.nationality],
                ["Born", d.dateOfBirth ? formatDate(d.dateOfBirth) : "—"],
                [`${season} points`, String(totalPoints)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-zinc-800 p-3">
                  <dt className="text-xs text-zinc-400">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {results.length === 0 ? (
              <p className="text-zinc-400">No race results in {season}.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Race-by-race results</caption>
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3">Round</th>
                    <th className="pr-3">Race</th>
                    <th className="pr-3">Grid</th>
                    <th className="pr-3">Finish</th>
                    <th className="pr-3">Status</th>
                    <th className="pr-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.round} className="border-t border-zinc-800">
                      <td className="py-2 pr-3">{r.round}</td>
                      <td className="pr-3">
                        <Link
                          to={`/results/${season}/${r.round}`}
                          className="hover:underline"
                        >
                          {r.raceName}
                        </Link>
                      </td>
                      <td className="pr-3">{r.grid ?? "—"}</td>
                      <td className="pr-3 font-semibold">{r.positionText}</td>
                      <td className="pr-3 text-zinc-400">{r.status ?? "—"}</td>
                      <td className="pr-3 text-right">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}
```

- [ ] **Step 2: Teams list and detail**

`client/src/pages/TeamsPage.tsx`:

```tsx
import type { Team } from "@f1/shared";
import { Link } from "react-router";
import { SeasonSelect } from "../components/SeasonSelect";
import { PageHeader, QueryState } from "../components/States";
import { useApi } from "../lib/useApi";
import { useSeason } from "../lib/useSeason";

export default function TeamsPage() {
  const [season, setSeason] = useSeason();
  const q = useApi<Team[]>(`/seasons/${season}/teams`);
  return (
    <section>
      <PageHeader title={`${season} teams`}>
        <SeasonSelect value={season} onChange={setSeason} />
      </PageHeader>
      <QueryState q={q}>
        {(teams) => (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <li key={t.teamId}>
                <Link
                  to={`/teams/${season}/${t.teamId}`}
                  className="block rounded-lg border border-l-4 border-zinc-800 p-4 hover:border-red-600"
                  style={{ borderLeftColor: t.colour ?? "#52525b" }}
                >
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-zinc-400">{t.nationality}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </section>
  );
}
```

`client/src/pages/TeamPage.tsx`:

```tsx
import type { TeamDetail } from "@f1/shared";
import { Link, useParams } from "react-router";
import { PageHeader, QueryState } from "../components/States";
import { useApi } from "../lib/useApi";

export default function TeamPage() {
  const { season, teamId } = useParams();
  const q = useApi<TeamDetail>(`/seasons/${season}/teams/${teamId}`);
  return (
    <section>
      <Link
        to={`/teams?season=${season}`}
        className="text-sm text-zinc-400 hover:text-white"
      >
        ← {season} teams
      </Link>
      <QueryState q={q}>
        {({ team, drivers, results, totalPoints }) => (
          <>
            <PageHeader title={team.name} />
            <p className="mb-4 text-sm text-zinc-400">
              {team.nationality} · {totalPoints} points in {season}
            </p>
            <h2 className="mb-2 font-semibold">Drivers</h2>
            <ul className="mb-6 flex flex-wrap gap-2">
              {drivers.map((d) => (
                <li key={d.driverId}>
                  <Link
                    to={`/drivers/${season}/${d.driverId}`}
                    className="block rounded border border-zinc-800 px-3 py-1 hover:border-red-600"
                  >
                    {d.givenName} {d.familyName}
                  </Link>
                </li>
              ))}
            </ul>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Points by round</caption>
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-2 pr-3">Round</th>
                  <th className="pr-3">Race</th>
                  <th className="pr-3">Best finish</th>
                  <th className="pr-3 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.round} className="border-t border-zinc-800">
                    <td className="py-2 pr-3">{r.round}</td>
                    <td className="pr-3">{r.raceName}</td>
                    <td className="pr-3">{r.bestPosition ?? "—"}</td>
                    <td className="pr-3 text-right">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </QueryState>
    </section>
  );
}
```

- [ ] **Step 3: Register the routes**

In `client/src/App.tsx` add:

```tsx
const DriversPage = lazy(() => import("./pages/DriversPage"));
const DriverPage = lazy(() => import("./pages/DriverPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
```

```tsx
          <Route path="drivers" element={<DriversPage />} />
          <Route path="drivers/:season/:driverId" element={<DriverPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="teams/:season/:teamId" element={<TeamPage />} />
```

- [ ] **Step 4: Verify in the browser**

`npm run typecheck -w client`, then:

- `/drivers?season=2025` → driver cards; click Hamilton → Ferrari, race-by-race table, points total.
- `/teams?season=2025` → team cards; click McLaren → Norris and Piastri, 24 rounds.
- `/drivers/2025/nobody` → error box saying no driver "nobody" in 2025.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat(client): driver and team list and detail pages"
```

---

### Task 12: Home page with countdown

**Files:**

- Create: `client/src/lib/countdown.ts`, `client/src/components/Countdown.tsx`, `client/src/pages/HomePage.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/test/countdown.test.ts`

**Interfaces:**

- Consumes: `GET /api/home` → `HomeData` (Task 8).
- Produces: `countdownParts(targetIso: string, nowMs: number): { days; hours; minutes; seconds; done: boolean }`; `<Countdown target={iso} />`; route `/`.

- [ ] **Step 1: Write the failing test**

`client/test/countdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countdownParts } from "../src/lib/countdown";

describe("countdownParts", () => {
  const now = Date.parse("2026-10-15T10:00:00Z");

  it("splits the remaining time", () => {
    expect(countdownParts("2026-10-17T13:04:05Z", now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      done: false,
    });
  });

  it("reports done once the target has passed", () => {
    expect(countdownParts("2026-10-15T09:59:59Z", now)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      done: true,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w client -- countdown`
Expected: FAIL, cannot find `../src/lib/countdown`.

- [ ] **Step 3: Implement**

`client/src/lib/countdown.ts`:

```ts
export function countdownParts(targetIso: string, nowMs: number) {
  const diff = Math.max(0, Date.parse(targetIso) - nowMs);
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: diff === 0,
  };
}
```

`client/src/components/Countdown.tsx`:

```tsx
import { useEffect, useState } from "react";
import { countdownParts } from "../lib/countdown";

export function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = countdownParts(target, now);
  if (c.done)
    return (
      <p className="text-lg font-semibold text-red-400">Session under way</p>
    );
  return (
    // The visible digits tick every second; screen readers get one label instead of constant updates.
    <p
      className="flex gap-4"
      aria-label={`${c.days} days ${c.hours} hours ${c.minutes} minutes to go`}
    >
      {(
        [
          [c.days, "days"],
          [c.hours, "hrs"],
          [c.minutes, "min"],
          [c.seconds, "sec"],
        ] as const
      ).map(([n, label]) => (
        <span key={label} aria-hidden="true" className="text-center">
          <span className="block text-3xl font-black tabular-nums">
            {String(n).padStart(2, "0")}
          </span>
          <span className="text-xs text-zinc-400">{label}</span>
        </span>
      ))}
    </p>
  );
}
```

`client/src/pages/HomePage.tsx`:

```tsx
import type { HomeData, StandingEntry } from "@f1/shared";
import { Link } from "react-router";
import { Countdown } from "../components/Countdown";
import { QueryState } from "../components/States";
import { formatDateTime, SESSION_LABEL } from "../lib/format";
import { useApi } from "../lib/useApi";

function Top10({
  title,
  rows,
  to,
}: {
  title: string;
  rows: StandingEntry[];
  to: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No standings yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map((e) => (
            <li key={e.id} className="flex justify-between gap-2">
              <span>
                <span className="inline-block w-6 text-zinc-400">
                  {e.position}
                </span>
                {e.name}
              </span>
              <span className="font-semibold tabular-nums">{e.points}</span>
            </li>
          ))}
        </ol>
      )}
      <Link
        to={to}
        className="mt-3 inline-block text-sm text-red-400 hover:underline"
      >
        Full standings →
      </Link>
    </div>
  );
}

function Favourite({
  label,
  entry,
}: {
  label: string;
  entry: StandingEntry | null;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-semibold">
        {entry
          ? `${entry.name}: P${entry.position ?? "—"}, ${entry.points} pts`
          : "Not chosen yet"}
      </p>
    </div>
  );
}

export default function HomePage() {
  const q = useApi<HomeData>("/home");
  return (
    <QueryState q={q}>
      {(h) => (
        <div className="grid gap-6">
          <section
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
            aria-labelledby="next-session"
          >
            {h.nextSession ? (
              <>
                <p id="next-session" className="text-sm text-zinc-400">
                  Round {h.nextSession.round} · {h.nextSession.raceName} ·{" "}
                  {SESSION_LABEL[h.nextSession.session.type]}
                </p>
                <p className="mb-4 text-sm">
                  {formatDateTime(h.nextSession.session.startsAt)}
                </p>
                <Countdown target={h.nextSession.session.startsAt} />
              </>
            ) : (
              <p id="next-session" className="text-lg font-semibold">
                The {h.season} season is complete.
              </p>
            )}
            <div className="mt-6">
              <p className="mb-1 text-xs text-zinc-400">
                {h.progressPct}% of the {h.season} season completed (
                {h.completedRounds}/{h.totalRounds} rounds)
              </p>
              <div
                className="h-2 rounded bg-zinc-800"
                role="progressbar"
                aria-valuenow={h.progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Season progress"
              >
                <div
                  className="h-2 rounded bg-red-600"
                  style={{ width: `${h.progressPct}%` }}
                />
              </div>
            </div>
          </section>

          <section
            className="rounded-lg border border-zinc-800 p-4"
            aria-label="Your favourites"
          >
            {h.favourites ? (
              <div className="flex flex-wrap gap-8">
                <Favourite label="Your driver" entry={h.favourites.driver} />
                <Favourite label="Your team" entry={h.favourites.team} />
                <Link
                  to="/profile"
                  className="self-center text-sm text-red-400 hover:underline"
                >
                  Change
                </Link>
              </div>
            ) : (
              <p className="text-sm">
                <Link to="/login" className="text-red-400 hover:underline">
                  Log in
                </Link>{" "}
                to follow your favourite driver and team.
              </p>
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <Top10
              title={`${h.season} drivers`}
              rows={h.driverTop10}
              to="/standings/drivers"
            />
            <Top10
              title={`${h.season} constructors`}
              rows={h.constructorTop10}
              to="/standings/constructors"
            />
          </div>
        </div>
      )}
    </QueryState>
  );
}
```

In `client/src/App.tsx` add:

```tsx
const HomePage = lazy(() => import("./pages/HomePage"));
```

```tsx
<Route index element={<HomePage />} />
```

- [ ] **Step 4: Run tests and verify**

Run: `npm test -w client && npm run typecheck -w client`
Expected: PASS. In the browser `/` shows the next session (the US GP weekend, Oct 23–25, at the time of writing) ticking every second, the season progress bar, the "Log in" prompt and two top-10 lists.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat(client): home page with countdown, season progress and top 10s"
```

---

### Task 13: Login, register and profile pages

**Files:**

- Create: `client/src/lib/useMe.ts`, `client/src/pages/LoginPage.tsx`, `client/src/pages/RegisterPage.tsx`, `client/src/pages/ProfilePage.tsx`
- Modify: `client/src/App.tsx`, `client/src/components/Layout.tsx` (account slot)

**Interfaces:**

- Consumes: auth/users endpoints (Task 7), `/seasons/current/drivers`, `/seasons/current/teams` (Task 6).
- Produces: `useMe(): UseQueryResult<PublicUser | null>` (query key `['me']`); `<AccountMenu />`; routes `/login`, `/register`, `/profile`.

- [ ] **Step 1: The current-user hook and account menu**

`client/src/lib/useMe.ts`:

```ts
import type { PublicUser } from "@f1/shared";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await api.get<{ user: PublicUser }>("/auth/me")).data.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
```

Add to `client/src/components/Layout.tsx` (new imports at the top, new component below `WakingBanner`):

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";
import { useMe } from "../lib/useMe";
```

```tsx
export function AccountMenu() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (me.isPending) return null;
  if (!me.data)
    return (
      <Link
        to="/login"
        className="rounded bg-red-600 px-3 py-1 text-sm font-medium hover:bg-red-500"
      >
        Log in
      </Link>
    );
  return (
    <span className="flex items-center gap-3 text-sm">
      <Link to="/profile" className="hover:underline">
        {me.data.displayName}
      </Link>
      <button
        type="button"
        className="text-zinc-400 hover:text-white"
        onClick={async () => {
          await api.post("/auth/logout");
          qc.setQueryData(["me"], null);
          await qc.invalidateQueries({ queryKey: ["/home"] });
          navigate("/");
        }}
      >
        Log out
      </button>
    </span>
  );
}
```

Merge the `react-router` imports into the existing `import { NavLink, Outlet } from 'react-router';` line.

In `client/src/App.tsx`, change `<Route element={<Layout />}>` to `<Route element={<Layout account={<AccountMenu />} />}>` and import `AccountMenu` from `./components/Layout`.

- [ ] **Step 2: Login and register pages**

`client/src/pages/LoginPage.tsx`:

```tsx
import type { PublicUser } from "@f1/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";

export const inputClass =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2";

export default function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () =>
      api.post<{ user: PublicUser }>("/auth/login", { email, password }),
    onSuccess: async ({ data }) => {
      qc.setQueryData(["me"], data.user);
      await qc.invalidateQueries({ queryKey: ["/home"] });
      navigate("/");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };
  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Log in</h1>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 text-sm">
          Email
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p
          role="alert"
          aria-live="polite"
          className="min-h-5 text-sm text-red-400"
        >
          {login.error?.message}
        </p>
        <button
          type="submit"
          disabled={login.isPending}
          className="rounded bg-red-600 py-2 font-medium hover:bg-red-500 disabled:opacity-50"
        >
          {login.isPending ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-400">
        New here?{" "}
        <Link to="/register" className="text-red-400 hover:underline">
          Create an account
        </Link>
      </p>
    </section>
  );
}
```

`client/src/pages/RegisterPage.tsx`:

```tsx
import type { PublicUser } from "@f1/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";
import { inputClass } from "./LoginPage";

export default function RegisterPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
  });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const register = useMutation({
    mutationFn: () => api.post<{ user: PublicUser }>("/auth/register", form),
    onSuccess: ({ data }) => {
      qc.setQueryData(["me"], data.user);
      navigate("/profile");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate();
  };
  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Create an account</h1>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1 text-sm">
          Display name
          <input
            className={inputClass}
            required
            maxLength={40}
            autoComplete="nickname"
            value={form.displayName}
            onChange={set("displayName")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Email
          <input
            className={inputClass}
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Password (at least 8 characters)
          <input
            className={inputClass}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
          />
        </label>
        <p
          role="alert"
          aria-live="polite"
          className="min-h-5 text-sm text-red-400"
        >
          {register.error?.message}
        </p>
        <button
          type="submit"
          disabled={register.isPending}
          className="rounded bg-red-600 py-2 font-medium hover:bg-red-500 disabled:opacity-50"
        >
          {register.isPending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-400">
        Already have one?{" "}
        <Link to="/login" className="text-red-400 hover:underline">
          Log in
        </Link>
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Profile page (favourites and delete account)**

`client/src/pages/ProfilePage.tsx`:

```tsx
import type { Driver, PublicUser, Team } from "@f1/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { Loading } from "../components/States";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useMe } from "../lib/useMe";

export default function ProfilePage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const drivers = useApi<Driver[]>("/seasons/current/drivers");
  const teams = useApi<Team[]>("/seasons/current/teams");

  const update = useMutation({
    mutationFn: (
      patch: Partial<Pick<PublicUser, "favouriteDriverId" | "favouriteTeamId">>,
    ) => api.patch<{ user: PublicUser }>("/users/me", patch),
    onSuccess: async ({ data }) => {
      qc.setQueryData(["me"], data.user);
      await qc.invalidateQueries({ queryKey: ["/home"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del("/users/me"),
    onSuccess: async () => {
      qc.setQueryData(["me"], null);
      await qc.invalidateQueries({ queryKey: ["/home"] });
      navigate("/");
    },
  });

  if (me.isPending) return <Loading />;
  if (!me.data) return <Navigate to="/login" replace />;
  const user = me.data;
  const selectClass =
    "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2";

  return (
    <section className="mx-auto grid max-w-md gap-6">
      <h1 className="text-2xl font-bold">{user.displayName}</h1>
      <p className="text-sm text-zinc-400">{user.email}</p>

      <label className="grid gap-1 text-sm">
        Favourite driver
        <select
          className={selectClass}
          value={user.favouriteDriverId ?? ""}
          onChange={(e) =>
            update.mutate({ favouriteDriverId: e.target.value || null })
          }
          disabled={!drivers.data}
        >
          <option value="">None</option>
          {drivers.data?.data.map((d) => (
            <option key={d.driverId} value={d.driverId}>
              {d.givenName} {d.familyName}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        Favourite team
        <select
          className={selectClass}
          value={user.favouriteTeamId ?? ""}
          onChange={(e) =>
            update.mutate({ favouriteTeamId: e.target.value || null })
          }
          disabled={!teams.data}
        >
          <option value="">None</option>
          {teams.data?.data.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {update.isPending ? (
          "Saving…"
        ) : update.isError ? (
          <span className="text-red-400">{update.error.message}</span>
        ) : update.isSuccess ? (
          "Saved."
        ) : (
          ""
        )}
      </p>

      <div className="border-t border-zinc-800 pt-6">
        <button
          type="button"
          className="rounded border border-red-800 px-3 py-2 text-sm text-red-400 hover:bg-red-950"
          onClick={() => {
            if (confirm("Delete your account? This cannot be undone."))
              remove.mutate();
          }}
        >
          Delete my account
        </button>
      </div>
    </section>
  );
}
```

In `client/src/App.tsx` add:

```tsx
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
```

```tsx
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="profile" element={<ProfilePage />} />
```

- [ ] **Step 4: Verify the account flow in the browser**

`npm run typecheck -w client`, then:

1. Register → lands on Profile. Pick a driver and a team → "Saved."
2. Home → favourites card shows both with positions and points.
3. Log out → header shows **Log in**; Home shows the log-in prompt.
4. Log in with the email in upper case → works.
5. Register again with the same email → "An account with this email already exists".
6. Profile → Delete my account → back on Home, logged out. Visiting `/profile` redirects to `/login`.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat(client): login, register and profile with favourites"
```

---

### Task 14: Production serving and Docker

**Files:**

- Modify: `server/src/app.ts`
- Create: `Dockerfile`, `.dockerignore`
- Modify: `docker-compose.yml`
- Test: `server/test/static.test.ts`

**Interfaces:**

- Consumes: `createApp({ clientDir })` (Task 1).
- Produces: when `clientDir` is set, the app serves its files and falls back to `index.html` for any non-`/api` GET; one image that runs the whole app.

- [ ] **Step 1: Write the failing test**

`server/test/static.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";

const dir = mkdtempSync(path.join(tmpdir(), "client-"));
writeFileSync(
  path.join(dir, "index.html"),
  '<!doctype html><div id="root"></div>',
);
mkdirSync(path.join(dir, "assets"));
writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
const app = createApp({ clientDir: dir });

describe("serving the built client", () => {
  it("serves assets", async () => {
    const res = await request(app).get("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.text).toBe("console.log(1)");
  });

  it("falls back to index.html for client routes", async () => {
    const res = await request(app).get("/drivers/2025/norris");
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it("keeps unknown API routes as JSON 404s", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- static`
Expected: FAIL (`/assets/app.js` returns 404).

- [ ] **Step 3: Implement static serving**

In `server/src/app.ts`: rename `_opts` to `opts`, and between `app.use('/api', notFound);` and `app.use(errorHandler);` insert:

```ts
if (opts.clientDir) {
  const clientDir = opts.clientDir;
  app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile("index.html", { root: clientDir }),
  );
}
```

The final `server/src/app.ts` reads:

```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { config } from "./config.ts";
import { errorHandler, notFound } from "./middleware/errorHandler.ts";
import { authRouter } from "./routes/auth.ts";
import { homeRouter } from "./routes/home.ts";
import { seasonsRouter } from "./routes/seasons.ts";
import { usersRouter } from "./routes/users.ts";

export function createApp(opts: { clientDir?: string } = {}) {
  const app = express();
  if (config.NODE_ENV === "production") app.set("trust proxy", 1); // Render's proxy; needed for rate limiting by IP
  // Render serves HTTPS itself; upgrade-insecure-requests would break plain-http local runs (Docker on localhost).
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/seasons", seasonsRouter());
  app.use("/api/auth", authRouter());
  app.use("/api/users", usersRouter());
  app.use("/api/home", homeRouter());
  app.use("/api", notFound);

  if (opts.clientDir) {
    const clientDir = opts.clientDir;
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
    app.get("/{*splat}", (_req, res) =>
      res.sendFile("index.html", { root: clientDir }),
    );
  }

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w server`
Expected: all PASS.

- [ ] **Step 5: Dockerfile, .dockerignore and compose**

`Dockerfile`:

```dockerfile
# Build the client
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared shared
COPY client client
RUN npm run build -w client

# Runtime: server source (run directly by Node) + built client
FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev && npm cache clean --force
COPY shared shared
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 3000
CMD ["node", "server/src/index.ts"]
```

`.dockerignore`:

```
node_modules
**/node_modules
client/dist
.git
.env
docs
coverage
```

`docker-compose.yml` (add the `app` service; keep `mongo` as is):

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      MONGODB_URI: mongodb://mongo:27017/f1
      JWT_SECRET: ${JWT_SECRET:?set JWT_SECRET in .env}
      WARM_TOKEN: ${WARM_TOKEN:-}
    depends_on: [mongo]
  mongo:
    image: mongo:8
    command: ["--wiredTigerCacheSizeGB", "0.5"]
    ports: ["27017:27017"]
    volumes: [mongo-data:/data/db]
volumes:
  mongo-data: {}
```

- [ ] **Step 6: Verify the production image**

```bash
docker compose up --build -d
curl -s localhost:3000/api/health
curl -s localhost:3000/standings/drivers | head -c 200; echo
docker compose down
```

Expected: `{"ok":true}`; the second command prints the HTML of `index.html`. Open `http://localhost:3000` → the full app works from one origin. (If Docker isn't installed locally, skip this step: Render builds the same image in Task 15.)

- [ ] **Step 7: Commit**

```bash
git add server Dockerfile .dockerignore docker-compose.yml
git commit -m "feat: serve the built client from Express and add the production Docker image"
```

---

### Task 15: CI, secret scanning and Render deployment

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: none in code

**Interfaces:**

- Produces: CI that type-checks, tests and scans for secrets on every push; a live Render URL serving the app.

- [ ] **Step 1: CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # gitleaks scans the full history
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Check the whole repo locally**

```bash
npm run typecheck && npm test
git status --short   # .env must NOT appear
git check-ignore .env && echo ".env is ignored"
```

Expected: everything passes; `.env is ignored`.

- [ ] **Step 3: Commit and push to a new public GitHub repo**

```bash
git add .github
git commit -m "ci: typecheck, tests and gitleaks secret scan"
gh repo create f1-dashboard --public --source . --push
```

Expected: the **CI** workflow on GitHub turns green. If gitleaks flags something, remove it from history before continuing.

- [ ] **Step 4: Create the production database (manual, Atlas web UI)**

1. In MongoDB Atlas, create a free **M0** cluster.
2. **Database Access** → add a user with a generated password (Atlas's "Autogenerate" button).
3. **Network Access** → allow `0.0.0.0/0` (Render's free tier has no fixed IP; the strong password protects it).
4. **Connect → Drivers** → copy the connection string; add the database name `f1` before the `?`.

- [ ] **Step 5: Create the Render web service (manual, Render web UI)**

1. **New → Web Service** → connect the GitHub repo → **Language: Docker**, instance type **Free**.
2. **Environment variables:** `MONGODB_URI` (from Step 4), `JWT_SECRET` (`openssl rand -hex 32`), `WARM_TOKEN` (`openssl rand -hex 32`). `NODE_ENV=production` is already set in the image.
3. **Health check path:** `/api/health`. **Auto-deploy:** on, branch `main`.
4. Create the service and wait for the first deploy.

- [ ] **Step 6: Verify production**

```bash
URL=https://<your-service>.onrender.com
curl -s $URL/api/health
curl -s -o /dev/null -w "%{http_code}\n" $URL/api/seasons/2025/standings/drivers
curl -s -o /dev/null -w "%{http_code}\n" $URL/schedule
```

Expected: `{"ok":true}`, `200`, `200`. In a browser: register, set favourites, check Home, log out. In DevTools → Application → Cookies, `token` is `HttpOnly`, `Secure`, `SameSite=Lax`.

- [ ] **Step 7: Record the URL**

Add the live URL to the top of a new `README.md` (the full README is written in the wrap-up):

```markdown
# F1 Dashboard

Unofficial Formula 1 fan dashboard. **Live:** https://<your-service>.onrender.com

Spec: `docs/superpowers/specs/2026-10-10-f1-dashboard-design.md`
```

```bash
git add README.md
git commit -m "docs: add live URL"
git push
```

---

## Done when

- `npm run typecheck && npm test` pass locally and in GitHub Actions, including gitleaks.
- The Render URL serves every Group A page, accounts work, and `X-Data-Stale` / 503 behave as tested.
- Next: write Plan 2 (Replay), starting with measuring one race's chunk size (spec §6.2).
