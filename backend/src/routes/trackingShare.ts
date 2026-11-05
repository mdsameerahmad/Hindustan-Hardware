import { Router, Request, Response, NextFunction } from 'express';
import { trackingShareRateLimiter } from '../common/middleware/rateLimiter';
import { trackingTokenParamSchema } from '../common/validation/trackingSchemas';
import { sendSuccess } from '../common/utils/response';
import { TrackingShareService } from '../services/trackingShareService';

export const trackingShareRouter = Router();

trackingShareRouter.get(
  '/:token',
  trackingShareRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const parsed = trackingTokenParamSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);

      const tracking = await TrackingShareService.getSharedTracking(parsed.data.token);
      return sendSuccess(res, tracking, 'Shared order tracking retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
);
