import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type {
  AdminBrand,
  CreateBrandPayload,
  UpdateBrandPayload,
} from "../commerceTypes"

export function useAdminBrands() {
  const [brands, setBrands] = useState<AdminBrand[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)

  const fetchBrands = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.getBrands()
      setBrands(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || "Failed to load brands.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBrands()
  }, [fetchBrands])

  const createBrand = useCallback(
    async (payload: CreateBrandPayload): Promise<AdminBrand | null> => {
      setActionLoading(true)
      try {
        const created = await adminApi.createBrand(payload)
        await fetchBrands()
        return created
      } catch (err: any) {
        throw new Error(err?.message || "Failed to create brand.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchBrands],
  )

  const updateBrand = useCallback(
    async (id: string, payload: UpdateBrandPayload): Promise<AdminBrand | null> => {
      setActionLoading(true)
      try {
        const updated = await adminApi.updateBrand(id, payload)
        await fetchBrands()
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to update brand.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchBrands],
  )

  const deleteBrand = useCallback(
    async (id: string): Promise<boolean> => {
      setActionLoading(true)
      try {
        await adminApi.deleteBrand(id)
        await fetchBrands()
        return true
      } catch (err: any) {
        throw new Error(err?.message || "Failed to delete brand.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchBrands],
  )

  const uploadBrandLogo = useCallback(
    async (id: string, file: File): Promise<AdminBrand | null> => {
      setActionLoading(true)
      try {
        const updated = await adminApi.uploadBrandLogo(id, file)
        await fetchBrands()
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to upload brand logo.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchBrands],
  )

  return {
    brands,
    loading,
    error,
    actionLoading,
    refetch: fetchBrands,
    createBrand,
    updateBrand,
    deleteBrand,
    uploadBrandLogo,
  }
}

