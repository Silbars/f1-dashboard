import type { HomeData, NextSession, Race, Standings } from '@f1/shared';

const raceStart = (r: Race): number => Date.parse(r.sessions.find((s) => s.type === 'race')?.startsAt ?? '');

export function buildHome(input: {
  season: number;
  schedule: Race[];
  drivers: Standings | null;
  constructors: Standings | null;
  now: Date;
  user: { favouriteDriverId: string | null; favouriteTeamId: string | null } | null;
}): HomeData {
  const now = input.now.getTime();
  const totalRounds = input.schedule.length;
  const completedRounds = input.schedule.filter((r) => raceStart(r) <= now).length;

  let nextSession: NextSession | null = null;
  for (const r of input.schedule) {
    const s = r.sessions.find((x) => Date.parse(x.startsAt) > now);
    if (s) {
      nextSession = { raceName: r.name, round: r.round, country: r.circuit.country, session: s };
      break;
    }
  }

  const driverEntries = input.drivers?.entries ?? [];
  const teamEntries = input.constructors?.entries ?? [];
  return {
    season: input.season,
    totalRounds,
    completedRounds,
    progressPct: totalRounds ? Math.round((completedRounds / totalRounds) * 1000) / 10 : 0,
    nextRace: input.schedule.find((r) => raceStart(r) > now) ?? null,
    nextSession,
    driverTop10: driverEntries.slice(0, 10),
    constructorTop10: teamEntries.slice(0, 10),
    fastestPitStop: null,
    favourites: input.user
      ? {
          driver: driverEntries.find((e) => e.id === input.user!.favouriteDriverId) ?? null,
          team: teamEntries.find((e) => e.id === input.user!.favouriteTeamId) ?? null,
        }
      : null,
  };
}
