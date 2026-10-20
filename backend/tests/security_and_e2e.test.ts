import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 9 — End-to-End Testing & Security Hardening', () => {
  const app = createApp();

  const customerUser = {
    id: 'customer-user-uuid-1',
    email: 'customer@hindustanhardware.com',
    role: 'authenticated',
  };

  const adminUser = {
    id: 'admin-user-uuid-1',
    email: 'admin@hindustanhardware.com',
    role: 'authenticated',
  };

  const customerProfile = {
    id: 'customer-user-uuid-1',
    role: 'customer',
    full_name: 'Customer Test',
    phone: '9876543210',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const adminProfile = {
    id: 'admin-user-uuid-1',
    role: 'admin',
    full_name: 'Admin Test',
    phone: '9876543211',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuth = (user = customerUser, profile = customerProfile) => {
    vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
      auth: {
        getUser: vi.fn().mockImplementation((token: string) => {
          if (token === 'customer-token') {
            return Promise.resolve({ data: { user: customerUser }, error: null });
          }
          if (token === 'admin-token') {
            return Promise.resolve({ data: { user: adminUser }, error: null });
          }
          return Promise.resolve({ data: { user: null }, error: new Error('Invalid token') });
        }),
      },
    } as any);

    vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: (field: string, val: any) => ({
                single: vi.fn().mockResolvedValue({
                  data: val === adminUser.id ? adminProfile : customerProfile,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {} as any;
      },
    } as any);
  };

  describe('1. Security Headers, CORS & Rate Limiting Hardening', () => {
    it('serves secure HTTP headers (Helmet: X-Content-Type-Options, X-Frame-Options)', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('propagates unique request ID (x-request-id) across incoming requests and responses', async () => {
      const customId = 'security-req-id-12345';
      const res = await request(app).get('/health').set('x-request-id', customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('blocks disallowed CORS origins when origin is unapproved', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://malicious-attacker-domain.xyz');

      // Express CORS handler rejects or omits Access-Control-Allow-Origin header for non-allowed origins
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects oversized JSON request payloads exceeding limit with 400 Malformed JSON or 413', async () => {
      const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB string
      const res = await request(app)
        .post('/api/v1/checkout/validate')
        .send(largePayload);

      expect([400, 413]).toContain(res.status);
    });
  });

  describe('2. Input Validation, SQL Injection & Malformed Payload Protection', () => {
    it('rejects non-UUID route parameters cleanly without leaking internal database SQL errors', async () => {
      setupAuth(adminUser, adminProfile);

      const res = await request(app)
        .get('/api/v1/admin/orders/123-not-a-uuid-or-injection\'; DROP TABLE orders;--')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Input validation failed');
      // Verify no stack trace or database SQL leaked in output
      expect(JSON.stringify(res.body)).not.toContain('DROP TABLE');
      expect(JSON.stringify(res.body)).not.toContain('pg_catalog');
    });

    it('rejects unexpected non-numeric prices and negative quantities', async () => {
      setupAuth(adminUser, adminProfile);

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', 'Bearer admin-token')
        .send({
          name: 'Invalid Product',
          basePrice: -500, // negative price
          categoryId: '11111111-1111-1111-1111-111111111111',
          brandId: '22222222-2222-2222-2222-222222222222',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Object-Level Authorization & Privilege Escalation Defenses', () => {
    it('strictly prevents ordinary customer from accessing administrative endpoints (403 Forbidden)', async () => {
      setupAuth(customerUser, customerProfile);

      const res = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('strictly prevents customers from self-promoting role to admin via profile update', async () => {
      setupAuth(customerUser, customerProfile);

      const res = await request(app)
        .patch('/api/v1/customers/me')
        .set('Authorization', 'Bearer customer-token')
        .send({
          role: 'admin', // Attempted mass-assignment privilege escalation
        });

      // Zod schema strips or rejects unauthorized role mutation
      expect(res.status).toBe(400);
    });

    it('enforces object ownership isolation preventing users from accessing another customer address', async () => {
      setupAuth(customerUser, customerProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: customerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'customer_addresses') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    // Ownership check fails: address belongs to someone else
                    single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Row not found' } }),
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get('/api/v1/customers/me/addresses/99999999-9999-9999-9999-999999999999')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('4. Complete End-to-End Workflow: Cart -> Checkout -> History -> Cancellation -> Audit Trail', () => {
    it('executes full commerce cycle with COD exclusivity and atomic inventory consistency', async () => {
      setupAuth(customerUser, customerProfile);

      const cartId = '11111111-1111-1111-1111-111111111111';
      const orderId = '22222222-2222-2222-2222-222222222222';
      const productId = '33333333-3333-3333-3333-333333333333';

      let currentStock = 20;
      let orderStatus = 'pending';
      let paymentStatus = 'pending';

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((fnName: string) => {
          if (fnName === 'process_cod_checkout') {
            currentStock -= 2;
            return Promise.resolve({
              data: {
                success: true,
                order_id: orderId,
                is_duplicate: false,
              },
              error: null,
            });
          }
          if (fnName === 'cancel_customer_order') {
            currentStock += 2;
            orderStatus = 'cancelled';
            paymentStatus = 'cancelled';
            return Promise.resolve({
              data: {
                success: true,
                already_cancelled: false,
                order_id: orderId,
                status: 'cancelled',
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
        }),
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: customerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'carts') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: { id: cartId, status: 'active' } }),
                  }),
                  single: vi.fn().mockResolvedValue({ data: { id: cartId, status: 'active' } }),
                }),
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
                        cart_id: cartId,
                        product_id: productId,
                        variant_id: null,
                        quantity: 2,
                        product: {
                          id: productId,
                          name: 'Finolex Rigid PVC Conduit Pipe',
                          slug: 'finolex-pvc-pipe',
                          base_price: 350.0,
                          is_active: true,
                          inventory: [{ quantity_available: currentStock }],
                        },
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
              delete: () => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: productId,
                      name: 'Finolex Rigid PVC Conduit Pipe',
                      base_price: 350.0,
                      is_active: true,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'inventory') {
            return {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    single: vi.fn().mockImplementation(() =>
                      Promise.resolve({
                        data: {
                          id: 'inv-1',
                          product_id: productId,
                          variant_id: null,
                          quantity_available: currentStock,
                        },
                        error: null,
                      })
                    ),
                  }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (f1: string) => ({
                  eq: (f2: string) => ({
                    single: vi.fn().mockImplementation(() => {
                      if (f1 === 'idempotency_key') {
                        // First submission is not a duplicate
                        return Promise.resolve({ data: null, error: { message: 'Not found' } });
                      }
                      return Promise.resolve({
                        data: {
                          id: orderId,
                          order_number: 'HH-20261019-888888',
                          user_id: customerUser.id,
                          status: orderStatus,
                          payment_method: 'cod',
                          payment_status: paymentStatus,
                          subtotal: 700.0,
                          total_amount: 700.0,
                          shipping_address_snapshot: {
                            recipientName: 'Sameer Ahmad',
                            phone: '9876543210',
                            addressLine1: 'Main Market',
                            city: 'Patna',
                            state: 'Bihar',
                            postalCode: '800001',
                          },
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        },
                        error: null,
                      });
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'ord-item-1',
                        order_id: orderId,
                        product_id: productId,
                        variant_id: null,
                        product_name: 'Finolex Rigid PVC Conduit Pipe',
                        unit_price: 350.0,
                        quantity: 2,
                        line_subtotal: 700.0,
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
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockImplementation(() =>
                    Promise.resolve({
                      data: [
                        {
                          id: 'hist-1',
                          order_id: orderId,
                          previous_status: null,
                          new_status: 'pending',
                          created_at: new Date().toISOString(),
                        },
                        ...(orderStatus === 'cancelled'
                          ? [
                              {
                                id: 'hist-2',
                                order_id: orderId,
                                previous_status: 'pending',
                                new_status: 'cancelled',
                                created_at: new Date().toISOString(),
                              },
                            ]
                          : []),
                      ],
                      error: null,
                    })
                  ),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      // Step A: Validate Checkout (Live recalculation)
      const valRes = await request(app)
        .post('/api/v1/checkout/validate')
        .set('Authorization', 'Bearer customer-token')
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

      expect(valRes.status).toBe(200);
      expect(valRes.body.data.subtotal).toBe(700.0);
      expect(valRes.body.data.canCheckout).toBe(true);

      // Step B: Submit Checkout Order
      const orderRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', 'Bearer customer-token')
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
          idempotencyKey: 'idem-flow-test-1111',
        });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.paymentMethod).toBe('cod');
      expect(orderRes.body.data.paymentStatus).toBe('pending');
      expect(currentStock).toBe(18); // Deducted stock

      // Step C: Customer views order details
      const detailRes = await request(app)
        .get(`/api/v1/customers/me/orders/${orderId}`)
        .set('Authorization', 'Bearer customer-token');

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.status).toBe('pending');
      expect(detailRes.body.data.canCancel).toBe(true);

      // Step D: Customer cancels order (Releases stock)
      const cancelRes = await request(app)
        .post(`/api/v1/customers/me/orders/${orderId}/cancel`)
        .set('Authorization', 'Bearer customer-token')
        .send({ reason: 'Found alternative specification' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.paymentStatus).toBe('cancelled');
      expect(currentStock).toBe(20); // Restored stock exactly once
    });
  });
});
