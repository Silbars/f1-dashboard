import { Router } from 'express';
import { z } from 'zod';
import * as seasons from '../controllers/seasons.ts';
import { validate } from '../middleware/validate.ts';
import { idSchema, yearSchema } from '../schemas.ts';

export function seasonsRouter() {
  const r = Router();
  const Year = z.object({ year: yearSchema });

  r.get('/:year/schedule', validate({ params: Year }), seasons.schedule);
  r.get('/:year/overview', validate({ params: Year }), seasons.overview);
  r.get(
    '/:year/races/:round/results',
    validate({
      params: Year.extend({ round: z.coerce.number().int().min(1).max(40) }),
      query: z.object({ type: z.enum(['race', 'sprint', 'qualifying']).default('race') }),
    }),
    seasons.results,
  );
  r.get('/:year/standings/:kind', validate({ params: Year.extend({ kind: z.enum(['drivers', 'constructors']) }) }), seasons.standings);
  r.get('/:year/drivers', validate({ params: Year }), seasons.drivers);
  r.get('/:year/drivers/:driverId', validate({ params: Year.extend({ driverId: idSchema }) }), seasons.driver);
  r.get('/:year/teams', validate({ params: Year }), seasons.teams);
  r.get('/:year/teams/:teamId', validate({ params: Year.extend({ teamId: idSchema }) }), seasons.team);
  return r;
}
