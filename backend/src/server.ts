import { createApp } from './app';
import { env } from './config/env';
import { logger } from './common/utils/logger';
import { checkSupabaseHealth } from './config/supabase';
import http from 'http';

function startServer(): void {
  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, env.HOST, async () => {
    logger.info(`Server started on http://${env.HOST === '0.0.0.0' ? 'localhost' : env.HOST}:${env.PORT}`);

    // Check and print clean database connection status
    try {
      const health = await checkSupabaseHealth();
      if (health.status === 'healthy') {
        logger.info(`Supabase DB Connected`);
      } else {
        logger.error(`Supabase DB Failed: ${health.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Supabase DB Failed: ${message}`);
    }
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force close if graceful shutdown takes too long (e.g. 10s)
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled exceptions and rejections
  process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught Exception thrown', {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

// Start if not loaded as a test module
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
