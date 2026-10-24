import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { GeocodingService } from '../services/geocodingService';
import { ServiceabilityService } from '../services/serviceabilityService';
import { sendSuccess } from '../common/utils/response';
import { BadRequestError } from '../common/errors';

export const locationRouter = Router();

const searchSchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters').max(150),
  city: z.string().trim().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 7)),
  lat: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined)),
  lon: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined)),
});

const reverseSchema = z.object({
  lat: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => !isNaN(val) && val >= -90 && val <= 90, 'Latitude must be between -90 and 90'),
  lon: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => !isNaN(val) && val >= -180 && val <= 180, 'Longitude must be between -180 and 180'),
});

const serviceabilitySchema = z.object({
  city: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  lat: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined)),
  lon: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined)),
});

/**
 * GET /api/v1/location/cities
 * Returns supported delivery cities and operational centers.
 */
locationRouter.get('/cities', (req: Request, res: Response) => {
  const cities = ServiceabilityService.getSupportedCities();
  return sendSuccess(res, cities, 'Supported cities retrieved successfully');
});

/**
 * GET /api/v1/location/search
 * Autocomplete address and locality search backed by Photon.
 */
locationRouter.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(parsed.error);
    }

    const suggestions = await GeocodingService.searchAddress(parsed.data.q, {
      cityBias: parsed.data.city,
      limit: parsed.data.limit,
      lat: parsed.data.lat,
      lon: parsed.data.lon,
    });

    return sendSuccess(res, suggestions, 'Address suggestions retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/location/reverse
 * Reverse geocode a latitude and longitude into address components.
 */
locationRouter.get('/reverse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = reverseSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(parsed.error);
    }

    const result = await GeocodingService.reverseGeocode(parsed.data.lat, parsed.data.lon);
    return sendSuccess(res, result, 'Reverse geocode completed successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/location/serviceability
 * Check serviceability by city, postal code, or coordinate distance.
 */
locationRouter.get('/serviceability', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = serviceabilitySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(parsed.error);
    }

    const check = ServiceabilityService.checkServiceability({
      city: parsed.data.city,
      postalCode: parsed.data.postalCode,
      latitude: parsed.data.lat,
      longitude: parsed.data.lon,
    });

    return sendSuccess(res, check, 'Serviceability checked successfully');
  } catch (err) {
    next(err);
  }
});
