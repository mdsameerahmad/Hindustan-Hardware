-- ==============================================================================
-- Migration: 024_add_search_trigram_indexes.sql
-- Description: Enables pg_trgm extension and creates GIN trigram indexes on
--              products (name, sku) to make ILIKE '%...%' searches ultra fast.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN Trigram index on product name
CREATE INDEX IF NOT EXISTS idx_products_name_trgm 
ON public.products USING gin (name gin_trgm_ops);

-- Create GIN Trigram index on product SKU (Item Code)
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm 
ON public.products USING gin (sku gin_trgm_ops);
