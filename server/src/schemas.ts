import { z } from 'zod';

const thisYear = () => new Date().getUTCFullYear();

export const yearSchema = z
  .union([z.literal('current').transform(() => thisYear()), z.coerce.number().int().min(1950)])
  .refine((y) => y <= thisYear(), { message: 'Season is in the future' });

export const idSchema = z.string().regex(/^[a-z0-9_]{1,64}$/, 'Invalid id');
