import { useState, useEffect, useCallback } from "react"
import { customerOrdersApi } from "../commerceApi"
import type { OrderStatusTrackingResponse } from "../commerceTypes"
import { trackingSocketService, type OrderStatusBroadcastPayload } from "../trackingSocketService"

export function useOrderStatus(orderId: string | undefined, isAuthenticated: boolean) {
  const [tracking, setTracking] = useState<OrderStatusTrackingResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<boolean>(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const fetchTracking = useCallback(async () => {
    if (!orderId || !isAuthenticated) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await customerOrdersApi.getOrderStatus(orderId)
      setTracking(data)
    } catch (err: any) {
      setError(err?.message || "Failed to retrieve order tracking information.")
    } finally {
      setLoading(false)
    }
  }, [orderId, isAuthenticated])

  useEffect(() => {
    fetchTracking()
  }, [fetchTracking])

  // Real-Time Socket Subscription: Instantaneous Order Status Transitions without page refresh
  useEffect(() => {
    if (!orderId || !isAuthenticated) return

    const unsubscribe = trackingSocketService.subscribeToOrder(
      orderId,
      (payload: OrderStatusBroadcastPayload) => {
        setTracking((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            currentStatus: payload.status,
            updatedAt: payload.timestamp || new Date().toISOString(),
            history: [
              ...(prev.history || []),
              {
                id: `sock_${Date.now()}`,
                orderId: payload.orderId,
                previousStatus: payload.previousStatus || prev.currentStatus,
                newStatus: payload.status,
                actorId: null,
                reason: payload.reason || null,
                createdAt: payload.timestamp || new Date().toISOString(),
              },
            ],
          }
        })
      }
    )

    return () => {
      unsubscribe()
    }
  }, [orderId, isAuthenticated])

  const cancelCurrentOrder = useCallback(
    async (reason: string = "Cancelled by customer"): Promise<boolean> => {
      if (!orderId || cancelling) return false
      setCancelling(true)
      setCancelError(null)

      try {
        await customerOrdersApi.cancelOrder(orderId, reason)
        // Refresh tracking after cancellation
        await fetchTracking()
        return true
      } catch (err: any) {
        setCancelError(err?.message || "Failed to cancel order.")
        return false
      } finally {
        setCancelling(false)
      }
    },
    [orderId, cancelling, fetchTracking],
  )

  return {
    tracking,
    loading,
    error,
    cancelling,
    cancelError,
    refetch: fetchTracking,
    cancelCurrentOrder,
  }
}
