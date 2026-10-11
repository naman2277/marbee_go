-- Replace legacy consent JSON + global_blacklist with global_consent
-- Run after 21_drop_customer_name.sql (safe to re-run)

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS global_consent BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate from global_blacklist (inverted: consent = not blacklisted)
UPDATE public.customers
SET global_consent = NOT COALESCE(global_blacklist, FALSE)
WHERE global_blacklist IS NOT NULL;

-- Migrate from legacy consent JSON when global_consent still false
UPDATE public.customers
SET global_consent = (
  (consent->>'global') IN ('true', 'granted', 'opt_in')
  OR (consent->>'marketing') IN ('true', 'granted', 'opt_in')
  OR (consent->>'all') IN ('true', 'granted', 'opt_in')
)
WHERE consent IS NOT NULL
  AND consent <> '{}'::jsonb
  AND global_consent = FALSE;

DROP INDEX IF EXISTS idx_customers_global_blacklist;

CREATE INDEX IF NOT EXISTS idx_customers_global_consent
  ON public.customers (tenant_id, environment, global_consent)
  WHERE global_consent = TRUE;

ALTER TABLE public.customers DROP COLUMN IF EXISTS global_blacklist;
ALTER TABLE public.customers DROP COLUMN IF EXISTS consent;

DELETE FROM public.schema_fields
WHERE schema_id = '20000000-0000-0000-0000-000000000001'
  AND name IN ('consent', 'global_blacklist');

INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('20000000-0000-0000-0000-000000000001', 'global_consent', 'boolean', FALSE, FALSE, FALSE, TRUE, 20, 'Global marketing consent')
ON CONFLICT (schema_id, name) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  is_indexed = EXCLUDED.is_indexed,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description;

UPDATE public.schema_fields SET sort_order = 22 WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'status';
UPDATE public.schema_fields SET sort_order = 23 WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'created_at';
UPDATE public.schema_fields SET sort_order = 24 WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'updated_at';

-- Sync to development / staging
DO $$
DECLARE
  v_env TEXT;
BEGIN
  FOREACH v_env IN ARRAY ARRAY['development', 'staging'] LOOP
    DELETE FROM public.schema_fields sf
    USING public.schema_definitions sd
    WHERE sf.schema_id = sd.id
      AND sd.slug = 'customer'
      AND sd.environment = v_env
      AND sd.tenant_id = '00000000-0000-0000-0000-000000000001'
      AND sf.name IN ('consent', 'global_blacklist');

    INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description)
    SELECT new_sd.id, sf.name, sf.field_type, sf.is_required, sf.is_primary_key, sf.is_pii, sf.is_indexed, sf.sort_order, sf.description
    FROM public.schema_fields sf
    JOIN public.schema_definitions prod_sd
      ON sf.schema_id = prod_sd.id
      AND prod_sd.slug = 'customer'
      AND prod_sd.environment = 'production'
      AND prod_sd.tenant_id = '00000000-0000-0000-0000-000000000001'
    JOIN public.schema_definitions new_sd
      ON new_sd.slug = prod_sd.slug
      AND new_sd.environment = v_env
      AND new_sd.tenant_id = prod_sd.tenant_id
    ON CONFLICT (schema_id, name) DO UPDATE SET
      field_type = EXCLUDED.field_type,
      is_pii = EXCLUDED.is_pii,
      is_indexed = EXCLUDED.is_indexed,
      sort_order = EXCLUDED.sort_order,
      description = EXCLUDED.description;
  END LOOP;
END $$;
