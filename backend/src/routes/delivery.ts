import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../common/middleware/auth';
import { requireRole } from '../common/middleware/authorize';
import { trackingRateLimiter } from '../common/middleware/rateLimiter';
import {
  assignedDeliveriesQuerySchema,
  deliveryIdParamSchema,
  locationHistoryQuerySchema,
  locationUpdateSchema,
  updateAssignmentStatusSchema,
  verifyDeliveryOtpSchema,
} from '../common/validation/trackingSchemas';
import { DeliveryTrackingService } from '../services/deliveryTrackingService';
import { RoadRoutingService } from '../services/roadRoutingService';
import { sendSuccess } from '../common/utils/response';

export const deliveryRouter = Router();

/**
 * GET /api/v1/deliveries/assigned
 * Retrieve assigned deliveries for the authenticated delivery partner (or all if admin/staff).
 * 
 * Authorization:
 * - Requires authentication.
 * - Allowed roles: 'delivery_partner', 'admin', 'staff'.
 * - Strict server-side actor filtering: delivery partner only sees their own assigned deliveries.
 * - Supports pagination and optional lifecycle status filtering.
 */
deliveryRouter.get(
  '/assigned',
  authenticate,
  requireRole('delivery_partner', 'admin', 'staff'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queryParsed = assignedDeliveriesQuerySchema.safeParse(req.query);
      if (!queryParsed.success) {
        return next(queryParsed.error);
      }

      const assignedDeliveries = await DeliveryTrackingService.listAssignedDeliveries({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        status: queryParsed.data.status,
        page: queryParsed.data.page,
        limit: queryParsed.data.limit,
      });

      return sendSuccess(res, assignedDeliveries, 'Assigned deliveries retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/deliveries/:deliveryId/status
 * Update assignment lifecycle status (e.g. 'picked_up', 'out_for_delivery', 'delivered', 'failed').
 * 
 * Authorization:
 * - Requires authentication.
 * - Allowed roles: 'delivery_partner', 'admin', 'staff'.
 * - Must be assigned to this specific delivery (enforced in service).
 * - Enforces valid state machine transitions.
 */
deliveryRouter.patch(
  '/:deliveryId/status',
  authenticate,
  requireRole('delivery_partner', 'admin', 'staff'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = deliveryIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        return next(paramParsed.error);
      }

      const bodyParsed = updateAssignmentStatusSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return next(bodyParsed.error);
      }

      const updated = await DeliveryTrackingService.updateAssignmentStatus({
        assignmentId: paramParsed.data.deliveryId,
        status: bodyParsed.data.status,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        notes: bodyParsed.data.notes,
      });

      return sendSuccess(res, updated, 'Delivery assignment status updated successfully');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/deliveries/:deliveryId/verify-otp
 * Verify the customer's delivery code and atomically complete the assignment and order.
 */
deliveryRouter.post(
  '/:deliveryId/verify-otp',
  authenticate,
  requireRole('delivery_partner'),
  trackingRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = deliveryIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) return next(paramParsed.error);

      const bodyParsed = verifyDeliveryOtpSchema.safeParse(req.body);
      if (!bodyParsed.success) return next(bodyParsed.error);

      const updated = await DeliveryTrackingService.verifyDeliveryOtp({
        assignmentId: paramParsed.data.deliveryId,
        actorId: req.user!.id,
        otp: bodyParsed.data.otp,
      });

      return sendSuccess(res, updated, 'Delivery OTP verified; order marked delivered successfully');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/deliveries/:deliveryId/location
 * Ingest real-time GPS coordinates for an assigned delivery.
 * 
 * Authorization:
 * - Requires authentication.
 * - Allowed roles: 'delivery_partner', 'admin', 'staff'.
 * - Must be assigned to this specific delivery (enforced in service).
 * - Delivery assignment must be in an active state ('assigned', 'picked_up', 'out_for_delivery').
 * - Out-of-order device timestamps are safely rejected.
 */
deliveryRouter.post(
  '/:deliveryId/location',
  authenticate,
  requireRole('delivery_partner', 'admin', 'staff'),
  trackingRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = deliveryIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        return next(paramParsed.error);
      }

      const bodyParsed = locationUpdateSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return next(bodyParsed.error);
      }

      const updatedLocation = await DeliveryTrackingService.recordLocationUpdate(
        paramParsed.data.deliveryId,
        req.user!.id,
        bodyParsed.data
      );

      return sendSuccess(res, updatedLocation, 'Delivery location recorded successfully', 200);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/deliveries/:deliveryId/location
 * Retrieve the latest valid GPS position for a delivery.
 * 
 * Authorization:
 * - Requires authentication.
 * - Allowed for:
 *   1. Customer who owns the associated order.
 *   2. Assigned delivery partner.
 *   3. Admin or staff.
 */
deliveryRouter.get(
  '/:deliveryId/location',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = deliveryIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        return next(paramParsed.error);
      }

      const locationData = await DeliveryTrackingService.getDeliveryLatestLocation(
        paramParsed.data.deliveryId,
        req.user!.id,
        req.user!.role
      );

      return sendSuccess(res, locationData, 'Delivery latest location retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/deliveries/:deliveryId/locations
 * Retrieve chronological GPS location history for an assigned delivery.
 * 
 * Authorization:
 * - Requires authentication.
 * - Allowed for:
 *   1. Customer who owns the associated order.
 *   2. Assigned delivery partner.
 *   3. Admin or staff.
 * - Bounded query limits (1 to 200, default 50).
 * - Optional startTime and endTime filters.
 */
deliveryRouter.get(
  '/:deliveryId/locations',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = deliveryIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        return next(paramParsed.error);
      }

      const queryParsed = locationHistoryQuerySchema.safeParse(req.query);
      if (!queryParsed.success) {
        return next(queryParsed.error);
      }

      const history = await DeliveryTrackingService.getLocationHistory(
        paramParsed.data.deliveryId,
        req.user!.id,
        req.user!.role,
        queryParsed.data
      );

      return sendSuccess(res, history, 'Delivery location history retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/deliveries/:deliveryId/route
 * Retrieve driving road route geometry, distance, and duration calculated via OSRM.
 * 
 * Authorization:
 * - Requires authentication.
 * - Allowed for: Customer owning order, Assigned delivery partner, Admin/Staff.
 */
deliveryRouter.get(
  '/:deliveryId/route',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = deliveryIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        return next(paramParsed.error);
      }

      const routeResult = await RoadRoutingService.getDeliveryRoute(
        paramParsed.data.deliveryId,
        req.user!.id,
        req.user!.role
      );

      return sendSuccess(res, routeResult, 'Delivery road route retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/deliveries/:deliveryId/eta
 * Retrieve best-effort Estimated Time of Arrival (ETA) and location freshness.
 * 
 * Authorization:
 * - Requires authentication.
 * - Allowed for: Customer owning order, Assigned delivery partner, Admin/Staff.
 */
deliveryRouter.get(
  '/:deliveryId/eta',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = deliveryIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) {
        return next(paramParsed.error);
      }

      const etaResult = await RoadRoutingService.getDeliveryEta(
        paramParsed.data.deliveryId,
        req.user!.id,
        req.user!.role
      );

      return sendSuccess(res, etaResult, 'Delivery ETA retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
);

