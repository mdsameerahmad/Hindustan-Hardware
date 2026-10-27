/**
 * Real-Time Socket.IO Client Service for Hindustan Hardware Delivery Tracking.
 * Connects to the Express + TypeScript Socket.IO backend with Supabase JWT authentication.
 * 
 * Handshake Contract:
 * - socket = io(SOCKET_BASE_URL, { auth: { token: supabaseAccessToken }, transports: ['websocket', 'polling'] })
 * 
 * Events Contract:
 * - Client -> Server: 'delivery:subscribe', payload: { deliveryId: string }
 * - Client -> Server: 'delivery:unsubscribe', payload: { deliveryId: string }
 * - Server -> Client: 'delivery:location_update', payload: DeliveryLocationBroadcastPayload
 * - Server -> Client: 'delivery:status_update', payload: DeliveryStatusBroadcastPayload
 * - Server -> Client: 'error', payload: { code: string; message: string }
 */

import { io, Socket } from "socket.io-client"
import { tokenStorage } from "../api/client"

export interface DeliveryLocationBroadcastPayload {
  deliveryId: string
  orderId: string
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  deviceTimestamp: string
  serverReceivedAt: string
  isStale: boolean
  estimatedArrivalTimestamp?: string | null
  etaSeconds?: number | null
  distanceRemainingMeters?: number | null
}

export interface DeliveryStatusBroadcastPayload {
  deliveryId: string
  orderId: string
  status: "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled"
  timestamp: string
  notes?: string | null
}

export interface OrderStatusBroadcastPayload {
  orderId: string
  orderNumber?: string
  status: string
  previousStatus?: string | null
  reason?: string | null
  timestamp: string
}

export interface SocketSubscriptionResponse {
  success: boolean
  deliveryId: string
  message: string
  isLiveTrackingAvailable?: boolean
}

const getSocketBaseUrl = (): string => {
  const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL as string | undefined
  if (configuredSocketUrl?.trim()) {
    const trimmed = configuredSocketUrl.trim().replace(/\/$/, "")
    if (typeof window !== "undefined" && window.location?.hostname) {
      const hostname = window.location.hostname
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        return trimmed.replace(/\/\/(localhost|127\.0\.0\.1)(:\d+)?/, `//${hostname}:5000`)
      }
    }
    return trimmed
  }

  const configuredApiUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (configuredApiUrl?.trim()) {
    const trimmed = configuredApiUrl.trim().replace(/\/api\/v1\/?$/, "").replace(/\/$/, "")
    if (typeof window !== "undefined" && window.location?.hostname) {
      const hostname = window.location.hostname
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        return trimmed.replace(/\/\/(localhost|127\.0\.0\.1)(:\d+)?/, `//${hostname}:5000`)
      }
    }
    return trimmed
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:5000`
  }

  return "http://localhost:5000"
}

const SOCKET_BASE_URL: string = getSocketBaseUrl()

class TrackingSocketService {
  private socket: Socket | null = null
  private activeSubscriptions = new Set<string>()
  private listenersCount = 0

  /**
   * Get or initialize the singleton Socket.IO connection.
   * Authenticates using the user's stored access token in the handshake.
   */
  public connect(): Socket | null {
    const token = tokenStorage.get()
    if (!token) {
      this.disconnect()
      return null
    }

    if (this.socket) {
      if (this.socket.disconnected) {
        this.socket.auth = { token }
        this.socket.connect()
      }
      return this.socket
    }

    this.socket = io(SOCKET_BASE_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })

    this.socket.on("connect", () => {
      this.notifyConnectionState("connected")
      // On reconnect, re-subscribe to all active deliveries
      if (this.activeSubscriptions.size > 0 && this.socket) {
        this.activeSubscriptions.forEach((deliveryId) => {
          this.socket!.emit("delivery:subscribe", { deliveryId })
        })
      }
    })

    this.socket.on("disconnect", () => {
      this.notifyConnectionState("disconnected")
    })

    this.socket.io.on("reconnect_attempt", () => {
      this.notifyConnectionState("reconnecting")
    })

    this.socket.io.on("reconnect", () => {
      this.notifyConnectionState("connected")
    })

    this.socket.on("connect_error", (_err) => {
      this.notifyConnectionState("disconnected")
      // If token expired, tokenStorage will be checked on next connect attempt
    })

    return this.socket
  }

  private connectionListeners = new Set<(status: "connected" | "reconnecting" | "disconnected") => void>()

  private notifyConnectionState(status: "connected" | "reconnecting" | "disconnected"): void {
    this.connectionListeners.forEach((listener) => {
      try {
        listener(status)
      } catch {}
    })
  }

  /**
   * Listen to Socket.IO connection status lifecycle (connected, reconnecting, disconnected).
   */
  public onConnectionStatusChange(
    callback: (status: "connected" | "reconnecting" | "disconnected") => void
  ): () => void {
    this.connectionListeners.add(callback)
    // Initial emit
    callback(this.isConnected() ? "connected" : "disconnected")
    return () => {
      this.connectionListeners.delete(callback)
    }
  }

  /**
   * Subscribe to live updates for a specific delivery assignment UUID.
   */
  public subscribeToDelivery(
    deliveryId: string,
    onLocationUpdate: (payload: DeliveryLocationBroadcastPayload) => void,
    onStatusUpdate?: (payload: DeliveryStatusBroadcastPayload) => void,
    onError?: (err: { code?: string; message: string }) => void,
  ): () => void {
    const s = this.connect()
    this.listenersCount++
    this.activeSubscriptions.add(deliveryId)

    const handleLocationUpdate = (payload: DeliveryLocationBroadcastPayload) => {
      if (payload && payload.deliveryId === deliveryId) {
        // Validate coordinates
        if (
          typeof payload.latitude === "number" &&
          !isNaN(payload.latitude) &&
          typeof payload.longitude === "number" &&
          !isNaN(payload.longitude) &&
          payload.latitude >= -90 &&
          payload.latitude <= 90 &&
          payload.longitude >= -180 &&
          payload.longitude <= 180
        ) {
          onLocationUpdate(payload)
        }
      }
    }

    const handleStatusUpdate = (payload: DeliveryStatusBroadcastPayload) => {
      if (payload && payload.deliveryId === deliveryId) {
        if (onStatusUpdate) {
          onStatusUpdate(payload)
        }
      }
    }

    const handleError = (errorPayload: { code?: string; message: string }) => {
      if (onError) {
        onError(errorPayload)
      }
    }

    if (s) {
      s.on("delivery:location_update", handleLocationUpdate)
      s.on("delivery:status_update", handleStatusUpdate)
      s.on("error", handleError)

      // Emit subscribe to server
      s.emit(
        "delivery:subscribe",
        { deliveryId },
        (res?: SocketSubscriptionResponse) => {
          if (res && !res.success && onError) {
            onError({ message: res.message })
          }
        },
      )
    }

    // Return cleanup unsubscribe function
    return () => {
      this.listenersCount = Math.max(0, this.listenersCount - 1)
      this.activeSubscriptions.delete(deliveryId)

      if (this.socket) {
        this.socket.off("delivery:location_update", handleLocationUpdate)
        this.socket.off("delivery:status_update", handleStatusUpdate)
        this.socket.off("error", handleError)

        if (this.socket.connected) {
          this.socket.emit("delivery:unsubscribe", { deliveryId })
        }
      }

      // If no components are listening anywhere in the application, disconnect cleanly
      if (this.listenersCount === 0) {
        this.disconnect()
      }
    }
  }

  /**
   * Subscribe to real-time status transitions for an order (Admin updates or driver actions).
   * Automatically joins room, executes onStatusUpdate callback, and cleans up on unmount.
   */
  public subscribeToOrder(
    orderId: string,
    onStatusUpdate: (payload: OrderStatusBroadcastPayload) => void,
    onError?: (err: { message: string }) => void,
  ): () => void {
    const s = this.connect()
    this.listenersCount++

    const handleOrderStatusUpdate = (payload: OrderStatusBroadcastPayload) => {
      if (payload && payload.orderId === orderId) {
        onStatusUpdate(payload)
      }
    }

    if (s) {
      s.on("order:status_update", handleOrderStatusUpdate)
      s.emit(
        "order:subscribe",
        { orderId },
        (res?: { success: boolean; message: string }) => {
          if (res && !res.success && onError) {
            onError({ message: res.message })
          }
        },
      )
    }

    return () => {
      this.listenersCount = Math.max(0, this.listenersCount - 1)

      if (this.socket) {
        this.socket.off("order:status_update", handleOrderStatusUpdate)

        if (this.socket.connected) {
          this.socket.emit("order:unsubscribe", { orderId })
        }
      }

      if (this.listenersCount === 0) {
        this.disconnect()
      }
    }
  }

  /**
   * Disconnect socket cleanly.
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
      this.activeSubscriptions.clear()
      this.listenersCount = 0
      this.notifyConnectionState("disconnected")
    }
  }

  /**
   * Check connection status.
   */
  public isConnected(): boolean {
    return Boolean(this.socket && this.socket.connected)
  }
}

export const trackingSocketService = new TrackingSocketService()
