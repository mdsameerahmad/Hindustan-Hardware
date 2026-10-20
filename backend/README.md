# Hindustan Hardware & Sanitary E-Commerce — Backend Architecture (Phases 1, 2, 3 & 4)

## 1. Overview & Scope

This service constitutes the production-ready modular backend for the Hindustan Hardware & Sanitary e-commerce platform.

### Phase 1 Summary:
- Express.js HTTP application written in TypeScript (ES2022).
- Zod-based strongly-typed configuration and environment variable validation.
- Centralized error handling and operational error taxonomy (`AppError`, `NotFoundError`, `BadRequestError`, etc.).
- Structured JSON logging with automated redaction of sensitive credentials and headers.
- Per-request UUID tracking (`x-request-id`).
- Security middleware (Helmet, CORS with origin allowlisting, request body limits).
- Supabase PostgreSQL client abstraction with strict separation of public client vs. privileged server client (Row Level Security maintained).
- Liveness and readiness health check endpoints (`/health`, `/api/v1/health`, `/api/v1/health/ready`).

### Phase 2 Summary:
- **Real Supabase Auth Integration**: Registration, login, logout, password recovery, session verification.
- **Persistent Profiles & Roles**: PostgreSQL `profiles` table linked to `auth.users`, with roles (`customer`, `admin`, `staff`).
- **Database Migrations & Triggers**: Automated profile creation trigger on signup with guaranteed default `customer` role.
- **Row Level Security (RLS)**: Policies preventing users from reading or mutating other profiles or escalating their own privileges.
- **Authentication & Authorization Middleware**: Bearer token server-side verification (`authenticate`), role-based protection (`requireRole`).
- **Brute Force Protection**: IP-based rate limiting on all authentication routes (`authRateLimiter`).
- **Admin Provisioning**: Controlled CLI script for bootstrapping administrator accounts without public exposure.

### Phase 3 Summary:
- **Product Catalogue**: Products, categories, brands, product variants, and inventory foundation.
- **Public Catalogue APIs**:
  - Full-featured product listing with server-side filtering (category, brand, price range, featured status, availability), search, sorting, and pagination.
  - Featured product retrieval (`/products/featured`).
  - Product detail lookup by ID (`/products/:id`) and unique slug (`/products/slug/:slug`).
  - Related product retrieval (`/products/:id/related`) based on category matching, strictly excluding self.
  - Categories list and detail (`/categories`, `/categories/:id`, `/categories/slug/:slug`).
  - Brands list and detail (`/brands`, `/brands/:id`, `/brands/slug/:slug`).
- **Administrative Catalogue CRUD**:
  - Full CRUD operations on categories, brands, and products.
  - Variant creation and inventory level management.
  - Foreign key integrity enforcement (preventing deletion of referenced categories or brands).
- **Database Migrations**: Version-controlled SQL migration (`002_create_catalogue_schema.sql`) with tables, triggers, indexes, and RLS policies for catalogue tables.

### Phase 4 Summary:
- **Product Image Management & Supabase Storage**:
  - Secure multipart image uploads via Express + Multer memory storage.
  - Binary magic byte validation (verifying true file signatures for JPEG, PNG, and WebP, rejecting fake extensions).
  - Supabase Storage bucket integration (`product-images`).
  - Transactional error rollback: if database metadata insertion fails, uploaded storage objects are automatically purged.
  - Deterministic image ordering and gallery retrieval (`GET /products/:id/images`).
  - Explicit primary image designation (`POST /admin/products/:productId/images/:imageId/primary`) enforced by a PostgreSQL partial unique index (`WHERE is_primary = true`).
  - Automatic primary image succession upon primary image deletion.
- **Brand & Product Comparison**:
  - Multi-product comparison API (`GET /products/compare?ids=id1,id2,...`) comparing 1–6 products across specifications, dimensions, pressure ratings, materials, brand details, variants, and live inventory.
  - Automatic identification of shared attributes vs. attribute differences.
- **Cross-Brand Alternatives**:
  - Alternative product discovery (`GET /products/:id/alternatives`) based on category and technical comparison groups.
  - Returns calculated attribute matches, differing attributes, and monetary price deltas across competing brands, strictly excluding the target product.
- **Zero Mock / Temporary Data**:
  - Production code contains no hardcoded comparison fixtures, dummy products, or fake image URLs; all queries target Supabase PostgreSQL and Supabase Storage.

### Phase 5 Summary:
- **Customer Address Management**:
  - Full CRUD operations under `/api/v1/customers/me/addresses`.
  - Single default address invariant enforced safely via atomic transitions and partial unique index (`WHERE is_default = true`).
  - Next address automatic promotion upon deletion of a default address.
- **Guest Browsing & Cart Lifecycle**:
  - Public anonymous catalogue browsing without forced authentication.
  - Guest cart creation (`POST /api/v1/cart/guest`) issuing 32-byte cryptographically secure random token (`x-guest-cart-token`).
  - Stored token hashes (SHA-256) preventing database credential leakage.
  - Guest cart items addition, quantity updates, single item removal, and full cart clear.
- **Authenticated Persistent Cart**:
  - Live database-backed cart under `/api/v1/cart`.
  - Server-side price calculation directly from active product and variant records (never trusting client-supplied prices).
  - Positive integer quantity enforcement (1–999 limit).
  - Informational line totals, total quantities, and subtotal.
  - Clear real-time inventory availability reflection.
- **Cart Merge Post-Authentication**:
  - Merge endpoint (`POST /api/v1/cart/merge`) called after customer login/registration.
  - Merges guest items into persistent customer cart and invalidates guest cart (`status = 'merged'`).
  - Idempotent execution preventing double-merging.
- **Customer Wishlist**:
  - Customer saved products feature under `/api/v1/customers/me/wishlist` (retrieval, idempotent addition, removal).
- **Zero Mock / Temporary Data**:
  - All operations run directly against PostgreSQL schemas with RLS policies.

---

## 2. Architecture & Directory Structure


```
backend/
├── src/
│   ├── app.ts                  # Express application factory, middleware pipeline
│   ├── server.ts               # HTTP listener, lifecycle hooks, graceful shutdown
│   ├── config/
│   │   ├── env.ts              # Zod environment schema and validation
│   │   └── supabase.ts         # Supabase client instantiation & connectivity check
│   ├── common/
│   │   ├── errors/
│   │   │   └── index.ts        # AppError hierarchy
│   │   ├── middleware/
│   │   │   ├── auth.ts         # Bearer token verification & user profile retrieval
│   │   │   ├── authorize.ts    # Role-based access control (requireRole)
│   │   │   ├── errorHandler.ts # Centralized error formatting & sanitization
│   │   │   ├── imageUpload.ts  # Multer configuration & magic byte binary inspection
│   │   │   ├── notFoundHandler.ts # Standardized 404 handling
│   │   │   ├── rateLimiter.ts  # Express-rate-limit middleware for auth endpoints
│   │   │   ├── requestId.ts    # Correlation ID generation and header attachment
│   │   │   └── requestLogger.ts# Structured request duration and status logging
│   │   ├── utils/
│   │   │   ├── logger.ts       # Structured JSON logger with credential redaction
│   │   │   └── response.ts     # Standardized JSON response envelopes
│   │   └── validation/
│   │       ├── authSchemas.ts  # Zod validation schemas for auth & profile endpoints
│   │       ├── catalogueSchemas.ts # Zod validation schemas for products, brands, categories
│   │       └── imageSchemas.ts # Zod validation schemas for image upload & comparison
│   ├── services/
│   │   ├── categoryService.ts  # Business logic & DB queries for categories
│   │   ├── brandService.ts     # Business logic & DB queries for brands
│   │   ├── productService.ts   # Product search, filter, pagination, detail & admin CRUD
│   │   ├── imageService.ts     # Image upload, storage integration, metadata & gallery
│   │   └── comparisonService.ts# Multi-product comparison & cross-brand alternatives
│   ├── routes/
│   │   ├── index.ts            # Top-level API router mounted at /api/v1
│   │   ├── health.ts           # Liveness and readiness endpoints
│   │   ├── auth.ts             # Registration, login, session, recovery endpoints
│   │   ├── customer.ts         # Customer profile management (/me)
│   │   ├── category.ts         # Public category endpoints
│   │   ├── brand.ts            # Public brand endpoints
│   │   ├── product.ts          # Public product search, filter, detail, compare & alternatives
│   │   └── admin.ts            # Administrative catalogue & image management endpoints
│   └── types/
│       └── index.ts            # Response models, ProductImage, ProductComparisonItem
├── migrations/
│   ├── 001_create_profiles_and_roles.sql   # SQL migration with RLS & triggers for auth
│   ├── 002_create_catalogue_schema.sql      # SQL migration for categories, brands, products, inventory
│   └── 003_create_product_images_schema.sql # SQL migration for product_images & primary index
├── scripts/
│   └── provision-admin.ts      # Secure admin account provisioning script
├── tests/
│   ├── app.test.ts             # Health, 404, security headers, error handling tests
│   ├── auth.test.ts            # Authentication, registration, profiles, RBAC tests
│   ├── catalogue.test.ts       # Catalogue listing, filters, search, related, admin CRUD tests
│   └── images_and_comparison.test.ts # Image uploads, magic bytes, compare & alternatives tests
├── .env.example                # Safe environment variable template
├── .gitignore                  # Git ignore rules for node_modules, dist, secrets
├── package.json                # Project dependencies and operational scripts
├── tsconfig.json               # TypeScript compiler options
├── vitest.config.ts            # Vitest test runner configuration
└── README.md                   # Backend documentation
```

---

## 3. Database Schema, Constraints & RLS Policies

Database migrations are located in `migrations/`:
- `001_create_profiles_and_roles.sql` (Phase 2)
- `002_create_catalogue_schema.sql` (Phase 3)
- `003_create_product_images_schema.sql` (Phase 4)

### Tables & Relationships:
1. `public.product_images`:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE`
   - `variant_id UUID DEFAULT NULL REFERENCES public.product_variants(id) ON DELETE SET NULL`
   - `storage_path TEXT NOT NULL UNIQUE`
   - `alt_text TEXT DEFAULT NULL`
   - `display_order INTEGER NOT NULL DEFAULT 0`
   - `is_primary BOOLEAN NOT NULL DEFAULT false`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())`
   - Partial unique constraint: `CREATE UNIQUE INDEX uq_product_primary_image ON public.product_images(product_id) WHERE (is_primary = true)`

### Row Level Security (RLS) Policies:
- **Public Access**: Anonymous or customer users can only execute `SELECT` queries on `product_images` belonging to active products (`products.is_active = true`).
- **Admin Access**: Users whose profile role is `'admin'` possess full privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on `product_images`.

---

## 4. Supabase Storage Configuration

- **Bucket Name**: `product-images`
- **Visibility**: Public bucket (images served via permanent canonical storage paths).
- **Access Policies**:
  - Public `SELECT` allowed for all users.
  - `INSERT`, `UPDATE`, `DELETE` restricted to verified service-role or administrative operations.

---

## 5. API Documentation

All versioned endpoints are mounted at `/api/v1`.

### A. Public Product, Image & Comparison Endpoints

#### Images & Gallery
- `GET /api/v1/products/:id/images`: Retrieves all active images for a product ordered by primary status (`is_primary DESC`), `display_order ASC`, and `created_at ASC`.

#### Product Comparison
- `GET /api/v1/products/compare?ids=id1,id2,...`
  - **Query Parameters**: `ids` (comma-separated UUIDs, 1 to 6 products).
  - **Behavior**: Retrieves real database records, variants, prices, specifications, and primary images. Calculates `commonAttributes` and `attributeDifferences`.
  - **Response Envelope**:
    ```json
    {
      "success": true,
      "message": "Product comparison retrieved successfully",
      "data": {
        "products": [
          {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Ashirvad CPVC Pipe 1 inch",
            "slug": "ashirvad-cpvc-1",
            "basePrice": 500,
            "material": "CPVC",
            "diameter": "1 inch",
            "pressureRating": "SDR 11",
            "brand": { "name": "Ashirvad Pipes" },
            "stockAvailable": 40,
            "primaryImage": "https://.../img-1.png",
            "variants": []
          }
        ],
        "commonAttributes": { "material": true, "diameter": true },
        "attributeDifferences": ["basePrice"]
      }
    }
    ```

#### Cross-Brand Alternatives
- `GET /api/v1/products/:id/alternatives`
  - **Query Parameters**: `brandId`, `minPrice`, `maxPrice`, `limit` (default: 6).
  - **Behavior**: Finds competing active products sharing category or technical comparison group, excluding self. Identifies exact matching technical attributes, differing attributes, and monetary price delta.

---

### B. Administrative Image Management Endpoints (`/api/v1/admin`)
*All administrative endpoints require `Authorization: Bearer <token>` and `role: admin`.*

- `POST /api/v1/admin/products/:productId/images`: Uploads image (`multipart/form-data` with `image` file, optional `altText`, `displayOrder`, `isPrimary`, `variantId`). Validates file signature (JPEG, PNG, WebP) and size (< 5MB).
- `PATCH /api/v1/admin/products/:productId/images/:imageId`: Updates image metadata (`altText`, `displayOrder`, `variantId`).
- `POST /api/v1/admin/products/:productId/images/:imageId/primary`: Designates specified image as the primary image for the product, atomically demoting any existing primary image.
- `DELETE /api/v1/admin/products/:productId/images/:imageId`: Deletes image from database and Supabase Storage. If the deleted image was primary, automatically promotes the next available gallery image.

---

## 6. Phase 6 — Checkout, Cash on Delivery & Order Creation

### Exclusive Payment Method: Cash on Delivery (COD)
- **Cash on Delivery (`cod`) is strictly the ONLY supported payment method.**
- Online payments, payment gateways, card processing, Razorpay, Stripe, UPI initiation, payment webhooks, or payment verification endpoints are **NOT** implemented and any request specifying payment methods other than `cod` is explicitly rejected with `400 Bad Request`.
- Initial order creation sets `payment_status` to `'pending'` (unpaid). An order is never marked as paid merely because it was created.

### Checkout Endpoints
- `POST /api/v1/checkout/validate`:
  - Validates customer authentication, active cart, and address ownership.
  - Recalculates authoritative live prices and line totals from the live database.
  - Verifies stock availability without reserving or mutating inventory.
  - Detects any price discrepancies between cart addition and checkout.
- `POST /api/v1/checkout`:
  - Atomically creates an order with generated reference (`HH-YYYYMMDD-XXXXXX`).
  - Supports duplicate request protection via `idempotencyKey` (or header `X-Idempotency-Key`).
  - Locks and validates inventory, deducting ordered quantities or rolling back cleanly.
  - Records immutable snapshots in `order_items` (product name, SKU, variant title, unit price, quantity, line subtotal).
  - Captures shipping address snapshot in `orders.shipping_address_snapshot`.
  - Records initial order history in `order_status_history` (`status: 'pending'`, `reason: 'Order placed by customer via Cash on Delivery'`).
  - Clears purchased items from the active cart.

---

## 7. Phase 7 — Customer Order Management, Order History & Status Tracking

### Customer Order APIs
- `GET /api/v1/customers/me/orders`:
  - Retrieves paginated order history strictly scoped to authenticated customer (`user_id = auth.uid()`).
  - Supports query filters: `page`, `limit` (max 50), `status`, `sortBy` (`created_at` or `total_amount`), and `sortOrder` (`asc` or `desc`).
  - Returns structured summaries including order reference, order creation timestamp, status, payment method (`cod`), payment status, persisted subtotal and total, item count, and total quantity.
- `GET /api/v1/customers/me/orders/:orderId`:
  - Retrieves individual order details including immutable purchase-time snapshots from `order_items` (product name, SKU, variant title, specifications, historical unit price, line subtotal).
  - Includes shipping address snapshot, COD payment method, current payment status, customer cancellation eligibility flag (`canCancel`), and chronological status history.
  - Rejects attempts to access another customer's order with a safe `404 Not Found`.
- `GET /api/v1/customers/me/orders/:orderId/status`:
  - Returns order status tracking information and full chronological transition audit history.
  - Strictly relies on actual recorded database events; does not fabricate real-time delivery movements, GPS coordinates, or driver details.
- `POST /api/v1/customers/me/orders/:orderId/cancel`:
  - Allows customer order cancellation only from explicitly permitted initial states (`pending` or `confirmed`).
  - Rejects cancellation requests once an order advances to `processing`, `shipped`, `delivered`, or `cancelled` with `400 Bad Request`.
  - Atomically marks status as `cancelled`, updates pending COD payment status to `cancelled`, logs the transition to `order_status_history`, and restores deducted inventory stock exactly once.
  - Supported by transactional PostgreSQL function `cancel_customer_order` with row-level locks and coordinated service fallback.
  - Handles repeated cancellation retries idempotently without duplicate stock restoration.

### Cash on Delivery (COD) Visibility & Status Rules
- Order status remains strictly separated from payment status.
- COD orders created at checkout default to `pending` payment status.
- Placing an order, processing an order, or shipping an order never marks a COD order as paid.
- Customers cannot modify payment status or mark orders as paid.
- Cancellation transitions pending COD orders to `cancelled`. No refund workflow is triggered as cash is collected only upon physical delivery.

---

## 8. Phase 8 — Complete Admin Panel Backend & Store Management

### Admin Security & Authorization
- All `/api/v1/admin/*` endpoints strictly enforce authentication via verified Supabase JWTs and verify that the user's persistent profile has `role = 'admin'`.
- Request-body role manipulation is impossible; identity and privileges are derived server-side.
- Ordinary customers are rejected with `403 Forbidden`.

### Admin Dashboard & Statistics (`GET /api/v1/admin/dashboard`)
- Aggregates live database statistics:
  - Customer totals (excluding internal admin accounts).
  - Catalogue totals (active products, categories, brands, low stock products `< 10`).
  - Order breakdowns by status (`pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`).
  - Total order value (excluding cancelled orders).
  - Collected COD revenue (actual cash collected by store) vs. Pending COD revenue awaiting physical delivery collection.
  - Recent 5 orders summary.

### Admin Order Management & State Machine
- `GET /api/v1/admin/orders`: Filterable by `status`, `paymentStatus`, `userId`, `startDate`, `endDate`, and sortable with pagination.
- `GET /api/v1/admin/orders/:orderId`: Full administrative order view with historical order items and audit trail.
- `PATCH /api/v1/admin/orders/:orderId/status`: Validates transitions against store state machine:
  - `pending` -> `confirmed` | `cancelled`
  - `confirmed` -> `processing` | `cancelled`
  - `processing` -> `shipped` | `cancelled`
  - `shipped` -> `delivered` | `cancelled`
  - Transitioning to `cancelled` automatically restores inventory exactly once.
- `POST /api/v1/admin/orders/:orderId/cancel`: Explicit admin cancellation with inventory restoration and reason audit logging.

### Cash on Delivery (COD) Collection (`POST /api/v1/admin/orders/:orderId/collect-cod`)
- Authorized store operation to record verified cash receipt upon delivery or shop pickup.
- Atomically transitions order `payment_status` to `'paid'`, records actor ID and collection notes, logs an entry in `audit_logs`, and prevents duplicate collection.
- COD remains the exclusive payment method; no online payment gateways or webhooks exist.

### Inventory Adjustments & Stock Movement History
- `POST /api/v1/admin/inventory/adjustments`:
  - Adjusts stock (`restock`, `adjustment`, `correction`, `return`) atomically.
  - Prevents negative inventory with strict database constraint checks.
  - Records full before/after quantities, actor ID, and reason in `inventory_movements`.
- `GET /api/v1/admin/inventory/movements`: Lists audit trail of all inventory changes with filtering and pagination.

### Customer Administration & Audit Logs
- `GET /api/v1/admin/customers`: Lists customer accounts with aggregate metrics (order count, total spent), while keeping passwords and auth secrets completely hidden.
- `GET /api/v1/admin/audit-logs`: Lists non-sensitive administrative audit logs (`ORDER_STATUS_UPDATE`, `COLLECT_COD_PAYMENT`, `INVENTORY_ADJUSTMENT`, etc.) with actor ID, timestamp, and details.

---

## 9. Phase 9 — End-to-End Testing & Security Hardening

### Comprehensive Security Audit & Hardening
- **HTTP Security Headers & CORS**:
  - Configured with `helmet` for `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict origin allowlist validation with credentials support.
  - Unique correlation ID (`x-request-id`) injected and tracked on every request/response.
- **Request Size & Payload Protection**:
  - Implemented body-parser limit protection.
  - Custom error handling for oversized payloads returning standard `413 Payload Too Large` with safe diagnostic messages (`PAYLOAD_TOO_LARGE`).
- **Endpoint-Specific Rate Limiting**:
  - Authentication endpoints: 30 requests / 15 minutes per IP (`authRateLimiter`).
  - Checkout order submissions: 15 requests / minute per IP (`checkoutRateLimiter`).
  - Order cancellation: 10 requests / minute per IP (`cancellationRateLimiter`).
  - Administrative endpoints: 60 requests / minute per IP (`adminRateLimiter`).
- **Input Validation & Parameterized Safety**:
  - Strict Zod validation schemas across all route parameters (UUIDs), queries, and request bodies.
  - SQL injection payloads and unexpected fields cleanly rejected before query execution without leaking database internals.
- **Object-Level Authorization & Privilege Escalation Defenses**:
  - Server-side role resolution prevents mass-assignment or client-supplied role tampering.
  - Cross-customer object ownership validation prevents unauthorized address, order, or cart access.

---

## 10. Automated Tests & Verification Results

All automated tests across all 9 phases passed cleanly:

1. **Test Suite Execution**:
   ```bash
   npm run test
   # Result: 116 passed across 9 test files
   ```
   - **Phase 1 (14 tests)**: Liveness & readiness probes, security headers, request ID propagation, centralized error handling.
   - **Phase 2 (16 tests)**: Real Supabase Auth, customer registration, login, logout, password recovery, session validation, profile management, and RBAC authorization.
   - **Phase 3 (13 tests)**: Active categories & brands, product search, filter, sorting, pagination, featured products, related products, admin CRUD.
   - **Phase 4 (11 tests)**: Image storage, binary magic bytes validation, primary image management, multi-product comparison, cross-brand alternatives.
   - **Phase 5 (17 tests)**: Customer address management, guest cart hashing, persistent customer cart, cart merge, wishlist.
   - **Phase 6 (9 tests)**: Checkout requires customer authentication, address validation, COD exclusive enforcement, live inventory deduction, idempotency deduplication.
   - **Phase 7 (12 tests)**: Customer order history, individual order details, status tracking without fake GPS/driver data, customer cancellation with inventory restoration.
   - **Phase 8 (14 tests)**: Admin security, dashboard metrics, order state machine, COD cash collection, inventory adjustments, customer admin, audit logs.
   - **Phase 9 (10 tests)**:
     - Security headers (Helmet) and unique request ID propagation.
     - Disallowed CORS origin blocking.
     - Oversized payload rejection (`413 Payload Too Large`).
     - Route parameter SQL injection & malformed UUID rejection without stack leakage.
     - Negative prices and invalid types rejection.
     - Customer privilege escalation defenses.
     - Customer object ownership and address isolation.
     - Complete E2E commerce cycle (Cart -> Validate -> Checkout -> Order Detail -> Order Cancellation -> Single Inventory Restoration).

2. **TypeScript Compilation Check**:
   ```bash
   npm run typecheck
   # Result: Passed without errors
   ```
---

## 11. Production-Ready Excel-to-Supabase Catalogue Seeding

The backend includes a dedicated script for ingesting `Hindustan_Hardware_DB_Import_Catalog_v2.xlsx` into Supabase PostgreSQL: `backend/scripts/seed-excel-catalogue.ts`.

### Script Capabilities & Safety Gates
1. **Inspection Mode (`--inspect`)**:
   - Parses the Excel workbook without touching the database.
   - Audits sheet names (`Products_Import`, `Stock_Review`), header columns, category counts, brand counts, and pricing anomalies.
   - Command:
     ```bash
     npx tsx scripts/seed-excel-catalogue.ts --inspect
     ```
2. **Dry-Run Validation Mode (`--dry-run`)**:
   - Runs full memory normalization and business validation against all rows.
   - Validates that `compare_at_price = Sale Price (MRP)`, `base_price = MRP - Discount`, and fixed INR discounts are stored in `specs.discount_amount`.
   - Excludes rows where fixed discount exceeds MRP (negative base price) and reports duplicate slug collisions.
   - Command:
     ```bash
     npx tsx scripts/seed-excel-catalogue.ts --dry-run
     ```
3. **Approved Sample Mode (`--apply-sample`)**:
   - Imports only the verified 5-product sample to test schema, relationships, and inventory uniqueness.
   - Command:
     ```bash
     npx tsx scripts/seed-excel-catalogue.ts --apply-sample
     ```
4. **Full Catalogue Mode (`--apply-catalogue --confirm-full-import`)**:
   - Imports the complete validated catalogue in transactional batches of 50.
   - Strictly requires `--confirm-full-import` as an explicit safety gate.
   - Safe and idempotent on re-runs: resolves categories and brands by slug, updates products, and preserves existing live inventory without overwriting stock quantities.
   - Command:
     ```bash
     npx tsx scripts/seed-excel-catalogue.ts --apply-catalogue --confirm-full-import
     ```

### Read-Only Verification SQL Queries
To verify imported categories, brands, products, and inventory in the Supabase SQL Editor:
```sql
-- 1. Count summary across catalogue tables
SELECT
  (SELECT count(*) FROM public.categories) AS total_categories,
  (SELECT count(*) FROM public.brands) AS total_brands,
  (SELECT count(*) FROM public.products) AS total_products,
  (SELECT count(*) FROM public.inventory WHERE variant_id IS NULL) AS total_product_inventory;

-- 2. Sample 10 imported products with price, specs, and inventory
SELECT 
  p.name,
  p.slug,
  b.name AS brand,
  c.name AS category,
  p.base_price,
  p.compare_at_price,
  p.specs->>'discount_amount' AS fixed_discount,
  p.specs->>'size' AS size_spec,
  i.quantity_available AS stock_quantity
FROM public.products p
JOIN public.brands b ON p.brand_id = b.id
JOIN public.categories c ON p.category_id = c.id
LEFT JOIN public.inventory i ON i.product_id = p.id AND i.variant_id IS NULL
ORDER BY p.created_at DESC
LIMIT 10;
```

---

## 12. Phase 9 — End-to-End Testing, Security Hardening & Rollback Safety

### Architecture & Security Invariants
1. **Security Headers & Traceability**:
   - Helmet headers configured across all HTTP responses (Content-Security-Policy, HSTS, X-Content-Type-Options, etc.).
   - Mandatory distributed request tracking via `x-request-id`, preserving client/gateway headers or generating standard UUIDs.
2. **Strict Role-Based Authorization & Object-Level Isolation**:
   - Customer profile self-promotion is blocked; requests attempting to modify `role` or protected metadata return `400 Bad Request`.
   - Object-level ownership strictly enforced across addresses, shopping carts, wishlists, and orders (`403 Forbidden` / `404 Not Found`).
   - Ordinary customers are blocked from administrative endpoints under `/api/v1/admin/*`.
3. **Cash-on-Delivery (COD) Invariant Enforcement**:
   - Checkout exclusively supports `cod` payments.
   - Admin collection is restricted to eligible unpaid orders (`payment_method === 'cod'`, `payment_status === 'pending'`) and rejects duplicates.
4. **Catalogue Rollback Safety**:
   - Rollback script `scripts/rollback-full-import.ts` safeguards baseline seed records (`PRESERVED_PRODUCT_SLUGS`, `PRESERVED_CATEGORY_SLUGS`, `PRESERVED_BRAND_SLUGS`).
   - Aborts immediately if active customer orders or cart items reference candidate products.
5. **Automated Verification**:
   - All 12 test suites passing with 100% success rate:
     - `tests/app.test.ts` (14 tests)
     - `tests/auth.test.ts` (16 tests)
     - `tests/catalogue.test.ts` (13 tests)
     - `tests/images_and_comparison.test.ts` (11 tests)
     - `tests/cart_and_address.test.ts` (17 tests)
     - `tests/checkout.test.ts` (9 tests)
     - `tests/orders.test.ts` (12 tests)
     - `tests/admin.test.ts` (14 tests)
     - `tests/security_and_e2e.test.ts` (10 tests)
     - `tests/rollback.test.ts` (3 tests)
     - `tests/seed_excel.test.ts` (12 tests)
     - `tests/importer.test.ts` (11 tests)
   - Total: **142 of 142 tests passing (100%)**.

