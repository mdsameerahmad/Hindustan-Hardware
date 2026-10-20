import { useState, useEffect, useCallback } from "react"
import { catalogueApi, type ProductFilters } from "../../api/catalogueApi"
import { adminApi } from "../commerceApi"
import type { Product } from "../../data"
import { transformBackendProduct } from "../../utils/productTransform"
import type { CreateProductPayload, UpdateProductPayload } from "../commerceTypes"

export function useAdminProducts(initialFilters?: ProductFilters) {
  const [products, setProducts] = useState<Product[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  })
  const [filters, setFilters] = useState<ProductFilters>(initialFilters || { page: 1, limit: 20 })
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await catalogueApi.listProducts(filters)
      const mapped = (response.items || []).map(transformBackendProduct)
      setProducts(mapped)
      if (response.pagination) {
        setPagination(response.pagination)
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load admin products.")
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const createProduct = useCallback(
    async (payload: CreateProductPayload): Promise<Product | null> => {
      setActionLoading(true)
      try {
        const created = await adminApi.createProduct(payload)
        await fetchProducts()
        return created
      } catch (err: any) {
        throw new Error(err?.message || "Failed to create product.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchProducts],
  )

  const updateProduct = useCallback(
    async (id: string, payload: UpdateProductPayload): Promise<Product | null> => {
      setActionLoading(true)
      try {
        const updated = await adminApi.updateProduct(id, payload)
        await fetchProducts()
        return updated
      } catch (err: any) {
        throw new Error(err?.message || "Failed to update product.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchProducts],
  )

  const deleteProduct = useCallback(
    async (id: string): Promise<boolean> => {
      setActionLoading(true)
      try {
        await adminApi.deleteProduct(id)
        await fetchProducts()
        return true
      } catch (err: any) {
        throw new Error(err?.message || "Failed to delete product.")
      } finally {
        setActionLoading(false)
      }
    },
    [fetchProducts],
  )

  return {
    products,
    pagination,
    filters,
    setFilters,
    loading,
    error,
    actionLoading,
    createProduct,
    updateProduct,
    deleteProduct,
    refetch: fetchProducts,
  }
}
