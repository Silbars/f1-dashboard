import type { Driver, DriverCard, RaceResult, Team, TeamCard } from '@f1/shared';

/** Drivers with the team they last raced for and their photo, most points first (by name before any race). */
export function buildDriverCards(drivers: Driver[], races: RaceResult[], teams: Team[], headshots: Map<string, string>): DriverCard[] {
  const colours = new Map(teams.map((t) => [t.teamId, t.colour]));
  const latest = new Map<string, { teamId: string; teamName: string }>();
  const points = new Map<string, number>();
  for (const r of races) {
    for (const e of r.entries) {
      latest.set(e.driverId, { teamId: e.teamId, teamName: e.teamName }); // later rounds overwrite, so a mid-season switch shows the current team
      points.set(e.driverId, (points.get(e.driverId) ?? 0) + e.points);
    }
  }
  return drivers
    .map((d) => {
      const t = latest.get(d.driverId);
      return {
        ...d,
        headshot: (d.code && headshots.get(d.code)) || null,
        teamId: t?.teamId ?? null,
        teamName: t?.teamName ?? null,
        colour: (t && colours.get(t.teamId)) || null,
      };
    })
    .sort((a, b) => (points.get(b.driverId) ?? 0) - (points.get(a.driverId) ?? 0) || a.familyName.localeCompare(b.familyName));
}

/** Teams with their current drivers; the driver order from buildDriverCards carries through, so the better-placed driver is first. */
export function buildTeamCards(teams: Team[], cards: DriverCard[]): TeamCard[] {
  const lineup = (teamId: string) =>
    cards
      .filter((d) => d.teamId === teamId)
      .map((d) => ({ driverId: d.driverId, code: d.code, givenName: d.givenName, familyName: d.familyName, headshot: d.headshot }));
  const best = (t: TeamCard) => cards.findIndex((d) => d.teamId === t.teamId);
  return teams
    .map((t) => ({ ...t, drivers: lineup(t.teamId) }))
    .sort((a, b) => (best(a) === -1 ? 1e9 : best(a)) - (best(b) === -1 ? 1e9 : best(b)) || a.name.localeCompare(b.name));
}
