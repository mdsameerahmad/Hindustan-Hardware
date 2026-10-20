import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type {
  InventoryMovementRecord,
  InventoryAdjustmentPayload,
} from "../commerceTypes"

export function useAdminInventory() {
  const [movements, setMovements] = useState<InventoryMovementRecord[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)

  const fetchMovements = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const response = await adminApi.listInventoryMovements({ page, limit: 20 })
      setMovements(response.items || [])
      if (response.pagination) {
        setPagination(response.pagination)
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load inventory movements.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMovements(1)
  }, [fetchMovements])

  const adjustStock = useCallback(
    async (payload: InventoryAdjustmentPayload) => {
      setActionLoading(true)
      try {
        const result = await adminApi.adjustInventory(payload)
        await fetchMovements(1)
        return result
      } catch (err: any) {
        throw new Error(err?.message || "Failed to adjust inventory.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchMovements],
  )

  return {
    movements,
    pagination,
    loading,
    error,
    actionLoading,
    adjustStock,
    fetchPage: fetchMovements,
    refetch: () => fetchMovements(pagination.page),
  }
}
