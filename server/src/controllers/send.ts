import type { Response } from 'express';
import type { CacheResult } from '../services/cache.ts';

export const stale = (...results: CacheResult<unknown>[]): boolean => results.some((r) => r.stale);

export function send<T>(res: Response, result: CacheResult<T>): void {
  if (result.stale) res.set('X-Data-Stale', 'true');
  res.json(result.data);
}
