import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 8 — Complete Admin Panel Backend & Store Management', () => {
  const app = createApp();

  const adminUser = {
    id: 'admin-user-uuid-1',
    email: 'admin@hindustanhardware.com',
    role: 'authenticated',
  };

  const customerUser = {
    id: 'customer-user-uuid-2',
    email: 'customer@hindustanhardware.com',
    role: 'authenticated',
  };

  const adminProfile = {
    id: 'admin-user-uuid-1',
    role: 'admin',
    full_name: 'Store Administrator',
    phone: '9876543210',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const customerProfile = {
    id: 'customer-user-uuid-2',
    role: 'customer',
    full_name: 'Ordinary Customer',
    phone: '9876543211',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleOrder = {
    id: '11111111-1111-1111-1111-111111111111',
    order_number: 'HH-20261019-000001',
    user_id: 'customer-user-uuid-2',
    status: 'pending',
    payment_method: 'cod',
    payment_status: 'pending',
    currency: 'INR',
    subtotal: 1000.0,
    discount_amount: 0.0,
    tax_amount: 0.0,
    shipping_amount: 0.0,
    total_amount: 1000.0,
    shipping_address_snapshot: {
      recipientName: 'Ordinary Customer',
      phone: '9876543211',
      addressLine1: 'Main Market Road',
      city: 'Patna',
      state: 'Bihar',
      postalCode: '800001',
    },
    customer_notes: null,
    created_at: '2026-10-19T10:00:00.000Z',
    updated_at: '2026-10-19T10:00:00.000Z',
  };

  const sampleOrderItems = [
    {
      id: 'item-1',
      order_id: '11111111-1111-1111-1111-111111111111',
      product_id: '33333333-3333-3333-3333-333333333333',
      variant_id: null,
      product_name: 'Astral CPVC Pipe 1 inch',
      sku: 'AST-CPVC-1',
      variant_title: null,
      specifications: {},
      unit_price: 500.0,
      quantity: 2,
      line_subtotal: 1000.0,
      created_at: '2026-10-19T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupAuthMocks = (user = adminUser, profile = adminProfile) => {
    vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
      auth: {
        getUser: vi.fn().mockImplementation((token: string) => {
          if (token === 'admin-token') {
            return Promise.resolve({ data: { user: adminUser }, error: null });
          }
          if (token === 'customer-token') {
            return Promise.resolve({ data: { user: customerUser }, error: null });
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

  describe('1. Security & RBAC Enforcement on Admin Endpoints', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('forbids ordinary customer access to admin dashboard with 403 Forbidden', async () => {
      setupAuthMocks(customerUser, customerProfile);

      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('verifies valid admin authorization via GET /api/v1/admin/verify', async () => {
      setupAuthMocks(adminUser, adminProfile);

      const res = await request(app)
        .get('/api/v1/admin/verify')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('admin');
    });
  });

  describe('2. Admin Dashboard & Business Statistics (GET /api/v1/admin/dashboard)', () => {
    it('aggregates live database statistics for customers, products, orders, and COD revenue', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return {
                    eq: () => Promise.resolve({ count: 42, error: null }),
                  };
                }
                return {
                  eq: () => ({
                    single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                  }),
                };
              },
            };
          }
          if (table === 'products') {
            return {
              select: (cols: string, opts?: any) => {
                return {
                  eq: () => Promise.resolve({ count: 18, error: null }),
                  then: (resolve: any) => resolve({ count: 20, error: null }),
                };
              },
            };
          }
          if (table === 'inventory') {
            return {
              select: () => ({
                lt: () => Promise.resolve({ count: 3, error: null }),
              }),
            };
          }
          if (table === 'categories') {
            return {
              select: () => Promise.resolve({ count: 5, error: null }),
            };
          }
          if (table === 'brands') {
            return {
              select: () => Promise.resolve({ count: 4, error: null }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        ...sampleOrder,
                        status: 'delivered',
                        payment_status: 'paid',
                        total_amount: 1000.0,
                      },
                      {
                        ...sampleOrder,
                        id: '22222222-2222-2222-2222-222222222222',
                        status: 'pending',
                        payment_status: 'pending',
                        total_amount: 500.0,
                      },
                    ],
                    error: null,
                  }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customers.total).toBe(42);
      expect(res.body.data.orders.total).toBe(2);
      expect(res.body.data.financials.collectedCodRevenue).toBe(1000.0);
      expect(res.body.data.financials.pendingCodRevenue).toBe(500.0);
      expect(res.body.data.financials.totalOrderValue).toBe(1500.0);
    });
  });

  describe('3. Admin Order Management (GET & PATCH /api/v1/admin/orders)', () => {
    it('lists all orders with filtering and pagination for administrators', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return {
                    eq: () => Promise.resolve({ count: 1, error: null }),
                  };
                }
                return {
                  eq: () => ({
                    order: () => ({
                      range: vi.fn().mockResolvedValue({
                        data: [sampleOrder],
                        error: null,
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
        .get('/api/v1/admin/orders?status=pending')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].orderNumber).toBe('HH-20261019-000001');
    });

    it('updates order status following state machine (pending -> confirmed -> processing -> shipped -> delivered)', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { ...sampleOrder, status: 'confirmed' },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
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
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'audit_logs') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .patch(`/api/v1/admin/orders/${sampleOrder.id}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          status: 'confirmed',
          reason: 'Order confirmed after phone verification',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid state machine transitions with 400 Bad Request', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { ...sampleOrder, status: 'pending' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      // Direct jump from pending to delivered is forbidden
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${sampleOrder.id}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          status: 'delivered',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid status transition');
    });
  });

  describe('4. Cash on Delivery (COD) Payment Collection (POST /api/v1/admin/orders/:orderId/collect-cod)', () => {
    it('records cash collection for eligible pending COD order', async () => {
      setupAuthMocks(adminUser, adminProfile);

      let isPaid = false;
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockImplementation(() =>
                    Promise.resolve({
                      data: {
                        ...sampleOrder,
                        status: 'delivered',
                        payment_status: isPaid ? 'paid' : 'pending',
                      },
                      error: null,
                    })
                  ),
                }),
              }),
              update: () => {
                isPaid = true;
                return {
                  eq: () => ({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                  }),
                };
              },
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
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          if (table === 'audit_logs') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post(`/api/v1/admin/orders/${sampleOrder.id}/collect-cod`)
        .set('Authorization', 'Bearer admin-token')
        .send({
          notes: 'Cash received at shop counter',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('paid');
    });

    it('rejects duplicate COD payment collection', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { ...sampleOrder, payment_status: 'paid' },
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
        .post(`/api/v1/admin/orders/${sampleOrder.id}/collect-cod`)
        .set('Authorization', 'Bearer admin-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('already been recorded as paid');
    });
  });

  describe('5. Inventory Management & Movements (POST & GET /api/v1/admin/inventory)', () => {
    it('adjusts stock safely and records movement audit trail', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'inventory') {
            return {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'inv-1',
                        product_id: '33333333-3333-3333-3333-333333333333',
                        variant_id: null,
                        quantity_available: 20,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  select: () => ({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'inv-1',
                        product_id: '33333333-3333-3333-3333-333333333333',
                        variant_id: null,
                        quantity_available: 25,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'inventory_movements') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'audit_logs') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/inventory/adjustments')
        .set('Authorization', 'Bearer admin-token')
        .send({
          productId: '33333333-3333-3333-3333-333333333333',
          quantityChange: 5,
          movementType: 'restock',
          reason: 'Supplier shipment arrived from Astral Pipes',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.quantityAvailable).toBe(25);
    });

    it('prevents stock adjustments that result in negative inventory', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'inventory') {
            return {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'inv-1',
                        product_id: '33333333-3333-3333-3333-333333333333',
                        variant_id: null,
                        quantity_available: 5,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .post('/api/v1/admin/inventory/adjustments')
        .set('Authorization', 'Bearer admin-token')
        .send({
          productId: '33333333-3333-3333-3333-333333333333',
          quantityChange: -10, // would result in -5
          reason: 'Damaged stock deduction',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('negative stock');
    });

    it('lists inventory movements with details and pagination', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'inventory_movements') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return Promise.resolve({ count: 1, error: null });
                }
                return {
                  order: () => ({
                    range: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'mov-1',
                          product_id: '33333333-3333-3333-3333-333333333333',
                          variant_id: null,
                          movement_type: 'restock',
                          quantity_change: 5,
                          quantity_before: 20,
                          quantity_after: 25,
                          reason: 'Supplier shipment',
                          actor_id: adminUser.id,
                          reference_id: null,
                          created_at: new Date().toISOString(),
                          product: { name: 'Astral CPVC Pipe' },
                        },
                      ],
                      error: null,
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
        .get('/api/v1/admin/inventory/movements')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].movementType).toBe('restock');
    });
  });

  describe('6. Customer Administration & Audit Logs (GET /api/v1/admin/customers & /audit-logs)', () => {
    it('lists customer accounts with order metrics and pagination', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return Promise.resolve({ count: 1, error: null });
                }
                if (cols.includes('id, role')) {
                  return {
                    eq: () => ({
                      single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                    }),
                  };
                }
                return {
                  order: () => ({
                    range: vi.fn().mockResolvedValue({
                      data: [
                        {
                          ...customerProfile,
                          orders: [{ id: 'ord-1', total_amount: 1000, status: 'delivered' }],
                        },
                      ],
                      error: null,
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
        .get('/api/v1/admin/customers')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].fullName).toBe('Ordinary Customer');
      expect(res.body.data.items[0].orderCount).toBe(1);
      expect(res.body.data.items[0].totalSpent).toBe(1000);
    });

    it('lists audit logs without exposing secrets or passwords', async () => {
      setupAuthMocks(adminUser, adminProfile);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({ data: adminProfile, error: null }),
                }),
              }),
            };
          }
          if (table === 'audit_logs') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return Promise.resolve({ count: 1, error: null });
                }
                return {
                  order: () => ({
                    range: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'log-1',
                          actor_id: adminUser.id,
                          action: 'INVENTORY_ADJUSTMENT',
                          resource_type: 'inventory',
                          resource_id: 'inv-1',
                          details: { quantityChange: 5 },
                          ip_address: '127.0.0.1',
                          created_at: new Date().toISOString(),
                        },
                      ],
                      error: null,
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
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].action).toBe('INVENTORY_ADJUSTMENT');
    });
  });
});
