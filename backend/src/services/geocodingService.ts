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
  private static readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
  private static readonly REQUEST_TIMEOUT_MS = 5000;
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
  private static searchCache = new Map<string, CacheEntry<GeocodingSuggestion[]>>();
  private static reverseCache = new Map<string, CacheEntry<ReverseGeocodingResult>>();

  /**
   * Helper to calculate Haversine distance in kilometers between two lat/lon points.
   */
  private static calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Search addresses, streets, roads, railway stations, bus stands, and landmarks
   * using a dual-engine hybrid search (Photon OSM + OpenStreetMap Nominatim).
   * Operates just like Google Maps autocomplete without hardcoded data.
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

    const limit = Math.min(Math.max(options?.limit || 10, 1), 20);
    const cacheKey = `${trimmed.toLowerCase()}_${options?.cityBias || ''}_${options?.lat || ''}_${options?.lon || ''}_${limit}`;

    // Cache check
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAtMs < this.CACHE_TTL_MS) {
      return cached.data;
    }

    // Determine geographic focus coordinates based on city or options
    let biasLat = options?.lat;
    let biasLon = options?.lon;

    if (!biasLat || !biasLon) {
      const cityKey = (options?.cityBias || '').toLowerCase().trim();
      if (cityKey === 'patna') {
        biasLat = 25.594095;
        biasLon = 85.137566;
      } else if (cityKey === 'gaya') {
        biasLat = 24.791396;
        biasLon = 85.000229;
      } else {
        // Default to store HQ region (Jehanabad / Bihar)
        biasLat = 25.215475;
        biasLon = 84.986764;
      }
    }

    // 1. Prepare Photon queries:
    // Query A: Clean search query with lat/lon proximity bias
    const photonUrl = new URL('/api/', this.PHOTON_BASE_URL);
    photonUrl.searchParams.set('q', trimmed);
    photonUrl.searchParams.set('limit', String(Math.max(limit * 2, 20)));
    photonUrl.searchParams.set('lat', String(biasLat));
    photonUrl.searchParams.set('lon', String(biasLon));

    // Query B: Query explicitly qualified with "Bihar" to guarantee deep coverage of Bihar streets/landmarks (mandir, masjid, bypass, etc.)
    const photonBiharUrl = new URL('/api/', this.PHOTON_BASE_URL);
    const biharQualifiedQuery = trimmed.toLowerCase().includes('bihar') ? trimmed : `${trimmed} Bihar`;
    photonBiharUrl.searchParams.set('q', biharQualifiedQuery);
    photonBiharUrl.searchParams.set('limit', String(Math.max(limit * 2, 20)));
    photonBiharUrl.searchParams.set('lat', String(biasLat));
    photonBiharUrl.searchParams.set('lon', String(biasLon));

    // 2. Prepare Nominatim query (adds deep POI coverage e.g. Bus Stand, Railway Station, Mandir, Masjid, Bypass)
    const nomUrl = new URL('/search', this.NOMINATIM_BASE_URL);
    let nomQuery = trimmed;
    if (!trimmed.toLowerCase().includes('bihar')) {
      nomQuery = options?.cityBias && !trimmed.toLowerCase().includes(options.cityBias.toLowerCase())
        ? `${trimmed} ${options.cityBias} Bihar`
        : `${trimmed} Bihar`;
    }
    nomUrl.searchParams.set('q', nomQuery);
    nomUrl.searchParams.set('format', 'json');
    nomUrl.searchParams.set('addressdetails', '1');
    nomUrl.searchParams.set('countrycodes', 'in');
    nomUrl.searchParams.set('limit', String(Math.max(limit, 12)));

    // Viewbox around selected coordinate center
    const minLon = (biasLon - 0.55).toFixed(4);
    const minLat = (biasLat - 0.55).toFixed(4);
    const maxLon = (biasLon + 0.55).toFixed(4);
    const maxLat = (biasLat + 0.55).toFixed(4);
    nomUrl.searchParams.set('viewbox', `${minLon},${maxLat},${maxLon},${minLat}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    const photonPromise = fetch(photonUrl.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Hindustan-Hardware-Store/1.0',
      },
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const body = (await res.json()) as any;
        return Array.isArray(body?.features) ? body.features : [];
      })
      .catch((err) => {
        logger.warn('Photon fetch failed or timed out', { error: String(err) });
        return [];
      });

    const photonBiharPromise = fetch(photonBiharUrl.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Hindustan-Hardware-Store/1.0',
      },
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const body = (await res.json()) as any;
        return Array.isArray(body?.features) ? body.features : [];
      })
      .catch((err) => {
        logger.warn('Photon Bihar fetch failed or timed out', { error: String(err) });
        return [];
      });

    const nomPromise = fetch(nomUrl.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Hindustan-Hardware-Store/1.0',
      },
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const body = (await res.json()) as any;
        return Array.isArray(body) ? body : [];
      })
      .catch((err) => {
        logger.warn('Nominatim fetch failed or timed out', { error: String(err) });
        return [];
      });

    try {
      const [photonFeatures, photonBiharFeatures, nomItems] = await Promise.all([
        photonPromise,
        photonBiharPromise,
        nomPromise,
      ]);
      clearTimeout(timeout);

      const candidateResults: (GeocodingSuggestion & { distanceKm: number })[] = [];
      const seenKeys = new Set<string>();

      // Bihar strict geographic bounding box:
      // Latitude: 24.2° N to 27.6° N
      // Longitude: 83.2° E to 88.3° E
      const isInsideBiharBbox = (lat: number, lon: number): boolean => {
        return lat >= 24.2 && lat <= 27.6 && lon >= 83.2 && lon <= 88.3;
      };

      const isBiharLocation = (stateStr?: string, countryStr?: string, lat?: number, lon?: number): boolean => {
        const country = (countryStr || '').toLowerCase().trim();
        // Discard any foreign country results immediately
        if (country && country !== 'india') return false;

        if (lat !== undefined && lon !== undefined) {
          if (!isInsideBiharBbox(lat, lon)) return false;
        }

        const state = (stateStr || '').toLowerCase().trim();
        if (state) {
          return state === 'bihar';
        }

        // If state string is empty/undefined, accept if coordinates strictly inside Bihar bounding box
        return lat !== undefined && lon !== undefined && isInsideBiharBbox(lat, lon);
      };

      // Merge Photon features from both queries
      const allPhotonFeatures = [...photonFeatures, ...photonBiharFeatures];

      // Parse Photon features (Streets, Highways, Buildings, Amenities, Mandir, Masjid, Bypass)
      for (const feature of allPhotonFeatures) {
        const coords = feature?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;

        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const props = feature.properties || {};

        // Enforce strict Bihar-only filter
        if (!isBiharLocation(props.state, props.country, lat, lon)) {
          continue;
        }

        const name = props.name || props.street || props.district || props.city || trimmed;
        const street = props.street || (props.type === 'street' ? props.name : undefined);
        const locality = props.district || props.suburb || props.locality || undefined;
        const city = props.city || props.town || props.village || options?.cityBias || 'Jehanabad';
        const state = 'Bihar';
        const postalCode = props.postcode ? String(props.postcode).replace(/\D/g, '').slice(0, 6) : undefined;
        const country = 'India';

        const addressParts = [name, street, locality, city, state, postalCode].filter(Boolean);
        const formattedAddress = Array.from(new Set(addressParts)).join(', ');

        const dedupeKey = `${name}_${lat.toFixed(3)}_${lon.toFixed(3)}`.toLowerCase();
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const distanceKm = this.calculateDistanceKm(biasLat, biasLon, lat, lon);

        candidateResults.push({
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
          distanceKm,
        });
      }

      // Parse Nominatim Items (Bus stations, Railway stations, Hospitals, Landmarks, Bypass)
      for (const item of nomItems) {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const addr = item.address || {};

        // Enforce strict Bihar-only filter
        if (!isBiharLocation(addr.state, addr.country, lat, lon)) {
          continue;
        }

        const name =
          item.name ||
          addr.amenity ||
          addr.railway ||
          addr.road ||
          (item.display_name ? item.display_name.split(',')[0].trim() : trimmed);

        const street = addr.road || addr.street || undefined;
        const locality = addr.suburb || addr.neighbourhood || addr.city_district || addr.district || undefined;
        const city = addr.city || addr.town || addr.village || addr.county || options?.cityBias || 'Jehanabad';
        const state = 'Bihar';
        const postalCode = addr.postcode ? String(addr.postcode).replace(/\D/g, '').slice(0, 6) : undefined;
        const country = 'India';

        const addressParts = [name, street, locality, city, state, postalCode].filter(Boolean);
        const formattedAddress = Array.from(new Set(addressParts)).join(', ');

        const dedupeKey = `${name}_${lat.toFixed(3)}_${lon.toFixed(3)}`.toLowerCase();
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        const distanceKm = this.calculateDistanceKm(biasLat, biasLon, lat, lon);

        candidateResults.push({
          id: String(item.osm_id || `${lat.toFixed(6)}_${lon.toFixed(6)}`),
          name,
          formattedAddress,
          locality,
          street,
          city,
          district: addr.state_district || addr.county,
          state,
          postalCode,
          country,
          latitude: lat,
          longitude: lon,
          distanceKm,
        });
      }

      // Sort results by proximity to selected city / user center, with local matches prioritized
      candidateResults.sort((a, b) => {
        // If one is within 35km (local area) and the other is far away, prioritize local
        const aIsLocal = a.distanceKm <= 35;
        const bIsLocal = b.distanceKm <= 35;
        if (aIsLocal && !bIsLocal) return -1;
        if (!aIsLocal && bIsLocal) return 1;

        // If both are local or both distant, check query prefix match
        const aStartsWith = a.name.toLowerCase().startsWith(trimmed.toLowerCase());
        const bStartsWith = b.name.toLowerCase().startsWith(trimmed.toLowerCase());
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // Otherwise sort strictly by geographic distance
        return a.distanceKm - b.distanceKm;
      });

      const finalResults = candidateResults.slice(0, limit).map(({ distanceKm, ...rest }) => rest);

      // Populate in-memory cache
      this.searchCache.set(cacheKey, { data: finalResults, cachedAtMs: Date.now() });
      return finalResults;
    } catch (err: unknown) {
      clearTimeout(timeout);
      logger.warn('Hybrid geocoding request error', {
        error: err instanceof Error ? err.message : String(err),
      });
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
