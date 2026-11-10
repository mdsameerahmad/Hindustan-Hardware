import { createHash, randomBytes } from 'crypto';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from '../common/errors';
import { getSupabaseAdminClient } from '../config/supabase';
import { logger } from '../common/utils/logger';
import {
  DeliveryAssignmentStatus,
  OrderLiveTrackingResponse,
  OrderStatus,
} from '../types';
import { DeliveryTrackingService } from './deliveryTrackingService';
import { RoadRoutingService } from './roadRoutingService';
import { ServiceabilityService } from './serviceabilityService';
import { decryptDeliveryOtp } from './deliveryOtpService';

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function unavailableShare(): NotFoundError {
  return new NotFoundError('Tracking link is invalid, expired, or has been revoked.');
}

export class TrackingShareService {
  static async createShareLink(params: {
    orderId: string;
    actorId: string;
    expiresInHours: number;
  }): Promise<{ id: string; token: string; trackingPath: string; expiresAt: string }> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database service is unavailable.');

    const { data: order, error: orderError } = await client
      .from('orders')
      .select('id, status')
      .eq('id', params.orderId)
      .maybeSingle();

    if (orderError) {
      logger.error('Failed to verify order before creating tracking share', {
        orderId: params.orderId,
        error: orderError.message,
      });
      throw new InternalServerError('Unable to verify the order for tracking-link creation.');
    }
    if (!order) throw new NotFoundError('Order not found.');
    if (order.status === 'cancelled') {
      throw new BadRequestError('Cannot create a tracking link for a cancelled order.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + params.expiresInHours * 60 * 60 * 1000).toISOString();
    const { data: share, error: insertError } = await client
      .from('tracking_share_links')
      .insert({
        order_id: params.orderId,
        token_hash: hashShareToken(token),
        expires_at: expiresAt,
        created_by: params.actorId,
      })
      .select('id, expires_at')
      .single();

    if (insertError || !share) {
      logger.error('Failed to create order tracking share', {
        orderId: params.orderId,
        error: insertError?.message,
      });
      throw new InternalServerError('Unable to create the order tracking link.');
    }

    return {
      id: share.id,
      token,
      trackingPath: `/shared-tracking/${token}`,
      expiresAt: share.expires_at,
    };
  }

  static async listShareLinks(orderId: string): Promise<Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database service is unavailable.');

    const { data: order, error: orderError } = await client
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) {
      logger.error('Failed to verify order before listing tracking shares', {
        orderId,
        error: orderError.message,
      });
      throw new InternalServerError('Unable to verify the order tracking links.');
    }
    if (!order) throw new NotFoundError('Order not found.');

    const { data: rows, error } = await client
      .from('tracking_share_links')
      .select('id, created_at, expires_at, revoked_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list order tracking shares', { orderId, error: error.message });
      throw new InternalServerError('Unable to retrieve the order tracking links.');
    }

    return (rows || []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    }));
  }

  static async revokeShareLink(orderId: string, shareId: string): Promise<void> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database service is unavailable.');

    const { data: share, error: shareError } = await client
      .from('tracking_share_links')
      .select('id, revoked_at')
      .eq('id', shareId)
      .eq('order_id', orderId)
      .maybeSingle();

    if (shareError) {
      logger.error('Failed to find order tracking share to revoke', {
        orderId,
        shareId,
        error: shareError.message,
      });
      throw new InternalServerError('Unable to verify the tracking link before revocation.');
    }
    if (!share) throw new NotFoundError('Tracking link not found.');
    if (share.revoked_at) return;

    const { error } = await client
      .from('tracking_share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', shareId)
      .eq('order_id', orderId)
      .is('revoked_at', null);

    if (error) {
      logger.error('Failed to revoke order tracking share', {
        orderId,
        shareId,
        error: error.message,
      });
      throw new InternalServerError('Unable to revoke the tracking link.');
    }
  }

  static async getSharedTracking(token: string): Promise<{
    expiresAt: string;
    orderTracking: OrderLiveTrackingResponse;
    route: Awaited<ReturnType<typeof RoadRoutingService.getDeliveryRoute>> | null;
    eta: Awaited<ReturnType<typeof RoadRoutingService.getDeliveryEta>> | null;
  }> {
    if (!SHARE_TOKEN_PATTERN.test(token)) throw unavailableShare();

    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Tracking database service is unavailable.');

    const now = new Date().toISOString();
    const { data: share, error: shareError } = await client
      .from('tracking_share_links')
      .select('id, order_id, expires_at')
      .eq('token_hash', hashShareToken(token))
      .is('revoked_at', null)
      .gt('expires_at', now)
      .maybeSingle();

    if (shareError) {
      logger.error('Failed to verify public tracking token', { error: shareError.message });
      throw new InternalServerError('Unable to retrieve shared order tracking.');
    }
    if (!share) throw unavailableShare();

    const { data: order, error: orderError } = await client
      .from('orders')
      .select('id, order_number, status, shipping_address_snapshot, delivery_otp_ciphertext')
      .eq('id', share.order_id)
      .maybeSingle();

    if (orderError) {
      logger.error('Failed to retrieve order through tracking share', {
        orderId: share.order_id,
        error: orderError.message,
      });
      throw new InternalServerError('Unable to retrieve shared order tracking.');
    }
    if (!order) throw unavailableShare();

    const { error: accessUpdateError } = await client
      .from('tracking_share_links')
      .update({ last_accessed_at: now })
      .eq('id', share.id);
    if (accessUpdateError) {
      logger.warn('Failed to update tracking share access timestamp', {
        shareId: share.id,
        error: accessUpdateError.message,
      });
    }

    const { data: assignment, error: assignmentError } = await client
      .from('delivery_assignments')
      .select('id, status, assigned_at, picked_up_at, completed_at, delivery_partner_id, delivery_fee')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignmentError) {
      logger.error('Failed to retrieve shared delivery assignment', {
        orderId: order.id,
        error: assignmentError.message,
      });
      throw new InternalServerError('Unable to retrieve shared delivery tracking status.');
    }

    const snapshot = (order.shipping_address_snapshot || {}) as Record<string, unknown>;
    const destination = ServiceabilityService.resolveAddressCoordinates(snapshot);
    const store = RoadRoutingService.getStoreOrigin();
    let deliveryPartner: {
      fullName: string;
      phone: string | null;
      avatarUrl?: string | null;
    } | null = null;
    let latestLocation: OrderLiveTrackingResponse['latestLocation'] = null;
    let route: Awaited<ReturnType<typeof RoadRoutingService.getDeliveryRoute>> | null = null;
    let eta: Awaited<ReturnType<typeof RoadRoutingService.getDeliveryEta>> | null = null;

    if (assignment) {
      const { data: partner, error: partnerError } = await client
        .from('profiles')
        .select('full_name')
        .eq('id', assignment.delivery_partner_id)
        .maybeSingle();
      if (partnerError) {
        logger.warn('Unable to load public tracking partner name', {
          assignmentId: assignment.id,
          error: partnerError.message,
        });
      }
      if (partner) {
        deliveryPartner = {
          fullName: partner.full_name || 'Hindustan Hardware Partner',
          phone: null,
        };
      }

      const { data: location, error: locationError } = await client
        .from('delivery_locations')
        .select('latitude, longitude, accuracy, speed, heading, device_timestamp, server_received_at')
        .eq('delivery_assignment_id', assignment.id)
        .maybeSingle();

      if (locationError) {
        logger.error('Failed to retrieve shared delivery location', {
          assignmentId: assignment.id,
          error: locationError.message,
        });
        throw new InternalServerError('Unable to retrieve the shared delivery location.');
      }

      if (location) {
        latestLocation = {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracy: location.accuracy == null ? null : Number(location.accuracy),
          speed: location.speed == null ? null : Number(location.speed),
          heading: location.heading == null ? null : Number(location.heading),
          deviceTimestamp: location.device_timestamp,
          serverReceivedAt: location.server_received_at,
          isStale: DeliveryTrackingService.isLocationStale(location.server_received_at),
        };
      }

      if (
        !['delivered', 'failed', 'cancelled'].includes(assignment.status) &&
        assignment.delivery_partner_id
      ) {
        const routeResult = await Promise.allSettled([
          RoadRoutingService.getDeliveryRoute(assignment.id, assignment.delivery_partner_id, 'delivery_partner'),
          RoadRoutingService.getDeliveryEta(assignment.id, assignment.delivery_partner_id, 'delivery_partner'),
        ]);
        if (routeResult[0].status === 'fulfilled') {
          route = routeResult[0].value;
        } else {
          logger.warn('Unable to calculate route for shared tracking link', {
            assignmentId: assignment.id,
            error: routeResult[0].reason instanceof Error ? routeResult[0].reason.message : String(routeResult[0].reason),
          });
        }
        if (routeResult[1].status === 'fulfilled') {
          eta = routeResult[1].value;
        } else {
          logger.warn('Unable to calculate ETA for shared tracking link', {
            assignmentId: assignment.id,
            error: routeResult[1].reason instanceof Error ? routeResult[1].reason.message : String(routeResult[1].reason),
          });
        }
      }
    }

    const assignmentStatus = assignment?.status as DeliveryAssignmentStatus | undefined;
    const isActive = Boolean(
      assignmentStatus && ['assigned', 'picked_up', 'out_for_delivery'].includes(assignmentStatus)
    );
    const isStale = latestLocation?.isStale ?? false;
    let trackingMessage = 'Delivery partner has not yet been assigned to this order.';
    if (assignmentStatus === 'delivered') {
      trackingMessage = 'Order has been delivered.';
    } else if (assignmentStatus && ['failed', 'cancelled'].includes(assignmentStatus)) {
      trackingMessage = `Delivery is ${assignmentStatus}.`;
    } else if (isActive && latestLocation && isStale) {
      trackingMessage = 'Location update is temporarily delayed. Showing last verified position.';
    } else if (isActive && latestLocation) {
      trackingMessage = 'Live GPS location is actively updating.';
    } else if (isActive) {
      trackingMessage = 'Awaiting initial GPS signal from delivery partner.';
    }

    return {
      expiresAt: share.expires_at,
      orderTracking: {
        orderId: order.id,
        orderNumber: order.order_number,
        orderStatus: order.status as OrderStatus,
        deliveryOtp: order.delivery_otp_ciphertext
          ? decryptDeliveryOtp(order.delivery_otp_ciphertext)
          : null,
        assignment: assignment
          ? {
              id: assignment.id,
              deliveryPartnerId: assignment.delivery_partner_id,
              status: assignmentStatus!,
              assignedAt: assignment.assigned_at,
              pickedUpAt: assignment.picked_up_at,
              completedAt: assignment.completed_at,
              deliveryFee: Number(assignment.delivery_fee) || 0,
              deliveryPartner,
            }
          : null,
        latestLocation,
        store,
        destination,
        isLiveTrackingAvailable: isActive && Boolean(latestLocation) && !isStale,
        trackingMessage,
      },
      route,
      eta,
    };
  }
}
