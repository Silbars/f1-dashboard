import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { AppError } from '../errors.ts';
import { clearAuthCookie, setAuthCookie } from '../middleware/auth.ts';
import { toPublicUser, UserModel } from '../models/User.ts';

const ROUNDS = 12;
// Compared against when the email doesn't exist, so both failure cases take the same time.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', ROUNDS);
const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

export async function register(_req: Request, res: Response) {
  const { email, password, displayName } = res.locals.body as { email: string; password: string; displayName: string };
  if (await UserModel.exists({ email })) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  try {
    const user = await UserModel.create({ email, displayName, passwordHash: await bcrypt.hash(password, ROUNDS) });
    setAuthCookie(res, user._id.toString());
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw err;
  }
}

export async function login(_req: Request, res: Response) {
  const { email, password } = res.locals.body as { email: string; password: string };
  const user = await UserModel.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw invalid();
  setAuthCookie(res, user._id.toString());
  res.json({ user: toPublicUser(user) });
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.status(204).end();
}

export async function me(_req: Request, res: Response) {
  const user = await UserModel.findById(res.locals.userId);
  if (!user) {
    clearAuthCookie(res);
    throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
  }
  res.json({ user: toPublicUser(user) });
}
