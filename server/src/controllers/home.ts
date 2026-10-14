import type { Request, Response } from 'express';
import { UserModel } from '../models/User.ts';
import { f1data } from '../services/f1data.ts';
import { buildHome } from '../services/home.ts';
import { send, stale } from './send.ts';

export async function home(_req: Request, res: Response) {
  const season = new Date().getUTCFullYear();
  const [schedule, drivers, constructors] = await Promise.all([
    f1data.schedule(season),
    f1data.standings(season, 'driver'),
    f1data.standings(season, 'constructor'),
  ]);
  const userId = res.locals.userId as string | null;
  const user = userId ? await UserModel.findById(userId).lean() : null;
  const data = buildHome({ season, schedule: schedule.data, drivers: drivers.data, constructors: constructors.data, now: new Date(), user });
  send(res, { data, stale: stale(schedule, drivers, constructors) });
}
