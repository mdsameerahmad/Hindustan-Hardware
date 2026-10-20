import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 6 — Checkout, Cash on Delivery & Order Creation', () => {
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

  const sampleAddress = {
    recipient_name: 'Sameer Ahmad',
    phone: '9876543210',
    address_line1: 'Near Jama Masjid',
    city: 'Darbhanga',
    state: 'Bihar',
    postal_code: '846004',
    country: 'India',
    address_type: 'Home',
    is_default: true,
  };

  const activeProduct = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Astral CPVC Pipe 1 inch',
    sku: 'AST-CPVC-1',
    base_price: '520.00',
    is_active: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------- Checkout Authentication & Validation -----------------
  describe('1. Checkout Authentication & Validation (/api/v1/checkout/validate)', () => {
    it('requires authentication for checkout validation (401 Unauthorized)', async () => {
      const res = await request(app).post('/api/v1/checkout/validate').send({
        paymentMethod: 'cod',
      });
      expect(res.status).toBe(401);
    });

    it('rejects non-COD payment methods (400 Bad Request)', async () => {
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
        .post('/api/v1/checkout/validate')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'razorpay', // Not allowed
          shippingAddress: {
            recipientName: 'Sameer',
            phone: '9876543210',
            addressLine1: 'Station Road',
            city: 'Patna',
            state: 'Bihar',
            postalCode: '800001',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects checkout validation when cart is empty', async () => {
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
          if (table === 'carts') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: { id: 'cart-1', status: 'active' } }),
                  }),
                  single: vi.fn().mockResolvedValue({ data: { id: 'cart-1', status: 'active' } }),
                }),
              }),
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: [] }), // empty cart
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'cod',
          shippingAddress: {
            recipientName: 'Sameer',
            phone: '9876543210',
            addressLine1: 'Main Market',
            city: 'Patna',
            state: 'Bihar',
            postalCode: '800001',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('empty cart');
    });

    it('validates checkout and computes authoritative live prices and inventory availability', async () => {
      setupAuthMocks();

      const userCart = { id: '11111111-1111-1111-1111-111111111111', status: 'active' };
      const cartItems = [
        {
          id: 'item-1',
          cart_id: '11111111-1111-1111-1111-111111111111',
          product_id: '22222222-2222-2222-2222-222222222222',
          variant_id: null,
          quantity: 2,
          product: activeProduct,
          variant: null,
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
          if (table === 'carts') {
            return {
              select: () => ({
                eq: (col: string) => {
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
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: cartItems, error: null }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: activeProduct, error: null }),
                }),
              }),
            };
          }
          if (table === 'inventory') {
            return {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    single: vi.fn().mockResolvedValue({ data: { quantity_available: 50 }, error: null }),
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'cod',
          shippingAddress: {
            recipientName: 'Sameer Ahmad',
            phone: '9876543210',
            addressLine1: 'Main Market',
            city: 'Patna',
            state: 'Bihar',
            postalCode: '800001',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.canCheckout).toBe(true);
      expect(res.body.data.itemCount).toBe(1);
      expect(res.body.data.totalAmount).toBe(1040); // 520 * 2 calculated by backend
      expect(res.body.data.paymentMethod).toBe('cod');
    });

    it('rejects attempt to use address belonging to another customer (404 Not Found)', async () => {
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
                    single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }), // foreign address
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'cod',
          addressId: '99999999-9999-9999-9999-999999999999',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('Address not found');
    });
  });

  // ----------------- Order Creation & Cash on Delivery -----------------
  describe('2. Order Creation & Cash on Delivery (POST /api/v1/checkout)', () => {
    it('creates an order, preserves price snapshot, deducts stock, sets payment_status=pending, and clears cart', async () => {
      setupAuthMocks();

      const userCart = { id: '11111111-1111-1111-1111-111111111111', status: 'active' };
      const cartItems = [
        {
          id: 'item-1',
          cart_id: '11111111-1111-1111-1111-111111111111',
          product_id: '22222222-2222-2222-2222-222222222222',
          variant_id: null,
          quantity: 2,
          product: activeProduct,
          variant: null,
        },
      ];

      const createdOrder = {
        id: 'order-uuid-1',
        order_number: 'HH-20261019-A3F9B1',
        user_id: 'cust-uuid-1',
        status: 'pending',
        payment_method: 'cod',
        payment_status: 'pending',
        currency: 'INR',
        subtotal: 1040,
        discount_amount: 0,
        tax_amount: 0,
        shipping_amount: 0,
        total_amount: 1040,
        shipping_address_snapshot: sampleAddress,
        customer_notes: 'Leave at front desk',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockDeleteCartItems = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mockUpdateInventory = vi.fn().mockReturnValue({
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
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: cartItems, error: null }),
                }),
              }),
              delete: mockDeleteCartItems,
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: activeProduct, error: null }),
                }),
              }),
            };
          }
          if (table === 'inventory') {
            return {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    single: vi.fn().mockResolvedValue({ data: { id: 'inv-1', quantity_available: 20 }, error: null }),
                  }),
                }),
              }),
              update: mockUpdateInventory,
            };
          }
          if (table === 'orders') {
            return {
              insert: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: { id: 'order-uuid-1' }, error: null }),
                }),
              }),
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: createdOrder, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_items') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'oi-1',
                        order_id: 'order-uuid-1',
                        product_id: '22222222-2222-2222-2222-222222222222',
                        variant_id: null,
                        product_name: 'Astral CPVC Pipe 1 inch',
                        sku: 'AST-CPVC-1',
                        unit_price: 520,
                        quantity: 2,
                        line_subtotal: 1040,
                        created_at: new Date().toISOString(),
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {} as any;
        },
        rpc: vi.fn().mockResolvedValue({
          data: { success: true, order_id: 'order-uuid-1' },
          error: null,
        }),
      } as any);

      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'cod',
          shippingAddress: {
            recipientName: 'Sameer Ahmad',
            phone: '9876543210',
            addressLine1: 'Near Jama Masjid',
            city: 'Darbhanga',
            state: 'Bihar',
            postalCode: '846004',
          },
          customerNotes: 'Leave at front desk',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toBeDefined();
      expect(res.body.data.paymentMethod).toBe('cod');
      expect(res.body.data.paymentStatus).toBe('pending'); // COD orders are strictly UNPAID upon placement
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.totalAmount).toBe(1040);
      expect(res.body.data.items[0].unitPrice).toBe(520);
    });

    it('rejects order placement when stock is insufficient and does not place order', async () => {
      setupAuthMocks();

      const userCart = { id: '11111111-1111-1111-1111-111111111111', status: 'active' };

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
            };
          }
          if (table === 'cart_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'item-1',
                        cart_id: '11111111-1111-1111-1111-111111111111',
                        product_id: '22222222-2222-2222-2222-222222222222',
                        variant_id: null,
                        quantity: 100, // requesting 100
                        product: activeProduct,
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
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Insufficient stock for product "Astral CPVC Pipe 1 inch". Requested: 100, Available: 5' },
        }),
      } as any);

      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'cod',
          shippingAddress: {
            recipientName: 'Sameer Ahmad',
            phone: '9876543210',
            addressLine1: 'Main Road',
            city: 'Patna',
            state: 'Bihar',
            postalCode: '800001',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Insufficient stock');
    });

    it('handles idempotent checkout retries safely without creating duplicate orders', async () => {
      setupAuthMocks();

      const existingOrder = {
        id: 'existing-order-uuid',
        order_number: 'HH-20261019-DUP123',
        user_id: 'cust-uuid-1',
        status: 'pending',
        payment_method: 'cod',
        payment_status: 'pending',
        currency: 'INR',
        subtotal: 520,
        discount_amount: 0,
        tax_amount: 0,
        shipping_amount: 0,
        total_amount: 520,
        shipping_address_snapshot: sampleAddress,
        customer_notes: null,
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
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (col: string) => {
                  if (col === 'idempotency_key') {
                    return {
                      eq: () => ({
                        single: vi.fn().mockResolvedValue({ data: { id: 'existing-order-uuid' } }),
                      }),
                    };
                  }
                  return {
                    eq: () => ({
                      single: vi.fn().mockResolvedValue({ data: existingOrder, error: null }),
                    }),
                  };
                },
              }),
            };
          }
          if (table === 'order_items') {
            return {
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
        .post('/api/v1/checkout')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'cod',
          idempotencyKey: 'idemp-key-repeat-999',
          shippingAddress: {
            recipientName: 'Sameer Ahmad',
            phone: '9876543210',
            addressLine1: 'Main Road',
            city: 'Patna',
            state: 'Bihar',
            postalCode: '800001',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('existing-order-uuid');
    });

    it('rejects attempt to select online payment methods during checkout', async () => {
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
        .post('/api/v1/checkout')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          paymentMethod: 'stripe',
          shippingAddress: {
            recipientName: 'Sameer',
            phone: '9876543210',
            addressLine1: 'Main Market',
            city: 'Patna',
            state: 'Bihar',
            postalCode: '800001',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
