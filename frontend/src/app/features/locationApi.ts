import { apiRequest } from "../api/client"

export interface SupportedCity {
  id: string
  name: string
  state: string
  isExpressAvailable: boolean
}

export interface GeocodingSuggestion {
  id: string
  name: string
  formattedAddress: string
  locality?: string
  street?: string
  city: string
  district?: string
  state: string
  postalCode?: string
  country: string
  latitude: number
  longitude: number
  extent?: [number, number, number, number]
}

export interface ReverseGeocodeResult {
  formattedAddress: string
  locality?: string
  street?: string
  houseNumber?: string
  city: string
  district?: string
  state: string
  postalCode?: string
  country: string
  latitude: number
  longitude: number
}

export interface ServiceabilityCheckResult {
  isServiceable: boolean
  city?: string
  zoneName?: string
  message: string
}

export const locationApi = {
  /**
   * Get supported delivery cities (Jehanabad, Patna, Gaya).
   */
  getCities: async (): Promise<SupportedCity[]> => {
    return apiRequest<SupportedCity[]>("/location/cities", {
      method: "GET",
    })
  },

  /**
   * Search for addresses, streets, roads, stations, and localities with autocomplete.
   */
  searchAddresses: async (
    query: string,
    cityBias?: string,
    limit: number = 10,
    coords?: { lat?: number; lon?: number }
  ): Promise<GeocodingSuggestion[]> => {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
    })
    if (cityBias) params.set("city", cityBias)
    if (coords?.lat) params.set("lat", String(coords.lat))
    if (coords?.lon) params.set("lon", String(coords.lon))

    return apiRequest<GeocodingSuggestion[]>(`/location/search?${params.toString()}`, {
      method: "GET",
    })
  },

  /**
   * Reverse geocode a latitude/longitude point to structured address parts.
   */
  reverseGeocode: async (lat: number, lon: number): Promise<ReverseGeocodeResult | null> => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
    })

    return apiRequest<ReverseGeocodeResult | null>(`/location/reverse?${params.toString()}`, {
      method: "GET",
    })
  },

  /**
   * Check serviceability for an address or coordinate.
   */
  checkServiceability: async (params: {
    city?: string
    postalCode?: string
    lat?: number
    lon?: number
  }): Promise<ServiceabilityCheckResult> => {
    const searchParams = new URLSearchParams()
    if (params.city) searchParams.set("city", params.city)
    if (params.postalCode) searchParams.set("postalCode", params.postalCode)
    if (params.lat != null) searchParams.set("lat", String(params.lat))
    if (params.lon != null) searchParams.set("lon", String(params.lon))

    return apiRequest<ServiceabilityCheckResult>(
      `/location/serviceability?${searchParams.toString()}`,
      {
        method: "GET",
      }
    )
  },
}
