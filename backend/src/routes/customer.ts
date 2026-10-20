import { Router, Request, Response, NextFunction } from 'express';
import { updateProfileSchema } from '../common/validation/authSchemas';
import {
  createAddressSchema,
  updateAddressSchema,
  addWishlistSchema,
} from '../common/validation/customerSchemas';
import { authenticate } from '../common/middleware/auth';
import { getSupabaseAdminClient, getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError, InternalServerError } from '../common/errors';
import { sendSuccess } from '../common/utils/response';
import { UserProfile, UserRole } from '../types';
import { logger } from '../common/utils/logger';
import { AddressService } from '../services/addressService';
import { WishlistService } from '../services/wishlistService';
import { OrderService } from '../services/orderService';
import {
  orderQuerySchema,
  cancelOrderSchema,
  orderIdParamSchema,
} from '../common/validation/orderSchemas';
import { cancellationRateLimiter } from '../common/middleware/rateLimiter';

export const customerRouter = Router();

/**
 * GET /api/v1/customers/me
 * Retrieves current authenticated customer's database profile.
 */
customerRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  return sendSuccess(res, {
    profile: req.user!.profile,
  });
});

/**
 * PATCH /api/v1/customers/me
 * Updates current authenticated customer's profile fields.
 * Strictly prevents modification of id, role, created_at, or email.
 */
customerRouter.patch('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(parsed.error);
    }

    const { fullName, phone, avatarUrl } = parsed.data;

    // Check if at least one field is provided
    if (fullName === undefined && phone === undefined && avatarUrl === undefined) {
      return next(new BadRequestError('No valid profile update fields provided.'));
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (fullName !== undefined) updatePayload.full_name = fullName;
    if (phone !== undefined) updatePayload.phone = phone;
    if (avatarUrl !== undefined) updatePayload.avatar_url = avatarUrl;

    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) {
      return next(new InternalServerError('Database client unavailable.'));
    }

    const { data: updatedProfile, error } = await client
      .from('profiles')
      .update(updatePayload)
      .eq('id', req.user!.id)
      .select('id, role, full_name, phone, avatar_url, created_at, updated_at')
      .single();

    if (error || !updatedProfile) {
      logger.error('Failed to update customer profile', { error: error?.message, userId: req.user!.id });
      return next(new InternalServerError('Unable to update profile.'));
    }

    const profile: UserProfile = {
      id: updatedProfile.id,
      role: (updatedProfile.role as UserRole) || 'customer',
      full_name: updatedProfile.full_name || '',
      phone: updatedProfile.phone || null,
      avatar_url: updatedProfile.avatar_url || null,
      created_at: updatedProfile.created_at,
      updated_at: updatedProfile.updated_at,
    };

    return sendSuccess(res, { profile }, 'Profile updated successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Customer Addresses Endpoints -----------------
customerRouter.get('/me/addresses', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addresses = await AddressService.getCustomerAddresses(req.user!.id);
    return sendSuccess(res, addresses, 'Customer addresses retrieved successfully');
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/me/addresses', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createAddressSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const address = await AddressService.createAddress(req.user!.id, parsed.data);
    return sendSuccess(res, address, 'Address added successfully', 201);
  } catch (err) {
    next(err);
  }
});

customerRouter.get('/me/addresses/:addressId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addressId = String(req.params.addressId);
    const address = await AddressService.getAddressById(req.user!.id, addressId);
    return sendSuccess(res, address);
  } catch (err) {
    next(err);
  }
});

customerRouter.patch('/me/addresses/:addressId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addressId = String(req.params.addressId);
    const parsed = updateAddressSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const address = await AddressService.updateAddress(req.user!.id, addressId, parsed.data);
    return sendSuccess(res, address, 'Address updated successfully');
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/me/addresses/:addressId/default', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addressId = String(req.params.addressId);
    const address = await AddressService.setDefaultAddress(req.user!.id, addressId);
    return sendSuccess(res, address, 'Default address updated successfully');
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/me/addresses/:addressId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addressId = String(req.params.addressId);
    await AddressService.deleteAddress(req.user!.id, addressId);
    return sendSuccess(res, null, 'Address deleted successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Customer Wishlist Endpoints -----------------
customerRouter.get('/me/wishlist', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wishlist = await WishlistService.getWishlist(req.user!.id);
    return sendSuccess(res, wishlist, 'Wishlist retrieved successfully');
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/me/wishlist', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = addWishlistSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    await WishlistService.addToWishlist(req.user!.id, parsed.data.productId);
    return sendSuccess(res, null, 'Product added to wishlist', 201);
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/me/wishlist/:productId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = String(req.params.productId);
    await WishlistService.removeFromWishlist(req.user!.id, productId);
    return sendSuccess(res, null, 'Product removed from wishlist');
  } catch (err) {
    next(err);
  }
});

// ----------------- Customer Orders Endpoints (Phase 7) -----------------

/**
 * GET /api/v1/customers/me/orders
 * Retrieves paginated order history strictly scoped to the authenticated customer.
 */
customerRouter.get('/me/orders', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = orderQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);

    const orders = await OrderService.getCustomerOrders(req.user!.id, parsed.data);
    return sendSuccess(res, orders, 'Customer orders retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/customers/me/orders/:orderId
 * Retrieves individual order details including immutable order-item snapshots,
 * address snapshot, COD payment method & pending payment status, and status history.
 */
customerRouter.get('/me/orders/:orderId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramParsed = orderIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) return next(paramParsed.error);

    const order = await OrderService.getCustomerOrderById(paramParsed.data.orderId, req.user!.id);
    return sendSuccess(res, order, 'Order details retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/customers/me/orders/:orderId/status
 * Retrieves order status tracking details and chronological status history.
 */
customerRouter.get('/me/orders/:orderId/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramParsed = orderIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) return next(paramParsed.error);

    const statusTracking = await OrderService.getOrderStatusTracking(paramParsed.data.orderId, req.user!.id);
    return sendSuccess(res, statusTracking, 'Order status tracking retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/customers/me/orders/:orderId/cancel
 * Cancels customer order if in an eligible status ('pending' or 'confirmed'),
 * atomically restoring inventory at most once and recording transition history.
 */
customerRouter.post('/me/orders/:orderId/cancel', authenticate, cancellationRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramParsed = orderIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) return next(paramParsed.error);

    const bodyParsed = cancelOrderSchema.safeParse(req.body);
    if (!bodyParsed.success) return next(bodyParsed.error);

    const updatedOrder = await OrderService.cancelOrder(
      paramParsed.data.orderId,
      req.user!.id,
      bodyParsed.data.reason
    );

    return sendSuccess(res, updatedOrder, 'Order cancelled successfully');
  } catch (err) {
    next(err);
  }
});

