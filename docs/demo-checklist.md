# Demo video checklist

Target length: 4–6 minutes. Record the live site: https://f1-dashboard-5yf2.onrender.com

## Before recording

- [ ] **Wake Render 2 minutes early.** Open the live site (or `https://f1-dashboard-5yf2.onrender.com/api/health`) and wait for it to load. The free tier sleeps when idle; the first request can take about a minute.
- [ ] **Warm the pages you will show** by opening each one once (Home, Schedule, a results page, both standings, a driver, a team, `/replay`), so nothing waits on the upstream API while you record.
- [ ] **Check the replays.** `/replay` should list the 3 newest weekends. Open the race you will show, press play for a few seconds, then reload, so its first minutes are already in the server's memory. Pick a moment worth seeking to (the start, a safety car, a pit-stop window) and note its time on the clock.
- [ ] **Test account ready.** Register a demo account in advance (a made-up email such as `demo@example.com`, not a real password you use elsewhere). Write down which favourite driver and team you will pick. For the register shot, have a second made-up email ready.
- [ ] **Log out** before you start, so the video opens as a visitor.
- [ ] **Browser zoom** at 110–125% so the tables are readable in the video. Close other tabs, hide bookmarks, turn off notifications.
- [ ] Use a fresh browser profile or private window so autofill and extensions don't show up.
- [ ] Open the GitHub repository in a second tab for the closing shot.
- [ ] Never show `.env`, the Render environment page, the GitHub secrets page or the Atlas connection string on screen.

## Shot list

| # | Show | Say |
| - | ---- | --- |
| 1 | The live site's Home page, logged out. | "This is my F1 dashboard, an unofficial fan site built as my end-term project. It's a MERN app in TypeScript, deployed on Render." |
| 2 | **Waking server.** Explain over the Home page (or show a short clip recorded earlier from a cold start, with the "Waking up the server…" banner). | "It runs on Render's free tier, which sleeps when idle. If a request takes more than five seconds, the app shows this 'Waking up the server' banner instead of a blank page." |
| 3 | Home: the countdown, the season progress bar, the two top-10 tables. | "Home counts down to the next session in your local time, shows how much of the season is done, and the top ten in both championships." |
| 4 | Schedule: scroll the round cards, point at a "Sprint weekend" tag, change the season selector to an older year and back. | "The schedule lists every round, with the race start in local time. I can go back to any season since 1950." |
| 5 | Click a finished round → Results. Switch the Race, Sprint and Qualifying tabs (use a sprint weekend). | "Each round has race, sprint and qualifying results." |
| 6 | Drivers' standings, then Constructors' standings. | "Both championship tables, for any season." |
| 7 | Click a driver in the standings → driver page with the round-by-round table. | "Each driver has a page with grid, finish, status and points for every round." |
| 8 | Teams list (point at the team colours) → a team page with its drivers and best finish per round. | "Same for teams, in their team colours." |
| 9 | **Replay picker.** Click "Replay" in the nav. | "The signature feature is the race replay. These are the last three Grand Prix weekends, with the sprint where there was one." |
| 10 | Open a race. Point at the track outline and the cars on the grid. Press **Play**. | "The track isn't an image: it's drawn from one car's GPS trace over its fastest lap. Every dot is a car, in its team colour." |
| 11 | Switch to **16×**. Let it run a few seconds; point at the leaderboard updating and the lap counter. | "The server owns the playback clock and streams car positions over Socket.io a few seconds ahead. The browser blends between samples, so the cars move smoothly at 60 frames a second. The leaderboard shows gaps, intervals and tyres as the race goes on." |
| 12 | Drag the position slider to the moment you noted (or press → a few times). Point at the race-control banner. | "I can seek anywhere in the race. The banner shows race-control messages: flags, the safety car." |
| 13 | Click a driver in the leaderboard; their car gets a white ring. Press **Space** to pause. | "Clicking a driver highlights their car, and the keyboard works too: Space pauses, the arrow keys jump ten seconds." |
| 14 | **Account flow.** Click "Log in" → "Register", create an account with the second made-up email. Show that you're now logged in (your name in the header). | "Accounts are optional. Passwords are hashed with bcrypt, and the login token lives in an httpOnly cookie." |
| 15 | Open the profile page, pick a favourite driver and team. Go back to Home and show the favourites card with their position and points. | "Logged in, I can pick a favourite driver and team, and Home shows how they're doing." |
| 16 | Log out, then log in again with the prepared demo account; show its favourites on Home. | "Log out and log back in, and the favourites are still there." |
| 17 | Profile → "Delete my account" on the account made in shot 14, confirm. | "Users can delete their account and data." |
| 18 | **How the data gets there.** Show the README's architecture and race replay sections. | "Results and standings come from the Jolpica API through a rate-limited queue and are cached in MongoDB; if Jolpica is down, the app shows the saved copy with a notice instead of an error. Replays come from OpenF1: a GitHub Actions job runs every Monday and Tuesday, stores the newest weekends minute by minute, compressed, and deletes the oldest." |
| 19 | GitHub repo: the README, the Actions tab with a green CI run and a green "Weekly replay warm" run. | "CI runs a gitleaks secret scan, the type checker and the tests on every push. No secrets are in the repo." |
| 20 | Back to the site footer. | "Next up: head-to-head and pit-stop analytics, and live mode during a race. Thanks for watching." Footer reads: unofficial fan project, not associated with Formula 1, the FIA or Formula One Management. |

## After recording

- [ ] Check the video is 4–6 minutes and every shot above is in it.
- [ ] Upload it and replace "Demo video: (link to be added)" in `README.md` with the link.
- [ ] Delete any leftover test accounts you made while practising.
