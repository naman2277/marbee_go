-- Run in Supabase SQL Editor to backfill OOTB schema field definitions
-- (Fresh installs: these are included in 02_marbee_seed.sql)
-- Safe to re-run (ON CONFLICT DO NOTHING)

-- Fix Customer PK field name to match DB column `id`
DELETE FROM public.schema_fields
WHERE schema_id = '20000000-0000-0000-0000-000000000001' AND name IN ('customer_id', 'name', 'consent', 'global_blacklist');

INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('20000000-0000-0000-0000-000000000001', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1, 'Primary key'),
  ('20000000-0000-0000-0000-000000000001', 'title', 'string', FALSE, FALSE, FALSE, FALSE, 2, 'Salutation / honorific'),
  ('20000000-0000-0000-0000-000000000001', 'first_name', 'string', FALSE, FALSE, TRUE, TRUE, 3, 'Given name'),
  ('20000000-0000-0000-0000-000000000001', 'middle_name', 'string', FALSE, FALSE, TRUE, FALSE, 4, 'Middle name'),
  ('20000000-0000-0000-0000-000000000001', 'last_name', 'string', FALSE, FALSE, TRUE, TRUE, 5, 'Family name'),
  ('20000000-0000-0000-0000-000000000001', 'email', 'email', FALSE, FALSE, TRUE, TRUE, 6, 'Primary email address'),
  ('20000000-0000-0000-0000-000000000001', 'mobile_country_code', 'string', FALSE, FALSE, FALSE, FALSE, 7, 'E.164 country calling code'),
  ('20000000-0000-0000-0000-000000000001', 'mobile', 'phone', FALSE, FALSE, TRUE, TRUE, 8, 'Mobile number'),
  ('20000000-0000-0000-0000-000000000001', 'dob', 'date', FALSE, FALSE, TRUE, FALSE, 9, 'Date of birth'),
  ('20000000-0000-0000-0000-000000000001', 'gender', 'enum', FALSE, FALSE, FALSE, FALSE, 10, 'Gender'),
  ('20000000-0000-0000-0000-000000000001', 'city', 'string', FALSE, FALSE, TRUE, FALSE, 11, 'City'),
  ('20000000-0000-0000-0000-000000000001', 'state', 'string', FALSE, FALSE, TRUE, FALSE, 12, 'State / province'),
  ('20000000-0000-0000-0000-000000000001', 'country', 'string', FALSE, FALSE, TRUE, TRUE, 13, 'Country'),
  ('20000000-0000-0000-0000-000000000001', 'pincode', 'string', FALSE, FALSE, TRUE, FALSE, 14, 'Postal / ZIP code'),
  ('20000000-0000-0000-0000-000000000001', 'location', 'json', FALSE, FALSE, TRUE, FALSE, 15, 'Legacy location JSON blob'),
  ('20000000-0000-0000-0000-000000000001', 'consent_email', 'boolean', FALSE, FALSE, FALSE, FALSE, 16, 'Email marketing consent'),
  ('20000000-0000-0000-0000-000000000001', 'consent_sms', 'boolean', FALSE, FALSE, FALSE, FALSE, 17, 'SMS marketing consent'),
  ('20000000-0000-0000-0000-000000000001', 'consent_web_push', 'boolean', FALSE, FALSE, FALSE, FALSE, 18, 'Web push consent'),
  ('20000000-0000-0000-0000-000000000001', 'consent_whatsapp', 'boolean', FALSE, FALSE, FALSE, FALSE, 19, 'WhatsApp consent'),
  ('20000000-0000-0000-0000-000000000001', 'global_consent', 'boolean', FALSE, FALSE, FALSE, TRUE, 20, 'Global marketing consent'),
  ('20000000-0000-0000-0000-000000000001', 'status', 'enum', FALSE, FALSE, FALSE, TRUE, 21, 'Profile status'),
  ('20000000-0000-0000-0000-000000000001', 'created_at', 'timestamp', TRUE, FALSE, FALSE, TRUE, 22, NULL),
  ('20000000-0000-0000-0000-000000000001', 'updated_at', 'timestamp', TRUE, FALSE, FALSE, FALSE, 23, NULL)
ON CONFLICT (schema_id, name) DO UPDATE SET
  field_type = EXCLUDED.field_type,
  is_required = EXCLUDED.is_required,
  is_primary_key = EXCLUDED.is_primary_key,
  is_pii = EXCLUDED.is_pii,
  is_indexed = EXCLUDED.is_indexed,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description;

-- Customer Identity
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000002', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000002', 'customer_id', 'uuid', FALSE, FALSE, FALSE, TRUE, 2),
  ('20000000-0000-0000-0000-000000000002', 'ecid', 'string', FALSE, FALSE, FALSE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000002', 'email', 'email', FALSE, FALSE, TRUE, TRUE, 4),
  ('20000000-0000-0000-0000-000000000002', 'mobile', 'phone', FALSE, FALSE, TRUE, TRUE, 5),
  ('20000000-0000-0000-0000-000000000002', 'device_id', 'string', FALSE, FALSE, FALSE, FALSE, 6),
  ('20000000-0000-0000-0000-000000000002', 'anonymous_id', 'string', FALSE, FALSE, FALSE, TRUE, 7),
  ('20000000-0000-0000-0000-000000000002', 'external_id', 'string', FALSE, FALSE, FALSE, TRUE, 8),
  ('20000000-0000-0000-0000-000000000002', 'source', 'string', FALSE, FALSE, FALSE, FALSE, 9),
  ('20000000-0000-0000-0000-000000000002', 'identity_type', 'enum', TRUE, FALSE, FALSE, TRUE, 10),
  ('20000000-0000-0000-0000-000000000002', 'created_at', 'timestamp', TRUE, FALSE, FALSE, TRUE, 11)
ON CONFLICT (schema_id, name) DO NOTHING;

-- Events
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000003', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000003', 'event_type', 'string', TRUE, FALSE, FALSE, TRUE, 2),
  ('20000000-0000-0000-0000-000000000003', 'customer_id', 'uuid', FALSE, FALSE, FALSE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000003', 'anonymous_id', 'string', FALSE, FALSE, FALSE, TRUE, 4),
  ('20000000-0000-0000-0000-000000000003', 'ecid', 'string', FALSE, FALSE, FALSE, TRUE, 5),
  ('20000000-0000-0000-0000-000000000003', 'timestamp', 'timestamp', TRUE, FALSE, FALSE, TRUE, 6),
  ('20000000-0000-0000-0000-000000000003', 'source', 'string', FALSE, FALSE, FALSE, FALSE, 7),
  ('20000000-0000-0000-0000-000000000003', 'properties', 'json', TRUE, FALSE, FALSE, FALSE, 8),
  ('20000000-0000-0000-0000-000000000003', 'context', 'json', TRUE, FALSE, FALSE, FALSE, 9)
ON CONFLICT (schema_id, name) DO NOTHING;

-- Engagement Log
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000004', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000004', 'customer_id', 'uuid', FALSE, FALSE, FALSE, TRUE, 2),
  ('20000000-0000-0000-0000-000000000004', 'channel', 'enum', TRUE, FALSE, FALSE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000004', 'message_id', 'string', TRUE, FALSE, FALSE, TRUE, 4),
  ('20000000-0000-0000-0000-000000000004', 'event', 'enum', TRUE, FALSE, FALSE, TRUE, 5),
  ('20000000-0000-0000-0000-000000000004', 'timestamp', 'timestamp', TRUE, FALSE, FALSE, TRUE, 6),
  ('20000000-0000-0000-0000-000000000004', 'metadata', 'json', TRUE, FALSE, FALSE, FALSE, 7),
  ('20000000-0000-0000-0000-000000000004', 'journey_id', 'uuid', FALSE, FALSE, FALSE, FALSE, 8),
  ('20000000-0000-0000-0000-000000000004', 'campaign_id', 'uuid', FALSE, FALSE, FALSE, FALSE, 9)
ON CONFLICT (schema_id, name) DO NOTHING;

-- Delivery
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000005', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000005', 'campaign_id', 'uuid', FALSE, FALSE, FALSE, FALSE, 2),
  ('20000000-0000-0000-0000-000000000005', 'journey_id', 'uuid', FALSE, FALSE, FALSE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000005', 'channel', 'enum', TRUE, FALSE, FALSE, TRUE, 4),
  ('20000000-0000-0000-0000-000000000005', 'provider', 'string', FALSE, FALSE, FALSE, FALSE, 5),
  ('20000000-0000-0000-0000-000000000005', 'template_id', 'uuid', FALSE, FALSE, FALSE, FALSE, 6),
  ('20000000-0000-0000-0000-000000000005', 'audience_id', 'uuid', FALSE, FALSE, FALSE, FALSE, 7),
  ('20000000-0000-0000-0000-000000000005', 'scheduled_at', 'timestamp', FALSE, FALSE, FALSE, TRUE, 8),
  ('20000000-0000-0000-0000-000000000005', 'started_at', 'timestamp', FALSE, FALSE, FALSE, FALSE, 9),
  ('20000000-0000-0000-0000-000000000005', 'completed_at', 'timestamp', FALSE, FALSE, FALSE, FALSE, 10),
  ('20000000-0000-0000-0000-000000000005', 'status', 'enum', TRUE, FALSE, FALSE, TRUE, 11),
  ('20000000-0000-0000-0000-000000000005', 'stats', 'json', TRUE, FALSE, FALSE, FALSE, 12),
  ('20000000-0000-0000-0000-000000000005', 'created_at', 'timestamp', TRUE, FALSE, FALSE, TRUE, 13)
ON CONFLICT (schema_id, name) DO NOTHING;

-- Exclusion
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000006', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000006', 'customer_id', 'uuid', TRUE, FALSE, FALSE, TRUE, 2),
  ('20000000-0000-0000-0000-000000000006', 'channel', 'enum', FALSE, FALSE, FALSE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000006', 'reason', 'string', TRUE, FALSE, FALSE, FALSE, 4),
  ('20000000-0000-0000-0000-000000000006', 'source', 'enum', TRUE, FALSE, FALSE, FALSE, 5),
  ('20000000-0000-0000-0000-000000000006', 'start_date', 'date', TRUE, FALSE, FALSE, TRUE, 6),
  ('20000000-0000-0000-0000-000000000006', 'end_date', 'date', FALSE, FALSE, FALSE, FALSE, 7),
  ('20000000-0000-0000-0000-000000000006', 'created_at', 'timestamp', TRUE, FALSE, FALSE, TRUE, 8)
ON CONFLICT (schema_id, name) DO NOTHING;

-- Real-Time Triggers
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000008', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000008', 'name', 'string', TRUE, FALSE, FALSE, TRUE, 2),
  ('20000000-0000-0000-0000-000000000008', 'event_type', 'string', TRUE, FALSE, FALSE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000008', 'filters', 'json', TRUE, FALSE, FALSE, FALSE, 4),
  ('20000000-0000-0000-0000-000000000008', 'channel', 'enum', TRUE, FALSE, FALSE, TRUE, 5),
  ('20000000-0000-0000-0000-000000000008', 'template_config', 'json', TRUE, FALSE, FALSE, FALSE, 6),
  ('20000000-0000-0000-0000-000000000008', 'priority', 'number', TRUE, FALSE, FALSE, FALSE, 7),
  ('20000000-0000-0000-0000-000000000008', 'is_transactional', 'boolean', TRUE, FALSE, FALSE, FALSE, 8),
  ('20000000-0000-0000-0000-000000000008', 'status', 'enum', TRUE, FALSE, FALSE, TRUE, 9),
  ('20000000-0000-0000-0000-000000000008', 'created_at', 'timestamp', TRUE, FALSE, FALSE, TRUE, 10),
  ('20000000-0000-0000-0000-000000000008', 'updated_at', 'timestamp', TRUE, FALSE, FALSE, FALSE, 11)
ON CONFLICT (schema_id, name) DO NOTHING;
