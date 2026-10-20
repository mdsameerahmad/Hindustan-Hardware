import { z } from 'zod';

export const uploadImageMetadataSchema = z.object({
  altText: z.string().trim().max(255).optional().nullable(),
  displayOrder: z.preprocess((v) => (v !== undefined ? parseInt(String(v), 10) : 0), z.number().int()).default(0),
  isPrimary: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  variantId: z.string().uuid('Invalid variantId UUID').optional().nullable(),
});

export const updateImageMetadataSchema = z.object({
  altText: z.string().trim().max(255).optional().nullable(),
  displayOrder: z.number().int().optional(),
  variantId: z.string().uuid('Invalid variantId UUID').optional().nullable(),
});

export const compareProductsQuerySchema = z.object({
  ids: z.string().trim().min(1, 'Product IDs query parameter is required (e.g. ?ids=id1,id2)'),
});
