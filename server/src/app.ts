import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { seasonsRouter } from './routes/seasons.ts';

export function createApp(_opts: { clientDir?: string } = {}) {
  const app = express();
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1); // Render's proxy; needed for rate limiting by IP
  // Render serves HTTPS itself; upgrade-insecure-requests would break plain-http local runs (Docker on localhost).
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/seasons', seasonsRouter());

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
