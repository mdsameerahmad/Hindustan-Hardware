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

    // Extract size pattern helper (e.g. 1.25", 1-1/4", 25mm, 32mm, 1", 0.75", 1/2", 3/4", etc.)
    const extractSize = (nameOrSpec?: string | null): string => {
      if (!nameOrSpec) return '';
      // Match patterns like 1.25", 1 1/4", 1/2", 25mm, 1", 32mm, etc.
      const match = nameOrSpec.match(/\b(\d+(?:\.\d+)?(?:\s*-\s*\d+\/\d+|\s*\/\s*\d+)?\s*(?:\"|inch|in|mm)?)\b/i);
      return match ? match[1].toLowerCase().replace(/\s+/g, '') : '';
    };

    const targetSize = targetItem.diameter || targetItem.specs?.size || targetItem.specs?.diameter || extractSize(targetItem.name);

    // Extract product core keywords to avoid unrelated products (e.g. "valve", "ball valve", "tee", "elbow", "pipe")
    const cleanKeywords = (name: string): string[] => {
      const stopWords = new Set(['and', 'with', 'for', 'the', 'zoloto', 'astral', 'supreme', 'prince', 'finolex', 'ashirvad', 'watertec', 'full', 'piece', 'in', 'mm']);
      return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));
    };

    const targetKeywords = cleanKeywords(targetItem.name);

    // 2. Query candidates from same category or comparison group
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

    // Filter out same brand to strictly provide cross-brand alternatives
    if (targetData.brand_id) {
      query = query.neq('brand_id', targetData.brand_id);
    }

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

    // Fetch a wider candidate pool to allow accurate size & product relevance ranking
    query = query.limit(40);

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

    const scoredResults = (candidates || []).map((candidateRow) => {
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

      // Check size match between target and candidate
      const candidateSize = candidateItem.diameter || candidateItem.specs?.size || candidateItem.specs?.diameter || extractSize(candidateItem.name);
      const sizeMatched = Boolean(
        targetSize &&
        candidateSize &&
        (targetSize === candidateSize ||
         candidateItem.name.toLowerCase().includes(targetSize) ||
         targetItem.name.toLowerCase().includes(candidateSize))
      );

      if (sizeMatched && !matchingAttributes.includes('diameter')) {
        matchingAttributes.push('size / diameter');
      }

      // Score relevance
      let relevanceScore = 0;

      // Same comparison group
      if (candidateItem.comparisonGroupId && candidateItem.comparisonGroupId === targetItem.comparisonGroupId) {
        relevanceScore += 50;
      }

      // Exact same size match gives huge priority
      if (sizeMatched) {
        relevanceScore += 40;
      }

      // Same material
      if (candidateItem.material && targetItem.material && candidateItem.material.toLowerCase() === targetItem.material.toLowerCase()) {
        relevanceScore += 15;
      }

      // Matching product type keywords in name (e.g. "valve", "elbow", "tee")
      const candidateNameLower = candidateItem.name.toLowerCase();
      for (const kw of targetKeywords) {
        if (candidateNameLower.includes(kw)) {
          relevanceScore += 10;
        }
      }

      return {
        item: {
          product: candidateItem,
          matchingAttributes,
          differingAttributes,
          priceDifference: candidateItem.basePrice - targetItem.basePrice,
        },
        relevanceScore,
        sizeMatched,
      };
    });

    // Sort by highest relevance score first (size match + product type match)
    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const limit = filters?.limit ?? 6;
    return scoredResults.slice(0, limit).map((s) => s.item);
  }
}
