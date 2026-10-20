/**
 * API services for product images, galleries, comparisons, and alternatives.
 */

import { apiRequest } from '../api/client'
import type {
  BackendProductImage,
  ProductComparisonResponse,
  ProductAlternativeItem,
} from './types'

export const productImagesApi = {
  /**
   * Fetch gallery images for a product in display order.
   */
  async getProductImages(productId: string): Promise<BackendProductImage[]> {
    return apiRequest<BackendProductImage[]>(`/products/${productId}/images`)
  },

  /**
   * Admin: Upload an image file for a product.
   */
  async uploadProductImage(
    productId: string,
    file: File,
    options?: {
      altText?: string
      displayOrder?: number
      isPrimary?: boolean
    }
  ): Promise<BackendProductImage> {
    const formData = new FormData()
    formData.append('image', file)
    if (options?.altText) formData.append('altText', options.altText)
    if (options?.displayOrder !== undefined) {
      formData.append('displayOrder', String(options.displayOrder))
    }
    if (options?.isPrimary !== undefined) {
      formData.append('isPrimary', String(options.isPrimary))
    }

    return apiRequest<BackendProductImage>(`/admin/products/${productId}/images`, {
      method: 'POST',
      body: formData,
    })
  },

  /**
   * Admin: Set an image as primary.
   */
  async setPrimaryImage(
    productId: string,
    imageId: string
  ): Promise<BackendProductImage> {
    return apiRequest<BackendProductImage>(
      `/admin/products/${productId}/images/${imageId}/primary`,
      {
        method: 'POST',
      }
    )
  },

  /**
   * Admin: Update image metadata (altText, displayOrder).
   */
  async updateImageMetadata(
    productId: string,
    imageId: string,
    data: { altText?: string | null; displayOrder?: number }
  ): Promise<BackendProductImage> {
    return apiRequest<BackendProductImage>(
      `/admin/products/${productId}/images/${imageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    )
  },

  /**
   * Admin: Delete an image.
   */
  async deleteProductImage(productId: string, imageId: string): Promise<void> {
    return apiRequest<void>(`/admin/products/${productId}/images/${imageId}`, {
      method: 'DELETE',
    })
  },
}

export const productComparisonApi = {
  /**
   * Compare 1 to 6 products by UUID via the backend ComparisonService.
   */
  async compareProducts(ids: string[]): Promise<ProductComparisonResponse> {
    if (!ids.length) {
      return { products: [], commonAttributes: {}, attributeDifferences: [] }
    }
    const param = ids.join(',')
    return apiRequest<ProductComparisonResponse>(`/products/compare?ids=${encodeURIComponent(param)}`)
  },

  /**
   * Fetch verified cross-brand alternative products sharing category or comparison group.
   */
  async getAlternatives(
    productId: string,
    filters?: {
      brandId?: string
      minPrice?: number
      maxPrice?: number
      limit?: number
    }
  ): Promise<ProductAlternativeItem[]> {
    const params = new URLSearchParams()
    if (filters?.brandId) params.set('brandId', filters.brandId)
    if (filters?.minPrice !== undefined) params.set('minPrice', String(filters.minPrice))
    if (filters?.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice))
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit))

    const queryStr = params.toString() ? `?${params.toString()}` : ''
    return apiRequest<ProductAlternativeItem[]>(`/products/${productId}/alternatives${queryStr}`)
  },
}
