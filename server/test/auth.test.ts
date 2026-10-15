import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { clearDb, startDb, stopDb } from './db.ts';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const fan = { email: 'Fan@Example.com', password: 'lights-out-2026', displayName: 'Fan' };

describe('auth', () => {
  it('registers, sets an httpOnly cookie and returns the public user', async () => {
    const res = await request(createApp()).post('/api/auth/register').send(fan);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'fan@example.com', displayName: 'Fan', favouriteDriverId: null });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects the same email in a different case with 409', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send(fan);
    const res = await request(app).post('/api/auth/register').send({ ...fan, email: 'fan@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a short password and a bad email with 400', async () => {
    const app = createApp();
    expect((await request(app).post('/api/auth/register').send({ ...fan, password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ ...fan, email: 'not-an-email' })).status).toBe(400);
  });

  it('logs in case-insensitively and rejects a wrong password with the same generic error', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send(fan);
    const ok = await request(app).post('/api/auth/login').send({ email: 'FAN@example.com', password: fan.password });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: fan.email, password: 'wrong-password' });
    const nobody = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(bad.body).toEqual(nobody.body);
  });

  it('/me works with the cookie and is 401 without it', async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(fan);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('fan@example.com');
    const anon = await request(app).get('/api/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered cookie', async () => {
    const res = await request(createApp()).get('/api/auth/me').set('Cookie', 'token=not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('logout clears the cookie', async () => {
    const agent = request.agent(createApp());
    await agent.post('/api/auth/register').send(fan);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('updates favourites and display name', async () => {
    const agent = request.agent(createApp());
    await agent.post('/api/auth/register').send(fan);
    const res = await agent.patch('/api/users/me').send({ favouriteDriverId: 'leclerc', favouriteTeamId: 'ferrari', displayName: 'Tifosi' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ favouriteDriverId: 'leclerc', favouriteTeamId: 'ferrari', displayName: 'Tifosi' });
    const cleared = await agent.patch('/api/users/me').send({ favouriteDriverId: null });
    expect(cleared.body.user.favouriteDriverId).toBeNull();
    expect((await agent.patch('/api/users/me').send({ favouriteDriverId: 'Bad Id!' })).status).toBe(400);
  });

  it('PATCH and DELETE require login', async () => {
    const app = createApp();
    expect((await request(app).patch('/api/users/me').send({ displayName: 'x' })).status).toBe(401);
    expect((await request(app).delete('/api/users/me')).status).toBe(401);
  });

  it('a deleted account\'s still-valid cookie no longer works', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send(fan);
    const cookie = reg.headers['set-cookie'] as unknown as string[];
    expect((await agent.delete('/api/users/me')).status).toBe(204);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('answers the login rate limit with the JSON error shape', async () => {
    const app = createApp();
    let res = await request(app).post('/api/auth/login').send({});
    for (let i = 0; i < 20; i++) res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('rejects mass-assignment of protected fields on PATCH /users/me', async () => {
    const agent = request.agent(createApp());
    await agent.post('/api/auth/register').send(fan);
    for (const body of [{ email: 'hacker@example.com' }, { passwordHash: 'x' }, { _id: '000000000000000000000000' }]) {
      expect((await agent.patch('/api/users/me').send(body)).status).toBe(400);
    }
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('fan@example.com');
  });
});
