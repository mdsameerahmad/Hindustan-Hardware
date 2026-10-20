import { env } from '../config/env';
import { logger } from '../common/utils/logger';
import { RouteCoordinate, RouteGeometry } from '../types';
import { BadRequestError, InternalServerError } from '../common/errors';

export interface OsrmRouteResponse {
  code: string;
  message?: string;
  routes?: Array<{
    geometry: {
      type: 'LineString';
      coordinates: [number, number][]; // [longitude, latitude]
    };
    legs: Array<{
      distance: number;
      duration: number;
      summary: string;
    }>;
    distance: number;
    duration: number;
    weight_name: string;
    weight: number;
  }>;
}

export interface NormalizedRoute {
  geometry: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
  calculatedAt: string;
}

export class OsrmRoutingProvider {
  private static readonly PROVIDER_ID = 'OSRM-Driving';
  private static readonly TIMEOUT_MS = 8000;

  /**
   * Request driving route from configured OSRM routing endpoint.
   * Format: /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson
   */
  static async getDrivingRoute(
    origin: RouteCoordinate,
    destination: RouteCoordinate
  ): Promise<NormalizedRoute> {
    // 1. Validate coordinates range
    if (
      !Number.isFinite(origin.latitude) ||
      !Number.isFinite(origin.longitude) ||
      origin.latitude < -90 ||
      origin.latitude > 90 ||
      origin.longitude < -180 ||
      origin.longitude > 180
    ) {
      throw new BadRequestError('Invalid origin coordinates for routing calculation.');
    }

    if (
      !Number.isFinite(destination.latitude) ||
      !Number.isFinite(destination.longitude) ||
      destination.latitude < -90 ||
      destination.latitude > 90 ||
      destination.longitude < -180 ||
      destination.longitude > 180
    ) {
      throw new BadRequestError('Invalid destination coordinates for routing calculation.');
    }

    // 2. Build standard OSRM URL
    // Note: OSRM expects coordinates in {longitude},{latitude} order!
    const baseUrl = env.OSRM_ROUTER_URL.replace(/\/+$/, '');
    const coordinatesPath = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${baseUrl}/route/v1/driving/${coordinatesPath}?overview=full&geometries=geojson&steps=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Hindustan-Hardware-Backend/1.0',
        },
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        logger.warn('OSRM provider rate limit exceeded (HTTP 429)');
        throw new InternalServerError('Routing service rate limit exceeded. Please try again shortly.');
      }

      if (!response.ok) {
        logger.error('OSRM HTTP error response', { status: response.status, statusText: response.statusText });
        throw new InternalServerError(`Routing service returned error: ${response.status}`);
      }

      const body = (await response.json()) as OsrmRouteResponse;

      if (!body || typeof body !== 'object') {
        throw new InternalServerError('Malformed routing provider response.');
      }

      if (body.code !== 'Ok' || !body.routes || body.routes.length === 0) {
        const errorMsg = body.message || body.code || 'No route found between given coordinates';
        logger.warn('OSRM could not find route', { code: body.code, message: body.message });
        throw new BadRequestError(`No driving route found: ${errorMsg}`);
      }

      const primaryRoute = body.routes[0];

      if (
        !primaryRoute.geometry ||
        primaryRoute.geometry.type !== 'LineString' ||
        !Array.isArray(primaryRoute.geometry.coordinates) ||
        primaryRoute.geometry.coordinates.length === 0
      ) {
        throw new InternalServerError('Routing provider returned invalid or empty route geometry.');
      }

      return {
        geometry: {
          type: 'LineString',
          coordinates: primaryRoute.geometry.coordinates,
        },
        distanceMeters: Math.round(primaryRoute.distance),
        durationSeconds: Math.round(primaryRoute.duration),
        provider: this.PROVIDER_ID,
        calculatedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof BadRequestError || err instanceof InternalServerError) {
        throw err;
      }

      if ((err as Error)?.name === 'AbortError') {
        logger.error('Routing provider request timed out', { timeoutMs: this.TIMEOUT_MS });
        throw new InternalServerError('Routing provider timed out.');
      }

      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to communicate with routing provider', { error: message });
      throw new InternalServerError('Routing provider communication failed.');
    }
  }
}
