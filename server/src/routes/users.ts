import { Router } from 'express';
import { z } from 'zod';
import * as users from '../controllers/users.ts';
import { requireAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';
import { idSchema } from '../schemas.ts';

const UpdateMe = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    favouriteDriverId: idSchema.nullable(),
    favouriteTeamId: idSchema.nullable(),
  })
  .partial()
  .strict();

export function usersRouter() {
  const r = Router();
  r.patch('/me', requireAuth, validate({ body: UpdateMe }), users.updateMe);
  r.delete('/me', requireAuth, users.deleteMe);
  return r;
}
