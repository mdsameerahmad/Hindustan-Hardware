import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, BadRequestError } from '../common/errors';
import { validateImageMagicBytes } from '../common/middleware/imageUpload';
import { ProductImage } from '../types';
import { logger } from '../common/utils/logger';

export const PRODUCT_STORAGE_BUCKET = 'product-images';

export class ImageService {
  /**
   * Helper to derive public URL from Supabase storage path
   */
  static getPublicUrl(storagePath: string): string {
    const supabase = getSupabaseClient();
    if (!supabase || !supabase.storage) return `https://mock.supabase.co/storage/v1/object/public/product-images/${storagePath}`;
    const { data } = supabase.storage.from(PRODUCT_STORAGE_BUCKET).getPublicUrl(storagePath);
    return data?.publicUrl || storagePath;
  }


  /**
   * List images for a product in deterministic display order.
   */
  static async getProductImages(productId: string): Promise<ProductImage[]> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');

    const { data, error } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new InternalServerError(`Failed to fetch product images: ${error.message}`);

    return (data || []).map((img) => ({
      ...img,
      public_url: this.getPublicUrl(img.storage_path),
    }));
  }

  /**
   * Upload image to Supabase Storage and register in product_images.
   * If metadata insertion fails, cleanly removes the uploaded storage object.
   */
  static async uploadProductImage(
    productId: string,
    fileBuffer: Buffer,
    options: {
      altText?: string | null;
      displayOrder?: number;
      isPrimary?: boolean;
      variantId?: string | null;
    }
  ): Promise<ProductImage> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative client is unavailable.');

    // 1. Verify product exists
    const prodCheck = await adminClient.from('products').select('id').eq('id', productId).single();
    if (!prodCheck.data) throw new NotFoundError('Product not found.');

    // 2. Validate variant if provided
    if (options.variantId) {
      const varCheck = await adminClient
        .from('product_variants')
        .select('id, product_id')
        .eq('id', options.variantId)
        .eq('product_id', productId)
        .single();
      if (!varCheck.data) {
        throw new BadRequestError('Variant does not belong to the specified product.');
      }
    }

    // 3. Validate image magic bytes
    const magic = validateImageMagicBytes(fileBuffer);
    if (!magic.isValid) {
      throw new BadRequestError('File content is corrupted or does not match a valid JPEG, PNG, or WebP image.');
    }

    // 4. Generate stable, secure storage path
    const imageId = uuidv4();
    const storagePath = `products/${productId}/${imageId}.${magic.extension}`;

    // 5. Upload to Supabase Storage
    const { error: uploadError } = await adminClient.storage
      .from(PRODUCT_STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: magic.mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error('Failed to upload image to Supabase Storage', { error: uploadError.message, storagePath });
      throw new InternalServerError(`Storage upload failed: ${uploadError.message}`);
    }

    // 6. Handle primary image assignment
    // If this is set to primary, clear existing primary image on this product
    if (options.isPrimary) {
      await adminClient.from('product_images').update({ is_primary: false }).eq('product_id', productId);
    } else {
      // If there are no images yet, automatically make this first image primary
      const existingImages = await adminClient
        .from('product_images')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId);
      if ((existingImages.count || 0) === 0) {
        options.isPrimary = true;
      }
    }

    // 7. Insert metadata into database
    const { data: imageRecord, error: dbError } = await adminClient
      .from('product_images')
      .insert({
        id: imageId,
        product_id: productId,
        variant_id: options.variantId || null,
        storage_path: storagePath,
        alt_text: options.altText || null,
        display_order: options.displayOrder ?? 0,
        is_primary: options.isPrimary ?? false,
      })
      .select('*')
      .single();

    // 8. Rollback orphaned storage file if database insert fails
    if (dbError || !imageRecord) {
      logger.warn('Database insert failed after storage upload, rolling back storage object', { storagePath });
      await adminClient.storage.from(PRODUCT_STORAGE_BUCKET).remove([storagePath]).catch((cleanupErr) => {
        logger.error('Failed to cleanup orphaned storage file', { error: cleanupErr.message });
      });
      throw new InternalServerError(`Failed to save image metadata: ${dbError?.message}`);
    }

    return {
      ...imageRecord,
      public_url: this.getPublicUrl(imageRecord.storage_path),
    };
  }

  /**
   * Update image metadata (altText, displayOrder, variantId).
   */
  static async updateImageMetadata(
    productId: string,
    imageId: string,
    payload: {
      altText?: string | null;
      displayOrder?: number;
      variantId?: string | null;
    }
  ): Promise<ProductImage> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative client is unavailable.');

    // Verify image belongs to product
    const imgCheck = await adminClient
      .from('product_images')
      .select('*')
      .eq('id', imageId)
      .eq('product_id', productId)
      .single();
    if (!imgCheck.data) throw new NotFoundError('Image not found for this product.');

    if (payload.variantId) {
      const varCheck = await adminClient
        .from('product_variants')
        .select('id')
        .eq('id', payload.variantId)
        .eq('product_id', productId)
        .single();
      if (!varCheck.data) throw new BadRequestError('Variant does not belong to this product.');
    }

    const updateData: Record<string, unknown> = {};
    if (payload.altText !== undefined) updateData.alt_text = payload.altText;
    if (payload.displayOrder !== undefined) updateData.display_order = payload.displayOrder;
    if (payload.variantId !== undefined) updateData.variant_id = payload.variantId;

    const { data, error } = await adminClient
      .from('product_images')
      .update(updateData)
      .eq('id', imageId)
      .select('*')
      .single();

    if (error || !data) throw new InternalServerError(`Failed to update image metadata: ${error?.message}`);

    return {
      ...data,
      public_url: this.getPublicUrl(data.storage_path),
    };
  }

  /**
   * Set image as primary.
   */
  static async setPrimaryImage(productId: string, imageId: string): Promise<ProductImage> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative client is unavailable.');

    const imgCheck = await adminClient
      .from('product_images')
      .select('id')
      .eq('id', imageId)
      .eq('product_id', productId)
      .single();
    if (!imgCheck.data) throw new NotFoundError('Image not found for this product.');

    // 1. Demote current primary
    await adminClient.from('product_images').update({ is_primary: false }).eq('product_id', productId);

    // 2. Promote selected image
    const { data, error } = await adminClient
      .from('product_images')
      .update({ is_primary: true })
      .eq('id', imageId)
      .select('*')
      .single();

    if (error || !data) throw new InternalServerError(`Failed to set primary image: ${error?.message}`);

    return {
      ...data,
      public_url: this.getPublicUrl(data.storage_path),
    };
  }

  /**
   * Delete image from Supabase Storage and database.
   * If primary image is deleted, promotes next available image in gallery.
   */
  static async deleteProductImage(productId: string, imageId: string): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) throw new InternalServerError('Administrative client is unavailable.');

    const img = await adminClient
      .from('product_images')
      .select('*')
      .eq('id', imageId)
      .eq('product_id', productId)
      .single();

    if (!img.data) throw new NotFoundError('Image not found for this product.');

    const isPrimary = img.data.is_primary;
    const storagePath = img.data.storage_path;

    // 1. Delete database record
    const { error: dbError } = await adminClient.from('product_images').delete().eq('id', imageId);
    if (dbError) throw new InternalServerError(`Failed to delete image record: ${dbError.message}`);

    // 2. Delete storage object
    await adminClient.storage.from(PRODUCT_STORAGE_BUCKET).remove([storagePath]).catch((err) => {
      logger.error('Failed to delete object from storage bucket', { error: err.message, storagePath });
    });

    // 3. If deleted image was primary, designate next available image as primary
    if (isPrimary) {
      const nextImage = await adminClient
        .from('product_images')
        .select('id')
        .eq('product_id', productId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (nextImage.data) {
        await adminClient.from('product_images').update({ is_primary: true }).eq('id', nextImage.data.id);
      }
    }
  }
}
