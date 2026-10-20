import { Router, Request, Response, NextFunction } from 'express';
import { ProductService } from '../services/productService';
import { ImageService } from '../services/imageService';
import { ComparisonService } from '../services/comparisonService';
import { productListingQuerySchema } from '../common/validation/catalogueSchemas';
import { compareProductsQuerySchema } from '../common/validation/imageSchemas';
import { sendSuccess } from '../common/utils/response';

export const publicProductRouter = Router();

/**
 * GET /api/v1/products
 * Public product listing with search, category/brand filter, price range, and pagination.
 */
publicProductRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedQuery = productListingQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return next(parsedQuery.error);
    }

    const result = await ProductService.listProducts(parsedQuery.data);
    return sendSuccess(res, result.items, 'Products retrieved successfully', 200, {
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/compare?ids=id1,id2,id3
 * Compares 1 to 6 products across specifications, prices, brands, and variants.
 * NOTE: Declared before /:id to avoid route shadowing.
 */
publicProductRouter.get('/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedQuery = compareProductsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return next(parsedQuery.error);
    }

    const ids = parsedQuery.data.ids.split(',').map((id) => id.trim()).filter(Boolean);
    const comparison = await ComparisonService.compareProducts(ids);
    return sendSuccess(res, comparison, 'Product comparison retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/featured
 * Returns curated featured products for landing or spotlight sections.
 */
publicProductRouter.get('/featured', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
    const featured = await ProductService.getFeaturedProducts(isNaN(limit) ? 10 : limit);
    return sendSuccess(res, featured, 'Featured products retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/slug/:slug
 * Returns active product by unique URL slug.
 */
publicProductRouter.get('/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = String(req.params.slug);
    const product = await ProductService.getProductBySlug(slug, true);
    return sendSuccess(res, product);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/:id/images
 * Public gallery of product images in display order.
 */
publicProductRouter.get('/:id/images', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const images = await ImageService.getProductImages(id);
    return sendSuccess(res, images, 'Product images retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/:id/alternatives
 * Cross-brand alternative products sharing category or comparison group.
 */
publicProductRouter.get('/:id/alternatives', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const brandId = req.query.brandId ? String(req.query.brandId) : undefined;
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

    const alternatives = await ComparisonService.getAlternatives(id, {
      brandId,
      minPrice,
      maxPrice,
      limit,
    });
    return sendSuccess(res, alternatives, 'Alternative products retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/:id/related
 * Returns active related products sharing the same category.
 */
publicProductRouter.get('/:id/related', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 4;
    const related = await ProductService.getRelatedProducts(id, isNaN(limit) ? 4 : limit);
    return sendSuccess(res, related, 'Related products retrieved successfully');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/products/:id
 * Returns active product detail by UUID.
 */
publicProductRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const product = await ProductService.getProductById(id, true);
    return sendSuccess(res, product);
  } catch (err) {
    next(err);
  }
});
