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
    return data || [];
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
    return data || [];
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
    return data;
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
    return data;
  }

  /**
   * Create category (Admin).
   */
  static async createCategory(payload: {
    name: string;
    slug?: string;
    description?: string | null;
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

    const { data, error } = await adminClient
      .from('categories')
      .insert({
        name: payload.name,
        slug: finalSlug,
        description: payload.description || null,
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

    return data;
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

    const updateData: Record<string, unknown> = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.slug !== undefined) updateData.slug = payload.slug;
    if (payload.description !== undefined) updateData.description = payload.description;
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

    return data;
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
