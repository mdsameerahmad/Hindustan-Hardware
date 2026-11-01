-- ==============================================================================
-- Migration: 014_create_catalogue_import_mappings.sql
-- Description: Audit, ownership tracking, and idempotency mapping for Excel/CSV catalogue imports
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.catalogue_import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  source_row_number INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  product_id UUID DEFAULT NULL REFERENCES public.products(id) ON DELETE SET NULL,
  product_sku TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  source_product_name TEXT NOT NULL,
  source_brand_name TEXT DEFAULT NULL,
  source_category_name TEXT NOT NULL,
  source_mrp NUMERIC(12, 2) NOT NULL,
  source_selling_price NUMERIC(12, 2) NOT NULL,
  source_stock_raw NUMERIC(12, 3) NOT NULL,
  imported_stock_qty INTEGER NOT NULL,
  negative_stock_converted BOOLEAN NOT NULL DEFAULT false,
  fractional_stock_converted BOOLEAN NOT NULL DEFAULT false,

  -- Explicit Batch Ownership Tracking
  product_created_by_this_batch BOOLEAN NOT NULL DEFAULT false,
  opening_movement_created_by_this_batch BOOLEAN NOT NULL DEFAULT false,
  opening_movement_reference TEXT DEFAULT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_import_batch_fingerprint UNIQUE (batch_id, source_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_import_mappings_product_id ON public.catalogue_import_mappings(product_id);
CREATE INDEX IF NOT EXISTS idx_import_mappings_fingerprint ON public.catalogue_import_mappings(source_fingerprint);
CREATE INDEX IF NOT EXISTS idx_import_mappings_sku ON public.catalogue_import_mappings(product_sku);
CREATE INDEX IF NOT EXISTS idx_import_mappings_batch_id ON public.catalogue_import_mappings(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_mappings_opening_ref ON public.catalogue_import_mappings(opening_movement_reference);

-- Enforce opening-stock movement idempotency across batches and reruns
-- Strictly applies ONLY to opening import restock movements starting with 'OPENING-STOCK-'
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_movements_opening_identity
  ON public.inventory_movements (reference_id)
  WHERE (reference_id IS NOT NULL AND reference_id LIKE 'OPENING-STOCK-%');

-- RLS: Only admins can manage import mappings
ALTER TABLE public.catalogue_import_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage import mappings" ON public.catalogue_import_mappings;
CREATE POLICY "Admins can manage import mappings"
  ON public.catalogue_import_mappings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
