-- ==============================================================================
-- Migration: 004_create_customer_addresses_and_carts.sql
-- Description: Creates customer_addresses, carts, cart_items, and wishlists tables,
--              along with constraints, triggers, and Row Level Security (RLS) policies.
-- ==============================================================================

-- 1. CUSTOMER ADDRESSES TABLE
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT DEFAULT NULL,
  landmark TEXT DEFAULT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  address_type TEXT NOT NULL DEFAULT 'Home', -- e.g., 'Home', 'Work', 'Site'
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Partial unique index ensuring at most one default address per customer
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_default_address
  ON public.customer_addresses(user_id)
  WHERE (is_default = true);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses(user_id);

-- Address updated_at trigger
DROP TRIGGER IF EXISTS set_customer_addresses_updated_at ON public.customer_addresses;
CREATE TRIGGER set_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. CARTS TABLE
-- Supports authenticated users (user_id) and anonymous visitors (guest_cart_token_hash)
CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_cart_token_hash TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'merged', 'converted'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_cart_owner CHECK (user_id IS NOT NULL OR guest_cart_token_hash IS NOT NULL)
);

-- Active cart unique index per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_active_cart
  ON public.carts(user_id)
  WHERE (user_id IS NOT NULL AND status = 'active');

-- Active cart unique index per guest token hash
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_active_cart
  ON public.carts(guest_cart_token_hash)
  WHERE (guest_cart_token_hash IS NOT NULL AND status = 'active');

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_guest_token_hash ON public.carts(guest_cart_token_hash);

-- Cart updated_at trigger
DROP TRIGGER IF EXISTS set_carts_updated_at ON public.carts;
CREATE TRIGGER set_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 3. CART ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID DEFAULT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_cart_product_variant UNIQUE (cart_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);

-- Cart item updated_at trigger
DROP TRIGGER IF EXISTS set_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER set_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. WISHLIST TABLE
CREATE TABLE IF NOT EXISTS public.wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_wishlist_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON public.wishlists(product_id);

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES FOR CUSTOMER ADDRESSES
CREATE POLICY "Users can manage own addresses"
  ON public.customer_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can view all addresses"
  ON public.customer_addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 7. RLS POLICIES FOR CARTS
-- Authenticated users manage own carts
CREATE POLICY "Users can manage own carts"
  ON public.carts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. RLS POLICIES FOR CART ITEMS
CREATE POLICY "Users can manage own cart items"
  ON public.cart_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts
      WHERE carts.id = cart_items.cart_id AND carts.user_id = auth.uid()
    )
  );

-- 9. RLS POLICIES FOR WISHLISTS
CREATE POLICY "Users can manage own wishlist"
  ON public.wishlists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
