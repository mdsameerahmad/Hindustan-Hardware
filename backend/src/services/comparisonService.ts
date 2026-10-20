import { getSupabaseClient } from '../config/supabase';
import { InternalServerError, BadRequestError, NotFoundError } from '../common/errors';
import { ProductComparisonItem, ProductComparisonResponse, ProductAlternativeItem } from '../types';
import { ImageService } from './imageService';

const MAX_COMPARISON_ITEMS = 6;

export class ComparisonService {
  /**
   * Transforms raw Supabase product row into structured ProductComparisonItem
   */
  private static formatComparisonItem(row: any): ProductComparisonItem {
    // Derive primary image
    let primaryImage: string | null = row.image_url || null;
    if (Array.isArray(row.product_images) && row.product_images.length > 0) {
      const primary = row.product_images.find((img: any) => img.is_primary) || row.product_images[0];
      if (primary && primary.storage_path) {
        primaryImage = ImageService.getPublicUrl(primary.storage_path);
      }
    }

    // Availability from inventory
    let stockAvailable = 0;
    if (Array.isArray(row.inventory) && row.inventory.length > 0) {
      stockAvailable = row.inventory[0].quantity_available || 0;
    }

    // Formatted variants
    const variants = (row.variants || []).map((v: any) => ({
      id: v.id,
      sku: v.sku || null,
      name: v.name,
      price: v.price_override ? Number(v.price_override) : Number(row.base_price),
      attributes: v.variant_attributes || {},
    }));

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sku: row.sku || null,
      brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug, logoUrl: row.brand.logo_url } : null,
      category: row.category ? { id: row.category.id, name: row.category.name, slug: row.category.slug } : null,
      basePrice: Number(row.base_price),
      compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : null,
      unit: row.unit || 'piece',
      unitOfSale: row.unit_of_sale || 'piece',
      material: row.material || null,
      diameter: row.diameter || null,
      length: row.length || null,
      pressureRating: row.pressure_rating || null,
      technicalStandard: row.technical_standard || null,
      intendedApplication: row.intended_application || null,
      comparisonGroupId: row.comparison_group_id || null,
      primaryImage,
      specs: row.specs || {},
      stockAvailable,
      variants,
    };
  }

  /**
   * Compares an array of product IDs across brands, variants, and specifications.
   */
  static async compareProducts(productIds: string[]): Promise<ProductComparisonResponse> {
    // Deduplicate IDs while preserving input order
    const uniqueIds = Array.from(new Set(productIds));

    if (uniqueIds.length === 0) {
      throw new BadRequestError('At least one product ID must be provided for comparison.');
    }

    if (uniqueIds.length > MAX_COMPARISON_ITEMS) {
      throw new BadRequestError(`Cannot compare more than ${MAX_COMPARISON_ITEMS} products at once.`);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of uniqueIds) {
      if (!uuidRegex.test(id)) {
        throw new BadRequestError(`Invalid UUID identifier format: '${id}'`);
      }
    }

    const supabase = getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');

    // Fetch active products
    const { data, error } = await supabase
      .from('products')
      .select(
        `
        *,
        brand:brands(id, name, slug, logo_url),
        category:categories(id, name, slug),
        variants:product_variants(*),
        inventory:inventory(*),
        product_images:product_images(*)
      `
      )
      .in('id', uniqueIds)
      .eq('is_active', true);

    if (error) {
      throw new InternalServerError(`Failed to query comparison products: ${error.message}`);
    }

    // Sort to preserve original requested order
    const productMap = new Map((data || []).map((row) => [row.id, this.formatComparisonItem(row)]));
    const products: ProductComparisonItem[] = [];

    for (const id of uniqueIds) {
      const item = productMap.get(id);
      if (item) {
        products.push(item);
      }
    }

    if (products.length === 0) {
      throw new NotFoundError('None of the requested products were found or eligible for comparison.');
    }

    // Analyze attribute differences and commonalities
    const checkFields: (keyof ProductComparisonItem)[] = [
      'material',
      'diameter',
      'length',
      'pressureRating',
      'technicalStandard',
      'intendedApplication',
      'unit',
    ];

    const commonAttributes: Record<string, boolean> = {};
    const attributeDifferences: string[] = [];

    if (products.length > 1) {
      for (const field of checkFields) {
        const firstVal = products[0][field];
        const isIdentical = products.every((p) => p[field] === firstVal && p[field] !== null);
        commonAttributes[field] = isIdentical;
        if (!isIdentical) {
          attributeDifferences.push(field);
        }
      }

      // Check price difference
      const firstPrice = products[0].basePrice;
      if (!products.every((p) => p.basePrice === firstPrice)) {
        attributeDifferences.push('basePrice');
      }
    }

    return {
      products,
      commonAttributes,
      attributeDifferences,
    };
  }

  /**
   * Retrieves cross-brand alternatives for a product based on category, specifications, or comparison_group_id.
   */
  static async getAlternatives(
    productId: string,
    filters?: {
      brandId?: string;
      minPrice?: number;
      maxPrice?: number;
      limit?: number;
    }
  ): Promise<ProductAlternativeItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');

    // 1. Retrieve the target product
    const { data: targetData, error: targetError } = await supabase
      .from('products')
      .select('*, brand:brands(id, name, slug), category:categories(id, name, slug), inventory:inventory(*), product_images:product_images(*)')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (targetError || !targetData) {
      throw new NotFoundError('Target product not found or inactive.');
    }

    const targetItem = this.formatComparisonItem(targetData);

    // 2. Query alternative active products (different brand, same category or comparison group)
    let query = supabase
      .from('products')
      .select(
        `
        *,
        brand:brands(id, name, slug, logo_url),
        category:categories(id, name, slug),
        variants:product_variants(*),
        inventory:inventory(*),
        product_images:product_images(*)
      `
      )
      .eq('is_active', true)
      .neq('id', productId);

    // If target has a comparison_group_id, query candidates in that group OR same category
    if (targetData.comparison_group_id) {
      query = query.or(`comparison_group_id.eq.${targetData.comparison_group_id},category_id.eq.${targetData.category_id}`);
    } else {
      query = query.eq('category_id', targetData.category_id);
    }

    // Apply optional brand filter
    if (filters?.brandId) {
      query = query.eq('brand_id', filters.brandId);
    }

    // Apply price range
    if (filters?.minPrice !== undefined) {
      query = query.gte('base_price', filters.minPrice);
    }
    if (filters?.maxPrice !== undefined) {
      query = query.lte('base_price', filters.maxPrice);
    }

    const limit = filters?.limit ?? 6;
    query = query.limit(limit);

    const { data: candidates, error: candidateError } = await query;
    if (candidateError) {
      throw new InternalServerError(`Failed to query alternative products: ${candidateError.message}`);
    }

    const fieldsToCompare: (keyof ProductComparisonItem)[] = [
      'material',
      'diameter',
      'length',
      'pressureRating',
      'technicalStandard',
      'intendedApplication',
    ];

    const results: ProductAlternativeItem[] = (candidates || []).map((candidateRow) => {
      const candidateItem = this.formatComparisonItem(candidateRow);
      const matchingAttributes: string[] = [];
      const differingAttributes: string[] = [];

      for (const field of fieldsToCompare) {
        if (targetItem[field] && candidateItem[field]) {
          if (targetItem[field] === candidateItem[field]) {
            matchingAttributes.push(field);
          } else {
            differingAttributes.push(field);
          }
        }
      }

      return {
        product: candidateItem,
        matchingAttributes,
        differingAttributes,
        priceDifference: candidateItem.basePrice - targetItem.basePrice,
      };
    });

    return results;
  }
}
