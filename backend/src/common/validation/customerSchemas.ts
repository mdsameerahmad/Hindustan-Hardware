import { z } from 'zod';

export const createAddressSchema = z.object({
  recipientName: z.string().trim().min(1, 'Recipient name is required').max(100),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number format'),
  addressLine1: z.string().trim().min(3, 'Address line 1 is required').max(200),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(100).optional().nullable(),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  postalCode: z.string().trim().regex(/^[0-9]{6}$/, 'Postal code must be a 6-digit Indian PIN code'),
  country: z.string().trim().default('India'),
  addressType: z.enum(['Home', 'Work', 'Site']).default('Home'),
  isDefault: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  formattedAddress: z.string().trim().max(500).optional().nullable(),
  geocodingProvider: z.string().trim().max(100).optional().nullable(),
});

export const updateAddressSchema = createAddressSchema.partial();

export const addCartItemSchema = z.object({
  productId: z.string().uuid('Invalid productId UUID'),
  variantId: z.string().uuid('Invalid variantId UUID').optional().nullable(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(999, 'Quantity cannot exceed 999').default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(999, 'Quantity cannot exceed 999'),
});

export const mergeCartSchema = z.object({
  guestToken: z.string().trim().min(1, 'Guest cart token is required'),
});

export const addWishlistSchema = z.object({
  productId: z.string().uuid('Invalid productId UUID'),
});
