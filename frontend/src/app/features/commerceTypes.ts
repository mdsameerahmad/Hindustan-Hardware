/**
 * TypeScript Contracts for Cart, Customer Addresses, and Wishlist.
 * Matches backend database models and route responses.
 */

export interface CustomerAddress {
  id: string
  user_id?: string
  recipient_name: string
  phone: string
  address_line1: string
  address_line2?: string | null
  landmark?: string | null
  city: string
  state: string
  postal_code: string
  country: string
  address_type: "Home" | "Work" | "Site" | string
  is_default: boolean
  latitude?: number | null
  longitude?: number | null
  formatted_address?: string | null
  geocoding_provider?: string | null
  created_at?: string
  updated_at?: string
}

export interface CreateAddressPayload {
  recipientName: string
  phone: string
  addressLine1: string
  addressLine2?: string | null
  landmark?: string | null
  city: string
  state: string
  postalCode: string
  country?: string
  addressType?: "Home" | "Work" | "Site"
  isDefault?: boolean
  latitude?: number | null
  longitude?: number | null
  formattedAddress?: string | null
  geocodingProvider?: string | null
}

export interface UpdateAddressPayload extends Partial<CreateAddressPayload> {}

export interface CartItem {
  id: string
  cartId: string
  productId: string
  variantId: string | null
  name: string
  slug: string
  unit: string
  unitOfSale: string
  unitPrice: number
  compareAtPrice: number | null
  quantity: number
  lineTotal: number
  primaryImage: string | null
  brandName: string | null
  variantName: string | null
  variantAttributes: Record<string, string>
  stockAvailable: number
  isAvailable: boolean
  createdAt: string
  updatedAt?: string
}

export interface CartData {
  id: string
  userId: string | null
  isGuest: boolean
  status: string
  itemCount: number
  totalQuantity: number
  subtotal: number
  items: CartItem[]
  createdAt?: string
  updatedAt?: string
}

export interface AddCartItemPayload {
  productId: string
  variantId?: string | null
  quantity?: number
}

export interface WishlistItem {
  id: string
  productId: string
  name: string
  slug: string
  basePrice: number
  compareAtPrice: number | null
  primaryImage: string | null
  brandName: string | null
  stockAvailable: number
  createdAt: string
}

// ===================== Checkout & Order Types =====================

export interface CheckoutAddressSnapshot {
  recipientName: string
  phone: string
  addressLine1: string
  addressLine2?: string | null
  landmark?: string | null
  city: string
  state: string
  postalCode: string
  country?: string
  addressType?: "Home" | "Work" | "Site" | string
  latitude?: number | null
  longitude?: number | null
  formattedAddress?: string | null
  geocodingProvider?: string | null
}

export interface CheckoutValidationPayload {
  addressId?: string
  shippingAddress?: CheckoutAddressSnapshot
  paymentMethod: "cod"
}

export interface ValidatedCheckoutItem {
  productId: string
  variantId: string | null
  productName: string
  unitPrice: number
  quantity: number
  lineTotal: number
  inStock: boolean
  stockAvailable: number
}

export interface PriceDiscrepancy {
  productId: string
  productName: string
  oldPrice: number
  currentPrice: number
}

export interface CheckoutValidationResult {
  isValid: boolean
  canCheckout: boolean
  deliveryAvailable?: boolean
  deliveryMessage?: string
  deliveryPincode?: string
  itemCount: number
  subtotal: number
  totalAmount: number
  currency: string
  paymentMethod: "cod"
  shippingAddress: Record<string, unknown>
  items: ValidatedCheckoutItem[]
  priceDiscrepancies?: PriceDiscrepancy[]
}

export interface CreateOrderPayload {
  addressId?: string
  shippingAddress?: CheckoutAddressSnapshot
  paymentMethod: "cod"
  customerNotes?: string | null
  idempotencyKey?: string
}

export interface OrderItemSnapshot {
  id: string
  orderId: string
  productId: string
  variantId: string | null
  productName: string
  brandName?: string | null
  sku: string | null
  variantTitle: string | null
  specifications?: Record<string, unknown>
  unitPrice: number
  quantity: number
  lineSubtotal: number
  createdAt?: string
}

export interface OrderResponse {
  id: string
  orderNumber: string
  userId: string | null
  status: string
  paymentMethod: "cod" | string
  paymentStatus: "pending" | "partially_paid" | "paid" | string
  currency: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  shippingAmount: number
  totalAmount: number
  deliveryFee?: number
  totalPayable?: number
  shippingAddress: Record<string, any>
  customerNotes?: string | null
  invoiceUrl?: string | null
  invoiceFileName?: string | null
  invoiceUploadedAt?: string | null
  deliveryOtp?: string | null
  items: OrderItemSnapshot[]
  createdAt: string
  updatedAt?: string
}

export interface OrderStatusHistoryItem {
  id: string
  orderId: string
  previousStatus: string | null
  newStatus: string
  actorId: string | null
  reason: string | null
  createdAt: string
}

export interface OrderSummaryItem {
  id: string
  orderNumber: string
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | string
  paymentMethod: "cod"
  paymentStatus: "pending" | "partially_paid" | "paid" | "failed" | "cancelled" | string
  amountCollected?: number
  amountDue?: number
  deliveryFee?: number
  totalPayable?: number
  currency: string
  itemCount: number
  totalQuantity: number
  subtotal: number
  totalAmount: number
  invoiceUrl?: string | null
  createdAt: string
  updatedAt: string
}

export interface OrderDetailsResponse extends OrderResponse {
  amountCollected?: number
  amountDue?: number
  paymentCollections?: {
    id: string
    amount: number
    method: "cash" | "online"
    notes: string | null
    actorId: string | null
    createdAt: string
  }[]
  statusHistory: OrderStatusHistoryItem[]
  canCancel: boolean
}

export interface OrderStatusTrackingResponse {
  orderId: string
  orderNumber: string
  currentStatus: string
  paymentMethod: "cod"
  paymentStatus: string
  deliveryFee?: number
  totalPayable?: number
  canCancel: boolean
  history: OrderStatusHistoryItem[]
  shippingAddress?: any
  invoiceUrl?: string | null
  invoiceFileName?: string | null
  invoiceUploadedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface PaginatedOrdersResponse {
  items: OrderSummaryItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

// ===================== Admin Types =====================

export interface AdminDashboardStats {
  customers: {
    total: number
  }
  products: {
    total: number
    active: number
    lowStock: number
  }
  catalogue: {
    categories: number
    brands: number
  }
  orders: {
    total: number
    totalValue: number
    collectedRevenue: number
    pendingRevenue: number
    pendingFulfillment: number
    awaitingCodCollection: number
    byStatus: {
      pending: number
      confirmed: number
      processing: number
      shipped: number
      delivered: number
      cancelled: number
    }
  }
  financials: {
    totalOrderValue: number
    collectedCodRevenue: number
    pendingCodRevenue: number
    totalAmountCollected: number
    totalAmountDue: number
    currency: string
  }
  recentOrders: OrderSummaryItem[]
}

export interface AdminCategory {
  id: string
  name: string
  slug: string
  description?: string | null
  imageUrl?: string | null
  image_url?: string | null
  discountPercentage?: number | null
  parentId?: string | null
  isActive: boolean
  sortOrder: number
  productCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface CreateCategoryPayload {
  name: string
  slug: string
  description?: string | null
  discountPercentage?: number | null
  parentId?: string | null
  isActive?: boolean
  sortOrder?: number
}

export interface UpdateCategoryPayload extends Partial<CreateCategoryPayload> {}

export interface AdminBrand {
  id: string
  name: string
  slug: string
  description?: string | null
  logoUrl?: string | null
  isActive: boolean
  displayOrder: number
  productCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface CreateBrandPayload {
  name: string
  slug: string
  description?: string | null
  logoUrl?: string | null
  isActive?: boolean
  displayOrder?: number
}

export interface UpdateBrandPayload extends Partial<CreateBrandPayload> {}

export interface CreateProductPayload {
  name: string
  slug: string
  sku?: string | null
  description?: string
  brandId?: string | null
  categoryId: string
  productType?: string | null
  basePrice: number
  compareAtPrice?: number | null
  unit?: string
  unitOfSale?: string
  material?: string | null
  diameter?: string | null
  length?: string | null
  pressureRating?: string | null
  technicalStandard?: string | null
  intendedApplication?: string | null
  comparisonGroupId?: string | null
  imageUrl?: string | null
  images?: string[]
  specs?: Record<string, string>
  discountPercentage?: number | null
  isFeatured?: boolean
  isActive?: boolean
  initialStock?: number
}

export interface UpdateProductPayload extends Partial<Omit<CreateProductPayload, "initialStock">> {}

// ===================== Phase 8 Types =====================

export interface AdminOrderQuery {
  page?: number
  limit?: number
  status?: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled"
  paymentStatus?: "pending" | "partially_paid" | "paid" | "failed" | "cancelled"
  userId?: string
  startDate?: string
  endDate?: string
  sortBy?: "created_at" | "total_amount" | "order_number"
  sortOrder?: "asc" | "desc"
}

export interface InventoryAdjustmentPayload {
  productId: string
  variantId?: string | null
  quantityChange: number
  movementType?: "adjustment" | "restock" | "correction" | "return"
  reason: string
  referenceId?: string
}

export interface InventoryMovementRecord {
  id: string
  productId: string
  productName?: string
  variantId: string | null
  variantTitle?: string | null
  movementType: "adjustment" | "restock" | "correction" | "order_deduction" | "order_cancellation" | "return"
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  reason: string
  actorId: string | null
  actorName?: string | null
  referenceId: string | null
  createdAt: string
}

export interface PaginatedInventoryMovements {
  items: InventoryMovementRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export interface AdminCustomerRecord {
  id: string
  email: string | null
  fullName: string
  phone: string | null
  avatarUrl: string | null
  role: "customer" | "admin"
  orderCount: number
  totalSpent: number
  createdAt: string
  updatedAt: string
}

export interface PaginatedAdminCustomers {
  items: AdminCustomerRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export interface AuditLogRecord {
  id: string
  actorId: string
  actorName?: string
  action: string
  resourceType: string
  resourceId: string
  details: Record<string, unknown>
  ipAddress: string | null
  createdAt: string
}

export interface PaginatedAuditLogs {
  items: AuditLogRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}
