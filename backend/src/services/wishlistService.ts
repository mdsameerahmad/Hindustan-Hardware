import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, BadRequestError } from '../common/errors';
import { WishlistItemResponse } from '../types';
import { ImageService } from './imageService';

export class WishlistService {
  /**
   * Retrieves all wishlist items for an authenticated user.
   */
  static async getWishlist(userId: string): Promise<WishlistItemResponse[]> {
    const supabase = getSupabaseAdminClient() || getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');


    const { data, error } = await supabase
      .from('wishlists')
      .select(
        `
        id,
        created_at,
        product:products(
          id, name, slug, base_price, compare_at_price, is_active, image_url,
          brand:brands(name),
          inventory:inventory(quantity_available),
          product_images:product_images(*)
        )
      `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerError(`Failed to fetch wishlist: ${error.message}`);

    return (data || []).map((row: any) => {
      const prod = row.product || {};
      let primaryImage: string | null = prod.image_url || null;
      if (Array.isArray(prod.product_images) && prod.product_images.length > 0) {
        const primary = prod.product_images.find((img: any) => img.is_primary) || prod.product_images[0];
        if (primary && primary.storage_path) {
          primaryImage = ImageService.getPublicUrl(primary.storage_path);
        }
      }

      let stockAvailable = 0;
      if (Array.isArray(prod.inventory) && prod.inventory.length > 0) {
        stockAvailable = prod.inventory[0].quantity_available || 0;
      }

      return {
        id: row.id,
        productId: prod.id,
        name: prod.name,
        slug: prod.slug,
        basePrice: Number(prod.base_price || 0),
        compareAtPrice: prod.compare_at_price ? Number(prod.compare_at_price) : null,
        primaryImage,
        brandName: prod.brand?.name || null,
        stockAvailable,
        createdAt: row.created_at,
      };
    });
  }

  /**
   * Adds product to customer wishlist (idempotent via unique constraint).
   */
  static async addToWishlist(userId: string, productId: string): Promise<void> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // Check product exists and is active
    const { data: product } = await client.from('products').select('id, is_active').eq('id', productId).single();
    if (!product || !product.is_active) {
      throw new BadRequestError('Product does not exist or is inactive.');
    }

    await client
      .from('wishlists')
      .insert({ user_id: userId, product_id: productId })
      .select('id')
      .single();

  }

  /**
   * Removes product from customer wishlist.
   */
  static async removeFromWishlist(userId: string, productId: string): Promise<void> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { error } = await client
      .from('wishlists')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);

    if (error) throw new InternalServerError(`Failed to remove product from wishlist: ${error.message}`);
  }
}
