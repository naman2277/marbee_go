-- Drop legacy customers.name — migrate values into first_name
-- Run after 19_customer_name_fields.sql (safe to re-run)

-- Move full display name into first_name when structured name is missing
UPDATE public.customers
SET first_name = COALESCE(
  NULLIF(TRIM(first_name), ''),
  NULLIF(TRIM(name), '')
)
WHERE name IS NOT NULL
  AND TRIM(name) <> ''
  AND (first_name IS NULL OR TRIM(first_name) = '');

-- Remove name from Customer schema metadata
DELETE FROM public.schema_fields
WHERE schema_id = '20000000-0000-0000-0000-000000000001'
  AND name = 'name';

-- Re-order remaining Customer schema fields
UPDATE public.schema_fields SET sort_order = 6, description = 'Primary email address' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'email';
UPDATE public.schema_fields SET sort_order = 7, description = 'E.164 country calling code' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'mobile_country_code';
UPDATE public.schema_fields SET sort_order = 8, description = 'Mobile number' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'mobile';
UPDATE public.schema_fields SET sort_order = 9, description = 'Date of birth' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'dob';
UPDATE public.schema_fields SET sort_order = 10, description = 'Gender' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'gender';
UPDATE public.schema_fields SET sort_order = 11, description = 'City' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'city';
UPDATE public.schema_fields SET sort_order = 12, description = 'State / province' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'state';
UPDATE public.schema_fields SET sort_order = 13, description = 'Country' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'country';
UPDATE public.schema_fields SET sort_order = 14, description = 'Postal / ZIP code' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'pincode';
UPDATE public.schema_fields SET sort_order = 15, description = 'Legacy location JSON blob' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'location';
UPDATE public.schema_fields SET sort_order = 16, description = 'Email marketing consent' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'consent_email';
UPDATE public.schema_fields SET sort_order = 17, description = 'SMS marketing consent' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'consent_sms';
UPDATE public.schema_fields SET sort_order = 18, description = 'Web push consent' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'consent_web_push';
UPDATE public.schema_fields SET sort_order = 19, description = 'WhatsApp consent' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'consent_whatsapp';
UPDATE public.schema_fields SET sort_order = 20, description = 'Legacy consent JSON blob' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'consent';
UPDATE public.schema_fields SET sort_order = 21, description = 'Global suppression / blacklist flag' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'global_blacklist';
UPDATE public.schema_fields SET sort_order = 22, description = 'Profile status' WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'status';
UPDATE public.schema_fields SET sort_order = 23 WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'created_at';
UPDATE public.schema_fields SET sort_order = 24 WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name = 'updated_at';

ALTER TABLE public.customers DROP COLUMN IF EXISTS name;

-- Sync Customer schema fields to development / staging
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
      AND sf.name = 'name';

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
