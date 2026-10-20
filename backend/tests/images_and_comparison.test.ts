import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

// Valid 1x1 transparent PNG magic byte buffer
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

// Corrupt/Fake buffer with fake png extension
const corruptBuffer = Buffer.from([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
]);

describe('Phase 4 — Product Image Management, Storage & Brand Comparison', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------- Image Management Tests -----------------
  describe('1. Product Image Upload & Storage', () => {
    it('forbids anonymous user from uploading product image (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/products/11111111-1111-1111-1111-111111111111/images')
        .attach('image', validPngBuffer, 'test.png');

      expect(res.status).toBe(401);
    });

    it('forbids non-admin customer from uploading product image (403 Forbidden)', async () => {
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
        .post('/api/v1/admin/products/11111111-1111-1111-1111-111111111111/images')
        .set('Authorization', 'Bearer customer-token')
        .attach('image', validPngBuffer, 'test.png');

      expect(res.status).toBe(403);
    });

    it('rejects image with corrupted magic bytes or fake format (400 Bad Request)', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@example.com' } },
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
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-1111-1111-111111111111' } }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/products/11111111-1111-1111-1111-111111111111/images')
        .set('Authorization', 'Bearer admin-token')
        .attach('image', corruptBuffer, 'fake.png');

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('corrupted');
    });

    it('uploads valid image to Supabase Storage and records metadata', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@example.com' } },
          }),
        },
        storage: {
          from: () => ({
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://mock-supabase.co/storage/${path}` } }),
          }),
        },
      } as any);

      const mockStorageUpload = vi.fn().mockResolvedValue({ error: null });
      const mockImageInsert = vi.fn().mockReturnValue({
        select: () => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'img-1',
              product_id: '11111111-1111-1111-1111-111111111111',
              storage_path: 'products/11111111-1111-1111-1111-111111111111/img-1.png',
              alt_text: 'Front view',
              display_order: 1,
              is_primary: true,
            },
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
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-1111-1111-111111111111' } }),
                }),
              }),
            };
          }
          if (table === 'product_images') {
            return {
              select: () => ({
                eq: () => ({ count: 0 }),
              }),
              insert: mockImageInsert,
              update: () => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          return {} as any;
        },
        storage: {
          from: () => ({
            upload: mockStorageUpload,
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://mock-supabase.co/storage/${path}` } }),
          }),
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/products/11111111-1111-1111-1111-111111111111/images')
        .set('Authorization', 'Bearer admin-token')
        .field('altText', 'Front view')
        .field('isPrimary', 'true')
        .attach('image', validPngBuffer, 'sample.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockStorageUpload).toHaveBeenCalled();
      expect(res.body.data.alt_text).toBe('Front view');
      expect(res.body.data.public_url).toBeDefined();
    });

    it('rolls back storage object if database metadata insertion fails', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@example.com' } },
          }),
        },
      } as any);

      const mockStorageRemove = vi.fn().mockResolvedValue({ error: null });

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
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-1111-1111-111111111111' } }),
                }),
              }),
            };
          }
          if (table === 'product_images') {
            return {
              select: () => ({
                eq: () => ({ count: 0 }),
              }),
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection failed' } }),
                }),
              }),
            };
          }
          return {} as any;
        },
        storage: {
          from: () => ({
            upload: vi.fn().mockResolvedValue({ error: null }),
            remove: mockStorageRemove,
          }),
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/products/11111111-1111-1111-1111-111111111111/images')
        .set('Authorization', 'Bearer admin-token')
        .attach('image', validPngBuffer, 'sample.png');

      expect(res.status).toBe(500);
      expect(mockStorageRemove).toHaveBeenCalled();
    });
  });

  // ----------------- Image Gallery & Primary Image Tests -----------------
  describe('2. Public Image Gallery & Primary Image Management', () => {
    it('GET /api/v1/products/:id/images returns product gallery in display order', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                order: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'img-1',
                        product_id: 'p-1',
                        storage_path: 'products/p-1/1.png',
                        is_primary: true,
                        display_order: 1,
                      },
                      {
                        id: 'img-2',
                        product_id: 'p-1',
                        storage_path: 'products/p-1/2.png',
                        is_primary: false,
                        display_order: 2,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
        storage: {
          from: () => ({
            getPublicUrl: (p: string) => ({ data: { publicUrl: `https://mock/${p}` } }),
          }),
        },
      } as any);

      const res = await request(app).get('/api/v1/products/p-1/images');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].is_primary).toBe(true);
      expect(res.body.data[0].public_url).toBe('https://mock/products/p-1/1.png');
    });

    it('POST /api/v1/admin/products/:productId/images/:imageId/primary updates primary image', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@example.com' } },
          }),
        },
        storage: {
          from: () => ({
            getPublicUrl: (p: string) => ({ data: { publicUrl: `https://mock/${p}` } }),
          }),
        },
      } as any);

      const mockDemote = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockPromote = vi.fn().mockReturnValue({
        eq: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'img-2', product_id: 'p-1', is_primary: true, storage_path: 'p/2.png' },
              error: null,
            }),
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
          if (table === 'product_images') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: { id: 'img-2' } }),
                  }),
                }),
              }),
              update: (payload: any) => {
                if (payload.is_primary === false) return mockDemote();
                return mockPromote();
              },
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/products/p-1/images/img-2/primary')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_primary).toBe(true);
    });
  });

  // ----------------- Brand & Product Comparison Tests -----------------
  describe('3. Brand and Product Comparison API (/api/v1/products/compare)', () => {
    it('compares valid products and returns structured specifications and differences', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      const mockProducts = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Ashirvad CPVC Pipe 1 inch',
          slug: 'ashirvad-cpvc-1',
          base_price: '500',
          material: 'CPVC',
          diameter: '1 inch',
          length: '3 m',
          pressure_rating: 'SDR 11',
          technical_standard: 'IS 15778',
          brand: { id: 'b1', name: 'Ashirvad Pipes', slug: 'ashirvad' },
          category: { id: 'c1', name: 'CPVC Pipes', slug: 'cpvc' },
          variants: [],
          inventory: [{ quantity_available: 40 }],
          product_images: [],
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Astral CPVC Pipe 1 inch',
          slug: 'astral-cpvc-1',
          base_price: '520',
          material: 'CPVC',
          diameter: '1 inch',
          length: '3 m',
          pressure_rating: 'SDR 11',
          technical_standard: 'IS 15778',
          brand: { id: 'b2', name: 'Astral Pipes', slug: 'astral' },
          category: { id: 'c1', name: 'CPVC Pipes', slug: 'cpvc' },
          variants: [],
          inventory: [{ quantity_available: 25 }],
          product_images: [],
        },
      ];

      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => ({
            in: () => ({
              eq: vi.fn().mockResolvedValue({ data: mockProducts, error: null }),
            }),
          }),
        }),
      } as any);

      const res = await request(app).get(
        '/api/v1/products/compare?ids=11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222'
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products.length).toBe(2);
      expect(res.body.data.commonAttributes.material).toBe(true);
      expect(res.body.data.commonAttributes.diameter).toBe(true);
      expect(res.body.data.attributeDifferences).toContain('basePrice');
    });

    it('rejects comparison request exceeding maximum allowed products (e.g. > 6)', async () => {
      const excessiveIds = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
        '55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666',
        '77777777-7777-7777-7777-777777777777',
      ].join(',');

      const res = await request(app).get(`/api/v1/products/compare?ids=${excessiveIds}`);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('more than 6');
    });

    it('rejects invalid UUID identifiers in comparison query', async () => {
      const res = await request(app).get('/api/v1/products/compare?ids=not-a-valid-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid UUID');
    });
  });

  // ----------------- Cross-Brand Alternatives Tests -----------------
  describe('4. Cross-Brand Alternatives API (/api/v1/products/:id/alternatives)', () => {
    it('returns cross-brand alternatives excluding original product', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      const targetProduct = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Target CPVC Pipe',
        category_id: 'c1',
        base_price: '500',
        material: 'CPVC',
        diameter: '1 inch',
        is_active: true,
        brand: { id: 'b1', name: 'Ashirvad' },
        category: { id: 'c1', name: 'Pipes' },
        inventory: [{ quantity_available: 30 }],
      };

      const candidateProduct = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Alternative Astral Pipe',
        category_id: 'c1',
        base_price: '530',
        material: 'CPVC',
        diameter: '1 inch',
        is_active: true,
        brand: { id: 'b2', name: 'Astral' },
        category: { id: 'c1', name: 'Pipes' },
        inventory: [{ quantity_available: 20 }],
      };

      const mockTargetQuery = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: targetProduct, error: null }),
      };

      const mockCandidateQuery: any = {
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [candidateProduct], error: null }),
      };

      let callCount = 0;
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        from: () => ({
          select: () => {
            callCount++;
            if (callCount === 1) return mockTargetQuery;
            return mockCandidateQuery;
          },
        }),
      } as any);

      const res = await request(app).get(
        '/api/v1/products/11111111-1111-1111-1111-111111111111/alternatives'
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].product.id).toBe('22222222-2222-2222-2222-222222222222');
      expect(res.body.data[0].matchingAttributes).toContain('material');
      expect(res.body.data[0].matchingAttributes).toContain('diameter');
      expect(res.body.data[0].priceDifference).toBe(30);
    });
  });
});
