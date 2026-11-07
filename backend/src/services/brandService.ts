import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, ConflictError, BadRequestError } from '../common/errors';
import { Brand } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { PRODUCT_STORAGE_BUCKET, ImageService } from './imageService';
import { validateImageMagicBytes } from '../common/middleware/imageUpload';
import { logger } from '../common/utils/logger';
import { compressImageToWebp } from './imageProcessor';

export class BrandService {
  /**
   * Helper to parse and extract discount percentage and clean description
   */
  private static parseBrandRow(row: any): Brand {
    if (!row) return row;
    let discount_percentage: number | null = null;
    let cleanDescription = row.description || null;

    if (row.description && typeof row.description === 'string') {
      const match = row.description.match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
      if (match) {
        discount_percentage = Number(match[1]);
        cleanDescription = row.description.replace(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]\s*/gi, '').trim() || null;
      }
    }

    return {
      ...row,
      logoUrl: row.logo_url || row.logoUrl || null,
      logo_url: row.logo_url || row.logoUrl || null,
      description: cleanDescription,
      discount_percentage,
      discountPercentage: discount_percentage,
      displayOrder: row.display_order ?? row.displayOrder ?? 0,
      isActive: row.is_active ?? row.isActive ?? true,
    };
  }

  /**
   * Get all active brands (for public catalogue).
   */
  static async getActiveBrands(): Promise<Brand[]> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');

    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw new InternalServerError(`Failed to fetch brands: ${error.message}`);
    return (data || []).map(this.parseBrandRow);
  }

  /**
   * Get all brands (admin view).
   */
  static async getAllBrands(): Promise<Brand[]> {
    const adminClient = getSupabaseAdminClient() || getSupabaseClient();
    if (!adminClient) throw new InternalServerError('Database service is unavailable.');

    const { data, error } = await adminClient
      .from('brands')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw new InternalServerError(`Failed to fetch brands: ${error.message}`);
    return (data || []).map(this.parseBrandRow);
  }

  /**
   * Get brand by ID.
   */
  static async getBrandById(id: string, publicOnly = true): Promise<Brand> {
    const client = publicOnly ? getSupabaseClient() : (getSupabaseAdminClient() || getSupabaseClient());
    if (!client) throw new InternalServerError('Database service is unavailable.');

    let query = client.from('brands').select('*').eq('id', id);
    if (publicOnly) query = query.eq('is_active', true);

    const { data, error } = await query.single();
    if (error || !data) throw new NotFoundError('Brand not found');
    return this.parseBrandRow(data);
  }

  /**
   * Get brand by Slug.
   */
  static async getBrandBySlug(slug: string, publicOnly = true): Promise<Brand> {
    const client = publicOnly ? getSupabaseClient() : (getSupabaseAdminClient() || getSupabaseClient());
    if (!client) throw new InternalServerError('Database service is unavailable.');

    let query = client.from('brands').select('*').eq('slug', slug);
    if (publicOnly) query = query.eq('is_active', true);

    const { data, error } = await query.single();
    if (error || !data) throw new NotFoundError('Brand not found');
    return this.parseBrandRow(data);
  }

  /**
   * Create brand (Admin).
   */
  static async createBrand(payload: {
    name: string;
    slug?: string;
    description?: string | null;
    logoUrl?: string | null;
    discountPercentage?: number | null;
    isActive?: boolean;
    displayOrder?: number;
  }): Promise<Brand> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    let finalSlug = payload.slug?.trim();
    if (!finalSlug) {
      finalSlug = payload.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    let storedDescription = payload.description ? payload.description.trim() : null;
    if (payload.discountPercentage != null && payload.discountPercentage > 0) {
      const tag = `[DISCOUNT:${payload.discountPercentage}%]`;
      storedDescription = storedDescription ? `${tag} ${storedDescription}` : tag;
    }

    const { data, error } = await adminClient
      .from('brands')
      .insert({
        name: payload.name,
        slug: finalSlug,
        description: storedDescription,
        logo_url: payload.logoUrl || null,
        is_active: payload.isActive ?? true,
        display_order: payload.displayOrder ?? 0,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictError(`Brand with slug '${payload.slug}' already exists.`);
      throw new InternalServerError(`Failed to create brand: ${error.message}`);
    }

    return this.parseBrandRow(data);
  }

  /**
   * Update brand (Admin).
   */
  static async updateBrand(
    id: string,
    payload: {
      name?: string;
      slug?: string;
      description?: string | null;
      logoUrl?: string | null;
      discountPercentage?: number | null;
      isActive?: boolean;
      displayOrder?: number;
    }
  ): Promise<Brand> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    // Fetch existing brand to preserve or update description cleanly
    const { data: existing } = await adminClient.from('brands').select('description').eq('id', id).single();
    let currentCleanDesc = existing?.description || '';
    currentCleanDesc = currentCleanDesc.replace(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]\s*/gi, '').trim();

    const updateData: Record<string, unknown> = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.slug !== undefined) updateData.slug = payload.slug;

    if (payload.description !== undefined || payload.discountPercentage !== undefined) {
      let baseDesc = payload.description !== undefined ? (payload.description || '').trim() : currentCleanDesc;
      baseDesc = baseDesc.replace(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]\s*/gi, '').trim();

      let discountVal = payload.discountPercentage;
      if (discountVal === undefined) {
        // preserve existing tag if discountPercentage was not part of update payload
        const match = (existing?.description || '').match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
        discountVal = match ? Number(match[1]) : null;
      }

      if (discountVal != null && discountVal > 0) {
        updateData.description = baseDesc ? `[DISCOUNT:${discountVal}%] ${baseDesc}` : `[DISCOUNT:${discountVal}%]`;
      } else {
        updateData.description = baseDesc || null;
      }
    }

    if (payload.logoUrl !== undefined) updateData.logo_url = payload.logoUrl;
    if (payload.isActive !== undefined) updateData.is_active = payload.isActive;
    if (payload.displayOrder !== undefined) updateData.display_order = payload.displayOrder;

    const { data, error } = await adminClient
      .from('brands')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictError(`Brand with slug '${payload.slug}' already exists.`);
      throw new InternalServerError(`Failed to update brand: ${error.message}`);
    }
    if (!data) throw new NotFoundError('Brand not found');

    // If discountPercentage was updated, re-calculate and persist selling price (base_price)
    // for all products of this brand using their stored MRP (compare_at_price)
    if (payload.discountPercentage !== undefined) {
      const newDiscount = payload.discountPercentage != null && payload.discountPercentage > 0
        ? Number(payload.discountPercentage)
        : 0;
      await this.updateBrandProductPrices(id, newDiscount);
    }

    return this.parseBrandRow(data);
  }

  /**
   * Recalculates and updates the selling price (base_price) of all products belonging
   * to a brand based on their MRP (compare_at_price) and the newly configured brand discount percentage.
   */
  public static async updateBrandProductPrices(brandId: string, discountPercentage: number): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) return;

    try {
      // Fetch all products under this brand
      const { data: products, error } = await adminClient
        .from('products')
        .select('id, base_price, compare_at_price, specs')
        .eq('brand_id', brandId);

      if (error || !products || products.length === 0) return;

      const updates = products.map((prod) => {
        // Effective MRP is compare_at_price if available and > 0, otherwise existing base_price
        const mrp = Number(prod.compare_at_price) > 0 ? Number(prod.compare_at_price) : Number(prod.base_price || 0);
        let newSellingPrice = mrp;

        // If product has an individual discount override in specs, respect that; otherwise use brand discount
        const rawOverride = prod.specs?.discount_percentage ?? prod.specs?.discountPercentage;
        const hasOverride = rawOverride != null && !isNaN(Number(rawOverride));
        const effectiveDisc = hasOverride ? Number(rawOverride) : discountPercentage;

        if (effectiveDisc > 0) {
          newSellingPrice = Math.round(mrp * (1 - effectiveDisc / 100) * 100) / 100;
        }

        return adminClient
          .from('products')
          .update({
            base_price: newSellingPrice,
            compare_at_price: mrp,
            updated_at: new Date().toISOString(),
          })
          .eq('id', prod.id);
      });

      // Execute in parallel batches of 25 for fast database throughput
      const batchSize = 25;
      for (let i = 0; i < updates.length; i += batchSize) {
        await Promise.all(updates.slice(i, i + batchSize));
      }

      logger.info('Updated product selling prices for brand', {
        brandId,
        discountPercentage,
        productCount: products.length,
      });
    } catch (err: any) {
      logger.error('Failed to update product selling prices for brand discount change', {
        brandId,
        error: err?.message,
      });
    }
  }

  /**
   * Delete brand (Admin).
   */
  static async deleteBrand(id: string): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    const { error } = await adminClient.from('brands').delete().eq('id', id);
    if (error) throw new InternalServerError(`Failed to delete brand: ${error.message}`);
  }

  /**
   * Upload brand logo to Supabase Storage and link URL to brand record.
   */
  static async uploadBrandLogo(brandId: string, fileBuffer: Buffer): Promise<Brand> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    // 1. Verify brand exists
    const brand = await this.getBrandById(brandId, false);
    if (!brand) throw new NotFoundError('Brand not found.');

    // 2. Validate magic bytes
    const magic = validateImageMagicBytes(fileBuffer);
    if (!magic.isValid) {
      throw new BadRequestError('File content is corrupted or not a valid image format.');
    }

    const compressedImage = await compressImageToWebp(fileBuffer);

    // 3. Upload to storage bucket
    const fileId = uuidv4();
    const storagePath = `brands/${brandId}/logo-${fileId}.webp`;

    const { error: uploadError } = await adminClient.storage
      .from(PRODUCT_STORAGE_BUCKET)
      .upload(storagePath, compressedImage, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (uploadError) {
      logger.error('Failed to upload brand logo to storage', { error: uploadError.message, storagePath });
      throw new InternalServerError(`Failed to upload brand logo: ${uploadError.message}`);
    }

    const publicUrl = ImageService.getPublicUrl(storagePath);

    // 4. Update brand record
    const { data, error: updateError } = await adminClient
      .from('brands')
      .update({ logo_url: publicUrl })
      .eq('id', brandId)
      .select('*')
      .single();

    if (updateError || !data) {
      logger.warn('Failed to update brand record with logo URL, rolling back storage object', { storagePath });
      await adminClient.storage.from(PRODUCT_STORAGE_BUCKET).remove([storagePath]).catch(() => {});
      throw new InternalServerError(`Failed to save brand logo: ${updateError?.message}`);
    }

    return this.parseBrandRow(data);
  }
}
