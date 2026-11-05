-- Store bulk-order requests submitted from the public storefront.
CREATE TABLE IF NOT EXISTS public.bulk_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT NULL,
  product_details TEXT NOT NULL,
  quantity TEXT NOT NULL,
  delivery_location TEXT NOT NULL,
  requirements TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'contacted', 'quoted', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bulk_inquiries_created_at
  ON public.bulk_inquiries (created_at DESC);

ALTER TABLE public.bulk_inquiries ENABLE ROW LEVEL SECURITY;
