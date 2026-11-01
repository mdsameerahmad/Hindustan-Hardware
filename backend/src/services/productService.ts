import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, ConflictError, BadRequestError } from '../common/errors';
import { Product, PaginatedResult, ProductVariant, Inventory } from '../types';
import { ImageService } from './imageService';

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
   * Parses product row, resolves brand discount or product discount override,
   * and adjusts base_price / compare_at_price accordingly.
   */
  public static parseProductRow(row: any): Product {
    if (!row) return row;

    let brandDiscount: number | null = null;
    let brandCleanDescription: string | null = row.brand?.description || null;
    if (row.brand?.description && typeof row.brand.description === 'string') {
      const match = row.brand.description.match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
      if (match) {
        brandDiscount = Number(match[1]);
        brandCleanDescription = row.brand.description.replace(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]\s*/gi, '').trim() || null;
      }
    }

    // Check product specific discount override stored in specs
    let productDiscount: number | null = null;
    const rawProdDiscount = row.specs?.discount_percentage || row.specs?.discountPercentage;
    if (rawProdDiscount != null && !isNaN(Number(rawProdDiscount))) {
      productDiscount = Number(rawProdDiscount);
    }

    // Product-level discount takes precedence over brand-level discount
    const effectiveDiscount = productDiscount != null ? productDiscount : brandDiscount;

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
            description: brandCleanDescription,
            discount_percentage: brandDiscount,
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
        category:categories(id, name, slug),
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

    // Filter by search keyword (safe text matching against name or description)
    if (search && search.trim() !== '') {
      const sanitized = search.trim().replace(/[%_]/g, '');
      query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
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

    let items = (data || []).map((row) => this.parseProductRow(row));

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
        category:categories(id, name, slug),
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
      .select(`*, brand:brands(id, name, slug, logo_url, description), category:categories(id, name, slug), variants:product_variants(*), inventory:inventory(*), product_images:product_images(*)`)
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
        category:categories(id, name, slug),
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
        category:categories(id, name, slug),
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
}
