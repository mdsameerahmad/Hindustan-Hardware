import { Router, Request, Response, NextFunction } from 'express';
import { BrandService } from '../services/brandService';
import { sendSuccess } from '../common/utils/response';

export const publicBrandRouter = Router();

/**
 * GET /api/v1/brands
 * Returns active brands ordered by display_order and name.
 */
publicBrandRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const brands = await BrandService.getActiveBrands();
    return sendSuccess(res, brands, 'Brands retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/brands/slug/:slug
 * Returns active brand by its unique URL slug.
 */
publicBrandRouter.get('/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug);
    const brand = await BrandService.getBrandBySlug(slug, true);
    return sendSuccess(res, brand);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/brands/:id
 * Returns active brand by UUID.
 */
publicBrandRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const brand = await BrandService.getBrandById(id, true);
    return sendSuccess(res, brand);
  } catch (err) {
    next(err);
  }
});
