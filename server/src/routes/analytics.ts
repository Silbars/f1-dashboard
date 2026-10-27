import { Router } from 'express';
import { z } from 'zod';
import * as analytics from '../controllers/analytics.ts';
import { validate } from '../middleware/validate.ts';
import { idSchema, yearSchema } from '../schemas.ts';

export function analyticsRouter() {
  const r = Router();
  r.get(
    '/:year/head-to-head',
    validate({
      params: z.object({ year: yearSchema }),
      query: z.object({ a: idSchema, b: idSchema }).refine((q) => q.a !== q.b, { message: 'Pick two different drivers', path: ['b'] }),
    }),
    analytics.headToHead,
  );
  return r;
}
