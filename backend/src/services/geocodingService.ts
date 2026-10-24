import { logger } from '../common/utils/logger';
import { BadRequestError, InternalServerError } from '../common/errors';

export interface GeocodingSuggestion {
  id: string;
  name: string;
  formattedAddress: string;
  locality?: string;
  street?: string;
  city: string;
  district?: string;
  state: string;
  postalCode?: string;
  country: string;
  latitude: number;
  longitude: number;
  extent?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

export interface ReverseGeocodingResult {
  formattedAddress: string;
  locality?: string;
  street?: string;
  houseNumber?: string;
  city: string;
  district?: string;
  state: string;
  postalCode?: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface CacheEntry<T> {
  data: T;
  cachedAtMs: number;
}

export class GeocodingService {
  private static readonly PHOTON_BASE_URL = 'https://photon.komoot.io';
  private static readonly REQUEST_TIMEOUT_MS = 6000;
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
  private static searchCache = new Map<string, CacheEntry<GeocodingSuggestion[]>>();
  private static reverseCache = new Map<string, CacheEntry<ReverseGeocodingResult>>();

  /**
   * Search addresses/localities using Photon geocoding with bounding/bias for Bihar.
   */
  static async searchAddress(
    query: string,
    options?: {
      cityBias?: string;
      limit?: number;
      lat?: number;
      lon?: number;
    }
  ): Promise<GeocodingSuggestion[]> {
    const trimmed = (query || '').trim();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const limit = Math.min(Math.max(options?.limit || 7, 1), 15);
    const cacheKey = `${trimmed.toLowerCase()}_${options?.cityBias || ''}_${limit}`;

    // Cache check
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAtMs < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // Prepare query with city bias if present
    let searchQuery = trimmed;
    if (options?.cityBias && !trimmed.toLowerCase().includes(options.cityBias.toLowerCase())) {
      searchQuery = `${trimmed}, ${options.cityBias}, Bihar`;
    }

    // Default focus around Jehanabad / Bihar region
    const biasLat = options?.lat ?? 25.215475;
    const biasLon = options?.lon ?? 84.986764;

    const url = new URL('/api/', this.PHOTON_BASE_URL);
    url.searchParams.set('q', searchQuery);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('lat', String(biasLat));
    url.searchParams.set('lon', String(biasLon));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Hindustan-Hardware-Store/1.0',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn('Photon geocoding returned non-200 status', { status: response.status });
        return [];
      }

      const body = (await response.json()) as any;
      const features = Array.isArray(body?.features) ? body.features : [];

      const results: GeocodingSuggestion[] = [];

      for (const feature of features) {
        const coords = feature?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;

        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const props = feature.properties || {};
        const name = props.name || props.street || props.district || props.city || searchQuery;
        const street = props.street || undefined;
        const locality = props.district || props.suburb || props.locality || undefined;
        const city = props.city || props.town || props.village || options?.cityBias || 'Jehanabad';
        const state = props.state || 'Bihar';
        const postalCode = props.postcode ? String(props.postcode).replace(/\D/g, '').slice(0, 6) : undefined;
        const country = props.country || 'India';

        const addressParts = [name, street, locality, city, state, postalCode].filter(Boolean);
        const formattedAddress = Array.from(new Set(addressParts)).join(', ');

        results.push({
          id: String(props.osm_id || `${lat.toFixed(6)}_${lon.toFixed(6)}`),
          name,
          formattedAddress,
          locality,
          street,
          city,
          district: props.district,
          state,
          postalCode,
          country,
          latitude: lat,
          longitude: lon,
          extent: feature.extent,
        });
      }

      // Populate in-memory cache
      this.searchCache.set(cacheKey, { data: results, cachedAtMs: Date.now() });
      return results;
    } catch (err: unknown) {
      clearTimeout(timeout);
      logger.warn('Photon geocoding request error', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  /**
   * Reverse geocode a latitude/longitude pair into address components.
   */
  static async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodingResult | null> {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestError('Invalid coordinates supplied for reverse geocoding.');
    }

    const roundedLat = latitude.toFixed(5);
    const roundedLon = longitude.toFixed(5);
    const cacheKey = `${roundedLat}_${roundedLon}`;

    const cached = this.reverseCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAtMs < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const url = new URL('/reverse', this.PHOTON_BASE_URL);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Hindustan-Hardware-Store/1.0',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as any;
      const feature = body?.features?.[0];
      if (!feature) {
        return null;
      }

      const props = feature.properties || {};
      const houseNumber = props.housenumber || undefined;
      const street = props.street || undefined;
      const locality = props.district || props.suburb || props.locality || undefined;
      const city = props.city || props.town || props.village || 'Jehanabad';
      const district = props.district || undefined;
      const state = props.state || 'Bihar';
      const postalCode = props.postcode ? String(props.postcode).replace(/\D/g, '').slice(0, 6) : undefined;
      const country = props.country || 'India';

      const parts = [
        houseNumber,
        street,
        locality,
        city,
        state,
        postalCode,
      ].filter(Boolean);

      const formattedAddress = Array.from(new Set(parts)).join(', ');

      const result: ReverseGeocodingResult = {
        formattedAddress: formattedAddress || `Location near (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
        houseNumber,
        street,
        locality,
        city,
        district,
        state,
        postalCode,
        country,
        latitude,
        longitude,
      };

      this.reverseCache.set(cacheKey, { data: result, cachedAtMs: Date.now() });
      return result;
    } catch (err: unknown) {
      clearTimeout(timeout);
      logger.warn('Photon reverse geocoding request error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
