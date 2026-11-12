BEGIN;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_amount_collected_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_amount_collected_nonnegative_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_amount_collected_nonnegative_check
      CHECK (amount_collected >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_payment_status_with_delivery_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_total NUMERIC(12, 2);
  v_collected NUMERIC(12, 2);
  v_status TEXT;
  v_delivery_fee NUMERIC(12, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT total_amount, amount_collected, payment_status
  INTO v_total, v_collected, v_status
  FROM public.orders
  WHERE id = v_order_id;

  IF NOT FOUND OR v_status = 'cancelled' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(delivery_fee, 0)
  INTO v_delivery_fee
  FROM public.delivery_assignments
  WHERE order_id = v_order_id
    AND status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed')
  ORDER BY assigned_at DESC
  LIMIT 1;

  v_delivery_fee := COALESCE(v_delivery_fee, 0);

  IF v_status IN ('paid', 'pending') THEN
    UPDATE public.orders
    SET payment_status = CASE
          WHEN COALESCE(v_collected, 0) >= v_total + v_delivery_fee THEN 'paid'
          ELSE 'pending'
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_order_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_payment_status_after_delivery_fee_change
  ON public.delivery_assignments;
CREATE TRIGGER sync_order_payment_status_after_delivery_fee_change
AFTER INSERT OR UPDATE OR DELETE
ON public.delivery_assignments
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_status_with_delivery_fee();

REVOKE ALL ON FUNCTION public.sync_order_payment_status_with_delivery_fee()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_payment_status_with_delivery_fee()
  TO service_role;

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
  v_delivery_fee NUMERIC(12, 2);
  v_total_payable NUMERIC(12, 2);
  v_payment_status TEXT;
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

  SELECT COALESCE(delivery_fee, 0)
  INTO v_delivery_fee
  FROM public.delivery_assignments
  WHERE order_id = p_order_id
    AND status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed')
  ORDER BY assigned_at DESC
  LIMIT 1;

  v_delivery_fee := COALESCE(v_delivery_fee, 0);
  v_total_payable := v_order.total_amount + v_delivery_fee;
  v_collected := COALESCE(
    v_order.amount_collected,
    CASE WHEN v_order.payment_status = 'paid' THEN v_order.total_amount ELSE 0 END
  );
  v_due := GREATEST(v_total_payable - v_collected, 0);

  IF v_due = 0 THEN
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
  v_due := GREATEST(v_total_payable - v_collected, 0);
  v_payment_status := CASE WHEN v_due = 0 THEN 'paid' ELSE 'pending' END;

  INSERT INTO public.order_payment_collections (
    order_id, amount, method, actor_id, notes
  ) VALUES (
    p_order_id, p_amount, p_method, p_actor_id, NULLIF(trim(p_notes), '')
  );

  UPDATE public.orders
  SET amount_collected = v_collected,
      payment_status = v_payment_status,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'amountCollected', v_collected,
    'amountDue', v_due,
    'paymentStatus', v_payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_payment_collection(UUID, NUMERIC, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_payment_collection(UUID, NUMERIC, TEXT, UUID, TEXT)
  TO service_role;

UPDATE public.orders AS o
SET payment_status = CASE
      WHEN COALESCE(o.amount_collected, 0) >= o.total_amount + COALESCE(a.delivery_fee, 0) THEN 'paid'
      ELSE 'pending'
    END,
    updated_at = timezone('utc'::text, now())
FROM (
  SELECT DISTINCT ON (order_id) order_id, delivery_fee
  FROM public.delivery_assignments
  WHERE status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed')
  ORDER BY order_id, assigned_at DESC
) AS a
WHERE o.id = a.order_id
  AND o.payment_status IN ('paid', 'pending');

NOTIFY pgrst, 'reload schema';

COMMIT;
