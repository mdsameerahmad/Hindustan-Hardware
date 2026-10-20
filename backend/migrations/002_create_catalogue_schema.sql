-- ==============================================================================
-- Migration: 002_create_catalogue_schema.sql
-- Description: Creates categories, brands, products, product_variants, 
--              inventory tables, constraints, indexes, triggers, and RLS policies.
-- ==============================================================================

-- 1. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  parent_id UUID DEFAULT NULL REFERENCES public.categories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_categories_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON public.categories(sort_order);

-- Category updated_at trigger
DROP TRIGGER IF EXISTS set_categories_updated_at ON public.categories;
CREATE TRIGGER set_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. BRANDS TABLE
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  logo_url TEXT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_brands_slug ON public.brands(slug);
CREATE INDEX IF NOT EXISTS idx_brands_is_active ON public.brands(is_active);
CREATE INDEX IF NOT EXISTS idx_brands_display_order ON public.brands(display_order);

-- Brand updated_at trigger
DROP TRIGGER IF EXISTS set_brands_updated_at ON public.brands;
CREATE TRIGGER set_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 3. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sku TEXT DEFAULT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  brand_id UUID DEFAULT NULL REFERENCES public.brands(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  product_type TEXT DEFAULT NULL,
  base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
  compare_at_price NUMERIC(12, 2) DEFAULT NULL CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_of_sale TEXT NOT NULL DEFAULT 'piece',
  material TEXT DEFAULT NULL,
  diameter TEXT DEFAULT NULL,
  length TEXT DEFAULT NULL,
  pressure_rating TEXT DEFAULT NULL,
  technical_standard TEXT DEFAULT NULL,
  intended_application TEXT DEFAULT NULL,
  comparison_group_id TEXT DEFAULT NULL,
  image_url TEXT DEFAULT NULL,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_base_price ON public.products(base_price);
CREATE INDEX IF NOT EXISTS idx_products_comparison_group ON public.products(comparison_group_id);

-- Product updated_at trigger
DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. PRODUCT VARIANTS TABLE
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT DEFAULT NULL UNIQUE,
  name TEXT NOT NULL,
  price_override NUMERIC(12, 2) DEFAULT NULL CHECK (price_override IS NULL OR price_override >= 0),
  variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON public.product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_is_active ON public.product_variants(is_active);

-- Variant updated_at trigger
DROP TRIGGER IF EXISTS set_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID DEFAULT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_inventory_product_variant UNIQUE (product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON public.inventory(variant_id);

-- Inventory updated_at trigger
DROP TRIGGER IF EXISTS set_inventory_updated_at ON public.inventory;
CREATE TRIGGER set_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES FOR CATEGORIES
-- Public read of active categories
CREATE POLICY "Public read active categories"
  ON public.categories FOR SELECT
  USING (is_active = true);

-- Admin read all categories
CREATE POLICY "Admin read all categories"
  ON public.categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Admin insert/update/delete categories
CREATE POLICY "Admin manage categories"
  ON public.categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 8. RLS POLICIES FOR BRANDS
-- Public read of active brands
CREATE POLICY "Public read active brands"
  ON public.brands FOR SELECT
  USING (is_active = true);

-- Admin read all brands
CREATE POLICY "Admin read all brands"
  ON public.brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Admin insert/update/delete brands
CREATE POLICY "Admin manage brands"
  ON public.brands FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 9. RLS POLICIES FOR PRODUCTS
-- Public read of active products
CREATE POLICY "Public read active products"
  ON public.products FOR SELECT
  USING (is_active = true);

-- Admin read all products
CREATE POLICY "Admin read all products"
  ON public.products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Admin insert/update/delete products
CREATE POLICY "Admin manage products"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 10. RLS POLICIES FOR PRODUCT VARIANTS
CREATE POLICY "Public read active variants"
  ON public.product_variants FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_variants.product_id AND products.is_active = true
    )
  );

CREATE POLICY "Admin manage variants"
  ON public.product_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 11. RLS POLICIES FOR INVENTORY
-- Public can read inventory of active products
CREATE POLICY "Public read inventory for active products"
  ON public.inventory FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = inventory.product_id AND products.is_active = true
    )
  );

-- Admin can manage inventory
CREATE POLICY "Admin manage inventory"
  ON public.inventory FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
