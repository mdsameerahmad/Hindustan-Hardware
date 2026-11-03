/**
 * Transforms BackendProduct into the frontend Product interface,
 * ensuring complete compatibility with existing UI components.
 */

import type { BackendProduct } from '../api/catalogueApi'
import type { Product } from '../data'
import { DEFAULT_PRODUCT_IMAGE, resolveProductImage } from './productImages'

export { DEFAULT_PRODUCT_IMAGE } from './productImages'

export function transformBackendProduct(bp: BackendProduct): Product {
  const brandName = bp.brand?.name || 'Hindustan Hardware'
  const brandId = bp.brand_id || bp.brand?.id || 'unbranded'
  const categoryName = bp.category?.name || 'General Hardware'
  const categoryId = bp.category_id || bp.category?.id || 'general'

  // Image handling: Strictly prioritize product-specific image uploaded by admin
  // Do NOT show brand logo as product image since brand logo is distinct from product photo
  const productImageCandidates = [
    ...(Array.isArray(bp.product_images)
      ? bp.product_images.map((img: any) => typeof img === 'string' ? img : img?.public_url)
      : []),
    bp.image_url,
    bp.specs?.image_url,
    bp.specs?.imageUrl,
  ]
  const productImages = productImageCandidates
    .map(resolveProductImage)
    .filter((candidate) => candidate !== DEFAULT_PRODUCT_IMAGE)
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
  const image = productImages[0] || DEFAULT_PRODUCT_IMAGE

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
    images: productImages.length > 0 ? productImages : [DEFAULT_PRODUCT_IMAGE],
    description: bp.description || `${bp.name} - Quality hardware product available at Hindustan Hardware.`,
    featured: bp.is_featured,
    active: bp.is_active,
    discountPercentage: bp.discount_percentage ?? (bp.specs?.discount_percentage ? Number(bp.specs.discount_percentage) : null),
    specs: (bp.specs as Record<string, string>) || {},
  }
}
