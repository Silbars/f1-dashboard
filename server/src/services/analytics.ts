import type { Driver, H2HRound, H2HStats, HeadToHead, RaceResult, ResultEntry } from '@f1/shared';

const entryOf = (r: RaceResult, driverId: string) => r.entries.find((e) => e.driverId === driverId);
const classified = (e: ResultEntry) => /^\d+$/.test(e.positionText);
// W = withdrawn, F = failed to qualify: the driver never started, so there is nothing to compare or count.
const started = (e: ResultEntry | undefined): e is ResultEntry => !!e && e.positionText !== 'W' && e.positionText !== 'F';

/** Season head-to-head between drivers a and b, from the season's race, sprint and qualifying results. */
export function headToHead(season: number, a: Driver, b: Driver, races: RaceResult[], sprints: RaceResult[], qualifying: RaceResult[]): HeadToHead {
  const sa: H2HStats = { driver: a, points: 0, wins: 0, podiums: 0, dnfs: 0, raceAhead: 0, qualiAhead: 0 };
  const sb: H2HStats = { driver: b, points: 0, wins: 0, podiums: 0, dnfs: 0, raceAhead: 0, qualiAhead: 0 };
  const tally = (s: H2HStats, e: ResultEntry | undefined) => {
    if (!e) return;
    s.points += e.points;
    if (e.position === 1) s.wins++;
    if (e.position !== null && e.position <= 3) s.podiums++;
    if (started(e) && !classified(e)) s.dnfs++;
  };
  /** b's position minus a's, or null unless both started and have a position. */
  const gapIn = (r: RaceResult) => {
    const ea = entryOf(r, a.driverId);
    const eb = entryOf(r, b.driverId);
    if (!started(ea) || !started(eb) || ea.position === null || eb.position === null) return null;
    return eb.position - ea.position;
  };

  const rounds: H2HRound[] = [];
  for (const r of races) {
    const ea = entryOf(r, a.driverId);
    const eb = entryOf(r, b.driverId);
    if (!ea && !eb) continue;
    tally(sa, ea);
    tally(sb, eb);
    const gap = gapIn(r);
    if (gap !== null && gap > 0) sa.raceAhead++;
    if (gap !== null && gap < 0) sb.raceAhead++;
    rounds.push({ round: r.round, raceName: r.raceName, a: ea?.positionText ?? null, b: eb?.positionText ?? null, gap });
  }
  for (const r of sprints) {
    sa.points += entryOf(r, a.driverId)?.points ?? 0;
    sb.points += entryOf(r, b.driverId)?.points ?? 0;
  }
  for (const r of qualifying) {
    const gap = gapIn(r);
    if (gap !== null && gap > 0) sa.qualiAhead++;
    if (gap !== null && gap < 0) sb.qualiAhead++;
  }
  return { season, a: sa, b: sb, rounds };
}
