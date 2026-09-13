import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { router } from './api/routes.js';
import { config } from './infrastructure/config.js';
import { initializeRedisSchema, redisClient } from './infrastructure/redis.js';
const app = express();
const PORT = config.server.port || 3000;

app.use(cors({
  origin: config.cors.origin,
}));

app.use(express.json());
app.use('/api/v1', router);

// Catch-all 404: turns Express's default HTML "Cannot POST /x" page into a
// JSON response naming the exact method+path that didn't match, so a
// missing/misregistered route is immediately obvious instead of looking
// like an unhandled server error.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// Centralized error handler: turns Multer validation errors (bad mimetype,
// file too large) and any other thrown errors into consistent JSON
// responses instead of Express's default HTML error page.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Error) {
    console.error('Unhandled error:', err);
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Prints every registered route at boot, so a "Cannot POST /x" from a
// client is easy to cross-check against what the server actually mounted -
// e.g. after adding a route but forgetting to rebuild/restart.
interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
}

function logRegisteredRoutes(): void {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  const routes = stack
    .filter((layer): layer is Required<RouteLayer> => Boolean(layer.route))
    .map((layer) => {
      const methods = Object.entries(layer.route.methods)
        .filter(([, enabled]) => enabled)
        .map(([method]) => method.toUpperCase())
        .join(',');
      return `${methods} /api/v1${layer.route.path}`;
    });
  console.log(`Registered routes:\n  ${routes.join('\n  ')}`);
}

// Initialize Redis vector schema, then start the Express server
initializeRedisSchema()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`CogniStream API is listening on port ${PORT}`);
      logRegisteredRoutes();
    });

    const shutdown = async (signal: string) => {
      console.log(`${signal} received, shutting down gracefully...`);
      server.close(async () => {
        await redisClient.quit();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  })
  .catch((error) => {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  });