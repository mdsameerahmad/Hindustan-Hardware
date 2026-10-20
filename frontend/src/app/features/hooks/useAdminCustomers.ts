import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type { AdminCustomerRecord } from "../commerceTypes"

export function useAdminCustomers() {
  const [customers, setCustomers] = useState<AdminCustomerRecord[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  })
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCustomers = useCallback(
    async (page = 1, searchQuery = "") => {
      setLoading(true)
      setError(null)
      try {
        const response = await adminApi.listCustomers({
          page,
          limit: 10,
          search: searchQuery || undefined,
        })
        setCustomers(response.items || [])
        if (response.pagination) {
          setPagination(response.pagination)
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load customers.")
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    fetchCustomers(1, search)
  }, [fetchCustomers, search])

  return {
    customers,
    pagination,
    search,
    setSearch,
    loading,
    error,
    fetchPage: (page: number) => fetchCustomers(page, search),
    refetch: () => fetchCustomers(pagination.page, search),
  }
}
