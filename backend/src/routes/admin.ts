import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../common/middleware/auth';
import { requireRole } from '../common/middleware/authorize';
import { sendSuccess } from '../common/utils/response';
import {
  createCategorySchema,
  updateCategorySchema,
  createBrandSchema,
  updateBrandSchema,
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateInventorySchema,
} from '../common/validation/catalogueSchemas';
import {
  uploadImageMetadataSchema,
  updateImageMetadataSchema,
} from '../common/validation/imageSchemas';
import { uploadImageMiddleware } from '../common/middleware/imageUpload';
import { uploadInvoiceMiddleware } from '../common/middleware/documentUpload';
import { BadRequestError } from '../common/errors';
import { CategoryService } from '../services/categoryService';
import { BrandService } from '../services/brandService';
import { ProductService } from '../services/productService';
import { ImageService } from '../services/imageService';
import { AdminService } from '../services/adminService';
import {
  adminOrderQuerySchema,
  updateOrderStatusSchema,
  collectCodPaymentSchema,
  inventoryAdjustmentSchema,
  inventoryMovementQuerySchema,
  adminCustomerQuerySchema,
  adminAuditLogQuerySchema,
} from '../common/validation/adminSchemas';
import { orderIdParamSchema, cancelOrderSchema } from '../common/validation/orderSchemas';
import { adminRateLimiter } from '../common/middleware/rateLimiter';

export const adminRouter = Router();

// Apply auth, admin check, and abuse rate limiting to all admin routes
adminRouter.use(authenticate, requireRole('admin'), adminRateLimiter);

/**
 * GET /api/v1/admin/verify
 */
adminRouter.get('/verify', (req: Request, res: Response) => {
  return sendSuccess(
    res,
    {
      adminId: req.user!.id,
      email: req.user!.email,
      role: req.user!.role,
    },
    'Admin authorization verified.'
  );
});

// ----------------- Categories Admin CRUD -----------------
adminRouter.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await CategoryService.getAllCategories();
    return sendSuccess(res, categories);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const category = await CategoryService.createCategory(parsed.data);
    return sendSuccess(res, category, 'Category created successfully', 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const category = await CategoryService.updateCategory(id, parsed.data);
    return sendSuccess(res, category, 'Category updated successfully');
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await CategoryService.deleteCategory(id);
    return sendSuccess(res, null, 'Category deleted successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Brands Admin CRUD -----------------
adminRouter.get('/brands', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const brands = await BrandService.getAllBrands();
    return sendSuccess(res, brands);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/brands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createBrandSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const brand = await BrandService.createBrand(parsed.data);
    return sendSuccess(res, brand, 'Brand created successfully', 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/brands/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const parsed = updateBrandSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const brand = await BrandService.updateBrand(id, parsed.data);
    return sendSuccess(res, brand, 'Brand updated successfully');
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/brands/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await BrandService.deleteBrand(id);
    return sendSuccess(res, null, 'Brand deleted successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Products Admin CRUD -----------------
adminRouter.post('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const product = await ProductService.createProduct(parsed.data);
    return sendSuccess(res, product, 'Product created successfully', 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const product = await ProductService.updateProduct(id, parsed.data);
    return sendSuccess(res, product, 'Product updated successfully');
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await ProductService.deleteProduct(id);
    return sendSuccess(res, null, 'Product deleted successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Product Variants & Inventory -----------------
adminRouter.post('/products/:id/variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const parsed = createVariantSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const variant = await ProductService.createVariant(id, parsed.data);
    return sendSuccess(res, variant, 'Variant created successfully', 201);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/products/:id/inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const parsed = updateInventorySchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const variantId = req.query.variantId ? String(req.query.variantId) : null;
    const inventory = await ProductService.updateInventory(id, variantId, parsed.data);
    return sendSuccess(res, inventory, 'Inventory updated successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Product Images Admin CRUD -----------------
adminRouter.post(
  '/products/:productId/images',
  uploadImageMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.productId);
      if (!req.file) {
        throw new BadRequestError('Image file is required. Please provide a file in the "image" form-data field.');
      }

      const parsed = uploadImageMetadataSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const image = await ImageService.uploadProductImage(productId, req.file.buffer, parsed.data);
      return sendSuccess(res, image, 'Image uploaded successfully', 201);
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.patch(
  '/products/:productId/images/:imageId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.productId);
      const imageId = String(req.params.imageId);

      const parsed = updateImageMetadataSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const image = await ImageService.updateImageMetadata(productId, imageId, parsed.data);
      return sendSuccess(res, image, 'Image metadata updated successfully');
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.post(
  '/products/:productId/images/:imageId/primary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.productId);
      const imageId = String(req.params.imageId);

      const image = await ImageService.setPrimaryImage(productId, imageId);
      return sendSuccess(res, image, 'Primary image updated successfully');
    } catch (err) {
      next(err);
    }
  }
);

adminRouter.delete(
  '/products/:productId/images/:imageId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = String(req.params.productId);
      const imageId = String(req.params.imageId);

      await ImageService.deleteProductImage(productId, imageId);
      return sendSuccess(res, null, 'Image deleted successfully');
    } catch (err) {
      next(err);
    }
  }
);

// ----------------- Phase 8 Admin Dashboard & Analytics -----------------
adminRouter.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await AdminService.getDashboardStats();
    return sendSuccess(res, stats, 'Admin dashboard statistics retrieved successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Phase 8 Admin Orders Management -----------------
adminRouter.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = adminOrderQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);

    const orders = await AdminService.listAdminOrders(parsed.data);
    return sendSuccess(res, orders, 'Admin orders retrieved successfully');
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/orders/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramParsed = orderIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) return next(paramParsed.error);

    const order = await AdminService.getAdminOrderById(paramParsed.data.orderId);
    return sendSuccess(res, order, 'Admin order details retrieved successfully');
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/orders/:orderId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramParsed = orderIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) return next(paramParsed.error);

    const bodyParsed = updateOrderStatusSchema.safeParse(req.body);
    if (!bodyParsed.success) return next(bodyParsed.error);

    const updated = await AdminService.updateOrderStatus(
      paramParsed.data.orderId,
      bodyParsed.data.status,
      req.user!.id,
      bodyParsed.data.reason
    );

    return sendSuccess(res, updated, 'Order status updated successfully');
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/orders/:orderId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramParsed = orderIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) return next(paramParsed.error);

    const bodyParsed = cancelOrderSchema.safeParse(req.body);
    if (!bodyParsed.success) return next(bodyParsed.error);

    const updated = await AdminService.updateOrderStatus(
      paramParsed.data.orderId,
      'cancelled',
      req.user!.id,
      bodyParsed.data.reason
    );

    return sendSuccess(res, updated, 'Order cancelled by administrator successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Phase 8 Cash on Delivery (COD) Collection -----------------
adminRouter.post('/orders/:orderId/collect-cod', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramParsed = orderIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) return next(paramParsed.error);

    const bodyParsed = collectCodPaymentSchema.safeParse(req.body);
    if (!bodyParsed.success) return next(bodyParsed.error);

    const updated = await AdminService.collectCodPayment(
      paramParsed.data.orderId,
      req.user!.id,
      bodyParsed.data.notes
    );

    return sendSuccess(res, updated, 'COD cash payment recorded successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Phase 8 Order Invoice Upload / Re-upload -----------------
adminRouter.post(
  '/orders/:orderId/invoice',
  uploadInvoiceMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paramParsed = orderIdParamSchema.safeParse(req.params);
      if (!paramParsed.success) return next(paramParsed.error);

      if (!req.file) {
        throw new BadRequestError('Invoice document is required. Please upload a PDF or image in the "invoice" form field.');
      }

      const updated = await AdminService.uploadOrderInvoice(
        paramParsed.data.orderId,
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.user!.id
      );

      return sendSuccess(res, updated, 'Invoice uploaded successfully', 200);
    } catch (err) {
      next(err);
    }
  }
);

// ----------------- Phase 8 Admin Inventory Management -----------------
adminRouter.post('/inventory/adjustments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = inventoryAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const result = await AdminService.adjustInventoryStock({
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      quantityChange: parsed.data.quantityChange,
      movementType: parsed.data.movementType,
      reason: parsed.data.reason,
      actorId: req.user!.id,
      referenceId: parsed.data.referenceId,
    });

    return sendSuccess(res, result, 'Inventory adjusted successfully');
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/inventory/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = inventoryMovementQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);

    const movements = await AdminService.listInventoryMovements(parsed.data);
    return sendSuccess(res, movements, 'Inventory movements retrieved successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Phase 8 Customer Administration -----------------
adminRouter.get('/customers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = adminCustomerQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);

    const customers = await AdminService.listCustomers(parsed.data);
    return sendSuccess(res, customers, 'Customer accounts retrieved successfully');
  } catch (err) {
    next(err);
  }
});

// ----------------- Phase 8 Audit Logs -----------------
adminRouter.get('/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = adminAuditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);

    const logs = await AdminService.listAuditLogs(parsed.data);
    return sendSuccess(res, logs, 'Administrative audit logs retrieved successfully');
  } catch (err) {
    next(err);
  }
});

