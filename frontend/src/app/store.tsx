import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  initialBrands,
  initialOrders,
  initialProducts,
  orderStages,
  type Brand,
  type Order,
  type OrderStatus,
  type Product,
} from "./data"

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
  const [products, setProducts] = useState<Product[]>(() => {
    const stored = readStored<Product[]>("hh-products", [])
    if (!stored.length || !stored[0]?.brandId) return initialProducts
    const storedById = new Map(stored.map((product) => [product.id, product]))
    return initialProducts.map((seed) => {
      const previous = storedById.get(seed.id)
      return previous
        ? {
            ...seed,
            price: previous.price,
            stock: previous.stock,
            active: previous.active,
          }
        : seed
    })
  })
  const [brands, setBrands] = useState<Brand[]>(() =>
    readStored("hh-brands", initialBrands),
  )
  const [orders, setOrders] = useState(() =>
    readStored("hh-orders", initialOrders),
  )
  const [cart, setCart] = useState<CartLine[]>(() => readStored("hh-cart", []))
  const [wishlist, setWishlist] = useState<string[]>(() =>
    readStored("hh-wishlist", []),
  )
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    readStored("hh-compare", []),
  )
  const [toasts, setToasts] = useState<Toast[]>([])

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

  const notify = (message: string) => {
    const id = Date.now()
    setToasts((items) => [...items, { id, message }])
    window.setTimeout(
      () => setToasts((items) => items.filter((toast) => toast.id !== id)),
      2600,
    )
  }

  const addToCart = (productId: string, quantity = 1) => {
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
    notify("Added to your demo cart")
  }

  const updateCart = (productId: string, quantity: number) => {
    if (quantity < 1) return
    setCart((items) =>
      items.map((item) =>
        item.productId === productId ? { ...item, quantity } : item,
      ),
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((items) => items.filter((item) => item.productId !== productId))
    notify("Item removed from cart")
  }

  const toggleWishlist = (id: string) => {
    setWishlist((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    )
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
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal: cart.reduce(
        (sum, item) =>
          sum +
          (products.find((p) => p.id === item.productId)?.price ?? 0) *
            item.quantity,
        0,
      ),
    }),
    [products, brands, orders, cart, wishlist, compareIds, toasts],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error("useStore must be used within StoreProvider")
  return value
}
