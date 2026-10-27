import type { DriverDetail, ResultType, Standings, TeamDetail } from '@f1/shared';
import type { Request, Response } from 'express';
import { AppError } from '../errors.ts';
import { withOutlines } from '../services/circuitOutlines.ts';
import { f1data } from '../services/f1data.ts';
import { send, stale } from './send.ts';

type P = { year: number; round: number; kind: 'drivers' | 'constructors'; driverId: string; teamId: string };
const params = (res: Response) => res.locals.params as P;

export async function schedule(_req: Request, res: Response) {
  const r = await f1data.schedule(params(res).year);
  send(res, { ...r, data: await withOutlines(r.data) });
}

export async function results(_req: Request, res: Response) {
  const { year, round } = params(res);
  const { type } = res.locals.query as { type: ResultType };
  const r = await f1data.results(year, round, type);
  if (r.data) return send(res, r);
  const sched = await f1data.schedule(year);
  const race = sched.data.find((x) => x.round === round);
  if (!race) throw new AppError(404, 'NOT_FOUND', `There is no round ${round} in ${year}`);
  send(res, { data: { season: year, round, type, raceName: race.name, entries: [] }, stale: stale(r, sched) });
}

export async function standings(_req: Request, res: Response) {
  const { year, kind } = params(res);
  const k = kind === 'drivers' ? 'driver' : 'constructor';
  const s = await f1data.standings(year, k);
  const empty: Standings = { season: year, afterRound: 0, kind: k, entries: [] };
  send(res, { data: s.data ?? empty, stale: s.stale });
}

export async function drivers(_req: Request, res: Response) {
  send(res, await f1data.drivers(params(res).year));
}

export async function driver(_req: Request, res: Response) {
  const { year, driverId } = params(res);
  const [ds, races, sprints, teams] = await Promise.all([
    f1data.drivers(year),
    f1data.seasonResults(year, 'race'),
    f1data.seasonResults(year, 'sprint'),
    f1data.teams(year),
  ]);
  const d = ds.data.find((x) => x.driverId === driverId);
  if (!d) throw new AppError(404, 'NOT_FOUND', `No driver "${driverId}" in ${year}`);

  const rows = races.data.flatMap((r) =>
    r.entries
      .filter((e) => e.driverId === driverId)
      .map((e) => ({ round: r.round, raceName: r.raceName, position: e.position, positionText: e.positionText, points: e.points, grid: e.grid, status: e.status, teamId: e.teamId })),
  );
  const sprintPoints = sprints.data.flatMap((r) => r.entries).filter((e) => e.driverId === driverId).reduce((sum, e) => sum + e.points, 0);
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
    f1data.seasonResults(year, 'race'),
    f1data.seasonResults(year, 'sprint'),
    f1data.drivers(year),
  ]);
  const t = ts.data.find((x) => x.teamId === teamId);
  if (!t) throw new AppError(404, 'NOT_FOUND', `No team "${teamId}" in ${year}`);

  const sprintByRound = new Map(
    sprints.data.map((r) => [r.round, r.entries.filter((e) => e.teamId === teamId).reduce((s, e) => s + e.points, 0)]),
  );
  const driverIds = new Set<string>();
  const rows = races.data.map((r) => {
    const mine = r.entries.filter((e) => e.teamId === teamId);
    mine.forEach((e) => driverIds.add(e.driverId));
    const positions = mine.map((e) => e.position).filter((p): p is number => p !== null);
    return {
      round: r.round,
      raceName: r.raceName,
      points: mine.reduce((s, e) => s + e.points, 0) + (sprintByRound.get(r.round) ?? 0),
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
