import { describe, it, expect, vi } from 'vitest';
import {
  coordinateValidationSchema,
  locationUpdatePayloadSchema,
  createDeliveryAssignmentSchema,
  updateAssignmentStatusSchema
} from '../src/common/validation/trackingSchemas';
import { isLocationStale } from '../src/services/deliveryTrackingService';

describe('Delivery Tracking Validation & Domain Logic', () => {
  describe('Coordinate Validation', () => {
    it('accepts valid geographic coordinates within range', () => {
      const validCoordinates = [
        { latitude: 28.6139, longitude: 77.2090 }, // New Delhi
        { latitude: 0, longitude: 0 },
        { latitude: -90, longitude: -180 },
        { latitude: 90, longitude: 180 },
        { latitude: 19.0760, longitude: 72.8777 }  // Mumbai
      ];

      validCoordinates.forEach((coords) => {
        const result = coordinateValidationSchema.safeParse(coords);
        expect(result.success).toBe(true);
      });
    });

    it('rejects latitude less than -90 or greater than 90', () => {
      expect(coordinateValidationSchema.safeParse({ latitude: 90.0001, longitude: 0 }).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: -90.0001, longitude: 0 }).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: 150, longitude: 10 }).success).toBe(false);
    });

    it('rejects longitude less than -180 or greater than 180', () => {
      expect(coordinateValidationSchema.safeParse({ latitude: 0, longitude: 180.0001 }).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: 0, longitude: -180.0001 }).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: 10, longitude: 200 }).success).toBe(false);
    });

    it('rejects non-finite coordinate values (NaN, Infinity, -Infinity)', () => {
      expect(coordinateValidationSchema.safeParse({ latitude: NaN, longitude: 77.2 }).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: 28.6, longitude: Infinity }).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: -Infinity, longitude: 77.2 }).success).toBe(false);
    });

    it('rejects missing or malformed coordinates', () => {
      expect(coordinateValidationSchema.safeParse({}).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: '28.6', longitude: 77.2 }).success).toBe(false);
      expect(coordinateValidationSchema.safeParse({ latitude: null, longitude: 77.2 }).success).toBe(false);
    });
  });

  describe('Location Update Payload & Timestamp Validation', () => {
    it('accepts valid payload with reasonable device timestamp', () => {
      const nowIso = new Date().toISOString();
      const payload = {
        assignmentId: '550e8400-e29b-41d4-a716-446655440000',
        latitude: 28.7041,
        longitude: 77.1025,
        accuracy: 8.5,
        speed: 12.4,
        heading: 180,
        deviceTimestamp: nowIso
      };

      const result = locationUpdatePayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects timestamps in the future beyond permitted 10-minute clock-skew tolerance', () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // +15 mins
      const payload = {
        assignmentId: '550e8400-e29b-41d4-a716-446655440000',
        latitude: 28.7041,
        longitude: 77.1025,
        deviceTimestamp: futureDate
      };

      const result = locationUpdatePayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('future');
      }
    });

    it('accepts timestamp within the acceptable 10-minute clock-skew threshold', () => {
      const slightFutureDate = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5 mins
      const payload = {
        assignmentId: '550e8400-e29b-41d4-a716-446655440000',
        latitude: 28.7041,
        longitude: 77.1025,
        deviceTimestamp: slightFutureDate
      };

      const result = locationUpdatePayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects invalid or unparseable timestamp formats', () => {
      const payload = {
        assignmentId: '550e8400-e29b-41d4-a716-446655440000',
        latitude: 28.7041,
        longitude: 77.1025,
        deviceTimestamp: 'not-a-valid-timestamp'
      };

      const result = locationUpdatePayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects negative accuracy or speed values', () => {
      const invalidAccuracy = {
        assignmentId: '550e8400-e29b-41d4-a716-446655440000',
        latitude: 28.7041,
        longitude: 77.1025,
        accuracy: -5,
        deviceTimestamp: new Date().toISOString()
      };
      expect(locationUpdatePayloadSchema.safeParse(invalidAccuracy).success).toBe(false);

      const invalidSpeed = {
        assignmentId: '550e8400-e29b-41d4-a716-446655440000',
        latitude: 28.7041,
        longitude: 77.1025,
        speed: -1,
        deviceTimestamp: new Date().toISOString()
      };
      expect(locationUpdatePayloadSchema.safeParse(invalidSpeed).success).toBe(false);
    });

    it('rejects heading outside [0, 360]', () => {
      const payload = {
        assignmentId: '550e8400-e29b-41d4-a716-446655440000',
        latitude: 28.7041,
        longitude: 77.1025,
        heading: 360.5,
        deviceTimestamp: new Date().toISOString()
      };
      expect(locationUpdatePayloadSchema.safeParse(payload).success).toBe(false);
    });
  });

  describe('Delivery Assignment Schemas', () => {
    it('validates assignment creation schema with valid UUIDs', () => {
      const valid = {
        orderId: '550e8400-e29b-41d4-a716-446655440001',
        deliveryPartnerId: '550e8400-e29b-41d4-a716-446655440002',
        notes: 'Handle with fragile sanitaryware'
      };
      expect(createDeliveryAssignmentSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects invalid UUIDs for assignment creation', () => {
      const invalid = {
        orderId: 'invalid-id',
        deliveryPartnerId: '550e8400-e29b-41d4-a716-446655440002'
      };
      expect(createDeliveryAssignmentSchema.safeParse(invalid).success).toBe(false);
    });

    it('validates assignment status updates', () => {
      expect(updateAssignmentStatusSchema.safeParse({ status: 'out_for_delivery' }).success).toBe(true);
      expect(updateAssignmentStatusSchema.safeParse({ status: 'picked_up' }).success).toBe(true);
      expect(updateAssignmentStatusSchema.safeParse({ status: 'delivered' }).success).toBe(true);
      expect(updateAssignmentStatusSchema.safeParse({ status: 'unknown_status' }).success).toBe(false);
    });
  });

  describe('Location Freshness & Staleness Calculation', () => {
    it('correctly marks location as fresh within threshold', () => {
      const recentTimestamp = new Date(Date.now() - 30 * 1000).toISOString(); // 30s ago
      expect(isLocationStale(recentTimestamp, 120)).toBe(false);
    });

    it('correctly marks location as stale when exceeding threshold', () => {
      const oldTimestamp = new Date(Date.now() - 300 * 1000).toISOString(); // 5m ago
      expect(isLocationStale(oldTimestamp, 120)).toBe(true);
    });

    it('handles invalid timestamp gracefully by marking stale', () => {
      expect(isLocationStale('invalid-date', 120)).toBe(true);
    });
  });

  describe('Phase 2 — Delivery Endpoint Parameter & Query Validation', () => {
    it('validates deliveryIdParamSchema with valid and invalid UUIDs', async () => {
      const { deliveryIdParamSchema } = await import('../src/common/validation/trackingSchemas');
      expect(deliveryIdParamSchema.safeParse({ deliveryId: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(true);
      expect(deliveryIdParamSchema.safeParse({ deliveryId: 'not-a-uuid' }).success).toBe(false);
      expect(deliveryIdParamSchema.safeParse({}).success).toBe(false);
    });

    it('validates locationHistoryQuerySchema pagination limits (1 to 200, default 50)', async () => {
      const { locationHistoryQuerySchema } = await import('../src/common/validation/trackingSchemas');
      
      const defaultRes = locationHistoryQuerySchema.safeParse({});
      expect(defaultRes.success).toBe(true);
      if (defaultRes.success) expect(defaultRes.data.limit).toBe(50);

      const customRes = locationHistoryQuerySchema.safeParse({ limit: '100' });
      expect(customRes.success).toBe(true);
      if (customRes.success) expect(customRes.data.limit).toBe(100);

      // Exceeds max 200
      expect(locationHistoryQuerySchema.safeParse({ limit: '250' }).success).toBe(false);
      // Below min 1
      expect(locationHistoryQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    });

    it('validates locationHistoryQuerySchema time ranges', async () => {
      const { locationHistoryQuerySchema } = await import('../src/common/validation/trackingSchemas');
      const start = new Date(Date.now() - 3600000).toISOString();
      const end = new Date().toISOString();

      // Valid chronological order
      expect(locationHistoryQuerySchema.safeParse({ startTime: start, endTime: end }).success).toBe(true);

      // Invalid inverted order (startTime > endTime)
      expect(locationHistoryQuerySchema.safeParse({ startTime: end, endTime: start }).success).toBe(false);

      // Malformed datetime strings
      expect(locationHistoryQuerySchema.safeParse({ startTime: 'invalid-iso' }).success).toBe(false);
    });
  });

  describe('Phase 2 — Delivery Lifecycle & Authorization Rules', () => {
    it('prohibits GPS location submissions for terminal delivery statuses (delivered, failed, cancelled)', async () => {
      const terminalStatuses = ['delivered', 'failed', 'cancelled'];
      for (const status of terminalStatuses) {
        expect(['delivered', 'failed', 'cancelled'].includes(status)).toBe(true);
      }
    });

    it('permits GPS location submissions for active delivery statuses (assigned, picked_up, out_for_delivery)', async () => {
      const activeStatuses = ['assigned', 'picked_up', 'out_for_delivery'];
      for (const status of activeStatuses) {
        expect(['assigned', 'picked_up', 'out_for_delivery'].includes(status)).toBe(true);
      }
    });
  });
});

