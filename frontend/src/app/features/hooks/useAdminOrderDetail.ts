import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type { OrderDetailsResponse } from "../commerceTypes"

export function useAdminOrderDetail(orderId?: string) {
  const [order, setOrder] = useState<OrderDetailsResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(orderId))
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)

  const fetchOrder = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.getOrderById(orderId)
      setOrder(data)
    } catch (err: any) {
      setError(err?.message || "Failed to load order details.")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  const updateStatus = useCallback(
    async (newStatus: string, reason?: string) => {
      if (!orderId) return
      setActionLoading(true)
      try {
        const updated = await adminApi.updateOrderStatus(orderId, newStatus, reason)
        setOrder(updated)
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to update order status.")
      } finally {
        setActionLoading(false)
      }
    },
    [orderId],
  )

  const cancelOrder = useCallback(
    async (reason?: string) => {
      if (!orderId) return
      setActionLoading(true)
      try {
        const cancelled = await adminApi.cancelOrder(orderId, reason)
        setOrder(cancelled)
        return cancelled
      } catch (err: any) {
        throw new Error(err?.message || "Failed to cancel order.")
      } finally {
        setActionLoading(false)
      }
    },
    [orderId],
  )

  const collectCodPayment = useCallback(
    async (amount: number, method: "cash" | "online", notes?: string) => {
      if (!orderId) return
      setActionLoading(true)
      try {
        const updated = await adminApi.collectCodPayment(orderId, amount, method, notes)
        setOrder(updated)
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to record payment collection.")
      } finally {
        setActionLoading(false)
      }
    },
    [orderId],
  )

  const uploadInvoice = useCallback(
    async (file: File) => {
      if (!orderId) return
      setActionLoading(true)
      try {
        const updated = await adminApi.uploadOrderInvoice(orderId, file)
        setOrder(updated)
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to upload invoice.")
      } finally {
        setActionLoading(false)
      }
    },
    [orderId],
  )

  return {
    order,
    loading,
    error,
    actionLoading,
    updateStatus,
    cancelOrder,
    collectCodPayment,
    uploadInvoice,
    refetch: fetchOrder,
  }
}
