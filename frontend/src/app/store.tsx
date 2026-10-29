import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { catalogueApi, type BackendBrand, type BackendCategory } from "./api/catalogueApi"
import { useAuth } from "./authContext"
import {
  orderStages,
  type Brand,
  type Order,
  type OrderStatus,
  type Product,
} from "./data"
import { cartApi, guestTokenStorage, wishlistApi } from "./features/commerceApi"
import type { CartData } from "./features/commerceTypes"
import { transformBackendProduct } from "./utils/productTransform"

type CartLine = {
  productId: string
  quantity: number
}
type Toast = {
  id: number
  message: string
}

type StoreValue = {
  products: Product[]
  brands: Brand[]
  categories: BackendCategory[]
  orders: Order[]
  cart: CartLine[]
  wishlist: string[]
  compareIds: string[]
  toasts: Toast[]
  addToCart: (id: string, quantity?: number) => void
  updateCart: (id: string, quantity: number) => void
  removeFromCart: (id: string) => void
  toggleWishlist: (id: string) => void
  toggleCompare: (id: string) => void
  clearCompare: () => void
  createOrder: (address: string, payment: string) => Order
  updateOrderStatus: (id: string, status: OrderStatus) => void
  advanceOrder: (id: string) => void
  reorder: (id: string) => void
  saveProduct: (product: Product) => void
  deleteProduct: (id: string) => void
  saveBrand: (brand: Brand) => void
  deleteBrand: (id: string) => void
  adjustStock: (id: string, stock: number) => void
  notify: (message: string) => void
  refreshBackendCart: () => Promise<void>
  backendCart: CartData | null
  getProductAsync: (id: string) => Promise<Product | undefined>
  cartCount: number
  cartTotal: number
}


const StoreContext = createContext<StoreValue | null>(null)

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // Purge obsolete mock catalogue localStorage on startup
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      // Invalidate if local storage contains old demo seeds
      const stored = readStored<Product[]>("hh-products", [])
      const hasMockSeeds = stored.some((p) => p.id?.startsWith("seed-") || p.brandId === "store-select")
      if (hasMockSeeds) {
        localStorage.removeItem("hh-products")
        return []
      }
      return stored
    } catch {
      return []
    }
  })

  const [brands, setBrands] = useState<Brand[]>(() => {
    try {
      const stored = readStored<Brand[]>("hh-brands", [])
      const hasMockBrands = stored.some((b) => b.id === "store-select" || b.id === "astral-pipes")
      if (hasMockBrands) {
        localStorage.removeItem("hh-brands")
        return []
      }
      return stored
    } catch {
      return []
    }
  })
  const [categories, setCategories] = useState<BackendCategory[]>([])
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      localStorage.removeItem("hh-orders")
      return []
    } catch {
      return []
    }
  })
  const [cart, setCart] = useState<CartLine[]>(() => readStored("hh-cart", []))
  const [wishlist, setWishlist] = useState<string[]>(() =>
    readStored("hh-wishlist", []),
  )
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    readStored("hh-compare", []),
  )
  const [toasts, setToasts] = useState<Toast[]>([])

  // Hydrate categories, brands and catalogue products from backend catalogue API backed by database
  useEffect(() => {
    let isMounted = true

    catalogueApi
      .getCategories()
      .then((backendCats) => {
        if (!isMounted || !backendCats || !backendCats.length) return
        setCategories(backendCats)
      })
      .catch(() => {})

    catalogueApi
      .getBrands()
      .then((backendBrands) => {
        if (!isMounted || !backendBrands || !backendBrands.length) return
        const mappedBrands: Brand[] = backendBrands.map((b: any) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          logo: b.logo_url || b.logoUrl || undefined,
          description: b.description || `${b.name} genuine plumbing and hardware products.`,
          supportedCategories: [],
          active: b.is_active ?? b.isActive ?? true,
          displayOrder: b.display_order ?? b.displayOrder ?? 0,
          discountPercentage: b.discount_percentage ?? b.discountPercentage ?? null,
        }))
        setBrands(mappedBrands)
      })
      .catch(() => {
        // Do not fabricate mock brands on failure
      })

    // Hydrate top catalogue products from backend for fast local lookup (e.g. cart/wishlist details)
    catalogueApi
      .listProducts({ page: 1, limit: 100 })
      .then((res) => {
        if (!isMounted || !res || !res.items.length) return
        const transformed = res.items.map(transformBackendProduct)
        setProducts(transformed)
      })
      .catch(() => {
        // Do not fabricate mock products on failure
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(
    () => localStorage.setItem("hh-products", JSON.stringify(products)),
    [products],
  )
  useEffect(
    () => localStorage.setItem("hh-brands", JSON.stringify(brands)),
    [brands],
  )
  useEffect(
    () => localStorage.setItem("hh-orders", JSON.stringify(orders)),
    [orders],
  )
  useEffect(() => localStorage.setItem("hh-cart", JSON.stringify(cart)), [cart])
  useEffect(
    () => localStorage.setItem("hh-wishlist", JSON.stringify(wishlist)),
    [wishlist],
  )
  useEffect(
    () => localStorage.setItem("hh-compare", JSON.stringify(compareIds)),
    [compareIds],
  )

  const { isAuthenticated } = useAuth()
  const [backendCart, setBackendCart] = useState<CartData | null>(null)

  // Sync with live backend Cart (Guest or Authenticated)
  const refreshBackendCart = async () => {
    try {
      if (isAuthenticated) {
        // Check if there is an unmerged guest cart
        const guestToken = guestTokenStorage.get()
        if (guestToken) {
          try {
            const merged = await cartApi.mergeGuestCart(guestToken)
            setBackendCart(merged)
            setCart(
              merged.items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
              })),
            )
            return
          } catch {
            guestTokenStorage.clear()
          }
        }
        const userCart = await cartApi.getCustomerCart()
        setBackendCart(userCart)
        setCart(
          userCart.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        )
      } else {
        const guestToken = guestTokenStorage.get()
        if (guestToken) {
          try {
            const gCart = await cartApi.getGuestCart(guestToken)
            setBackendCart(gCart)
            setCart(
              gCart.items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
              })),
            )
          } catch {
            guestTokenStorage.clear()
          }
        }
      }
    } catch {
      // Offline or network error -> fallback to local state
    }
  }

  // Fetch a product by ID if not in products cache and add to cache
  const getProductAsync = async (id: string): Promise<Product | undefined> => {
    const existing = products.find((p) => p.id === id)
    if (existing) return existing
    try {
      const fetched = await catalogueApi.getProductById(id)
      if (fetched) {
        const transformed = transformBackendProduct(fetched)
        setProducts((prev) => (prev.some((p) => p.id === transformed.id) ? prev : [...prev, transformed]))
        return transformed
      }
    } catch {
      // product not found
    }
    return undefined
  }

  // Fetch backend wishlist if authenticated
  const refreshBackendWishlist = async () => {
    if (!isAuthenticated) return
    try {
      const liveWishlist = await wishlistApi.getWishlist()
      if (Array.isArray(liveWishlist)) {
        setWishlist(liveWishlist.map((w) => w.productId))
      }
    } catch {
      // Fallback to local
    }
  }

  useEffect(() => {
    refreshBackendCart()
    refreshBackendWishlist()
  }, [isAuthenticated])

  const notify = (message: string) => {
    const id = Date.now()
    setToasts((items) => [...items, { id, message }])
    window.setTimeout(
      () => setToasts((items) => items.filter((toast) => toast.id !== id)),
      2600,
    )
  }

  const addToCart = async (productId: string, quantity = 1) => {
    // Optimistic UI update
    setCart((items) => {
      const current = items.find((item) => item.productId === productId)
      return current
        ? items.map((item) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          )
        : [...items, { productId, quantity }]
    })
    notify("Added to cart")

    // Async backend persistence
    try {
      if (isAuthenticated) {
        const updated = await cartApi.addCustomerCartItem({ productId, quantity })
        setBackendCart(updated)
      } else {
        let token = guestTokenStorage.get()
        if (!token) {
          const init = await cartApi.createGuestCart()
          token = init.guestToken
        }
        const updated = await cartApi.addGuestCartItem(token, { productId, quantity })
        setBackendCart(updated)
      }
    } catch {
      // Backend error will not break UI
    }
  }

  const updateCart = async (productId: string, quantity: number) => {
    if (quantity < 1) return
    setCart((items) =>
      items.map((item) =>
        item.productId === productId ? { ...item, quantity } : item,
      ),
    )

    try {
      const itemToUpdate = backendCart?.items.find((i) => i.productId === productId)
      if (itemToUpdate) {
        if (isAuthenticated) {
          const updated = await cartApi.updateCustomerCartItem(itemToUpdate.id, quantity)
          setBackendCart(updated)
        } else {
          const token = guestTokenStorage.get()
          if (token) {
            const updated = await cartApi.updateGuestCartItem(token, itemToUpdate.id, quantity)
            setBackendCart(updated)
          }
        }
      }
    } catch {}
  }

  const removeFromCart = async (productId: string) => {
    setCart((items) => items.filter((item) => item.productId !== productId))
    notify("Item removed from cart")

    try {
      const itemToRemove = backendCart?.items.find((i) => i.productId === productId)
      if (itemToRemove) {
        if (isAuthenticated) {
          const updated = await cartApi.removeCustomerCartItem(itemToRemove.id)
          setBackendCart(updated)
        } else {
          const token = guestTokenStorage.get()
          if (token) {
            const updated = await cartApi.removeGuestCartItem(token, itemToRemove.id)
            setBackendCart(updated)
          }
        }
      }
    } catch {}
  }

  const toggleWishlist = async (id: string) => {
    const isCurrentlyWishlisted = wishlist.includes(id)
    setWishlist((items) =>
      isCurrentlyWishlisted ? items.filter((item) => item !== id) : [...items, id],
    )

    if (isAuthenticated) {
      try {
        if (isCurrentlyWishlisted) {
          await wishlistApi.removeFromWishlist(id)
          notify("Removed from wishlist")
        } else {
          await wishlistApi.addToWishlist(id)
          notify("Saved to your wishlist")
        }
      } catch {
        // Rollback on network rejection
        setWishlist((items) =>
          isCurrentlyWishlisted ? [...items, id] : items.filter((item) => item !== id),
        )
      }
    } else {
      notify(isCurrentlyWishlisted ? "Removed from wishlist" : "Saved to wishlist")
    }
  }

  const toggleCompare = (id: string) => {
    setCompareIds((items) => {
      if (items.includes(id)) return items.filter((item) => item !== id)
      const product = products.find((item) => item.id === id)
      const selected = products.find((item) => item.id === items[0])
      if (
        selected &&
        (!product?.comparisonGroupId ||
          product.comparisonGroupId !== selected.comparisonGroupId)
      ) {
        notify("Choose products from the same comparison group")
        return items
      }
      if (items.length >= 4) {
        notify("You can compare up to four products")
        return items
      }
      notify("Product added to comparison")
      return [...items, id]
    })
  }

  const createOrder = (address: string, payment: string) => {
    const order: Order = {
      id: `HH-${Date.now().toString().slice(-6)}`,
      date: new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date()),
      status: "Order Placed",
      total: cart.reduce(
        (sum, line) =>
          sum +
          (products.find((p) => p.id === line.productId)?.price ?? 0) *
            line.quantity,
        0,
      ),
      payment,
      paymentStatus:
        payment === "Cash on Delivery" ? "Pending" : "Demo payment selected",
      address,
      items: cart.map((line) => ({
        ...line,
        price: products.find((p) => p.id === line.productId)?.price ?? 0,
      })),
    }
    setOrders((items) => [order, ...items])
    setProducts((items) =>
      items.map((product) => {
        const line = cart.find((item) => item.productId === product.id)
        return line
          ? { ...product, stock: Math.max(0, product.stock - line.quantity) }
          : product
      }),
    )
    setCart([])
    notify("Demo order placed successfully")
    return order
  }

  const updateOrderStatus = (id: string, status: OrderStatus) => {
    setOrders((items) =>
      items.map((order) => (order.id === id ? { ...order, status } : order)),
    )
    notify(`Order ${id} updated to ${status}`)
  }

  const advanceOrder = (id: string) => {
    const order = orders.find((item) => item.id === id)
    if (!order || order.status === "Cancelled") return
    const index = orderStages.indexOf(order.status)
    updateOrderStatus(
      id,
      orderStages[Math.min(index + 1, orderStages.length - 1)],
    )
  }

  const reorder = (id: string) => {
    const order = orders.find((item) => item.id === id)
    if (!order) return
    order.items.forEach((item) => addToCart(item.productId, item.quantity))
  }

  const saveProduct = (product: Product) => {
    setProducts((items) =>
      items.some((item) => item.id === product.id)
        ? items.map((item) => (item.id === product.id ? product : item))
        : [product, ...items],
    )
    notify("Product saved to demo catalog")
  }

  const deleteProduct = (id: string) => {
    setProducts((items) => items.filter((item) => item.id !== id))
    notify("Product deleted from demo catalog")
  }

  const saveBrand = (brand: Brand) => {
    setBrands((items) =>
      items.some((item) => item.id === brand.id)
        ? items.map((item) => (item.id === brand.id ? brand : item))
        : [...items, brand],
    )
    notify("Brand saved to demo catalog")
  }

  const deleteBrand = (id: string) => {
    if (products.some((product) => product.brandId === id)) {
      notify("Remove brand product associations before deleting")
      return
    }
    setBrands((items) => items.filter((item) => item.id !== id))
    notify("Brand removed")
  }

  const adjustStock = (id: string, stock: number) => {
    setProducts((items) =>
      items.map((item) =>
        item.id === id ? { ...item, stock: Math.max(0, stock) } : item,
      ),
    )
  }

  const value = useMemo<StoreValue>(
    () => ({
      products,
      brands,
      categories,
      orders,
      cart,
      wishlist,
      compareIds,
      toasts,
      addToCart,
      updateCart,
      removeFromCart,
      toggleWishlist,
      toggleCompare,
      clearCompare: () => setCompareIds([]),
      createOrder,
      updateOrderStatus,
      advanceOrder,
      reorder,
      saveProduct,
      deleteProduct,
      saveBrand,
      deleteBrand,
      adjustStock,
      notify,
      refreshBackendCart,
      backendCart,
      getProductAsync,
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal:
        backendCart?.subtotal ??
        cart.reduce((sum, item) => {
          const matched = products.find((p) => p.id === item.productId)
          const fallbackBackendItem = backendCart?.items.find((b) => b.productId === item.productId)
          const price = matched?.price ?? fallbackBackendItem?.unitPrice ?? 0
          return sum + price * item.quantity
        }, 0),
    }),
    [products, brands, categories, orders, cart, wishlist, compareIds, toasts, backendCart],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error("useStore must be used within StoreProvider")
  return value
}
