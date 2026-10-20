import { Router, Request, Response } from 'express';
import { sendSuccess } from '../common/utils/response';
import { env } from '../config/env';
import { checkSupabaseHealth } from '../config/supabase';
import { HealthCheckResult, ReadinessCheckResult } from '../types';

export const healthRouter = Router();

const APP_VERSION = '1.0.0';

/**
 * GET /health or /api/v1/health
 * Simple process liveness and API status probe.
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  const result: HealthCheckResult = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    version: APP_VERSION,
  };

  return sendSuccess(res, result, 'API is operational');
});

/**
 * GET /api/v1/health/ready
 * Readiness check verifying dependencies such as Supabase.
 */
healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const supabaseStatus = await checkSupabaseHealth();

  const isReady = supabaseStatus.status === 'healthy';

  const result: ReadinessCheckResult = {
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    dependencies: {
      supabase: supabaseStatus,
    },
  };

  // If dependency is not configured or unreachable, return 503 Service Unavailable
  const statusCode = isReady ? 200 : 503;
  return sendSuccess(
    res,
    result,
    isReady ? 'Service is ready' : 'Service is not fully ready (dependencies pending)',
    statusCode
  );
});
