-- Run in Supabase SQL Editor if Web Push Subscriber shows 0 fields in Schemas
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000007', 'id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000007', 'customer_id', 'uuid', FALSE, FALSE, FALSE, TRUE, 2),
  ('20000000-0000-0000-0000-000000000007', 'ecid', 'string', FALSE, FALSE, FALSE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000007', 'fcm_token', 'string', TRUE, FALSE, FALSE, TRUE, 4),
  ('20000000-0000-0000-0000-000000000007', 'browser', 'string', FALSE, FALSE, FALSE, FALSE, 5),
  ('20000000-0000-0000-0000-000000000007', 'os', 'string', FALSE, FALSE, FALSE, FALSE, 6),
  ('20000000-0000-0000-0000-000000000007', 'device', 'string', FALSE, FALSE, FALSE, FALSE, 7),
  ('20000000-0000-0000-0000-000000000007', 'permission_status', 'enum', FALSE, FALSE, FALSE, FALSE, 8),
  ('20000000-0000-0000-0000-000000000007', 'subscription_status', 'enum', TRUE, FALSE, FALSE, TRUE, 9),
  ('20000000-0000-0000-0000-000000000007', 'last_seen', 'timestamp', FALSE, FALSE, FALSE, FALSE, 10),
  ('20000000-0000-0000-0000-000000000007', 'token_invalidated_at', 'timestamp', FALSE, FALSE, FALSE, FALSE, 11),
  ('20000000-0000-0000-0000-000000000007', 'created_at', 'timestamp', TRUE, FALSE, FALSE, TRUE, 12),
  ('20000000-0000-0000-0000-000000000007', 'updated_at', 'timestamp', TRUE, FALSE, FALSE, FALSE, 13)
ON CONFLICT (schema_id, name) DO NOTHING;
