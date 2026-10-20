import { useState, useEffect } from 'react'
import { productComparisonApi } from '../api'
import type { ProductComparisonResponse } from '../types'

export function useProductComparison(productIds: string[]) {
  const [data, setData] = useState<ProductComparisonResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    if (!productIds || productIds.length === 0) {
      setData({ products: [], commonAttributes: {}, attributeDifferences: [] })
      setLoading(false)
      setError(null)
      return
    }

    // Filter to valid UUIDs to comply with backend route validator
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const validIds = productIds.filter((id) => uuidRegex.test(id))

    if (validIds.length === 0) {
      setData({ products: [], commonAttributes: {}, attributeDifferences: [] })
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    productComparisonApi
      .compareProducts(validIds)
      .then((res) => {
        if (!isMounted) return
        setData(res)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err.message || 'Failed to retrieve comparison specifications.')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [JSON.stringify(productIds)])

  return { data, loading, error }
}
