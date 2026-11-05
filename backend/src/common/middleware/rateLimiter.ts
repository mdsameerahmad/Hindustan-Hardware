import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response';

/**
 * Strict rate limiter for authentication endpoints (login, registration, password recovery).
 * Limits requests per IP within a 15-minute window to mitigate brute-force and credential stuffing attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Max 30 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Too many authentication attempts from this IP. Please try again after 15 minutes.',
      429
    );
  },
});

/**
 * Rate limiter for checkout endpoints to prevent automated submission floods.
 */
export const checkoutRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // Max 15 checkout requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Too many checkout attempts. Please slow down and try again shortly.',
      429
    );
  },
});

/**
 * Limits public bulk-inquiry submissions to reduce automated spam.
 */
export const bulkInquiryRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Too many inquiry submissions. Please try again shortly.',
      429
    );
  },
});

/**
 * Rate limiter for order cancellation requests.
 */
export const cancellationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 cancellation requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Too many cancellation requests. Please try again shortly.',
      429
    );
  },
});

/**
 * General API rate limiter for administrative and mutation endpoints.
 */
export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Max 60 admin requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Rate limit exceeded for administrative operations. Please wait a moment.',
      429
    );
  },
});

/**
 * Rate limiter for live GPS location updates from delivery partners.
 * Protects against runaway client loops while allowing legitimate active GPS updates.
 */
export const trackingRateLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 10, // Max 10 requests per 10-second window per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(
      res,
      'TOO_MANY_REQUESTS',
      'Location update rate limit exceeded. Please throttle GPS updates.',
      429
    );
  },
});
