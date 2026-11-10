import { getSupabaseAdminClient, getSupabaseClient } from '../config/supabase';
import {
  NotFoundError,
  BadRequestError,
  InternalServerError,
} from '../common/errors';
import {
  OrderSummary,
  OrderDetailsResponse,
  OrderStatusTrackingResponse,
  OrderItemRecord,
  OrderStatusHistoryItem,
  PaginatedResult,
  OrderStatus,
  PaymentStatus,
} from '../types';
import { logger } from '../common/utils/logger';
import { decryptDeliveryOtp } from './deliveryOtpService';
import { getDeliveryFeeByOrderId, getDeliveryFeesByOrderIds } from './deliveryFeeService';

export class OrderService {
  /**
   * Allowed statuses from which a customer may cancel their order.
   * Only 'pending' or 'confirmed' orders are cancellable by customers.
   * Processing, shipped, delivered, or already cancelled orders cannot be cancelled.
   */
  public static readonly CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed'];

  /**
   * Retrieves paginated order history strictly scoped to the authenticated customer.
   */
  static async getCustomerOrders(
    userId: string,
    params: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
      sortBy?: 'created_at' | 'total_amount';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<PaginatedResult<OrderSummary>> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 10));
    const offset = (page - 1) * limit;
    const sortBy = params.sortBy || 'created_at';
    const sortOrder = params.sortOrder || 'desc';

    // 1. Build count query
    let countQuery = client
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (params.status) {
      countQuery = countQuery.eq('status', params.status);
    }

    const { count, error: countErr } = await countQuery;
    if (countErr) {
      logger.error('Failed to count customer orders', { error: countErr.message, userId });
      throw new InternalServerError('Unable to query customer orders.');
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    if (total === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    }

    // 2. Fetch paginated orders with order items count & quantity
    let query = client
      .from('orders')
      .select(
        `
        id,
        order_number,
        status,
        payment_method,
        payment_status,
        currency,
        subtotal,
        total_amount,
        shipping_address_snapshot,
        created_at,
        updated_at,
        order_items(id, quantity)
      `
      )
      .eq('user_id', userId);

    if (params.status) {
      query = query.eq('status', params.status);
    }

    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: rows, error: queryErr } = await query;
    if (queryErr) {
      logger.error('Failed to query customer orders', { error: queryErr.message, userId });
      throw new InternalServerError('Unable to retrieve customer orders.');
    }

    const deliveryFees = await getDeliveryFeesByOrderIds(client, (rows || []).map((row: any) => row.id));
    const items: OrderSummary[] = (rows || []).map((row: any) => {
      const orderItems = Array.isArray(row.order_items) ? row.order_items : [];
      const totalQuantity = orderItems.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0);
      const invoiceData = row.shipping_address_snapshot?._invoice;
      const deliveryFee = deliveryFees.get(row.id) || 0;

      return {
        id: row.id,
        orderNumber: row.order_number,
        status: row.status as OrderStatus,
        paymentMethod: 'cod',
        paymentStatus: row.payment_status as PaymentStatus,
        currency: row.currency || 'INR',
        itemCount: orderItems.length,
        totalQuantity,
        subtotal: Number(row.subtotal),
        totalAmount: Number(row.total_amount),
        deliveryFee,
        totalPayable: Number(row.total_amount) + deliveryFee,
        invoiceUrl: invoiceData?.url || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

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
   * Retrieves single order details strictly scoped to customer, with immutable order items,
   * address snapshot, and full status history.
   */
  static async getCustomerOrderById(orderId: string, userId: string): Promise<OrderDetailsResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // Fetch order enforcing user ownership
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found.');
    }

    // Fetch order items (immutable historical snapshot)
    const { data: rawItems, error: itemsErr } = await client
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (itemsErr) {
      logger.error('Failed to query order items', { error: itemsErr.message, orderId });
      throw new InternalServerError('Failed to retrieve order items.');
    }

    // Fetch order status history in chronological order
    const { data: rawHistory, error: historyErr } = await client
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (historyErr) {
      logger.error('Failed to query order status history', { error: historyErr.message, orderId });
      throw new InternalServerError('Failed to retrieve order status history.');
    }

    const deliveryFee = await getDeliveryFeeByOrderId(client, orderId);
    const items: OrderItemRecord[] = (rawItems || []).map((row: any) => ({
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

    const statusHistory: OrderStatusHistoryItem[] = (rawHistory || []).map((h: any) => ({
      id: h.id,
      orderId: h.order_id,
      previousStatus: h.previous_status || null,
      newStatus: h.new_status,
      actorId: h.actor_id || null,
      reason: h.reason || null,
      createdAt: h.created_at,
    }));

    const canCancel = this.CANCELLABLE_STATUSES.includes(order.status as OrderStatus);
    const invoiceData = (order.shipping_address_snapshot as any)?._invoice;

    return {
      id: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      status: order.status as OrderStatus,
      paymentMethod: 'cod',
      paymentStatus: order.payment_status as PaymentStatus,
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
      invoiceUrl: invoiceData?.url || null,
      invoiceFileName: invoiceData?.fileName || null,
      invoiceUploadedAt: invoiceData?.uploadedAt || null,
      items,
      statusHistory,
      canCancel,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      deliveryOtp: order.delivery_otp_ciphertext ? decryptDeliveryOtp(order.delivery_otp_ciphertext) : null,
    };
  }

  /**
   * Retrieves status tracking details and chronological history for an order.
   */
  static async getOrderStatusTracking(orderId: string, userId: string): Promise<OrderStatusTrackingResponse> {
    const details = await this.getCustomerOrderById(orderId, userId);

    return {
      orderId: details.id,
      orderNumber: details.orderNumber,
      currentStatus: details.status,
      paymentMethod: 'cod',
      paymentStatus: details.paymentStatus,
      deliveryFee: details.deliveryFee || 0,
      totalPayable: details.totalPayable || details.totalAmount,
      canCancel: details.canCancel,
      history: details.statusHistory,
      shippingAddress: details.shippingAddress,
      invoiceUrl: details.invoiceUrl,
      invoiceFileName: details.invoiceFileName,
      invoiceUploadedAt: details.invoiceUploadedAt,
      createdAt: details.createdAt,
      updatedAt: details.updatedAt,
    };
  }

  /**
   * Cancels a customer order if in an eligible status ('pending' or 'confirmed').
   * Atomically transitions status to 'cancelled', updates COD payment status,
   * records status history, and restores deducted inventory at most once.
   */
  static async cancelOrder(
    orderId: string,
    userId: string,
    reason: string = 'Cancelled by customer'
  ): Promise<OrderDetailsResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Attempt cancellation via atomic PostgreSQL function
    try {
      const { data: rpcResult, error: rpcErr } = await client.rpc('cancel_customer_order', {
        p_order_id: orderId,
        p_user_id: userId,
        p_reason: reason,
      });

      if (!rpcErr && rpcResult) {
        if (!rpcResult.success) {
          if (rpcResult.code === 'ORDER_NOT_FOUND') {
            throw new NotFoundError(rpcResult.message || 'Order not found.');
          }
          if (rpcResult.code === 'CANCELLATION_NOT_ALLOWED') {
            throw new BadRequestError(rpcResult.message || 'Order cannot be cancelled in its current status.');
          }
          throw new BadRequestError(rpcResult.message || 'Unable to cancel order.');
        }

        // Return refreshed order details
        return this.getCustomerOrderById(orderId, userId);
      }
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof BadRequestError) {
        throw err;
      }
      logger.warn('RPC cancel_customer_order unavailable or failed, applying coordinated cancellation', {
        orderId,
        error: (err as any)?.message,
      });
    }

    // 2. Coordinated Fallback Cancellation (when RPC is not applied in local/test database)
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found.');
    }

    // Idempotent guard
    if (order.status === 'cancelled') {
      return this.getCustomerOrderById(orderId, userId);
    }

    if (!this.CANCELLABLE_STATUSES.includes(order.status as OrderStatus)) {
      throw new BadRequestError(
        `Order cannot be cancelled in "${order.status}" status. Orders in processing, shipped, or delivered states cannot be cancelled.`
      );
    }

    // A. Update order status and payment status
    const newPaymentStatus = order.payment_status === 'pending' ? 'cancelled' : order.payment_status;
    const { error: updateErr } = await client
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: newPaymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('status', order.status); // Optimistic concurrency lock

    if (updateErr) {
      logger.error('Failed to update order status during cancellation', { error: updateErr.message, orderId });
      throw new InternalServerError('Failed to cancel order.');
    }

    // B. Record status history
    await client.from('order_status_history').insert({
      order_id: orderId,
      previous_status: order.status,
      new_status: 'cancelled',
      actor_id: userId,
      reason,
      created_at: new Date().toISOString(),
    });

    // C. Restore inventory for order items exactly once
    const { data: items } = await client
      .from('order_items')
      .select('product_id, variant_id, quantity')
      .eq('order_id', orderId);

    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.product_id) continue;

        let invQuery = client.from('inventory').select('id, quantity_available').eq('product_id', item.product_id);
        if (item.variant_id) {
          invQuery = invQuery.eq('variant_id', item.variant_id);
        } else {
          invQuery = invQuery.is('variant_id', null);
        }

        const { data: invRow } = await invQuery.single();
        if (invRow) {
          const restoredQty = Number(invRow.quantity_available || 0) + Number(item.quantity || 0);
          await client
            .from('inventory')
            .update({
              quantity_available: restoredQty,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invRow.id);
        }
      }
    }

    logger.info('Customer order cancelled successfully and inventory restored', { orderId, userId });
    return this.getCustomerOrderById(orderId, userId);
  }
}
