import { getSupabaseAdminClient, getSupabaseClient } from '../config/supabase';
import { env } from '../config/env';
import { logger } from '../common/utils/logger';
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
} from '../common/errors';
import { HINDUSTAN_HARDWARE_STORE } from '../config/store';
import {
  DeliveryEtaResponse,
  RouteCalculationResult,
  RouteCoordinate,
  StoreOriginInfo,
} from '../types';
import { OsrmRoutingProvider } from './osrmRoutingProvider';
import { isLocationStale } from './deliveryTrackingService';

interface CachedRouteEntry {
  route: RouteCalculationResult;
  cachedAtMs: number;
}

export class RoadRoutingService {
  // In-memory route cache keyed by deliveryId
  private static routeCache = new Map<string, CachedRouteEntry>();

  /**
   * Return the authoritative store location metadata.
   */
  static getStoreOrigin(): StoreOriginInfo {
    return {
      name: HINDUSTAN_HARDWARE_STORE.name,
      address: HINDUSTAN_HARDWARE_STORE.address,
      city: HINDUSTAN_HARDWARE_STORE.city,
      state: HINDUSTAN_HARDWARE_STORE.state,
      postalCode: HINDUSTAN_HARDWARE_STORE.postalCode,
      latitude: HINDUSTAN_HARDWARE_STORE.latitude,
      longitude: HINDUSTAN_HARDWARE_STORE.longitude,
      coordinateStatus: HINDUSTAN_HARDWARE_STORE.coordinateStatus,
    };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula (meters)
   */
  static calculateHaversineDistanceMeters(
    coord1: RouteCoordinate,
    coord2: RouteCoordinate
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
    const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.latitude * Math.PI) / 180) *
        Math.cos((coord2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Retrieve authoritative delivery assignment, latest GPS location (or store origin if partner has not yet broadcast),
   * and order destination coordinates.
   */
  static async getDeliveryCoordinatesContext(
    deliveryId: string,
    requestingUserId: string,
    userRole: string
  ): Promise<{
    assignment: {
      id: string;
      orderId: string;
      customerId: string;
      deliveryPartnerId: string;
      status: string;
    };
    store: StoreOriginInfo;
    origin: RouteCoordinate;
    destination: RouteCoordinate;
    isPartnerLocation: boolean;
    latestLocation: {
      serverReceivedAt: string | null;
      deviceTimestamp: string | null;
      accuracy: number | null;
      isStale: boolean;
    };
  }> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Fetch assignment
    const { data: assignment, error: assignErr } = await client
      .from('delivery_assignments')
      .select('id, order_id, customer_id, delivery_partner_id, status')
      .eq('id', deliveryId)
      .single();

    if (assignErr || !assignment) {
      throw new NotFoundError('Delivery assignment not found.');
    }

    // Authorization verification
    const isAuthorized =
      userRole === 'admin' ||
      userRole === 'staff' ||
      assignment.customer_id === requestingUserId ||
      assignment.delivery_partner_id === requestingUserId;

    if (!isAuthorized) {
      throw new ForbiddenError('You are not authorized to access routing for this delivery.');
    }

    if (['delivered', 'failed', 'cancelled'].includes(assignment.status)) {
      throw new BadRequestError(`Cannot calculate route for delivery with status '${assignment.status}'.`);
    }

    const store = this.getStoreOrigin();

    // 2. Fetch latest delivery location
    const { data: location } = await client
      .from('delivery_locations')
      .select('latitude, longitude, accuracy, device_timestamp, server_received_at')
      .eq('delivery_assignment_id', deliveryId)
      .maybeSingle();

    let origin: RouteCoordinate;
    let isPartnerLocation = false;
    let latestLocationMeta: {
      serverReceivedAt: string | null;
      deviceTimestamp: string | null;
      accuracy: number | null;
      isStale: boolean;
    };

    if (location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
      origin = {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      };
      isPartnerLocation = true;
      latestLocationMeta = {
        serverReceivedAt: location.server_received_at,
        deviceTimestamp: location.device_timestamp,
        accuracy: location.accuracy != null ? Number(location.accuracy) : null,
        isStale: isLocationStale(location.server_received_at),
      };
    } else {
      // Prior to pickup / first GPS broadcast: Origin starts from the store warehouse
      origin = {
        latitude: store.latitude,
        longitude: store.longitude,
      };
      latestLocationMeta = {
        serverReceivedAt: null,
        deviceTimestamp: null,
        accuracy: null,
        isStale: false,
      };
    }

    // 3. Fetch order destination coordinates from orders.shipping_address_snapshot
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('id, shipping_address_snapshot')
      .eq('id', assignment.order_id)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order associated with delivery was not found.');
    }

    const snapshot = (order.shipping_address_snapshot || {}) as Record<string, any>;
    
    // Check if coordinates exist on the address snapshot
    let destLat: number | undefined = snapshot?.latitude ?? snapshot?.lat;
    let destLon: number | undefined = snapshot?.longitude ?? snapshot?.lng ?? snapshot?.lon;

    // Fallback if address has no direct GPS: Default to service area relative to store
    if (destLat == null || destLon == null) {
      // Jehanabad town delivery area: slightly offset from store
      destLat = 25.2185;
      destLon = 84.9912;
    }

    const destination: RouteCoordinate = {
      latitude: Number(destLat),
      longitude: Number(destLon),
    };

    return {
      assignment: {
        id: assignment.id,
        orderId: assignment.order_id,
        customerId: assignment.customer_id,
        deliveryPartnerId: assignment.delivery_partner_id,
        status: assignment.status,
      },
      store,
      origin,
      destination,
      isPartnerLocation,
      latestLocation: latestLocationMeta,
    };
  }

  /**
   * Get driving route with caching and rate control.
   */
  static async getDeliveryRoute(
    deliveryId: string,
    requestingUserId: string,
    userRole: string
  ): Promise<RouteCalculationResult> {
    const context = await this.getDeliveryCoordinatesContext(deliveryId, requestingUserId, userRole);
    const { origin, destination, assignment } = context;

    const nowMs = Date.now();
    const cachedEntry = this.routeCache.get(deliveryId);

    // Cache evaluation: Check TTL and distance moved since last calculation
    if (cachedEntry) {
      const isWithinTtl = (nowMs - cachedEntry.cachedAtMs) / 1000 < env.ROUTING_CACHE_TTL_SECONDS;
      const originMovedMeters = this.calculateHaversineDistanceMeters(cachedEntry.route.origin, origin);

      if (isWithinTtl && originMovedMeters < env.ROUTING_MIN_DISTANCE_RECALCULATE_METERS) {
        return {
          ...cachedEntry.route,
          cached: true,
        };
      }
    }

    // Call routing provider
    const calculated = await OsrmRoutingProvider.getDrivingRoute(origin, destination);

    const result: RouteCalculationResult = {
      deliveryId,
      orderId: assignment.orderId,
      store: context.store,
      origin,
      destination,
      distanceMeters: calculated.distanceMeters,
      durationSeconds: calculated.durationSeconds,
      geometry: calculated.geometry,
      provider: calculated.provider,
      calculatedAt: calculated.calculatedAt,
      cached: false,
    };

    // Store in cache
    this.routeCache.set(deliveryId, {
      route: result,
      cachedAtMs: nowMs,
    });

    return result;
  }

  /**
   * Get best-effort Estimated Time of Arrival (ETA) with location freshness and quality analysis.
   */
  static async getDeliveryEta(
    deliveryId: string,
    requestingUserId: string,
    userRole: string
  ): Promise<DeliveryEtaResponse> {
    let context;
    try {
      context = await this.getDeliveryCoordinatesContext(deliveryId, requestingUserId, userRole);
    } catch (err: unknown) {
      if (err instanceof BadRequestError) {
        return {
          deliveryId,
          orderId: '',
          isAvailable: false,
          statusMessage: err.message,
          eta: null,
          locationFreshness: {
            lastGpsTimestamp: null,
            serverReceivedAt: null,
            isStale: true,
            accuracyMeters: null,
          },
        };
      }
      throw err;
    }

    const { assignment, latestLocation } = context;

    // Check if location is stale
    if (latestLocation.isStale) {
      return {
        deliveryId,
        orderId: assignment.orderId,
        isAvailable: false,
        statusMessage: 'Location update is delayed. Estimated arrival is temporarily unavailable.',
        eta: null,
        locationFreshness: {
          lastGpsTimestamp: latestLocation.deviceTimestamp,
          serverReceivedAt: latestLocation.serverReceivedAt,
          isStale: true,
          accuracyMeters: latestLocation.accuracy,
        },
      };
    }

    // Calculate route to obtain real driving duration
    let route: RouteCalculationResult;
    try {
      route = await this.getDeliveryRoute(deliveryId, requestingUserId, userRole);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not calculate road route';
      return {
        deliveryId,
        orderId: assignment.orderId,
        isAvailable: false,
        statusMessage: `Route calculation unavailable: ${message}`,
        eta: null,
        locationFreshness: {
          lastGpsTimestamp: latestLocation.deviceTimestamp,
          serverReceivedAt: latestLocation.serverReceivedAt,
          isStale: false,
          accuracyMeters: latestLocation.accuracy,
        },
      };
    }

    // Compute estimated arrival timestamp
    const nowMs = Date.now();
    const arrivalMs = nowMs + route.durationSeconds * 1000;
    const estimatedArrivalTimestamp = new Date(arrivalMs).toISOString();

    return {
      deliveryId,
      orderId: assignment.orderId,
      isAvailable: true,
      statusMessage: 'Estimated arrival calculated based on live road routing.',
      eta: {
        estimatedDurationSeconds: route.durationSeconds,
        estimatedArrivalTimestamp,
        distanceMeters: route.distanceMeters,
        calculatedAt: route.calculatedAt,
      },
      locationFreshness: {
        lastGpsTimestamp: latestLocation.deviceTimestamp,
        serverReceivedAt: latestLocation.serverReceivedAt,
        isStale: false,
        accuracyMeters: latestLocation.accuracy,
      },
    };
  }

  /**
   * Reset in-memory cache (for test isolation)
   */
  static clearCache(): void {
    this.routeCache.clear();
  }
}
