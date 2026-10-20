import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type { AdminDashboardStats } from "../commerceTypes"

export function useAdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.getDashboardStats()
      setStats(data)
    } catch (err: any) {
      setError(err?.message || "Failed to load admin dashboard statistics.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  }
}
