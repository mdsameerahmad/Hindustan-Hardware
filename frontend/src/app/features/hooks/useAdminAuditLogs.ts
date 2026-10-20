import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type { AuditLogRecord } from "../commerceTypes"

export function useAdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
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

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const response = await adminApi.listAuditLogs({ page, limit: 20 })
      setLogs(response.items || [])
      if (response.pagination) {
        setPagination(response.pagination)
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load audit logs.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs(1)
  }, [fetchLogs])

  return {
    logs,
    pagination,
    loading,
    error,
    fetchPage: fetchLogs,
    refetch: () => fetchLogs(pagination.page),
  }
}
