import type { Driver, Race, RaceResult, ResultType, Standings, StandingsKind, Team } from '@f1/shared';
import type { Model } from 'mongoose';
import { CacheMeta } from '../models/CacheMeta.ts';
import { DriverModel } from '../models/Driver.ts';
import { RaceModel } from '../models/Race.ts';
import { RaceResultModel } from '../models/RaceResult.ts';
import { StandingsModel } from '../models/Standings.ts';
import { TeamModel } from '../models/Team.ts';
import { type CacheResult, cachedQuery } from './cache.ts';
import { jolpica } from './jolpica.ts';

const HIDE = { _id: 0, __v: 0 } as const;

const inflight = new Map<string, Promise<CacheResult<unknown>>>();

function withMeta<T>(
  key: string,
  season: number,
  load: () => Promise<T>,
  fetch: () => Promise<T>,
  save: (data: T) => Promise<void>,
): Promise<CacheResult<T>> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<CacheResult<T>>;
  const p = cachedQuery({
    season,
    load: async () => {
      const meta = await CacheMeta.findOne({ key }).lean();
      return meta ? { data: await load(), fetchedAt: meta.fetchedAt } : null;
    },
    fetch,
    save: async (data, fetchedAt) => {
      await save(data);
      await CacheMeta.updateOne({ key }, { $set: { fetchedAt } }, { upsert: true });
    },
  });
  inflight.set(key, p);
  return p.finally(() => inflight.delete(key));
}

/** Upserts every doc by its key and deletes docs in `scope` that are no longer present. withMeta ensures one refresh per key at a time within this server process. */
async function replaceAll<T extends object>(
  model: Model<T>,
  docs: T[],
  keyOf: (d: T) => Record<string, unknown>,
  scope: Record<string, unknown>,
) {
  if (docs.length === 0) {
    await model.deleteMany(scope);
    return;
  }
  await model.bulkWrite(docs.map((d) => ({ replaceOne: { filter: keyOf(d), replacement: d, upsert: true } })) as never);
  await model.deleteMany({ ...scope, $nor: docs.map(keyOf) });
}

export const f1data = {
  schedule: (season: number) =>
    withMeta<Race[]>(
      `schedule:${season}`,
      season,
      () => RaceModel.find({ season }, HIDE).sort({ round: 1 }).lean<Race[]>(),
      () => jolpica.schedule(season),
      (races) => replaceAll(RaceModel, races, (r) => ({ season: r.season, round: r.round }), { season }),
    ),

  results: (season: number, round: number, type: ResultType) =>
    withMeta<RaceResult | null>(
      `results:${season}:${round}:${type}`,
      season,
      async () => (await RaceResultModel.findOne({ season, round, type }, HIDE).lean<RaceResult>()) ?? null,
      () => jolpica.results(season, round, type),
      async (r) => {
        if (r) await RaceResultModel.replaceOne({ season, round, type }, r, { upsert: true });
      },
    ),

  seasonResults: (season: number, type: ResultType) =>
    withMeta<RaceResult[]>(
      `seasonResults:${season}:${type}`,
      season,
      () => RaceResultModel.find({ season, type }, HIDE).sort({ round: 1 }).lean<RaceResult[]>(),
      () => jolpica.seasonResults(season, type),
      (list) => replaceAll(RaceResultModel, list, (r) => ({ season: r.season, round: r.round, type: r.type }), { season, type }),
    ),

  standings: (season: number, kind: StandingsKind) =>
    withMeta<Standings | null>(
      `standings:${season}:${kind}`,
      season,
      async () => (await StandingsModel.findOne({ season, kind }, HIDE).lean<Standings>()) ?? null,
      () => jolpica.standings(season, kind),
      async (s) => {
        if (s) await StandingsModel.replaceOne({ season, kind }, s, { upsert: true });
      },
    ),

  drivers: (season: number) =>
    withMeta<Driver[]>(
      `drivers:${season}`,
      season,
      () => DriverModel.find({ season }, { ...HIDE, season: 0 }).sort({ familyName: 1 }).lean<Driver[]>(),
      () => jolpica.drivers(season),
      (drivers) =>
        replaceAll(
          DriverModel,
          drivers.map((d) => ({ ...d, season })),
          (d) => ({ season, driverId: d.driverId }),
          { season },
        ),
    ),

  teams: (season: number) =>
    withMeta<Team[]>(
      `teams:${season}`,
      season,
      () => TeamModel.find({ season }, { ...HIDE, season: 0 }).sort({ name: 1 }).lean<Team[]>(),
      () => jolpica.teams(season),
      (teams) =>
        replaceAll(
          TeamModel,
          teams.map((t) => ({ ...t, season })),
          (t) => ({ season, teamId: t.teamId }),
          { season },
        ),
    ),
};
