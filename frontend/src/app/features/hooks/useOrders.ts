import { useState, useEffect, useCallback } from "react"
import { customerOrdersApi } from "../commerceApi"
import type { OrderSummaryItem } from "../commerceTypes"

export function useOrders(isAuthenticated: boolean) {
  const [orders, setOrders] = useState<OrderSummaryItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<number>(1)
  const [statusFilter, setStatusFilter] = useState<string>("All Orders")
  const [totalPages, setTotalPages] = useState<number>(1)
  const [totalCount, setTotalCount] = useState<number>(0)

  const fetchOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const backendStatus =
        statusFilter === "All Orders"
          ? undefined
          : statusFilter === "In Progress"
            ? undefined // In-progress filter handled client-side or multi-status
            : statusFilter.toLowerCase()

      const res = await customerOrdersApi.getOrders({
        page,
        limit: 20,
        status: backendStatus,
      })

      if (res && Array.isArray(res.items)) {
        let items = res.items
        if (statusFilter === "In Progress") {
          items = items.filter((o) => !["delivered", "cancelled"].includes(o.status.toLowerCase()))
        }
        setOrders(items)
        setTotalPages(res.pagination?.totalPages || 1)
        setTotalCount(res.pagination?.total || items.length)
      } else {
        setOrders([])
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load customer orders.")
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, page, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  return {
    orders,
    loading,
    error,
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    totalPages,
    totalCount,
    refetch: fetchOrders,
  }
}
