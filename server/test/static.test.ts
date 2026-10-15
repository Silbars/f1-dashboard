import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'client-'));
writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
mkdirSync(path.join(dir, 'assets'));
writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
const app = createApp({ clientDir: dir });

describe('serving the built client', () => {
  it('serves assets', async () => {
    const res = await request(app).get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.text).toBe('console.log(1)');
  });

  it('falls back to index.html for client routes', async () => {
    const res = await request(app).get('/drivers/2025/norris');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it('keeps unknown API routes as JSON 404s', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
