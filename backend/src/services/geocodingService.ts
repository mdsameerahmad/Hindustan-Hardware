import { logger } from '../common/utils/logger';
import { BadRequestError, InternalServerError } from '../common/errors';
import { env } from '../config/env';

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
  latitude?: number;
  longitude?: number;
  extent?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  provider?: 'Google-Places' | 'Photon-OSM';
  placeId?: string;
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
  private static readonly GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';
  private static readonly REQUEST_TIMEOUT_MS = 5000;
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
  private static searchCache = new Map<string, CacheEntry<GeocodingSuggestion[]>>();
  private static reverseCache = new Map<string, CacheEntry<ReverseGeocodingResult>>();

  private static async searchGooglePlaces(
    query: string,
    limit: number,
    latitude: number,
    longitude: number,
    cityBias?: string,
    sessionToken?: string,
  ): Promise<GeocodingSuggestion[] | null> {
    if (!env.GOOGLE_MAPS_API_KEY) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.GOOGLE_PLACES_BASE_URL}/places:autocomplete`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': [
            'suggestions.placePrediction.placeId',
            'suggestions.placePrediction.text.text',
            'suggestions.placePrediction.structuredFormat.mainText.text',
            'suggestions.placePrediction.structuredFormat.secondaryText.text',
          ].join(','),
        },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ['in'],
          locationBias: {
            circle: {
              center: { latitude, longitude },
              radius: 50000,
            },
          },
          ...(sessionToken ? { sessionToken } : {}),
          languageCode: 'en',
          regionCode: 'IN',
        }),
      });

      if (!response.ok) {
        logger.warn('Google Places autocomplete returned an unsuccessful response', {
          status: response.status,
        });
        return null;
      }

      const body = (await response.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }>;
      };

      return (body.suggestions || [])
        .flatMap((suggestion) => {
          const prediction = suggestion.placePrediction;
          const placeId = prediction?.placeId;
          const formattedAddress = prediction?.text?.text;
          if (!placeId || !formattedAddress) return [];

          return [{
            id: `google:${placeId}`,
            placeId,
            provider: 'Google-Places' as const,
            name: prediction.structuredFormat?.mainText?.text || formattedAddress,
            formattedAddress,
            city: cityBias || 'Jehanabad',
            state: 'Bihar',
            country: 'India',
          }];
        })
        .slice(0, limit);
    } catch (err: unknown) {
      logger.warn('Google Places autocomplete request failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  static async getGooglePlaceDetails(placeId: string, sessionToken?: string): Promise<GeocodingSuggestion> {
    if (!env.GOOGLE_MAPS_API_KEY) {
      throw new InternalServerError('Google Places is not configured.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);
    try {
      const url = new URL(`${this.GOOGLE_PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`);
      if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
        },
      });
      if (!response.ok) {
        logger.warn('Google Places details returned an unsuccessful response', {
          status: response.status,
        });
        throw new InternalServerError('Could not resolve the selected map result.');
      }

      const place = (await response.json()) as {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        addressComponents?: Array<{ longText?: string; types?: string[] }>;
      };
      const components = place.addressComponents || [];
      const component = (...types: string[]) =>
        components.find((item) => types.some((type) => item.types?.includes(type)))?.longText;
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !place.formattedAddress) {
        throw new InternalServerError('The selected map result has incomplete location details.');
      }

      const state = component('administrative_area_level_1') || 'Bihar';
      if (state.toLowerCase() !== 'bihar') {
        throw new BadRequestError('Please choose a delivery location in Bihar.');
      }

      return {
        id: `google:${place.id || placeId}`,
        placeId: place.id || placeId,
        provider: 'Google-Places',
        name: place.displayName?.text || place.formattedAddress.split(',')[0],
        formattedAddress: place.formattedAddress,
        street: [component('street_number'), component('route')].filter(Boolean).join(' ') || undefined,
        locality: component('sublocality_level_1', 'sublocality'),
        city: component('locality', 'postal_town', 'administrative_area_level_3') || 'Jehanabad',
        district: component('administrative_area_level_2'),
        state,
        postalCode: component('postal_code'),
        country: component('country') || 'India',
        latitude,
        longitude,
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestError || err instanceof InternalServerError) throw err;
      logger.warn('Google Places details request failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new InternalServerError('Could not resolve the selected map result.');
    } finally {
      clearTimeout(timeout);
    }
  }

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
   * Uses Google Places when configured and Photon (OpenStreetMap) otherwise.
   */
  static async searchAddress(
    query: string,
    options?: {
      cityBias?: string;
      limit?: number;
      lat?: number;
      lon?: number;
      sessionToken?: string;
    }
  ): Promise<GeocodingSuggestion[]> {
    const trimmed = (query || '').trim();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const limit = Math.min(Math.max(options?.limit || 10, 1), 20);
    const cacheKey = `${trimmed.toLowerCase()}_${options?.cityBias || ''}_${options?.lat || ''}_${options?.lon || ''}_${limit}_${env.GOOGLE_MAPS_API_KEY ? options?.sessionToken || '' : ''}`;

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

    const googleResults = await this.searchGooglePlaces(
      trimmed,
      limit,
      biasLat,
      biasLon,
      options?.cityBias,
      options?.sessionToken,
    );
    if (googleResults !== null && googleResults.length > 0) {
      this.searchCache.set(cacheKey, { data: googleResults, cachedAtMs: Date.now() });
      return googleResults;
    }

    // 1. Prepare Photon queries:
    // Query A: Clean search query with lat/lon proximity bias
    const photonUrl = new URL('/api/', this.PHOTON_BASE_URL);
    photonUrl.searchParams.set('q', trimmed);
    photonUrl.searchParams.set('limit', String(Math.max(limit * 2, 20)));
    photonUrl.searchParams.set('lat', String(biasLat));
    photonUrl.searchParams.set('lon', String(biasLon));

    // Query B: A Bihar-qualified variant can surface local results missed by the unqualified query.
    const photonBiharUrl = new URL('/api/', this.PHOTON_BASE_URL);
    const biharQualifiedQuery = trimmed.toLowerCase().includes('bihar') ? trimmed : `${trimmed} Bihar`;
    photonBiharUrl.searchParams.set('q', biharQualifiedQuery);
    photonBiharUrl.searchParams.set('limit', String(Math.max(limit * 2, 20)));
    photonBiharUrl.searchParams.set('lat', String(biasLat));
    photonBiharUrl.searchParams.set('lon', String(biasLon));

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

    try {
      const [photonFeatures, photonBiharFeatures] = await Promise.all([photonPromise, photonBiharPromise]);
      clearTimeout(timeout);

      const candidateResults: (GeocodingSuggestion & { distanceKm: number; relevance: number })[] = [];
      const seenKeys = new Set<string>();
      const queryLower = trimmed.toLowerCase();
      const queryTokens = queryLower.split(/\s+/).filter(Boolean);

      const getRelevance = (name: string, address: string): number => {
        const normalizedName = name.toLowerCase();
        const normalizedAddress = address.toLowerCase();
        if (normalizedName === queryLower) return 100;
        if (normalizedName.startsWith(queryLower)) return 90;
        if (normalizedName.includes(queryLower)) return 80;
        if (normalizedAddress.includes(queryLower)) return 70;
        const matchedTokens = queryTokens.filter(
          (token) => normalizedName.includes(token) || normalizedAddress.includes(token),
        ).length;
        return queryTokens.length ? Math.round((matchedTokens / queryTokens.length) * 60) : 0;
      };

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

      // Merge Photon features from the plain and Bihar-qualified queries.
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

        const dedupeKey = props.osm_id
          ? `${props.osm_type || ''}_${props.osm_id}`.toLowerCase()
          : `${formattedAddress}_${lat.toFixed(5)}_${lon.toFixed(5)}`.toLowerCase();
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
          provider: 'Photon-OSM',
          distanceKm,
          relevance: getRelevance(name, formattedAddress),
        });
      }

      // Exact and partial text matches outrank proximity so a nearby unrelated result
      // cannot hide the street or landmark the user actually searched for.
      candidateResults.sort((a, b) => {
        if (a.relevance !== b.relevance) return b.relevance - a.relevance;

        // If one is within 35km (local area) and the other is far away, prioritize local
        const aIsLocal = a.distanceKm <= 35;
        const bIsLocal = b.distanceKm <= 35;
        if (aIsLocal && !bIsLocal) return -1;
        if (!aIsLocal && bIsLocal) return 1;
        return a.distanceKm - b.distanceKm;
      });

      const finalResults = candidateResults.slice(0, limit).map(({ distanceKm, relevance, ...rest }) => rest);

      // Populate in-memory cache
      this.searchCache.set(cacheKey, { data: finalResults, cachedAtMs: Date.now() });
      return finalResults;
    } catch (err: unknown) {
      clearTimeout(timeout);
      logger.warn('Photon geocoding request error', {
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
