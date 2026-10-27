import type { Request, Response } from 'express';
import { AppError } from '../errors.ts';
import { headToHead as compare } from '../services/analytics.ts';
import { f1data } from '../services/f1data.ts';
import { send, stale } from './send.ts';

export async function headToHead(_req: Request, res: Response) {
  const { year } = res.locals.params as { year: number };
  const { a, b } = res.locals.query as { a: string; b: string };
  const [ds, races, sprints, qualifying] = await Promise.all([
    f1data.drivers(year),
    f1data.seasonResults(year, 'race'),
    f1data.seasonResults(year, 'sprint'),
    f1data.seasonResults(year, 'qualifying'),
  ]);
  const da = ds.data.find((d) => d.driverId === a);
  const db = ds.data.find((d) => d.driverId === b);
  if (!da || !db) throw new AppError(404, 'NOT_FOUND', `No driver "${da ? b : a}" in ${year}`);
  send(res, { data: compare(year, da, db, races.data, sprints.data, qualifying.data), stale: stale(ds, races, sprints, qualifying) });
}
