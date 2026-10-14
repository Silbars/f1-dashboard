import type { RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.ts';
import { AppError } from '../errors.ts';

const COOKIE = 'token';
const WEEK_MS = 7 * 24 * 3600 * 1000;
const cookieOptions = () => ({ httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' });

export function setAuthCookie(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: WEEK_MS });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE, cookieOptions());
}

function readUserId(cookies: Record<string, unknown> | undefined): string | null {
  const token = cookies?.[COOKIE];
  if (typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const userId = readUserId(req.cookies);
  if (!userId) return next(new AppError(401, 'UNAUTHENTICATED', 'Please log in'));
  res.locals.userId = userId;
  next();
};

export const optionalAuth: RequestHandler = (req, res, next) => {
  res.locals.userId = readUserId(req.cookies);
  next();
};
