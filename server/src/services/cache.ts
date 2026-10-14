import { AppError } from '../errors.ts';

const HOUR = 3_600_000;

/** A past season fetched after it ended never changes; anything else is refreshed hourly. */
export function isStale(season: number, fetchedAt: Date, now: Date): boolean {
  if (season < now.getUTCFullYear() && fetchedAt.getUTCFullYear() > season) return false;
  return now.getTime() - fetchedAt.getTime() > HOUR;
}

export interface CacheResult<T> {
  data: T;
  stale: boolean;
}

export async function cachedQuery<T>(opts: {
  season: number;
  load: () => Promise<{ data: T; fetchedAt: Date } | null>;
  fetch: () => Promise<T>;
  save: (data: T, fetchedAt: Date) => Promise<void>;
  now?: () => Date;
}): Promise<CacheResult<T>> {
  const now = (opts.now ?? (() => new Date()))();
  const cached = await opts.load();
  if (cached && !isStale(opts.season, cached.fetchedAt, now)) return { data: cached.data, stale: false };

  let fresh: T;
  try {
    fresh = await opts.fetch();
  } catch (err) {
    if (cached) {
      console.warn('Upstream failed, serving stale cache:', (err as Error).message);
      return { data: cached.data, stale: true };
    }
    throw new AppError(503, 'UPSTREAM_UNAVAILABLE', 'The F1 data source is unavailable right now. Please try again shortly.');
  }
  await opts.save(fresh, now);
  return { data: fresh, stale: false };
}
