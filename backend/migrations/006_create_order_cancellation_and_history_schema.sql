-- ==============================================================================
-- Migration: 006_create_order_cancellation_and_history_schema.sql
-- Description: Indexes, cancellation inventory release function, and order tracking
-- ==============================================================================

-- 1. Performance index for customer order history queries
CREATE INDEX IF NOT EXISTS idx_orders_user_id_created_at
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_id_status
  ON public.orders (user_id, status);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_created
  ON public.order_status_history (order_id, created_at ASC);

-- 2. Concurrency-safe, atomic order cancellation & inventory release function
-- Cancels order only if currently in permitted status ('pending' or 'confirmed').
-- Restores inventory quantities exactly once in a single database transaction.
CREATE OR REPLACE FUNCTION public.cancel_customer_order(
  p_order_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Cancelled by customer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_current_status TEXT;
BEGIN
  -- 1. Lock and fetch the order row
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ORDER_NOT_FOUND',
      'message', 'Order not found or does not belong to the authenticated customer.'
    );
  END IF;

  v_current_status := v_order.status;

  -- 2. Check if order is already cancelled (idempotent guard)
  IF v_current_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'order_id', p_order_id,
      'status', 'cancelled',
      'message', 'Order is already cancelled.'
    );
  END IF;

  -- 3. Check if status allows customer cancellation
  -- Only 'pending' or 'confirmed' orders may be cancelled by the customer.
  IF v_current_status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CANCELLATION_NOT_ALLOWED',
      'message', format('Order cannot be cancelled in "%s" status. Orders in processing, shipped, or delivered states cannot be cancelled.', v_current_status)
    );
  END IF;

  -- 4. Update order status to 'cancelled'
  -- For COD, payment_status becomes 'cancelled' if pending
  UPDATE public.orders
  SET
    status = 'cancelled',
    payment_status = CASE WHEN payment_status = 'pending' THEN 'cancelled' ELSE payment_status END,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_order_id;

  -- 5. Record transition in order_status_history
  INSERT INTO public.order_status_history (
    order_id,
    previous_status,
    new_status,
    actor_id,
    reason,
    created_at
  ) VALUES (
    p_order_id,
    v_current_status,
    'cancelled',
    p_user_id,
    COALESCE(p_reason, 'Cancelled by customer'),
    timezone('utc'::text, now())
  );

  -- 6. Atomically restore inventory for each order item
  FOR v_item IN
    SELECT product_id, variant_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.inventory
        SET
          quantity_available = quantity_available + v_item.quantity,
          updated_at = timezone('utc'::text, now())
        WHERE product_id = v_item.product_id AND variant_id = v_item.variant_id;
      ELSE
        UPDATE public.inventory
        SET
          quantity_available = quantity_available + v_item.quantity,
          updated_at = timezone('utc'::text, now())
        WHERE product_id = v_item.product_id AND variant_id IS NULL;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'already_cancelled', false,
    'order_id', p_order_id,
    'previous_status', v_current_status,
    'status', 'cancelled',
    'message', 'Order has been successfully cancelled and stock restored.'
  );
END;
$$;
