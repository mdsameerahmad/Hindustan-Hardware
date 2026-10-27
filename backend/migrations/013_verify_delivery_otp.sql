-- Migration 013: Require the customer's OTP to atomically complete delivery.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_otp_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  ADD COLUMN IF NOT EXISTS delivery_otp_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_otp_verified_at TIMESTAMPTZ;

UPDATE public.orders
SET delivery_otp_expires_at = COALESCE(delivery_otp_expires_at, created_at + INTERVAL '7 days')
WHERE delivery_otp_hash IS NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_otp_attempts_nonnegative;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_otp_attempts_nonnegative CHECK (delivery_otp_attempts >= 0);

CREATE OR REPLACE FUNCTION public.verify_delivery_otp(
  p_assignment_id UUID,
  p_actor_id UUID,
  p_otp_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment RECORD;
  v_order RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_attempts INTEGER;
  v_max_attempts CONSTANT INTEGER := 5;
BEGIN
  SELECT * INTO v_assignment
  FROM public.delivery_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_assignment.delivery_partner_id <> p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_ASSIGNED');
  END IF;

  IF v_assignment.status = 'delivered' THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyVerified', true,
      'assignmentId', v_assignment.id,
      'orderId', v_assignment.order_id,
      'deliveryPartnerId', v_assignment.delivery_partner_id,
      'customerId', v_assignment.customer_id,
      'status', v_assignment.status,
      'notes', v_assignment.notes,
      'assignedAt', v_assignment.assigned_at,
      'pickedUpAt', v_assignment.picked_up_at,
      'completedAt', v_assignment.completed_at,
      'createdAt', v_assignment.created_at,
      'updatedAt', v_assignment.updated_at
    );
  END IF;

  IF v_assignment.status <> 'out_for_delivery' THEN
    RETURN jsonb_build_object('success', false, 'code', 'DELIVERY_NOT_OUT_FOR_DELIVERY');
  END IF;

  SELECT id, status, delivery_otp_hash, delivery_otp_expires_at,
         delivery_otp_attempts, delivery_otp_verified_at
  INTO v_order
  FROM public.orders
  WHERE id = v_assignment.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.delivery_otp_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'OTP_UNAVAILABLE');
  END IF;

  IF v_order.delivery_otp_verified_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'OTP_LOCKED');
  END IF;

  IF COALESCE(v_order.delivery_otp_attempts, 0) >= v_max_attempts THEN
    RETURN jsonb_build_object('success', false, 'code', 'OTP_LOCKED');
  END IF;

  IF v_order.delivery_otp_expires_at <= v_now THEN
    RETURN jsonb_build_object('success', false, 'code', 'OTP_EXPIRED');
  END IF;

  IF v_order.delivery_otp_hash <> p_otp_hash THEN
    v_attempts := COALESCE(v_order.delivery_otp_attempts, 0) + 1;
    UPDATE public.orders
    SET delivery_otp_attempts = v_attempts,
        updated_at = v_now
    WHERE id = v_order.id;

    IF v_attempts >= v_max_attempts THEN
      RETURN jsonb_build_object('success', false, 'code', 'OTP_LOCKED');
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'OTP_INVALID',
      'attemptsRemaining', v_max_attempts - v_attempts
    );
  END IF;

  UPDATE public.orders
  SET status = 'delivered',
      delivery_otp_verified_at = v_now,
      delivery_otp_ciphertext = NULL,
      updated_at = v_now
  WHERE id = v_order.id;

  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, actor_id, reason, created_at
  ) VALUES (
    v_order.id, v_order.status, 'delivered', p_actor_id,
    'Delivery completed after successful customer OTP verification', v_now
  );

  UPDATE public.delivery_assignments
  SET status = 'delivered',
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now
  WHERE id = v_assignment.id
  RETURNING * INTO v_assignment;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyVerified', false,
    'assignmentId', v_assignment.id,
    'orderId', v_assignment.order_id,
    'deliveryPartnerId', v_assignment.delivery_partner_id,
    'customerId', v_assignment.customer_id,
    'status', v_assignment.status,
    'notes', v_assignment.notes,
    'assignedAt', v_assignment.assigned_at,
    'pickedUpAt', v_assignment.picked_up_at,
    'completedAt', v_assignment.completed_at,
    'createdAt', v_assignment.created_at,
    'updatedAt', v_assignment.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_delivery_otp(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_delivery_otp(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
