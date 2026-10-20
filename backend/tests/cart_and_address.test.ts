import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 5 — Customer Panel, Guest Cart, Persistent Cart & Address Management', () => {
  const app = createApp();

  const mockUser = { id: 'cust-uuid-1', email: 'cust1@example.com' };
  const mockProfile = {
    id: 'cust-uuid-1',
    role: 'customer',
    full_name: 'Sameer Ahmad',
    phone: '9876543210',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const setupAuthMocks = () => {
    vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    } as any);
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------- Customer Address Management -----------------
  describe('1. Customer Addresses (/api/v1/customers/me/addresses)', () => {
    it('requires authentication for customer addresses (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/customers/me/addresses');
      expect(res.status).toBe(401);
    });

    it('creates an address, enforces user ownership and default address logic', async () => {
      setupAuthMocks();

      const createdAddress = {
        id: 'addr-uuid-1',
        user_id: 'cust-uuid-1',
        recipient_name: 'Sameer Ahmad',
        phone: '9876543210',
        address_line1: 'Near Jama Masjid',
        address_line2: 'Main Road',
        landmark: 'Clock Tower',
        city: 'Darbhanga',
        state: 'Bihar',
        postal_code: '846004',
        country: 'India',
        address_type: 'Home',
        is_default: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'customer_addresses') {
            return {
              select: () => ({
                eq: () => ({ count: 0 }),
              }),
              update: () => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: createdAddress, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/customers/me/addresses')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          recipientName: 'Sameer Ahmad',
          phone: '9876543210',
          addressLine1: 'Near Jama Masjid',
          addressLine2: 'Main Road',
          landmark: 'Clock Tower',
          city: 'Darbhanga',
          state: 'Bihar',
          postalCode: '846004',
          country: 'India',
          addressType: 'Home',
          isDefault: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recipient_name).toBe('Sameer Ahmad');
      expect(res.body.data.postal_code).toBe('846004');
    });

    it('rejects invalid postal code and invalid phone format (400 Bad Request)', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/customers/me/addresses')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          recipientName: 'Sameer',
          phone: '123', // invalid
          addressLine1: 'Shop #4',
          city: 'Patna',
          state: 'Bihar',
          postalCode: 'ABC12', // invalid
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('validation');

    });

    it('prevents user from reading another customer address (404 Not Found)', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'customer_addresses') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get('/api/v1/customers/me/addresses/11111111-1111-1111-1111-111111111111')
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(404);
    });

    it('sets default address and atomically updates existing default', async () => {
      setupAuthMocks();

      const mockClearOthers = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const updatedAddr = {
        id: '22222222-2222-2222-2222-222222222222',
        user_id: 'cust-uuid-1',
        recipient_name: 'Mohammad',
        phone: '9876543210',
        address_line1: 'Boring Road',
        city: 'Patna',
        state: 'Bihar',
        postal_code: '800001',
        country: 'India',
        is_default: true,
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'customer_addresses') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({
                      data: { id: '22222222-2222-2222-2222-222222222222', user_id: 'cust-uuid-1' },
                    }),
                  }),
                }),
              }),
              update: (payload: any) => {
                if (payload.is_default === false) {
                  return mockClearOthers();
                }
                return {
                  eq: () => ({
                    eq: () => ({
                      select: () => ({
                        single: vi.fn().mockResolvedValue({ data: updatedAddr, error: null }),
                      }),
                    }),
                  }),
                };
              },
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/customers/me/addresses/22222222-2222-2222-2222-222222222222/default')
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_default).toBe(true);
      expect(mockClearOthers).toHaveBeenCalled();
    });
  });

  // ----------------- Guest Cart Management -----------------
  describe('2. Guest Cart Operations (/api/v1/cart/guest)', () => {
    it('creates a new guest cart and returns cryptographically secure token', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      const mockCart = {
        id: '11111111-1111-1111-1111-111111111111',
        user_id: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'carts') {
            return {
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
                }),
              }),
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
                }),
              }),
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app).post('/api/v1/cart/guest');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cart.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(res.body.data.guestToken).toBeDefined();
      expect(res.body.data.guestToken.length).toBe(64); // 32-byte hex
    });

    it('rejects guest cart operations with missing or invalid token (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/cart/guest');
      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('Missing guest cart token');
    });

    it('rejects guest cart operations when token is not found in database (404 Not Found)', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/v1/cart/guest')
        .set('x-guest-cart-token', 'a'.repeat(64));

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Active guest cart not found');
    });

    it('adds product item to guest cart with server-side price validation', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      const guestCart = { id: '11111111-1111-1111-1111-111111111111', status: 'active' };
      const productRecord = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'PVC Pipe 1 inch',
        base_price: '250.00',
        is_active: true,
        product_images: [{ public_url: 'https://img.co/p1.png', is_primary: true }],
        inventory: [{ quantity_available: 50 }],
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'carts') {
            return {
              select: () => ({
                eq: (col: string) => {
                  if (col === 'id') {
                    return {
                      single: vi.fn().mockResolvedValue({ data: guestCart, error: null }),
                    };
                  }
                  return {
                    eq: () => ({
                      single: vi.fn().mockResolvedValue({ data: guestCart, error: null }),
                    }),
                  };
                },
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: productRecord }),
                }),
              }),
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: (col: string) => {
                  if (col === 'cart_id') {
                    return {
                      order: vi.fn().mockResolvedValue({
                        data: [
                          {
                            id: '33333333-3333-3333-3333-333333333333',
                            cart_id: '11111111-1111-1111-1111-111111111111',
                            product_id: '22222222-2222-2222-2222-222222222222',
                            variant_id: null,
                            quantity: 2,
                            product: productRecord,
                            variant: null,
                          },
                        ],
                      }),
                      eq: () => ({
                        is: () => ({
                          single: vi.fn().mockResolvedValue({ data: null }),
                        }),
                      }),
                    };
                  }
                  return {} as any;
                },
              }),
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '33333333-3333-3333-3333-333333333333' }, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/cart/guest/items')
        .set('x-guest-cart-token', 'a'.repeat(64))
        .send({
          productId: '22222222-2222-2222-2222-222222222222',
          quantity: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemCount).toBe(1);
      expect(res.body.data.totalQuantity).toBe(2);
      expect(res.body.data.subtotal).toBe(500); // 250 * 2 calculated by server
    });

    it('rejects adding inactive product to guest cart (400 Bad Request)', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'carts') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-1111-1111-111111111111', status: 'active' }, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: '22222222-2222-2222-2222-222222222222', name: 'Old Pipe', is_active: false },
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/cart/guest/items')
        .set('x-guest-cart-token', 'a'.repeat(64))
        .send({
          productId: '22222222-2222-2222-2222-222222222222',
          quantity: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('inactive');
    });
  });

  // ----------------- Authenticated Persistent Cart -----------------
  describe('3. Authenticated Persistent Cart (/api/v1/cart)', () => {
    it('retrieves active customer cart with live database prices and availability', async () => {
      setupAuthMocks();

      const activeUserCart = { id: '11111111-1111-1111-1111-111111111111', user_id: 'cust-uuid-1', status: 'active' };
      const product = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Brass Bib Tap',
        base_price: '450.00',
        is_active: true,
        inventory: [{ quantity_available: 15 }],
        product_images: [],
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'carts') {
            return {
              select: () => ({
                eq: (col: string) => {
                  if (col === 'id') {
                    return {
                      single: vi.fn().mockResolvedValue({ data: activeUserCart, error: null }),
                    };
                  }
                  return {
                    eq: () => ({
                      single: vi.fn().mockResolvedValue({ data: activeUserCart, error: null }),
                    }),
                  };
                },
              }),
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: '33333333-3333-3333-3333-333333333333',
                        cart_id: '11111111-1111-1111-1111-111111111111',
                        product_id: '22222222-2222-2222-2222-222222222222',
                        variant_id: null,
                        quantity: 3,
                        product,
                        variant: null,
                      },
                    ],
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemCount).toBe(1);
      expect(res.body.data.totalQuantity).toBe(3);
      expect(res.body.data.subtotal).toBe(1350); // 450 * 3
      expect(res.body.data.items[0].isAvailable).toBe(true);
    });


    it('rejects updating item quantity exceeding maximum limit of 999', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .patch('/api/v1/cart/items/33333333-3333-3333-3333-333333333333')
        .set('Authorization', 'Bearer customer-token')
        .send({ quantity: 1500 });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('validation');
    });


    it('clears all items in customer cart via DELETE /api/v1/cart/items', async () => {
      setupAuthMocks();

      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'carts') {
            return {
              select: () => ({
                eq: (col: string) => {
                  if (col === 'id') {
                    return {
                      single: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-1111-1111-111111111111' }, error: null }),
                    };
                  }
                  return {
                    eq: () => ({
                      single: vi.fn().mockResolvedValue({ data: { id: '11111111-1111-1111-1111-111111111111' }, error: null }),
                    }),
                  };
                },
              }),
            };
          }
          if (table === 'cart_items') {
            return {
              delete: mockDelete,
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .delete('/api/v1/cart/items')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(200);
      expect(mockDelete).toHaveBeenCalled();
      expect(res.body.data.itemCount).toBe(0);
      expect(res.body.data.subtotal).toBe(0);
    });
  });

  // ----------------- Cart Merging After Login -----------------
  describe('4. Cart Merging Post-Authentication (/api/v1/cart/merge)', () => {
    it('merges guest cart items into authenticated user cart atomically and marks guest cart merged', async () => {
      setupAuthMocks();

      const guestCart = { id: '11111111-1111-1111-1111-111111111111', status: 'active' };
      const userCart = { id: '22222222-2222-2222-2222-222222222222', user_id: 'cust-uuid-1', status: 'active' };

      const guestItems = [
        { id: '33333333-3333-3333-3333-333333333333', cart_id: '11111111-1111-1111-1111-111111111111', product_id: '44444444-4444-4444-4444-444444444444', variant_id: null, quantity: 2 },
      ];

      const productA = {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'CPVC Elbow 90 Deg',
        base_price: '40.00',
        is_active: true,
        inventory: [{ quantity_available: 100 }],
        product_images: [],
      };

      const mockCartStatusUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'carts') {
            return {
              select: () => ({
                eq: (col: string) => {
                  if (col === 'guest_cart_token_hash') {
                    return {
                      eq: () => ({
                        single: vi.fn().mockResolvedValue({ data: guestCart, error: null }),
                      }),
                    };
                  }
                  if (col === 'id') {
                    return {
                      single: vi.fn().mockResolvedValue({ data: userCart, error: null }),
                    };
                  }
                  return {
                    eq: () => ({
                      single: vi.fn().mockResolvedValue({ data: userCart, error: null }),
                    }),
                  };
                },
              }),
              update: mockCartStatusUpdate,
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: productA, error: null }),
                }),
              }),
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  order: vi.fn().mockReturnValue(
                    Promise.resolve({
                      data: val === '11111111-1111-1111-1111-111111111111'
                        ? [
                            {
                              id: '33333333-3333-3333-3333-333333333333',
                              cart_id: '11111111-1111-1111-1111-111111111111',
                              product_id: '44444444-4444-4444-4444-444444444444',
                              variant_id: null,
                              quantity: 2,
                              product: productA,
                              variant: null,
                            },
                          ]
                        : [
                            {
                              id: '55555555-5555-5555-5555-555555555555',
                              cart_id: '22222222-2222-2222-2222-222222222222',
                              product_id: '44444444-4444-4444-4444-444444444444',
                              variant_id: null,
                              quantity: 2,
                              product: productA,
                              variant: null,
                            },
                          ],
                    })
                  ),
                  eq: () => ({
                    is: () => ({
                      single: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '55555555-5555-5555-5555-555555555555' } }),
                }),
              }),
              delete: () => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }


          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/cart/merge')
        .set('Authorization', 'Bearer customer-token')
        .send({
          guestToken: 'b'.repeat(64),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subtotal).toBe(80); // 40 * 2
      expect(mockCartStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'merged' }));
    });
  });

  // ----------------- Wishlist Feature -----------------
  describe('5. Customer Wishlist (/api/v1/customers/me/wishlist)', () => {
    it('retrieves user wishlist with product information', async () => {
      setupAuthMocks();

      const mockWishlistItems = [
        {
          id: 'w-1',
          user_id: 'cust-uuid-1',
          product_id: '22222222-2222-2222-2222-222222222222',
          created_at: new Date().toISOString(),
          product: {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Stainless Steel Sink Tap',
            base_price: '890.00',
            is_active: true,
            product_images: [{ storage_path: 'products/sink.png', is_primary: true }],
            brand: { name: 'Jaquar' },
            inventory: [{ quantity_available: 20 }],
          },
        },
      ];

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'wishlists') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: mockWishlistItems, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get('/api/v1/customers/me/wishlist')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Stainless Steel Sink Tap');
    });

    it('adds product to wishlist idempotently', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: '22222222-2222-2222-2222-222222222222', is_active: true }, error: null }),
                }),
              }),
            };
          }
          if (table === 'wishlists') {
            return {
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: 'w-1' }, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/customers/me/wishlist')
        .set('Authorization', 'Bearer customer-token')
        .send({ productId: '22222222-2222-2222-2222-222222222222' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('removes product from customer wishlist', async () => {
      setupAuthMocks();

      const mockDelete = vi.fn().mockReturnValue({
        eq: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'wishlists') {
            return {
              delete: mockDelete,
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .delete('/api/v1/customers/me/wishlist/22222222-2222-2222-2222-222222222222')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
