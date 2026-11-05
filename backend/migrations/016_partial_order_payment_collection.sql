-- Track cumulative order payments and preserve each collection method.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_collected NUMERIC(12, 2) NOT NULL DEFAULT 0
  CHECK (amount_collected >= 0 AND amount_collected <= total_amount);

-- Existing orders marked paid were collected in full before partial collection was supported.
UPDATE public.orders
SET amount_collected = total_amount
WHERE payment_status = 'paid'
  AND amount_collected = 0;

CREATE TABLE IF NOT EXISTS public.order_payment_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'online')),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_payment_collections_order_id
  ON public.order_payment_collections (order_id, created_at DESC);

ALTER TABLE public.order_payment_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view order payment collections"
  ON public.order_payment_collections;
CREATE POLICY "Admins can view order payment collections"
  ON public.order_payment_collections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.record_order_payment_collection(
  p_order_id UUID,
  p_amount NUMERIC,
  p_method TEXT,
  p_actor_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_collected NUMERIC(12, 2);
  v_due NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.status = 'cancelled' OR v_order.payment_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_CANCELLED');
  END IF;

  IF v_order.payment_method <> 'cod' THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNSUPPORTED_PAYMENT_METHOD');
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('cash', 'online') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_COLLECTION_METHOD');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_AMOUNT');
  END IF;

  v_collected := COALESCE(v_order.amount_collected, 0);
  v_due := GREATEST(v_order.total_amount - v_collected, 0);

  IF v_due = 0 OR v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_COMPLETE');
  END IF;

  IF p_amount > v_due THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AMOUNT_EXCEEDS_DUE',
      'amountDue', v_due
    );
  END IF;

  v_collected := v_collected + p_amount;
  v_due := GREATEST(v_order.total_amount - v_collected, 0);

  INSERT INTO public.order_payment_collections (
    order_id, amount, method, actor_id, notes
  ) VALUES (
    p_order_id, p_amount, p_method, p_actor_id, NULLIF(trim(p_notes), '')
  );

  UPDATE public.orders
  SET amount_collected = v_collected,
      payment_status = CASE WHEN v_due = 0 THEN 'paid' ELSE 'pending' END,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'amountCollected', v_collected,
    'amountDue', v_due,
    'paymentStatus', CASE WHEN v_due = 0 THEN 'paid' ELSE 'pending' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_payment_collection(UUID, NUMERIC, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_payment_collection(UUID, NUMERIC, TEXT, UUID, TEXT)
  TO service_role;
