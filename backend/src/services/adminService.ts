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

export class AdminService {
  /**
   * Allowed state transitions for store administrators
   */
  public static readonly ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    confirmed: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    processing: ['confirmed', 'shipped', 'delivered', 'cancelled'],
    shipped: ['processing', 'delivered', 'cancelled'],
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
      .select('id, order_number, status, payment_method, payment_status, currency, subtotal, total_amount, created_at, updated_at')
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

      // COD payment status metrics
      if (ord.payment_method === 'cod') {
        if (ord.payment_status === 'paid') {
          collectedCodRevenue += totalAmt;
        } else if (ord.payment_status === 'pending' && st !== 'cancelled') {
          pendingCodRevenue += totalAmt;
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
      shippingAddress: order.shipping_address_snapshot,
      customerNotes: order.customer_notes || null,
      invoiceUrl: invoiceData?.url || null,
      invoiceFileName: invoiceData?.fileName || null,
      invoiceUploadedAt: invoiceData?.uploadedAt || null,
      items,
      statusHistory,
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

    return this.getAdminOrderById(orderId);
  }

  /**
   * Records cash collection for a COD order.
   * Strictly verifies that the order uses COD and payment is pending.
   */
  static async collectCodPayment(
    orderId: string,
    adminId: string,
    notes?: string
  ): Promise<OrderDetailsResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new NotFoundError('Order not found.');

    if (order.payment_method !== 'cod') {
      throw new BadRequestError('Only Cash on Delivery (COD) orders support manual cash collection recording.');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestError('Cannot collect payment for a cancelled order.');
    }

    if (order.payment_status === 'paid') {
      throw new BadRequestError('COD payment for this order has already been recorded as paid.');
    }

    const { error: updateErr } = await client
      .from('orders')
      .update({
        payment_status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('payment_status', 'pending');

    if (updateErr) {
      logger.error('Failed to record COD payment', { error: updateErr.message, orderId });
      throw new InternalServerError('Failed to record COD payment collection.');
    }

    // Audit log
    await AuditLogService.logAction({
      actorId: adminId,
      action: 'COLLECT_COD_PAYMENT',
      resourceType: 'order',
      resourceId: orderId,
      details: {
        collectedAmount: Number(order.total_amount),
        currency: order.currency || 'INR',
        notes: notes || null,
      },
    });

    logger.info('COD cash payment successfully recorded by admin', { orderId, adminId, total: order.total_amount });
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
    role?: 'customer' | 'admin';
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
}
