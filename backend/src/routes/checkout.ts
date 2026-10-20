import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../common/middleware/auth';
import { CheckoutService } from '../services/checkoutService';
import {
  checkoutValidationSchema,
  createCheckoutOrderSchema,
} from '../common/validation/checkoutSchemas';
import { sendSuccess } from '../common/utils/response';
import { checkoutRateLimiter } from '../common/middleware/rateLimiter';

export const checkoutRouter = Router();

// Protect checkout endpoints from automated flooding
checkoutRouter.use(checkoutRateLimiter);

/**
 * POST /api/v1/checkout/validate
 * Validates active customer cart, address, live inventory availability, and returns recalculated authoritative totals.
 */
checkoutRouter.post(
  '/validate',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = checkoutValidationSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const result = await CheckoutService.validateCheckout(req.user!.id, {
        addressId: parsed.data.addressId,
        shippingAddress: parsed.data.shippingAddress,
        paymentMethod: parsed.data.paymentMethod,
      });

      return sendSuccess(res, result, 'Checkout validation successful');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/checkout
 * Atomically places an order with Cash on Delivery (COD) method.
 * Validates stock, locks and deducts inventory, creates immutable order snapshots, and clears cart.
 */
checkoutRouter.post(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createCheckoutOrderSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const order = await CheckoutService.createOrder(req.user!.id, {
        addressId: parsed.data.addressId,
        shippingAddress: parsed.data.shippingAddress,
        paymentMethod: 'cod',
        customerNotes: parsed.data.customerNotes,
        idempotencyKey: parsed.data.idempotencyKey,
      });

      return sendSuccess(res, order, 'Order placed successfully via Cash on Delivery', 201);
    } catch (err) {
      next(err);
    }
  }
);
