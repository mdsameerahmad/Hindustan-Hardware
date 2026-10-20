import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 7 — Customer Order Management, Order History & Status Tracking', () => {
  const app = createApp();
  const customerUser = {
    id: 'customer-user-uuid-1111',
    email: 'customer@hindustanhardware.com',
    role: 'authenticated',
  };

  const otherCustomerUser = {
    id: 'other-customer-uuid-2222',
    email: 'other@hindustanhardware.com',
    role: 'authenticated',
  };

  const mockCustomerProfile = {
    id: 'customer-user-uuid-1111',
    role: 'customer',
    full_name: 'Sameer Ahmad',
    phone: '9876543210',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleOrder1 = {
    id: '11111111-1111-1111-1111-111111111111',
    order_number: 'HH-20261019-000001',
    user_id: 'customer-user-uuid-1111',
    status: 'pending',
    payment_method: 'cod',
    payment_status: 'pending',
    currency: 'INR',
    subtotal: 1250.0,
    discount_amount: 0.0,
    tax_amount: 0.0,
    shipping_amount: 0.0,
    total_amount: 1250.0,
    shipping_address_snapshot: {
      recipientName: 'Sameer Ahmad',
      phone: '9876543210',
      addressLine1: 'Main Road',
      city: 'Patna',
      state: 'Bihar',
      postalCode: '800001',
    },
    customer_notes: 'Please call before delivery',
    created_at: '2026-10-19T10:00:00.000Z',
    updated_at: '2026-10-19T10:00:00.000Z',
    order_items: [
      { id: 'item-1', quantity: 2 },
      { id: 'item-2', quantity: 1 },
    ],
  };

  const sampleOrder2 = {
    id: '22222222-2222-2222-2222-222222222222',
    order_number: 'HH-20261019-000002',
    user_id: 'customer-user-uuid-1111',
    status: 'confirmed',
    payment_method: 'cod',
    payment_status: 'pending',
    currency: 'INR',
    subtotal: 450.0,
    discount_amount: 0.0,
    tax_amount: 0.0,
    shipping_amount: 0.0,
    total_amount: 450.0,
    shipping_address_snapshot: {
      recipientName: 'Sameer Ahmad',
      phone: '9876543210',
      addressLine1: 'Station Road',
      city: 'Patna',
      state: 'Bihar',
      postalCode: '800001',
    },
    customer_notes: null,
    created_at: '2026-10-19T11:00:00.000Z',
    updated_at: '2026-10-19T11:00:00.000Z',
    order_items: [{ id: 'item-3', quantity: 1 }],
  };

  const sampleOrderItems = [
    {
      id: 'item-uuid-1',
      order_id: '11111111-1111-1111-1111-111111111111',
      product_id: 'prod-1',
      variant_id: 'var-1',
      product_name: 'Astral CPVC Pipe 1 inch',
      sku: 'AST-CPVC-1',
      variant_title: '1 inch / 3 meters',
      specifications: { length: '3m' },
      unit_price: '500.00',
      quantity: 2,
      line_subtotal: '1000.00',
      created_at: '2026-10-19T10:00:00.000Z',
    },
    {
      id: 'item-uuid-2',
      order_id: '11111111-1111-1111-1111-111111111111',
      product_id: 'prod-2',
      variant_id: null,
      product_name: 'Teflon Sealing Tape',
      sku: 'TEF-TAPE-01',
      variant_title: null,
      specifications: {},
      unit_price: '250.00',
      quantity: 1,
      line_subtotal: '250.00',
      created_at: '2026-10-19T10:00:00.000Z',
    },
  ];

  const sampleStatusHistory = [
    {
      id: 'history-1',
      order_id: '11111111-1111-1111-1111-111111111111',
      previous_status: null,
      new_status: 'pending',
      actor_id: 'customer-user-uuid-1111',
      reason: 'Order placed by customer via Cash on Delivery',
      created_at: '2026-10-19T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuthMocks = (user = customerUser, profile = mockCustomerProfile) => {
    vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
      auth: {
        getUser: vi.fn().mockImplementation((token: string) => {
          if (token === 'valid-customer-token') {
            return Promise.resolve({ data: { user }, error: null });
          }
          if (token === 'other-customer-token') {
            return Promise.resolve({ data: { user: otherCustomerUser }, error: null });
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
              eq: () => ({
                single: vi.fn().mockResolvedValue({ data: profile, error: null }),
              }),
            }),
          };
        }
        return {} as any;
      },
    } as any);
  };

  describe('1. Customer Order History (GET /api/v1/customers/me/orders)', () => {
    it('requires authentication and rejects unauthenticated request with 401', async () => {
      setupAuthMocks();
      const res = await request(app).get('/api/v1/customers/me/orders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns empty list naturally with accurate pagination when customer has no orders', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return {
                    eq: () => Promise.resolve({ count: 0, error: null }),
                  };
                }
                return {
                  eq: () => ({
                    order: () => ({
                      range: vi.fn().mockResolvedValue({ data: [], error: null }),
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
        .get('/api/v1/customers/me/orders')
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.pagination.page).toBe(1);
    });

    it('returns paginated orders scoped strictly to authenticated customer', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return {
                    eq: (field: string, val: any) => {
                      expect(field).toBe('user_id');
                      expect(val).toBe(customerUser.id);
                      return Promise.resolve({ count: 2, error: null });
                    },
                  };
                }
                return {
                  eq: (field: string, val: any) => {
                    expect(field).toBe('user_id');
                    expect(val).toBe(customerUser.id);
                    return {
                      order: () => ({
                        range: vi.fn().mockResolvedValue({
                          data: [sampleOrder2, sampleOrder1],
                          error: null,
                        }),
                      }),
                    };
                  },
                };
              },
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get('/api/v1/customers/me/orders?page=1&limit=10')
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.items[0].orderNumber).toBe('HH-20261019-000002');
      expect(res.body.data.items[0].paymentMethod).toBe('cod');
      expect(res.body.data.items[0].paymentStatus).toBe('pending');
      expect(res.body.data.items[0].totalAmount).toBe(450.0);
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('validates query parameters and rejects invalid status filter', async () => {
      setupAuthMocks();

      const res = await request(app)
        .get('/api/v1/customers/me/orders?status=invalid_status_xyz')
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. Order Details & Snapshot Preservation (GET /api/v1/customers/me/orders/:orderId)', () => {
    it('returns comprehensive order details with historical snapshot and chronological status history', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (f1: string, val1: any) => ({
                  eq: (f2: string, val2: any) => ({
                    single: vi.fn().mockResolvedValue({ data: sampleOrder1, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: sampleOrderItems, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: sampleStatusHistory, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get(`/api/v1/customers/me/orders/${sampleOrder1.id}`)
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toBe('HH-20261019-000001');
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.paymentMethod).toBe('cod');
      expect(res.body.data.paymentStatus).toBe('pending');
      expect(res.body.data.canCancel).toBe(true);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.items[0].productName).toBe('Astral CPVC Pipe 1 inch');
      expect(res.body.data.items[0].unitPrice).toBe(500.0);
      expect(res.body.data.statusHistory.length).toBe(1);
      expect(res.body.data.statusHistory[0].newStatus).toBe('pending');
    });

    it('returns safe 404 Not Found when order belongs to another customer or does not exist', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
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
        .get('/api/v1/customers/me/orders/99999999-9999-9999-9999-999999999999')
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects malformed order UUID parameter with 400 Validation Error', async () => {
      setupAuthMocks();

      const res = await request(app)
        .get('/api/v1/customers/me/orders/not-a-valid-uuid')
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Order Status Tracking (GET /api/v1/customers/me/orders/:orderId/status)', () => {
    it('returns status tracking and chronological transition history without GPS or driver simulation', async () => {
      setupAuthMocks();

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: sampleOrder1, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: sampleOrderItems, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: sampleStatusHistory, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get(`/api/v1/customers/me/orders/${sampleOrder1.id}/status`)
        .set('Authorization', 'Bearer valid-customer-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(sampleOrder1.id);
      expect(res.body.data.currentStatus).toBe('pending');
      expect(res.body.data.paymentMethod).toBe('cod');
      expect(res.body.data.paymentStatus).toBe('pending');
      expect(res.body.data.history.length).toBe(1);
      // Ensure no driver/GPS fields are fabricated
      expect(res.body.data.gps).toBeUndefined();
      expect(res.body.data.driver).toBeUndefined();
    });
  });

  describe('4. Order Cancellation & Stock Restoration (POST /api/v1/customers/me/orders/:orderId/cancel)', () => {
    it('cancels eligible pending order, restores inventory exactly once, and records status history', async () => {
      setupAuthMocks();

      let orderStatus = 'pending';
      let paymentStatus = 'pending';
      const inventoryLevels: Record<string, number> = {
        'prod-1': 10,
        'prod-2': 5,
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        rpc: vi.fn().mockImplementation((fnName: string, args: any) => {
          if (fnName === 'cancel_customer_order') {
            orderStatus = 'cancelled';
            paymentStatus = 'cancelled';
            return Promise.resolve({
              data: {
                success: true,
                already_cancelled: false,
                order_id: args.p_order_id,
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
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockImplementation(() =>
                      Promise.resolve({
                        data: {
                          ...sampleOrder1,
                          status: orderStatus,
                          payment_status: paymentStatus,
                        },
                        error: null,
                      })
                    ),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: sampleOrderItems, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      ...sampleStatusHistory,
                      {
                        id: 'hist-2',
                        order_id: sampleOrder1.id,
                        previous_status: 'pending',
                        new_status: 'cancelled',
                        actor_id: customerUser.id,
                        reason: 'Changed my mind',
                        created_at: new Date().toISOString(),
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post(`/api/v1/customers/me/orders/${sampleOrder1.id}/cancel`)
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          reason: 'Changed my mind',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.paymentStatus).toBe('cancelled');
      expect(res.body.data.canCancel).toBe(false);
    });

    it('rejects cancellation when order has advanced to processing, shipped, or delivered status', async () => {
      setupAuthMocks();

      const shippedOrder = {
        ...sampleOrder1,
        status: 'shipped',
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: false,
            code: 'CANCELLATION_NOT_ALLOWED',
            message: 'Order cannot be cancelled in "shipped" status.',
          },
          error: null,
        }),
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: shippedOrder, error: null }),
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post(`/api/v1/customers/me/orders/${sampleOrder1.id}/cancel`)
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          reason: 'Need to cancel',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cannot be cancelled');
    });

    it('handles repeated cancellation requests idempotently without double-restoring stock', async () => {
      setupAuthMocks();

      const cancelledOrder = {
        ...sampleOrder1,
        status: 'cancelled',
        payment_status: 'cancelled',
      };

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: {
            success: true,
            already_cancelled: true,
            order_id: sampleOrder1.id,
            status: 'cancelled',
            message: 'Order is already cancelled.',
          },
          error: null,
        }),
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: mockCustomerProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: cancelledOrder, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_items') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: sampleOrderItems, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: vi.fn().mockResolvedValue({ data: sampleStatusHistory, error: null }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post(`/api/v1/customers/me/orders/${sampleOrder1.id}/cancel`)
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          reason: 'Duplicate retry',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('validates cancellation reason length and rejects overly short reasons', async () => {
      setupAuthMocks();

      const res = await request(app)
        .post(`/api/v1/customers/me/orders/${sampleOrder1.id}/cancel`)
        .set('Authorization', 'Bearer valid-customer-token')
        .send({
          reason: 'no', // less than 3 chars
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
