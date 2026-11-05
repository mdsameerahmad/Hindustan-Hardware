import { useState, useEffect, useCallback } from "react"
import { adminApi } from "../commerceApi"
import type {
  AdminCategory,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from "../commerceTypes"

export function useAdminCategories() {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.getCategories()
      setCategories(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || "Failed to load categories.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const createCategory = useCallback(
    async (payload: CreateCategoryPayload): Promise<AdminCategory | null> => {
      setActionLoading(true)
      try {
        const created = await adminApi.createCategory(payload)
        await fetchCategories()
        return created
      } catch (err: any) {
        throw new Error(err?.message || "Failed to create category.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchCategories],
  )

  const updateCategory = useCallback(
    async (id: string, payload: UpdateCategoryPayload): Promise<AdminCategory | null> => {
      setActionLoading(true)
      try {
        const updated = await adminApi.updateCategory(id, payload)
        await fetchCategories()
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to update category.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchCategories],
  )

  const deleteCategory = useCallback(
    async (id: string): Promise<boolean> => {
      setActionLoading(true)
      try {
        await adminApi.deleteCategory(id)
        await fetchCategories()
        return true
      } catch (err: any) {
        throw new Error(err?.message || "Failed to delete category.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchCategories],
  )

  const uploadCategoryImage = useCallback(
    async (id: string, file: File): Promise<AdminCategory | null> => {
      setActionLoading(true)
      try {
        const updated = await adminApi.uploadCategoryImage(id, file)
        await fetchCategories()
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to upload category image.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchCategories],
  )

  return {
    categories,
    loading,
    error,
    actionLoading,
    refetch: fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    uploadCategoryImage,
  }
}
