import { z } from 'zod';
import { createAddressSchema } from './customerSchemas';

export const checkoutAddressSnapshotSchema = createAddressSchema.extend({
  id: z.string().uuid().optional(),
});

export const checkoutValidationSchema = z.object({
  addressId: z.string().uuid('Invalid address ID UUID').optional(),
  shippingAddress: checkoutAddressSnapshotSchema.optional(),
  paymentMethod: z.literal('cod', {
    errorMap: () => ({ message: "Payment method must be 'cod'. Only Cash on Delivery is supported." }),
  }),
}).refine(
  (data) => Boolean(data.addressId || data.shippingAddress),
  { message: 'Either a saved addressId or a full shippingAddress must be provided.', path: ['addressId'] }
);

export const createCheckoutOrderSchema = z.object({
  addressId: z.string().uuid('Invalid address ID UUID').optional(),
  shippingAddress: checkoutAddressSnapshotSchema.optional(),
  paymentMethod: z.literal('cod', {
    errorMap: () => ({ message: "Payment method must be 'cod'. Only Cash on Delivery is supported." }),
  }),
  customerNotes: z.string().trim().max(500, 'Customer notes cannot exceed 500 characters').optional().nullable(),
  idempotencyKey: z.string().trim().min(8, 'Idempotency key must be at least 8 characters').max(100).optional(),
}).refine(
  (data) => Boolean(data.addressId || data.shippingAddress),
  { message: 'Either a saved addressId or a full shippingAddress must be provided.', path: ['addressId'] }
);
