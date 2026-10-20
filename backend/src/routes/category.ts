import { Router, Request, Response, NextFunction } from 'express';
import { CategoryService } from '../services/categoryService';
import { sendSuccess } from '../common/utils/response';

export const publicCategoryRouter = Router();

/**
 * GET /api/v1/categories
 * Returns active categories ordered by sort_order and name.
 */
publicCategoryRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await CategoryService.getActiveCategories();
    return sendSuccess(res, categories, 'Categories retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/categories/slug/:slug
 * Returns active category by its unique URL slug.
 */
publicCategoryRouter.get('/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug);
    const category = await CategoryService.getCategoryBySlug(slug, true);
    return sendSuccess(res, category);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/categories/:id
 * Returns active category by UUID.
 */
publicCategoryRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const category = await CategoryService.getCategoryById(id, true);
    return sendSuccess(res, category);
  } catch (err) {
    next(err);
  }
});
