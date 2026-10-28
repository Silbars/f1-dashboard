import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('Content-Security-Policy', () => {
  it('lets the schedule map load Mapbox tiles and run its worker', async () => {
    const csp = (await request(createApp()).get('/api/health')).headers['content-security-policy'] as string;
    expect(csp).toContain("connect-src 'self' https://api.mapbox.com https://events.mapbox.com");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("img-src 'self' data: blob:");
  });
});
