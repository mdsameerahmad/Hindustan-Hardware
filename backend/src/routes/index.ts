import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { customerRouter } from './customer';
import { adminRouter } from './admin';
import { publicCategoryRouter } from './category';
import { publicBrandRouter } from './brand';
import { publicProductRouter } from './product';
import { cartRouter } from './cart';
import { checkoutRouter } from './checkout';
import { deliveryRouter } from './delivery';
import { locationRouter } from './location';
import { bulkInquiryRouter } from './bulkInquiry';

export const apiV1Router = Router();

// Mount health routes under /api/v1
apiV1Router.use('/', healthRouter);

// Mount authentication routes under /api/v1/auth
apiV1Router.use('/auth', authRouter);

// Mount customer profile routes under /api/v1/customers
apiV1Router.use('/customers', customerRouter);

// Mount location and geocoding routes under /api/v1/location
apiV1Router.use('/location', locationRouter);

// Mount public bulk inquiry submission routes
apiV1Router.use('/bulk-inquiries', bulkInquiryRouter);

// Mount public catalogue routes
apiV1Router.use('/categories', publicCategoryRouter);
apiV1Router.use('/brands', publicBrandRouter);
apiV1Router.use('/products', publicProductRouter);

// Mount cart routes under /api/v1/cart
apiV1Router.use('/cart', cartRouter);

// Mount checkout routes under /api/v1/checkout
apiV1Router.use('/checkout', checkoutRouter);

// Mount delivery tracking routes under /api/v1/deliveries
apiV1Router.use('/deliveries', deliveryRouter);

// Mount admin management routes under /api/v1/admin
apiV1Router.use('/admin', adminRouter);

