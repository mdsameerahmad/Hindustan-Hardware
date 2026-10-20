-- ==============================================================================
-- Migration: 003_create_product_images_schema.sql
-- Description: Creates product_images table, constraints, indexes, triggers,
--              and RLS policies for product image management.
-- ==============================================================================

-- 1. Create product_images table
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID DEFAULT NULL REFERENCES public.product_variants(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL UNIQUE,
  alt_text TEXT DEFAULT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique index to enforce that a product has at most ONE primary image
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_primary_image
  ON public.product_images(product_id)
  WHERE (is_primary = true);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_variant_id ON public.product_images(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_images_display_order ON public.product_images(product_id, display_order);

-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS set_product_images_updated_at ON public.product_images;
CREATE TRIGGER set_product_images_updated_at
  BEFORE UPDATE ON public.product_images
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. Enable Row Level Security
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Public read of images for active products
CREATE POLICY "Public read active product images"
  ON public.product_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_images.product_id AND products.is_active = true
    )
  );

-- Admin read all images
CREATE POLICY "Admin read all product images"
  ON public.product_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Admin insert/update/delete images
CREATE POLICY "Admin manage product images"
  ON public.product_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
