import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 3 — Product Catalogue, Categories, Brands & Search', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------- Categories Tests -----------------
  describe('1. Public Categories API', () => {
    it('GET /api/v1/categories returns list of active categories', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'cat-1', name: 'Pipes', slug: 'pipes', is_active: true, sort_order: 1 },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].slug).toBe('pipes');
    });

    it('GET /api/v1/categories/slug/:slug returns single category', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'cat-1', name: 'Pipes', slug: 'pipes', is_active: true },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/v1/categories/slug/pipes');
      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe('pipes');
    });
  });

  // ----------------- Brands Tests -----------------
  describe('2. Public Brands API', () => {
    it('GET /api/v1/brands returns list of active brands', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'b-1', name: 'Ashirvad', slug: 'ashirvad', is_active: true, display_order: 1 },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/v1/brands');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].name).toBe('Ashirvad');
    });
  });

  // ----------------- Products Listing, Search, Filters -----------------
  describe('3. Public Products API', () => {
    it('GET /api/v1/products returns paginated products with query parameters', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      const mockQueryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'p-1',
              name: 'CPVC Pipe 1 inch',
              slug: 'cpvc-pipe-1-inch',
              base_price: '500.00',
              compare_at_price: '550.00',
              category_id: 'cat-1',
              is_active: true,
              inventory: [{ quantity_available: 25 }],
            },
          ],
          count: 1,
          error: null,
        }),
      };

      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'products') {
            return {
              select: () => mockQueryBuilder,
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app).get('/api/v1/products?page=1&limit=10&minPrice=100&maxPrice=1000&sortBy=price&sortOrder=asc');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].base_price).toBe(500);
      expect(res.body.meta.pagination.total).toBe(1);
    });

    it('rejects invalid price range (maxPrice < minPrice)', async () => {
      const res = await request(app).get('/api/v1/products?minPrice=500&maxPrice=200');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/products/featured returns featured products', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      const mockQueryBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [
            { id: 'p-feat', name: 'Featured Pipe', slug: 'feat-pipe', base_price: '100', is_featured: true, is_active: true },
          ],
          count: 1,
          error: null,
        }),
      };

      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({ select: () => mockQueryBuilder }),
      } as any);

      const res = await request(app).get('/api/v1/products/featured');
      expect(res.status).toBe(200);
      expect(res.body.data[0].is_featured).toBe(true);
    });

    it('GET /api/v1/products/slug/:slug returns single product by slug', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'p-1',
                    name: 'Test Product',
                    slug: 'test-product',
                    base_price: '250',
                    is_active: true,
                    inventory: [],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/v1/products/slug/test-product');
      expect(res.status).toBe(200);
      expect(res.body.data.slug).toBe('test-product');
    });

    it('GET /api/v1/products/:id/related returns related products excluding self', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: (col: string, val: any) => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'p-self', category_id: 'cat-1', is_active: true, base_price: '100' },
                  error: null,
                }),
                neq: () => ({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'p-other', category_id: 'cat-1', name: 'Related Pipe', is_active: true, base_price: '120' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app).get('/api/v1/products/p-self/related');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe('p-other');
    });
  });

  // ----------------- Administrative CRUD Tests -----------------
  describe('4. Administrative Catalogue CRUD (/api/v1/admin)', () => {
    it('forbids anonymous access to admin category creation', async () => {
      const res = await request(app).post('/api/v1/admin/categories').send({
        name: 'New Category',
        slug: 'new-category',
      });
      expect(res.status).toBe(401);
    });

    it('forbids non-admin customer from creating a category', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'cust-1', email: 'cust@example.com' } },
          }),
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'cust-1', role: 'customer' },
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', 'Bearer customer-token')
        .send({
          name: 'Forbidden Category',
          slug: 'forbidden-category',
        });

      expect(res.status).toBe(403);
    });

    it('allows admin to create category with valid payload', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@hindustanhardware.com' } },
          }),
        },
      } as any);

      const mockInsert = vi.fn().mockReturnValue({
        select: () => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'cat-new', name: 'Tanks', slug: 'tanks', is_active: true },
            error: null,
          }),
        }),
      });

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: 'admin-1', role: 'admin' } }),
                }),
              }),
            };
          }
          if (table === 'categories') {
            return {
              insert: mockInsert,
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', 'Bearer admin-token')
        .send({
          name: 'Tanks',
          slug: 'tanks',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.slug).toBe('tanks');
    });

    it('rejects category creation with duplicate slug (ConflictError)', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@hindustanhardware.com' } },
          }),
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: 'admin-1', role: 'admin' } }),
                }),
              }),
            };
          }
          if (table === 'categories') {
            return {
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', 'Bearer admin-token')
        .send({
          name: 'Duplicate Category',
          slug: 'duplicate-category',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('allows admin to create product and initializes inventory', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@hindustanhardware.com' } },
          }),
        },
      } as any);

      const mockInventoryInsert = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: 'admin-1', role: 'admin' } }),
                }),
              }),
            };
          }
          if (table === 'categories') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-1111-1111-111111111111' } }),
                }),
              }),
            };
          }
          if (table === 'brands') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '22222222-2222-2222-2222-222222222222' } }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'prod-new-1', slug: 'upvc-pipe-10ft' },
                    error: null,
                  }),
                }),
              }),
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'prod-new-1',
                      name: 'UPVC Pipe 10ft',
                      slug: 'upvc-pipe-10ft',
                      base_price: '400',
                      inventory: [{ quantity_available: 50 }],
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'inventory') {
            return {
              insert: mockInventoryInsert,
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', 'Bearer admin-token')
        .send({
          name: 'UPVC Pipe 10ft',
          slug: 'upvc-pipe-10ft',
          sku: 'UPVC-10FT-01',
          categoryId: '11111111-1111-1111-1111-111111111111',
          brandId: '22222222-2222-2222-2222-222222222222',
          basePrice: 400,
          initialStock: 50,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockInventoryInsert).toHaveBeenCalledWith({
        product_id: 'prod-new-1',
        variant_id: null,
        quantity_available: 50,
        quantity_reserved: 0,
      });
    });
  });
});
