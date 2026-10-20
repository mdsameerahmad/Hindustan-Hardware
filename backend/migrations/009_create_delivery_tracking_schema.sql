-- ==============================================================================
-- Migration: 009_create_delivery_tracking_schema.sql
-- Description: Phase 1 — Live Delivery Tracking Foundation:
--   1. delivery_assignments: Securely binds order, customer, delivery staff/partner, and assignment lifecycle.
--   2. delivery_locations: Stores current latest valid GPS position per delivery assignment.
--   3. delivery_location_history: Immutable audit log of historical GPS coordinates.
--   4. atomic update function: record_delivery_location prevents out-of-order/stale GPS updates.
--   5. Row Level Security: customer isolation, partner assignment scope, admin oversight.
-- ==============================================================================

-- 1. EXTEND user_role ENUM (Safe conditional addition)
-- In Supabase/PostgreSQL, adding a value to an enum is supported via ALTER TYPE ... ADD VALUE IF NOT EXISTS
DO $$
BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'delivery_partner';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. DELIVERY ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled')),
  notes TEXT DEFAULT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  picked_up_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique constraint: an order can have at most one active delivery assignment
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_assignments_active_order 
  ON public.delivery_assignments(order_id) 
  WHERE status IN ('assigned', 'picked_up', 'out_for_delivery');

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order_id ON public.delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_partner_id ON public.delivery_assignments(delivery_partner_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_customer_id ON public.delivery_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_status ON public.delivery_assignments(status);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_created_at ON public.delivery_assignments(created_at DESC);

-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS set_delivery_assignments_updated_at ON public.delivery_assignments;
CREATE TRIGGER set_delivery_assignments_updated_at
  BEFORE UPDATE ON public.delivery_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 3. LATEST DELIVERY LOCATIONS TABLE
-- Exactly one latest record per delivery assignment
CREATE TABLE IF NOT EXISTS public.delivery_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_assignment_id UUID NOT NULL UNIQUE REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
  longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
  accuracy NUMERIC(8, 2) DEFAULT NULL CHECK (accuracy IS NULL OR accuracy >= 0.0),
  speed NUMERIC(8, 2) DEFAULT NULL CHECK (speed IS NULL OR speed >= 0.0),
  heading NUMERIC(6, 2) DEFAULT NULL CHECK (heading IS NULL OR (heading >= 0.0 AND heading <= 360.0)),
  device_timestamp TIMESTAMPTZ NOT NULL,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_delivery_locations_order_id ON public.delivery_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_locations_assignment_id ON public.delivery_locations(delivery_assignment_id);
CREATE INDEX IF NOT EXISTS idx_delivery_locations_server_received_at ON public.delivery_locations(server_received_at DESC);

DROP TRIGGER IF EXISTS set_delivery_locations_updated_at ON public.delivery_locations;
CREATE TRIGGER set_delivery_locations_updated_at
  BEFORE UPDATE ON public.delivery_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. DELIVERY LOCATION HISTORY TABLE
-- Retains immutable chronological GPS trace for authorized playback and audits
CREATE TABLE IF NOT EXISTS public.delivery_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_assignment_id UUID NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
  longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
  accuracy NUMERIC(8, 2) DEFAULT NULL CHECK (accuracy IS NULL OR accuracy >= 0.0),
  speed NUMERIC(8, 2) DEFAULT NULL CHECK (speed IS NULL OR speed >= 0.0),
  heading NUMERIC(6, 2) DEFAULT NULL CHECK (heading IS NULL OR (heading >= 0.0 AND heading <= 360.0)),
  device_timestamp TIMESTAMPTZ NOT NULL,
  server_received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_delivery_location_history_assignment_time 
  ON public.delivery_location_history(delivery_assignment_id, device_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_delivery_location_history_order_time 
  ON public.delivery_location_history(order_id, device_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_delivery_location_history_server_received 
  ON public.delivery_location_history(server_received_at DESC);

-- 5. ATOMIC FUNCTION TO RECORD VALID LOCATION & PREVENT OUT-OF-ORDER WRITES
-- Accepts new GPS location from assigned delivery partner, checks timestamps,
-- and updates latest location only if newer while always recording historical trace.
CREATE OR REPLACE FUNCTION public.record_delivery_location(
  p_assignment_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_accuracy NUMERIC DEFAULT NULL,
  p_speed NUMERIC DEFAULT NULL,
  p_heading NUMERIC DEFAULT NULL,
  p_device_timestamp TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment RECORD;
  v_existing_location RECORD;
  v_server_time TIMESTAMPTZ := timezone('utc'::text, now());
  v_effective_device_time TIMESTAMPTZ;
  v_is_newer BOOLEAN := FALSE;
  v_result JSONB;
BEGIN
  -- 1. Input coordinate boundary validation
  IF p_latitude IS NULL OR p_latitude < -90.0 OR p_latitude > 90.0 THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90 degrees.';
  END IF;

  IF p_longitude IS NULL OR p_longitude < -180.0 OR p_longitude > 180.0 THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180 degrees.';
  END IF;

  -- 2. Verify assignment exists and is currently active
  SELECT id, order_id, delivery_partner_id, customer_id, status
  INTO v_assignment
  FROM public.delivery_assignments
  WHERE id = p_assignment_id;

  IF v_assignment IS NULL THEN
    RAISE EXCEPTION 'Delivery assignment % not found.', p_assignment_id;
  END IF;

  IF v_assignment.status IN ('delivered', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot record location for completed or cancelled assignment (status: %).', v_assignment.status;
  END IF;

  -- 3. Device timestamp validation: reject future timestamps beyond 10-minute clock-skew tolerance
  v_effective_device_time := COALESCE(p_device_timestamp, v_server_time);
  IF v_effective_device_time > (v_server_time + INTERVAL '10 minutes') THEN
    RAISE EXCEPTION 'Device timestamp cannot be in the future beyond permitted clock-skew tolerance.';
  END IF;

  -- 4. Insert into immutable history
  INSERT INTO public.delivery_location_history (
    delivery_assignment_id,
    order_id,
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    device_timestamp,
    server_received_at
  ) VALUES (
    v_assignment.id,
    v_assignment.order_id,
    p_latitude,
    p_longitude,
    p_accuracy,
    p_speed,
    p_heading,
    v_effective_device_time,
    v_server_time
  );

  -- 5. Upsert into delivery_locations (strictly enforcing newer timestamp)
  SELECT * INTO v_existing_location
  FROM public.delivery_locations
  WHERE delivery_assignment_id = v_assignment.id;

  IF v_existing_location IS NULL THEN
    INSERT INTO public.delivery_locations (
      delivery_assignment_id,
      order_id,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      device_timestamp,
      server_received_at
    ) VALUES (
      v_assignment.id,
      v_assignment.order_id,
      p_latitude,
      p_longitude,
      p_accuracy,
      p_speed,
      p_heading,
      v_effective_device_time,
      v_server_time
    );
    v_is_newer := TRUE;
  ELSIF v_effective_device_time >= v_existing_location.device_timestamp THEN
    UPDATE public.delivery_locations
    SET
      latitude = p_latitude,
      longitude = p_longitude,
      accuracy = p_accuracy,
      speed = p_speed,
      heading = p_heading,
      device_timestamp = v_effective_device_time,
      server_received_at = v_server_time,
      updated_at = v_server_time
    WHERE delivery_assignment_id = v_assignment.id;
    v_is_newer := TRUE;
  ELSE
    -- An existing record has a newer timestamp; we preserve existing as latest
    v_is_newer := FALSE;
  END IF;

  SELECT jsonb_build_object(
    'assignmentId', v_assignment.id,
    'orderId', v_assignment.order_id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'deviceTimestamp', v_effective_device_time,
    'serverReceivedAt', v_server_time,
    'isLatestUpdated', v_is_newer
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Revoke execute from public; grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.record_delivery_location(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_delivery_location(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_delivery_location(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ) TO service_role;

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_location_history ENABLE ROW LEVEL SECURITY;

-- Helpers: reuse public.is_admin() from migration 008

-- A. delivery_assignments policies:
-- Customers can view assignments for their own orders
DROP POLICY IF EXISTS "Customers can view their own delivery assignments" ON public.delivery_assignments;
CREATE POLICY "Customers can view their own delivery assignments"
  ON public.delivery_assignments FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- Delivery partners / staff can view assignments assigned to them
DROP POLICY IF EXISTS "Delivery partners can view their assigned deliveries" ON public.delivery_assignments;
CREATE POLICY "Delivery partners can view their assigned deliveries"
  ON public.delivery_assignments FOR SELECT
  TO authenticated
  USING (delivery_partner_id = auth.uid());

-- Admins can view all delivery assignments
DROP POLICY IF EXISTS "Admins can view all delivery assignments" ON public.delivery_assignments;
CREATE POLICY "Admins can view all delivery assignments"
  ON public.delivery_assignments FOR ALL
  TO authenticated
  USING (public.is_admin());

-- B. delivery_locations policies:
-- Customers can view latest location only for active assignments belonging to their orders
DROP POLICY IF EXISTS "Customers can view latest location of their orders" ON public.delivery_locations;
CREATE POLICY "Customers can view latest location of their orders"
  ON public.delivery_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_assignments
      WHERE delivery_assignments.id = delivery_locations.delivery_assignment_id
        AND delivery_assignments.customer_id = auth.uid()
        AND delivery_assignments.status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered')
    )
  );

-- Delivery partners can view latest location for assignments assigned to them
DROP POLICY IF EXISTS "Delivery partners can view their assignment location" ON public.delivery_locations;
CREATE POLICY "Delivery partners can view their assignment location"
  ON public.delivery_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_assignments
      WHERE delivery_assignments.id = delivery_locations.delivery_assignment_id
        AND delivery_assignments.delivery_partner_id = auth.uid()
    )
  );

-- Admins have full access to latest delivery locations
DROP POLICY IF EXISTS "Admins can view all delivery locations" ON public.delivery_locations;
CREATE POLICY "Admins can view all delivery locations"
  ON public.delivery_locations FOR ALL
  TO authenticated
  USING (public.is_admin());

-- C. delivery_location_history policies:
-- Customers can view location history for their orders
DROP POLICY IF EXISTS "Customers can view location history of their orders" ON public.delivery_location_history;
CREATE POLICY "Customers can view location history of their orders"
  ON public.delivery_location_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_assignments
      WHERE delivery_assignments.id = delivery_location_history.delivery_assignment_id
        AND delivery_assignments.customer_id = auth.uid()
    )
  );

-- Delivery partners can view location history of their assigned deliveries
DROP POLICY IF EXISTS "Delivery partners can view their assignment history" ON public.delivery_location_history;
CREATE POLICY "Delivery partners can view their assignment history"
  ON public.delivery_location_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_assignments
      WHERE delivery_assignments.id = delivery_location_history.delivery_assignment_id
        AND delivery_assignments.delivery_partner_id = auth.uid()
    )
  );

-- Admins have full access to location history
DROP POLICY IF EXISTS "Admins can view all location history" ON public.delivery_location_history;
CREATE POLICY "Admins can view all location history"
  ON public.delivery_location_history FOR ALL
  TO authenticated
  USING (public.is_admin());
