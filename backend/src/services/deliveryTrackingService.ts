import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
} from '../common/errors';
import {
  broadcastDeliveryLocation,
  broadcastDeliveryStatus,
  broadcastOrderStatus,
} from '../common/socket/trackingSocket';
import { logger } from '../common/utils/logger';
import { LocationUpdateInput } from '../common/validation/trackingSchemas';
import { env } from '../config/env';
import { getSupabaseAdminClient, getSupabaseClient } from '../config/supabase';
import {
  DeliveryAssignmentRecord,
  DeliveryAssignmentStatus,
  DeliveryLocationHistoryRecord,
  DeliveryLocationRecord,
  OrderLiveTrackingResponse,
  OrderStatus,
} from '../types';
import { RoadRoutingService } from './roadRoutingService';
import { ServiceabilityService } from './serviceabilityService';
import { hashDeliveryOtp } from './deliveryOtpService';
import { HINDUSTAN_HARDWARE_STORE } from '../config/store';

export function isLocationStale(
  serverReceivedAtOrDeviceTimestamp: string,
  thresholdSeconds: number = env.TRACKING_FRESHNESS_THRESHOLD_SECONDS
): boolean {
  const timeMs = new Date(serverReceivedAtOrDeviceTimestamp).getTime();
  if (isNaN(timeMs)) return true;
  const diffSeconds = (Date.now() - timeMs) / 1000;
  return diffSeconds > thresholdSeconds;
}

export class DeliveryTrackingService {
  /**
   * Derive whether a location timestamp is stale based on server-configured freshness threshold.
   */
  static isLocationStale = isLocationStale;

  /**
   * Create or reassign a delivery partner to an order (Admin / Staff operation).
   */
  static async assignDeliveryPartner(params: {
    orderId: string;
    deliveryPartnerId: string;
    actorId: string;
    deliveryFee: number;
    notes?: string | null;
  }): Promise<DeliveryAssignmentRecord> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Verify order exists
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('id, user_id, status')
      .eq('id', params.orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found.');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestError('Cannot assign delivery partner to a cancelled order.');
    }

    // 2. Verify delivery partner profile exists and is authorized (role: staff or delivery_partner or admin)
    const { data: partnerProfile, error: partnerErr } = await client
      .from('profiles')
      .select('id, role, full_name, phone, avatar_url')
      .eq('id', params.deliveryPartnerId)
      .single();

    if (partnerErr || !partnerProfile) {
      throw new NotFoundError('Delivery partner profile not found.');
    }

    if (!['delivery_partner', 'staff', 'admin'].includes(partnerProfile.role)) {
      throw new BadRequestError(
        `Assigned user has role '${partnerProfile.role}' which is not authorized for delivery assignments.`
      );
    }

    // 3. Cancel any previous active assignment for this order
    await client
      .from('delivery_assignments')
      .update({
        status: 'cancelled',
        notes: 'Superseded by new delivery partner assignment',
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', params.orderId)
      .in('status', ['assigned', 'picked_up', 'out_for_delivery']);

    // 4. Insert new assignment
    const now = new Date().toISOString();
    const { data: newAssignment, error: insertErr } = await client
      .from('delivery_assignments')
      .insert({
        order_id: params.orderId,
        delivery_partner_id: params.deliveryPartnerId,
        customer_id: order.user_id,
        status: 'assigned',
        delivery_fee: params.deliveryFee,
        notes: params.notes || null,
        assigned_at: now,
      })
      .select('*')
      .single();

    if (insertErr || !newAssignment) {
      logger.error('Failed to create delivery assignment', { error: insertErr?.message, orderId: params.orderId });
      throw new InternalServerError('Failed to create delivery assignment.');
    }

    // 5. Seed initial delivery location with the exact shop coordinates in the database
    // This guarantees tracking and routing immediately have valid coordinates from the store source.
    try {
      await client.from('delivery_locations').upsert(
        {
          delivery_assignment_id: newAssignment.id,
          order_id: newAssignment.order_id,
          latitude: HINDUSTAN_HARDWARE_STORE.latitude,
          longitude: HINDUSTAN_HARDWARE_STORE.longitude,
          accuracy: 10,
          speed: 0,
          heading: 0,
          device_timestamp: now,
          server_received_at: now,
        },
        { onConflict: 'delivery_assignment_id' }
      );
    } catch (locErr: any) {
      logger.warn('Initial shop location seeding warning', { error: locErr?.message, assignmentId: newAssignment.id });
    }

    return {
      id: newAssignment.id,
      orderId: newAssignment.order_id,
      deliveryPartnerId: newAssignment.delivery_partner_id,
      customerId: newAssignment.customer_id,
      status: newAssignment.status as DeliveryAssignmentStatus,
      deliveryFee: Number(newAssignment.delivery_fee) || 0,
      notes: newAssignment.notes,
      assignedAt: newAssignment.assigned_at,
      pickedUpAt: newAssignment.picked_up_at,
      completedAt: newAssignment.completed_at,
      createdAt: newAssignment.created_at,
      updatedAt: newAssignment.updated_at,
      deliveryPartner: {
        id: partnerProfile.id,
        fullName: partnerProfile.full_name,
        phone: partnerProfile.phone,
        avatarUrl: partnerProfile.avatar_url || null,
      },
    };
  }

  /**
   * Valid transition matrix for delivery assignments:
   * assigned -> picked_up | cancelled | failed
   * picked_up -> out_for_delivery | cancelled | failed
   * out_for_delivery -> delivered | failed | cancelled
   * delivered -> terminal
   * failed -> terminal
   * cancelled -> terminal
   */
  static readonly ALLOWED_ASSIGNMENT_TRANSITIONS: Record<DeliveryAssignmentStatus, DeliveryAssignmentStatus[]> = {
    assigned: ['picked_up', 'cancelled', 'failed'],
    picked_up: ['out_for_delivery', 'cancelled', 'failed'],
    out_for_delivery: ['failed', 'cancelled'],
    delivered: [],
    failed: [],
    cancelled: [],
  };

  /**
   * Retrieve assignments for the authenticated delivery partner (or all if admin/staff).
   * Strictly filters assignments by actorId on server.
   */
  static async listAssignedDeliveries(params: {
    actorId: string;
    actorRole: string;
    status?: DeliveryAssignmentStatus;
    page?: number;
    limit?: number;
  }): Promise<import('../types').PaginatedAssignedDeliveries> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    let countQuery = client
      .from('delivery_assignments')
      .select('id', { count: 'exact', head: true });

    let dataQuery = client
      .from('delivery_assignments')
      .select(`
        id,
        order_id,
        delivery_partner_id,
        customer_id,
        status,
        notes,
        delivery_fee,
        assigned_at,
        picked_up_at,
        completed_at,
        created_at,
        updated_at,
        orders (
          id,
          order_number,
          total_amount,
          amount_collected,
          payment_method,
          payment_status,
          shipping_address_snapshot,
          order_items (
            product_name,
            quantity,
            unit_price,
            variant_title
          )
        )
      `);

    // Delivery partners can ONLY see assignments assigned to them
    if (params.actorRole === 'delivery_partner') {
      countQuery = countQuery.eq('delivery_partner_id', params.actorId);
      dataQuery = dataQuery.eq('delivery_partner_id', params.actorId);
    }

    if (params.status) {
      countQuery = countQuery.eq('status', params.status);
      dataQuery = dataQuery.eq('status', params.status);
    }

    const { count, error: countErr } = await countQuery;
    if (countErr) {
      logger.error('Failed to count assigned deliveries', { error: countErr.message, actorId: params.actorId });
      throw new InternalServerError('Unable to count assigned deliveries.');
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    dataQuery = dataQuery
      .order('assigned_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: rows, error: rowsErr } = await dataQuery;
    if (rowsErr) {
      logger.error('Failed to query assigned deliveries', { error: rowsErr.message, actorId: params.actorId });
      throw new InternalServerError('Unable to retrieve assigned deliveries.');
    }

    const items: import('../types').AssignedDeliveryItem[] = (rows || []).map((row: any) => {
      const order = row.orders || {};
      const shippingAddress = order.shipping_address_snapshot || {};
      const rawItems = Array.isArray(order.order_items) ? order.order_items : [];

      const isCod = order.payment_method === 'cod';
      const deliveryFee = Math.max(0, Number(row.delivery_fee) || 0);
      const orderTotal = Math.max(0, Number(order.total_amount) || 0);
      const collected = order.amount_collected == null
        ? (order.payment_status === 'paid' ? orderTotal : 0)
        : Math.max(0, Number(order.amount_collected) || 0);
      const orderAmountToCollect = isCod ? Math.max(0, orderTotal - collected) : 0;
      const totalAmountToCollect = isCod
        ? Math.max(0, orderTotal + deliveryFee - collected)
        : deliveryFee;
      const deliveryFeeToCollect = Math.max(0, totalAmountToCollect - orderAmountToCollect);
      const codAmount = totalAmountToCollect > 0 ? totalAmountToCollect : null;

      return {
        id: row.id,
        orderId: row.order_id,
        orderNumber: order.order_number || row.order_id,
        status: row.status as DeliveryAssignmentStatus,
        assignedAt: row.assigned_at,
        pickedUpAt: row.picked_up_at,
        completedAt: row.completed_at,
        notes: row.notes,
        destination: (() => {
          const resolved = ServiceabilityService.resolveAddressCoordinates(shippingAddress);
          return {
            recipientName: shippingAddress.recipient_name || 'Customer',
            phone: shippingAddress.phone || null,
            addressLine1: shippingAddress.address_line1 || '',
            addressLine2: shippingAddress.address_line2 || null,
            landmark: shippingAddress.landmark || null,
            city: shippingAddress.city || '',
            state: shippingAddress.state || '',
            postalCode: shippingAddress.postal_code || '',
            latitude: resolved.latitude,
            longitude: resolved.longitude,
          };
        })(),
        codAmount,
        orderAmountToCollect,
        deliveryFeeToCollect,
        deliveryFee,
        totalPayable: orderTotal + deliveryFee,
        paymentMethod: order.payment_method || 'cod',
        paymentStatus: order.payment_status || 'pending',
        itemsSummary: rawItems.map((item: any) => ({
          productName: item.product_name,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unit_price) || 0,
          variantTitle: item.variant_title || null,
        })),
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
   * Update assignment lifecycle status (e.g., 'picked_up', 'out_for_delivery', 'delivered', 'failed').
   * Authorizes admin/staff OR the assigned delivery partner. Validates lifecycle transitions.
   */
  static async updateAssignmentStatus(params: {
    assignmentId: string;
    status: DeliveryAssignmentStatus;
    actorId: string;
    actorRole?: string;
    notes?: string | null;
  }): Promise<DeliveryAssignmentRecord> {
    if (params.status === 'delivered') {
      throw new BadRequestError('Customer delivery OTP verification is required to mark an order delivered.');
    }

    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: assignment, error: assignErr } = await client
      .from('delivery_assignments')
      .select('*')
      .eq('id', params.assignmentId)
      .single();

    if (assignErr || !assignment) {
      throw new NotFoundError('Delivery assignment not found.');
    }

    // Authorization check: Must be admin/staff OR the delivery partner assigned to this delivery
    const isAdminOrStaff = params.actorRole === 'admin' || params.actorRole === 'staff';
    const isAssignedPartner = assignment.delivery_partner_id === params.actorId;

    if (!isAdminOrStaff && !isAssignedPartner) {
      throw new ForbiddenError('You are not authorized to update this delivery assignment.');
    }

    const currentStatus = assignment.status as DeliveryAssignmentStatus;
    if (currentStatus === params.status) {
      // Idempotent return if already in desired status
      return {
        id: assignment.id,
        orderId: assignment.order_id,
        deliveryPartnerId: assignment.delivery_partner_id,
        customerId: assignment.customer_id,
        status: currentStatus,
        notes: assignment.notes,
        assignedAt: assignment.assigned_at,
        pickedUpAt: assignment.picked_up_at,
        completedAt: assignment.completed_at,
        createdAt: assignment.created_at,
        updatedAt: assignment.updated_at,
      };
    }

    // Lifecycle transition validation
    const allowedTransitions = this.ALLOWED_ASSIGNMENT_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(params.status)) {
      throw new BadRequestError(
        `Invalid status transition from '${currentStatus}' to '${params.status}'. Allowed transitions: [${allowedTransitions.join(', ')}].`
      );
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: params.status,
      updated_at: now,
    };

    if (params.notes !== undefined) updatePayload.notes = params.notes;
    if (params.status === 'picked_up' && !assignment.picked_up_at) updatePayload.picked_up_at = now;
    if (['delivered', 'failed', 'cancelled'].includes(params.status) && !assignment.completed_at) {
      updatePayload.completed_at = now;
    }

    const { data: updated, error: updateErr } = await client
      .from('delivery_assignments')
      .update(updatePayload)
      .eq('id', params.assignmentId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      logger.error('Failed to update assignment status', { error: updateErr?.message, assignmentId: params.assignmentId });
      throw new InternalServerError('Failed to update delivery assignment status.');
    }

    // Synchronize parent order status if appropriate
    if (params.status === 'out_for_delivery') {
      await client
        .from('orders')
        .update({ status: 'shipped', updated_at: now })
        .eq('id', assignment.order_id)
        .in('status', ['confirmed', 'processing']);
    }

    const resultRecord: DeliveryAssignmentRecord = {
      id: updated.id,
      orderId: updated.order_id,
      deliveryPartnerId: updated.delivery_partner_id,
      customerId: updated.customer_id,
      status: updated.status as DeliveryAssignmentStatus,
      notes: updated.notes,
      assignedAt: updated.assigned_at,
      pickedUpAt: updated.picked_up_at,
      completedAt: updated.completed_at,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };

    // Broadcast status transition to tracking room and order room
    try {
      broadcastDeliveryStatus({
        deliveryId: resultRecord.id,
        orderId: resultRecord.orderId,
        status: resultRecord.status,
        timestamp: resultRecord.updatedAt,
        notes: resultRecord.notes,
      });

      broadcastOrderStatus({
        orderId: resultRecord.orderId,
        status: resultRecord.status === 'delivered' ? 'delivered' : resultRecord.status === 'out_for_delivery' ? 'shipped' : resultRecord.status,
        reason: `Delivery status changed to ${resultRecord.status}`,
        timestamp: resultRecord.updatedAt,
      });
    } catch (broadcastErr) {
      logger.warn('Failed to broadcast status update to socket room', {
        error: broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr),
        assignmentId: params.assignmentId,
      });
    }

    return resultRecord;
  }

  /** Atomically verifies a customer OTP and marks its assigned delivery and order delivered. */
  static async verifyDeliveryOtp(params: {
    assignmentId: string;
    actorId: string;
    otp: string;
  }): Promise<DeliveryAssignmentRecord> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database client is unavailable.');

    const { data, error } = await client.rpc('verify_delivery_otp', {
      p_assignment_id: params.assignmentId,
      p_actor_id: params.actorId,
      p_otp_hash: hashDeliveryOtp(params.otp),
    });

    if (error || !data) {
      logger.error('Atomic delivery OTP verification failed', {
        assignmentId: params.assignmentId,
        error: error
          ? {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            }
          : 'RPC returned no data',
      });
      throw new InternalServerError('Unable to verify delivery OTP.');
    }

    if (!data.success) {
      switch (data.code) {
        case 'NOT_FOUND':
          throw new NotFoundError('Delivery assignment not found.');
        case 'NOT_ASSIGNED':
          throw new ForbiddenError('You are not assigned to this delivery.');
        case 'DELIVERY_NOT_OUT_FOR_DELIVERY':
          throw new BadRequestError('The delivery must be marked out for delivery before OTP verification.');
        case 'OTP_EXPIRED':
          throw new BadRequestError('This delivery OTP has expired. Contact an administrator to resolve the delivery.');
        case 'OTP_LOCKED':
          throw new BadRequestError('Too many incorrect OTP attempts. This delivery OTP is locked.');
        case 'OTP_INVALID':
          throw new BadRequestError(`Incorrect delivery OTP. ${data.attemptsRemaining} attempt(s) remaining.`);
        case 'OTP_UNAVAILABLE':
          throw new BadRequestError('No delivery OTP is available for this order.');
        default:
          throw new BadRequestError('Delivery OTP verification was rejected.');
      }
    }

    const resultRecord: DeliveryAssignmentRecord = {
      id: data.assignmentId,
      orderId: data.orderId,
      deliveryPartnerId: data.deliveryPartnerId,
      customerId: data.customerId,
      status: 'delivered',
      notes: data.notes ?? null,
      assignedAt: data.assignedAt,
      pickedUpAt: data.pickedUpAt ?? null,
      completedAt: data.completedAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    try {
      broadcastDeliveryStatus({
        deliveryId: resultRecord.id,
        orderId: resultRecord.orderId,
        status: 'delivered',
        timestamp: resultRecord.updatedAt,
        notes: resultRecord.notes,
      });
      broadcastOrderStatus({
        orderId: resultRecord.orderId,
        status: 'delivered',
        reason: 'Delivery completed after successful customer OTP verification',
        timestamp: resultRecord.updatedAt,
      });
    } catch (broadcastErr) {
      logger.warn('Failed to broadcast OTP-verified delivery completion', {
        error: broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr),
        assignmentId: resultRecord.id,
      });
    }

    return resultRecord;
  }

  /**
   * Ingest and record delivery location atomically from delivery partner.
   * Enforces partner ownership and prevents out-of-order writes.
   */
  static async recordLocationUpdate(
    assignmentId: string,
    partnerId: string,
    input: LocationUpdateInput
  ): Promise<DeliveryLocationRecord> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Verify assignment belongs to this delivery partner
    const { data: assignment, error: assignErr } = await client
      .from('delivery_assignments')
      .select('id, order_id, delivery_partner_id, status')
      .eq('id', assignmentId)
      .single();

    if (assignErr || !assignment) {
      throw new NotFoundError('Delivery assignment not found.');
    }

    if (assignment.delivery_partner_id !== partnerId) {
      throw new ForbiddenError('You are not authorized to record location for this delivery assignment.');
    }

    if (['delivered', 'failed', 'cancelled'].includes(assignment.status)) {
      throw new BadRequestError(`Cannot record location for assignment with status '${assignment.status}'.`);
    }

    // 2. Accuracy check: log diagnostic warning if poor accuracy, but do not drop location fix
    if (input.accuracy && input.accuracy > env.TRACKING_MAX_ACCURACY_METERS) {
      logger.info('GPS reading has low accuracy, accepting fix with warning', {
        assignmentId,
        accuracy: input.accuracy,
        threshold: env.TRACKING_MAX_ACCURACY_METERS,
      });
    }

    // 3. Atomically record in database using RPC function
    const { data: rpcResult, error: rpcErr } = await client.rpc('record_delivery_location', {
      p_assignment_id: assignmentId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_accuracy: input.accuracy ?? null,
      p_speed: input.speed ?? null,
      p_heading: input.heading ?? null,
      p_device_timestamp: input.deviceTimestamp,
    });

    if (rpcErr) {
      logger.error('RPC record_delivery_location failed', { error: rpcErr.message, assignmentId });
      throw new BadRequestError(rpcErr.message);
    }

    // 4. Return the fresh latest location record
    const { data: latest } = await client
      .from('delivery_locations')
      .select('*')
      .eq('delivery_assignment_id', assignmentId)
      .single();

    if (!latest) {
      throw new InternalServerError('Unable to retrieve updated delivery location.');
    }

    const isStale = this.isLocationStale(latest.server_received_at);

    const record: DeliveryLocationRecord = {
      id: latest.id,
      deliveryAssignmentId: latest.delivery_assignment_id,
      orderId: latest.order_id,
      latitude: Number(latest.latitude),
      longitude: Number(latest.longitude),
      accuracy: latest.accuracy != null ? Number(latest.accuracy) : null,
      speed: latest.speed != null ? Number(latest.speed) : null,
      heading: latest.heading != null ? Number(latest.heading) : null,
      deviceTimestamp: latest.device_timestamp,
      serverReceivedAt: latest.server_received_at,
      createdAt: latest.created_at,
      updatedAt: latest.updated_at,
      isStale,
    };

    // 5. Compute dynamic live ETA and remaining distance to destination
    let estimatedArrivalTimestamp: string | null = null;
    let etaSeconds: number | null = null;
    let distanceRemainingMeters: number | null = null;

    try {
      const { data: orderRow } = await client
        .from('orders')
        .select('shipping_address_snapshot')
        .eq('id', record.orderId)
        .single();

      if (orderRow?.shipping_address_snapshot) {
        const destCoord = ServiceabilityService.resolveAddressCoordinates(orderRow.shipping_address_snapshot);
        const distM = RoadRoutingService.calculateHaversineDistanceMeters(
          { latitude: record.latitude, longitude: record.longitude },
          { latitude: destCoord.latitude, longitude: destCoord.longitude }
        );
        distanceRemainingMeters = Math.round(distM);

        // Dynamic speed based on rider current speed or urban average (25 km/h)
        const currentSpeedKmh = record.speed && record.speed > 5 ? Math.min(record.speed, 60) : 25;
        const speedMps = (currentSpeedKmh * 1000) / 3600;
        // Apply urban tortuosity factor (~1.3x straight-line distance for roads)
        const roadDistanceEstM = distM * 1.3;
        etaSeconds = Math.max(60, Math.round(roadDistanceEstM / speedMps));

        const arrivalMs = Date.now() + etaSeconds * 1000;
        estimatedArrivalTimestamp = new Date(arrivalMs).toISOString();
      }
    } catch (etaErr) {
      // Non-fatal fallback
    }

    // 6. Broadcast to authorized Socket.IO tracking room subscribers only after successful database commit
    try {
      broadcastDeliveryLocation({
        deliveryId: assignmentId,
        orderId: record.orderId,
        latitude: record.latitude,
        longitude: record.longitude,
        accuracy: record.accuracy,
        speed: record.speed,
        heading: record.heading,
        deviceTimestamp: record.deviceTimestamp,
        serverReceivedAt: record.serverReceivedAt,
        isStale: Boolean(record.isStale),
        estimatedArrivalTimestamp,
        etaSeconds,
        distanceRemainingMeters,
      });
    } catch (broadcastErr) {
      logger.warn('Failed to broadcast delivery location to socket room', {
        error: broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr),
        assignmentId,
      });
    }

    return record;
  }

  /**
   * Retrieve live tracking state for a customer's order.
   * Strictly enforces customer ownership (or admin/staff role).
   */
  static async getOrderLiveTracking(
    orderId: string,
    requestingUserId: string,
    userRole: string
  ): Promise<OrderLiveTrackingResponse> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // 1. Fetch order
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('id, order_number, user_id, status, shipping_address_snapshot')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError('Order not found.');
    }

    // Authorization: customer must own the order unless admin/staff
    if (userRole !== 'admin' && userRole !== 'staff' && order.user_id !== requestingUserId) {
      throw new NotFoundError('Order not found or does not belong to you.');
    }

    // Resolve store metadata and destination coordinates
    const storeOrigin = RoadRoutingService.getStoreOrigin();
    const snapshot = (order.shipping_address_snapshot || {}) as Record<string, any>;
    let destLat: number | undefined = snapshot?.latitude ?? snapshot?.lat;
    let destLon: number | undefined = snapshot?.longitude ?? snapshot?.lng ?? snapshot?.lon;
    if (destLat == null || destLon == null) {
      destLat = 25.2162;
      destLon = 84.9905;
    }
    const destinationCoord = {
      latitude: Number(destLat),
      longitude: Number(destLon),
    };

    // 2. Fetch active delivery assignment
    const { data: assignment } = await client
      .from('delivery_assignments')
      .select('id, status, assigned_at, picked_up_at, completed_at, delivery_partner_id, delivery_fee')
      .eq('order_id', orderId)
      .in('status', ['assigned', 'picked_up', 'out_for_delivery', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!assignment) {
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        orderStatus: order.status as OrderStatus,
        assignment: null,
        latestLocation: null,
        store: storeOrigin,
        destination: destinationCoord,
        isLiveTrackingAvailable: false,
        trackingMessage: 'Delivery partner has not yet been assigned to this order.',
      };
    }

    // 3. Fetch delivery partner profile summary
    let partnerInfo: { fullName: string; phone: string | null; avatarUrl: string | null } | null = null;
    if (assignment.delivery_partner_id) {
      const { data: partner } = await client
        .from('profiles')
        .select('full_name, phone, avatar_url')
        .eq('id', assignment.delivery_partner_id)
        .single();
      if (partner) {
        partnerInfo = {
          fullName: partner.full_name || 'Hindustan Hardware Partner',
          phone: partner.phone || null,
          avatarUrl: partner.avatar_url || null,
        };
      }
    }

    // 4. Fetch latest GPS location if active
    const { data: location } = await client
      .from('delivery_locations')
      .select('*')
      .eq('delivery_assignment_id', assignment.id)
      .maybeSingle();

    let latestLocation: OrderLiveTrackingResponse['latestLocation'] = null;
    let isLiveTrackingAvailable = false;
    let trackingMessage = 'Tracking initialized.';

    if (location && ['assigned', 'picked_up', 'out_for_delivery'].includes(assignment.status)) {
      const isStale = this.isLocationStale(location.server_received_at);
      latestLocation = {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        accuracy: location.accuracy != null ? Number(location.accuracy) : null,
        speed: location.speed != null ? Number(location.speed) : null,
        heading: location.heading != null ? Number(location.heading) : null,
        deviceTimestamp: location.device_timestamp,
        serverReceivedAt: location.server_received_at,
        isStale,
      };
      isLiveTrackingAvailable = !isStale;
      trackingMessage = isStale
        ? 'Location update is temporarily delayed. Showing last verified position.'
        : 'Live GPS location is actively updating.';
    } else if (assignment.status === 'delivered') {
      trackingMessage = 'Order has been delivered.';
      isLiveTrackingAvailable = false;
    } else {
      trackingMessage = 'Awaiting initial GPS signal from delivery partner.';
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      orderStatus: order.status as OrderStatus,
      assignment: {
        id: assignment.id,
        deliveryPartnerId: assignment.delivery_partner_id,
        status: assignment.status as DeliveryAssignmentStatus,
        assignedAt: assignment.assigned_at,
        pickedUpAt: assignment.picked_up_at,
        completedAt: assignment.completed_at,
        deliveryFee: Number(assignment.delivery_fee) || 0,
        deliveryPartner: partnerInfo,
      },
      latestLocation,
      store: storeOrigin,
      destination: destinationCoord,
      isLiveTrackingAvailable,
      trackingMessage,
    };
  }

  /**
   * Retrieve latest location for a delivery assignment.
   * Strictly authorized to:
   * 1. Assigned Customer (assignment.customer_id === requestingUserId)
   * 2. Assigned Delivery Partner (assignment.delivery_partner_id === requestingUserId)
   * 3. Admin / Staff (userRole === 'admin' || userRole === 'staff')
   */
  static async getDeliveryLatestLocation(
    assignmentId: string,
    requestingUserId: string,
    userRole: string
  ): Promise<{
    assignment: {
      id: string;
      orderId: string;
      status: DeliveryAssignmentStatus;
      assignedAt: string;
      pickedUpAt: string | null;
      completedAt: string | null;
    };
    latestLocation: DeliveryLocationRecord | null;
    isLiveTrackingAvailable: boolean;
    trackingMessage: string;
  }> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: assignment, error: assignErr } = await client
      .from('delivery_assignments')
      .select('id, order_id, customer_id, delivery_partner_id, status, assigned_at, picked_up_at, completed_at')
      .eq('id', assignmentId)
      .single();

    if (assignErr || !assignment) {
      throw new NotFoundError('Delivery assignment not found.');
    }

    const isAuthorized =
      userRole === 'admin' ||
      userRole === 'staff' ||
      assignment.customer_id === requestingUserId ||
      assignment.delivery_partner_id === requestingUserId;

    if (!isAuthorized) {
      throw new ForbiddenError('You are not authorized to view location for this delivery.');
    }

    const { data: location } = await client
      .from('delivery_locations')
      .select('*')
      .eq('delivery_assignment_id', assignmentId)
      .maybeSingle();

    if (!location) {
      return {
        assignment: {
          id: assignment.id,
          orderId: assignment.order_id,
          status: assignment.status as DeliveryAssignmentStatus,
          assignedAt: assignment.assigned_at,
          pickedUpAt: assignment.picked_up_at,
          completedAt: assignment.completed_at,
        },
        latestLocation: null,
        isLiveTrackingAvailable: false,
        trackingMessage: 'No GPS coordinates have been recorded for this delivery yet.',
      };
    }

    const isStale = this.isLocationStale(location.server_received_at);
    const isLiveTrackingAvailable =
      !isStale && ['assigned', 'picked_up', 'out_for_delivery'].includes(assignment.status);

    let trackingMessage = 'Live location active.';
    if (assignment.status === 'delivered') {
      trackingMessage = 'Delivery completed. Location updates have concluded.';
    } else if (assignment.status === 'cancelled' || assignment.status === 'failed') {
      trackingMessage = `Delivery was marked as ${assignment.status}. Tracking is inactive.`;
    } else if (isStale) {
      trackingMessage = 'Location signal is temporarily delayed. Displaying last verified position.';
    }

    const latestLocationRecord: DeliveryLocationRecord = {
      id: location.id,
      deliveryAssignmentId: location.delivery_assignment_id,
      orderId: location.order_id,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: location.accuracy != null ? Number(location.accuracy) : null,
      speed: location.speed != null ? Number(location.speed) : null,
      heading: location.heading != null ? Number(location.heading) : null,
      deviceTimestamp: location.device_timestamp,
      serverReceivedAt: location.server_received_at,
      createdAt: location.created_at,
      updatedAt: location.updated_at,
      isStale,
    };

    return {
      assignment: {
        id: assignment.id,
        orderId: assignment.order_id,
        status: assignment.status as DeliveryAssignmentStatus,
        assignedAt: assignment.assigned_at,
        pickedUpAt: assignment.picked_up_at,
        completedAt: assignment.completed_at,
      },
      latestLocation: latestLocationRecord,
      isLiveTrackingAvailable,
      trackingMessage,
    };
  }

  /**
   * Retrieve location history (strictly authorized to assigned customer, delivery partner, or admin).
   */
  static async getLocationHistory(
    assignmentId: string,
    requestingUserId: string,
    userRole: string,
    options?: { limit?: number; startTime?: string; endTime?: string }
  ): Promise<DeliveryLocationHistoryRecord[]> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const { data: assignment, error: assignErr } = await client
      .from('delivery_assignments')
      .select('id, customer_id, delivery_partner_id')
      .eq('id', assignmentId)
      .single();

    if (assignErr || !assignment) {
      throw new NotFoundError('Delivery assignment not found.');
    }

    // Authorization check
    const isAuthorized =
      userRole === 'admin' ||
      userRole === 'staff' ||
      assignment.customer_id === requestingUserId ||
      assignment.delivery_partner_id === requestingUserId;

    if (!isAuthorized) {
      throw new ForbiddenError('You are not authorized to view location history for this assignment.');
    }

    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

    let query = client
      .from('delivery_location_history')
      .select('*')
      .eq('delivery_assignment_id', assignmentId)
      .order('device_timestamp', { ascending: true })
      .limit(limit);

    if (options?.startTime) {
      query = query.gte('device_timestamp', options.startTime);
    }
    if (options?.endTime) {
      query = query.lte('device_timestamp', options.endTime);
    }

    const { data: rows, error: histErr } = await query;

    if (histErr) {
      logger.error('Failed to query delivery location history', { error: histErr.message, assignmentId });
      throw new InternalServerError('Failed to retrieve location history.');
    }

    return (rows || []).map((row: any) => ({
      id: row.id,
      deliveryAssignmentId: row.delivery_assignment_id,
      orderId: row.order_id,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy: row.accuracy != null ? Number(row.accuracy) : null,
      speed: row.speed != null ? Number(row.speed) : null,
      heading: row.heading != null ? Number(row.heading) : null,
      deviceTimestamp: row.device_timestamp,
      serverReceivedAt: row.server_received_at,
      createdAt: row.created_at,
    }));
  }
}
