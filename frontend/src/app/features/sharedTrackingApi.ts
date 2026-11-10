import { apiRequest } from "../api/client"

import type {
  DeliveryEtaResponse,
  DeliveryRouteResponse,
  OrderLiveTrackingResponse,
} from "./deliveryTrackingApi"

import type { OrderDetailsResponse } from "./commerceTypes"

export function buildTrackingUrl(trackingPath: string): string {
  if (!trackingPath.startsWith("/shared-tracking/")) {
    throw new Error("The server returned an invalid tracking link.")
  }

  const configuredPublicUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim()
  const baseUrl = configuredPublicUrl || window.location.origin
  const parsedBaseUrl = new URL(baseUrl)
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(parsedBaseUrl.hostname)

  if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
    throw new Error("The public app URL must use HTTP or HTTPS.")
  }
  if (import.meta.env.PROD && parsedBaseUrl.protocol !== "https:") {
    throw new Error("The deployed tracking URL must use HTTPS. Set VITE_PUBLIC_APP_URL to the HTTPS storefront URL.")
  }
  if (import.meta.env.PROD && isLocalHost) {
    throw new Error("Set VITE_PUBLIC_APP_URL to the deployed storefront URL before creating tracking links.")
  }

  return new URL(trackingPath, parsedBaseUrl.origin).toString()
}

export interface TrackingShareLink {
  id: string

  createdAt: string

  expiresAt: string

  revokedAt: string | null
}

export interface CreatedTrackingShare
  extends Omit<TrackingShareLink, "createdAt" | "revokedAt"> {
  token: string

  trackingPath: string
}

export interface SharedTrackingResponse {
  expiresAt: string

  orderTracking: OrderLiveTrackingResponse

  route: DeliveryRouteResponse | null

  eta: DeliveryEtaResponse | null
}

export interface PhoneOrderPayload {
  shippingAddress: {
    recipientName: string

    phone: string

    addressLine1: string

    addressLine2?: string | null

    landmark?: string | null

    city: string

    state: string

    postalCode: string

    country: string

    addressType: "Home" | "Work" | "Site"

    latitude?: number | null

    longitude?: number | null

    formattedAddress?: string | null
    geocodingProvider?: string | null
  }

  items: Array<{
    productId: string

    variantId: string | null

    quantity: number
  }>

  customerNotes?: string
}

export const sharedTrackingApi = {
  createPhoneOrder: (payload: PhoneOrderPayload) =>
    apiRequest<OrderDetailsResponse & { deliveryOtp: string }>(
      "/admin/orders/phone",
      {
        method: "POST",

        requiresAuth: true,

        body: JSON.stringify(payload),
      },
    ),

  createShare: (orderId: string, expiresInHours = 24) =>
    apiRequest<CreatedTrackingShare>(
      `/admin/orders/${orderId}/tracking-share`,
      {
        method: "POST",

        requiresAuth: true,

        body: JSON.stringify({ expiresInHours }),
      },
    ),

  listShares: (orderId: string) =>
    apiRequest<TrackingShareLink[]>(
      `/admin/orders/${orderId}/tracking-shares`,
      {
        method: "GET",

        requiresAuth: true,
      },
    ),

  revokeShare: (orderId: string, shareId: string) =>
    apiRequest<void>(`/admin/orders/${orderId}/tracking-shares/${shareId}`, {
      method: "DELETE",

      requiresAuth: true,
    }),

  getPublicTracking: (token: string) =>
    apiRequest<SharedTrackingResponse>(
      `/public/tracking/${encodeURIComponent(token)}`,
      {
        method: "GET",
      },
    ),
}
