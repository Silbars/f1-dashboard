import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** Parses params/query/body with zod; results go to res.locals because Express 5's req.query is read-only. */
export function validate(schemas: { params?: ZodType; query?: ZodType; body?: ZodType }): RequestHandler {
  return (req, res, next) => {
    res.locals.params = schemas.params ? schemas.params.parse(req.params) : req.params;
    res.locals.query = schemas.query ? schemas.query.parse(req.query) : req.query;
    res.locals.body = schemas.body ? schemas.body.parse(req.body) : req.body;
    next();
  };
}
