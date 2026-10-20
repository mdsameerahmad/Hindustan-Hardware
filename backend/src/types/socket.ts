import { DeliveryAssignmentStatus, DeliveryLocationRecord } from './index';

/**
 * Socket.IO Room Naming Convention
 */
export const TRACKING_ROOM_PREFIX = 'delivery:';

export function getDeliveryRoomName(deliveryId: string): string {
  return `${TRACKING_ROOM_PREFIX}${deliveryId}`;
}

/**
 * Client to Server Events
 */
export interface ClientToServerEvents {
  /**
   * Request subscription to real-time tracking updates for a specific delivery assignment
   */
  'delivery:subscribe': (
    payload: { deliveryId: string },
    callback?: (response: SocketSubscriptionResponse) => void
  ) => void;

  /**
   * Request unsubscription from real-time tracking updates
   */
  'delivery:unsubscribe': (
    payload: { deliveryId: string },
    callback?: (response: { success: boolean; message: string }) => void
  ) => void;
}

/**
 * Server to Client Events
 */
export interface ServerToClientEvents {
  /**
   * Broadcasted when a new valid location has been persisted in the database
   */
  'delivery:location_update': (payload: DeliveryLocationBroadcastPayload) => void;

  /**
   * Broadcasted when delivery assignment lifecycle status transitions (e.g. picked_up, out_for_delivery, delivered)
   */
  'delivery:status_update': (payload: DeliveryStatusBroadcastPayload) => void;

  /**
   * Emitted if access to tracking for this delivery is revoked
   */
  'delivery:access_revoked': (payload: { deliveryId: string; reason: string }) => void;

  /**
   * Standard socket error notification
   */
  'error': (error: { code: string; message: string }) => void;
}

/**
 * Inter-server Events (if clustering or internal bus is used)
 */
export interface InterServerEvents {
  ping: () => void;
}

/**
 * Socket Data stored on authenticated Socket instances
 */
export interface SocketData {
  user: {
    id: string;
    email: string;
    role: string;
  };
  subscribedDeliveries: Set<string>;
}

/**
 * Payload broadcasted on 'delivery:location_update'
 */
export interface DeliveryLocationBroadcastPayload {
  deliveryId: string;
  orderId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  deviceTimestamp: string;
  serverReceivedAt: string;
  isStale: boolean;
}

/**
 * Payload broadcasted on 'delivery:status_update'
 */
export interface DeliveryStatusBroadcastPayload {
  deliveryId: string;
  orderId: string;
  status: DeliveryAssignmentStatus;
  timestamp: string;
  notes?: string | null;
}

/**
 * Response returned via acknowledgement callback upon 'delivery:subscribe'
 */
export interface SocketSubscriptionResponse {
  success: boolean;
  deliveryId: string;
  message: string;
  isLiveTrackingAvailable?: boolean;
}
