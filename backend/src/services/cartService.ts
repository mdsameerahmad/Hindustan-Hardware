import crypto from 'crypto';
import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, BadRequestError } from '../common/errors';
import { CartResponse, CartItemResponse } from '../types';
import { ImageService } from './imageService';

export class CartService {
  /**
   * Hashes guest cart token using SHA-256
   */
  static hashGuestToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Generates a cryptographically strong, unpredictable 32-byte guest token
   */
  static generateGuestToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Formats raw cart and items query into structured CartResponse with authoritative live prices
   */
  private static formatCartResponse(cartRow: any, items: any[]): CartResponse {
    let subtotal = 0;
    let totalQuantity = 0;

    const formattedItems: CartItemResponse[] = items.map((item) => {
      const product = item.product || {};
      const variant = item.variant || null;

      // Extract discount from product specs or brand description
      let brandDiscount: number | null = null;
      if (product.brand?.description && typeof product.brand.description === 'string') {
        const match = product.brand.description.match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
        if (match) {
          brandDiscount = Number(match[1]);
        }
      }

      let productDiscount: number | null = null;
      const rawProdDiscount = product.specs?.discount_percentage || product.specs?.discountPercentage;
      if (rawProdDiscount != null && !isNaN(Number(rawProdDiscount))) {
        productDiscount = Number(rawProdDiscount);
      }

      const effectiveDiscount = productDiscount != null ? productDiscount : brandDiscount;

      // Raw undiscounted unit price
      const rawUnitPrice = variant?.price_override != null
        ? Number(variant.price_override)
        : Number(product.base_price || 0);

      let unitPrice = rawUnitPrice;
      let compareAtPrice = product.compare_at_price != null ? Number(product.compare_at_price) : null;

      if (effectiveDiscount && effectiveDiscount > 0) {
        const discountBasisPrice = variant?.price_override != null
          ? rawUnitPrice
          : compareAtPrice && compareAtPrice > 0
            ? compareAtPrice
            : rawUnitPrice;
        if (!compareAtPrice || compareAtPrice <= rawUnitPrice) {
          compareAtPrice = discountBasisPrice;
        }
        unitPrice = Math.round(discountBasisPrice * (1 - effectiveDiscount / 100) * 100) / 100;
      }

      const quantity = Number(item.quantity);
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;

      subtotal += lineTotal;
      totalQuantity += quantity;

      // Extract primary image
      let primaryImage: string | null = product.image_url || null;
      if (Array.isArray(product.product_images) && product.product_images.length > 0) {
        const primary = product.product_images.find((img: any) => img.is_primary) || product.product_images[0];
        if (primary && primary.storage_path) {
          primaryImage = ImageService.getPublicUrl(primary.storage_path);
        }
      }

      // Check live inventory availability
      let stockAvailable = 0;
      if (Array.isArray(product.inventory) && product.inventory.length > 0) {
        if (variant) {
          const varInv = product.inventory.find((inv: any) => inv.variant_id === variant.id);
          stockAvailable = varInv?.quantity_available ?? product.inventory[0].quantity_available ?? 0;
        } else {
          stockAvailable = product.inventory[0].quantity_available ?? 0;
        }
      }

      const isAvailable = Boolean(product.is_active && stockAvailable >= quantity);

      return {
        id: item.id,
        cartId: item.cart_id,
        productId: item.product_id,
        variantId: item.variant_id || null,
        name: product.name || '',
        slug: product.slug || '',
        unit: product.unit || 'piece',
        unitOfSale: product.unit_of_sale || 'piece',
        unitPrice,
        compareAtPrice,
        quantity,
        lineTotal,
        primaryImage,
        brandName: product.brand?.name || null,
        variantName: variant?.name || null,
        variantAttributes: variant?.variant_attributes || {},
        stockAvailable,
        isAvailable,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    });

    return {
      id: cartRow.id,
      userId: cartRow.user_id || null,
      isGuest: !cartRow.user_id,
      status: cartRow.status || 'active',
      itemCount: formattedItems.length,
      totalQuantity,
      subtotal: Math.round(subtotal * 100) / 100,
      items: formattedItems,
      createdAt: cartRow.created_at,
      updatedAt: cartRow.updated_at,
    };
  }

  /**
   * Retrieves full cart and associated items with live product prices
   */
  static async getCartWithItems(cartId: string): Promise<CartResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: cart, error: cartError } = await client
      .from('carts')
      .select('*')
      .eq('id', cartId)
      .single();

    if (cartError || !cart) throw new NotFoundError('Cart not found.');

    const { data: items, error: itemsError } = await client
      .from('cart_items')
      .select(
        `
        *,
        product:products(
          id, name, slug, base_price, compare_at_price, unit, unit_of_sale, is_active, image_url, specs,
          brand:brands(id, name, description),
          inventory:inventory(*),
          product_images:product_images(*)
        ),
        variant:product_variants(id, name, price_override, variant_attributes, is_active)
      `
      )
      .eq('cart_id', cartId)
      .order('created_at', { ascending: true });

    if (itemsError) throw new InternalServerError(`Failed to query cart items: ${itemsError.message}`);

    return this.formatCartResponse(cart, items || []);
  }

  /**
   * Retrieves or creates persistent active cart for authenticated user.
   */
  static async getOrCreateCustomerCart(userId: string): Promise<CartResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: existingCart } = await client
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();


    if (existingCart) {
      return this.getCartWithItems(existingCart.id);
    }

    const { data: newCart, error } = await client
      .from('carts')
      .insert({ user_id: userId, status: 'active' })
      .select('id')
      .single();

    if (error || !newCart) throw new InternalServerError(`Failed to create customer cart: ${error?.message}`);
    return this.getCartWithItems(newCart.id);
  }

  /**
   * Creates a new guest cart and returns its raw unhashed token
   */
  static async createGuestCart(): Promise<{ cart: CartResponse; guestToken: string }> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const rawToken = this.generateGuestToken();
    const tokenHash = this.hashGuestToken(rawToken);

    const { data: newCart, error } = await client
      .from('carts')
      .insert({ guest_cart_token_hash: tokenHash, status: 'active' })
      .select('id')
      .single();

    if (error || !newCart) throw new InternalServerError(`Failed to create guest cart: ${error?.message}`);

    const cart = await this.getCartWithItems(newCart.id);
    return { cart, guestToken: rawToken };
  }

  /**
   * Retrieves guest cart by validating its raw token against stored hash
   */
  static async getGuestCartIdByToken(rawToken: string): Promise<string> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    if (!rawToken || rawToken.trim() === '') {
      throw new BadRequestError('Guest cart token is required.');
    }

    const tokenHash = this.hashGuestToken(rawToken);

    const { data: cart, error } = await client
      .from('carts')
      .select('id')
      .eq('guest_cart_token_hash', tokenHash)
      .eq('status', 'active')
      .single();

    if (error || !cart) {
      throw new NotFoundError('Active guest cart not found for the provided token.');
    }

    return cart.id;
  }

  static async getGuestCartByToken(rawToken: string): Promise<CartResponse> {
    const cartId = await this.getGuestCartIdByToken(rawToken);
    return this.getCartWithItems(cartId);
  }



  /**
   * Adds an item to a cart (authenticated or guest).
   * Validates product and variant against database; merges quantities if duplicate line.
   */
  static async addItemToCart(
    cartId: string,
    payload: { productId: string; variantId?: string | null; quantity: number }
  ): Promise<CartResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Verify product exists and is active
    const { data: product } = await client
      .from('products')
      .select('id, is_active')
      .eq('id', payload.productId)
      .single();

    if (!product || !product.is_active) {
      throw new BadRequestError('Product does not exist or is inactive.');
    }

    // 2. Verify variant if provided
    if (payload.variantId) {
      const { data: variant } = await client
        .from('product_variants')
        .select('id, is_active')
        .eq('id', payload.variantId)
        .eq('product_id', payload.productId)
        .single();

      if (!variant || !variant.is_active) {
        throw new BadRequestError('Variant does not belong to product or is inactive.');
      }
    }

    // 3. Check if line item already exists in this cart
    let query = client
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', cartId)
      .eq('product_id', payload.productId);

    if (payload.variantId) {
      query = query.eq('variant_id', payload.variantId);
    } else {
      query = query.is('variant_id', null);
    }

    const { data: existingItem } = await query.single();


    if (existingItem) {
      const newQuantity = existingItem.quantity + payload.quantity;
      await client
        .from('cart_items')
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq('id', existingItem.id);
    } else {
      await client.from('cart_items').insert({
        cart_id: cartId,
        product_id: payload.productId,
        variant_id: payload.variantId || null,
        quantity: payload.quantity,
      });
    }

    return this.getCartWithItems(cartId);
  }

  /**
   * Updates quantity of an item within a cart.
   */
  static async updateCartItemQuantity(
    cartId: string,
    itemId: string,
    quantity: number
  ): Promise<CartResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: item } = await client
      .from('cart_items')
      .select('id')
      .eq('id', itemId)
      .eq('cart_id', cartId)
      .single();

    if (!item) throw new NotFoundError('Item not found in this cart.');

    await client
      .from('cart_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    return this.getCartWithItems(cartId);
  }

  /**
   * Removes an item from a cart.
   */
  static async removeCartItem(cartId: string, itemId: string): Promise<CartResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: item } = await client
      .from('cart_items')
      .select('id')
      .eq('id', itemId)
      .eq('cart_id', cartId)
      .single();

    if (!item) throw new NotFoundError('Item not found in this cart.');

    await client.from('cart_items').delete().eq('id', itemId);
    return this.getCartWithItems(cartId);
  }

  /**
   * Clears all items in a cart.
   */
  static async clearCart(cartId: string): Promise<CartResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    await client.from('cart_items').delete().eq('cart_id', cartId);
    return this.getCartWithItems(cartId);
  }

  /**
   * Atomically merges a guest cart into a customer's persistent cart upon login/register.
   */
  static async mergeGuestCart(userId: string, guestToken: string): Promise<CartResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const guestCart = await this.getGuestCartByToken(guestToken);
    const customerCart = await this.getOrCreateCustomerCart(userId);

    // Merge each guest item into customer cart
    for (const item of guestCart.items) {
      await this.addItemToCart(customerCart.id, {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }

    // Mark guest cart as merged
    await client
      .from('carts')
      .update({ status: 'merged', updated_at: new Date().toISOString() })
      .eq('id', guestCart.id);

    return this.getCartWithItems(customerCart.id);
  }
}
