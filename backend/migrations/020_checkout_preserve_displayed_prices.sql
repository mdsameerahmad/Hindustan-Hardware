-- Migration 020: Persist the same effective unit price shown in the cart.
BEGIN;

CREATE OR REPLACE FUNCTION public.process_cod_checkout(
  p_user_id UUID,
  p_order_number TEXT,
  p_shipping_address JSONB,
  p_customer_notes TEXT,
  p_idempotency_key TEXT,
  p_cart_id UUID,
  p_delivery_otp_hash TEXT,
  p_delivery_otp_ciphertext TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cart_record RECORD;
  v_cart_item RECORD;
  v_product RECORD;
  v_variant RECORD;
  v_inventory RECORD;
  v_effective_price NUMERIC(12, 2);
  v_raw_price NUMERIC(12, 2);
  v_discount_basis_price NUMERIC(12, 2);
  v_discount_percentage NUMERIC(5, 2);
  v_discount_match TEXT[];
  v_variant_name TEXT;
  v_variant_sku TEXT;
  v_line_total NUMERIC(12, 2);
  v_subtotal NUMERIC(12, 2) := 0.00;
  v_total_amount NUMERIC(12, 2) := 0.00;
  v_order_id UUID;
  v_existing_order_id UUID;
  v_item_count INTEGER := 0;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key AND user_id = p_user_id;

    IF v_existing_order_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order_id,
        'is_duplicate', true
      );
    END IF;
  END IF;

  SELECT id, user_id, status INTO v_cart_record
  FROM public.carts
  WHERE id = p_cart_id AND user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active customer cart not found.';
  END IF;

  FOR v_cart_item IN
    SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = p_cart_id
  LOOP
    v_item_count := v_item_count + 1;

    SELECT p.id, p.name, p.sku, p.base_price, p.compare_at_price, p.is_active, p.specs,
           b.description AS brand_description
    INTO v_product
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    WHERE p.id = v_cart_item.product_id;

    IF NOT FOUND OR NOT v_product.is_active THEN
      RAISE EXCEPTION 'Product % is invalid or no longer active.', v_cart_item.product_id;
    END IF;

    v_raw_price := v_product.base_price;
    IF v_cart_item.variant_id IS NOT NULL THEN
      SELECT id, name, sku, price_override, is_active INTO v_variant
      FROM public.product_variants
      WHERE id = v_cart_item.variant_id AND product_id = v_cart_item.product_id;

      IF NOT FOUND OR NOT v_variant.is_active THEN
        RAISE EXCEPTION 'Variant % is invalid or no longer active.', v_cart_item.variant_id;
      END IF;

      IF v_variant.price_override IS NOT NULL THEN
        v_raw_price := v_variant.price_override;
      END IF;
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
    v_discount_basis_price := v_raw_price;
    IF v_discount_percentage > 0
       AND v_cart_item.variant_id IS NULL
       AND v_product.compare_at_price IS NOT NULL
       AND v_product.compare_at_price > v_raw_price THEN
      v_discount_basis_price := v_product.compare_at_price;
    END IF;
    v_effective_price := ROUND(v_discount_basis_price * (1 - v_discount_percentage / 100), 2);

    IF v_cart_item.variant_id IS NOT NULL THEN
      SELECT id, quantity_available INTO v_inventory
      FROM public.inventory
      WHERE product_id = v_cart_item.product_id AND variant_id = v_cart_item.variant_id
      FOR UPDATE;
    ELSE
      SELECT id, quantity_available INTO v_inventory
      FROM public.inventory
      WHERE product_id = v_cart_item.product_id AND variant_id IS NULL
      FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory record missing for product %.', v_product.name;
    END IF;

    IF v_inventory.quantity_available < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%". Requested: %, Available: %',
        v_product.name, v_cart_item.quantity, v_inventory.quantity_available;
    END IF;

    v_line_total := ROUND(v_effective_price * v_cart_item.quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot checkout with an empty cart.';
  END IF;

  v_total_amount := v_subtotal;

  INSERT INTO public.orders (
    order_number, user_id, status, payment_method, payment_status, currency,
    subtotal, discount_amount, tax_amount, shipping_amount, total_amount,
    shipping_address_snapshot, customer_notes, idempotency_key,
    delivery_otp_hash, delivery_otp_ciphertext
  ) VALUES (
    p_order_number, p_user_id, 'pending', 'cod', 'pending', 'INR',
    v_subtotal, 0.00, 0.00, 0.00, v_total_amount,
    p_shipping_address, p_customer_notes, p_idempotency_key,
    p_delivery_otp_hash, p_delivery_otp_ciphertext
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, actor_id, reason
  ) VALUES (
    v_order_id, NULL, 'pending', p_user_id, 'Order placed via Cash on Delivery'
  );

  FOR v_cart_item IN
    SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = p_cart_id
  LOOP
    SELECT p.id, p.name, p.sku, p.base_price, p.compare_at_price, p.specs,
           b.description AS brand_description
    INTO v_product
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    WHERE p.id = v_cart_item.product_id;

    v_raw_price := v_product.base_price;
    v_variant_name := NULL;
    v_variant_sku := NULL;
    IF v_cart_item.variant_id IS NOT NULL THEN
      v_effective_price := NULL;
      SELECT name, sku, price_override
      INTO v_variant_name, v_variant_sku, v_effective_price
      FROM public.product_variants
      WHERE id = v_cart_item.variant_id;

      IF v_effective_price IS NOT NULL THEN
        v_raw_price := v_effective_price;
      END IF;
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
    v_discount_basis_price := v_raw_price;
    IF v_discount_percentage > 0
       AND v_cart_item.variant_id IS NULL
       AND v_product.compare_at_price IS NOT NULL
       AND v_product.compare_at_price > v_raw_price THEN
      v_discount_basis_price := v_product.compare_at_price;
    END IF;
    v_effective_price := ROUND(v_discount_basis_price * (1 - v_discount_percentage / 100), 2);
    v_line_total := ROUND(v_effective_price * v_cart_item.quantity, 2);

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, sku, variant_title,
      unit_price, quantity, line_subtotal
    ) VALUES (
      v_order_id, v_cart_item.product_id, v_cart_item.variant_id, v_product.name,
      COALESCE(v_variant_sku, v_product.sku), v_variant_name,
      v_effective_price, v_cart_item.quantity, v_line_total
    );

    IF v_cart_item.variant_id IS NOT NULL THEN
      UPDATE public.inventory
      SET quantity_available = quantity_available - v_cart_item.quantity,
          updated_at = timezone('utc'::text, now())
      WHERE product_id = v_cart_item.product_id AND variant_id = v_cart_item.variant_id;
    ELSE
      UPDATE public.inventory
      SET quantity_available = quantity_available - v_cart_item.quantity,
          updated_at = timezone('utc'::text, now())
      WHERE product_id = v_cart_item.product_id AND variant_id IS NULL;
    END IF;
  END LOOP;

  DELETE FROM public.cart_items WHERE cart_id = p_cart_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'is_duplicate', false
  );
END;
$$;

COMMIT;
