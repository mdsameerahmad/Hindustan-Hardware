import { useState, useEffect } from 'react'
import { productComparisonApi } from '../api'
import type { ProductAlternativeItem } from '../types'

export function useProductAlternatives(
  productId: string | undefined,
  options?: {
    brandId?: string
    minPrice?: number
    maxPrice?: number
    limit?: number
  }
) {
  const [alternatives, setAlternatives] = useState<ProductAlternativeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    if (!productId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    productComparisonApi
      .getAlternatives(productId, options)
      .then((items) => {
        if (!isMounted) return
        setAlternatives(items || [])
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err.message || 'Failed to fetch alternative products.')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [productId, options?.brandId, options?.minPrice, options?.maxPrice, options?.limit])

  return { alternatives, loading, error }
}
