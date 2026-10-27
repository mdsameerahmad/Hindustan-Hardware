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

    // 2. Build standard OSRM URLs with multiple alternative route requests
    // Note: OSRM expects coordinates in {longitude},{latitude} order!
    const coordinatesPath = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    
    // Query endpoints: Primary OSRM and secondary OpenStreetMap FOSS routing router
    const primaryBaseUrl = env.OSRM_ROUTER_URL.replace(/\/+$/, '');
    const secondaryBaseUrl = 'https://routing.openstreetmap.de/routed-car';

    const url1 = `${primaryBaseUrl}/route/v1/driving/${coordinatesPath}?overview=full&geometries=geojson&steps=true&alternatives=3&continue_straight=false`;
    const url2 = `${secondaryBaseUrl}/route/v1/driving/${coordinatesPath}?overview=full&geometries=geojson&steps=true&alternatives=3&continue_straight=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    const fetchRoute = async (endpoint: string): Promise<OsrmRouteResponse | null> => {
      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Hindustan-Hardware-Backend/1.0',
          },
        });
        if (!res.ok) return null;
        return (await res.json()) as OsrmRouteResponse;
      } catch {
        return null;
      }
    };

    try {
      // Query routers in parallel to capture alternative road choices (e.g. NH bypass vs city road)
      const [res1, res2] = await Promise.all([fetchRoute(url1), fetchRoute(url2)]);
      clearTimeout(timeout);

      const allFoundRoutes: NonNullable<OsrmRouteResponse['routes']> = [];

      if (res1?.code === 'Ok' && Array.isArray(res1.routes)) {
        allFoundRoutes.push(...res1.routes);
      }
      if (res2?.code === 'Ok' && Array.isArray(res2.routes)) {
        allFoundRoutes.push(...res2.routes);
      }

      if (allFoundRoutes.length === 0) {
        const errorMsg = res1?.message || res2?.message || 'No road route found between coordinates';
        logger.warn('No road route found from routing providers', { origin, destination });
        throw new BadRequestError(`No driving route found: ${errorMsg}`);
      }

      // Filter valid candidates with coordinates
      const validRoutes = allFoundRoutes.filter(
        (r) =>
          r.geometry &&
          r.geometry.type === 'LineString' &&
          Array.isArray(r.geometry.coordinates) &&
          r.geometry.coordinates.length > 0
      );

      if (validRoutes.length === 0) {
        throw new InternalServerError('Routing provider returned invalid or empty route geometry.');
      }

      // Shortest & Best Route Search Algorithm:
      // When multiple paths exist between Location 1 and Location 2:
      // 1. Sort strictly by shortest physical road distance (meters)
      // 2. Tie-break with duration (seconds) so the fastest shortest path is selected
      validRoutes.sort((a, b) => {
        // If distance differs by more than 15 meters, select the strictly shorter route
        if (Math.abs(a.distance - b.distance) > 15) {
          return a.distance - b.distance;
        }
        // If distances are virtually identical, choose the faster duration route
        return a.duration - b.duration;
      });

      const bestRoute = validRoutes[0];

      return {
        geometry: {
          type: 'LineString',
          coordinates: bestRoute.geometry.coordinates,
        },
        distanceMeters: Math.round(bestRoute.distance),
        durationSeconds: Math.round(bestRoute.duration),
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
