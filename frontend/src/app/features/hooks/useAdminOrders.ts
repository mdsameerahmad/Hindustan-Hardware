import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type { OrderSummaryItem, AdminOrderQuery } from "../commerceTypes"

export function useAdminOrders(initialQuery?: AdminOrderQuery) {
  const [orders, setOrders] = useState<OrderSummaryItem[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  })
  const [query, setQuery] = useState<AdminOrderQuery>(initialQuery || { page: 1, limit: 10 })
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await adminApi.listOrders(query)
      setOrders(response.items || [])
      if (response.pagination) {
        setPagination(response.pagination)
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load orders.")
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  return {
    orders,
    pagination,
    query,
    setQuery,
    loading,
    error,
    refetch: fetchOrders,
  }
}
