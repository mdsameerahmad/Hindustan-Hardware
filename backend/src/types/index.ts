export type UserRole = 'customer' | 'admin' | 'staff';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  profile: UserProfile;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  discount_percentage?: number | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string | null;
  name: string;
  price_override: number | null;
  variant_attributes: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity_available: number;
  quantity_reserved: number;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  public_url?: string;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  description: string;
  brand_id: string | null;
  category_id: string;
  product_type: string | null;
  base_price: number;
  compare_at_price: number | null;
  unit: string;
  unit_of_sale: string;
  material: string | null;
  diameter: string | null;
  length: string | null;
  pressure_rating: string | null;
  technical_standard: string | null;
  intended_application: string | null;
  comparison_group_id: string | null;
  image_url: string | null;
  images: string[];
  specs: Record<string, string>;
  discount_percentage?: number | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  brand?: Brand | null;
  category?: Category | null;
  variants?: ProductVariant[];
  inventory?: Inventory | null;
  product_images?: ProductImage[];
}

export interface ProductComparisonItem {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  brand: { id: string; name: string; slug: string; logoUrl?: string | null } | null;
  category: { id: string; name: string; slug: string } | null;
  basePrice: number;
  compareAtPrice: number | null;
  unit: string;
  unitOfSale: string;
  material: string | null;
  diameter: string | null;
  length: string | null;
  pressureRating: string | null;
  technicalStandard: string | null;
  intendedApplication: string | null;
  comparisonGroupId: string | null;
  primaryImage: string | null;
  specs: Record<string, string>;
  stockAvailable: number;
  variants: {
    id: string;
    sku: string | null;
    name: string;
    price: number;
    attributes: Record<string, string>;
  }[];
}

export interface CustomerAddress {
  id: string;
  user_id: string;
  recipient_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  address_type: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItemResponse {
  id: string;
  cartId: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  unit: string;
  unitOfSale: string;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
  primaryImage: string | null;
  brandName: string | null;
  variantName: string | null;
  variantAttributes: Record<string, string>;
  stockAvailable: number;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartResponse {
  id: string;
  userId: string | null;
  isGuest: boolean;
  status: string;
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  items: CartItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItemResponse {
  id: string;
  productId: string;
  name: string;
  slug: string;
  basePrice: number;
  compareAtPrice: number | null;
  primaryImage: string | null;
  brandName: string | null;
  stockAvailable: number;
  createdAt: string;
}

export interface ProductComparisonResponse {
  products: ProductComparisonItem[];
  commonAttributes: Record<string, boolean>;
  attributeDifferences: string[];
}

export interface ProductAlternativeItem {
  product: ProductComparisonItem;
  matchingAttributes: string[];
  differingAttributes: string[];
  priceDifference: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
}

export interface DependencyStatus {
  status: 'configured' | 'not_configured' | 'healthy' | 'unreachable';
  message: string;
  latencyMs?: number;
}

export interface ReadinessCheckResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  uptime: number;
  dependencies: {
    supabase: DependencyStatus;
    [key: string]: DependencyStatus;
  };
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  sku: string | null;
  variantTitle: string | null;
  specifications: Record<string, string>;
  unitPrice: number;
  quantity: number;
  lineSubtotal: number;
  createdAt: string;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentMethod: 'cod';
  paymentStatus: PaymentStatus;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  shippingAddress: CustomerAddress | Record<string, unknown>;
  customerNotes: string | null;
  invoiceUrl?: string | null;
  invoiceFileName?: string | null;
  invoiceUploadedAt?: string | null;
  items: OrderItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutValidationResult {
  isValid: boolean;
  canCheckout: boolean;
  itemCount: number;
  subtotal: number;
  totalAmount: number;
  currency: string;
  paymentMethod: 'cod';
  shippingAddress: CustomerAddress | Record<string, unknown>;
  items: {
    productId: string;
    variantId: string | null;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    inStock: boolean;
    stockAvailable: number;
  }[];
  priceDiscrepancies?: {
    productId: string;
    productName: string;
    oldPrice: number;
    currentPrice: number;
  }[];
}

export interface OrderStatusHistoryItem {
  id: string;
  orderId: string;
  previousStatus: string | null;
  newStatus: string;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: 'cod';
  paymentStatus: PaymentStatus;
  currency: string;
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  totalAmount: number;
  invoiceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailsResponse extends OrderResponse {
  statusHistory: OrderStatusHistoryItem[];
  canCancel: boolean;
}

export interface OrderStatusTrackingResponse {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  paymentMethod: 'cod';
  paymentStatus: PaymentStatus;
  canCancel: boolean;
  history: OrderStatusHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardStats {
  customers: {
    total: number;
  };
  products: {
    total: number;
    active: number;
    lowStock: number;
  };
  catalogue: {
    categories: number;
    brands: number;
  };
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    pendingFulfillment: number;
    awaitingCodCollection: number;
  };
  financials: {
    totalOrderValue: number;
    collectedCodRevenue: number;
    pendingCodRevenue: number;
    currency: string;
  };
  recentOrders: OrderSummary[];
}

export interface InventoryMovementRecord {
  id: string;
  productId: string;
  productName?: string;
  variantId: string | null;
  variantTitle?: string | null;
  movementType: 'adjustment' | 'restock' | 'correction' | 'order_deduction' | 'order_cancellation' | 'return';
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  actorId: string | null;
  actorName?: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminCustomerRecord {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  orderCount: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}


