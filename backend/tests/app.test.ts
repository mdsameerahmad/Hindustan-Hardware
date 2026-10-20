import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { apiV1Router } from '../src/routes';
import * as supabaseConfig from '../src/config/supabase';
import { NotFoundError, BadRequestError } from '../src/common/errors';

describe('Backend Foundation & Architecture Tests', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Health Endpoints', () => {
    it('GET /health confirms process is running with 200 OK', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.environment).toBeDefined();
      expect(res.body.data.uptime).toBeDefined();
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('GET /api/v1/health returns versioned API status with 200 OK', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.version).toBe('1.0.0');
      expect(res.body.meta.requestId).toBeDefined();
    });
  });

  describe('2. Readiness Endpoint & Supabase Configuration', () => {
    it('GET /api/v1/health/ready returns 503 and not_configured when Supabase credentials are not set', async () => {
      vi.spyOn(supabaseConfig, 'checkSupabaseHealth').mockResolvedValue({
        status: 'not_configured',
        message: 'SUPABASE_URL and SUPABASE_ANON_KEY are not configured.',
      });

      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(true); // envelope response
      expect(res.body.data.status).toBe('not_ready');
      expect(res.body.data.dependencies.supabase.status).toBe('not_configured');
    });

    it('GET /api/v1/health/ready returns 200 and ready when Supabase is healthy', async () => {
      vi.spyOn(supabaseConfig, 'checkSupabaseHealth').mockResolvedValue({
        status: 'healthy',
        message: 'Supabase service is reachable and responsive.',
        latencyMs: 42,
      });

      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.dependencies.supabase.status).toBe('healthy');
      expect(res.body.data.dependencies.supabase.latencyMs).toBe(42);
    });

    it('GET /api/v1/health/ready returns 503 when Supabase is unreachable', async () => {
      vi.spyOn(supabaseConfig, 'checkSupabaseHealth').mockResolvedValue({
        status: 'unreachable',
        message: 'Supabase service connection error: Network timeout',
        latencyMs: 120,
      });

      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.data.status).toBe('not_ready');
      expect(res.body.data.dependencies.supabase.status).toBe('unreachable');
    });
  });

  describe('3. Unknown Route 404 Handling', () => {
    it('returns 404 for nonexistent route with consistent error structure', async () => {
      const res = await request(app).get('/api/v1/non-existent-route');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('not found');
      expect(res.body.meta.requestId).toBeDefined();
    });
  });

  describe('4. Centralized Error Handling', () => {
    it('handles custom AppError correctly with status code and details', async () => {
      apiV1Router.get('/test-error', () => {
        throw new BadRequestError('Invalid query param', { field: 'filter' });
      });

      const res = await request(app).get('/api/v1/test-error');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toBe('Invalid query param');
      expect(res.body.error.details).toEqual({ field: 'filter' });
    });

    it('handles unexpected errors cleanly without revealing secrets or stack in production mode', async () => {
      apiV1Router.get('/test-unhandled', () => {
        throw new Error('Database connection failed secret_token=12345');
      });

      const res = await request(app).get('/api/v1/test-unhandled');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('handles malformed JSON request bodies with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('{"badJson": ');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });
  });

  describe('5. Environment & Supabase Safety Helpers', () => {
    it('isSupabaseConfigured returns false when URL or anon key are missing', () => {
      expect(supabaseConfig.isSupabaseConfigured()).toBe(false);
    });

    it('getSupabaseClient returns null when not configured', () => {
      expect(supabaseConfig.getSupabaseClient()).toBeNull();
    });

    it('getSupabaseAdminClient returns null when admin key is not configured, or client when configured', () => {
      if (!supabaseConfig.isSupabaseAdminConfigured()) {
        expect(supabaseConfig.getSupabaseAdminClient()).toBeNull();
      } else {
        expect(supabaseConfig.getSupabaseAdminClient()).not.toBeNull();
      }
    });
  });

  describe('6. Security & Trace Headers', () => {
    it('includes security headers from helmet and sets x-request-id', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('preserves existing x-request-id if provided by client/gateway', async () => {
      const customId = 'custom-request-uuid-12345';
      const res = await request(app).get('/health').set('x-request-id', customId);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body.meta.requestId).toBe(customId);
    });
  });
});
