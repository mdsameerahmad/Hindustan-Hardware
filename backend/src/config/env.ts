import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Resolve from the backend project root, regardless of the process working directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000').transform((val) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      throw new Error('PORT must be a valid number');
    }
    return parsed;
  }),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173,http://localhost:8443').transform((val) => {
    return val.split(',').map((origin) => origin.trim()).filter(Boolean);
  }),
  // Supabase configurations - optional in development/test, but if set must be valid URLs/strings
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL').optional().or(z.literal('')),
  SUPABASE_ANON_KEY: z.string().min(1).optional().or(z.literal('')),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional().or(z.literal('')),
  DELIVERY_OTP_ENCRYPTION_KEY: z.string().optional().or(z.literal('')),
  REQUEST_BODY_LIMIT: z.string().default('1mb'),
  // Live Delivery Tracking configuration
  TRACKING_FRESHNESS_THRESHOLD_SECONDS: z.string().default('120').transform((val) => parseInt(val, 10) || 120),
  TRACKING_MAX_ACCURACY_METERS: z.string().default('500').transform((val) => parseInt(val, 10) || 500),
  TRACKING_MAX_UPDATE_FREQUENCY_SECONDS: z.string().default('5').transform((val) => parseInt(val, 10) || 5),
  // OSRM Routing Service Configuration
  OSRM_ROUTER_URL: z.string().url().default('https://router.project-osrm.org'),
  ROUTING_CACHE_TTL_SECONDS: z.string().default('60').transform((val) => parseInt(val, 10) || 60),
  ROUTING_MIN_DISTANCE_RECALCULATE_METERS: z.string().default('50').transform((val) => parseInt(val, 10) || 50),
});

export type EnvConfig = z.infer<typeof envSchema>;

function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = (result.error.issues || [])
      .map((err) => `${Array.isArray(err.path) ? err.path.join('.') : String(err.path)}: ${err.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }

  return result.data;
}

export const env = validateEnv();
