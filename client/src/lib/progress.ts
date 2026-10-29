import type { SeasonOverview } from '@f1/shared';

/** Finishing places the countback tiebreak looks at (P1 first); a tie that survives 20 places is vanishingly rare. */
const COUNTBACK = 20;

export interface Series {
  id: string;
  code: string | null;
  name: string;
  colour: string | null;
  teamName: string;
  /** Cumulative race + sprint points after each raced round; null before the driver's first start. */
  points: (number | null)[];
  /** Championship position after each raced round; null before the driver's first start. */
  position: (number | null)[];
}

export interface Progress {
  rounds: { round: number; raceName: string }[];
  series: Series[];
}

/** Rebuilds the drivers' championship round by round from the overview: points, then wins, then second places and so on. */
export function buildProgress(o: SeasonOverview): Progress {
  const rounds = o.rounds.filter((r) => o.drivers.some((d) => d.race[r.round])).map((r) => ({ round: r.round, raceName: r.raceName }));

  const state = o.drivers.map((d) => {
    let pts = 0;
    let started = false;
    const finishes: number[] = new Array(COUNTBACK).fill(0);
    return rounds.map(({ round }) => {
      const race = d.race[round];
      const sprint = d.sprint[round];
      started ||= Boolean(race || sprint);
      pts += (race?.points ?? 0) + (sprint?.points ?? 0);
      // positionText is a number only for classified finishers.
      const place = Number(race?.positionText);
      if (Number.isInteger(place) && place >= 1 && place <= COUNTBACK) finishes[place - 1]!++;
      return started ? { pts, finishes: [...finishes] } : null;
    });
  });

  const position = o.drivers.map((): (number | null)[] => rounds.map(() => null));
  rounds.forEach((_, i) => {
    o.drivers
      .map((_, di) => ({ di, s: state[di]![i] }))
      .filter((x): x is { di: number; s: NonNullable<typeof x.s> } => x.s !== null)
      .sort((a, b) => {
        if (a.s.pts !== b.s.pts) return b.s.pts - a.s.pts;
        const k = a.s.finishes.findIndex((n, j) => n !== b.s.finishes[j]);
        return k === -1 ? a.di - b.di : b.s.finishes[k]! - a.s.finishes[k]!;
      })
      .forEach((x, rank) => (position[x.di]![i] = rank + 1));
  });

  const series = o.drivers.map((d, di) => ({
    id: d.driverId,
    code: d.code,
    name: d.name,
    colour: d.colour,
    teamName: d.teamName,
    points: state[di]!.map((s) => s?.pts ?? null),
    position: position[di]!,
  }));
  return { rounds, series };
}
