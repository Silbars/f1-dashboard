import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { analyticsRouter } from './routes/analytics.ts';
import { authRouter } from './routes/auth.ts';
import { internalRouter, replayRouter } from './routes/replay.ts';
import { homeRouter } from './routes/home.ts';
import { seasonsRouter } from './routes/seasons.ts';
import { usersRouter } from './routes/users.ts';

export function createApp(opts: { clientDir?: string } = {}) {
  const app = express();
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1); // Render's proxy; needed for rate limiting by IP
  // Render serves HTTPS itself; upgrade-insecure-requests would break plain-http local runs (Docker on localhost).
  // Mapbox GL (schedule map) fetches its style, tiles and glyphs from Mapbox, runs a blob worker and turns images into blobs.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: null,
          connectSrc: ["'self'", 'https://api.mapbox.com', 'https://events.mapbox.com'],
          workerSrc: ["'self'", 'blob:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/seasons', seasonsRouter());
  app.use('/api/auth', authRouter());
  app.use('/api/users', usersRouter());
  app.use('/api/home', homeRouter());
  app.use('/api/analytics', analyticsRouter());
  app.use('/api/replay', replayRouter());
  app.use('/api/internal', internalRouter());

  app.use('/api', notFound);

  if (opts.clientDir) {
    const clientDir = opts.clientDir;
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.use('/assets', (_req, res) => {
      res.sendStatus(404);
    });
    app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: clientDir }));
  }

  app.use(errorHandler);

  return app;
}
