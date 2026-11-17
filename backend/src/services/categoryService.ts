import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, ConflictError, BadRequestError } from '../common/errors';
import { Category } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { PRODUCT_STORAGE_BUCKET, ImageService } from './imageService';
import { validateImageMagicBytes } from '../common/middleware/imageUpload';
import { logger } from '../common/utils/logger';
import { compressImageToWebp } from './imageProcessor';

export class CategoryService {
  /**
   * Helper to parse and extract discount percentage and clean description
   */
  private static parseCategoryRow(row: any): Category {
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
      description: cleanDescription,
      discount_percentage,
      discountPercentage: discount_percentage,
      imageUrl: row.image_url || row.imageUrl || null,
      image_url: row.image_url || row.imageUrl || null,
      parentId: row.parent_id || row.parentId || null,
      parent_id: row.parent_id || row.parentId || null,
      sortOrder: row.sort_order ?? row.sortOrder ?? 0,
      sort_order: row.sort_order ?? row.sortOrder ?? 0,
      isActive: row.is_active ?? row.isActive ?? true,
      is_active: row.is_active ?? row.isActive ?? true,
    };
  }

  /**
   * Get all active categories (for public catalogue).
   */
  static async getActiveCategories(): Promise<Category[]> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw new InternalServerError(`Failed to fetch categories: ${error.message}`);
    return (data || []).map(this.parseCategoryRow);
  }

  /**
   * Get all categories (admin view, includes inactive).
   */
  static async getAllCategories(): Promise<Category[]> {
    const adminClient = getSupabaseAdminClient() || getSupabaseClient();
    if (!adminClient) throw new InternalServerError('Database service is unavailable.');

    const { data, error } = await adminClient
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw new InternalServerError(`Failed to fetch categories: ${error.message}`);
    return (data || []).map(this.parseCategoryRow);
  }

  /**
   * Get category by ID.
   */
  static async getCategoryById(id: string, publicOnly = true): Promise<Category> {
    const client = publicOnly ? getSupabaseClient() : (getSupabaseAdminClient() || getSupabaseClient());
    if (!client) throw new InternalServerError('Database service is unavailable.');

    let query = client.from('categories').select('*').eq('id', id);
    if (publicOnly) query = query.eq('is_active', true);

    const { data, error } = await query.single();
    if (error || !data) throw new NotFoundError('Category not found');
    return this.parseCategoryRow(data);
  }

  /**
   * Get category by Slug.
   */
  static async getCategoryBySlug(slug: string, publicOnly = true): Promise<Category> {
    const client = publicOnly ? getSupabaseClient() : (getSupabaseAdminClient() || getSupabaseClient());
    if (!client) throw new InternalServerError('Database service is unavailable.');

    let query = client.from('categories').select('*').eq('slug', slug);
    if (publicOnly) query = query.eq('is_active', true);

    const { data, error } = await query.single();
    if (error || !data) throw new NotFoundError('Category not found');
    return this.parseCategoryRow(data);
  }

  /**
   * Create category (Admin).
   */
  static async createCategory(payload: {
    name: string;
    slug?: string;
    description?: string | null;
    discountPercentage?: number | null;
    parentId?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<Category> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    if (payload.parentId) {
      const parent = await adminClient.from('categories').select('id').eq('id', payload.parentId).single();
      if (!parent.data) throw new BadRequestError('Referenced parent category does not exist.');
    }

    let finalSlug = payload.slug?.trim()
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
      .from('categories')
      .insert({
        name: payload.name,
        slug: finalSlug,
        description: storedDescription,
        parent_id: payload.parentId || null,
        is_active: payload.isActive ?? true,
        sort_order: payload.sortOrder ?? 0,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictError(`Category with slug '${payload.slug}' already exists.`);
      throw new InternalServerError(`Failed to create category: ${error.message}`);
    }

    return this.parseCategoryRow(data);
  }

  /**
   * Update category (Admin).
   */
  static async updateCategory(
    id: string,
    payload: {
      name?: string;
      slug?: string;
      description?: string | null;
      discountPercentage?: number | null;
      parentId?: string | null;
      isActive?: boolean;
      sortOrder?: number;
    }
  ): Promise<Category> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    if (payload.parentId && payload.parentId === id) {
      throw new BadRequestError('A category cannot be its own parent.');
    }

    // Fetch existing category to preserve or update description cleanly
    const { data: existing } = await adminClient.from('categories').select('description').eq('id', id).single();
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
        const match = (existing?.description || '').match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
        discountVal = match ? Number(match[1]) : null;
      }

      if (discountVal != null && discountVal > 0) {
        updateData.description = baseDesc ? `[DISCOUNT:${discountVal}%] ${baseDesc}` : `[DISCOUNT:${discountVal}%]`;
      } else {
        updateData.description = baseDesc || null;
      }
    }

    if (payload.parentId !== undefined) updateData.parent_id = payload.parentId;
    if (payload.isActive !== undefined) updateData.is_active = payload.isActive;
    if (payload.sortOrder !== undefined) updateData.sort_order = payload.sortOrder;

    const { data, error } = await adminClient
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictError(`Category with slug '${payload.slug}' already exists.`);
      throw new InternalServerError(`Failed to update category: ${error.message}`);
    }
    if (!data) throw new NotFoundError('Category not found');

    // If discountPercentage was updated, re-calculate and persist selling price (base_price)
    // for all products of this category using their stored MRP (compare_at_price)
    if (payload.discountPercentage !== undefined) {
      const newDiscount = payload.discountPercentage != null && payload.discountPercentage > 0
        ? Number(payload.discountPercentage)
        : 0;
      await this.updateCategoryProductPrices(id, newDiscount);
    }

    return this.parseCategoryRow(data);
  }

  /**
   * Recalculates and updates the selling price (base_price) of all products belonging
   * to a category based on their MRP (compare_at_price) and the newly configured category discount percentage.
   */
  public static async updateCategoryProductPrices(categoryId: string, discountPercentage: number): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) return;

    try {
      const { data: products, error } = await adminClient
        .from('products')
        .select('id, base_price, compare_at_price, specs')
        .eq('category_id', categoryId);

      if (error || !products || products.length === 0) return;

      const updates = products.map((prod) => {
        const mrp = Number(prod.compare_at_price) > 0 ? Number(prod.compare_at_price) : Number(prod.base_price || 0);
        let newSellingPrice = mrp;

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

      const batchSize = 25;
      for (let i = 0; i < updates.length; i += batchSize) {
        await Promise.all(updates.slice(i, i + batchSize));
      }

      logger.info('Updated product selling prices for category', {
        categoryId,
        discountPercentage,
        productCount: products.length,
      });
    } catch (err: any) {
      logger.error('Failed to update product selling prices for category discount change', {
        categoryId,
        error: err?.message,
      });
    }
  }

  /**
   * Upload a category image to Supabase Storage and link it to the category.
   */
  static async uploadCategoryImage(categoryId: string, fileBuffer: Buffer): Promise<Category> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    const { data: category, error: categoryError } = await adminClient
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .single();
    if (categoryError || !category) throw new NotFoundError('Category not found.');

    const magic = validateImageMagicBytes(fileBuffer);
    if (!magic.isValid) {
      throw new BadRequestError('File content is corrupted or not a valid image format.');
    }

    const compressedImage = await compressImageToWebp(fileBuffer);
    const storagePath = `categories/${categoryId}/category-${uuidv4()}.webp`;
    const { error: uploadError } = await adminClient.storage
      .from(PRODUCT_STORAGE_BUCKET)
      .upload(storagePath, compressedImage, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (uploadError) {
      logger.error('Failed to upload category image to storage', { error: uploadError.message, storagePath });
      throw new InternalServerError(`Failed to upload category image: ${uploadError.message}`);
    }

    const publicUrl = ImageService.getPublicUrl(storagePath);
    const { data, error: updateError } = await adminClient
      .from('categories')
      .update({ image_url: publicUrl })
      .eq('id', categoryId)
      .select('*')
      .single();

    if (updateError || !data) {
      logger.warn('Failed to update category record with image URL, rolling back storage object', { storagePath });
      await adminClient.storage.from(PRODUCT_STORAGE_BUCKET).remove([storagePath]).catch(() => {});
      throw new InternalServerError(`Failed to save category image: ${updateError?.message || 'Category update returned no data.'}`);
    }

    return data;
  }

  /**
   * Delete category (Admin).
   */
  static async deleteCategory(id: string): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative database client is unavailable.');

    // Check if category is used by products
    const productsCount = await adminClient.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);
    if ((productsCount.count || 0) > 0) {
      throw new BadRequestError('Cannot delete category: existing products reference this category. Deactivate it instead.');
    }

    // Set parent_id of child categories to null before deletion
    await adminClient.from('categories').update({ parent_id: null }).eq('parent_id', id);

    const { error } = await adminClient.from('categories').delete().eq('id', id);
    if (error) throw new InternalServerError(`Failed to delete category: ${error.message}`);
  }
}
