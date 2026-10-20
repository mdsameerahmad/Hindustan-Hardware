import { useState, useEffect, useCallback } from "react"
import { wishlistApi } from "../commerceApi"
import type { WishlistItem } from "../commerceTypes"

export function useWishlist(isAuthenticated: boolean) {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWishlist = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await wishlistApi.getWishlist()
      setItems(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || "Failed to load wishlist.")
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchWishlist()
  }, [fetchWishlist])

  const addToWishlist = async (productId: string) => {
    if (!isAuthenticated) return
    await wishlistApi.addToWishlist(productId)
    await fetchWishlist()
  }

  const removeFromWishlist = async (productId: string) => {
    if (!isAuthenticated) return
    await wishlistApi.removeFromWishlist(productId)
    setItems((prev) => prev.filter((item) => item.productId !== productId))
  }

  const isWishlisted = (productId: string): boolean => {
    return items.some((item) => item.productId === productId)
  }

  const toggleWishlist = async (productId: string) => {
    if (isWishlisted(productId)) {
      await removeFromWishlist(productId)
    } else {
      await addToWishlist(productId)
    }
  }

  return {
    items,
    itemCount: items.length,
    loading,
    error,
    refresh: fetchWishlist,
    addToWishlist,
    removeFromWishlist,
    isWishlisted,
    toggleWishlist,
  }
}
