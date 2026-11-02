/**
 * Commerce API Client: Address Management, Shopping Cart (Guest & Authenticated),
 * Cart Merging, and Customer Wishlist.
 */

import { apiRequest } from "../api/client"
import type {
  CustomerAddress,
  CreateAddressPayload,
  UpdateAddressPayload,
  CartData,
  AddCartItemPayload,
  WishlistItem,
} from "./commerceTypes"

const GUEST_CART_STORAGE_KEY = "hh_guest_cart_token"

export const guestTokenStorage = {
  get: (): string | null => {
    try {
      return localStorage.getItem(GUEST_CART_STORAGE_KEY)
    } catch {
      return null
    }
  },
  set: (token: string | null): void => {
    try {
      if (token) {
        localStorage.setItem(GUEST_CART_STORAGE_KEY, token)
      } else {
        localStorage.removeItem(GUEST_CART_STORAGE_KEY)
      }
    } catch {
      // Ignore in restricted environments
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(GUEST_CART_STORAGE_KEY)
    } catch {}
  },
}

// ===================== Customer Addresses API =====================
export const addressApi = {
  getAddresses: async (): Promise<CustomerAddress[]> => {
    return apiRequest<CustomerAddress[]>("/customers/me/addresses", {
      method: "GET",
      requiresAuth: true,
    })
  },

  createAddress: async (payload: CreateAddressPayload): Promise<CustomerAddress> => {
    return apiRequest<CustomerAddress>("/customers/me/addresses", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  updateAddress: async (
    addressId: string,
    payload: UpdateAddressPayload,
  ): Promise<CustomerAddress> => {
    return apiRequest<CustomerAddress>(`/customers/me/addresses/${addressId}`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  setDefaultAddress: async (addressId: string): Promise<CustomerAddress> => {
    return apiRequest<CustomerAddress>(`/customers/me/addresses/${addressId}/default`, {
      method: "POST",
      requiresAuth: true,
    })
  },

  deleteAddress: async (addressId: string): Promise<void> => {
    return apiRequest<void>(`/customers/me/addresses/${addressId}`, {
      method: "DELETE",
      requiresAuth: true,
    })
  },
}

// ===================== Shopping Cart API =====================
export const cartApi = {
  /**
   * Fetch authenticated customer cart.
   */
  getCustomerCart: async (): Promise<CartData> => {
    return apiRequest<CartData>("/cart", {
      method: "GET",
      requiresAuth: true,
    })
  },

  /**
   * Add item to authenticated customer cart.
   */
  addCustomerCartItem: async (payload: AddCartItemPayload): Promise<CartData> => {
    return apiRequest<CartData>("/cart/items", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  /**
   * Update item quantity in customer cart.
   */
  updateCustomerCartItem: async (itemId: string, quantity: number): Promise<CartData> => {
    return apiRequest<CartData>(`/cart/items/${itemId}`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify({ quantity }),
    })
  },

  /**
   * Remove item from customer cart.
   */
  removeCustomerCartItem: async (itemId: string): Promise<CartData> => {
    return apiRequest<CartData>(`/cart/items/${itemId}`, {
      method: "DELETE",
      requiresAuth: true,
    })
  },

  /**
   * Clear all items in customer cart.
   */
  clearCustomerCart: async (): Promise<CartData> => {
    return apiRequest<CartData>("/cart/items", {
      method: "DELETE",
      requiresAuth: true,
    })
  },

  /**
   * Initialize a new anonymous guest cart on the backend and persist its token.
   */
  createGuestCart: async (): Promise<{ cart: CartData; guestToken: string }> => {
    const res = await apiRequest<{ cart: CartData; guestToken: string }>("/cart/guest", {
      method: "POST",
    })
    if (res?.guestToken) {
      guestTokenStorage.set(res.guestToken)
    }
    return res
  },

  /**
   * Get active guest cart using stored token.
   */
  getGuestCart: async (token: string): Promise<CartData> => {
    return apiRequest<CartData>("/cart/guest", {
      method: "GET",
      headers: {
        "x-guest-cart-token": token,
      },
    })
  },

  /**
   * Add item to guest cart.
   */
  addGuestCartItem: async (token: string, payload: AddCartItemPayload): Promise<CartData> => {
    return apiRequest<CartData>("/cart/guest/items", {
      method: "POST",
      headers: {
        "x-guest-cart-token": token,
      },
      body: JSON.stringify(payload),
    })
  },

  /**
   * Update item quantity in guest cart.
   */
  updateGuestCartItem: async (token: string, itemId: string, quantity: number): Promise<CartData> => {
    return apiRequest<CartData>(`/cart/guest/items/${itemId}`, {
      method: "PATCH",
      headers: {
        "x-guest-cart-token": token,
      },
      body: JSON.stringify({ quantity }),
    })
  },

  /**
   * Remove item from guest cart.
   */
  removeGuestCartItem: async (token: string, itemId: string): Promise<CartData> => {
    return apiRequest<CartData>(`/cart/guest/items/${itemId}`, {
      method: "DELETE",
      headers: {
        "x-guest-cart-token": token,
      },
    })
  },

  /**
   * Clear all items in guest cart.
   */
  clearGuestCart: async (token: string): Promise<CartData> => {
    return apiRequest<CartData>("/cart/guest/items", {
      method: "DELETE",
      headers: {
        "x-guest-cart-token": token,
      },
    })
  },

  /**
   * Merge anonymous guest cart into authenticated customer cart upon login or register.
   */
  mergeGuestCart: async (guestToken: string): Promise<CartData> => {
    const res = await apiRequest<CartData>("/cart/merge", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify({ guestToken }),
    })
    // Invalidate local guest token once successfully merged into customer cart
    guestTokenStorage.clear()
    return res
  },
}

// ===================== Wishlist API =====================
export const wishlistApi = {
  getWishlist: async (): Promise<WishlistItem[]> => {
    return apiRequest<WishlistItem[]>("/customers/me/wishlist", {
      method: "GET",
      requiresAuth: true,
    })
  },

  addToWishlist: async (productId: string): Promise<void> => {
    return apiRequest<void>("/customers/me/wishlist", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify({ productId }),
    })
  },

  removeFromWishlist: async (productId: string): Promise<void> => {
    return apiRequest<void>(`/customers/me/wishlist/${productId}`, {
      method: "DELETE",
      requiresAuth: true,
    })
  },
}

// ===================== Checkout & Order Creation API =====================
export const checkoutApi = {
  /**
   * Validate cart items, stock, address, and calculate authoritative server totals.
   */
  validateCheckout: async (payload: {
    addressId?: string
    shippingAddress?: any
    paymentMethod: "cod"
  }) => {
    return apiRequest<{
      isValid: boolean
      canCheckout: boolean
      itemCount: number
      subtotal: number
      totalAmount: number
      currency: string
      paymentMethod: "cod"
      shippingAddress: Record<string, any>
      items: any[]
      priceDiscrepancies?: any[]
    }>("/checkout/validate", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  /**
   * Atomically place a Cash on Delivery (COD) order.
   */
  createOrder: async (payload: {
    addressId?: string
    shippingAddress?: any
    paymentMethod: "cod"
    customerNotes?: string | null
    idempotencyKey?: string
  }) => {
    return apiRequest<import("./commerceTypes").OrderResponse>("/checkout", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },
}

// ===================== Customer Orders Lookup API =====================
export const customerOrdersApi = {
  /**
   * Fetch paginated customer order history.
   */
  getOrders: async (params?: {
    page?: number
    limit?: number
    status?: string
    sortBy?: "created_at" | "total_amount"
    sortOrder?: "asc" | "desc"
  }) => {
    const query = new URLSearchParams()
    if (params?.page) query.append("page", String(params.page))
    if (params?.limit) query.append("limit", String(params.limit))
    if (params?.status) query.append("status", params.status)
    if (params?.sortBy) query.append("sortBy", params.sortBy)
    if (params?.sortOrder) query.append("sortOrder", params.sortOrder)
    const queryString = query.toString() ? `?${query.toString()}` : ""

    return apiRequest<import("./commerceTypes").PaginatedOrdersResponse>(
      `/customers/me/orders${queryString}`,
      {
        method: "GET",
        requiresAuth: true,
      },
    )
  },

  /**
   * Fetch customer order details by order UUID.
   */
  getOrderById: async (orderId: string) => {
    return apiRequest<import("./commerceTypes").OrderDetailsResponse>(
      `/customers/me/orders/${orderId}`,
      {
        method: "GET",
        requiresAuth: true,
      },
    )
  },

  /**
   * Fetch customer order status tracking & chronological history.
   */
  getOrderStatus: async (orderId: string) => {
    return apiRequest<import("./commerceTypes").OrderStatusTrackingResponse>(
      `/customers/me/orders/${orderId}/status`,
      {
        method: "GET",
        requiresAuth: true,
      },
    )
  },

  /**
   * Cancel an eligible order ('pending' or 'confirmed').
   */
  cancelOrder: async (orderId: string, reason: string = "Cancelled by customer") => {
    return apiRequest<import("./commerceTypes").OrderDetailsResponse>(
      `/customers/me/orders/${orderId}/cancel`,
      {
        method: "POST",
        requiresAuth: true,
        body: JSON.stringify({ reason }),
      },
    )
  },
}

// ===================== Admin Operations API =====================
export const adminApi = {
  /**
   * Fetch authenticated store administrator overview statistics.
   */
  getDashboardStats: async () => {
    return apiRequest<import("./commerceTypes").AdminDashboardStats>("/admin/dashboard", {
      method: "GET",
      requiresAuth: true,
    })
  },

  // ----------------- Categories Admin API -----------------
  getCategories: async () => {
    return apiRequest<import("./commerceTypes").AdminCategory[]>("/admin/categories", {
      method: "GET",
      requiresAuth: true,
    })
  },

  createCategory: async (payload: import("./commerceTypes").CreateCategoryPayload) => {
    return apiRequest<import("./commerceTypes").AdminCategory>("/admin/categories", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  updateCategory: async (id: string, payload: import("./commerceTypes").UpdateCategoryPayload) => {
    return apiRequest<import("./commerceTypes").AdminCategory>(`/admin/categories/${id}`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  deleteCategory: async (id: string) => {
    return apiRequest<void>(`/admin/categories/${id}`, {
      method: "DELETE",
      requiresAuth: true,
    })
  },

  // ----------------- Brands Admin API -----------------
  getBrands: async () => {
    return apiRequest<import("./commerceTypes").AdminBrand[]>("/admin/brands", {
      method: "GET",
      requiresAuth: true,
    })
  },

  createBrand: async (payload: import("./commerceTypes").CreateBrandPayload) => {
    return apiRequest<import("./commerceTypes").AdminBrand>("/admin/brands", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  updateBrand: async (id: string, payload: import("./commerceTypes").UpdateBrandPayload) => {
    return apiRequest<import("./commerceTypes").AdminBrand>(`/admin/brands/${id}`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  deleteBrand: async (id: string) => {
    return apiRequest<void>(`/admin/brands/${id}`, {
      method: "DELETE",
      requiresAuth: true,
    })
  },

  uploadBrandLogo: async (id: string, file: File) => {
    const formData = new FormData()
    formData.append("image", file)
    return apiRequest<import("./commerceTypes").AdminBrand>(`/admin/brands/${id}/logo`, {
      method: "POST",
      requiresAuth: true,
      body: formData,
    })
  },

  // ----------------- Products Admin API -----------------
  getProduct: async (id: string) => {
    return apiRequest<any>(`/admin/products/${id}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  createProduct: async (payload: import("./commerceTypes").CreateProductPayload) => {
    return apiRequest<any>("/admin/products", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  updateProduct: async (id: string, payload: import("./commerceTypes").UpdateProductPayload) => {
    return apiRequest<any>(`/admin/products/${id}`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  deleteProduct: async (id: string) => {
    return apiRequest<void>(`/admin/products/${id}`, {
      method: "DELETE",
      requiresAuth: true,
    })
  },

  updateInventory: async (productId: string, quantityChange: number, variantId?: string) => {
    const query = variantId ? `?variantId=${variantId}` : ""
    return apiRequest<any>(`/admin/products/${productId}/inventory${query}`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify({ quantityChange }),
    })
  },

  // ----------------- Phase 8: Admin Orders API -----------------
  listOrders: async (params?: import("./commerceTypes").AdminOrderQuery) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.status) searchParams.set("status", params.status)
    if (params?.paymentStatus) searchParams.set("paymentStatus", params.paymentStatus)
    if (params?.userId) searchParams.set("userId", params.userId)
    if (params?.startDate) searchParams.set("startDate", params.startDate)
    if (params?.endDate) searchParams.set("endDate", params.endDate)
    if (params?.sortBy) searchParams.set("sortBy", params.sortBy)
    if (params?.sortOrder) searchParams.set("sortOrder", params.sortOrder)

    const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
    return apiRequest<import("./commerceTypes").PaginatedOrdersResponse>(`/admin/orders${query}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  getOrderById: async (orderId: string) => {
    return apiRequest<import("./commerceTypes").OrderDetailsResponse>(`/admin/orders/${orderId}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  updateOrderStatus: async (orderId: string, status: string, reason?: string) => {
    return apiRequest<import("./commerceTypes").OrderDetailsResponse>(`/admin/orders/${orderId}/status`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify({ status, reason }),
    })
  },

  cancelOrder: async (orderId: string, reason?: string) => {
    return apiRequest<import("./commerceTypes").OrderDetailsResponse>(`/admin/orders/${orderId}/cancel`, {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify({ reason }),
    })
  },

  collectCodPayment: async (orderId: string, notes?: string) => {
    return apiRequest<import("./commerceTypes").OrderDetailsResponse>(`/admin/orders/${orderId}/collect-cod`, {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify({ notes }),
    })
  },

  uploadOrderInvoice: async (orderId: string, file: File) => {
    const formData = new FormData()
    formData.append("invoice", file)
    return apiRequest<import("./commerceTypes").OrderDetailsResponse>(`/admin/orders/${orderId}/invoice`, {
      method: "POST",
      requiresAuth: true,
      body: formData,
    })
  },

  // ----------------- Phase 8: Inventory Adjustments & Movements -----------------
  adjustInventory: async (payload: import("./commerceTypes").InventoryAdjustmentPayload) => {
    return apiRequest<{ id: string; productId: string; variantId: string | null; quantityAvailable: number }>(
      "/admin/inventory/adjustments",
      {
        method: "POST",
        requiresAuth: true,
        body: JSON.stringify(payload),
      },
    )
  },

  listInventoryMovements: async (params?: { page?: number; limit?: number; productId?: string; movementType?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.productId) searchParams.set("productId", params.productId)
    if (params?.movementType) searchParams.set("movementType", params.movementType)

    const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
    return apiRequest<import("./commerceTypes").PaginatedInventoryMovements>(`/admin/inventory/movements${query}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  // ----------------- Phase 8: Customer Administration -----------------
  listCustomers: async (params?: { page?: number; limit?: number; search?: string; role?: "customer" | "admin" }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.search) searchParams.set("search", params.search)
    if (params?.role) searchParams.set("role", params.role)

    const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
    return apiRequest<import("./commerceTypes").PaginatedAdminCustomers>(`/admin/customers${query}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  // ----------------- Phase 8: Audit Logs -----------------
  listAuditLogs: async (params?: { page?: number; limit?: number; resourceType?: string; action?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.resourceType) searchParams.set("resourceType", params.resourceType)
    if (params?.action) searchParams.set("action", params.action)

    const query = searchParams.toString() ? `?${searchParams.toString()}` : ""
    return apiRequest<import("./commerceTypes").PaginatedAuditLogs>(`/admin/audit-logs${query}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  // ----------------- Delivery Management: Assign Partner -----------------
  assignDeliveryPartner: async (payload: {
    orderId: string
    deliveryPartnerId: string
    notes?: string
  }) => {
    return apiRequest<{
      id: string
      orderId: string
      deliveryPartnerId: string
      status: string
    }>("/admin/deliveries/assign", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  // ----------------- Delivery Partner Management (CRUD) -----------------
  listDeliveryPartners: async (params?: { search?: string }) => {
    const query = params?.search ? `?search=${encodeURIComponent(params.search)}` : ""
    return apiRequest<any[]>(`/admin/delivery-partners${query}`, {
      method: "GET",
      requiresAuth: true,
    })
  },

  createDeliveryPartner: async (payload: {
    fullName: string
    phone: string
    avatarUrl?: string | null
    email?: string
    password?: string
  }) => {
    return apiRequest<any>("/admin/delivery-partners", {
      method: "POST",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  updateDeliveryPartner: async (
    id: string,
    payload: { fullName?: string; phone?: string; avatarUrl?: string | null }
  ) => {
    return apiRequest<any>(`/admin/delivery-partners/${id}`, {
      method: "PATCH",
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },

  deleteDeliveryPartner: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/admin/delivery-partners/${id}`, {
      method: "DELETE",
      requiresAuth: true,
    })
  },
}





