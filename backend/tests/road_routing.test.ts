import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OsrmRoutingProvider } from '../src/services/osrmRoutingProvider';
import { RoadRoutingService } from '../src/services/roadRoutingService';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 4 — Road Routing, ETA, Location Freshness & Reliability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    RoadRoutingService.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    RoadRoutingService.clearCache();
  });

  describe('OsrmRoutingProvider', () => {
    it('validates coordinate boundaries and rejects out-of-range coordinates', async () => {
      await expect(
        OsrmRoutingProvider.getDrivingRoute(
          { latitude: 95.0, longitude: 77.0 },
          { latitude: 28.0, longitude: 77.0 }
        )
      ).rejects.toThrow('Invalid origin coordinates');

      await expect(
        OsrmRoutingProvider.getDrivingRoute(
          { latitude: 28.0, longitude: 77.0 },
          { latitude: 28.0, longitude: 200.0 }
        )
      ).rejects.toThrow('Invalid destination coordinates');
    });

    it('rejects non-finite coordinate values', async () => {
      await expect(
        OsrmRoutingProvider.getDrivingRoute(
          { latitude: NaN, longitude: 77.0 },
          { latitude: 28.0, longitude: 77.0 }
        )
      ).rejects.toThrow('Invalid origin coordinates');
    });

    it('parses valid OSRM provider response into normalized route structure', async () => {
      const mockOsrmResponse = {
        code: 'Ok',
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [77.1025, 28.7041],
                [77.2090, 28.6139],
              ],
            },
            distance: 15420.5,
            duration: 1820.2,
            weight_name: 'routability',
            weight: 1820.2,
            legs: [
              {
                distance: 15420.5,
                duration: 1820.2,
                summary: 'Outer Ring Rd',
              },
            ],
          },
        ],
      };

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockOsrmResponse,
      } as any);

      const result = await OsrmRoutingProvider.getDrivingRoute(
        { latitude: 28.7041, longitude: 77.1025 },
        { latitude: 28.6139, longitude: 77.2090 }
      );

      expect(result.distanceMeters).toBe(15421);
      expect(result.durationSeconds).toBe(1820);
      expect(result.geometry.type).toBe('LineString');
      expect(result.geometry.coordinates).toHaveLength(2);
      expect(result.provider).toBe('OSRM-Driving');
    });

    it('handles provider error when no route is found', async () => {
      const mockNoRoute = {
        code: 'NoRoute',
        message: 'Impossible route between coordinates',
        routes: [],
      };

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockNoRoute,
      } as any);

      await expect(
        OsrmRoutingProvider.getDrivingRoute(
          { latitude: 28.7041, longitude: 77.1025 },
          { latitude: 28.6139, longitude: 77.2090 }
        )
      ).rejects.toThrow('No driving route found');
    });

    it('handles provider HTTP 429 rate limit safely', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as any);

      await expect(
        OsrmRoutingProvider.getDrivingRoute(
          { latitude: 28.7041, longitude: 77.1025 },
          { latitude: 28.6139, longitude: 77.2090 }
        )
      ).rejects.toThrow('rate limit exceeded');
    });

    it('handles provider network timeout safely', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue({
        name: 'AbortError',
        message: 'The operation was aborted',
      });

      await expect(
        OsrmRoutingProvider.getDrivingRoute(
          { latitude: 28.7041, longitude: 77.1025 },
          { latitude: 28.6139, longitude: 77.2090 }
        )
      ).rejects.toThrow('Routing provider timed out');
    });
  });

  describe('RoadRoutingService & Haversine Distance', () => {
    it('accurately calculates distance between coordinates', () => {
      // Distance between New Delhi (28.6139, 77.2090) and Connaught Place (28.6315, 77.2167) ~2km
      const distance = RoadRoutingService.calculateHaversineDistanceMeters(
        { latitude: 28.6139, longitude: 77.2090 },
        { latitude: 28.6315, longitude: 77.2167 }
      );
      expect(distance).toBeGreaterThan(1500);
      expect(distance).toBeLessThan(2500);
    });

    it('caches calculated route and prevents redundant provider calls within threshold', async () => {
      const deliveryId = '550e8400-e29b-41d4-a716-446655440000';
      const customerId = '11111111-1111-1111-1111-111111111111';
      const orderId = '22222222-2222-2222-2222-222222222222';

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: deliveryId,
                      order_id: orderId,
                      customer_id: customerId,
                      delivery_partner_id: '33333333-3333-3333-3333-333333333333',
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
                      device_timestamp: new Date().toISOString(),
                      server_received_at: new Date().toISOString(),
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
                      id: orderId,
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

      const providerSpy = vi.spyOn(OsrmRoutingProvider, 'getDrivingRoute').mockResolvedValue({
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

      // First call: calculates and caches
      const res1 = await RoadRoutingService.getDeliveryRoute(deliveryId, customerId, 'customer');
      expect(res1.cached).toBe(false);
      expect(providerSpy).toHaveBeenCalledTimes(1);

      // Second call: serves from cache without hitting provider
      const res2 = await RoadRoutingService.getDeliveryRoute(deliveryId, customerId, 'customer');
      expect(res2.cached).toBe(true);
      expect(providerSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects routing request for terminal delivery status (delivered, cancelled, failed)', async () => {
      const deliveryId = '550e8400-e29b-41d4-a716-446655440000';
      const customerId = '11111111-1111-1111-1111-111111111111';

      const mockAdminClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: deliveryId,
                  order_id: 'order-1',
                  customer_id: customerId,
                  delivery_partner_id: 'partner-1',
                  status: 'delivered',
                },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      await expect(
        RoadRoutingService.getDeliveryRoute(deliveryId, customerId, 'customer')
      ).rejects.toThrow("Cannot calculate route for delivery with status 'delivered'");
    });

    it('enforces customer ownership authorization', async () => {
      const deliveryId = '550e8400-e29b-41d4-a716-446655440000';
      const realOwner = '11111111-1111-1111-1111-111111111111';
      const intruder = '99999999-9999-9999-9999-999999999999';

      const mockAdminClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: deliveryId,
                  order_id: 'order-1',
                  customer_id: realOwner,
                  delivery_partner_id: 'partner-1',
                  status: 'out_for_delivery',
                },
                error: null,
              }),
            }),
          }),
        }),
      };
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as any);

      await expect(
        RoadRoutingService.getDeliveryRoute(deliveryId, intruder, 'customer')
      ).rejects.toThrow('You are not authorized to access routing for this delivery.');
    });
  });

  describe('Estimated Time of Arrival (ETA) & Location Freshness', () => {
    it('returns truthful unavailable ETA when location is stale', async () => {
      const deliveryId = '550e8400-e29b-41d4-a716-446655440000';
      const customerId = '11111111-1111-1111-1111-111111111111';
      const orderId = '22222222-2222-2222-2222-222222222222';
      const staleTimestamp = new Date(Date.now() - 600 * 1000).toISOString(); // 10 minutes ago (stale)

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: deliveryId,
                      order_id: orderId,
                      customer_id: customerId,
                      delivery_partner_id: 'partner-1',
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
                      device_timestamp: staleTimestamp,
                      server_received_at: staleTimestamp,
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
                      id: orderId,
                      shipping_address_snapshot: { latitude: 28.7041, longitude: 77.1025 },
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

      const etaRes = await RoadRoutingService.getDeliveryEta(deliveryId, customerId, 'customer');

      expect(etaRes.isAvailable).toBe(false);
      expect(etaRes.eta).toBeNull();
      expect(etaRes.locationFreshness.isStale).toBe(true);
      expect(etaRes.statusMessage).toContain('Location update is delayed');
    });

    it('calculates usable ETA with future arrival timestamp when GPS is fresh', async () => {
      const deliveryId = '550e8400-e29b-41d4-a716-446655440000';
      const customerId = '11111111-1111-1111-1111-111111111111';
      const orderId = '22222222-2222-2222-2222-222222222222';
      const freshTimestamp = new Date(Date.now() - 10 * 1000).toISOString(); // 10s ago

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'delivery_assignments') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: deliveryId,
                      order_id: orderId,
                      customer_id: customerId,
                      delivery_partner_id: 'partner-1',
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
                      accuracy: 8,
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
                      id: orderId,
                      shipping_address_snapshot: { latitude: 28.7041, longitude: 77.1025 },
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
        distanceMeters: 12000,
        durationSeconds: 1200, // 20 mins
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

      const etaRes = await RoadRoutingService.getDeliveryEta(deliveryId, customerId, 'customer');

      expect(etaRes.isAvailable).toBe(true);
      expect(etaRes.eta).not.toBeNull();
      expect(etaRes.eta?.estimatedDurationSeconds).toBe(1200);
      expect(etaRes.locationFreshness.isStale).toBe(false);
      expect(new Date(etaRes.eta!.estimatedArrivalTimestamp).getTime()).toBeGreaterThan(Date.now());
    });
  });
});
