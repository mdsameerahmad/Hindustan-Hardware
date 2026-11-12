import { z } from 'zod';
import { createAddressSchema } from './customerSchemas';

export const adminOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
    .optional(),
  paymentStatus: z.enum(['pending', 'partially_paid', 'paid', 'failed', 'cancelled']).optional(),
  userId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['created_at', 'total_amount', 'order_number']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const createPhoneOrderSchema = z.object({
  shippingAddress: createAddressSchema,
  items: z.array(z.object({
    productId: z.string().uuid('Product ID must be a valid UUID'),
    variantId: z.string().uuid('Variant ID must be a valid UUID').nullable().optional(),
    quantity: z.number().int().min(1).max(999),
  })).min(1).max(100).superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const key = `${item.productId}:${item.variantId || ''}`;
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'productId'],
          message: 'A product and variant may only appear once; update its quantity instead.',
        });
      }
      seen.add(key);
    });
  }),
  customerNotes: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().uuid().optional(),
});

export const createTrackingShareSchema = z.object({
  expiresInHours: z.number().int().min(1).max(720).default(24),
});

export const trackingShareIdParamSchema = z.object({
  orderId: z.string().uuid('Order ID must be a valid UUID'),
  shareId: z.string().uuid('Tracking share ID must be a valid UUID'),
});

export const collectCodPaymentSchema = z.object({
  amount: z.number().positive().multipleOf(0.01),
  method: z.enum(['cash', 'online']),
  notes: z.string().trim().max(500).optional(),
});

export const inventoryAdjustmentSchema = z.object({
  productId: z.string().uuid('Product ID must be a valid UUID'),
  variantId: z.string().uuid('Variant ID must be a valid UUID').nullable().optional(),
  quantityChange: z.number().int().refine((val) => val !== 0, {
    message: 'Quantity change must be a non-zero integer',
  }),
  movementType: z.enum(['adjustment', 'restock', 'correction', 'return']).default('adjustment'),
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
  referenceId: z.string().trim().max(100).optional(),
});

export const inventoryMovementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  movementType: z.enum(['adjustment', 'restock', 'correction', 'order_deduction', 'order_cancellation', 'return']).optional(),
});

export const adminCustomerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  role: z.enum(['customer', 'admin', 'staff', 'delivery_partner']).optional(),
});

export const adminProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  search: z.string().trim().optional(),
});

export const adminAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  resourceType: z.string().trim().optional(),
  resourceId: z.string().trim().optional(),
  action: z.string().trim().optional(),
  actorId: z.string().uuid().optional(),
});

export const createDeliveryPartnerSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().trim().min(7, 'Mobile number must be at least 7 characters').max(20),
  email: z.string().trim().toLowerCase().email('A valid email address is required').max(254),
  avatarUrl: z.string().nullable().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export const updateDeliveryPartnerSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  avatarUrl: z.string().nullable().optional(),
});
