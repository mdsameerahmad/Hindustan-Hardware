import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '../../config/env';
import { logger } from '../utils/logger';
import { socketAuthMiddleware } from '../middleware/socketAuth';
import {
  ClientToServerEvents,
  DeliveryLocationBroadcastPayload,
  DeliveryStatusBroadcastPayload,
  getDeliveryRoomName,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  SocketSubscriptionResponse,
} from '../../types/socket';
import { deliveryIdParamSchema } from '../validation/trackingSchemas';
import { getSupabaseAdminClient } from '../../config/supabase';

let ioInstance: SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> | null = null;

export { getDeliveryRoomName };

/**
 * Close existing Socket.IO instance (useful for clean test isolation and server shutdown).
 */
export async function closeSocketIO(): Promise<void> {
  if (ioInstance) {
    await new Promise<void>((resolve) => {
      ioInstance!.close(() => {
        ioInstance = null;
        resolve();
      });
    });
  }
}

/**
 * Initialize Socket.IO with HTTP Server.
 * Enforces CORS origin allowlisting and server-side authentication.
 */
export function initSocketIO(
  httpServer: HttpServer
): SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  if (ioInstance) {
    logger.warn('Socket.IO is already initialized. Returning existing instance.');
    return ioInstance;
  }

  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (
          !origin ||
          env.CORS_ORIGIN.indexOf(origin) !== -1 ||
          env.CORS_ORIGIN.includes('*') ||
          (env.NODE_ENV !== 'production' &&
            (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)))
        ) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked: Origin ${origin} not allowed`), false);
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Keep max payload bounded for security
    maxHttpBufferSize: 1e5, // 100 KB
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Attach authentication middleware
  io.use(socketAuthMiddleware);

  // Connection handler
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    const user = socket.data.user;
    logger.info('Client connected to tracking socket', {
      socketId: socket.id,
      userId: user.id,
      role: user.role,
    });

    /**
     * Subscribe to delivery tracking room.
     * Enforces database-verified authorization (Customer ownership, Assigned Partner, or Admin).
     */
    socket.on(
      'delivery:subscribe',
      async (
        payload: { deliveryId: string },
        callback?: (response: SocketSubscriptionResponse) => void
      ) => {
        try {
          const parsed = deliveryIdParamSchema.safeParse(payload);
        if (!parsed.success) {
          if (callback) {
            callback({
              success: false,
              deliveryId: payload?.deliveryId || '',
              message: 'Invalid delivery ID format. Expected valid UUID.',
            });
          }
          return;
        }

        const deliveryId = parsed.data.deliveryId;
        const adminClient = getSupabaseAdminClient();
        if (!adminClient) {
          if (callback) {
            callback({
              success: false,
              deliveryId,
              message: 'Database service unavailable.',
            });
          }
          return;
        }

        // Verify assignment and authorization in database
        const { data: assignment, error: assignErr } = await adminClient
          .from('delivery_assignments')
          .select('id, customer_id, delivery_partner_id, status')
          .eq('id', deliveryId)
          .single();

        if (assignErr || !assignment) {
          if (callback) {
            callback({
              success: false,
              deliveryId,
              message: 'Delivery assignment not found.',
            });
          }
          return;
        }

        const isAuthorized =
          user.role === 'admin' ||
          user.role === 'staff' ||
          assignment.customer_id === user.id ||
          assignment.delivery_partner_id === user.id;

        if (!isAuthorized) {
          logger.warn('Unauthorized room subscription attempt', {
            socketId: socket.id,
            userId: user.id,
            deliveryId,
          });
          if (callback) {
            callback({
              success: false,
              deliveryId,
              message: 'Access denied. You are not authorized to track this delivery.',
            });
          }
          return;
        }

        const roomName = getDeliveryRoomName(deliveryId);
        await socket.join(roomName);
        socket.data.subscribedDeliveries?.add(deliveryId);

        logger.info('Socket joined tracking room', {
          socketId: socket.id,
          userId: user.id,
          room: roomName,
        });

        if (callback) {
          callback({
            success: true,
            deliveryId,
            message: 'Successfully subscribed to real-time delivery tracking.',
            isLiveTrackingAvailable: ['assigned', 'picked_up', 'out_for_delivery'].includes(assignment.status),
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('Error in delivery:subscribe handler', { error: errorMsg, socketId: socket.id });
        if (callback) {
          callback({
            success: false,
            deliveryId: payload?.deliveryId || '',
            message: 'Internal subscription error.',
          });
        }
      }
    });

    /**
     * Unsubscribe from delivery tracking room
     */
    socket.on(
      'delivery:unsubscribe',
      async (
        payload: { deliveryId: string },
        callback?: (response: { success: boolean; message: string }) => void
      ) => {
        try {
          const deliveryId = payload?.deliveryId;
          if (deliveryId) {
            const roomName = getDeliveryRoomName(deliveryId);
            await socket.leave(roomName);
            socket.data.subscribedDeliveries?.delete(deliveryId);
          }
          if (callback) {
            callback({ success: true, message: 'Unsubscribed from tracking updates.' });
          }
        } catch {
          if (callback) {
            callback({ success: false, message: 'Failed to unsubscribe.' });
          }
        }
      }
    );

    // Cleanup on disconnect
    socket.on('disconnect', (reason) => {
      logger.info('Client disconnected from tracking socket', {
        socketId: socket.id,
        userId: user.id,
        reason,
      });
      socket.data.subscribedDeliveries?.clear();
    });
  });

  ioInstance = io;
  return io;
}

/**
 * Access the initialized Socket.IO instance.
 */
export function getSocketIO(): SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> | null {
  return ioInstance;
}

/**
 * Broadcast persisted delivery location to authorized room subscribers.
 * Only called after successful database persistence.
 */
export function broadcastDeliveryLocation(payload: DeliveryLocationBroadcastPayload): boolean {
  if (!ioInstance) {
    logger.debug('Socket.IO instance not initialized. Skipping broadcast.');
    return false;
  }

  const roomName = getDeliveryRoomName(payload.deliveryId);
  ioInstance.to(roomName).emit('delivery:location_update', payload);

  logger.debug('Broadcasted delivery:location_update to room', {
    room: roomName,
    deliveryId: payload.deliveryId,
    latitude: payload.latitude,
    longitude: payload.longitude,
  });

  return true;
}

/**
 * Broadcast delivery status transition to authorized room subscribers.
 */
export function broadcastDeliveryStatus(payload: DeliveryStatusBroadcastPayload): boolean {
  if (!ioInstance) {
    logger.debug('Socket.IO instance not initialized. Skipping broadcast.');
    return false;
  }

  const roomName = getDeliveryRoomName(payload.deliveryId);
  ioInstance.to(roomName).emit('delivery:status_update', payload);

  logger.info('Broadcasted delivery:status_update to room', {
    room: roomName,
    deliveryId: payload.deliveryId,
    status: payload.status,
  });

  return true;
}
