import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors.ts';
import { cachedQuery, isStale } from '../src/services/cache.ts';

const at = (iso: string) => new Date(iso);

describe('isStale', () => {
  const now = at('2026-10-15T12:00:00Z');

  it('never expires a past season fetched after it ended', () => {
    expect(isStale(2024, at('2025-01-10T00:00:00Z'), now)).toBe(false);
  });

  it('expires a past season that was fetched while it was still running', () => {
    expect(isStale(2025, at('2025-12-01T00:00:00Z'), now)).toBe(true);
  });

  it('expires current-season data after one hour', () => {
    expect(isStale(2026, at('2026-10-15T11:30:00Z'), now)).toBe(false);
    expect(isStale(2026, at('2026-10-15T10:59:00Z'), now)).toBe(true);
  });
});

describe('cachedQuery', () => {
  const now = () => at('2026-10-15T12:00:00Z');
  const fresh = { data: 'cached', fetchedAt: at('2026-10-15T11:50:00Z') };
  const old = { data: 'cached', fetchedAt: at('2026-10-15T09:00:00Z') };

  it('returns fresh cache without calling upstream', async () => {
    const fetch = vi.fn();
    const r = await cachedQuery({ season: 2026, load: async () => fresh, fetch, save: vi.fn(), now });
    expect(r).toEqual({ data: 'cached', stale: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refetches and saves when the cache is stale', async () => {
    const save = vi.fn();
    const r = await cachedQuery({ season: 2026, load: async () => old, fetch: async () => 'new', save, now });
    expect(r).toEqual({ data: 'new', stale: false });
    expect(save).toHaveBeenCalledWith('new', now());
  });

  it('fetches when nothing is cached', async () => {
    const r = await cachedQuery({ season: 2026, load: async () => null, fetch: async () => 'new', save: vi.fn(), now });
    expect(r).toEqual({ data: 'new', stale: false });
  });

  it('serves the stale copy when upstream fails', async () => {
    const r = await cachedQuery({
      season: 2026,
      load: async () => old,
      fetch: async () => {
        throw new Error('down');
      },
      save: vi.fn(),
      now,
    });
    expect(r).toEqual({ data: 'cached', stale: true });
  });

  it('throws 503 UPSTREAM_UNAVAILABLE when upstream fails and nothing is cached', async () => {
    const p = cachedQuery({
      season: 2026,
      load: async () => null,
      fetch: async () => {
        throw new Error('down');
      },
      save: vi.fn(),
      now,
    });
    await expect(p).rejects.toMatchObject({ status: 503, code: 'UPSTREAM_UNAVAILABLE' });
    await expect(p).rejects.toBeInstanceOf(AppError);
  });
});
