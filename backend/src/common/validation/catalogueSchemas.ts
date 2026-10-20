import { z } from 'zod';

// Helper for positive numeric values from string or number
const numericCoerce = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    return isNaN(num) ? val : num;
  }
  return val;
}, z.number());

const booleanCoerce = z.preprocess((val) => {
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return val;
}, z.boolean());

// ----------------- Public Listing Query Schema -----------------
export const productListingQuerySchema = z.object({
  page: z.preprocess((v) => (v ? parseInt(String(v), 10) : 1), z.number().int().min(1)).default(1),
  limit: z.preprocess((v) => (v ? parseInt(String(v), 10) : 20), z.number().int().min(1).max(100)).default(20),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  minPrice: numericCoerce.pipe(z.number().min(0, 'minPrice must be non-negative')).optional(),
  maxPrice: numericCoerce.pipe(z.number().min(0, 'maxPrice must be non-negative')).optional(),
  sortBy: z.enum(['price', 'name', 'createdAt', 'created_at']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  featured: booleanCoerce.optional(),
  availability: z.enum(['in_stock', 'all']).default('all'),
}).refine(
  (data) => {
    if (data.minPrice !== undefined && data.maxPrice !== undefined) {
      return data.maxPrice >= data.minPrice;
    }
    return true;
  },
  {
    message: 'maxPrice must be greater than or equal to minPrice',
    path: ['maxPrice'],
  }
);

// ----------------- Category Admin Schemas -----------------
export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  slug: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : undefined))
    .pipe(
      z
        .string()
        .min(1, 'Slug is required')
        .max(100)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lower-case alphanumeric with dashes')
        .optional()
    ),
  description: z.string().trim().optional().nullable(),
  parentId: z.string().uuid('Invalid parentId UUID format').optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

// ----------------- Brand Admin Schemas -----------------
export const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'Brand name is required').max(100),
  slug: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : undefined))
    .pipe(
      z
        .string()
        .min(1, 'Slug is required')
        .max(100)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lower-case alphanumeric with dashes')
        .optional()
    ),
  description: z.string().trim().optional().nullable(),
  logoUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.length === 0) return null;
      if (!/^https?:\/\//i.test(val) && !val.startsWith('/')) {
        return `https://${val}`;
      }
      return val;
    }),
  discountPercentage: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});

export const updateBrandSchema = createBrandSchema.partial();

// ----------------- Product Admin Schemas -----------------
export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  slug: z.string().trim().min(1, 'Slug is required').max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lower-case alphanumeric with dashes'),
  sku: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().default(''),
  brandId: z.string().uuid('Invalid brandId UUID').optional().nullable(),
  categoryId: z.string().uuid('Invalid categoryId UUID'),
  productType: z.string().trim().optional().nullable(),
  basePrice: z.number().min(0, 'basePrice must be non-negative'),
  compareAtPrice: z.number().min(0, 'compareAtPrice must be non-negative').optional().nullable(),
  unit: z.string().trim().default('piece'),
  unitOfSale: z.string().trim().default('piece'),
  material: z.string().trim().optional().nullable(),
  diameter: z.string().trim().optional().nullable(),
  length: z.string().trim().optional().nullable(),
  pressureRating: z.string().trim().optional().nullable(),
  technicalStandard: z.string().trim().optional().nullable(),
  intendedApplication: z.string().trim().optional().nullable(),
  comparisonGroupId: z.string().trim().optional().nullable(),
  imageUrl: z.string().trim().url().optional().nullable(),
  images: z.array(z.string().url()).default([]),
  specs: z.record(z.string()).default({}),
  discountPercentage: z.number().min(0).max(100).optional().nullable(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  initialStock: z.number().int().min(0, 'initialStock must be non-negative').default(0),
});

export const updateProductSchema = createProductSchema.partial().omit({ initialStock: true });

// ----------------- Variant & Inventory Schemas -----------------
export const createVariantSchema = z.object({
  sku: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(1, 'Variant name is required'),
  priceOverride: z.number().min(0, 'priceOverride must be non-negative').optional().nullable(),
  variantAttributes: z.record(z.string()).default({}),
  isActive: z.boolean().default(true),
  initialStock: z.number().int().min(0, 'initialStock must be non-negative').default(0),
});

export const updateVariantSchema = createVariantSchema.partial().omit({ initialStock: true });

export const updateInventorySchema = z.object({
  quantityAvailable: z.number().int().min(0, 'quantityAvailable must be non-negative').optional(),
  quantityReserved: z.number().int().min(0, 'quantityReserved must be non-negative').optional(),
});
