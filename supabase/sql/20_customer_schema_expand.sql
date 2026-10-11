-- Expand Customer schema: name parts, address, consent per channel, blacklist
-- Run after 19_customer_name_fields.sql (safe to re-run)

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS mobile_country_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS consent_email BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_sms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_web_push BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS global_consent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_country
  ON public.customers (tenant_id, environment, country)
  WHERE country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_global_consent
  ON public.customers (tenant_id, environment, global_consent)
  WHERE global_consent = TRUE;

-- Backfill address from legacy location JSON
UPDATE public.customers
SET
  city = COALESCE(city, NULLIF(TRIM(location->>'city'), '')),
  state = COALESCE(state, NULLIF(TRIM(location->>'state'), '')),
  country = COALESCE(country, NULLIF(TRIM(location->>'country'), '')),
  pincode = COALESCE(pincode, NULLIF(TRIM(location->>'pincode'), ''))
WHERE location IS NOT NULL
  AND location <> '{}'::jsonb;

-- Backfill channel consent from legacy consent JSON
UPDATE public.customers
SET
  consent_email = (
    (consent->>'email') IN ('true', 'granted', 'opt_in')
    OR (consent->>'marketing_email') IN ('true', 'granted', 'opt_in')
  ),
  consent_sms = (consent->>'sms') IN ('true', 'granted', 'opt_in'),
  consent_web_push = (consent->>'web_push') IN ('true', 'granted', 'opt_in'),
  consent_whatsapp = (consent->>'whatsapp') IN ('true', 'granted', 'opt_in')
WHERE consent IS NOT NULL
  AND consent <> '{}'::jsonb;

-- Customer schema field definitions (schema_id = Customer OOTB)
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('20000000-0000-0000-0000-000000000001', 'title', 'string', FALSE, FALSE, FALSE, FALSE, 2, 'Salutation / honorific'),
  ('20000000-0000-0000-0000-000000000001', 'first_name', 'string', FALSE, FALSE, TRUE, TRUE, 3, 'Given name'),
  ('20000000-0000-0000-0000-000000000001', 'middle_name', 'string', FALSE, FALSE, TRUE, FALSE, 4, 'Middle name'),
  ('20000000-0000-0000-0000-000000000001', 'last_name', 'string', FALSE, FALSE, TRUE, TRUE, 5, 'Family name'),
  ('20000000-0000-0000-0000-000000000001', 'mobile_country_code', 'string', FALSE, FALSE, FALSE, FALSE, 8, 'E.164 country calling code'),
  ('20000000-0000-0000-0000-000000000001', 'city', 'string', FALSE, FALSE, TRUE, FALSE, 12, 'City'),
  ('20000000-0000-0000-0000-000000000001', 'state', 'string', FALSE, FALSE, TRUE, FALSE, 13, 'State / province'),
  ('20000000-0000-0000-0000-000000000001', 'country', 'string', FALSE, FALSE, TRUE, TRUE, 14, 'Country'),
  ('20000000-0000-0000-0000-000000000001', 'pincode', 'string', FALSE, FALSE, TRUE, FALSE, 15, 'Postal / ZIP code'),
  ('20000000-0000-0000-0000-000000000001', 'consent_email', 'boolean', FALSE, FALSE, FALSE, FALSE, 17, 'Email marketing consent'),
  ('20000000-0000-0000-0000-000000000001', 'consent_sms', 'boolean', FALSE, FALSE, FALSE, FALSE, 18, 'SMS marketing consent'),
  ('20000000-0000-0000-0000-000000000001', 'consent_web_push', 'boolean', FALSE, FALSE, FALSE, FALSE, 19, 'Web push consent'),
  ('20000000-0000-0000-0000-000000000001', 'consent_whatsapp', 'boolean', FALSE, FALSE, FALSE, FALSE, 20, 'WhatsApp consent'),
  ('20000000-0000-0000-0000-000000000001', 'global_consent', 'boolean', FALSE, FALSE, FALSE, TRUE, 20, 'Global marketing consent')
ON CONFLICT (schema_id, name) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  is_pii = EXCLUDED.is_pii,
  is_indexed = EXCLUDED.is_indexed,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description;

-- Re-order existing customer fields for logical grouping
UPDATE public.schema_fields SET sort_order = 1, description = 'Primary key' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'id';
UPDATE public.schema_fields SET sort_order = 6, description = 'Primary email address' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'email';
UPDATE public.schema_fields SET sort_order = 8, description = 'Mobile number' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'mobile';
UPDATE public.schema_fields SET sort_order = 9, description = 'Date of birth' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'dob';
UPDATE public.schema_fields SET sort_order = 10, description = 'Gender' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'gender';
UPDATE public.schema_fields SET sort_order = 15, description = 'Legacy location JSON blob' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'location';
UPDATE public.schema_fields SET sort_order = 21, description = 'Profile status' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'status';
UPDATE public.schema_fields SET sort_order = 23 WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'created_at';
UPDATE public.schema_fields SET sort_order = 24 WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'updated_at';

-- Sync Customer schema fields to development / staging (matches 10_fix_ootb_schemas.sql)
DO $$
DECLARE
  v_env TEXT;
BEGIN
  FOREACH v_env IN ARRAY ARRAY['development', 'staging'] LOOP
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
