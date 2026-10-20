import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../src/app';
import {
  initSocketIO,
  closeSocketIO,
  getDeliveryRoomName,
  broadcastDeliveryLocation,
  broadcastDeliveryStatus
} from '../src/common/socket/trackingSocket';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 3 — Real-Time Delivery Tracking with Socket.IO', () => {
  let server: http.Server;
  let serverPort: number;
  let socketUrl: string;

  beforeEach(async () => {
    await closeSocketIO();
    const app = createApp();
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
    await closeSocketIO();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Socket.IO Room Naming & Broadcast Helpers', () => {
    it('generates consistent and secure delivery room names', () => {
      const deliveryId = '550e8400-e29b-41d4-a716-446655440000';
      expect(getDeliveryRoomName(deliveryId)).toBe(`delivery:${deliveryId}`);
    });

    it('safely handles broadcastDeliveryLocation call without throwing', () => {
      const payload = {
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
        orderId: '550e8400-e29b-41d4-a716-446655440001',
        latitude: 28.6139,
        longitude: 77.2090,
        accuracy: 10,
        speed: 15,
        heading: 90,
        deviceTimestamp: new Date().toISOString(),
        serverReceivedAt: new Date().toISOString(),
        isStale: false,
      };

      const result = broadcastDeliveryLocation(payload);
      expect(result).toBe(true);
    });

    it('safely handles broadcastDeliveryStatus call without throwing', () => {
      const statusPayload = {
        deliveryId: '550e8400-e29b-41d4-a716-446655440000',
        orderId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'out_for_delivery' as const,
        timestamp: new Date().toISOString(),
      };

      const result = broadcastDeliveryStatus(statusPayload);
      expect(result).toBe(true);
    });
  });

  describe('Socket Authentication Middleware', () => {
    it('rejects connection if authentication token is missing', async () => {
      let connectionError: any = null;

      const client = ClientSocket(socketUrl, {
        transports: ['polling', 'websocket'],
        reconnection: false,
      });

      await new Promise<void>((resolve) => {
        client.on('connect_error', (err) => {
          connectionError = err;
          client.disconnect();
          resolve();
        });
        client.on('connect', () => {
          client.disconnect();
          resolve();
        });
      });

      expect(connectionError).not.toBeNull();
      expect(connectionError?.message).toContain('Authentication required');
    });

    it('rejects connection if access token is invalid or expired', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' } as any,
      });

      let connectionError: any = null;
      const client = ClientSocket(socketUrl, {
        transports: ['polling', 'websocket'],
        auth: { token: 'invalid.jwt.token' },
        reconnection: false,
      });

      await new Promise<void>((resolve) => {
        client.on('connect_error', (err) => {
          connectionError = err;
          client.disconnect();
          resolve();
        });
      });

      expect(connectionError).not.toBeNull();
      expect(connectionError?.message).toBe('Invalid token');
    });

    it('accepts connection when valid bearer token is provided and loads authoritative role', async () => {
      const mockUserId = '11111111-1111-1111-1111-111111111111';
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: {
          user: { id: mockUserId, email: 'customer@test.com' } as any,
        },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: mockUserId, role: 'customer' },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      let isConnected = false;
      const client = ClientSocket(socketUrl, {
        transports: ['polling', 'websocket'],
        auth: { token: 'valid.mock.token' },
        reconnection: false,
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => {
          isConnected = true;
          client.disconnect();
          resolve();
        });
        client.on('connect_error', (err) => {
          client.disconnect();
          resolve();
        });
      });

      expect(isConnected).toBe(true);
    });
  });

  describe('Tracking Room Authorization & Subscription', () => {
    it('authorizes customer subscription to their own delivery and receives broadcasts', async () => {
      const mockCustomerId = '11111111-1111-1111-1111-111111111111';
      const mockDeliveryId = '22222222-2222-2222-2222-222222222222';
      const mockOrderId = '33333333-3333-3333-3333-333333333333';

      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: mockCustomerId, email: 'customer@test.com' } as any },
        error: null,
      });

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
                      customer_id: mockCustomerId,
                      delivery_partner_id: '44444444-4444-4444-4444-444444444444',
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

      const client = ClientSocket(socketUrl, {
        transports: ['polling', 'websocket'],
        auth: { token: 'valid.customer.token' },
        reconnection: false,
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      // Subscribe to delivery tracking room
      const subscribeResponse = await new Promise<any>((resolve) => {
        client.emit('delivery:subscribe', { deliveryId: mockDeliveryId }, (res: any) => {
          resolve(res);
        });
      });

      expect(subscribeResponse.success).toBe(true);
      expect(subscribeResponse.deliveryId).toBe(mockDeliveryId);
      expect(subscribeResponse.isLiveTrackingAvailable).toBe(true);

      // Verify receipt of broadcasted location update
      let receivedBroadcast: any = null;
      const broadcastPromise = new Promise<void>((resolve) => {
        client.on('delivery:location_update', (payload) => {
          receivedBroadcast = payload;
          resolve();
        });
      });

      broadcastDeliveryLocation({
        deliveryId: mockDeliveryId,
        orderId: mockOrderId,
        latitude: 28.6139,
        longitude: 77.2090,
        accuracy: 5.0,
        speed: 12.0,
        heading: 180,
        deviceTimestamp: new Date().toISOString(),
        serverReceivedAt: new Date().toISOString(),
        isStale: false,
      });

      await broadcastPromise;
      expect(receivedBroadcast).not.toBeNull();
      expect(receivedBroadcast.deliveryId).toBe(mockDeliveryId);
      expect(receivedBroadcast.latitude).toBe(28.6139);
      expect(receivedBroadcast.longitude).toBe(77.2090);

      client.disconnect();
    });

    it('rejects customer subscription to another customer delivery assignment', async () => {
      const currentUserId = '11111111-1111-1111-1111-111111111111';
      const foreignCustomerId = '99999999-9999-9999-9999-999999999999';
      const mockDeliveryId = '22222222-2222-2222-2222-222222222222';

      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
        data: { user: { id: currentUserId, email: 'intruder@test.com' } as any },
        error: null,
      });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: currentUserId, role: 'customer' },
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
                      customer_id: foreignCustomerId, // Belongs to different customer!
                      delivery_partner_id: '44444444-4444-4444-4444-444444444444',
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

      const client = ClientSocket(socketUrl, {
        transports: ['polling', 'websocket'],
        auth: { token: 'valid.intruder.token' },
        reconnection: false,
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      const subscribeResponse = await new Promise<any>((resolve) => {
        client.emit('delivery:subscribe', { deliveryId: mockDeliveryId }, (res: any) => {
          resolve(res);
        });
      });

      expect(subscribeResponse.success).toBe(false);
      expect(subscribeResponse.message).toContain('Access denied');

      client.disconnect();
    });
  });
});
