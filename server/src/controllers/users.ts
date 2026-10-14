import type { Request, Response } from 'express';
import { AppError } from '../errors.ts';
import { clearAuthCookie } from '../middleware/auth.ts';
import { toPublicUser, UserModel } from '../models/User.ts';

export async function updateMe(_req: Request, res: Response) {
  const user = await UserModel.findByIdAndUpdate(res.locals.userId, { $set: res.locals.body }, { returnDocument: 'after', runValidators: true });
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
  res.json({ user: toPublicUser(user) });
}

export async function deleteMe(_req: Request, res: Response) {
  await UserModel.findByIdAndDelete(res.locals.userId);
  clearAuthCookie(res);
  res.status(204).end();
}
