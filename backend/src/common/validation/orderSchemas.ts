import { z } from 'zod';

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
    .optional(),
  sortBy: z.enum(['created_at', 'total_amount']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const cancelOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Cancellation reason must be at least 3 characters')
    .max(500, 'Cancellation reason cannot exceed 500 characters')
    .default('Cancelled by customer'),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format. Must be a valid UUID.'),
});
