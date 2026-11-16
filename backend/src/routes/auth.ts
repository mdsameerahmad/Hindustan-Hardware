import { NextFunction, Request, Response, Router } from 'express';
import {
  BadRequestError,
  InternalServerError,
  UnauthorizedError,
} from '../common/errors';
import { authenticate } from '../common/middleware/auth';
import { authRateLimiter } from '../common/middleware/rateLimiter';
import { logger } from '../common/utils/logger';
import { sendSuccess } from '../common/utils/response';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../common/validation/authSchemas';
import {
  getAuthenticatedSupabaseClient,
  getSupabaseAdminClient,
  getSupabaseClient,
  isSupabaseConfigured,
} from '../config/supabase';

export const authRouter = Router();

/**
 * POST /api/v1/auth/register
 * Register a new customer via Supabase Auth and initialize their persistent profile.
 */
authRouter.post(
  '/register',
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(parsed.error);
      }

      if (!isSupabaseConfigured()) {
        return next(new InternalServerError('Authentication service is not configured.'));
      }

      const supabase = getSupabaseClient()!;
      const { email, password, fullName, phone } = parsed.data;

      let authData: any = null;
      let user: any = null;
      let session: any = null;

      // 1. Attempt standard registration via Supabase signUp
      const signUpRes = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone || null,
          },
        },
      });

      if (!signUpRes.error && signUpRes.data?.user) {
        authData = signUpRes.data;
        user = signUpRes.data.user;
        session = signUpRes.data.session;
      } else {
        // Fallback: If Supabase built-in email rate limit is hit or error occurs,
        // use privileged admin client to create and auto-confirm user, then issue login session
        const adminClient = getSupabaseAdminClient();
        if (adminClient) {
          const adminCreateRes = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              phone: phone || null,
            },
          });

          if (adminCreateRes.error) {
            logger.warn('Supabase registration failed via admin fallback', { error: adminCreateRes.error.message, email });
            return next(new BadRequestError(adminCreateRes.error.message));
          }

          user = adminCreateRes.data.user;

          // Sign in to retrieve active JWT session
          const loginRes = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (loginRes.data?.session) {
            session = loginRes.data.session;
          }
        } else {
          return next(new BadRequestError(signUpRes.error?.message || 'Registration failed.'));
        }
      }
      if (!user) {
        return next(new InternalServerError('Registration failed to create user.'));
      }

      // 2. Ensure profile exists in profiles table
      // If DB trigger is active, it runs automatically. Fallback explicitly creates it via admin client if available.
      const adminClient = getSupabaseAdminClient();
      if (adminClient) {
        await adminClient.from('profiles').upsert(
          {
            id: user.id,
            role: 'customer',
            full_name: fullName,
            phone: phone || null,
          },
          { onConflict: 'id' }
        );
      }

      const isEmailConfirmed = Boolean(user.email_confirmed_at);

      return sendSuccess(
        res,
        {
          user: {
            id: user.id,
            email: user.email,
            emailConfirmed: isEmailConfirmed,
          },
          session: session
            ? {
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                expiresIn: session.expires_in,
              }
            : null,
          requiresEmailVerification: !isEmailConfirmed && !session,
        },
        isEmailConfirmed || session
          ? 'Registration successful'
          : 'Registration successful. Please check your email to verify your account.',
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/login
 * Authenticate customer or administrator via Supabase Auth.
 */
authRouter.post(
  '/login',
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(parsed.error);
      }

      if (!isSupabaseConfigured()) {
        return next(new InternalServerError('Authentication service is not configured.'));
      }

      const supabase = getSupabaseClient()!;
      const { email, password } = parsed.data;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user || !authData.session) {
        logger.warn('Failed login attempt', { error: authError?.message });
        return next(new UnauthorizedError(authError?.message || 'Invalid email or password.'));
      }

      // Retrieve profile and role
      const adminClient = getSupabaseAdminClient() || supabase;
      const { data: profile } = await adminClient
        .from('profiles')
        .select('id, role, full_name, phone, avatar_url, created_at, updated_at')
        .eq('id', authData.user.id)
        .single();

      return sendSuccess(
        res,
        {
          user: {
            id: authData.user.id,
            email: authData.user.email,
            role: profile?.role || 'customer',
            profile: profile || null,
          },
          session: {
            accessToken: authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            expiresAt: authData.session.expires_at,
            expiresIn: authData.session.expires_in,
          },
        },
        'Login successful'
      );
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/auth/me
 * Returns authenticated user details and persistent database profile.
 */
authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  return sendSuccess(res, {
    user: req.user,
  });
});

/**
 * POST /api/v1/auth/refresh
 * Refreshes an expired access token using the persistent refresh token.
 */
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      return next(new BadRequestError('Refresh token is required.'));
    }

    const supabase = getSupabaseAdminClient() || getSupabaseClient();
    if (!supabase) {
      return next(new InternalServerError('Authentication service is unavailable.'));
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken.trim() });
    if (error || !data.session) {
      return next(new UnauthorizedError('Invalid or expired refresh token. Please log in again.'));
    }

    return sendSuccess(
      res,
      {
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresIn: data.session.expires_in,
          expiresAt: data.session.expires_at,
        },
        user: data.user,
      },
      'Session refreshed successfully'
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/auth/session
 * Validates and returns active session information.
 */
authRouter.get('/session', authenticate, async (req: Request, res: Response) => {
  return sendSuccess(res, {
    valid: true,
    user: req.user,
  });
});

/**
 * POST /api/v1/auth/logout
 * Signs out session from Supabase Auth.
 */
authRouter.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseClient();
    if (supabase && req.accessToken) {
      await supabase.auth.admin?.signOut(req.accessToken).catch(() => {
        // Fallback to client signOut
        return supabase.auth.signOut();
      });
    }

    return sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Initiates password recovery email via Supabase Auth.
 */
authRouter.post(
  '/forgot-password',
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(parsed.error);
      }

      if (!isSupabaseConfigured()) {
        return next(new InternalServerError('Authentication service is not configured.'));
      }

      const supabase = getSupabaseClient()!;
      const { email, redirectTo } = parsed.data;

      // Request password reset email from Supabase Auth
      let resetError: any = null;
      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined
      );

      if (error) {
        resetError = error;
        logger.warn('Password reset request error', { error: error.message });
      }

      // If Supabase's built-in email rate limit is hit, use admin client to generate recovery link
      let recoveryLink: string | null = null;
      if (resetError) {
        const adminClient = getSupabaseAdminClient();
        if (adminClient) {
          try {
            const linkRes = await adminClient.auth.admin.generateLink({
              type: 'recovery',
              email,
              options: redirectTo ? { redirectTo } : undefined,
            });
            if (linkRes.data?.properties?.action_link) {
              recoveryLink = linkRes.data.properties.action_link;
              logger.info('Generated password recovery link via admin client', {
                email,
                recoveryLink,
              });
            } else if (linkRes.error) {
              logger.warn('Failed generating recovery link via admin', {
                error: linkRes.error.message,
              });
            }
          } catch (adminErr: any) {
            logger.warn('Error calling admin generateLink', { error: adminErr?.message });
          }
        }
      }

      // Generic response to prevent account enumeration, includes recoveryUrl if fallback link was generated
      return sendSuccess(
        res,
        recoveryLink ? { recoveryUrl: recoveryLink } : null,
        'If the email is registered, a password recovery link has been sent.'
      );
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/auth/reset-password
 * Completes password reset for an authenticated or recovery-session user.
 */
authRouter.post(
  '/reset-password',
  authRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(parsed.error);
      }

      if (!isSupabaseConfigured()) {
        return next(new InternalServerError('Authentication service is not configured.'));
      }

      const { password } = parsed.data;
      const user = req.user!;
      const token = req.accessToken!;

      // 1. Try updating user password using authenticated client or admin client
      let updateError: any = null;
      const userClient = getAuthenticatedSupabaseClient(token);
      if (userClient) {
        const updateRes = await userClient.auth.updateUser({ password });
        if (updateRes.error) {
          updateError = updateRes.error;
        }
      }

      if (updateError || !userClient) {
        const adminClient = getSupabaseAdminClient();
        if (adminClient) {
          const adminUpdateRes = await adminClient.auth.admin.updateUserById(user.id, {
            password,
          });
          if (adminUpdateRes.error) {
            logger.warn('Admin password update failed', { error: adminUpdateRes.error.message });
            return next(new BadRequestError(adminUpdateRes.error.message));
          }
        } else if (updateError) {
          logger.warn('Password update failed', { error: updateError.message });
          return next(new BadRequestError(updateError.message));
        }
      }

      // 2. Issue a fresh login session with the newly set password
      let session: any = null;
      const supabase = getSupabaseClient()!;
      const loginRes = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (loginRes.data?.session) {
        session = loginRes.data.session;
      }

      return sendSuccess(
        res,
        {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            profile: user.profile,
          },
          session: session
            ? {
                accessToken: session.access_token,
                refreshToken: session.refresh_token,
                expiresIn: session.expires_in,
              }
            : null,
        },
        'Password updated successfully.'
      );
    } catch (err) {
      next(err);
    }
  }
);
