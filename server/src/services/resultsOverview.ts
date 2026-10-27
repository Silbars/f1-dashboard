import type { OverviewDriver, OverviewPerson, OverviewRound, Race, RaceResult, ResultEntry, SeasonOverview, Team } from '@f1/shared';

const FINISHED = /^(Finished|Lapped|\+\d+ Laps?)$/;

/** The data classifies retirees by running order, so their positionText is a number; the status says they did not finish. */
export function resultCode(e: ResultEntry): string {
  if (!/^\d+$/.test(e.positionText)) return e.positionText;
  if (!e.status || FINISHED.test(e.status)) return e.positionText;
  if (e.status === 'Disqualified') return 'D';
  if (e.status === 'Excluded') return 'E';
  if (/^(Did not start|Withdrew|Did not qualify)/.test(e.status)) return 'W';
  return 'R';
}

export function buildOverview(
  season: number,
  schedule: Race[],
  races: RaceResult[],
  sprints: RaceResult[],
  qualifying: RaceResult[],
  teams: Team[],
): SeasonOverview {
  const colours = new Map(teams.map((t) => [t.teamId, t.colour]));
  const person = (e: ResultEntry | undefined): OverviewPerson | null =>
    e ? { driverId: e.driverId, code: e.driverCode, name: e.driverName, colour: colours.get(e.teamId) ?? null } : null;
  const byRound = (list: RaceResult[]) => new Map(list.map((r) => [r.round, r.entries]));
  const raceBy = byRound(races);
  const sprintBy = byRound(sprints);
  const qualiBy = byRound(qualifying);
  const first = (entries: ResultEntry[] | undefined) => entries?.find((e) => e.position === 1);

  const rounds: OverviewRound[] = schedule.map((r) => ({
    round: r.round,
    raceName: r.name,
    country: r.circuit.country,
    date: r.sessions.find((s) => s.type === 'race')?.startsAt ?? null,
    hasSprint: r.sessions.some((s) => s.type === 'sprint'),
    poleman: person(first(qualiBy.get(r.round))),
    winner: person(first(raceBy.get(r.round))),
    sprintWinner: person(first(sprintBy.get(r.round))),
  }));

  const drivers = new Map<string, OverviewDriver>();
  for (const [kind, list] of [['race', races], ['sprint', sprints]] as const) {
    for (const r of list) {
      for (const e of r.entries) {
        // Later rounds overwrite the team, so a driver who switched shows the current one.
        const d = drivers.get(e.driverId) ?? { ...person(e)!, teamId: e.teamId, teamName: e.teamName, race: {}, sprint: {} };
        Object.assign(d, { teamId: e.teamId, teamName: e.teamName, colour: colours.get(e.teamId) ?? null });
        d[kind][r.round] = { positionText: resultCode(e), points: e.points };
        drivers.set(e.driverId, d);
      }
    }
  }
  return { season, rounds, drivers: [...drivers.values()] };
}
