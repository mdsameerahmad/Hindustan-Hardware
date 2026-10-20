-- ==============================================================================
-- Migration: 005_create_orders_and_checkout_schema.sql
-- Description: Orders, Order Items, Order Status History, and Atomic Checkout Function
-- ==============================================================================

-- 1. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method = 'cod'),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
  currency TEXT NOT NULL DEFAULT 'INR',
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  shipping_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_amount >= 0),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  shipping_address_snapshot JSONB NOT NULL,
  customer_notes TEXT DEFAULT NULL,
  idempotency_key TEXT DEFAULT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Trigger for orders updated_at
DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  sku TEXT DEFAULT NULL,
  variant_title TEXT DEFAULT NULL,
  specifications JSONB DEFAULT '{}'::jsonb,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_subtotal NUMERIC(12, 2) NOT NULL CHECK (line_subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- 3. ORDER STATUS HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status TEXT DEFAULT NULL,
  new_status TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- Orders: Customers can read only their own orders
DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;
CREATE POLICY "Customers can view their own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Orders: Administrators have full access
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;
CREATE POLICY "Admins have full access to orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Order Items: Customers can view items of their own orders
DROP POLICY IF EXISTS "Customers can view their own order items" ON public.order_items;
CREATE POLICY "Customers can view their own order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()
    )
  );

-- Order Items: Admins have full access
DROP POLICY IF EXISTS "Admins have full access to order items" ON public.order_items;
CREATE POLICY "Admins have full access to order items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Order Status History: Customers can view history of their own orders
DROP POLICY IF EXISTS "Customers can view history of their own orders" ON public.order_status_history;
CREATE POLICY "Customers can view history of their own orders"
  ON public.order_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid()
    )
  );

-- 5. ATOMIC CHECKOUT & INVENTORY DEDUCTION POSTGRESQL FUNCTION
-- Performs full transactional lock, inventory validation, stock deduction, order insertion,
-- order items insertion, and cart clearance.
CREATE OR REPLACE FUNCTION public.process_cod_checkout(
  p_user_id UUID,
  p_order_number TEXT,
  p_shipping_address JSONB,
  p_customer_notes TEXT,
  p_idempotency_key TEXT,
  p_cart_id UUID
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
  v_line_total NUMERIC(12, 2);
  v_subtotal NUMERIC(12, 2) := 0.00;
  v_total_amount NUMERIC(12, 2) := 0.00;
  v_order_id UUID;
  v_existing_order_id UUID;
  v_item_count INTEGER := 0;
BEGIN
  -- 1. Idempotency Check: if idempotency key exists, return existing order ID
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

  -- 2. Verify and Lock Cart
  SELECT id, user_id, status INTO v_cart_record
  FROM public.carts
  WHERE id = p_cart_id AND user_id = p_user_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active customer cart not found.';
  END IF;

  -- 3. Iterate Cart Items, Lock Inventory and Compute Authoritative Totals
  FOR v_cart_item IN
    SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = p_cart_id
  LOOP
    v_item_count := v_item_count + 1;

    -- Fetch Product
    SELECT id, name, sku, base_price, is_active INTO v_product
    FROM public.products
    WHERE id = v_cart_item.product_id;

    IF NOT FOUND OR NOT v_product.is_active THEN
      RAISE EXCEPTION 'Product % is invalid or no longer active.', v_cart_item.product_id;
    END IF;

    -- Fetch Variant if applicable
    v_effective_price := v_product.base_price;
    IF v_cart_item.variant_id IS NOT NULL THEN
      SELECT id, name, sku, price_override, is_active INTO v_variant
      FROM public.product_variants
      WHERE id = v_cart_item.variant_id AND product_id = v_cart_item.product_id;

      IF NOT FOUND OR NOT v_variant.is_active THEN
        RAISE EXCEPTION 'Variant % is invalid or no longer active.', v_cart_item.variant_id;
      END IF;

      IF v_variant.price_override IS NOT NULL THEN
        v_effective_price := v_variant.price_override;
      END IF;
    END IF;

    -- Lock and Check Inventory
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

    -- Calculate Totals
    v_line_total := ROUND(v_effective_price * v_cart_item.quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot checkout with an empty cart.';
  END IF;

  v_total_amount := v_subtotal;

  -- 4. Create Order Record
  INSERT INTO public.orders (
    order_number,
    user_id,
    status,
    payment_method,
    payment_status,
    currency,
    subtotal,
    discount_amount,
    tax_amount,
    shipping_amount,
    total_amount,
    shipping_address_snapshot,
    customer_notes,
    idempotency_key
  ) VALUES (
    p_order_number,
    p_user_id,
    'pending',
    'cod',
    'pending',
    'INR',
    v_subtotal,
    0.00,
    0.00,
    0.00,
    v_total_amount,
    p_shipping_address,
    p_customer_notes,
    p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  -- 5. Record Initial Order Status History
  INSERT INTO public.order_status_history (
    order_id,
    previous_status,
    new_status,
    actor_id,
    reason
  ) VALUES (
    v_order_id,
    NULL,
    'pending',
    p_user_id,
    'Order placed via Cash on Delivery'
  );

  -- 6. Insert Order Items & Deduct Inventory
  FOR v_cart_item IN
    SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = p_cart_id
  LOOP
    SELECT id, name, sku, base_price INTO v_product
    FROM public.products
    WHERE id = v_cart_item.product_id;

    v_effective_price := v_product.base_price;
    IF v_cart_item.variant_id IS NOT NULL THEN
      SELECT id, name, sku, price_override INTO v_variant
      FROM public.product_variants
      WHERE id = v_cart_item.variant_id;

      IF v_variant.price_override IS NOT NULL THEN
        v_effective_price := v_variant.price_override;
      END IF;
    END IF;

    v_line_total := ROUND(v_effective_price * v_cart_item.quantity, 2);

    -- Insert Order Item Snapshot
    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      sku,
      variant_title,
      unit_price,
      quantity,
      line_subtotal
    ) VALUES (
      v_order_id,
      v_cart_item.product_id,
      v_cart_item.variant_id,
      v_product.name,
      COALESCE(v_variant.sku, v_product.sku),
      v_variant.name,
      v_effective_price,
      v_cart_item.quantity,
      v_line_total
    );

    -- Deduct Inventory Available Stock
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

  -- 7. Clear Cart Items and mark Cart checked out
  DELETE FROM public.cart_items WHERE cart_id = p_cart_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'is_duplicate', false
  );
END;
$$;
