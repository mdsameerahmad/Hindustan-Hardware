import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, ConflictError, BadRequestError } from '../common/errors';
import { Product, PaginatedResult, ProductVariant, Inventory } from '../types';
import { ImageService } from './imageService';
import { logger } from '../common/utils/logger';
import * as XLSX from 'xlsx';

export interface ProductQueryOptions {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy: 'price' | 'name' | 'createdAt' | 'created_at';
  sortOrder: 'asc' | 'desc';
  featured?: boolean;
  availability: 'in_stock' | 'all';
}

export class ProductService {
  /**
   * Hydrate product images through a single explicit table query for list APIs.
   * Some PostgREST relationship responses omit nested image rows under RLS or
   * schema-cache differences, while the direct public gallery endpoint works.
   */
  private static async attachProductImages(client: any, rows: any[]): Promise<any[]> {
    if (rows.length === 0) return rows;

    const productIds = rows.map((row) => row.id).filter(Boolean);
    const { data: imageRows, error } = await client
      .from('product_images')
      .select('product_id, storage_path, is_primary, display_order, created_at')
      .in('product_id', productIds)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      // Keep nested relationship results as a graceful fallback, but log the
      // failed explicit lookup so missing listing images can be diagnosed.
      logger.warn('Failed to hydrate product images for product list', {
        error: error.message,
        productCount: productIds.length,
      });
      return rows;
    }

    const imagesByProduct = new Map<string, any[]>();
    for (const image of imageRows || []) {
      const productImages = imagesByProduct.get(image.product_id) || [];
      productImages.push(image);
      imagesByProduct.set(image.product_id, productImages);
    }

    return rows.map((row) => ({
      ...row,
      product_images: imagesByProduct.get(row.id) || row.product_images || [],
    }));
  }

  /**
   * Parses product row, resolves brand discount or product discount override,
   * and adjusts base_price / compare_at_price accordingly.
   */
  public static parseProductRow(row: any): Product {
    if (!row) return row;

    let categoryDiscount: number | null = null;
    let categoryCleanDescription: string | null = row.category?.description || null;
    if (row.category?.description && typeof row.category.description === 'string') {
      const match = row.category.description.match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
      if (match) {
        categoryDiscount = Number(match[1]);
        categoryCleanDescription = row.category.description.replace(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]\s*/gi, '').trim() || null;
      }
    }

    // Check product specific discount override stored in specs
    let productDiscount: number | null = null;
    const rawProdDiscount = row.specs?.discount_percentage || row.specs?.discountPercentage;
    if (rawProdDiscount != null && !isNaN(Number(rawProdDiscount))) {
      productDiscount = Number(rawProdDiscount);
    }

    // Product-level discount takes precedence over category-level discount
    const effectiveDiscount = productDiscount != null ? productDiscount : categoryDiscount;

    let storedBasePrice = Number(row.base_price || 0);
    let compareAtPrice = row.compare_at_price ? Number(row.compare_at_price) : null;
    let mrp = compareAtPrice && compareAtPrice > 0 ? compareAtPrice : storedBasePrice;
    let basePrice = storedBasePrice;

    if (effectiveDiscount && effectiveDiscount > 0) {
      if (!compareAtPrice || compareAtPrice <= storedBasePrice) {
        compareAtPrice = mrp;
      }
      basePrice = Math.round(mrp * (1 - effectiveDiscount / 100) * 100) / 100;
    }

    // Resolve genuine product image uploaded by admin
    let resolvedImage: string | null = null;
    let resolvedImages: string[] = [];

    if (Array.isArray(row.product_images) && row.product_images.length > 0) {
      // Sort: primary first, then display_order
      const sorted = [...row.product_images].sort((a: any, b: any) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.display_order ?? 0) - (b.display_order ?? 0);
      });
      resolvedImages = sorted.map((img: any) => ImageService.getPublicUrl(img.storage_path));
      resolvedImage = resolvedImages[0] || null;
    } else if (row.image_url) {
      resolvedImage = row.image_url;
      resolvedImages = [row.image_url];
    } else if (row.specs?.image_url || row.specs?.imageUrl) {
      resolvedImage = (row.specs?.image_url || row.specs?.imageUrl) as string;
      resolvedImages = [resolvedImage];
    }

    return {
      ...row,
      base_price: basePrice,
      compare_at_price: compareAtPrice,
      discount_percentage: effectiveDiscount,
      image_url: resolvedImage,
      product_images: resolvedImages,
      brand: row.brand
        ? {
            ...row.brand,
            description: row.brand.description,
          }
        : null,
      category: row.category
        ? {
            ...row.category,
            description: categoryCleanDescription,
            discount_percentage: categoryDiscount,
          }
        : null,
      inventory: Array.isArray(row.inventory) && row.inventory.length > 0 ? row.inventory[0] : null,
    };
  }
  static async listProducts(options: ProductQueryOptions): Promise<PaginatedResult<Product>> {
    const supabase = getSupabaseClient() || getSupabaseAdminClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');

    const {
      page,
      limit,
      search,
      category,
      brand,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder,
      featured,
      availability,
    } = options;

    const offset = (page - 1) * limit;

    // Build base query on products
    let query = supabase
      .from('products')
      .select(
        `
        *,
        brand:brands(id, name, slug, logo_url, description),
        category:categories(id, name, slug, description),
        variants:product_variants(*),
        inventory:inventory(*),
        product_images:product_images(*)
      `,
        { count: 'exact' }
      )
      .eq('is_active', true);

    // Filter by category (by ID or Slug)
    if (category) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(category);
      if (isUuid) {
        query = query.eq('category_id', category);
      } else {
        // Look up category ID by slug
        const catRes = await supabase.from('categories').select('id').eq('slug', category).single();
        if (catRes.data) {
          query = query.eq('category_id', catRes.data.id);
        } else {
          // No such category slug -> empty result
          return {
            items: [],
            pagination: { page, limit, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          };
        }
      }
    }

    // Filter by brand (by ID or Slug)
    if (brand) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brand);
      if (isUuid) {
        query = query.eq('brand_id', brand);
      } else {
        const brandRes = await supabase.from('brands').select('id').eq('slug', brand).single();
        if (brandRes.data) {
          query = query.eq('brand_id', brandRes.data.id);
        } else {
          return {
            items: [],
            pagination: { page, limit, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          };
        }
      }
    }

    // Filter by price range
    if (minPrice !== undefined) {
      query = query.gte('base_price', minPrice);
    }
    if (maxPrice !== undefined) {
      query = query.lte('base_price', maxPrice);
    }

    // Filter by featured
    if (featured !== undefined) {
      query = query.eq('is_featured', featured);
    }

    // Filter by search keyword (safe text matching against name, SKU / Item Code, and description for long queries)
    if (search && search.trim() !== '') {
      const sanitized = search.trim().replace(/[%_]/g, '');
      // When searching short terms (such as Item Codes or last digits like '70000XYZ' or '4521'),
      // search directly against indexed name and sku to leverage the fast GIN trigram index and avoid table scans.
      if (sanitized.length <= 15) {
        query = query.or(`name.ilike.%${sanitized}%,sku.ilike.%${sanitized}%`);
      } else {
        query = query.or(`name.ilike.%${sanitized}%,sku.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
      }
    }

    // Sorting column mapping
    const sortColumn = sortBy === 'price' ? 'base_price' : sortBy === 'name' ? 'name' : 'created_at';
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      throw new InternalServerError(`Failed to query products: ${error.message}`);
    }

    const rowsWithImages = await this.attachProductImages(supabase, data || []);
    let items = rowsWithImages.map((row) => this.parseProductRow(row));

    // In-stock availability filter if requested
    if (availability === 'in_stock') {
      items = items.filter((item) => (item.inventory?.quantity_available ?? 0) > 0);
    }

    const total = count ?? items.length;
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get featured products.
   */
  static async getFeaturedProducts(limit = 10): Promise<Product[]> {
    return (
      await this.listProducts({
        page: 1,
        limit,
        featured: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        availability: 'all',
      })
    ).items;
  }

  /**
   * Get single product by ID (public or admin).
   */
  static async getProductById(id: string, publicOnly = true): Promise<Product> {
    const client = publicOnly ? getSupabaseClient() : (getSupabaseAdminClient() || getSupabaseClient());
    if (!client) throw new InternalServerError('Database service is unavailable.');

    let query = client
      .from('products')
      .select(
        `
        *,
        brand:brands(id, name, slug, logo_url, description),
        category:categories(id, name, slug, description),
        variants:product_variants(*),
        inventory:inventory(*),
        product_images:product_images(*)
      `
      )
      .eq('id', id);

    if (publicOnly) query = query.eq('is_active', true);

    const { data, error } = await query.single();
    if (error || !data) throw new NotFoundError('Product not found');

    return this.parseProductRow(data);
  }

  /** Get the stored product values for the admin editor without applying storefront discounts. */
  static async getProductForAdmin(id: string): Promise<Record<string, unknown>> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database client is unavailable.');

    const { data, error } = await client
      .from('products')
      .select(`*, brand:brands(id, name, slug, logo_url, description), category:categories(id, name, slug, description), variants:product_variants(*), inventory:inventory(*), product_images:product_images(*)`)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundError('Product not found');
    return {
      ...data,
      inventory: Array.isArray(data.inventory) && data.inventory.length > 0 ? data.inventory[0] : null,
    };
  }

  /**
   * Get single product by Slug (public).
   */
  static async getProductBySlug(slug: string, publicOnly = true): Promise<Product> {
    const client = publicOnly ? getSupabaseClient() : (getSupabaseAdminClient() || getSupabaseClient());
    if (!client) throw new InternalServerError('Database service is unavailable.');

    let query = client
      .from('products')
      .select(
        `
        *,
        brand:brands(id, name, slug, logo_url, description),
        category:categories(id, name, slug, description),
        variants:product_variants(*),
        inventory:inventory(*),
        product_images:product_images(*)
      `
      )
      .eq('slug', slug);

    if (publicOnly) query = query.eq('is_active', true);

    const { data, error } = await query.single();
    if (error || !data) throw new NotFoundError('Product not found');

    return this.parseProductRow(data);
  }

  /**
   * Get related products based on category or brand, excluding the current product.
   */
  static async getRelatedProducts(productId: string, limit = 4): Promise<Product[]> {
    const product = await this.getProductById(productId, true);
    const supabase = getSupabaseClient() || getSupabaseAdminClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');

    const { data, error } = await supabase
      .from('products')
      .select(
        `
        *,
        brand:brands(id, name, slug, logo_url),
        category:categories(id, name, slug, description),
        inventory:inventory(*)
      `
      )
      .eq('is_active', true)
      .eq('category_id', product.category_id)
      .neq('id', productId)
      .limit(limit);

    if (error) throw new InternalServerError(`Failed to fetch related products: ${error.message}`);

    return (data || []).map((row) => ({
      ...row,
      base_price: Number(row.base_price),
      compare_at_price: row.compare_at_price ? Number(row.compare_at_price) : null,
      inventory: Array.isArray(row.inventory) && row.inventory.length > 0 ? row.inventory[0] : null,
    }));
  }

  /**
   * Create product with initial inventory (Admin).
   */
  static async createProduct(payload: {
    name: string;
    slug: string;
    sku?: string | null;
    description?: string;
    brandId?: string | null;
    categoryId: string;
    productType?: string | null;
    basePrice: number;
    compareAtPrice?: number | null;
    unit?: string;
    unitOfSale?: string;
    material?: string | null;
    diameter?: string | null;
    length?: string | null;
    pressureRating?: string | null;
    technicalStandard?: string | null;
    intendedApplication?: string | null;
    comparisonGroupId?: string | null;
    imageUrl?: string | null;
    images?: string[];
    specs?: Record<string, string>;
    discountPercentage?: number | null;
    isFeatured?: boolean;
    isActive?: boolean;
    initialStock?: number;
  }): Promise<Product> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    // Verify category exists
    const cat = await adminClient.from('categories').select('id').eq('id', payload.categoryId).single();
    if (!cat.data) throw new BadRequestError('Referenced category does not exist.');

    // Verify brand exists if provided
    if (payload.brandId) {
      const brand = await adminClient.from('brands').select('id').eq('id', payload.brandId).single();
      if (!brand.data) throw new BadRequestError('Referenced brand does not exist.');
    }

    // If compareAtPrice (MRP) is provided and discountPercentage > 0, auto-calculate selling price (base_price)
    let finalBasePrice = Number(payload.basePrice || 0);
    const finalCompareAt = payload.compareAtPrice != null && Number(payload.compareAtPrice) > 0
      ? Number(payload.compareAtPrice)
      : null;
    const mrp = finalCompareAt || finalBasePrice;
    const discPct = payload.discountPercentage != null ? Number(payload.discountPercentage) : 0;

    if (discPct > 0 && mrp > 0) {
      finalBasePrice = Math.round(mrp * (1 - discPct / 100) * 100) / 100;
    }

    // 1. Insert product
    const { data: product, error: prodError } = await adminClient
      .from('products')
      .insert({
        name: payload.name,
        slug: payload.slug,
        sku: payload.sku || null,
        description: payload.description || '',
        brand_id: payload.brandId || null,
        category_id: payload.categoryId,
        product_type: payload.productType || null,
        base_price: finalBasePrice,
        compare_at_price: finalCompareAt || (discPct > 0 ? mrp : null),
        unit: payload.unit || 'piece',
        unit_of_sale: payload.unitOfSale || 'piece',
        material: payload.material || null,
        diameter: payload.diameter || null,
        length: payload.length || null,
        pressure_rating: payload.pressureRating || null,
        technical_standard: payload.technicalStandard || null,
        intended_application: payload.intendedApplication || null,
        comparison_group_id: payload.comparisonGroupId || null,
        image_url: payload.imageUrl || null,
        images: payload.images || [],
        specs: {
          ...(payload.specs || {}),
          ...(payload.discountPercentage != null ? { discount_percentage: String(payload.discountPercentage) } : {}),
        },
        is_featured: payload.isFeatured ?? false,
        is_active: payload.isActive ?? true,
      })
      .select('*')
      .single();

    if (prodError) {
      if (prodError.code === '23505') {
        throw new ConflictError(`Product with slug '${payload.slug}' or SKU '${payload.sku}' already exists.`);
      }
      throw new InternalServerError(`Failed to create product: ${prodError.message}`);
    }

    // 2. Initialize inventory record
    const initialStock = payload.initialStock ?? 0;
    await adminClient.from('inventory').insert({
      product_id: product.id,
      variant_id: null,
      quantity_available: initialStock,
      quantity_reserved: 0,
    });

    return this.getProductById(product.id, false);
  }

  /**
   * Update product (Admin).
   */
  static async updateProduct(id: string, payload: Partial<Record<string, unknown>>): Promise<Product> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    const updateData: Record<string, unknown> = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.slug !== undefined) updateData.slug = payload.slug;
    if (payload.sku !== undefined) updateData.sku = payload.sku;
    if (payload.description !== undefined) updateData.description = payload.description;
    if (payload.brandId !== undefined) updateData.brand_id = payload.brandId;
    if (payload.categoryId !== undefined) updateData.category_id = payload.categoryId;
    if (payload.productType !== undefined) updateData.product_type = payload.productType;
    if (payload.basePrice !== undefined) updateData.base_price = payload.basePrice;
    if (payload.compareAtPrice !== undefined) updateData.compare_at_price = payload.compareAtPrice;
    if (payload.unit !== undefined) updateData.unit = payload.unit;
    if (payload.unitOfSale !== undefined) updateData.unit_of_sale = payload.unitOfSale;
    if (payload.material !== undefined) updateData.material = payload.material;
    if (payload.diameter !== undefined) updateData.diameter = payload.diameter;
    if (payload.length !== undefined) updateData.length = payload.length;
    if (payload.pressureRating !== undefined) updateData.pressure_rating = payload.pressureRating;
    if (payload.technicalStandard !== undefined) updateData.technical_standard = payload.technicalStandard;
    if (payload.intendedApplication !== undefined) updateData.intended_application = payload.intendedApplication;
    if (payload.comparisonGroupId !== undefined) updateData.comparison_group_id = payload.comparisonGroupId;
    if (payload.imageUrl !== undefined) updateData.image_url = payload.imageUrl;
    if (payload.images !== undefined) updateData.images = payload.images;

    // If discountPercentage or compareAtPrice is provided, recalculate and persist selling price (base_price)
    if (payload.discountPercentage !== undefined || payload.compareAtPrice !== undefined) {
      const { data: currentProd } = await adminClient.from('products').select('base_price, compare_at_price, brand_id, specs').eq('id', id).single();
      const currentCompareAt = currentProd?.compare_at_price ? Number(currentProd.compare_at_price) : null;
      const currentBasePrice = Number(currentProd?.base_price || 0);

      const effectiveCompareAt = payload.compareAtPrice !== undefined
        ? (payload.compareAtPrice != null && Number(payload.compareAtPrice) > 0 ? Number(payload.compareAtPrice) : null)
        : currentCompareAt;

      const mrp = effectiveCompareAt || (payload.basePrice !== undefined ? Number(payload.basePrice) : currentBasePrice);

      let effectiveDisc = 0;
      if (payload.discountPercentage !== undefined) {
        effectiveDisc = payload.discountPercentage != null && Number(payload.discountPercentage) > 0
          ? Number(payload.discountPercentage)
          : 0;
      } else {
        // Check if existing product had discount in specs
        const rawExistingDisc = currentProd?.specs?.discount_percentage ?? currentProd?.specs?.discountPercentage;
        if (rawExistingDisc != null && !isNaN(Number(rawExistingDisc))) {
          effectiveDisc = Number(rawExistingDisc);
        }
      }

      if (effectiveDisc > 0 && mrp > 0) {
        updateData.base_price = Math.round(mrp * (1 - effectiveDisc / 100) * 100) / 100;
        updateData.compare_at_price = mrp;
      } else if (payload.discountPercentage !== undefined && effectiveDisc === 0 && effectiveCompareAt) {
        // If discount explicitly cleared to 0, selling price equals MRP unless basePrice was explicitly provided
        if (payload.basePrice === undefined) {
          updateData.base_price = effectiveCompareAt;
        }
      }
    }

    // Merge discountPercentage into specs if provided
    if (payload.specs !== undefined || payload.discountPercentage !== undefined) {
      const { data: existingProd } = await adminClient.from('products').select('specs').eq('id', id).single();
      const currentSpecs = (existingProd?.specs as Record<string, string>) || {};
      const newSpecs: Record<string, string> = {
        ...currentSpecs,
        ...((payload.specs as Record<string, string>) || {}),
      };
      if (payload.discountPercentage !== undefined) {
        if (payload.discountPercentage != null && Number(payload.discountPercentage) > 0) {
          newSpecs.discount_percentage = String(payload.discountPercentage);
        } else {
          delete newSpecs.discount_percentage;
          delete newSpecs.discountPercentage;
        }
      }
      updateData.specs = newSpecs;
    }

    if (payload.isFeatured !== undefined) updateData.is_featured = payload.isFeatured;
    if (payload.isActive !== undefined) updateData.is_active = payload.isActive;

    const { error } = await adminClient.from('products').update(updateData).eq('id', id);
    if (error) {
      if (error.code === '23505') throw new ConflictError('A product with this slug or SKU already exists.');
      throw new InternalServerError(`Failed to update product: ${error.message}`);
    }

    return this.getProductById(id, false);
  }

  /**
   * Delete product (Admin) or soft deactivate.
   */
  static async deleteProduct(id: string): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    const { error } = await adminClient.from('products').delete().eq('id', id);
    if (error) throw new InternalServerError(`Failed to delete product: ${error.message}`);
  }

  // ----------------- Variant Management -----------------
  static async createVariant(
    productId: string,
    payload: {
      name: string;
      sku?: string | null;
      priceOverride?: number | null;
      variantAttributes?: Record<string, string>;
      isActive?: boolean;
      initialStock?: number;
    }
  ): Promise<ProductVariant> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    const { data: variant, error } = await adminClient
      .from('product_variants')
      .insert({
        product_id: productId,
        name: payload.name,
        sku: payload.sku || null,
        price_override: payload.priceOverride ?? null,
        variant_attributes: payload.variantAttributes || {},
        is_active: payload.isActive ?? true,
      })
      .select('*')
      .single();

    if (error) throw new InternalServerError(`Failed to create variant: ${error.message}`);

    await adminClient.from('inventory').insert({
      product_id: productId,
      variant_id: variant.id,
      quantity_available: payload.initialStock ?? 0,
      quantity_reserved: 0,
    });

    return variant;
  }

  // ----------------- Inventory Management -----------------
  static async updateInventory(
    productId: string,
    variantId: string | null,
    payload: { quantityAvailable?: number; quantityReserved?: number }
  ): Promise<Inventory> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    let query = adminClient.from('inventory').update(payload).eq('product_id', productId);
    if (variantId) {
      query = query.eq('variant_id', variantId);
    } else {
      query = query.is('variant_id', null);
    }

    const { data, error } = await query.select('*').single();
    if (error || !data) throw new InternalServerError(`Failed to update inventory: ${error?.message}`);

    return data;
  }

  // ----------------- Bulk Price Update from Excel / CSV -----------------
  static async bulkUpdatePricesFromBuffer(fileBuffer: Buffer): Promise<{
    totalProcessed: number;
    updatedCount: number;
    failedCount: number;
    errors: { itemCode: string; reason: string }[];
    details: {
      itemCode: string;
      name: string;
      oldMrp: number | null;
      newMrp: number;
      oldDiscount: number;
      newDiscount: number;
      oldPrice: number;
      newPrice: number;
    }[];
  }> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    } catch (err: any) {
      throw new BadRequestError(`Failed to parse Excel file: ${err.message || 'Corrupt format'}`);
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestError('Excel workbook contains no sheets.');
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[firstSheetName]);
    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestError('Uploaded sheet is empty or contains no readable rows.');
    }

    const errors: { itemCode: string; reason: string }[] = [];
    const details: any[] = [];
    let updatedCount = 0;

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];

      // Normalize row keys (lowercase and stripped of symbols like ₹, %, parens, spaces, underscores)
      const normalizedRow: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedRow[cleanKey] = v;
      }

      // Match item code from common variants: itemcode, item, sku, code, productcode
      const rawCode =
        normalizedRow['itemcode'] ??
        normalizedRow['sku'] ??
        normalizedRow['item'] ??
        normalizedRow['code'] ??
        normalizedRow['productcode'] ??
        row['Item Code'] ??
        row['ItemCode'] ??
        row['SKU'];

      if (!rawCode) {
        errors.push({
          itemCode: `Row #${index + 2}`,
          reason: 'Missing ItemCode or SKU column value',
        });
        continue;
      }

      const itemCode = String(rawCode).trim();
      if (!itemCode) {
        errors.push({
          itemCode: `Row #${index + 2}`,
          reason: 'Empty ItemCode',
        });
        continue;
      }

      // Match MRP: mrp, mrpr, mrpinr, listprice, price, compareatprice, originalprice
      const rawMrp =
        normalizedRow['mrp'] ??
        normalizedRow['mrpr'] ??
        normalizedRow['mrpinr'] ??
        normalizedRow['listprice'] ??
        normalizedRow['compareatprice'] ??
        normalizedRow['originalprice'] ??
        normalizedRow['price'] ??
        row['MRP (₹)'] ??
        row['MRP(₹)'] ??
        row['MRP (Rs)'] ??
        row['MRP'] ??
        row['mrp'];

      // Match Discount: discount, discountpercentage, disc, discountpercent
      const rawDiscount =
        normalizedRow['discount'] ??
        normalizedRow['discountpercentage'] ??
        normalizedRow['discountpercent'] ??
        normalizedRow['disc'] ??
        row['Discount (%)'] ??
        row['Discount(%)'] ??
        row['Discount %'] ??
        row['Discount%'] ??
        row['Discount'];

      if (rawMrp == null || rawMrp === '') {
        errors.push({
          itemCode,
          reason: 'Missing MRP value',
        });
        continue;
      }

      const parsedMrp = Number(String(rawMrp).replace(/[^0-9.]/g, ''));
      if (isNaN(parsedMrp) || parsedMrp < 0) {
        errors.push({
          itemCode,
          reason: `Invalid MRP value: ${rawMrp}`,
        });
        continue;
      }

      let parsedDiscount = 0;
      if (rawDiscount != null && rawDiscount !== '') {
        const cleanDisc = Number(String(rawDiscount).replace(/[^0-9.]/g, ''));
        if (!isNaN(cleanDisc) && cleanDisc >= 0 && cleanDisc <= 100) {
          parsedDiscount = cleanDisc;
        } else if (!isNaN(cleanDisc) && cleanDisc > 100) {
          errors.push({
            itemCode,
            reason: `Discount percentage cannot exceed 100%: ${rawDiscount}`,
          });
          continue;
        }
      }

      // Find product by SKU / ItemCode (case-insensitive)
      const { data: matchedProducts, error: findError } = await adminClient
        .from('products')
        .select('id, name, sku, base_price, compare_at_price, specs')
        .ilike('sku', itemCode)
        .limit(1);

      if (findError) {
        errors.push({
          itemCode,
          reason: `Database error querying item: ${findError.message}`,
        });
        continue;
      }

      if (!matchedProducts || matchedProducts.length === 0) {
        errors.push({
          itemCode,
          reason: 'Product not found with this Item Code / SKU',
        });
        continue;
      }

      const prod = matchedProducts[0];
      const oldPrice = Number(prod.base_price || 0);
      const oldMrp = prod.compare_at_price ? Number(prod.compare_at_price) : null;
      const oldDiscount = prod.specs?.discount_percentage
        ? Number(prod.specs.discount_percentage)
        : (oldMrp && oldMrp > oldPrice ? Math.round(((oldMrp - oldPrice) / oldMrp) * 100) : 0);

      // Calculate new selling price
      const calculatedSellingPrice = parsedDiscount > 0
        ? Math.round(parsedMrp * (1 - parsedDiscount / 100) * 100) / 100
        : parsedMrp;

      // Update specs
      const updatedSpecs: Record<string, any> = {
        ...(prod.specs || {}),
      };
      if (parsedDiscount > 0) {
        updatedSpecs.discount_percentage = String(parsedDiscount);
      } else {
        delete updatedSpecs.discount_percentage;
        delete updatedSpecs.discountPercentage;
      }

      const { error: updateError } = await adminClient
        .from('products')
        .update({
          compare_at_price: parsedMrp,
          base_price: calculatedSellingPrice,
          specs: updatedSpecs,
        })
        .eq('id', prod.id);

      if (updateError) {
        errors.push({
          itemCode,
          reason: `Failed to update product: ${updateError.message}`,
        });
      } else {
        updatedCount++;
        details.push({
          itemCode,
          name: prod.name,
          oldMrp,
          newMrp: parsedMrp,
          oldDiscount,
          newDiscount: parsedDiscount,
          oldPrice,
          newPrice: calculatedSellingPrice,
        });
      }
    }

    return {
      totalProcessed: rawRows.length,
      updatedCount,
      failedCount: errors.length,
      errors,
      details,
    };
  }

  /**
   * Bulk update discount percentage for all products matching Category (Item Type) and/or Brand.
   */
  static async bulkUpdateDiscountByCriteria(criteria: {
    categoryId?: string | null;
    brandId?: string | null;
    discountPercentage: number;
  }): Promise<{ updatedCount: number; message: string }> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    const { categoryId, brandId, discountPercentage } = criteria;
    if (!categoryId && !brandId) {
      throw new BadRequestError('Either category (Item Type) or brand must be specified.');
    }
    if (discountPercentage < 0 || discountPercentage > 100) {
      throw new BadRequestError('Discount percentage must be between 0 and 100.');
    }

    let query = adminClient
      .from('products')
      .select('id, name, sku, base_price, compare_at_price, specs');

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }
    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    const { data: products, error: fetchError } = await query;
    if (fetchError) {
      throw new InternalServerError(`Failed to fetch products for discount update: ${fetchError.message}`);
    }

    if (!products || products.length === 0) {
      return { updatedCount: 0, message: 'No products matched the given criteria.' };
    }

    let updatedCount = 0;
    for (const prod of products) {
      const mrp = prod.compare_at_price != null && Number(prod.compare_at_price) > 0
        ? Number(prod.compare_at_price)
        : Number(prod.base_price || 0);

      const calculatedSellingPrice = discountPercentage > 0
        ? Math.round(mrp * (1 - discountPercentage / 100) * 100) / 100
        : mrp;

      const updatedSpecs: Record<string, any> = {
        ...(prod.specs || {}),
      };

      if (discountPercentage > 0) {
        updatedSpecs.discount_percentage = String(discountPercentage);
      } else {
        delete updatedSpecs.discount_percentage;
        delete updatedSpecs.discountPercentage;
      }

      const { error: updateError } = await adminClient
        .from('products')
        .update({
          compare_at_price: mrp,
          base_price: calculatedSellingPrice,
          specs: updatedSpecs,
        })
        .eq('id', prod.id);

      if (!updateError) {
        updatedCount++;
      }
    }

    return {
      updatedCount,
      message: `Successfully applied ${discountPercentage}% discount to ${updatedCount} product(s).`,
    };
  }

  /**
   * Get discount summary by Item Type (Category) and Brand.
   */
  static async getDiscountsSummary(): Promise<{
    pairs: {
      categoryId: string;
      categoryName: string;
      brandId: string;
      brandName: string;
      productCount: number;
      averageDiscount: number;
      minDiscount: number;
      maxDiscount: number;
      commonDiscount: number;
    }[];
    categories: {
      id: string;
      name: string;
      productCount: number;
      averageDiscount: number;
    }[];
  }> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    // Fetch all products with their category and brand info
    const { data: products, error } = await adminClient
      .from('products')
      .select('id, category_id, brand_id, compare_at_price, base_price, specs, category:categories(id, name), brand:brands(id, name)');

    if (error) {
      throw new InternalServerError(`Failed to fetch discount summary: ${error.message}`);
    }

    const pairMap: Record<string, {
      categoryId: string;
      categoryName: string;
      brandId: string;
      brandName: string;
      discounts: number[];
      discountCounts: Record<number, number>;
    }> = {};

    const categoryMap: Record<string, {
      id: string;
      name: string;
      discounts: number[];
    }> = {};

    for (const prod of (products || []) as any[]) {
      const catObj = Array.isArray(prod.category) ? prod.category[0] : prod.category;
      const brandObj = Array.isArray(prod.brand) ? prod.brand[0] : prod.brand;
      const catId = catObj?.id || prod.category_id;
      const catName = catObj?.name || 'Uncategorized';
      const brandId = brandObj?.id || prod.brand_id;
      const brandName = brandObj?.name || 'Unbranded';

      if (!catId || !brandId) continue;

      let discount = 0;
      if (prod.specs?.discount_percentage != null) {
        discount = Number(prod.specs.discount_percentage);
      } else if (prod.compare_at_price && Number(prod.compare_at_price) > Number(prod.base_price || 0)) {
        const mrp = Number(prod.compare_at_price);
        const base = Number(prod.base_price);
        discount = Math.round(((mrp - base) / mrp) * 100);
      }

      if (isNaN(discount) || discount < 0) discount = 0;

      // Group by Category + Brand pair
      const pairKey = `${catId}_${brandId}`;
      if (!pairMap[pairKey]) {
        pairMap[pairKey] = {
          categoryId: catId,
          categoryName: catName,
          brandId,
          brandName,
          discounts: [],
          discountCounts: {},
        };
      }
      pairMap[pairKey].discounts.push(discount);
      pairMap[pairKey].discountCounts[discount] = (pairMap[pairKey].discountCounts[discount] || 0) + 1;

      // Group by Category
      if (!categoryMap[catId]) {
        categoryMap[catId] = {
          id: catId,
          name: catName,
          discounts: [],
        };
      }
      categoryMap[catId].discounts.push(discount);
    }

    const pairs = Object.values(pairMap).map((item) => {
      const count = item.discounts.length;
      const sum = item.discounts.reduce((a, b) => a + b, 0);
      const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
      const min = count > 0 ? Math.min(...item.discounts) : 0;
      const max = count > 0 ? Math.max(...item.discounts) : 0;

      // Find the most frequent (mode) discount
      let mostCommonDiscount = 0;
      let highestFreq = 0;
      for (const [d, freq] of Object.entries(item.discountCounts)) {
        if (freq > highestFreq) {
          highestFreq = freq;
          mostCommonDiscount = Number(d);
        }
      }

      return {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        brandId: item.brandId,
        brandName: item.brandName,
        productCount: count,
        averageDiscount: avg,
        minDiscount: min,
        maxDiscount: max,
        commonDiscount: mostCommonDiscount,
      };
    }).sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.brandName.localeCompare(b.brandName));

    const categories = Object.values(categoryMap).map((cat) => {
      const count = cat.discounts.length;
      const sum = cat.discounts.reduce((a, b) => a + b, 0);
      const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
      return {
        id: cat.id,
        name: cat.name,
        productCount: count,
        averageDiscount: avg,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return { pairs, categories };
  }
}
