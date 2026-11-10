import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { initSocketIO, closeSocketIO, broadcastDeliveryLocation } from '../src/common/socket/trackingSocket';
import { RoadRoutingService } from '../src/services/roadRoutingService';
import { OsrmRoutingProvider } from '../src/services/osrmRoutingProvider';
import * as supabaseConfig from '../src/config/supabase';
import { hashDeliveryOtp } from '../src/services/deliveryOtpService';

describe('Phase 5 — Full E2E Delivery Tracking Lifecycle & Security Audit', () => {
  let app: any;
  let server: http.Server;
  let serverPort: number;
  let socketUrl: string;

  const mockAdminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const mockPartnerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const mockCustomerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const mockIntruderId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const mockOrderId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const mockDeliveryId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  beforeEach(async () => {
    vi.restoreAllMocks();
    RoadRoutingService.clearCache();
    await closeSocketIO();

    app = createApp();
    server = http.createServer(app);
    initSocketIO(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        serverPort = address.port;
        socketUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    RoadRoutingService.clearCache();
    await closeSocketIO();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Lifecycle Step 1 & 2: Order & Delivery Assignment Verification', () => {
    it('allows Admin to assign a delivery partner to an existing order', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockAdminId, email: 'admin@hindustan.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  single: async () => {
                    if (val === mockAdminId) return { data: { id: mockAdminId, role: 'admin' }, error: null };
                    if (val === mockPartnerId) return { data: { id: mockPartnerId, role: 'delivery_partner', full_name: 'Ramesh Singh' }, error: null };
                    return { data: null, error: new Error('User not found') };
                  },
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockOrderId, user_id: mockCustomerId, status: 'confirmed' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              update: () => ({
                eq: () => ({
                  in: async () => ({ error: null }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId,
                      customer_id: mockCustomerId,
                      status: 'assigned',
                      assigned_at: new Date().toISOString(),
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const res = await request(app)
        .post('/api/v1/admin/deliveries/assign')
        .set('Authorization', 'Bearer admin-token')
        .send({
          orderId: mockOrderId,
          deliveryPartnerId: mockPartnerId,
          deliveryFee: 250,
          notes: 'Fragile sanitaryware package',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(mockDeliveryId);
      expect(res.body.data.status).toBe('assigned');
    });

    it('rejects delivery assignment if non-admin attempts it', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockCustomerId, email: 'customer@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: mockCustomerId, role: 'customer' },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const res = await request(app)
        .post('/api/v1/admin/deliveries/assign')
        .set('Authorization', 'Bearer customer-token')
        .send({
          orderId: mockOrderId,
          deliveryPartnerId: mockPartnerId,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Lifecycle Step 3 & 4: Location Ingestion & Socket Broadcast', () => {
    it('allows assigned partner to submit GPS fix, updates location, and broadcasts to room', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockPartnerId, email: 'partner@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockPartnerId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId,
                      customer_id: mockCustomerId,
                      status: 'out_for_delivery',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_locations') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: 'loc-1',
                      delivery_assignment_id: mockDeliveryId,
                      order_id: mockOrderId,
                      latitude: 28.6139,
                      longitude: 77.2090,
                      accuracy: 10,
                      speed: 15,
                      heading: 180,
                      device_timestamp: new Date().toISOString(),
                      server_received_at: new Date().toISOString(),
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
        rpc: vi.fn().mockResolvedValue({ data: 'loc-1', error: null }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      // Customer connects to Socket.IO and subscribes to delivery room
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockImplementation(async (token: string) => {
        if (token === 'customer-token') {
          return { data: { user: { id: mockCustomerId, email: 'customer@test.com' } as any }, error: null };
        }
        return { data: { user: { id: mockPartnerId, email: 'partner@test.com' } as any }, error: null };
      });

      const customerSocket = ClientSocket(socketUrl, {
        transports: ['polling', 'websocket'],
        auth: { token: 'customer-token' },
        reconnection: false,
      });

      await new Promise<void>((resolve) => customerSocket.on('connect', () => resolve()));

      await new Promise<void>((resolve) => {
        customerSocket.emit('delivery:subscribe', { deliveryId: mockDeliveryId }, (ack: any) => {
          expect(ack.success).toBe(true);
          resolve();
        });
      });

      // Listen for real-time broadcast
      let receivedSocketUpdate: any = null;
      customerSocket.on('delivery:location_update', (data) => {
        receivedSocketUpdate = data;
      });

      // Partner submits GPS fix via REST API
      const res = await request(app)
        .post(`/api/v1/deliveries/${mockDeliveryId}/location`)
        .set('Authorization', 'Bearer partner-token')
        .send({
          latitude: 28.6139,
          longitude: 77.2090,
          accuracy: 10,
          speed: 15,
          heading: 180,
          deviceTimestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.latitude).toBe(28.6139);

      // Verify that customer received the socket update
      await new Promise((r) => setTimeout(r, 100));
      expect(receivedSocketUpdate).not.toBeNull();
      expect(receivedSocketUpdate.deliveryId).toBe(mockDeliveryId);
      expect(receivedSocketUpdate.latitude).toBe(28.6139);

      customerSocket.disconnect();
    });

    it('rejects location updates submitted by an unassigned delivery partner (Security Guard)', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockIntruderId, email: 'other-partner@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockIntruderId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId, // Assigned to different partner!
                      customer_id: mockCustomerId,
                      status: 'out_for_delivery',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const res = await request(app)
        .post(`/api/v1/deliveries/${mockDeliveryId}/location`)
        .set('Authorization', 'Bearer intruder-token')
        .send({
          latitude: 28.6139,
          longitude: 77.2090,
          deviceTimestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not authorized to record location');
    });
  });

  describe('Lifecycle Step 5: Routing & ETA End-to-End', () => {
    it('serves valid driving route and ETA to authorized customer', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockCustomerId, email: 'customer@test.com' } as any },
        error: null,
      });

      const freshTimestamp = new Date().toISOString();
      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockCustomerId, role: 'customer' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      customer_id: mockCustomerId,
                      delivery_partner_id: mockPartnerId,
                      status: 'out_for_delivery',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_locations') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      latitude: 28.6139,
                      longitude: 77.2090,
                      accuracy: 10,
                      device_timestamp: freshTimestamp,
                      server_received_at: freshTimestamp,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockOrderId,
                      shipping_address_snapshot: {
                        latitude: 28.7041,
                        longitude: 77.1025,
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      vi.spyOn(OsrmRoutingProvider, 'getDrivingRoute').mockResolvedValue({
        distanceMeters: 14500,
        durationSeconds: 1500,
        geometry: {
          type: 'LineString',
          coordinates: [
            [77.2090, 28.6139],
            [77.1025, 28.7041],
          ],
        },
        provider: 'OSRM-Driving',
        calculatedAt: new Date().toISOString(),
      });

      // 1. Fetch Route
      const routeRes = await request(app)
        .get(`/api/v1/deliveries/${mockDeliveryId}/route`)
        .set('Authorization', 'Bearer customer-token');

      expect(routeRes.status).toBe(200);
      expect(routeRes.body.success).toBe(true);
      expect(routeRes.body.data.distanceMeters).toBe(14500);
      expect(routeRes.body.data.geometry.type).toBe('LineString');

      // 2. Fetch ETA
      const etaRes = await request(app)
        .get(`/api/v1/deliveries/${mockDeliveryId}/eta`)
        .set('Authorization', 'Bearer customer-token');

      expect(etaRes.status).toBe(200);
      expect(etaRes.body.success).toBe(true);
      expect(etaRes.body.data.isAvailable).toBe(true);
      expect(etaRes.body.data.eta.estimatedDurationSeconds).toBe(1500);
    });

    it('denies unrelated customer from fetching route or ETA (BOLA Protection)', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockIntruderId, email: 'intruder@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockIntruderId, role: 'customer' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      customer_id: mockCustomerId, // Belongs to different customer!
                      delivery_partner_id: mockPartnerId,
                      status: 'out_for_delivery',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const routeRes = await request(app)
        .get(`/api/v1/deliveries/${mockDeliveryId}/route`)
        .set('Authorization', 'Bearer intruder-token');

      expect(routeRes.status).toBe(403);
      expect(routeRes.body.success).toBe(false);
      expect(routeRes.body.error.message).toContain('not authorized to access routing');
    });
  });

  describe('Lifecycle Step 6: Terminal Delivery Status Protection', () => {
    it('halts location updates once delivery is marked delivered', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockPartnerId, email: 'partner@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockPartnerId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId,
                      customer_id: mockCustomerId,
                      status: 'delivered', // Terminal status
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const res = await request(app)
        .post(`/api/v1/deliveries/${mockDeliveryId}/location`)
        .set('Authorization', 'Bearer partner-token')
        .send({
          latitude: 28.6139,
          longitude: 77.2090,
          deviceTimestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Cannot record location for assignment with status 'delivered'");
    });
  });

  describe('Lifecycle Step 7: Partner Assigned Deliveries & Authorized Status Transitions', () => {
    it('retrieves assigned deliveries filtered strictly by authenticated partner ID', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockPartnerId, email: 'partner@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockPartnerId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: (cols: string, opts?: any) => {
                if (opts?.head) {
                  return {
                    eq: vi.fn().mockReturnThis(),
                    then: (resolve: any) => resolve({ count: 1, error: null }),
                  };
                }
                return {
                  eq: vi.fn().mockReturnThis(),
                  order: vi.fn().mockReturnThis(),
                  range: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: mockDeliveryId,
                        order_id: mockOrderId,
                        delivery_partner_id: mockPartnerId,
                        customer_id: mockCustomerId,
                        status: 'assigned',
                        delivery_fee: 100,
                        notes: 'Fragile package',
                        assigned_at: new Date().toISOString(),
                        picked_up_at: null,
                        completed_at: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        orders: {
                          id: mockOrderId,
                          order_number: 'ORD-98765',
                          total_amount: 1450.0,
                          amount_collected: 0,
                          payment_method: 'cod',
                          payment_status: 'pending',
                          shipping_address_snapshot: {
                            recipient_name: 'Rajesh Sharma',
                            phone: '+919876543210',
                            address_line1: 'Shop 14, Main Hardware Bazaar',
                            city: 'New Delhi',
                            state: 'Delhi',
                            postal_code: '110006',
                          },
                          order_items: [
                            {
                              product_name: 'Brass Bib Cock 15mm',
                              quantity: 2,
                              unit_price: 450,
                            },
                          ],
                        },
                      },
                    ],
                    error: null,
                  }),
                };
              },
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const res = await request(app)
        .get('/api/v1/deliveries/assigned')
        .set('Authorization', 'Bearer partner-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(mockDeliveryId);
      expect(res.body.data.items[0].orderNumber).toBe('ORD-98765');
      expect(res.body.data.items[0].codAmount).toBe(1550.0);
      expect(res.body.data.items[0].orderAmountToCollect).toBe(1450.0);
      expect(res.body.data.items[0].deliveryFeeToCollect).toBe(100.0);
      expect(res.body.data.items[0].deliveryFee).toBe(100);
      expect(res.body.data.items[0].totalPayable).toBe(1550);
      expect(res.body.data.items[0].destination.recipientName).toBe('Rajesh Sharma');
    });

    it('allows assigned partner to transition status from assigned to picked_up', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockPartnerId, email: 'partner@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockPartnerId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId,
                      customer_id: mockCustomerId,
                      status: 'assigned',
                      notes: null,
                    },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () => ({
                      data: {
                        id: mockDeliveryId,
                        order_id: mockOrderId,
                        delivery_partner_id: mockPartnerId,
                        customer_id: mockCustomerId,
                        status: 'picked_up',
                        notes: 'Collected from warehouse',
                        assigned_at: new Date().toISOString(),
                        picked_up_at: new Date().toISOString(),
                        completed_at: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const res = await request(app)
        .patch(`/api/v1/deliveries/${mockDeliveryId}/status`)
        .set('Authorization', 'Bearer partner-token')
        .send({
          status: 'picked_up',
          notes: 'Collected from warehouse',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('picked_up');
    });

    it('rejects partner status transition if partner does not own assignment', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockIntruderId, email: 'intruder@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockIntruderId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId, // Owned by another partner
                      customer_id: mockCustomerId,
                      status: 'assigned',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      const res = await request(app)
        .patch(`/api/v1/deliveries/${mockDeliveryId}/status`)
        .set('Authorization', 'Bearer intruder-token')
        .send({
          status: 'picked_up',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not authorized to update this delivery assignment');
    });

    it('rejects invalid lifecycle status transitions', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockPartnerId, email: 'partner@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockPartnerId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId,
                      customer_id: mockCustomerId,
                      status: 'assigned', // In assigned state
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      // Attempt invalid transition: assigned directly to delivered
      const res = await request(app)
        .patch(`/api/v1/deliveries/${mockDeliveryId}/status`)
        .set('Authorization', 'Bearer partner-token')
        .send({
          status: 'delivered',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Lifecycle Step 8: Complete Multi-Party Delivery Progression & Order Status Sync', () => {
    it('executes full sequential progression: assigned -> picked_up -> out_for_delivery -> delivered with order status sync', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockPartnerId, email: 'partner@test.com' } as any },
        error: null,
      });

      let currentStatus: any = 'assigned';
      let parentOrderStatus = 'processing';
      const mockVerifyOtpRpc = vi.fn().mockImplementation((_functionName: string, args: any) => {
        currentStatus = 'delivered';
        parentOrderStatus = 'delivered';
        return Promise.resolve({
          data: {
            success: true,
            alreadyVerified: false,
            assignmentId: mockDeliveryId,
            orderId: mockOrderId,
            deliveryPartnerId: mockPartnerId,
            customerId: mockCustomerId,
            status: 'delivered',
            notes: null,
            assignedAt: new Date().toISOString(),
            pickedUpAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          error: null,
        });
      });

      const mockAdminClient = {
        rpc: mockVerifyOtpRpc,
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockPartnerId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: mockPartnerId,
                      customer_id: mockCustomerId,
                      status: currentStatus,
                      assigned_at: new Date().toISOString(),
                      picked_up_at: currentStatus === 'picked_up' ? new Date().toISOString() : null,
                      completed_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: () => ({
                  select: () => ({
                    single: async () => {
                      currentStatus = payload.status;
                      return {
                        data: {
                          id: mockDeliveryId,
                          order_id: mockOrderId,
                          delivery_partner_id: mockPartnerId,
                          customer_id: mockCustomerId,
                          status: currentStatus,
                          notes: payload.notes !== undefined ? payload.notes : null,
                          assigned_at: new Date().toISOString(),
                          picked_up_at: payload.picked_up_at || null,
                          completed_at: payload.completed_at || null,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        },
                        error: null,
                      };
                    },
                  }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              update: (payload: any) => ({
                eq: () => ({
                  eq: async () => {
                    if (payload.status) parentOrderStatus = payload.status;
                    return { error: null };
                  },
                  in: async () => {
                    if (payload.status) parentOrderStatus = payload.status;
                    return { error: null };
                  },
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      // Step 1: Partner marks picked up
      const pickupRes = await request(app)
        .patch(`/api/v1/deliveries/${mockDeliveryId}/status`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'picked_up' });

      expect(pickupRes.status).toBe(200);
      expect(pickupRes.body.data.status).toBe('picked_up');

      // Step 2: Partner starts delivery -> out_for_delivery
      const outRes = await request(app)
        .patch(`/api/v1/deliveries/${mockDeliveryId}/status`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'out_for_delivery' });

      expect(outRes.status).toBe(200);
      expect(outRes.body.data.status).toBe('out_for_delivery');

      // Direct status updates cannot bypass OTP verification.
      const directDeliveredRes = await request(app)
        .patch(`/api/v1/deliveries/${mockDeliveryId}/status`)
        .set('Authorization', 'Bearer partner-token')
        .send({ status: 'delivered', notes: 'Handed over to customer' });

      expect(directDeliveredRes.status).toBe(400);
      expect(parentOrderStatus).toBe('shipped');

      // Only the verification endpoint transitions the assignment and parent order to delivered.
      const deliveredRes = await request(app)
        .post(`/api/v1/deliveries/${mockDeliveryId}/verify-otp`)
        .set('Authorization', 'Bearer partner-token')
        .send({ otp: '123456' });

      expect(deliveredRes.status).toBe(200);
      expect(deliveredRes.body.data.status).toBe('delivered');
      expect(parentOrderStatus).toBe('delivered');
      expect(mockVerifyOtpRpc).toHaveBeenCalledWith('verify_delivery_otp', expect.objectContaining({
        p_assignment_id: mockDeliveryId,
        p_actor_id: mockPartnerId,
        p_otp_hash: hashDeliveryOtp('123456'),
      }));
    });

    it('denies former partner access after reassignment by admin', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockPartnerId, email: 'former_partner@test.com' } as any },
        error: null,
      });

      const newPartnerId = '99999999-9999-9999-9999-999999999999';

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: mockPartnerId, role: 'delivery_partner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: mockDeliveryId,
                      order_id: mockOrderId,
                      delivery_partner_id: newPartnerId, // Reassigned to someone else
                      customer_id: mockCustomerId,
                      status: 'assigned',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      // Former partner attempts to submit location
      const locRes = await request(app)
        .post(`/api/v1/deliveries/${mockDeliveryId}/location`)
        .set('Authorization', 'Bearer former-partner-token')
        .send({
          latitude: 28.6139,
          longitude: 77.2090,
          deviceTimestamp: new Date().toISOString(),
        });

      expect(locRes.status).toBe(403);
      expect(locRes.body.error.message).toContain('not authorized to record location');

      // Former partner attempts to update status
      const statusRes = await request(app)
        .patch(`/api/v1/deliveries/${mockDeliveryId}/status`)
        .set('Authorization', 'Bearer former-partner-token')
        .send({ status: 'picked_up' });

      expect(statusRes.status).toBe(403);
      expect(statusRes.body.error.message).toContain('not authorized to update this delivery assignment');
    });
  });
});
