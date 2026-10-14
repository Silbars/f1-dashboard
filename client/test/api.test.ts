import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/lib/api';

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers })));

describe('api', () => {
  it('returns data and the stale flag', async () => {
    respond(200, [1, 2], { 'X-Data-Stale': 'true' });
    await expect(api.get('/seasons/2025/schedule')).resolves.toEqual({ data: [1, 2], stale: true });
    expect(fetch).toHaveBeenCalledWith('/api/seasons/2025/schedule', expect.objectContaining({ method: 'GET' }));
  });

  it('throws ApiError with the server code and message', async () => {
    respond(409, { error: { code: 'EMAIL_TAKEN', message: 'Taken' } });
    await expect(api.post('/auth/register', {})).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN', message: 'Taken' });
  });

  it('handles a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(api.get('/home')).rejects.toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('turns a network failure into ApiError NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await api.get('/home').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK');
  });

  it('handles 204 No Content', async () => {
    respond(204, undefined);
    await expect(api.del('/users/me')).resolves.toEqual({ data: undefined, stale: false });
  });
});
