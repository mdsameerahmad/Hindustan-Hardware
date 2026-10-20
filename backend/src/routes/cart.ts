import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../common/middleware/auth';
import { CartService } from '../services/cartService';
import {
  addCartItemSchema,
  updateCartItemSchema,
  mergeCartSchema,
} from '../common/validation/customerSchemas';
import { BadRequestError, UnauthorizedError } from '../common/errors';
import { sendSuccess } from '../common/utils/response';


export const cartRouter = Router();

// Helper to extract guest cart token from x-guest-cart-token header or bearer token
function getGuestToken(req: Request): string {
  const headerToken = req.headers['x-guest-cart-token'];
  if (headerToken && typeof headerToken === 'string') {
    return headerToken.trim();
  }
  const queryToken = req.query.guestToken;
  if (queryToken && typeof queryToken === 'string') {
    return queryToken.trim();
  }
  throw new UnauthorizedError('Missing guest cart token. Provide it in the x-guest-cart-token header.');
}


// ----------------- 1. Authenticated Customer Cart Routes -----------------
/**
 * GET /api/v1/cart
 * Retrieves current active persistent cart for authenticated customer.
 */
cartRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cart = await CartService.getOrCreateCustomerCart(req.user!.id);
    return sendSuccess(res, cart, 'Customer cart retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/cart/items
 * Adds product or variant to authenticated customer cart.
 */
cartRouter.post('/items', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const customerCart = await CartService.getOrCreateCustomerCart(req.user!.id);
    const updatedCart = await CartService.addItemToCart(customerCart.id, parsed.data);
    return sendSuccess(res, updatedCart, 'Item added to cart', 201);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/cart/items/:itemId
 * Updates quantity of item in customer cart.
 */
cartRouter.patch('/items/:itemId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = String(req.params.itemId);
    const parsed = updateCartItemSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const customerCart = await CartService.getOrCreateCustomerCart(req.user!.id);
    const updatedCart = await CartService.updateCartItemQuantity(customerCart.id, itemId, parsed.data.quantity);
    return sendSuccess(res, updatedCart, 'Cart item updated successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/cart/items/:itemId
 * Removes an item from customer cart.
 */
cartRouter.delete('/items/:itemId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const itemId = String(req.params.itemId);
    const customerCart = await CartService.getOrCreateCustomerCart(req.user!.id);
    const updatedCart = await CartService.removeCartItem(customerCart.id, itemId);
    return sendSuccess(res, updatedCart, 'Cart item removed successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/cart/items
 * Clears all items in customer cart.
 */
cartRouter.delete('/items', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerCart = await CartService.getOrCreateCustomerCart(req.user!.id);
    const updatedCart = await CartService.clearCart(customerCart.id);
    return sendSuccess(res, updatedCart, 'Cart cleared successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/cart/merge
 * Merges anonymous guest cart into authenticated customer cart after login.
 */
cartRouter.post('/merge', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = mergeCartSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const mergedCart = await CartService.mergeGuestCart(req.user!.id, parsed.data.guestToken);
    return sendSuccess(res, mergedCart, 'Guest cart merged successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- 2. Guest Cart Routes -----------------
/**
 * POST /api/v1/cart/guest
 * Initializes a new anonymous guest cart and returns its unhashed token.
 */
cartRouter.post('/guest', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { cart, guestToken } = await CartService.createGuestCart();
    return sendSuccess(
      res,
      {
        cart,
        guestToken,
      },
      'Guest cart created successfully',
      201
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/cart/guest
 * Retrieves active guest cart by validating token in header.
 */
cartRouter.get('/guest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getGuestToken(req);
    const cart = await CartService.getGuestCartByToken(token);
    return sendSuccess(res, cart, 'Guest cart retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/cart/guest/items
 * Adds product or variant to guest cart.
 */
cartRouter.post('/guest/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getGuestToken(req);
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const guestCartId = await CartService.getGuestCartIdByToken(token);
    const updatedCart = await CartService.addItemToCart(guestCartId, parsed.data);
    return sendSuccess(res, updatedCart, 'Item added to guest cart', 201);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/cart/guest/items/:itemId
 * Updates item quantity in guest cart.
 */
cartRouter.patch('/guest/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getGuestToken(req);
    const itemId = String(req.params.itemId);
    const parsed = updateCartItemSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const guestCartId = await CartService.getGuestCartIdByToken(token);
    const updatedCart = await CartService.updateCartItemQuantity(guestCartId, itemId, parsed.data.quantity);
    return sendSuccess(res, updatedCart, 'Guest cart item updated successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/cart/guest/items/:itemId
 * Removes item from guest cart.
 */
cartRouter.delete('/guest/items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getGuestToken(req);
    const itemId = String(req.params.itemId);

    const guestCartId = await CartService.getGuestCartIdByToken(token);
    const updatedCart = await CartService.removeCartItem(guestCartId, itemId);
    return sendSuccess(res, updatedCart, 'Item removed from guest cart');
  } catch (err) {
    next(err);
  }

});

/**
 * DELETE /api/v1/cart/guest/items
 * Clears all items in guest cart.
 */
cartRouter.delete('/guest/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getGuestToken(req);
    const guestCart = await CartService.getGuestCartByToken(token);
    const updatedCart = await CartService.clearCart(guestCart.id);
    return sendSuccess(res, updatedCart, 'Guest cart cleared successfully');
  } catch (err) {
    next(err);
  }
});
