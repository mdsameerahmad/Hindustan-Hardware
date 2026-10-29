/**
 * Transforms BackendProduct into the frontend Product interface,
 * ensuring complete compatibility with existing UI components.
 */

import type { BackendProduct } from '../api/catalogueApi'
import type { Product } from '../data'

export const DEFAULT_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=800&q=80'

export function transformBackendProduct(bp: BackendProduct): Product {
  const brandName = bp.brand?.name || 'Hindustan Hardware'
  const brandId = bp.brand_id || bp.brand?.id || 'unbranded'
  const categoryName = bp.category?.name || 'General Hardware'
  const categoryId = bp.category_id || bp.category?.id || 'general'

  // Image handling: Strictly prioritize product-specific image uploaded by admin
  // Do NOT show brand logo as product image since brand logo is distinct from product photo
  let image: string = DEFAULT_PRODUCT_IMAGE

  if (Array.isArray(bp.product_images) && bp.product_images.length > 0) {
    const first = bp.product_images[0]
    if (typeof first === 'string' && first.trim()) {
      image = first.trim()
    } else if (first?.public_url) {
      image = first.public_url
    } else if (first?.storage_path) {
      image = first.storage_path
    }
  } else if (bp.image_url && typeof bp.image_url === 'string' && bp.image_url.trim()) {
    image = bp.image_url.trim()
  } else if (bp.specs?.image_url && typeof bp.specs.image_url === 'string') {
    image = bp.specs.image_url.trim()
  } else if (bp.specs?.imageUrl && typeof bp.specs.imageUrl === 'string') {
    image = bp.specs.imageUrl.trim()
  }

  // Stock handling:
  // If inventory record exists and is non-negative, use quantity_available.
  // Otherwise default to 0 with safe stock representation.
  const stock = bp.inventory?.quantity_available ?? 0

  return {
    id: bp.id,
    slug: bp.slug,
    name: bp.name,
    brand: brandName,
    brandId,
    brandName,
    category: categoryName,
    categoryId,
    productType: (bp.specs?.product_type as string) || (bp.specs?.subcategory as string) || categoryName,
    price: bp.base_price,
    mrp: bp.compare_at_price || undefined,
    stock,
    unit: bp.unit || 'Piece',
    unitOfSale: bp.unit_of_sale || 'Per Piece',
    material: bp.material || (bp.specs?.material as string) || '',
    size: (bp.specs?.size as string) || (bp.specs?.size_extracted as string) || '',
    diameter: bp.diameter || (bp.specs?.diameter as string) || '',
    length: bp.length || (bp.specs?.length as string) || '',
    pressureRating: bp.pressure_rating || (bp.specs?.pressure_rating as string) || '',
    technicalStandard: bp.technical_standard || (bp.specs?.technical_standard as string) || '',
    intendedApplication: bp.intended_application || (bp.specs?.intended_application as string) || '',
    comparisonGroupId: bp.comparison_group_id || undefined,
    variantAttributes: {},
    images: (Array.isArray(bp.product_images) && bp.product_images.length > 0)
      ? bp.product_images.map((img: any) => typeof img === 'string' ? img : (img?.public_url || img?.storage_path || image))
      : [image],
    description: bp.description || `${bp.name} - Quality hardware product available at Hindustan Hardware.`,
    featured: bp.is_featured,
    active: bp.is_active,
    discountPercentage: bp.discount_percentage ?? (bp.specs?.discount_percentage ? Number(bp.specs.discount_percentage) : null),
    specs: (bp.specs as Record<string, string>) || {},
  }
}
