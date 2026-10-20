-- ==============================================================================
-- Migration: 008_fix_profile_recursion_and_inventory_uniqueness.sql
-- Description: Forward-only remediation for:
--   1. RLS recursion on public.profiles via SECURITY DEFINER helper function.
--   2. Enforcing uniqueness on product-level inventory where variant_id IS NULL.
-- ==============================================================================

-- 1. SECURITY DEFINER HELPER TO PREVENT PROFILE RLS RECURSION
-- Uses fixed search_path = public, pg_temp to prevent search_path hijacking.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Revoke execute from public; grant execution only to authenticated and service_role
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- Replace recursive policies on public.profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Users can update own profile fields (full_name, phone, avatar_url)
-- Prevents role escalation by using SECURITY DEFINER role lookup function
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO service_role;

DROP POLICY IF EXISTS "Users can update own profile fields" ON public.profiles;
CREATE POLICY "Users can update own profile fields"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_current_user_role()
  );

-- 2. PARTIAL UNIQUE INDEX FOR PRODUCT-LEVEL INVENTORY
-- Before creating index, abort safely if duplicates already exist
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_product_level
  ON public.inventory(product_id)
  WHERE (variant_id IS NULL);

