import { useState, useEffect, useCallback, useRef } from "react"
import { cartApi, guestTokenStorage } from "../commerceApi"
import type { CartData, CartItem } from "../commerceTypes"

export function useCart(isAuthenticated: boolean) {
  const [cart, setCart] = useState<CartData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const isMergingRef = useRef<boolean>(false)

  // Fetch or initialize cart
  const fetchCart = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      if (isAuthenticated) {
        // Check if there is an unmerged guest cart to merge first
        const guestToken = guestTokenStorage.get()
        if (guestToken && !isMergingRef.current) {
          isMergingRef.current = true
          try {
            const merged = await cartApi.mergeGuestCart(guestToken)
            setCart(merged)
            setLoading(false)
            return
          } catch {
            // If merge fails (e.g. invalid/expired guest token), clear it and load customer cart
            guestTokenStorage.clear()
          } finally {
            isMergingRef.current = false
          }
        }

        const customerCart = await cartApi.getCustomerCart()
        setCart(customerCart)
      } else {
        // Guest cart workflow
        let guestToken = guestTokenStorage.get()
        if (!guestToken) {
          const init = await cartApi.createGuestCart()
          guestToken = init.guestToken
          setCart(init.cart)
        } else {
          try {
            const guestCart = await cartApi.getGuestCart(guestToken)
            setCart(guestCart)
          } catch {
            // Expired or invalid guest token -> create fresh guest cart
            guestTokenStorage.clear()
            const init = await cartApi.createGuestCart()
            setCart(init.cart)
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load shopping cart.")
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const addToCart = async (productId: string, quantity = 1, variantId?: string | null) => {
    try {
      if (isAuthenticated) {
        const updated = await cartApi.addCustomerCartItem({ productId, quantity, variantId })
        setCart(updated)
        return updated
      } else {
        let token = guestTokenStorage.get()
        if (!token) {
          const init = await cartApi.createGuestCart()
          token = init.guestToken
        }
        const updated = await cartApi.addGuestCartItem(token, { productId, quantity, variantId })
        setCart(updated)
        return updated
      }
    } catch (err: any) {
      setError(err?.message || "Could not add item to cart.")
      throw err
    }
  }

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) return
    try {
      if (isAuthenticated) {
        const updated = await cartApi.updateCustomerCartItem(itemId, quantity)
        setCart(updated)
        return updated
      } else {
        const token = guestTokenStorage.get()
        if (!token) return
        const updated = await cartApi.updateGuestCartItem(token, itemId, quantity)
        setCart(updated)
        return updated
      }
    } catch (err: any) {
      setError(err?.message || "Could not update item quantity.")
      throw err
    }
  }

  const removeItem = async (itemId: string) => {
    try {
      if (isAuthenticated) {
        const updated = await cartApi.removeCustomerCartItem(itemId)
        setCart(updated)
        return updated
      } else {
        const token = guestTokenStorage.get()
        if (!token) return
        const updated = await cartApi.removeGuestCartItem(token, itemId)
        setCart(updated)
        return updated
      }
    } catch (err: any) {
      setError(err?.message || "Could not remove item from cart.")
      throw err
    }
  }

  const clearCart = async () => {
    try {
      if (isAuthenticated) {
        const updated = await cartApi.clearCustomerCart()
        setCart(updated)
        return updated
      } else {
        const token = guestTokenStorage.get()
        if (!token) return
        const updated = await cartApi.clearGuestCart(token)
        setCart(updated)
        return updated
      }
    } catch (err: any) {
      setError(err?.message || "Could not clear cart.")
      throw err
    }
  }

  const items: CartItem[] = cart?.items || []
  const itemCount: number = cart?.itemCount ?? items.length
  const totalQuantity: number = cart?.totalQuantity ?? items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal: number = cart?.subtotal ?? items.reduce((sum, item) => sum + item.lineTotal, 0)

  return {
    cart,
    items,
    itemCount,
    totalQuantity,
    subtotal,
    loading,
    error,
    refresh: fetchCart,
    addToCart,
    updateQuantity,
    removeItem,
    clearCart,
  }
}
