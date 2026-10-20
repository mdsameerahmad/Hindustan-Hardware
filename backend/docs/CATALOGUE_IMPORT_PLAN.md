# Catalogue Import & Normalization Plan

**Project:** Hindustan Hardware & Sanitary E-Commerce  
**Document:** `CATALOGUE_IMPORT_PLAN.md`  
**Status:** Validated in Dry-Run & Unit Tested (123 Passing Tests)  

---

## 1. Source-to-Database Mapping Specification

The Hindustan Hardware Excel workbook contains product records across multiple sanitary and plumbing manufacturers (Astral, Supreme, Jaquar, Ashirvad, Zoloto, etc.).

### Authoritative Pricing Model:
- **Sale Price (Excel)** $\rightarrow$ **MRP** $\rightarrow$ `products.compare_at_price`
- **Sale Discount (Excel)** $\rightarrow$ **Fixed Rupee Discount (₹)** $\rightarrow$ `products.specs.discount_amount`
- **Net Selling Price** $\rightarrow$ **MRP − Sale Discount** $\rightarrow$ `products.base_price`

| Excel Field | Target Table & Column | Normalization / Transformation | Required? | Validation Rules |
| :--- | :--- | :--- | :--- | :--- |
| **Category** | `categories.name`, `categories.slug` | Resolve to existing UUID or insert new category with kebab-case slug. | Yes | Non-empty string. |
| **Brand** | `brands.name`, `brands.slug` | Resolve to existing UUID or insert new brand with kebab-case slug. | Optional | If present, must be non-empty. |
| **Product Name** | `products.name` | Trim whitespace. | Yes | 1–200 characters. |
| **Product Code / SKU** | `products.sku` | Trim whitespace, uppercase. | Optional | Unique across all products if present. |
| **Slug** | `products.slug` | Auto-generated: `${brand}-${name}` (with SKU suffix if collision detected). | Yes | Format: `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Unique. |
| **Sale Price** (MRP) | `products.compare_at_price` | Coerce to float numeric. | Yes | Must be $\ge 0$. |
| **Sale Discount** (Fixed INR) | `products.specs.discount_amount` | Coerce to float numeric. | No | Must be $\ge 0$ and $\le \text{Sale Price}$. |
| **Net Price** | `products.base_price` | $\text{Sale Price} - \text{Sale Discount}$. | Yes | Must be $\ge 0$. |
| **Unit / UOM** | `products.unit`, `products.unit_of_sale` | Normalize to lowercase (e.g., 'piece', 'meter', 'set'). | Yes | Default: `'piece'`. |
| **Material** | `products.material` | Extract material ('CPVC', 'Brass', 'UPVC', 'SS'). | No | Max 100 characters. |
| **Diameter / Size** | `products.diameter` | Extract size ('1/2 inch', '25mm', '1 inch'). | No | Max 50 characters. |
| **Length** | `products.length` | Extract pipe/fitting length. | No | Max 50 characters. |
| **Pressure Rating** | `products.pressure_rating` | SDR / Class rating ('SDR 11', 'PN 16', 'Class 3'). | No | Max 50 characters. |
| **Technical Standard** | `products.technical_standard` | Compliance code ('IS 15778', 'ASTM D2846'). | No | Max 100 characters. |
| **Intended Application** | `products.intended_application` | Description of plumbing application. | No | Free text. |
| **Comparison Group** | `products.comparison_group_id` | Set ONLY for verified interchangeable equivalents. | No | Nullable string identifier. |
| **Stock Quantity** | `inventory.quantity_available` | Coerce integer; default 0 if blank/missing. | Yes | Non-negative integer. |
| **Extra Attributes** | `products.specs` | Any unmapped columns packaged as valid JSONB. | Yes | Valid key-value JSON. |

---

## 2. Idempotency & Conflict Strategy

1. **Category & Brand Resolution:**
   - Lookup existing records by `slug` before inserting.
   - If missing, insert with deterministic slug: `ON CONFLICT (slug) DO NOTHING`.
2. **Product Insertion:**
   - Products are matched primarily by `sku` (when present) or `slug`.
   - On rerun, the importer does NOT overwrite existing stock or reset modified pricing without an explicit update flag.
3. **Inventory Initialization:**
   - Guarantees exactly one product-level inventory record per product using the partial unique index from Migration `008`.
   - Avoids resetting existing non-zero stock values to zero if an incoming row omits stock.

---

## 3. Proposed Small-Sample Import (Controlled Stage 5)

Prior to running the complete multi-thousand row catalogue import, an operator should approve this 5-item representative sample:

| Item # | Product Name | Category | Brand | SKU | MRP (₹) | Disc (₹) | Selling Price (₹) | Stock | Attributes / Specs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Astral CPVC Pro Pipe Class 1 | Pipes & Fittings | Astral | AST-CPVC-001 | 1800.00 | 25.00 | 1775.00 | 50 | SDR 11, 1 inch, 3m |
| **2** | Supreme UPVC Pressure Pipe | Pipes & Fittings | Supreme | SUP-UPVC-002 | 1200.00 | 50.00 | 1150.00 | 30 | Class 3, 2 inch, 6m |
| **3** | Zoloto Brass Ball Valve (Screwed) | Valves | Zoloto | ZOL-BV-003 | 650.00 | 15.00 | 635.00 | 20 | Brass, 1/2 inch, PN 16 |
| **4** | Jaquar Alive Basin Mixer | Sanitaryware | Jaquar | JAQ-ALV-004 | 3850.00 | 150.00 | 3700.00 | 10 | Chrome Plated, 10-yr warranty |
| **5** | Teflon Thread Seal Tape 12mm | Consumables | *(None)* | *(None)* | 35.00 | 0.00 | 35.00 | 0 | Blank SKU & Brand test |

### Post-Import Verification Queries for Sample:
```sql
-- 1. Verify 5 distinct products inserted
SELECT id, name, slug, sku, base_price, compare_at_price, specs->>'discount_amount' AS discount
FROM public.products
WHERE slug IN (
  'astral-astral-cpvc-pro-pipe-class-1',
  'supreme-supreme-upvc-pressure-pipe',
  'zoloto-zoloto-brass-ball-valve-screwed',
  'jaquar-jaquar-alive-basin-mixer',
  'teflon-thread-seal-tape-12mm'
);

-- 2. Verify exactly 5 corresponding inventory records exist with variant_id IS NULL
SELECT p.name, i.quantity_available, i.quantity_reserved
FROM public.inventory i
JOIN public.products p ON p.id = i.product_id
WHERE i.variant_id IS NULL;

-- 3. Verify public API listing response
-- GET http://localhost:5000/api/v1/products?limit=5
```
