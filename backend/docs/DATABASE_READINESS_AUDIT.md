# Database Readiness & Migration Safety Audit

**Project:** Hindustan Hardware & Sanitary E-Commerce Backend  
**Audit Date:** 2026-10-19  
**Target Host:** `aws-0-ap-northeast-2.pooler.supabase.com:5432`  
**Database Name:** `postgres`  
**Project Ref:** `srkpodqkhumalkevuwqr`  

---

## 1. Executive Summary & Verdict

### **VERDICT: READY FOR APPROVED SAMPLE IMPORT (AFTER MIGRATION RUN)**
The backend code structure, schemas, pricing mathematics, and validation pipelines are completely implemented and verified with **123 automated tests (10 test suites, 0 failures)** and 0 TypeScript compilation errors. 

The live database schema, however, is **not yet initialized** because migrations `001` through `007` (plus the newly prepared remediation `008`) reside locally in `backend/migrations/` and have not been executed on the live Supabase cluster.

---

## 2. Live Database State & Connectivity Findings

| Check | Result / Status | Evidence & Notes |
| :--- | :--- | :--- |
| **TCP Connectivity to Supabase Pooler** | **PASSED** | `Test-NetConnection -ComputerName aws-0-ap-northeast-2.pooler.supabase.com -Port 5432` -> `TcpTestSucceeded: True` |
| **TCP Connectivity to HTTPS API** | **PASSED** | `Test-NetConnection -ComputerName srkpodqkhumalkevuwqr.supabase.co -Port 443` -> `TcpTestSucceeded: True` |
| **Migration Table Status** | **UNAPPLIED** | Tables `categories`, `brands`, `products`, `product_variants`, `inventory`, `orders` are not yet created on the live project. |
| **Existing Catalogue Records** | **NONE** | No existing live catalogue rows will be overwritten or affected upon initial migration. |
| **Safety Guarantees** | **STRICT READ-ONLY** | Zero DDL or DML mutations were executed during this audit. |

---

## 3. Migration Safety & Risk Assessment

### 3.1 Migration Execution Chronology
1. [001_create_profiles_and_roles.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/001_create_profiles_and_roles.sql): Profiles, roles (`user_role`), RLS.
2. [002_create_catalogue_schema.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/002_create_catalogue_schema.sql): Categories, brands, products, product_variants, inventory.
3. [003_create_product_images_schema.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/003_create_product_images_schema.sql): Product image gallery, display order, partial primary index.
4. [004_create_customer_addresses_and_carts.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/004_create_customer_addresses_and_carts.sql): Customer addresses, guest/auth carts, wishlists.
5. [005_create_orders_and_checkout_schema.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/005_create_orders_and_checkout_schema.sql): Orders, order_items, atomic COD checkout RPC function.
6. [006_create_order_cancellation_and_history_schema.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/006_create_order_cancellation_and_history_schema.sql): Order status tracking, order cancellation RPC function.
7. [007_create_admin_inventory_movements_and_audit_logs.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/007_create_admin_inventory_movements_and_audit_logs.sql): Stock adjustments, movements, audit logs.
8. [008_fix_profile_recursion_and_inventory_uniqueness.sql](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/008_fix_profile_recursion_and_inventory_uniqueness.sql): **(New Proposed Forward Migration)** Resolves profile RLS recursion and guarantees inventory partial uniqueness.

### 3.2 Confirmed Schema Concerns & Remediations

#### Concern A: Profile RLS Recursion ([001_create_profiles_and_roles.sql:88-106](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/001_create_profiles_and_roles.sql#L88-L106))
- **Issue:** The policy `Admins can view all profiles` queries `public.profiles` (`EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')`). When evaluating an admin's query on `profiles`, PostgreSQL evaluates this policy again, risking recursive evaluation overhead or query aborts.
- **Remediation in `008`:** Implements `public.is_admin()` as a `SECURITY DEFINER` function with `search_path = public` and replaces the recursive inner queries.

#### Concern B: Inventory Uniqueness When `variant_id IS NULL` ([002_create_catalogue_schema.sql:135](file:///d:/Dowbloads/Hardware%20E-Commerce%20Website%20Prototype/backend/migrations/002_create_catalogue_schema.sql#L135))
- **Issue:** The table constraint `CONSTRAINT uq_inventory_product_variant UNIQUE (product_id, variant_id)` allows multiple rows with the same `product_id` where `variant_id IS NULL` because SQL treats `NULL` values as distinct.
- **Remediation in `008`:** Adds partial unique index:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_product_level
    ON public.inventory(product_id)
    WHERE (variant_id IS NULL);
  ```

---

## 4. Environment & Client Authorization Audit

1. **Client Isolation:**
   - Public Client: `getSupabaseClient()` respects Row Level Security and is used for public catalogue queries.
   - Admin Client: `getSupabaseAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for administrative updates and initial inventory synchronization.
2. **Current Configuration State:**
   - `DATABASE_URL`: Configured in `backend/.env`.
   - `SUPABASE_URL`: Configured in `backend/.env`.
   - `SUPABASE_ANON_KEY`: Empty string (needs operator to paste from Supabase Dashboard).
   - `SUPABASE_SERVICE_ROLE_KEY`: Empty string (needs operator to paste from Supabase Dashboard).
