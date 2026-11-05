import { randomUUID } from 'crypto';
import { BadRequestError, InternalServerError } from '../common/errors';
import { getSupabaseAdminClient } from '../config/supabase';
import { logger } from '../common/utils/logger';
import { createDeliveryOtp, decryptDeliveryOtp } from './deliveryOtpService';
import { CheckoutService } from './checkoutService';

type PhoneOrderItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

type PhoneOrderAddress = {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  addressType?: string;
  latitude?: number | null;
  longitude?: number | null;
  formattedAddress?: string | null;
  geocodingProvider?: string | null;
};

export class AdminPhoneOrderService {
  static async createOrder(params: {
    actorId: string;
    shippingAddress: PhoneOrderAddress;
    items: PhoneOrderItem[];
    customerNotes?: string | null;
    idempotencyKey?: string;
  }): Promise<{ orderId: string; deliveryOtp: string }> {
    const client = getSupabaseAdminClient();
    if (!client) {
      throw new InternalServerError('Administrative database service is unavailable.');
    }

    const deliveryOtp = createDeliveryOtp();
    const idempotencyKey = `phone:${params.actorId}:${params.idempotencyKey || randomUUID()}`;
    const address = params.shippingAddress;
    const shippingAddressSnapshot = {
      recipient_name: address.recipientName,
      phone: address.phone,
      address_line1: address.addressLine1,
      address_line2: address.addressLine2 || null,
      landmark: address.landmark || null,
      city: address.city,
      state: address.state,
      postal_code: address.postalCode,
      country: address.country || 'India',
      address_type: address.addressType || 'Home',
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      formatted_address: address.formattedAddress || null,
      geocoding_provider: address.geocodingProvider || null,
    };

    const { data, error } = await client.rpc('create_admin_phone_order', {
      p_order_number: CheckoutService.generateOrderNumber(),
      p_actor_id: params.actorId,
      p_shipping_address: shippingAddressSnapshot,
      p_customer_notes: params.customerNotes || null,
      p_items: params.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: item.quantity,
      })),
      p_idempotency_key: idempotencyKey,
      p_delivery_otp_hash: deliveryOtp.hash,
      p_delivery_otp_ciphertext: deliveryOtp.ciphertext,
    });

    if (error || !data?.success || typeof data.order_id !== 'string') {
      if (error?.code === '23505') {
        const { data: existingOrder, error: existingOrderError } = await client
          .from('orders')
          .select('id, delivery_otp_ciphertext')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (!existingOrderError && existingOrder?.id && existingOrder.delivery_otp_ciphertext) {
          return {
            orderId: existingOrder.id,
            deliveryOtp: decryptDeliveryOtp(existingOrder.delivery_otp_ciphertext),
          };
        }
      }

      const message = error?.message || 'Phone order creation returned an invalid result.';
      if (
        /insufficient stock|inventory record missing|invalid or no longer active|quantity must|must contain at least one item/i
          .test(message)
      ) {
        throw new BadRequestError(message);
      }

      logger.error('Failed to create admin phone order', {
        actorId: params.actorId,
        error: message,
        code: error?.code,
      });
      throw new InternalServerError(
        'Phone order could not be created. Verify that migration 017_phone_orders_and_tracking_shares.sql has been applied.'
      );
    }

    if (data.is_duplicate) {
      const { data: existingOrder, error: existingOrderError } = await client
        .from('orders')
        .select('delivery_otp_ciphertext')
        .eq('id', data.order_id)
        .single();

      if (existingOrderError || !existingOrder?.delivery_otp_ciphertext) {
        logger.error('Failed to retrieve delivery OTP for idempotent phone order', {
          orderId: data.order_id,
          error: existingOrderError?.message,
        });
        throw new InternalServerError('Phone order was found, but its delivery code could not be retrieved.');
      }

      return {
        orderId: data.order_id,
        deliveryOtp: decryptDeliveryOtp(existingOrder.delivery_otp_ciphertext),
      };
    }

    return { orderId: data.order_id, deliveryOtp: deliveryOtp.otp };
  }
}
