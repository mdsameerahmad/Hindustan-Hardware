import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { requestIdMiddleware } from './common/middleware/requestId';
import { requestLogger } from './common/middleware/requestLogger';
import { notFoundHandler } from './common/middleware/notFoundHandler';
import { errorHandler } from './common/middleware/errorHandler';
import { apiV1Router } from './routes';
import { sendSuccess } from './common/utils/response';

export function createApp(): Application {
  const app = express();

  // 1. Basic security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. CORS configuration with explicit origin allowlist
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGIN.indexOf(origin) !== -1 || env.CORS_ORIGIN.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked: Origin ${origin} not allowed`), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    })
  );

  // 3. Request identifier
  app.use(requestIdMiddleware);

  // 4. Request logging
  app.use(requestLogger);

  // 5. Body parser with configurable size limits
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.REQUEST_BODY_LIMIT }));

  // 6. Base /health check (process liveness probe)
  app.get('/health', (_req: Request, res: Response) => {
    return sendSuccess(
      res,
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: env.NODE_ENV,
      },
      'Process is healthy'
    );
  });

  // 7. Versioned API routes (/api/v1)
  app.use('/api/v1', apiV1Router);

  // 8. 404 Handler for undefined routes
  app.use(notFoundHandler);

  // 9. Centralized Error Handler
  app.use(errorHandler);

  return app;
}
