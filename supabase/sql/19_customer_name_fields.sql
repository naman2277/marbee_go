-- Customer name fields: title, first, middle, last
-- Run in Supabase SQL Editor (safe to re-run)

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_first_name
  ON public.customers (tenant_id, environment, first_name)
  WHERE first_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_last_name
  ON public.customers (tenant_id, environment, last_name)
  WHERE last_name IS NOT NULL;
