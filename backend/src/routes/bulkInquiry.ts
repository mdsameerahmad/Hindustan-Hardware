import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BulkInquiryService } from '../services/bulkInquiryService';
import { sendSuccess } from '../common/utils/response';
import { bulkInquiryRateLimiter } from '../common/middleware/rateLimiter';

const submitBulkInquirySchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  phone: z.string().trim().min(7).max(30),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
  productDetails: z.string().trim().min(1).max(5000),
  quantity: z.string().trim().min(1).max(200),
  deliveryLocation: z.string().trim().min(1).max(500),
  requirements: z.string().trim().max(5000).optional(),
});

export const bulkInquiryRouter = Router();

bulkInquiryRouter.post('/', bulkInquiryRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = submitBulkInquirySchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const inquiry = await BulkInquiryService.create({
      ...parsed.data,
      email: parsed.data.email || null,
      requirements: parsed.data.requirements || null,
    });
    return sendSuccess(res, inquiry, 'Bulk inquiry submitted successfully', 201);
  } catch (err) {
    next(err);
  }
});
