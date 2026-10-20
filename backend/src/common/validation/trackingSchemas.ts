import { z } from 'zod';

/**
 * Validation schemas for Phase 1 Live Delivery Tracking:
 * - Coordinates: Latitude [-90, 90], Longitude [-180, 180]
 * - Timestamps: ISO8601 string, non-future beyond 10-minute clock skew
 * - Accuracy, Speed, Heading constraints
 */

export const coordinateSchema = z.object({
  latitude: z
    .number({ required_error: 'Latitude is required.' })
    .min(-90.0, 'Latitude must be between -90 and 90 degrees.')
    .max(90.0, 'Latitude must be between -90 and 90 degrees.')
    .refine((val) => Number.isFinite(val), 'Latitude must be a finite number.'),
  longitude: z
    .number({ required_error: 'Longitude is required.' })
    .min(-180.0, 'Longitude must be between -180 and 180 degrees.')
    .max(180.0, 'Longitude must be between -180 and 180 degrees.')
    .refine((val) => Number.isFinite(val), 'Longitude must be a finite number.'),
});

export const coordinateValidationSchema = coordinateSchema;

export const locationUpdateSchema = coordinateSchema.extend({
  accuracy: z
    .number()
    .min(0, 'Accuracy must be a non-negative number.')
    .max(5000, 'Accuracy reading is outside plausible GPS threshold.')
    .nullable()
    .optional(),
  speed: z
    .number()
    .min(0, 'Speed must be a non-negative number.')
    .max(200, 'Speed reading exceeds plausible vehicle threshold (m/s).')
    .nullable()
    .optional(),
  heading: z
    .number()
    .min(0, 'Heading must be between 0 and 360 degrees.')
    .max(360, 'Heading must be between 0 and 360 degrees.')
    .nullable()
    .optional(),
  deviceTimestamp: z
    .string({ required_error: 'Device timestamp is required.' })
    .datetime({ message: 'Device timestamp must be a valid ISO-8601 string.' })
    .refine((val) => {
      const parsed = new Date(val).getTime();
      const tenMinutesInFuture = Date.now() + 10 * 60 * 1000;
      return parsed <= tenMinutesInFuture;
    }, 'Device timestamp cannot be in the future beyond 10 minutes clock-skew tolerance.'),
});

export const locationUpdatePayloadSchema = locationUpdateSchema.extend({
  assignmentId: z.string().uuid({ message: 'Assignment ID must be a valid UUID.' }).optional(),
});

export const deliveryIdParamSchema = z.object({
  deliveryId: z.string().uuid({ message: 'Delivery assignment ID must be a valid UUID.' }),
});

export const deliveryAssignmentIdParamSchema = deliveryIdParamSchema;

export const locationHistoryQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 200, {
      message: 'Limit must be an integer between 1 and 200.',
    }),
  startTime: z
    .string()
    .datetime({ message: 'startTime must be a valid ISO-8601 string.' })
    .optional(),
  endTime: z
    .string()
    .datetime({ message: 'endTime must be a valid ISO-8601 string.' })
    .optional(),
}).refine(
  (data) => {
    if (data.startTime && data.endTime) {
      return new Date(data.startTime).getTime() <= new Date(data.endTime).getTime();
    }
    return true;
  },
  {
    message: 'startTime cannot be later than endTime.',
    path: ['startTime'],
  }
);

export const orderTrackingParamSchema = z.object({
  orderId: z.string().uuid({ message: 'Order ID must be a valid UUID.' }),
});

export const createDeliveryAssignmentSchema = z.object({
  orderId: z.string().uuid({ message: 'Order ID must be a valid UUID.' }),
  deliveryPartnerId: z.string().uuid({ message: 'Delivery partner ID must be a valid UUID.' }),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters.').nullable().optional(),
});

export const updateAssignmentStatusSchema = z.object({
  status: z.enum(
    ['assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled'],
    {
      errorMap: () => ({
        message:
          "Status must be one of: 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled'.",
      }),
    }
  ),
  notes: z.string().max(500).nullable().optional(),
});

export const assignedDeliveriesQuerySchema = z.object({
  status: z
    .enum(['assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled'])
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => !isNaN(val) && val >= 1, { message: 'Page must be a positive integer.' }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
      message: 'Limit must be an integer between 1 and 100.',
    }),
});

export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
export type CreateDeliveryAssignmentInput = z.infer<typeof createDeliveryAssignmentSchema>;
export type UpdateAssignmentStatusInput = z.infer<typeof updateAssignmentStatusSchema>;
export type AssignedDeliveriesQueryInput = z.infer<typeof assignedDeliveriesQuerySchema>;
