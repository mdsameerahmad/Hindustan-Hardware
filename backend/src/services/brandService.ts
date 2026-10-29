import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, ConflictError, BadRequestError } from '../common/errors';
import { Brand } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { PRODUCT_STORAGE_BUCKET, ImageService } from './imageService';
import { validateImageMagicBytes } from '../common/middleware/imageUpload';
import { logger } from '../common/utils/logger';

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

    return this.parseBrandRow(data);
  }

  /**
   * Delete brand (Admin).
   */
  static async deleteBrand(id: string): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    const productsCount = await adminClient.from('products').select('id', { count: 'exact', head: true }).eq('brand_id', id);
    if ((productsCount.count || 0) > 0) {
      throw new BadRequestError('Cannot delete brand: existing products reference this brand. Deactivate it instead.');
    }

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

    // 3. Upload to storage bucket
    const fileId = uuidv4();
    const storagePath = `brands/${brandId}/logo-${fileId}.${magic.extension}`;

    const { error: uploadError } = await adminClient.storage
      .from(PRODUCT_STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: magic.mimeType,
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

