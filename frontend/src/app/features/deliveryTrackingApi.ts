/**
 * Delivery Tracking API Client and Domain Types for Frontend Phase 1.
 * Connects to the Express backend endpoints:
 * - GET /customers/me/orders/:orderId/tracking (Resolves order to delivery assignment & status)
 * - GET /deliveries/:deliveryId/location (Latest GPS coordinate and staleness)
 * - GET /deliveries/:deliveryId/route (OSRM GeoJSON road route geometry, distance, duration)
 * - GET /deliveries/:deliveryId/eta (Best-effort dynamic ETA and location freshness)
 */

import { apiRequest } from "../api/client"

export interface DeliveryPartnerSummary {
  fullName: string
  phone: string | null
}

export interface DeliveryAssignmentInfo {
  id: string
  status: "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled"
  assignedAt: string
  pickedUpAt: string | null
  completedAt: string | null
  deliveryPartner: DeliveryPartnerSummary | null
}

export interface DeliveryLocationRecord {
  latitude: number
  longitude: number
  accuracy?: number | null
  speed?: number | null
  heading?: number | null
  deviceTimestamp?: string
  serverReceivedAt?: string
  isStale?: boolean
}

export interface StoreOriginInfo {
  name: string
  address: string
  city: string
  state: string
  postalCode: string
  latitude: number
  longitude: number
  coordinateStatus: "approximate_locality"
}

export interface OrderLiveTrackingResponse {
  orderId: string
  orderNumber: string
  orderStatus: string
  assignment: DeliveryAssignmentInfo | null
  latestLocation: DeliveryLocationRecord | null
  store: StoreOriginInfo
  destination: {
    latitude: number
    longitude: number
  } | null
  isLiveTrackingAvailable: boolean
  trackingMessage: string
}

export interface GeoJsonLineString {
  type: "LineString"
  coordinates: [number, number][] // [longitude, latitude] GeoJSON format
}

export interface DeliveryRouteResponse {
  deliveryId: string
  orderId: string
  store?: StoreOriginInfo
  origin: {
    latitude: number
    longitude: number
  }
  destination: {
    latitude: number
    longitude: number
  }
  distanceMeters: number
  durationSeconds: number
  geometry: GeoJsonLineString
  provider: string
  calculatedAt: string
  cached: boolean
}

export interface DeliveryEtaInfo {
  estimatedDurationSeconds: number
  estimatedArrivalTimestamp: string
  distanceMeters: number
  calculatedAt: string
}

export interface LocationFreshnessInfo {
  lastGpsTimestamp: string
  serverReceivedAt: string
  isStale: boolean
  accuracyMeters: number | null
}

export interface DeliveryEtaResponse {
  deliveryId: string
  orderId: string
  isAvailable: boolean
  statusMessage: string
  eta: DeliveryEtaInfo | null
  locationFreshness: LocationFreshnessInfo | null
}

export interface FullDeliveryTrackingData {
  orderTracking: OrderLiveTrackingResponse
  route: DeliveryRouteResponse | null
  eta: DeliveryEtaResponse | null
}

export const deliveryTrackingApi = {
  /**
   * Resolves an order ID to its live tracking state and delivery assignment ID.
   */
  getOrderTracking: async (orderId: string): Promise<OrderLiveTrackingResponse> => {
    return apiRequest<OrderLiveTrackingResponse>(`/customers/me/orders/${orderId}/tracking`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  /**
   * Retrieves the latest valid GPS location for an active delivery assignment.
   */
  getLatestLocation: async (deliveryId: string) => {
    return apiRequest<{
      assignment: DeliveryAssignmentInfo
      latestLocation: DeliveryLocationRecord | null
      isLiveTrackingAvailable: boolean
      trackingMessage: string
    }>(`/deliveries/${deliveryId}/location`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  /**
   * Retrieves driving road route geometry, distance, and duration calculated via OSRM.
   */
  getDeliveryRoute: async (deliveryId: string): Promise<DeliveryRouteResponse> => {
    return apiRequest<DeliveryRouteResponse>(`/deliveries/${deliveryId}/route`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  /**
   * Retrieves best-effort dynamic ETA and location freshness information.
   */
  getDeliveryEta: async (deliveryId: string): Promise<DeliveryEtaResponse> => {
    return apiRequest<DeliveryEtaResponse>(`/deliveries/${deliveryId}/eta`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  /**
   * Submits authentic device GPS reading for an active delivery assignment.
   */
  submitLocationUpdate: async (
    deliveryId: string,
    payload: {
      latitude: number
      longitude: number
      accuracy?: number | null
      speed?: number | null
      heading?: number | null
      deviceTimestamp: string
    },
  ) => {
    return apiRequest<DeliveryLocationRecord>(`/deliveries/${deliveryId}/location`, {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  /**
   * Retrieves assigned deliveries for the authenticated delivery partner.
   * Calls GET /deliveries/assigned
   */
  getAssignedDeliveries: async (params?: {
    status?: string
    page?: number
    limit?: number
  }): Promise<{
    items: AssignedDeliveryItem[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNextPage: boolean
      hasPrevPage: boolean
    }
  }> => {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set("status", params.status)
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : ""

    return apiRequest<{
      items: AssignedDeliveryItem[]
      pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
        hasNextPage: boolean
        hasPrevPage: boolean
      }
    }>(`/deliveries/assigned${qs}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  /**
   * Updates delivery status (e.g. 'picked_up', 'out_for_delivery', 'delivered', 'failed').
   * Calls partner-authorized PATCH /deliveries/:deliveryId/status
   */
  updateDeliveryStatus: async (
    deliveryId: string,
    status: "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled",
    notes?: string,
  ) => {
    return apiRequest<{ id: string; status: string; updatedAt: string }>(
      `/deliveries/${deliveryId}/status`,
      {
        method: "PATCH",
        requiresAuth: true,
        body: JSON.stringify({ status, notes }),
      },
    )
  },
}

export interface AssignedDeliveryItem {
  id: string
  orderId: string
  orderNumber: string
  status: "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled"
  assignedAt: string
  pickedUpAt: string | null
  completedAt: string | null
  notes: string | null
  destination: {
    recipientName: string
    phone: string | null
    addressLine1: string
    addressLine2: string | null
    landmark: string | null
    city: string
    state: string
    postalCode: string
  }
  codAmount: number | null
  paymentMethod: string
  paymentStatus: string
  itemsSummary: {
    productName: string
    quantity: number
    unitPrice: number
    variantTitle?: string | null
  }[]
}

