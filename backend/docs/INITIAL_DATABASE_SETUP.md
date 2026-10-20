# Final Preflight Check & Supabase Initialization Guide

**Project:** Hindustan Hardware & Sanitary — E-Commerce Backend  
**Document:** `backend/docs/INITIAL_DATABASE_SETUP.md`  
**Target PostgreSQL Host:** `aws-0-ap-northeast-2.pooler.supabase.com:5432`  
**Database Name:** `postgres`  
**Supabase Project Ref:** `srkpodqkhumalkevuwqr`  
**Status:** Preflight Passed — Pending Operator Execution Approval  

---

## 1. Migration 008 Review & Safety Hardening

We conducted a security and concurrency audit of [migrations/008_fix_profile_recursion_and_inventory_uniqueness.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/008_fix_profile_recursion_and_inventory_uniqueness.sql).

### Key Findings & Hardened Implementations:
1. **Search-Path Hijack Prevention:**
   - Both `public.is_admin()` and `public.get_current_user_role()` declare explicit, immutable search paths:
     ```sql
     SET search_path = public, pg_temp;
     ```
2. **Strict Function Permissions:**
   - `REVOKE ALL ON FUNCTION ... FROM PUBLIC;`
   - Explicitly granted only to `authenticated` and `service_role`.
   - Cannot be leveraged by anonymous users or abused for privilege escalation because the function body performs a read-only boolean lookup against the caller's verified `auth.uid()`.
3. **Self-Role Escalation Prevention:**
   - The user self-update policy on `public.profiles` prevents customers from promoting themselves to `admin` or `staff`:
     ```sql
     WITH CHECK (
       auth.uid() = id
       AND role = public.get_current_user_role()
     );
     ```
4. **Duplicate Inventory Guard Before Index Creation:**
   - PostgreSQL fails if a unique index is created on pre-existing duplicate rows. Migration `008` executes an explicit verification block:
     ```sql
     DO $$
     DECLARE
       v_dup_count INTEGER;
     BEGIN
       SELECT count(*) INTO v_dup_count
       FROM (
         SELECT product_id
         FROM public.inventory
         WHERE variant_id IS NULL
         GROUP BY product_id
         HAVING count(*) > 1
       ) dups;

       IF v_dup_count > 0 THEN
         RAISE EXCEPTION 'Cannot create partial unique index: % product(s) have duplicate inventory records where variant_id IS NULL. Manual reconciliation required.', v_dup_count;
       END IF;
     END $$;
     ```

---

## 2. Migration Execution Sequence & Tracking

### Status: Migrations 001–008 are unapplied.
The pooler connection was tested (`aws-0-ap-northeast-2.pooler.supabase.com:5432`), and TCP connectivity succeeded (`TcpTestSucceeded: True`). The tables do not yet exist in the live database.

### Ordered Migration Execution List:
1. `001_create_profiles_and_roles.sql`: Custom enum `user_role`, `profiles` table, triggers, RLS.
2. `002_create_catalogue_schema.sql`: `categories`, `brands`, `products`, `product_variants`, `inventory`, foreign keys, RLS.
3. `003_create_product_images_schema.sql`: `product_images`, primary image partial index, RLS.
4. `004_create_customer_addresses_and_carts.sql`: `customer_addresses`, `carts`, `cart_items`, `wishlists`, RLS.
5. `005_create_orders_and_checkout_schema.sql`: `orders`, `order_items`, atomic COD checkout RPC `process_cod_checkout`.
6. `006_create_order_cancellation_and_history_schema.sql`: Order history, cancellation RPC `cancel_customer_order`.
7. `007_create_admin_inventory_movements_and_audit_logs.sql`: `inventory_movements`, `audit_logs`, stock adjustment RPC `adjust_inventory_stock`.
8. `008_fix_profile_recursion_and_inventory_uniqueness.sql`: Non-recursive profile RLS helper, product-level inventory uniqueness.

### Recommended Execution Options:

#### Option A: Supabase Dashboard SQL Editor (Safest & Recommended)
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard/project/srkpodqkhumalkevuwqr).
2. Open **SQL Editor**.
3. Execute files `001` through `008` in numeric order.

#### Option B: Automated Script or PSQL CLI
When using `psql` or a script connected to `DATABASE_URL`:
```bash
# In backend/ directory:
psql "$DATABASE_URL" -f migrations/001_create_profiles_and_roles.sql
psql "$DATABASE_URL" -f migrations/002_create_catalogue_schema.sql
psql "$DATABASE_URL" -f migrations/003_create_product_images_schema.sql
psql "$DATABASE_URL" -f migrations/004_create_customer_addresses_and_carts.sql
psql "$DATABASE_URL" -f migrations/005_create_orders_and_checkout_schema.sql
psql "$DATABASE_URL" -f migrations/006_create_order_cancellation_and_history_schema.sql
psql "$DATABASE_URL" -f migrations/007_create_admin_inventory_movements_and_audit_logs.sql
psql "$DATABASE_URL" -f migrations/008_fix_profile_recursion_and_inventory_uniqueness.sql
```

---

## 3. Required Environment Configuration

The single environment file is located at `backend/.env`.

| Environment Variable | Required For | Verification Method |
| :--- | :--- | :--- |
| `DATABASE_URL` | Direct PostgreSQL connections & migration scripts | Tested via pooler ping (`5432`) |
| `SUPABASE_URL` | Express Supabase client (`https://srkpodqkhumalkevuwqr.supabase.co`) | Tested via HTTPS gateway ping (`443`) |
| `SUPABASE_ANON_KEY` | Public client queries (Product search, listing, slug) | Obtain from Supabase Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Administrative functions, image storage uploads, audit logging | Obtain from Supabase Project Settings > API |
| `PORT` | Local Express server port (Default: `5000`) | Defaults automatically |
| `NODE_ENV` | Runtime environment (`development` / `production`) | Standard setting |

### Verification Checklist:
- [ ] Confirm `backend/.env` exists and contains `DATABASE_URL` and `SUPABASE_URL`.
- [ ] Paste `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into `backend/.env`.
- [ ] Start backend (`npm run dev`) and query `GET /api/v1/health` to confirm `supabase: "healthy"`.

---

## 4. Read-Only Database Verification Queries

Run these queries after applying migrations to verify the schema without mutating data:

```sql
-- 1. Verify all 12 core tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Expected: audit_logs, brands, cart_items, carts, categories, customer_addresses,
--           inventory, inventory_movements, order_items, order_status_history,
--           orders, product_images, product_variants, products, profiles, wishlists.

-- 2. Verify custom enum
SELECT typname, enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'user_role';
-- Expected: customer, admin, staff.

-- 3. Verify RPC functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('process_cod_checkout', 'cancel_customer_order', 'adjust_inventory_stock', 'is_admin', 'get_current_user_role');

-- 4. Verify product-level inventory uniqueness index
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'inventory' AND indexname = 'uq_inventory_product_level';
-- Expected: CREATE UNIQUE INDEX uq_inventory_product_level ON public.inventory USING btree (product_id) WHERE (variant_id IS NULL)

-- 5. Confirm database catalogue tables are currently empty
SELECT 
  (SELECT count(*) FROM public.categories) AS categories_count,
  (SELECT count(*) FROM public.brands) AS brands_count,
  (SELECT count(*) FROM public.products) AS products_count,
  (SELECT count(*) FROM public.inventory) AS inventory_count;
-- Expected: all 0.
```

---

## 5. Sample Import Dry-Run & Expected Output

### Source Excel Verification
Source Workbook: `d:\Dowbloads\Hindustan_Hardware_DB_Import_Catalog_v2.xlsx`  
Five representative records from Sheet2 were extracted to `backend/scripts/sample_products_from_excel.json`:

1. **Ashirvad 2" CM ISI Pipe** (Row 9)
   - MRP: ₹872.00 | Discount: ₹35.00 | **Selling Price: ₹837.00** | Category: `Pipes & Plumbing Systems` | Stock: 40
2. **Hindware Angle Cock Addons** (Row 817)
   - MRP: ₹625.00 | Discount: ₹10.00 | **Selling Price: ₹615.00** | Category: `Bathroom & Plumbing Fittings` | Stock: 25
3. **Bharat Square Kitchen Sink 18"x16"x8"** (Row 1364)
   - MRP: ₹1,800.00 | Discount: ₹25.00 | **Selling Price: ₹1,775.00** | Category: `Kitchen & Utility` | Stock: 15
4. **Supreme 0.75" CPVC 11 Pipe** (Row 1694)
   - MRP: ₹710.00 | Discount: ₹69.00 | **Selling Price: ₹641.00** | Category: `Pipes & Plumbing Systems` | Stock: 60
5. **Zoloto 0.5" Brass Ball Valve** (Row 1929)
   - MRP: ₹593.00 | Discount: ₹20.00 | **Selling Price: ₹573.00** | Category: `Bathroom & Plumbing Fittings` | Stock: 30

### Dry-Run Execution Command:
```bash
npx tsx scripts/import-catalogue.ts --file=scripts/sample_products_from_excel.json --dry-run
```

### Dry-Run Verified Output:
```json
{
  "mode": "dry-run",
  "totalRowsRead": 5,
  "validRowsCount": 5,
  "invalidRowsCount": 0,
  "distinctCategoriesCount": 3,
  "distinctBrandsCount": 5,
  "slugCollisionsCount": 0,
  "skuCollisionsCount": 0,
  "errors": [],
  "categoriesSummary": [
    "Pipes & Plumbing Systems",
    "Bathroom & Plumbing Fittings",
    "Kitchen & Utility"
  ],
  "brandsSummary": [
    "Ashirvad",
    "Hindware",
    "Bharat",
    "Supreme",
    "Zoloto"
  ]
}
```

### Dedicated Live Sample Import Mode (`--apply-sample`):
The importer implements a dedicated `--apply-sample` mode protected by triple safety gates:
1. **Sample Size Gate:** Rejects files containing more than 10 rows (strictly prevents accidental full catalog execution in sample mode).
2. **Validation Gate:** Automatically runs pure-memory validation first; aborts without database operations if any row is invalid.
3. **Credentials Gate:** Verifies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present and valid before initiating writes.

**Exact Live Sample Command:**
```bash
npx tsx scripts/import-catalogue.ts --file=scripts/sample_products_from_excel.json --apply-sample
```

**Idempotency & Rerun Safety:**
- Resolves categories and brands by slug (`ON CONFLICT (slug) DO NOTHING`).
- Checks product existence by slug (`ON CONFLICT` safe).
- Checks inventory where `variant_id IS NULL` using `uq_inventory_product_level`. If stock exists, it is **preserved and never overwritten or reset to zero**.

---

## 6. Rollback & Recovery Considerations

If migration execution encounters an unexpected error or needs rollback:
1. **Drop Script (Clean Slate):**
   ```sql
   DROP TABLE IF EXISTS public.inventory_movements CASCADE;
   DROP TABLE IF EXISTS public.audit_logs CASCADE;
   DROP TABLE IF EXISTS public.order_status_history CASCADE;
   DROP TABLE IF EXISTS public.order_items CASCADE;
   DROP TABLE IF EXISTS public.orders CASCADE;
   DROP TABLE IF EXISTS public.wishlists CASCADE;
   DROP TABLE IF EXISTS public.cart_items CASCADE;
   DROP TABLE IF EXISTS public.carts CASCADE;
   DROP TABLE IF EXISTS public.customer_addresses CASCADE;
   DROP TABLE IF EXISTS public.product_images CASCADE;
   DROP TABLE IF EXISTS public.inventory CASCADE;
   DROP TABLE IF EXISTS public.product_variants CASCADE;
   DROP TABLE IF EXISTS public.products CASCADE;
   DROP TABLE IF EXISTS public.brands CASCADE;
   DROP TABLE IF EXISTS public.categories CASCADE;
   DROP TABLE IF EXISTS public.profiles CASCADE;
   DROP TYPE IF EXISTS public.user_role CASCADE;
   ```
2. **Transactional Safety:**
   Because the target database currently contains no live business records, dropping or reapplying migrations will not risk loss of customer orders or existing store inventory.

---

---

## 8. Excel-to-Supabase Full Catalogue Seeder

The production Excel seeder is implemented in `backend/scripts/seed-excel-catalogue.ts` and parses `Hindustan_Hardware_DB_Import_Catalog_v2.xlsx`.

### Commands:
```bash
# 1. Inspect workbook structure, categories, brands, price anomalies (No DB writes)
npx tsx scripts/seed-excel-catalogue.ts --inspect

# 2. Dry-run validation of the complete workbook (No DB writes)
npx tsx scripts/seed-excel-catalogue.ts --dry-run

# 3. Apply approved 5-product sample (Live write gated by credential check)
npx tsx scripts/seed-excel-catalogue.ts --apply-sample

# 4. Apply complete catalogue (Gated by explicit flag)
npx tsx scripts/seed-excel-catalogue.ts --apply-catalogue --confirm-full-import
```

### Verification SQL Query (Read-Only):
```sql
-- Catalogue Overview Counts
SELECT
  (SELECT count(*) FROM public.categories) AS total_categories,
  (SELECT count(*) FROM public.brands) AS total_brands,
  (SELECT count(*) FROM public.products) AS total_products,
  (SELECT count(*) FROM public.inventory WHERE variant_id IS NULL) AS total_product_inventory;
```
