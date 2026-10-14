# F1 Dashboard: Plan Overview

**Spec:** `docs/superpowers/specs/2026-10-10-f1-dashboard-design.md`
**Deadline:** 2026-10-27, 11:59 PM IST

The spec covers four independent subsystems, so there is one plan per subsystem. Each plan ends with
working, deployed, tested software. Plans 2–4 are written when the previous plan is done, so they can
use what was learned building it (for example, the measured replay chunk size).

| Plan | Covers (spec sections) | Target dates | Status |
|---|---|---|---|
| **1. Foundation** | Monorepo, data layer and caching (§5.1–5.4), Group A pages, auth (§7), Docker, CI, Render deploy (§8) | Oct 15–17 | Written: `2026-10-15-plan-1-foundation.md` |
| **2. Replay** | Replay track map, warm job, retention, socket events (§6.0–6.5), GitHub Actions warm cron | Oct 18–20 | To write after Plan 1 |
| **3. Analytics** | Head-to-Head, Pit Stops, Home's fastest pit stop (§2 Group B) | Oct 21 | To write after Plan 2 |
| **4. Live mode (stretch)** | LiveEngine, `live:join`, OpenF1 Sponsor tier (§6.6) | Oct 22 build; Oct 23–25 test and record | Only if Plans 1–3 are done by Oct 21 |
| **Wrap-up** | README (§10 decisions), `docs/demo-checklist.md`, demo video, final checks | Oct 26–27 | Small checklist, part of Plan 3 or 4 |

**Cut rules:** if Plan 2 runs past Oct 21, Plan 4 is dropped. If Plan 3 runs past Oct 23, Pit Stops is
dropped before Head-to-Head. Oct 27 is buffer only.
