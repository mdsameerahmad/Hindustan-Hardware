import { getSupabaseAdminClient, getSupabaseClient } from '../config/supabase';
import {
  BadRequestError,
  NotFoundError,
  InternalServerError,
} from '../common/errors';
import {
  AdminDashboardStats,
  InventoryMovementRecord,
  OrderSummary,
  OrderDetailsResponse,
  OrderStatus,
  PaymentStatus,
  PaginatedResult,
  AdminCustomerRecord,
  AuditLogRecord,
  OrderItemRecord,
  OrderStatusHistoryItem,
} from '../types';
import { logger } from '../common/utils/logger';
import { AuditLogService } from './auditLogService';
import { broadcastOrderStatus } from '../common/socket/trackingSocket';
import { HINDUSTAN_HARDWARE_STORE } from '../config/store';
import { randomUUID } from 'crypto';

function getOrderPaymentAmounts(order: {
  total_amount: unknown;
  amount_collected?: unknown;
  payment_status?: string;
  status?: string;
}): { amountCollected: number; amountDue: number } {
  const totalAmount = Math.max(0, Number(order.total_amount) || 0);
  const recordedAmount = order.amount_collected == null
    ? (order.payment_status === 'paid' ? totalAmount : 0)
    : Number(order.amount_collected) || 0;
  const amountCollected = Math.round(Math.min(Math.max(recordedAmount, 0), totalAmount) * 100) / 100;
  const amountDue = order.status === 'cancelled' || order.payment_status === 'cancelled'
    ? 0
    : Math.round(Math.max(totalAmount - amountCollected, 0) * 100) / 100;

  return { amountCollected, amountDue };
}

export class AdminService {
  /**
   * Allowed state transitions for store administrators
   */
  public static readonly ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: ['confirmed', 'processing', 'shipped', 'cancelled'],
    confirmed: ['pending', 'processing', 'shipped', 'cancelled'],
    processing: ['confirmed', 'shipped', 'cancelled'],
    shipped: ['processing', 'cancelled'],
    delivered: [], // Final terminal state
    cancelled: [], // Final terminal state
  };

  /**
   * Retrieves live, database-derived business metrics for the admin dashboard.
   */
  static async getDashboardStats(): Promise<AdminDashboardStats> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Total Customers
    const { count: customerCount } = await client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'customer');

    // 2. Products Counts
    const { count: totalProducts } = await client
      .from('products')
      .select('id', { count: 'exact', head: true });

    const { count: activeProducts } = await client
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    // Low stock count (threshold < 10)
    const { count: lowStockCount } = await client
      .from('inventory')
      .select('id', { count: 'exact', head: true })
      .lt('quantity_available', 10);

    // 3. Categories & Brands Counts
    const { count: categoryCount } = await client
      .from('categories')
      .select('id', { count: 'exact', head: true });

    const { count: brandCount } = await client
      .from('brands')
      .select('id', { count: 'exact', head: true });

    // 4. Orders Counts & Aggregation
    const { data: allOrders, error: orderErr } = await client
      .from('orders')
      .select('id, order_number, status, payment_method, payment_status, currency, subtotal, total_amount, amount_collected, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (orderErr) {
      logger.error('Failed to query orders for dashboard', { error: orderErr.message });
      throw new InternalServerError('Failed to retrieve order statistics.');
    }

    const orders = allOrders || [];
    const totalOrders = orders.length;

    const byStatus: Record<OrderStatus, number> = {
      pending: 0,
      confirmed: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };

    let totalOrderValue = 0;
    let collectedCodRevenue = 0;
    let pendingCodRevenue = 0;
    let pendingFulfillment = 0;
    let awaitingCodCollection = 0;

    for (const ord of orders) {
      const st = ord.status as OrderStatus;
      if (byStatus[st] !== undefined) {
        byStatus[st]++;
      }

      const totalAmt = Number(ord.total_amount) || 0;

      // Exclude cancelled orders from total order value
      if (st !== 'cancelled') {
        totalOrderValue += totalAmt;
      }

      // Track pending fulfillment
      if (['pending', 'confirmed', 'processing', 'shipped'].includes(st)) {
        pendingFulfillment++;
      }

      if (ord.payment_method === 'cod') {
        const paymentAmounts = getOrderPaymentAmounts(ord);
        collectedCodRevenue += paymentAmounts.amountCollected;
        pendingCodRevenue += paymentAmounts.amountDue;
        if (paymentAmounts.amountDue > 0) {
          awaitingCodCollection++;
        }
      }
    }

    // 5. Recent 5 orders
    const recentOrders: OrderSummary[] = orders.slice(0, 5).map((row: any) => ({
      id: row.id,
      orderNumber: row.order_number,
      status: row.status as OrderStatus,
      paymentMethod: 'cod',
      paymentStatus: row.payment_status as PaymentStatus,
      ...getOrderPaymentAmounts(row),
      currency: row.currency || 'INR',
      itemCount: 0,
      totalQuantity: 0,
      subtotal: Number(row.subtotal),
      totalAmount: Number(row.total_amount),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      customers: {
        total: customerCount || 0,
      },
      products: {
        total: totalProducts || 0,
        active: activeProducts || 0,
        lowStock: lowStockCount || 0,
      },
      catalogue: {
        categories: categoryCount || 0,
        brands: brandCount || 0,
      },
      orders: {
        total: totalOrders,
        byStatus,
        pendingFulfillment,
        awaitingCodCollection,
      },
      financials: {
        totalOrderValue: Math.round(totalOrderValue * 100) / 100,
        collectedCodRevenue: Math.round(collectedCodRevenue * 100) / 100,
        pendingCodRevenue: Math.round(pendingCodRevenue * 100) / 100,
        totalAmountCollected: Math.round(collectedCodRevenue * 100) / 100,
        totalAmountDue: Math.round(pendingCodRevenue * 100) / 100,
        currency: 'INR',
      },
      recentOrders,
    };
  }

  /**
   * Lists orders for store administration with advanced filtering and pagination.
   */
  static async listAdminOrders(params: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    userId?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: 'created_at' | 'total_amount' | 'order_number';
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<OrderSummary>> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 10));
    const offset = (page - 1) * limit;
    const sortBy = params.sortBy || 'created_at';
    const sortOrder = params.sortOrder || 'desc';

    let countQuery = client.from('orders').select('id', { count: 'exact', head: true });
    let query = client.from('orders').select(
      `
      id,
      order_number,
      status,
      payment_method,
      payment_status,
      amount_collected,
      currency,
      subtotal,
      total_amount,
      shipping_address_snapshot,
      created_at,
      updated_at,
      order_items(id, quantity)
    `
    );

    if (params.status) {
      countQuery = countQuery.eq('status', params.status);
      query = query.eq('status', params.status);
    }
    if (params.paymentStatus) {
      countQuery = countQuery.eq('payment_status', params.paymentStatus);
      query = query.eq('payment_status', params.paymentStatus);
    }
    if (params.userId) {
      countQuery = countQuery.eq('user_id', params.userId);
      query = query.eq('user_id', params.userId);
    }
    if (params.startDate) {
      countQuery = countQuery.gte('created_at', params.startDate);
      query = query.gte('created_at', params.startDate);
    }
    if (params.endDate) {
      countQuery = countQuery.lte('created_at', params.endDate);
      query = query.lte('created_at', params.endDate);
    }

    const { count, error: countErr } = await countQuery;
    if (countErr) {
      logger.error('Failed to count admin orders', { error: countErr.message });
      throw new InternalServerError('Unable to count orders.');
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) {
      logger.error('Failed to query admin orders', { error: rowsErr.message });
      throw new InternalServerError('Unable to retrieve orders.');
    }

    const items: OrderSummary[] = (rows || []).map((row: any) => {
      const orderItems = Array.isArray(row.order_items) ? row.order_items : [];
      const totalQuantity = orderItems.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 0), 0);
      const invoiceData = row.shipping_address_snapshot?._invoice;

      return {
        id: row.id,
        orderNumber: row.order_number,
        status: row.status as OrderStatus,
        paymentMethod: 'cod',
        paymentStatus: row.payment_status as PaymentStatus,
        ...getOrderPaymentAmounts(row),
        currency: row.currency || 'INR',
        itemCount: orderItems.length,
        totalQuantity,
        subtotal: Number(row.subtotal),
        totalAmount: Number(row.total_amount),
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
   * Retrieves full order details for administrative review.
   */
  static async getAdminOrderById(orderId: string): Promise<OrderDetailsResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found.');
    }

    const { data: rawItems } = await client
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    const { data: rawHistory } = await client
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    const { data: rawCollections, error: collectionsErr } = await client
      .from('order_payment_collections')
      .select('id, amount, method, notes, actor_id, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (collectionsErr) {
      logger.error('Failed to retrieve order payment collection history', {
        error: collectionsErr.message,
        orderId,
      });
      throw new InternalServerError(
        'Unable to retrieve payment history. Verify that migration 016_partial_order_payment_collection.sql has been applied.'
      );
    }

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

    const paymentCollections = (rawCollections || []).map((collection: any) => ({
      id: collection.id,
      amount: Number(collection.amount),
      method: collection.method as 'cash' | 'online',
      notes: collection.notes || null,
      actorId: collection.actor_id || null,
      createdAt: collection.created_at,
    }));

    const invoiceData = (order.shipping_address_snapshot as any)?._invoice;

    return {
      id: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      status: order.status as OrderStatus,
      paymentMethod: 'cod',
      paymentStatus: order.payment_status as PaymentStatus,
      ...getOrderPaymentAmounts(order),
      currency: order.currency || 'INR',
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount || 0),
      taxAmount: Number(order.tax_amount || 0),
      shippingAmount: Number(order.shipping_amount || 0),
      totalAmount: Number(order.total_amount),
      shippingAddress: order.shipping_address_snapshot,
      customerNotes: order.customer_notes || null,
      invoiceUrl: invoiceData?.url || null,
      invoiceFileName: invoiceData?.fileName || null,
      invoiceUploadedAt: invoiceData?.uploadedAt || null,
      items,
      statusHistory,
      paymentCollections,
      canCancel: ['pending', 'confirmed'].includes(order.status),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  /**
   * Uploads or re-uploads an order invoice PDF / document to Supabase storage
   * and saves the invoice metadata inside the order record.
   */
  static async uploadOrderInvoice(
    orderId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    adminId: string
  ): Promise<OrderDetailsResponse> {
    const adminClient = getSupabaseAdminClient() || getSupabaseClient();
    if (!adminClient) throw new InternalServerError('Administrative client is unavailable.');

    const { data: order, error: orderErr } = await adminClient
      .from('orders')
      .select('id, order_number, shipping_address_snapshot')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found.');
    }

    // Determine extension
    let ext = 'pdf';
    const lowerName = originalName.toLowerCase();
    if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') ext = 'pdf';
    else if (lowerName.endsWith('.png') || mimeType === 'image/png') ext = 'png';
    else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || mimeType === 'image/jpeg') ext = 'jpg';
    else if (lowerName.endsWith('.webp') || mimeType === 'image/webp') ext = 'webp';

    const timestamp = Date.now();
    const safeOrderNum = (order.order_number || orderId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePath = `invoices/${orderId}/invoice-${safeOrderNum}-${timestamp}.${ext}`;

    const { error: uploadErr } = await adminClient.storage
      .from('product-images')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType || 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      logger.error('Failed to upload invoice to Supabase Storage', { error: uploadErr.message, storagePath });
      throw new InternalServerError(`Failed to upload invoice file: ${uploadErr.message}`);
    }

    const { data: pubData } = adminClient.storage.from('product-images').getPublicUrl(storagePath);
    const invoiceUrl = pubData?.publicUrl || storagePath;

    const existingSnapshot = (order.shipping_address_snapshot as Record<string, any>) || {};
    const updatedSnapshot = {
      ...existingSnapshot,
      _invoice: {
        url: invoiceUrl,
        storagePath,
        fileName: originalName || `invoice-${order.order_number}.${ext}`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: adminId,
      },
    };

    const { error: updateErr } = await adminClient
      .from('orders')
      .update({
        shipping_address_snapshot: updatedSnapshot,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateErr) {
      logger.error('Failed to update order with invoice metadata', { error: updateErr.message, orderId });
      throw new InternalServerError('Failed to save invoice record on order.');
    }

    // Audit log
    await AuditLogService.logAction({
      actorId: adminId,
      action: 'UPDATE_PRODUCT',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        invoiceUrl,
        fileName: originalName,
        actionName: 'UPLOAD_INVOICE',
      },
    });

    logger.info('Invoice uploaded and linked to order successfully', { orderId, invoiceUrl });
    return this.getAdminOrderById(orderId);
  }

  /**
   * Updates an order's status enforcing valid transitions, logging audit trails,
   * and releasing inventory if transitioning to 'cancelled'.
   */
  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    adminId: string,
    reason?: string
  ): Promise<OrderDetailsResponse> {
    if (newStatus === 'delivered') {
      throw new BadRequestError('Customer delivery OTP verification is required to mark an order delivered.');
    }

    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found.');

    const currentStatus = order.status as OrderStatus;
    if (currentStatus === newStatus) {
      return this.getAdminOrderById(orderId);
    }

    const allowed = this.ALLOWED_ORDER_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestError(
        `Invalid status transition from "${currentStatus}" to "${newStatus}". Allowed transitions: [${allowed.join(', ')}]`
      );
    }

    // If transitioning to cancelled, execute cancellation flow to restore inventory exactly once
    if (newStatus === 'cancelled') {
      const { data: items } = await client
        .from('order_items')
        .select('product_id, variant_id, quantity')
        .eq('order_id', orderId);

      if (Array.isArray(items)) {
        for (const it of items) {
          if (!it.product_id) continue;
          await this.adjustInventoryStock({
            productId: it.product_id,
            variantId: it.variant_id,
            quantityChange: it.quantity,
            movementType: 'order_cancellation',
            reason: reason || 'Restored due to admin order cancellation',
            actorId: adminId,
            referenceId: orderId,
          });
        }
      }
    }

    // Update status in orders table
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'cancelled' && order.payment_status === 'pending') {
      updatePayload.payment_status = 'cancelled';
    }

    const { error: updateErr } = await client
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);

    if (updateErr) {
      logger.error('Failed to update order status', { error: updateErr.message, orderId });
      throw new InternalServerError('Unable to update order status.');
    }

    // Log status history
    await client.from('order_status_history').insert({
      order_id: orderId,
      previous_status: currentStatus,
      new_status: newStatus,
      actor_id: adminId,
      reason: reason || `Status updated to ${newStatus} by administrator`,
      created_at: new Date().toISOString(),
    });

    // Record audit log
    await AuditLogService.logAction({
      actorId: adminId,
      action: 'ORDER_STATUS_UPDATE',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        previousStatus: currentStatus,
        newStatus,
        reason: reason || null,
      },
    });

    // Real-time broadcast to connected order room subscribers (instant user tracking update without refresh)
    try {
      broadcastOrderStatus({
        orderId,
        orderNumber: order.order_number,
        status: newStatus,
        previousStatus: currentStatus,
        reason: reason || null,
        timestamp: new Date().toISOString(),
      });
    } catch (broadcastErr) {
      logger.warn('Failed to broadcast order status update to socket room', {
        error: broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr),
        orderId,
      });
    }

    return this.getAdminOrderById(orderId);
  }

  /**
   * Records an atomic partial or full payment collection for a COD order.
   */
  static async collectCodPayment(
    orderId: string,
    adminId: string,
    amount: number,
    method: 'cash' | 'online',
    notes?: string
  ): Promise<OrderDetailsResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: result, error: collectionErr } = await client.rpc('record_order_payment_collection', {
      p_order_id: orderId,
      p_amount: amount,
      p_method: method,
      p_actor_id: adminId,
      p_notes: notes || null,
    });

    if (collectionErr) {
      logger.error('Failed to record order payment collection', { error: collectionErr.message, orderId });
      throw new InternalServerError(
        'Failed to record payment collection. Verify that migration 016_partial_order_payment_collection.sql has been applied.'
      );
    }

    if (!result?.success) {
      switch (result?.code) {
        case 'ORDER_NOT_FOUND':
          throw new NotFoundError('Order not found.');
        case 'AMOUNT_EXCEEDS_DUE':
          throw new BadRequestError(`Amount exceeds the remaining balance of ${result.amountDue}.`);
        case 'ORDER_CANCELLED':
          throw new BadRequestError('Cannot collect payment for a cancelled order.');
        case 'PAYMENT_COMPLETE':
          throw new BadRequestError('This order has no remaining balance.');
        case 'UNSUPPORTED_PAYMENT_METHOD':
          throw new BadRequestError('Only Cash on Delivery orders support manual payment recording.');
        default:
          throw new BadRequestError('Unable to record this payment. Check the amount and payment method.');
      }
    }

    // Audit log
    await AuditLogService.logAction({
      actorId: adminId,
      action: 'COLLECT_COD_PAYMENT',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        collectedAmount: amount,
        collectionMethod: method,
        notes: notes || null,
      },
    });

    logger.info('Order payment collection successfully recorded by admin', {
      orderId,
      adminId,
      amount,
      method,
      amountDue: result.amountDue,
    });
    return this.getAdminOrderById(orderId);
  }

  /**
   * Adjusts stock for a product or variant atomically and logs the inventory movement.
   */
  static async adjustInventoryStock(params: {
    productId: string;
    variantId?: string | null;
    quantityChange: number;
    movementType: 'adjustment' | 'restock' | 'correction' | 'order_deduction' | 'order_cancellation' | 'return';
    reason: string;
    actorId: string;
    referenceId?: string | null;
  }): Promise<{ id: string; productId: string; variantId: string | null; quantityAvailable: number }> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Try atomic database function if available
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('adjust_inventory_stock', {
        p_product_id: params.productId,
        p_variant_id: params.variantId || null,
        p_quantity_change: params.quantityChange,
        p_movement_type: params.movementType,
        p_reason: params.reason,
        p_actor_id: params.actorId,
        p_reference_id: params.referenceId || null,
      });

      if (!rpcErr && rpcData) {
        if (!rpcData.success) {
          if (rpcData.code === 'INVENTORY_NOT_FOUND') {
            throw new NotFoundError(rpcData.message || 'Inventory record not found.');
          }
          if (rpcData.code === 'INSUFFICIENT_STOCK') {
            throw new BadRequestError(rpcData.message || 'Stock cannot be negative.');
          }
          throw new BadRequestError(rpcData.message || 'Inventory adjustment failed.');
        }

        await AuditLogService.logAction({
          actorId: params.actorId,
          action: 'INVENTORY_ADJUSTMENT',
          resourceType: 'inventory',
          resourceId: rpcData.inventory_id,
          details: {
            productId: params.productId,
            variantId: params.variantId || null,
            quantityChange: params.quantityChange,
            quantityBefore: rpcData.quantity_before,
            quantityAfter: rpcData.quantity_after,
            reason: params.reason,
          },
        });

        return {
          id: rpcData.inventory_id,
          productId: params.productId,
          variantId: params.variantId || null,
          quantityAvailable: rpcData.quantity_after,
        };
      }
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof BadRequestError) throw err;
      logger.warn('RPC adjust_inventory_stock fallback to coordinated adjustment', { error: (err as any)?.message });
    }

    // 2. Coordinated Fallback for local / mock environments
    let invQuery = client.from('inventory').select('*').eq('product_id', params.productId);
    if (params.variantId) {
      invQuery = invQuery.eq('variant_id', params.variantId);
    } else {
      invQuery = invQuery.is('variant_id', null);
    }

    const { data: invRow, error: invErr } = await invQuery.single();
    if (invErr || !invRow) {
      throw new NotFoundError('Inventory record not found.');
    }

    const currentQty = Number(invRow.quantity_available);
    const newQty = currentQty + params.quantityChange;
    if (newQty < 0) {
      throw new BadRequestError(`Adjustment results in negative stock. Current stock is ${currentQty}.`);
    }

    const { data: updatedInv, error: updateErr } = await client
      .from('inventory')
      .update({
        quantity_available: newQty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invRow.id)
      .select('id, product_id, variant_id, quantity_available')
      .single();

    if (updateErr || !updatedInv) {
      logger.error('Failed to update inventory', { error: updateErr?.message });
      throw new InternalServerError('Failed to update inventory stock.');
    }

    // Insert movement record
    await client.from('inventory_movements').insert({
      product_id: params.productId,
      variant_id: params.variantId || null,
      movement_type: params.movementType,
      quantity_change: params.quantityChange,
      quantity_before: currentQty,
      quantity_after: newQty,
      reason: params.reason,
      actor_id: params.actorId,
      reference_id: params.referenceId || null,
      created_at: new Date().toISOString(),
    });

    // Record audit log
    await AuditLogService.logAction({
      actorId: params.actorId,
      action: 'INVENTORY_ADJUSTMENT',
      resourceType: 'inventory',
      resourceId: invRow.id,
      details: {
        productId: params.productId,
        variantId: params.variantId || null,
        quantityChange: params.quantityChange,
        quantityBefore: currentQty,
        quantityAfter: newQty,
        reason: params.reason,
      },
    });

    return {
      id: updatedInv.id,
      productId: updatedInv.product_id,
      variantId: updatedInv.variant_id,
      quantityAvailable: Number(updatedInv.quantity_available),
    };
  }

  /**
   * Lists inventory movements with filtering and pagination.
   */
  static async listInventoryMovements(params: {
    page?: number;
    limit?: number;
    productId?: string;
    variantId?: string;
    movementType?: string;
  }): Promise<PaginatedResult<InventoryMovementRecord>> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    let countQuery = client.from('inventory_movements').select('id', { count: 'exact', head: true });
    let query = client.from('inventory_movements').select(
      `
      id,
      product_id,
      variant_id,
      movement_type,
      quantity_change,
      quantity_before,
      quantity_after,
      reason,
      actor_id,
      reference_id,
      created_at,
      product:products(name),
      variant:product_variants(name)
    `
    );

    if (params.productId) {
      countQuery = countQuery.eq('product_id', params.productId);
      query = query.eq('product_id', params.productId);
    }
    if (params.variantId) {
      countQuery = countQuery.eq('variant_id', params.variantId);
      query = query.eq('variant_id', params.variantId);
    }
    if (params.movementType) {
      countQuery = countQuery.eq('movement_type', params.movementType);
      query = query.eq('movement_type', params.movementType);
    }

    const { count } = await countQuery;
    const total = count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, error } = await query;
    if (error) {
      logger.error('Failed to list inventory movements', { error: error.message });
      throw new InternalServerError('Unable to query inventory movements.');
    }

    const items: InventoryMovementRecord[] = (rows || []).map((r: any) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product?.name,
      variantId: r.variant_id,
      variantTitle: r.variant?.name,
      movementType: r.movement_type,
      quantityChange: Number(r.quantity_change),
      quantityBefore: Number(r.quantity_before),
      quantityAfter: Number(r.quantity_after),
      reason: r.reason,
      actorId: r.actor_id,
      referenceId: r.reference_id,
      createdAt: r.created_at,
    }));

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
   * Lists registered customer accounts with aggregate metrics.
   */
  static async listCustomers(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: 'customer' | 'admin' | 'staff' | 'delivery_partner';
  }): Promise<PaginatedResult<AdminCustomerRecord>> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 10));
    const offset = (page - 1) * limit;

    let countQuery = client.from('profiles').select('id', { count: 'exact', head: true });
    let query = client.from('profiles').select(
      `
      id,
      role,
      full_name,
      phone,
      avatar_url,
      created_at,
      updated_at,
      orders(id, total_amount, status)
    `
    );

    if (params.role) {
      countQuery = countQuery.eq('role', params.role);
      query = query.eq('role', params.role);
    }
    if (params.search) {
      countQuery = countQuery.ilike('full_name', `%${params.search}%`);
      query = query.ilike('full_name', `%${params.search}%`);
    }

    const { count } = await countQuery;
    const total = count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, error } = await query;
    if (error) {
      logger.error('Failed to list customers', { error: error.message });
      throw new InternalServerError('Unable to query customers.');
    }

    const items: AdminCustomerRecord[] = (rows || []).map((r: any) => {
      const orders = Array.isArray(r.orders) ? r.orders : [];
      const nonCancelledOrders = orders.filter((o: any) => o.status !== 'cancelled');
      const totalSpent = nonCancelledOrders.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);

      return {
        id: r.id,
        email: null, // Protected Supabase Auth field, never exposed via database row
        fullName: r.full_name || 'Customer',
        phone: r.phone || null,
        avatarUrl: r.avatar_url || null,
        role: r.role,
        orderCount: orders.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
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
   * Lists administrative audit logs with pagination and filters.
   */
  static async listAuditLogs(params: {
    page?: number;
    limit?: number;
    resourceType?: string;
    resourceId?: string;
    action?: string;
    actorId?: string;
  }): Promise<PaginatedResult<AuditLogRecord>> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    let countQuery = client.from('audit_logs').select('id', { count: 'exact', head: true });
    let query = client.from('audit_logs').select('*');

    if (params.resourceType) {
      countQuery = countQuery.eq('resource_type', params.resourceType);
      query = query.eq('resource_type', params.resourceType);
    }
    if (params.resourceId) {
      countQuery = countQuery.eq('resource_id', params.resourceId);
      query = query.eq('resource_id', params.resourceId);
    }
    if (params.action) {
      countQuery = countQuery.eq('action', params.action);
      query = query.eq('action', params.action);
    }
    if (params.actorId) {
      countQuery = countQuery.eq('actor_id', params.actorId);
      query = query.eq('actor_id', params.actorId);
    }

    const { count } = await countQuery;
    const total = count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, error } = await query;
    if (error) {
      logger.error('Failed to list audit logs', { error: error.message });
      throw new InternalServerError('Unable to query audit logs.');
    }

    const items: AuditLogRecord[] = (rows || []).map((r: any) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      details: r.details || {},
      ipAddress: r.ip_address || null,
      createdAt: r.created_at,
    }));

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
   * -------------------------------------------------------------
   * Delivery Partner Management (CRUD + Shop Coordinates Ingestion)
   * -------------------------------------------------------------
   */

  /**
   * Lists all delivery partners with their latest location and active assignment status.
   */
  static async listDeliveryPartners(params: {
    search?: string;
  }): Promise<any[]> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Query delivery partner profiles
    let query = client
      .from('profiles')
      .select('id, full_name, phone, role, avatar_url, created_at, updated_at')
      .in('role', ['delivery_partner', 'staff'])
      .order('created_at', { ascending: false });

    if (params.search) {
      query = query.or(`full_name.ilike.%${params.search}%,phone.ilike.%${params.search}%`);
    }

    const { data: directPartners, error } = await query;
    if (error) {
      logger.error('Failed to query delivery partners', { error: error.message });
      throw new InternalServerError('Unable to query delivery partners.');
    }

    // 2. Also check delivery_assignments to guarantee any partner who has had an assignment in DB is included
    const { data: assignmentPartners } = await client
      .from('delivery_assignments')
      .select('delivery_partner_id');

    const assignedPartnerIds = Array.from(
      new Set((assignmentPartners || []).map((a: any) => a.delivery_partner_id).filter(Boolean))
    );

    let allPartners = [...(directPartners || [])];
    const existingIds = new Set(allPartners.map((p: any) => p.id));

    if (assignedPartnerIds.length > 0) {
      const missingIds = assignedPartnerIds.filter((id) => !existingIds.has(id));
      if (missingIds.length > 0) {
        const { data: missingProfiles } = await client
          .from('profiles')
          .select('id, full_name, phone, role, avatar_url, created_at, updated_at')
          .in('id', missingIds);
        if (missingProfiles && missingProfiles.length > 0) {
          allPartners.push(...missingProfiles);
        }
      }
    }

    // Enrich with shop coordinates and active assignment count
    const enriched = await Promise.all(
      (allPartners || []).map(async (p: any) => {
        // Query active delivery assignment if any
        const { data: activeAssignment } = await client
          .from('delivery_assignments')
          .select('id, order_id, status, assigned_at')
          .eq('delivery_partner_id', p.id)
          .in('status', ['assigned', 'picked_up', 'out_for_delivery'])
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Check if there is an active delivery location recorded
        let latestLocation = null;
        if (activeAssignment?.id) {
          const { data: loc } = await client
            .from('delivery_locations')
            .select('latitude, longitude, accuracy, device_timestamp, server_received_at')
            .eq('delivery_assignment_id', activeAssignment.id)
            .maybeSingle();
          if (loc) {
            latestLocation = {
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude),
              accuracy: loc.accuracy != null ? Number(loc.accuracy) : null,
              deviceTimestamp: loc.device_timestamp,
              serverReceivedAt: loc.server_received_at,
            };
          }
        }

        return {
          id: p.id,
          fullName: p.full_name || 'Delivery Partner',
          phone: p.phone || '',
          role: p.role,
          avatarUrl: p.avatar_url || null,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          activeAssignment: activeAssignment
            ? {
                id: activeAssignment.id,
                orderId: activeAssignment.order_id,
                status: activeAssignment.status,
                assignedAt: activeAssignment.assigned_at,
              }
            : null,
          sourceCoordinates: {
            name: HINDUSTAN_HARDWARE_STORE.name,
            address: HINDUSTAN_HARDWARE_STORE.address,
            latitude: HINDUSTAN_HARDWARE_STORE.latitude,
            longitude: HINDUSTAN_HARDWARE_STORE.longitude,
          },
          currentLocation: latestLocation || {
            latitude: HINDUSTAN_HARDWARE_STORE.latitude,
            longitude: HINDUSTAN_HARDWARE_STORE.longitude,
            isOriginStore: true,
          },
        };
      })
    );

    return enriched;
  }

  /**
   * Creates a new delivery partner and ensures shop coordinates are assigned.
   */
  static async createDeliveryPartner(
    data: {
      fullName: string;
      phone: string;
      email?: string;
      avatarUrl?: string | null;
      password?: string;
    },
    actorId: string
  ): Promise<any> {
    const adminClient = getSupabaseAdminClient();
    const fallbackClient = getSupabaseClient();
    const client = adminClient || fallbackClient;
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const partnerEmail =
      data.email?.toLowerCase().trim() ||
      `partner.${data.phone.replace(/[^0-9]/g, '') || randomUUID().slice(0, 6)}@hindustanhardware.in`;
    const partnerPassword = data.password || 'Partner@123456';

    let userId: string = '';

    // If Supabase Admin Client is available, create auth.user
    if (adminClient?.auth?.admin) {
      try {
        const { data: usersData } = await adminClient.auth.admin.listUsers();
        const existing = (usersData?.users || []).find(
          (u) => u.email?.toLowerCase() === partnerEmail.toLowerCase()
        );

        if (existing) {
          userId = existing.id;
          await adminClient.auth.admin.updateUserById(userId, {
            password: partnerPassword,
            user_metadata: { full_name: data.fullName, phone: data.phone, avatar_url: data.avatarUrl || null },
          });
        } else {
          const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
            email: partnerEmail,
            password: partnerPassword,
            email_confirm: true,
            user_metadata: { full_name: data.fullName, phone: data.phone, avatar_url: data.avatarUrl || null },
          });
          if (createErr || !newUser.user) {
            throw new BadRequestError(createErr?.message || 'Failed to create partner auth user.');
          }
          userId = newUser.user.id;
        }
      } catch (authErr: any) {
        logger.warn('Auth admin creation error, checking direct profile insert', { error: authErr.message });
      }
    }

    if (!userId) {
      userId = randomUUID();
    }

    // Upsert delivery partner into public.profiles
    const now = new Date().toISOString();
    const { data: profile, error: profileErr } = await client
      .from('profiles')
      .upsert(
        {
          id: userId,
          role: 'delivery_partner',
          full_name: data.fullName.trim(),
          phone: data.phone.trim(),
          avatar_url: data.avatarUrl || null,
          updated_at: now,
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single();

    if (profileErr || !profile) {
      logger.error('Failed to create delivery partner profile', { error: profileErr?.message });
      throw new InternalServerError('Failed to save delivery partner in database.');
    }

    // Log administrative audit log
    await AuditLogService.logAction({
      actorId,
      action: 'DELIVERY_PARTNER_CREATE',
      resourceType: 'profiles',
      resourceId: profile.id,
      details: {
        fullName: profile.full_name,
        phone: profile.phone,
        avatarUrl: profile.avatar_url,
        email: partnerEmail,
        sourceLocation: {
          name: HINDUSTAN_HARDWARE_STORE.name,
          latitude: HINDUSTAN_HARDWARE_STORE.latitude,
          longitude: HINDUSTAN_HARDWARE_STORE.longitude,
        },
      },
    });

    return {
      id: profile.id,
      fullName: profile.full_name,
      phone: profile.phone,
      avatarUrl: profile.avatar_url,
      email: partnerEmail,
      role: profile.role,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
      sourceCoordinates: {
        name: HINDUSTAN_HARDWARE_STORE.name,
        address: HINDUSTAN_HARDWARE_STORE.address,
        latitude: HINDUSTAN_HARDWARE_STORE.latitude,
        longitude: HINDUSTAN_HARDWARE_STORE.longitude,
      },
      currentLocation: {
        latitude: HINDUSTAN_HARDWARE_STORE.latitude,
        longitude: HINDUSTAN_HARDWARE_STORE.longitude,
        isOriginStore: true,
      },
    };
  }

  /**
   * Updates an existing delivery partner.
   */
  static async updateDeliveryPartner(
    id: string,
    data: {
      fullName?: string;
      phone?: string;
      avatarUrl?: string | null;
    },
    actorId: string
  ): Promise<any> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (data.fullName !== undefined) updatePayload.full_name = data.fullName.trim();
    if (data.phone !== undefined) updatePayload.phone = data.phone.trim();
    if (data.avatarUrl !== undefined) updatePayload.avatar_url = data.avatarUrl;

    const { data: updated, error } = await client
      .from('profiles')
      .update(updatePayload)
      .eq('id', id)
      .eq('role', 'delivery_partner')
      .select('*')
      .single();

    if (error || !updated) {
      logger.error('Failed to update delivery partner', { error: error?.message, id });
      throw new NotFoundError('Delivery partner not found.');
    }

    // If partner has any active delivery assignments, update initial location
    const { data: activeAssignments } = await client
      .from('delivery_assignments')
      .select('id, order_id')
      .eq('delivery_partner_id', id)
      .in('status', ['assigned', 'picked_up', 'out_for_delivery']);

    if (activeAssignments && activeAssignments.length > 0) {
      const now = new Date().toISOString();
      for (const assignment of activeAssignments) {
        await client.from('delivery_locations').upsert(
          {
            delivery_assignment_id: assignment.id,
            order_id: assignment.order_id,
            latitude: HINDUSTAN_HARDWARE_STORE.latitude,
            longitude: HINDUSTAN_HARDWARE_STORE.longitude,
            accuracy: 10,
            device_timestamp: now,
            server_received_at: now,
          },
          { onConflict: 'delivery_assignment_id' }
        );
      }
    }

    await AuditLogService.logAction({
      actorId,
      action: 'DELIVERY_PARTNER_UPDATE',
      resourceType: 'profiles',
      resourceId: updated.id,
      details: updatePayload,
    });

    return {
      id: updated.id,
      fullName: updated.full_name,
      phone: updated.phone,
      role: updated.role,
      avatarUrl: updated.avatar_url,
      updatedAt: updated.updated_at,
      sourceCoordinates: {
        name: HINDUSTAN_HARDWARE_STORE.name,
        address: HINDUSTAN_HARDWARE_STORE.address,
        latitude: HINDUSTAN_HARDWARE_STORE.latitude,
        longitude: HINDUSTAN_HARDWARE_STORE.longitude,
      },
      currentLocation: {
        latitude: HINDUSTAN_HARDWARE_STORE.latitude,
        longitude: HINDUSTAN_HARDWARE_STORE.longitude,
        isOriginStore: true,
      },
    };
  }

  /**
   * Removes or demotes a delivery partner.
   */
  static async deleteDeliveryPartner(id: string, actorId: string): Promise<void> {
    const adminClient = getSupabaseAdminClient();
    const fallbackClient = getSupabaseClient();
    const client = adminClient || fallbackClient;
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // Check for active assignments
    const { count: activeCount } = await client
      .from('delivery_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('delivery_partner_id', id)
      .in('status', ['assigned', 'picked_up', 'out_for_delivery']);

    if (activeCount && activeCount > 0) {
      throw new BadRequestError('Cannot delete delivery partner with ongoing active delivery assignments.');
    }

    // Demote role to customer or delete if not bound to orders
    const { error: updateErr } = await client
      .from('profiles')
      .update({ role: 'customer', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) {
      logger.error('Failed to delete/demote delivery partner', { error: updateErr.message, id });
      throw new InternalServerError('Failed to delete delivery partner.');
    }

    await AuditLogService.logAction({
      actorId,
      action: 'DELIVERY_PARTNER_DELETE',
      resourceType: 'profiles',
      resourceId: id,
      details: { previousRole: 'delivery_partner', newRole: 'customer' },
    });
  }
}
