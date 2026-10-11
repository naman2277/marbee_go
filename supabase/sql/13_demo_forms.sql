-- Demo forms for Marbee tenant (safe to re-run)
-- Run AFTER 01_marbee_schema.sql and 05_auto_link_new_users.sql

INSERT INTO public.forms (id, tenant_id, environment, name, slug, fields, schema_mapping, settings, status)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'production',
  'Contact Us',
  'contact_us',
  '[
    {"id":"f1","name":"name","label":"First name","field_type":"text","required":true,"sort_order":0},
    {"id":"f2","name":"email","label":"Email","field_type":"email","required":true,"sort_order":1},
    {"id":"f3","name":"mobile","label":"Phone","field_type":"phone","required":false,"sort_order":2},
    {"id":"f4","name":"message","label":"Message","field_type":"textarea","required":false,"sort_order":3}
  ]'::jsonb,
  '{"upsert_customer":true,"field_mappings":[{"form_field":"name","schema_field":"first_name"},{"form_field":"email","schema_field":"email"},{"form_field":"mobile","schema_field":"mobile"}]}'::jsonb,
  '{"submit_label":"Send message","success_message":"Thanks — we will get back to you soon.","description":"Reach out to our team"}'::jsonb,
  'published'
)
ON CONFLICT (tenant_id, environment, slug) DO UPDATE SET
  name = EXCLUDED.name,
  fields = EXCLUDED.fields,
  schema_mapping = EXCLUDED.schema_mapping,
  settings = EXCLUDED.settings,
  status = EXCLUDED.status,
  updated_at = NOW();

-- Clone to dev/staging
INSERT INTO public.forms (tenant_id, environment, name, slug, fields, schema_mapping, settings, status)
SELECT f.tenant_id, env.environment, f.name, f.slug, f.fields, f.schema_mapping, f.settings, f.status
FROM public.forms f
CROSS JOIN (VALUES ('development'), ('staging')) AS env(environment)
WHERE f.slug = 'contact_us'
  AND f.environment = 'production'
ON CONFLICT (tenant_id, environment, slug) DO UPDATE SET
  name = EXCLUDED.name,
  fields = EXCLUDED.fields,
  schema_mapping = EXCLUDED.schema_mapping,
  settings = EXCLUDED.settings,
  status = EXCLUDED.status,
  updated_at = NOW();
