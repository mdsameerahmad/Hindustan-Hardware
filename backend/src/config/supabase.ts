import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DependencyStatus } from '../types';
import { env } from './env';

let publicSupabaseClient: SupabaseClient | null = null;
let adminSupabaseClient: SupabaseClient | null = null;

/**
 * Checks whether Supabase URL and at least one valid key (Anon or Service Role) are present.
 */
export function isSupabaseConfigured(): boolean {
  const hasUrl = Boolean(env.SUPABASE_URL && env.SUPABASE_URL.trim() !== '');
  const hasAnonKey = Boolean(env.SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY.trim() !== '');
  const hasServiceKey = Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.trim() !== '');
  return hasUrl && (hasAnonKey || hasServiceKey);
}

/**
 * Checks whether Supabase Service Role Key is present.
 * Administrative operations only require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_URL.trim() !== '' &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY.trim() !== ''
  );
}

/**
 * Returns Supabase client for general/client-level requests.
 * Uses SUPABASE_ANON_KEY if configured, otherwise safely falls back to admin client.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const hasAnonKey = Boolean(env.SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY.trim() !== '');
  const hasUrl = Boolean(env.SUPABASE_URL && env.SUPABASE_URL.trim() !== '');

  if (hasUrl && hasAnonKey) {
    if (!publicSupabaseClient) {
      publicSupabaseClient = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
    return publicSupabaseClient;
  }

  // Fallback: If SUPABASE_ANON_KEY is not configured but admin service role client is available,
  // use admin client to keep server-side reads and authentication operations functioning seamlessly
  if (isSupabaseAdminConfigured()) {
    return getSupabaseAdminClient();
  }

  return null;
}

/**
 * Creates an authenticated Supabase client for a specific user's Bearer token.
 * This client executes requests in the security context of that user, respecting RLS.
 */
export function getAuthenticatedSupabaseClient(accessToken: string): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const activeKey = (env.SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY.trim() !== '')
    ? env.SUPABASE_ANON_KEY
    : env.SUPABASE_SERVICE_ROLE_KEY;

  if (!activeKey) return null;

  return createClient(env.SUPABASE_URL!, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Verifies a user's access token using an isolated client so the admin singleton's
 * service role authentication header is never polluted or overridden by user sessions.
 */
export async function verifyUserAccessToken(token: string) {
  if (!isSupabaseConfigured()) {
    return { data: { user: null }, error: new Error('Supabase is not configured.') };
  }
  const client = getSupabaseClient();
  if (client && client.auth && typeof client.auth.getUser === 'function') {
    return client.auth.getUser(token);
  }
  const activeKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!activeKey) {
    return { data: { user: null }, error: new Error('Supabase API key is missing.') };
  }
  const verifier = createClient(env.SUPABASE_URL!, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return verifier.auth.getUser(token);
}

/**
 * Returns privileged server administrative Supabase client.
 * Explicitly locks Authorization header to SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 * WARNING: Never expose this to frontend clients.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }

  if (!adminSupabaseClient) {
    adminSupabaseClient = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    });
  }

  return adminSupabaseClient;
}

/**
 * Health check / verification for Supabase connection.
 * Does not throw; returns a structured DependencyStatus.
 */
export function checkSupabaseHealth(): Promise<DependencyStatus> {
  const startTime = Date.now();

  const client = getSupabaseAdminClient() || getSupabaseClient();
  if (!client) {
    return Promise.resolve({
      status: 'not_configured',
      message: 'Supabase credentials not configured.',
    });
  }

  return (async () => {
    try {
      const { error } = await client
        .from('categories')
        .select('id')
        .limit(1);

      const latencyMs = Date.now() - startTime;
      if (error) {
        return {
          status: 'unreachable',
          message: error.message,
          latencyMs,
        };
      }
      return {
        status: 'healthy',
        message: 'Supabase service is reachable and responsive.',
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        status: 'unreachable',
        message: err?.message || 'Supabase service is unreachable',
        latencyMs,
      };
    }
  })();
}
