import { Socket } from 'socket.io';
import { getSupabaseAdminClient, isSupabaseConfigured, verifyUserAccessToken } from '../../config/supabase';
import { logger } from '../utils/logger';
import { UserRole } from '../../types';
import { SocketData } from '../../types/socket';

/**
 * Socket.IO authentication middleware.
 * Validates the auth token supplied in handshake (socket.handshake.auth.token or Authorization header)
 * against Supabase Auth, queries persistent profile role, and attaches verified identity to socket.data.
 */
export async function socketAuthMiddleware(
  socket: Socket<any, any, any, SocketData>,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // 1. Extract token from socket.handshake.auth.token or socket.handshake.headers.authorization
    let token: string | undefined = socket.handshake.auth?.token;

    if (!token && socket.handshake.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }

    if (!token) {
      logger.warn('Socket connection rejected: Missing auth token', { socketId: socket.id });
      return next(new Error('Authentication required. Missing auth token.'));
    }

    if (!isSupabaseConfigured()) {
      logger.error('Socket authentication failed: Supabase not configured');
      return next(new Error('Authentication service unavailable.'));
    }

    // 2. Authoritative server-side verification using verifyUserAccessToken
    const { data: authData, error: authError } = await verifyUserAccessToken(token);

    if (authError || !authData?.user) {
      logger.warn('Socket connection rejected: Invalid or expired access token', {
        socketId: socket.id,
        error: authError?.message,
      });
      return next(new Error(authError?.message || 'Invalid or expired access token.'));
    }

    const authUser = authData.user;

    // 3. Query authoritative persistent profile and role
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return next(new Error('Database service unavailable.'));
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profile) {
      logger.error('Socket connection rejected: User profile not found', {
        userId: authUser.id,
        socketId: socket.id,
      });
      return next(new Error('User account profile could not be retrieved.'));
    }

    // 4. Attach verified credentials to socket.data (never trust client-supplied identity)
    socket.data.user = {
      id: authUser.id,
      email: authUser.email || '',
      role: (profile.role as UserRole) || 'customer',
    };
    socket.data.subscribedDeliveries = new Set<string>();

    logger.info('Socket authenticated successfully', {
      socketId: socket.id,
      userId: authUser.id,
      role: socket.data.user.role,
    });

    next();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Unexpected error in socket authentication middleware', { error: errorMsg });
    next(new Error('Authentication failure.'));
  }
}
