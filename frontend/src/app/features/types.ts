/**
 * Product Images, Galleries, Comparison & Alternatives API Contracts
 */

export interface BackendProductImage {
  id: string
  product_id: string
  variant_id?: string | null
  storage_path: string
  public_url?: string
  alt_text?: string | null
  display_order: number
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface ProductComparisonItem {
  id: string
  name: string
  slug: string
  sku: string | null
  brand: { id: string; name: string; slug: string; logoUrl?: string | null } | null
  category: { id: string; name: string; slug: string } | null
  basePrice: number
  compareAtPrice: number | null
  unit: string
  unitOfSale: string
  material: string | null
  diameter: string | null
  length: string | null
  pressureRating: string | null
  technicalStandard: string | null
  intendedApplication: string | null
  comparisonGroupId: string | null
  primaryImage: string | null
  specs: Record<string, string>
  stockAvailable: number
  variants: {
    id: string
    sku: string | null
    name: string
    price: number
    attributes: Record<string, string>
  }[]
}

export interface ProductComparisonResponse {
  products: ProductComparisonItem[]
  commonAttributes: Record<string, boolean>
  attributeDifferences: string[]
}

export interface ProductAlternativeItem {
  product: ProductComparisonItem
  matchingAttributes: string[]
  differingAttributes: string[]
  priceDifference: number
}
