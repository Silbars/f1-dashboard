import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/errors.ts';
import { errorHandler, notFound } from '../src/middleware/errorHandler.ts';
import { validate } from '../src/middleware/validate.ts';
import { yearSchema } from '../src/schemas.ts';

function testApp() {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.get('/app-error', () => {
    throw new AppError(418, 'TEAPOT', 'I am a teapot');
  });
  app.get('/crash', async () => {
    throw new Error('secret internal detail');
  });
  app.get('/year/:year', validate({ params: z.object({ year: yearSchema }) }), (_req, res) => {
    res.json(res.locals.params);
  });
  app.post('/echo', (req, res) => {
    res.json(req.body);
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('error handling', () => {
  it('turns AppError into the JSON error shape', async () => {
    const res = await request(testApp()).get('/app-error');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ error: { code: 'TEAPOT', message: 'I am a teapot' } });
  });

  it('hides unknown error details behind a generic 500', async () => {
    const res = await request(testApp()).get('/crash');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(testApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 BAD_JSON for a malformed body', async () => {
    const res = await request(testApp()).post('/echo').set('content-type', 'application/json').send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });

  it('returns 413 BAD_REQUEST for a body exceeding the size limit', async () => {
    const oversizedBody = JSON.stringify({ data: 'x'.repeat(2000) });
    const res = await request(testApp()).post('/echo').set('content-type', 'application/json').send(oversizedBody);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

describe('yearSchema via validate()', () => {
  const thisYear = new Date().getUTCFullYear();

  it('resolves "current" to this year', async () => {
    const res = await request(testApp()).get('/year/current');
    expect(res.body).toEqual({ year: thisYear });
  });

  it('accepts a past season as a number', async () => {
    const res = await request(testApp()).get('/year/2021');
    expect(res.body).toEqual({ year: 2021 });
  });

  it.each(['abc', '1949', String(thisYear + 1), '2020.5'])('rejects %s with 400 VALIDATION', async (year) => {
    const res = await request(testApp()).get(`/year/${year}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
