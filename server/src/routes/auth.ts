import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as auth from '../controllers/auth.ts';
import { requireAuth } from '../middleware/auth.ts';
import { validate } from '../middleware/validate.ts';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);
const Login = z.object({ email, password });
const Register = Login.extend({ displayName: z.string().trim().min(1).max(40) });

export function authRouter() {
  const r = Router();
  // A new limiter per app instance keeps tests isolated.
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  r.post('/register', limiter, validate({ body: Register }), auth.register);
  r.post('/login', limiter, validate({ body: Login }), auth.login);
  r.post('/logout', auth.logout);
  r.get('/me', requireAuth, auth.me);
  return r;
}
