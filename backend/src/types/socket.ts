import { DeliveryAssignmentStatus, DeliveryLocationRecord } from './index';

/**
 * Socket.IO Room Naming Convention
 */
export const TRACKING_ROOM_PREFIX = 'delivery:';
export const ORDER_ROOM_PREFIX = 'order:';

export function getDeliveryRoomName(deliveryId: string): string {
  return `${TRACKING_ROOM_PREFIX}${deliveryId}`;
}

export function getOrderRoomName(orderId: string): string {
  return `${ORDER_ROOM_PREFIX}${orderId}`;
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

  /**
   * Request subscription to real-time status updates for a specific order UUID
   */
  'order:subscribe': (
    payload: { orderId: string },
    callback?: (response: { success: boolean; orderId: string; message: string }) => void
  ) => void;

  /**
   * Request unsubscription from real-time order status updates
   */
  'order:unsubscribe': (
    payload: { orderId: string },
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
   * Broadcasted when an order status transitions (e.g. confirmed, processing, shipped, delivered, cancelled)
   */
  'order:status_update': (payload: OrderStatusBroadcastPayload) => void;

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
  estimatedArrivalTimestamp?: string | null;
  etaSeconds?: number | null;
  distanceRemainingMeters?: number | null;
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
 * Payload broadcasted on 'order:status_update'
 */
export interface OrderStatusBroadcastPayload {
  orderId: string;
  orderNumber?: string;
  status: string;
  previousStatus?: string | null;
  reason?: string | null;
  timestamp: string;
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
