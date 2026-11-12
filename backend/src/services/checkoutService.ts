import crypto from 'crypto';
import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, BadRequestError, ConflictError } from '../common/errors';
import { OrderResponse, CheckoutValidationResult, OrderItemRecord, CustomerAddress } from '../types';
import { AddressService } from './addressService';
import { CartService } from './cartService';
import { logger } from '../common/utils/logger';
import { createDeliveryOtp, decryptDeliveryOtp, DeliveryOtpBundle } from './deliveryOtpService';
import { broadcastNewOrderToAdmins } from '../common/socket/trackingSocket';
import { getDeliveryFeeByOrderId } from './deliveryFeeService';

export class CheckoutService {
  private static calculateEffectiveUnitPrice(
    rawUnitPrice: number,
    compareAtPrice: number | null,
    discountPercentage: number | null,
    hasVariant: boolean
  ): number {
    if (!discountPercentage || discountPercentage <= 0) return rawUnitPrice;

    const discountBasisPrice =
      !hasVariant && compareAtPrice != null && compareAtPrice > rawUnitPrice
        ? compareAtPrice
        : rawUnitPrice;

    return Math.round(discountBasisPrice * (1 - discountPercentage / 100) * 100) / 100;
  }

  private static async isDeliveryPincodeAvailable(postalCode: unknown): Promise<boolean> {
    const pincode = String(postalCode || '').trim().replace(/\D/g, '');
    if (!/^\d{6}$/.test(pincode)) return false;

    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data, error } = await client
      .from('serviceable_postcodes')
      .select('pincode')
      .eq('pincode', pincode)
      .maybeSingle();

    if (error) {
      logger.error('Failed to check delivery postcode coverage', { pincode, error: error.message });
      throw new InternalServerError('Unable to verify delivery availability right now.');
    }

    return Boolean(data);
  }

  /**
   * Generates a safe, unguessable, human-readable order number.
   * e.g., "HH-20261019-A3F9B1"
   */
  static generateOrderNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `HH-${dateStr}-${randomHex}`;
  }

  /**
   * Resolves shipping address either from saved addressId (verifying user ownership)
   * or from a validated checkout-time address snapshot.
   */
  static async resolveShippingAddress(
    userId: string,
    addressId?: string,
    snapshot?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (addressId) {
      const savedAddress = await AddressService.getAddressById(userId, addressId);
      if (!savedAddress) {
        throw new NotFoundError('Saved delivery address not found or does not belong to you.');
      }

      // Check if coordinates were supplied in snapshot or savedAddress
      let lat = snapshot?.latitude ?? snapshot?.lat ?? savedAddress.latitude ?? null;
      let lon = snapshot?.longitude ?? snapshot?.lng ?? snapshot?.lon ?? savedAddress.longitude ?? null;
      let landmark = savedAddress.landmark || (snapshot?.landmark as string) || null;

      if ((lat == null || lon == null) && landmark && typeof landmark === 'string') {
        const match = landmark.match(/^LOC:([0-9.-]+),([0-9.-]+)(\|(.*))?$/);
        if (match) {
          lat = Number(match[1]);
          lon = Number(match[2]);
          landmark = match[4] || null;
        }
      }

      return {
        recipient_name: savedAddress.recipient_name,
        phone: savedAddress.phone,
        address_line1: savedAddress.address_line1,
        address_line2: savedAddress.address_line2,
        landmark: landmark,
        city: savedAddress.city,
        state: savedAddress.state,
        postal_code: savedAddress.postal_code,
        country: savedAddress.country || 'India',
        address_type: savedAddress.address_type || 'Home',
        latitude: lat != null && !isNaN(Number(lat)) ? Number(lat) : null,
        longitude: lon != null && !isNaN(Number(lon)) ? Number(lon) : null,
        formatted_address: (snapshot?.formattedAddress as string) || (snapshot?.formatted_address as string) || savedAddress.formatted_address || null,
        geocoding_provider: (snapshot?.geocodingProvider as string) || (snapshot?.geocoding_provider as string) || savedAddress.geocoding_provider || null,
      };
    }

    if (snapshot) {
      return {
        recipient_name: snapshot.recipientName || snapshot.recipient_name,
        phone: snapshot.phone,
        address_line1: snapshot.addressLine1 || snapshot.address_line1,
        address_line2: snapshot.addressLine2 || snapshot.address_line2 || null,
        landmark: snapshot.landmark || null,
        city: snapshot.city,
        state: snapshot.state,
        postal_code: snapshot.postalCode || snapshot.postal_code,
        country: snapshot.country || 'India',
        address_type: snapshot.addressType || snapshot.address_type || 'Home',
        latitude: snapshot.latitude ?? snapshot.lat ?? null,
        longitude: snapshot.longitude ?? snapshot.lng ?? snapshot.lon ?? null,
        formatted_address: snapshot.formattedAddress || snapshot.formatted_address || null,
        geocoding_provider: snapshot.geocodingProvider || snapshot.geocoding_provider || null,
      };
    }

    throw new BadRequestError('A valid delivery address is required for checkout.');
  }

  /**
   * Validates cart, products, live inventory, and recalculates authoritative prices without creating an order.
   */
  static async validateCheckout(
    userId: string,
    params: {
      addressId?: string;
      shippingAddress?: Record<string, unknown>;
      paymentMethod: string;
    }
  ): Promise<CheckoutValidationResult> {
    if (params.paymentMethod !== 'cod') {
      throw new BadRequestError("Only 'cod' (Cash on Delivery) is supported.");
    }

    const shippingAddress = await this.resolveShippingAddress(
      userId,
      params.addressId,
      params.shippingAddress
    );

    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const pincode = String(shippingAddress.postal_code || '').trim();
    if (!(await this.isDeliveryPincodeAvailable(pincode))) {
      return {
        isValid: true,
        canCheckout: false,
        deliveryAvailable: false,
        deliveryMessage: 'Delivery is not available in your location. Contact the shop for assistance.',
        deliveryPincode: pincode,
        itemCount: 0,
        subtotal: 0,
        totalAmount: 0,
        currency: 'INR',
        paymentMethod: 'cod',
        shippingAddress,
        items: [],
      };
    }

    // 1. Fetch active customer cart
    const cart = await CartService.getOrCreateCustomerCart(userId);
    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestError('Cannot proceed to checkout with an empty cart.');
    }

    let calculatedSubtotal = 0;
    let canCheckout = true;
    const validatedItems: CheckoutValidationResult['items'] = [];
    const priceDiscrepancies: NonNullable<CheckoutValidationResult['priceDiscrepancies']> = [];

    // 2. Authoritative check on each line item against live DB
    for (const item of cart.items) {
      const { data: product, error: prodErr } = await client
        .from('products')
        .select('id, name, base_price, compare_at_price, is_active, specs, brand:brands(id, name, description)')
        .eq('id', item.productId)
        .single();

      if (prodErr || !product || !product.is_active) {
        throw new BadRequestError(`Product "${item.name}" is no longer available.`);
      }

      let brandDiscount: number | null = null;
      const bDesc = (product.brand as any)?.description;
      if (bDesc && typeof bDesc === 'string') {
        const match = bDesc.match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
        if (match) brandDiscount = Number(match[1]);
      }

      let productDiscount: number | null = null;
      const prodSpecs = product.specs as Record<string, string> | null;
      const rawProdDiscount = prodSpecs?.discount_percentage || prodSpecs?.discountPercentage;
      if (rawProdDiscount != null && !isNaN(Number(rawProdDiscount))) {
        productDiscount = Number(rawProdDiscount);
      }

      const effectiveDiscount = productDiscount != null ? productDiscount : brandDiscount;

      let rawUnitPrice = Number(product.base_price || 0);

      if (item.variantId) {
        const { data: variant, error: varErr } = await client
          .from('product_variants')
          .select('id, name, price_override, is_active')
          .eq('id', item.variantId)
          .eq('product_id', item.productId)
          .single();

        if (varErr || !variant || !variant.is_active) {
          throw new BadRequestError(`Variant for "${item.name}" is no longer active.`);
        }

        if (variant.price_override != null) {
          rawUnitPrice = Number(variant.price_override);
        }
      }

      const compareAtPrice = product.compare_at_price == null
        ? null
        : Number(product.compare_at_price);
      const unitPrice = this.calculateEffectiveUnitPrice(
        rawUnitPrice,
        compareAtPrice,
        effectiveDiscount,
        Boolean(item.variantId)
      );

      // Check stock
      let inventoryQuery = client.from('inventory').select('quantity_available').eq('product_id', item.productId);
      if (item.variantId) {
        inventoryQuery = inventoryQuery.eq('variant_id', item.variantId);
      } else {
        inventoryQuery = inventoryQuery.is('variant_id', null);
      }

      const { data: invData } = await inventoryQuery.single();
      const stockAvailable = invData ? Number(invData.quantity_available) : 0;
      const inStock = stockAvailable >= item.quantity;

      if (!inStock) {
        canCheckout = false;
      }

      if (unitPrice !== item.unitPrice) {
        priceDiscrepancies.push({
          productId: item.productId,
          productName: item.name,
          oldPrice: item.unitPrice,
          currentPrice: unitPrice,
        });
      }

      const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
      calculatedSubtotal += lineTotal;

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
        inStock,
        stockAvailable,
      });
    }

    return {
      isValid: true,
      canCheckout,
      itemCount: validatedItems.length,
      subtotal: Math.round(calculatedSubtotal * 100) / 100,
      totalAmount: Math.round(calculatedSubtotal * 100) / 100,
      currency: 'INR',
      paymentMethod: 'cod',
      shippingAddress,
      items: validatedItems,
      deliveryAvailable: true,
      deliveryMessage: 'Delivery is available to this PIN code.',
      deliveryPincode: pincode,
      priceDiscrepancies: priceDiscrepancies.length > 0 ? priceDiscrepancies : undefined,
    };
  }

  /**
   * Atomically executes order creation via PostgreSQL function or database transaction.
   * Locks inventory, checks stock, creates order and order_items, inserts status history,
   * deducts stock, and clears the cart.
   */
  static async createOrder(
    userId: string,
    params: {
      addressId?: string;
      shippingAddress?: Record<string, unknown>;
      paymentMethod: 'cod';
      customerNotes?: string | null;
      idempotencyKey?: string;
    }
  ): Promise<OrderResponse> {
    if (params.paymentMethod !== 'cod') {
      throw new BadRequestError("Only 'cod' (Cash on Delivery) is supported.");
    }

    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Check idempotency if key provided
    if (params.idempotencyKey) {
      const { data: existingOrder } = await client
        .from('orders')
        .select('id')
        .eq('idempotency_key', params.idempotencyKey)
        .eq('user_id', userId)
        .single();

      if (existingOrder) {
        logger.info('Duplicate checkout submission detected, returning existing order', {
          idempotencyKey: params.idempotencyKey,
          orderId: existingOrder.id,
        });
        return this.getOrderById(existingOrder.id, userId);
      }
    }

    // 2. Resolve Shipping Address snapshot
    const shippingAddress = await this.resolveShippingAddress(
      userId,
      params.addressId,
      params.shippingAddress
    );
    if (!(await this.isDeliveryPincodeAvailable(shippingAddress.postal_code))) {
      throw new BadRequestError('Delivery is not available in your location. Contact the shop for assistance.');
    }

    // 3. Fetch active customer cart
    const cart = await CartService.getOrCreateCustomerCart(userId);
    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestError('Cannot create an order with an empty cart.');
    }

    // 4. Execute atomic order creation using process_cod_checkout RPC or coordinated transaction
    const orderNumber = this.generateOrderNumber();
    const idempotencyKey = params.idempotencyKey || null;
    const deliveryOtp = createDeliveryOtp();

    try {
      // Try database-level RPC function for guaranteed atomicity
      const { data: rpcResult, error: rpcError } = await client.rpc('process_cod_checkout', {
        p_user_id: userId,
        p_order_number: orderNumber,
        p_shipping_address: shippingAddress,
        p_customer_notes: params.customerNotes || null,
        p_idempotency_key: idempotencyKey,
        p_cart_id: cart.id,
        p_delivery_otp_hash: deliveryOtp.hash,
        p_delivery_otp_ciphertext: deliveryOtp.ciphertext,
      });

      if (!rpcError && rpcResult && rpcResult.order_id) {
        const order = await this.getOrderById(rpcResult.order_id, userId);
        if (!rpcResult.is_duplicate) {
          broadcastNewOrderToAdmins({
            orderId: order.id,
            orderNumber: order.orderNumber,
            createdAt: order.createdAt,
          });
        }
        return order;
      }

      // If RPC is unavailable or returns an error that is a known business error:
      if (rpcError) {
        const msg = rpcError.message || '';
        if (msg.includes('Insufficient stock') || msg.includes('empty cart') || msg.includes('invalid or no longer active')) {
          throw new BadRequestError(msg);
        }
        logger.warn('process_cod_checkout RPC call failed or not registered, falling back to client-coordinated transaction', {
          error: rpcError.message,
        });
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err;
      logger.warn('RPC execution failed, using fallback transaction sequence', { error: String(err) });
    }

    // Fallback: Safe coordinated transaction
    return this.createOrderCoordinated(userId, cart.id, orderNumber, shippingAddress, params, deliveryOtp);
  }

  /**
   * Coordinated order creation fallback when database function is unavailable in development/mock environments.
   */
  private static async createOrderCoordinated(
    userId: string,
    cartId: string,
    orderNumber: string,
    shippingAddress: Record<string, unknown>,
    params: {
      customerNotes?: string | null;
      idempotencyKey?: string;
    },
    deliveryOtp: DeliveryOtpBundle
  ): Promise<OrderResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Fetch Cart Items
    const { data: cartItems, error: itemsErr } = await client
      .from('cart_items')
      .select('id, product_id, variant_id, quantity')
      .eq('cart_id', cartId);

    if (itemsErr || !cartItems || cartItems.length === 0) {
      throw new BadRequestError('Cannot create an order with an empty cart.');
    }

    let subtotal = 0;
    const preparedItems: {
      productId: string;
      variantId: string | null;
      productName: string;
      sku: string | null;
      variantTitle: string | null;
      unitPrice: number;
      quantity: number;
      lineSubtotal: number;
      inventoryId: string;
      currentStock: number;
    }[] = [];

    // 2. Validate products, variants, and stock
    for (const item of cartItems) {
      const { data: product } = await client
        .from('products')
        .select('id, name, sku, base_price, compare_at_price, is_active, specs, brand:brands(id, name, description)')
        .eq('id', item.product_id)
        .single();

      if (!product || !product.is_active) {
        throw new BadRequestError(`Product ${item.product_id} is no longer available.`);
      }

      let brandDiscount: number | null = null;
      const bDesc = (product.brand as any)?.description;
      if (bDesc && typeof bDesc === 'string') {
        const match = bDesc.match(/\[DISCOUNT:(\d+(?:\.\d+)?)%\]/i);
        if (match) brandDiscount = Number(match[1]);
      }

      let productDiscount: number | null = null;
      const prodSpecs = product.specs as Record<string, string> | null;
      const rawProdDiscount = prodSpecs?.discount_percentage || prodSpecs?.discountPercentage;
      if (rawProdDiscount != null && !isNaN(Number(rawProdDiscount))) {
        productDiscount = Number(rawProdDiscount);
      }

      const effectiveDiscount = productDiscount != null ? productDiscount : brandDiscount;

      let rawUnitPrice = Number(product.base_price || 0);
      let variantTitle: string | null = null;
      let sku = product.sku || null;

      if (item.variant_id) {
        const { data: variant } = await client
          .from('product_variants')
          .select('id, name, sku, price_override, is_active')
          .eq('id', item.variant_id)
          .single();

        if (!variant || !variant.is_active) {
          throw new BadRequestError(`Variant is no longer active.`);
        }
        if (variant.price_override != null) {
          rawUnitPrice = Number(variant.price_override);
        }
        variantTitle = variant.name;
        if (variant.sku) sku = variant.sku;
      }

      const compareAtPrice = product.compare_at_price == null
        ? null
        : Number(product.compare_at_price);
      const unitPrice = CheckoutService.calculateEffectiveUnitPrice(
        rawUnitPrice,
        compareAtPrice,
        effectiveDiscount,
        Boolean(item.variant_id)
      );

      // Check stock
      let invQuery = client.from('inventory').select('id, quantity_available').eq('product_id', item.product_id);
      if (item.variant_id) {
        invQuery = invQuery.eq('variant_id', item.variant_id);
      } else {
        invQuery = invQuery.is('variant_id', null);
      }

      const { data: inv } = await invQuery.single();
      if (!inv || Number(inv.quantity_available) < item.quantity) {
        throw new BadRequestError(`Insufficient stock for product "${product.name}".`);
      }

      const lineSubtotal = Math.round(unitPrice * item.quantity * 100) / 100;
      subtotal += lineSubtotal;

      preparedItems.push({
        productId: item.product_id,
        variantId: item.variant_id || null,
        productName: product.name,
        sku,
        variantTitle,
        unitPrice,
        quantity: item.quantity,
        lineSubtotal,
        inventoryId: inv.id,
        currentStock: Number(inv.quantity_available),
      });
    }

    const totalAmount = Math.round(subtotal * 100) / 100;

    // 3. Insert Order
    const { data: order, error: orderErr } = await client
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: userId,
        status: 'pending',
        payment_method: 'cod',
        payment_status: 'pending',
        currency: 'INR',
        subtotal,
        discount_amount: 0.00,
        tax_amount: 0.00,
        shipping_amount: 0.00,
        total_amount: totalAmount,
        shipping_address_snapshot: shippingAddress,
        customer_notes: params.customerNotes || null,
        idempotency_key: params.idempotencyKey || null,
        delivery_otp_hash: deliveryOtp.hash,
        delivery_otp_ciphertext: deliveryOtp.ciphertext,
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      if (orderErr?.code === '23505' && params.idempotencyKey) {
        // Unique constraint violation on idempotency key
        const { data: existing } = await client
          .from('orders')
          .select('id')
          .eq('idempotency_key', params.idempotencyKey)
          .single();
        if (existing) return this.getOrderById(existing.id, userId);
      }
      throw new InternalServerError(`Failed to create order: ${orderErr?.message}`);
    }

    const orderId = order.id;

    // 4. Record Initial Status History
    await client.from('order_status_history').insert({
      order_id: orderId,
      previous_status: null,
      new_status: 'pending',
      actor_id: userId,
      reason: 'Order placed via Cash on Delivery',
    });

    // 5. Insert Order Items & Deduct Stock
    for (const item of preparedItems) {
      await client.from('order_items').insert({
        order_id: orderId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        sku: item.sku,
        variant_title: item.variantTitle,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        line_subtotal: item.lineSubtotal,
      });

      // Deduct inventory
      await client
        .from('inventory')
        .update({
          quantity_available: item.currentStock - item.quantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.inventoryId);
    }

    // 6. Clear Cart
    await client.from('cart_items').delete().eq('cart_id', cartId);

    const orderResponse = await this.getOrderById(orderId, userId);
    broadcastNewOrderToAdmins({
      orderId: orderResponse.id,
      orderNumber: orderResponse.orderNumber,
      createdAt: orderResponse.createdAt,
    });
    return orderResponse;
  }

  /**
   * Retrieves single order by ID strictly scoped to user or administrator.
   */
  static async getOrderById(orderId: string, userId: string): Promise<OrderResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found.');
    }

    const { data: items, error: itemsErr } = await client
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (itemsErr) throw new InternalServerError(`Failed to query order items: ${itemsErr.message}`);

    const deliveryFee = await getDeliveryFeeByOrderId(client, orderId);
    const formattedItems: OrderItemRecord[] = (items || []).map((row: any) => ({
      id: row.id,
      orderId: row.order_id,
      productId: row.product_id,
      variantId: row.variant_id,
      productName: row.product_name,
      sku: row.sku,
      variantTitle: row.variant_title,
      specifications: row.specifications || {},
      unitPrice: Number(row.unit_price),
      quantity: Number(row.quantity),
      lineSubtotal: Number(row.line_subtotal),
      createdAt: row.created_at,
    }));

    return {
      id: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      status: order.status,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      currency: order.currency || 'INR',
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount || 0),
      taxAmount: Number(order.tax_amount || 0),
      shippingAmount: Number(order.shipping_amount || 0),
      totalAmount: Number(order.total_amount),
      deliveryFee,
      totalPayable: Number(order.total_amount) + deliveryFee,
      shippingAddress: order.shipping_address_snapshot,
      customerNotes: order.customer_notes || null,
      items: formattedItems,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      deliveryOtp: order.delivery_otp_ciphertext ? decryptDeliveryOtp(order.delivery_otp_ciphertext) : null,
    };
  }
}
