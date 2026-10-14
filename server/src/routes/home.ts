import { Router } from 'express';
import { home } from '../controllers/home.ts';
import { optionalAuth } from '../middleware/auth.ts';

export function homeRouter() {
  const r = Router();
  r.get('/', optionalAuth, home);
  return r;
}
