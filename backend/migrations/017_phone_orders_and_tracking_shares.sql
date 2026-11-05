-- Allow admin-created phone orders to use the existing order lifecycle without
-- creating a synthetic customer account.
BEGIN;

ALTER TABLE public.orders
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.delivery_assignments
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS delivery_otp_ciphertext TEXT;

CREATE TABLE IF NOT EXISTS public.tracking_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_accessed_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_share_links_order_id
  ON public.tracking_share_links(order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_share_links_expires_at
  ON public.tracking_share_links(expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.tracking_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tracking_share_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_share_links TO service_role;

CREATE OR REPLACE FUNCTION public.create_admin_phone_order(
  p_order_number TEXT,
  p_actor_id UUID,
  p_shipping_address JSONB,
  p_customer_notes TEXT,
  p_items JSONB,
  p_idempotency_key TEXT,
  p_delivery_otp_hash TEXT,
  p_delivery_otp_ciphertext TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT;
  v_item JSONB;
  v_product RECORD;
  v_variant RECORD;
  v_inventory RECORD;
  v_variant_name TEXT;
  v_variant_sku TEXT;
  v_raw_price NUMERIC(12, 2);
  v_unit_price NUMERIC(12, 2);
  v_discount_percentage NUMERIC(5, 2);
  v_discount_match TEXT[];
  v_quantity INTEGER;
  v_line_total NUMERIC(12, 2);
  v_subtotal NUMERIC(12, 2) := 0;
  v_order_id UUID;
  v_prepared_items JSONB := '[]'::jsonb;
  v_prepared_item JSONB;
  v_item_count INTEGER := 0;
BEGIN
  SELECT role::TEXT INTO v_actor_role
  FROM public.profiles
  WHERE id = p_actor_id;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'An administrator is required to create a phone order.';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Phone order items must be an array.';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Phone order must contain at least one item.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS entry(value)
    GROUP BY entry.value->>'productId', COALESCE(entry.value->>'variantId', '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'A product and variant may only appear once in a phone order.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key
      AND user_id IS NULL;

    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'is_duplicate', true);
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_count := v_item_count + 1;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity < 1 OR v_quantity > 999 THEN
      RAISE EXCEPTION 'Order item quantity must be between 1 and 999.';
    END IF;

    SELECT p.id, p.name, p.sku, p.base_price, p.is_active, p.specs,
           b.description AS brand_description
    INTO v_product
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    WHERE p.id = (v_item->>'productId')::UUID
    FOR SHARE OF p;

    IF NOT FOUND OR NOT v_product.is_active THEN
      RAISE EXCEPTION 'Product is invalid or no longer active.';
    END IF;

    v_raw_price := v_product.base_price;
    v_variant_name := NULL;
    v_variant_sku := NULL;
    IF NULLIF(v_item->>'variantId', '') IS NOT NULL THEN
      SELECT id, name, sku, price_override, is_active
      INTO v_variant
      FROM public.product_variants
      WHERE id = (v_item->>'variantId')::UUID
        AND product_id = v_product.id
      FOR SHARE;

      IF NOT FOUND OR NOT v_variant.is_active THEN
        RAISE EXCEPTION 'Product variant is invalid or no longer active.';
      END IF;

      IF v_variant.price_override IS NOT NULL THEN
        v_raw_price := v_variant.price_override;
      END IF;
      v_variant_name := v_variant.name;
      v_variant_sku := v_variant.sku;
    END IF;

    v_discount_percentage := NULL;
    IF COALESCE(v_product.specs->>'discount_percentage', v_product.specs->>'discountPercentage')
       ~ '^([0-9]+(\.[0-9]+)?)$' THEN
      v_discount_percentage :=
        COALESCE(v_product.specs->>'discount_percentage', v_product.specs->>'discountPercentage')::NUMERIC;
    ELSE
      v_discount_match := regexp_match(
        COALESCE(v_product.brand_description, ''),
        '\[DISCOUNT:([0-9]+(\.[0-9]+)?)%\]',
        'i'
      );
      IF v_discount_match IS NOT NULL THEN
        v_discount_percentage := v_discount_match[1]::NUMERIC;
      END IF;
    END IF;

    v_discount_percentage := LEAST(GREATEST(COALESCE(v_discount_percentage, 0), 0), 100);
    v_unit_price := ROUND(v_raw_price * (1 - v_discount_percentage / 100), 2);

    IF NULLIF(v_item->>'variantId', '') IS NOT NULL THEN
      SELECT id, quantity_available INTO v_inventory
      FROM public.inventory
      WHERE product_id = v_product.id
        AND variant_id = (v_item->>'variantId')::UUID
      FOR UPDATE;
    ELSE
      SELECT id, quantity_available INTO v_inventory
      FROM public.inventory
      WHERE product_id = v_product.id AND variant_id IS NULL
      FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory record missing for product "%".', v_product.name;
    END IF;

    IF v_inventory.quantity_available < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%". Requested: %, Available: %',
        v_product.name, v_quantity, v_inventory.quantity_available;
    END IF;

    v_line_total := ROUND(v_unit_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_prepared_items := v_prepared_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', NULLIF(v_item->>'variantId', '')::UUID,
      'product_name', v_product.name,
      'sku', COALESCE(v_variant_sku, v_product.sku),
      'variant_title', v_variant_name,
      'unit_price', v_unit_price,
      'quantity', v_quantity,
      'line_subtotal', v_line_total
    ));
  END LOOP;

  INSERT INTO public.orders (
    order_number, user_id, status, payment_method, payment_status, currency,
    subtotal, discount_amount, tax_amount, shipping_amount, total_amount,
    shipping_address_snapshot, customer_notes, idempotency_key,
    delivery_otp_hash, delivery_otp_ciphertext
  ) VALUES (
    p_order_number, NULL, 'pending', 'cod', 'pending', 'INR',
    v_subtotal, 0, 0, 0, v_subtotal,
    p_shipping_address, p_customer_notes, p_idempotency_key,
    p_delivery_otp_hash, p_delivery_otp_ciphertext
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, actor_id, reason
  ) VALUES (
    v_order_id, NULL, 'pending', p_actor_id, 'Phone order created by administrator'
  );

  FOR v_prepared_item IN SELECT value FROM jsonb_array_elements(v_prepared_items)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, sku, variant_title,
      unit_price, quantity, line_subtotal
    ) VALUES (
      v_order_id,
      (v_prepared_item->>'product_id')::UUID,
      NULLIF(v_prepared_item->>'variant_id', '')::UUID,
      v_prepared_item->>'product_name',
      v_prepared_item->>'sku',
      v_prepared_item->>'variant_title',
      (v_prepared_item->>'unit_price')::NUMERIC,
      (v_prepared_item->>'quantity')::INTEGER,
      (v_prepared_item->>'line_subtotal')::NUMERIC
    );

    IF v_prepared_item->>'variant_id' IS NOT NULL
       AND v_prepared_item->>'variant_id' <> 'null' THEN
      UPDATE public.inventory
      SET quantity_available = quantity_available - (v_prepared_item->>'quantity')::INTEGER,
          updated_at = timezone('utc'::text, now())
      WHERE product_id = (v_prepared_item->>'product_id')::UUID
        AND variant_id = (v_prepared_item->>'variant_id')::UUID;
    ELSE
      UPDATE public.inventory
      SET quantity_available = quantity_available - (v_prepared_item->>'quantity')::INTEGER,
          updated_at = timezone('utc'::text, now())
      WHERE product_id = (v_prepared_item->>'product_id')::UUID
        AND variant_id IS NULL;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'is_duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_phone_order(
  TEXT, UUID, JSONB, TEXT, JSONB, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_phone_order(
  TEXT, UUID, JSONB, TEXT, JSONB, TEXT, TEXT, TEXT
) TO service_role;

COMMIT;
