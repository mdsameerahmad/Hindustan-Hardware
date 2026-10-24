-- ==============================================================================
-- Migration: 010_add_coordinates_to_customer_addresses.sql
-- Description: Add latitude, longitude, and geocoding metadata to customer_addresses.
-- ==============================================================================

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS geocoding_provider TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS formatted_address TEXT DEFAULT NULL;

-- Index for spatial and proximity lookup if required
CREATE INDEX IF NOT EXISTS idx_customer_addresses_coords
  ON public.customer_addresses(latitude, longitude)
  WHERE (latitude IS NOT NULL AND longitude IS NOT NULL);
