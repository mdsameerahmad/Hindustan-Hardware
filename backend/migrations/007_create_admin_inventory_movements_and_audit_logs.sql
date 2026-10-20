-- ==============================================================================
-- Migration: 007_create_admin_inventory_movements_and_audit_logs.sql
-- Description: Inventory movements, administrative audit logs, and COD collection
-- ==============================================================================

-- 1. INVENTORY MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID DEFAULT NULL REFERENCES public.product_variants(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('adjustment', 'restock', 'correction', 'order_deduction', 'order_cancellation', 'return')),
  quantity_change INTEGER NOT NULL,
  quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  reason TEXT NOT NULL,
  actor_id UUID DEFAULT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reference_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_actor_id ON public.inventory_movements(actor_id);

-- 2. ADMINISTRATIVE AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 3. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only administrators can read inventory movements
DROP POLICY IF EXISTS "Admins can view inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins can view inventory movements"
  ON public.inventory_movements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only administrators can insert inventory movements
DROP POLICY IF EXISTS "Admins can insert inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins can insert inventory movements"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only administrators can view audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only administrators or server-side service role can insert audit logs
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 4. CONCURRENCY-SAFE INVENTORY ADJUSTMENT FUNCTION
CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_product_id UUID,
  p_variant_id UUID,
  p_quantity_change INTEGER,
  p_movement_type TEXT,
  p_reason TEXT,
  p_actor_id UUID,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv RECORD;
  v_new_quantity INTEGER;
  v_movement_id UUID;
BEGIN
  -- 1. Lock inventory row
  IF p_variant_id IS NOT NULL THEN
    SELECT * INTO v_inv
    FROM public.inventory
    WHERE product_id = p_product_id AND variant_id = p_variant_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_inv
    FROM public.inventory
    WHERE product_id = p_product_id AND variant_id IS NULL
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVENTORY_NOT_FOUND',
      'message', 'Inventory record not found for product and variant.'
    );
  END IF;

  v_new_quantity := v_inv.quantity_available + p_quantity_change;

  IF v_new_quantity < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_STOCK',
      'message', format('Adjustment would result in negative stock. Current: %s, change: %s', v_inv.quantity_available, p_quantity_change)
    );
  END IF;

  -- 2. Update stock
  UPDATE public.inventory
  SET
    quantity_available = v_new_quantity,
    updated_at = timezone('utc'::text, now())
  WHERE id = v_inv.id;

  -- 3. Record movement
  INSERT INTO public.inventory_movements (
    product_id,
    variant_id,
    movement_type,
    quantity_change,
    quantity_before,
    quantity_after,
    reason,
    actor_id,
    reference_id,
    created_at
  ) VALUES (
    p_product_id,
    p_variant_id,
    p_movement_type,
    p_quantity_change,
    v_inv.quantity_available,
    v_new_quantity,
    p_reason,
    p_actor_id,
    p_reference_id,
    timezone('utc'::text, now())
  ) RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'success', true,
    'inventory_id', v_inv.id,
    'movement_id', v_movement_id,
    'quantity_before', v_inv.quantity_available,
    'quantity_after', v_new_quantity,
    'quantity_change', p_quantity_change
  );
END;
$$;
