import type { ReplaySessionSummary } from '@f1/shared';
import { type RequestHandler, Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.ts';
import { AppError } from '../errors.ts';
import { ReplaySessionModel } from '../models/ReplaySession.ts';
import { startWarm, warmStatus } from '../services/replay/warm.ts';

export function replayRouter() {
  const r = Router();
  r.get('/sessions', async (_req, res) => {
    const docs = await ReplaySessionModel.find({}, { data: 0, drivers: 0, outline: 0 }).sort({ startsAt: -1 }).lean();
    const out: ReplaySessionSummary[] = docs.map((d) => ({
      sessionKey: d.sessionKey,
      meetingKey: d.meetingKey,
      meetingName: d.meetingName,
      countryName: d.countryName,
      sessionType: d.sessionType,
      startsAt: d.startsAt.toISOString(),
      durationMs: d.durationMs,
      totalLaps: d.totalLaps,
    }));
    res.json(out);
  });
  return r;
}

/** Constant-time comparison of `Authorization: Bearer <token>`; a missing or unset token never matches. */
const requireWarmToken: RequestHandler = (req, _res, next) => {
  const expected = config.WARM_TOKEN;
  const given = Buffer.from(req.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${expected ?? ''}`);
  if (!expected || given.length !== want.length || !timingSafeEqual(given, want)) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Missing or invalid token'));
  }
  next();
};

export function internalRouter() {
  const r = Router();
  r.use(requireWarmToken);
  r.post('/warm', (_req, res) => res.status(202).json(startWarm()));
  r.get('/warm', (_req, res) => res.json(warmStatus()));
  return r;
}
