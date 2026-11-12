BEGIN;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  FOR v_constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%amount_collected%'
      AND pg_get_constraintdef(oid) ILIKE '%total_amount%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.orders DROP CONSTRAINT %I',
      v_constraint_name
    );
  END LOOP;

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

COMMIT;
