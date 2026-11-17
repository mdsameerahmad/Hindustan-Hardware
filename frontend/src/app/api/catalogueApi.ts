/**
 * Catalogue API Service for Hindustan Hardware & Sanitary.
 * Communicates with backend product, category, and brand endpoints.
 */

import { apiRequest, getApiBaseUrl } from './client'

export interface BackendCategory {
  id: string
  name: string
  slug: string
  description?: string | null
  image_url?: string | null
  is_active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface BackendBrand {
  id: string
  name: string
  slug: string
  description?: string | null
  logo_url?: string | null
  website_url?: string | null
  is_active: boolean
  display_order: number
  created_at?: string
  updated_at?: string
}

export interface BackendInventory {
  id: string
  product_id: string
  variant_id?: string | null
  quantity_available: number
  quantity_reserved?: number
  low_stock_threshold?: number
}

export interface BackendProductVariant {
  id: string
  product_id: string
  sku?: string | null
  name: string
  price_override?: number | null
  variant_attributes?: Record<string, string>
  is_active: boolean
}

export interface BackendProduct {
  id: string
  name: string
  slug: string
  sku?: string | null
  description?: string | null
  category_id: string
  brand_id?: string | null
  base_price: number
  compare_at_price?: number | null
  cost_price?: number | null
  unit?: string | null
  unit_of_sale?: string | null
  material?: string | null
  diameter?: string | null
  length?: string | null
  pressure_rating?: string | null
  technical_standard?: string | null
  intended_application?: string | null
  comparison_group_id?: string | null
  is_featured: boolean
  is_active: boolean
  specs?: Record<string, any> | null
  discount_percentage?: number | null
  created_at: string
  updated_at: string
  brand?: {
    id: string
    name: string
    slug: string
    logo_url?: string | null
    description?: string | null
    discount_percentage?: number | null
  } | null
  category?: {
    id: string
    name: string
    slug: string
  } | null
  inventory?: BackendInventory | null
  variants?: BackendProductVariant[]
  image_url?: string | null
  product_images?: string[] | any[] | null
}

export interface ProductListParams {
  page?: number
  limit?: number
  search?: string
  category?: string
  brand?: string
  minPrice?: number
  maxPrice?: number
  sortBy?: 'price' | 'name' | 'createdAt' | 'created_at'
  sortOrder?: 'asc' | 'desc'
  featured?: boolean
  availability?: 'in_stock' | 'all'
}

export type ProductFilters = ProductListParams

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PaginatedProductsResponse {
  items: BackendProduct[]
  pagination: PaginationMeta
}

export const catalogueApi = {
  /**
   * List products with pagination, search, category, brand, price filters, and sorting.
   */
  listProducts: async (params: ProductListParams = {}): Promise<PaginatedProductsResponse> => {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.limit) searchParams.set('limit', String(params.limit))
    if (params.search && params.search.trim()) searchParams.set('search', params.search.trim())
    if (params.category && params.category.trim()) searchParams.set('category', params.category.trim())
    if (params.brand && params.brand.trim()) searchParams.set('brand', params.brand.trim())
    if (params.minPrice !== undefined && params.minPrice !== null) searchParams.set('minPrice', String(params.minPrice))
    if (params.maxPrice !== undefined && params.maxPrice !== null) searchParams.set('maxPrice', String(params.maxPrice))
    if (params.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder)
    if (params.featured !== undefined) searchParams.set('featured', String(params.featured))
    if (params.availability) searchParams.set('availability', params.availability)

    const queryStr = searchParams.toString()
    const endpoint = `/products${queryStr ? `?${queryStr}` : ''}`

    const url = `${getApiBaseUrl()}${endpoint}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch products: ${res.statusText}`)
    }

    const json = await res.json()
    return {
      items: (json.data || []) as BackendProduct[],
      pagination: (json.meta?.pagination || {
        page: params.page || 1,
        limit: params.limit || 20,
        total: json.data?.length || 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }) as PaginationMeta,
    }
  },

  /**
   * Fetch featured products for the storefront.
   */
  getFeaturedProducts: async (limit = 10): Promise<BackendProduct[]> => {
    return apiRequest<BackendProduct[]>(`/products/featured?limit=${limit}`)
  },

  /**
   * Get single product detail by ID (UUID).
   */
  getProductById: async (id: string): Promise<BackendProduct> => {
    return apiRequest<BackendProduct>(`/products/${id}`)
  },

  /**
   * Alias for getProductById
   */
  getProduct: async (id: string): Promise<BackendProduct> => {
    return apiRequest<BackendProduct>(`/products/${id}`)
  },

  /**
   * Get single product detail by URL slug.
   */
  getProductBySlug: async (slug: string): Promise<BackendProduct> => {
    return apiRequest<BackendProduct>(`/products/slug/${slug}`)
  },

  /**
   * Get related products sharing same category.
   */
  getRelatedProducts: async (id: string, limit = 4): Promise<BackendProduct[]> => {
    return apiRequest<BackendProduct[]>(`/products/${id}/related?limit=${limit}`)
  },

  /**
   * Get cross-brand alternatives.
   */
  getAlternativeProducts: async (id: string, limit = 4): Promise<BackendProduct[]> => {
    return apiRequest<BackendProduct[]>(`/products/${id}/alternatives?limit=${limit}`)
  },

  /**
   * Fetch all active categories.
   */
  getCategories: async (): Promise<BackendCategory[]> => {
    return apiRequest<BackendCategory[]>('/categories')
  },

  /**
   * Fetch category detail by slug.
   */
  getCategoryBySlug: async (slug: string): Promise<BackendCategory> => {
    return apiRequest<BackendCategory>(`/categories/slug/${slug}`)
  },

  /**
   * Fetch all active brands.
   */
  getBrands: async (): Promise<BackendBrand[]> => {
    return apiRequest<BackendBrand[]>('/brands')
  },

  /**
   * Fetch brand detail by slug.
   */
  getBrandBySlug: async (slug: string): Promise<BackendBrand> => {
    return apiRequest<BackendBrand>(`/brands/slug/${slug}`)
  },

  /**
   * Bulk update product prices and discounts from Excel/CSV file (Admin).
   */
  bulkUpdatePrices: async (file: File): Promise<{
    totalProcessed: number
    updatedCount: number
    failedCount: number
    errors: { itemCode: string; reason: string }[]
    details: {
      itemCode: string
      name: string
      oldMrp: number | null
      newMrp: number
      oldDiscount: number
      newDiscount: number
      oldPrice: number
      newPrice: number
    }[]
  }> => {
    const formData = new FormData()
    formData.append("file", file)

    return apiRequest("/admin/products/bulk-price-update", {
      method: "POST",
      body: formData,
      requiresAuth: true,
    })
  },
}
