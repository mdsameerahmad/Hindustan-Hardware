import { useState, useEffect, useCallback } from "react"
import { customerOrdersApi } from "../commerceApi"
import type { OrderDetailsResponse } from "../commerceTypes"

export function useOrderDetails(orderId: string | undefined, isAuthenticated: boolean) {
  const [order, setOrder] = useState<OrderDetailsResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<boolean>(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const fetchOrder = useCallback(async () => {
    if (!orderId || !isAuthenticated) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await customerOrdersApi.getOrderById(orderId)
      setOrder(data)
    } catch (err: any) {
      setError(err?.message || "Failed to retrieve order details.")
    } finally {
      setLoading(false)
    }
  }, [orderId, isAuthenticated])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  const cancelCurrentOrder = useCallback(
    async (reason: string = "Cancelled by customer"): Promise<boolean> => {
      if (!orderId || cancelling) return false
      setCancelling(true)
      setCancelError(null)

      try {
        const updated = await customerOrdersApi.cancelOrder(orderId, reason)
        setOrder(updated)
        return true
      } catch (err: any) {
        setCancelError(err?.message || "Failed to cancel order.")
        return false
      } finally {
        setCancelling(false)
      }
    },
    [orderId, cancelling],
  )

  return {
    order,
    loading,
    error,
    cancelling,
    cancelError,
    refetch: fetchOrder,
    cancelCurrentOrder,
  }
}
