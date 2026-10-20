import { NextFunction, Request, Response } from 'express';
import { getSupabaseAdminClient, isSupabaseConfigured, verifyUserAccessToken } from '../../config/supabase';
import { AuthenticatedUser, UserProfile, UserRole } from '../../types';
import { InternalServerError, UnauthorizedError } from '../errors';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      accessToken?: string;
    }
  }
}

/**
 * Middleware that validates the Bearer token against Supabase Auth.
 * Fetches the user's persistent profile and role from the database.
 * If authentication fails or Supabase is not configured, halts with appropriate error.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header. Expected Bearer token.'));
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next(new UnauthorizedError('Access token is empty.'));
  }

  if (!isSupabaseConfigured()) {
    logger.error('Authentication attempt while Supabase is not configured');
    return next(new InternalServerError('Authentication service unavailable.'));
  }

  try {
    // 1. Verify token server-side with isolated Supabase verifier client
    const { data: authData, error: authError } = await verifyUserAccessToken(token);

    if (authError || !authData?.user) {
      logger.warn('Token validation failed', { error: authError?.message });
      return next(new UnauthorizedError(authError?.message || 'Invalid or expired access token.'));
    }

    const authUser = authData.user;

    // 2. Query persistent profile and role from Supabase PostgreSQL
    // We use the admin/trusted client to read role and profile reliably
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return next(new InternalServerError('Database client unavailable.'));
    }
    const { data: profileData, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, full_name, phone, avatar_url, created_at, updated_at')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profileData) {
      logger.error('Failed to load user profile from database', {
        userId: authUser.id,
        error: profileError?.message,
      });
      return next(new UnauthorizedError('User account profile could not be retrieved.'));
    }

    const profile: UserProfile = {
      id: profileData.id,
      role: (profileData.role as UserRole) || 'customer',
      full_name: profileData.full_name || '',
      phone: profileData.phone || null,
      avatar_url: profileData.avatar_url || null,
      created_at: profileData.created_at,
      updated_at: profileData.updated_at,
    };

    req.user = {
      id: authUser.id,
      email: authUser.email || '',
      role: profile.role,
      profile,
    };
    req.accessToken = token;

    next();
  } catch (err: unknown) {
    logger.error('Unexpected error during token verification', {
      error: err instanceof Error ? err.message : String(err),
    });
    return next(new UnauthorizedError('Failed to authenticate request.'));
  }
}
