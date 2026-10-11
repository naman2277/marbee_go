-- =============================================================================
-- MARBEE — PART 2: SEED DATA
-- Run this AFTER 01_marbee_schema.sql
-- =============================================================================

-- Demo tenant (use this ID in your .env.local)
INSERT INTO public.tenants (id, name, slug, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Organization', 'demo', 'growth', 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.environments (tenant_id, name, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'development', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'staging', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'production', TRUE)
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.roles (id, tenant_id, name, slug, description) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tenant Admin', 'tenant_admin', 'Full tenant access'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Marketing Manager', 'marketing_manager', 'Manage journeys and campaigns'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Data Engineer', 'data_engineer', 'Manage schemas and connectors'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Analyst', 'analyst', 'Read-only analytics')
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- OOTB schema definitions
INSERT INTO public.schema_definitions (id, tenant_id, environment, name, slug, table_name, is_system, description) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Customer', 'customer', 'customers', TRUE, 'Core customer profile'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', 'Customer Identity', 'customer_identity', 'customer_identities', TRUE, 'Identity resolution graph'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', 'Events', 'events', 'events', TRUE, 'Behavioral event stream'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'production', 'Engagement Log', 'engagement_log', 'engagement_log', TRUE, 'Channel engagement events'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'production', 'Delivery', 'delivery', 'deliveries', TRUE, 'Message delivery batches'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'production', 'Exclusion', 'exclusion', 'exclusions', TRUE, 'Suppression list'),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'production', 'Web Push Subscriber', 'web_push_subscriber', 'web_push_subscribers', TRUE, 'Web push subscriptions'),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'production', 'Real-Time Triggers', 'real_time_triggers', 'real_time_triggers', TRUE, 'Event-driven messaging rules')
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

-- Customer schema fields
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
ON CONFLICT (schema_id, name) DO NOTHING;

-- Web Push Subscriber schema fields
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

-- Customer Identity schema fields
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

-- Events schema fields
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

-- Engagement Log schema fields
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

-- Delivery schema fields
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

-- Exclusion schema fields
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

-- Real-Time Triggers schema fields
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

-- Mirror OOTB schemas to development + staging (app environment switcher)
DO $$
DECLARE
  v_env TEXT;
BEGIN
  FOREACH v_env IN ARRAY ARRAY['development', 'staging'] LOOP
    INSERT INTO public.schema_definitions (tenant_id, environment, name, slug, table_name, is_system, description, status)
    SELECT tenant_id, v_env, name, slug, table_name, is_system, description, status
    FROM public.schema_definitions
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
      AND environment = 'production'
      AND is_system = TRUE
    ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

    INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order)
    SELECT new_sd.id, sf.name, sf.field_type, sf.is_required, sf.is_primary_key, sf.is_pii, sf.is_indexed, sf.sort_order
    FROM public.schema_fields sf
    JOIN public.schema_definitions prod_sd
      ON sf.schema_id = prod_sd.id AND prod_sd.environment = 'production' AND prod_sd.is_system = TRUE
    JOIN public.schema_definitions new_sd
      ON new_sd.slug = prod_sd.slug
      AND new_sd.environment = v_env
      AND new_sd.tenant_id = prod_sd.tenant_id
    ON CONFLICT (schema_id, name) DO NOTHING;
  END LOOP;
END $$;

-- Demo real-time trigger
INSERT INTO public.real_time_triggers (tenant_id, environment, name, event_type, channel, template_config, is_transactional, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'production',
  'Booking Confirmation',
  'booking_completed',
  'web_push',
  '{"title": "Booking Confirmed!", "body": "Your booking {{booking_id}} is confirmed."}',
  TRUE,
  'active'
);

-- Demo abandon cart journey
INSERT INTO public.journeys (id, tenant_id, environment, name, description, status, entry_trigger_config)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'production',
  'Abandon Cart',
  'Recover abandoned carts with timed web push messages',
  'draft',
  '{"type": "event", "event_type": "cart_abandoned"}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.journey_versions (id, journey_id, version_number, canvas_json)
VALUES (
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  1,
  '{
    "nodes": [
      {"id": "trigger-1", "type": "trigger", "position": {"x": 250, "y": 0}, "data": {"label": "Cart Abandoned", "event_type": "cart_abandoned"}},
      {"id": "wait-1", "type": "wait", "position": {"x": 250, "y": 120}, "data": {"label": "Wait 1 hour", "duration": "1h"}},
      {"id": "condition-1", "type": "condition", "position": {"x": 250, "y": 240}, "data": {"label": "Purchased?", "field": "events.purchase_completed"}},
      {"id": "push-1", "type": "send_web_push", "position": {"x": 100, "y": 360}, "data": {"label": "Send Reminder Push", "title": "Complete your order", "body": "Items in your cart are waiting!"}},
      {"id": "exit-1", "type": "exit", "position": {"x": 400, "y": 360}, "data": {"label": "Exit"}}
    ],
    "edges": [
      {"id": "e1", "source": "trigger-1", "target": "wait-1"},
      {"id": "e2", "source": "wait-1", "target": "condition-1"},
      {"id": "e3", "source": "condition-1", "target": "push-1", "label": "No"},
      {"id": "e4", "source": "condition-1", "target": "exit-1", "label": "Yes"}
    ]
  }'
)
ON CONFLICT (journey_id, version_number) DO NOTHING;

UPDATE public.journeys
SET current_version_id = '30000000-0000-0000-0000-000000000002'
WHERE id = '30000000-0000-0000-0000-000000000001';

-- Sample customers
INSERT INTO public.customers (id, tenant_id, environment, email, mobile, first_name, last_name, status) VALUES
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'john@example.com', '+919876543210', 'John', 'Doe', 'active'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', 'jane@example.com', '+919876543211', 'Jane', 'Smith', 'active')
ON CONFLICT (id) DO NOTHING;

-- Sample events for timeline demo
INSERT INTO public.events (tenant_id, environment, event_type, customer_id, timestamp, source, properties) VALUES
  ('00000000-0000-0000-0000-000000000001', 'production', 'product_viewed', '40000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 hours', 'web', '{"sku": "FL-123"}'),
  ('00000000-0000-0000-0000-000000000001', 'production', 'cart_abandoned', '40000000-0000-0000-0000-000000000001', NOW() - INTERVAL '1 hour', 'web', '{"cart_value": 12400}'),
  ('00000000-0000-0000-0000-000000000001', 'production', 'purchase_completed', '40000000-0000-0000-0000-000000000002', NOW() - INTERVAL '30 minutes', 'web', '{"value": 8500}')
;

-- Sample engagement for Command Center
INSERT INTO public.engagement_log (tenant_id, environment, customer_id, channel, message_id, event, timestamp) VALUES
  ('00000000-0000-0000-0000-000000000001', 'production', '40000000-0000-0000-0000-000000000001', 'web_push', 'msg-001', 'sent', NOW() - INTERVAL '1 hour'),
  ('00000000-0000-0000-0000-000000000001', 'production', '40000000-0000-0000-0000-000000000001', 'web_push', 'msg-001', 'delivered', NOW() - INTERVAL '59 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'production', '40000000-0000-0000-0000-000000000001', 'web_push', 'msg-001', 'clicked', NOW() - INTERVAL '55 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'production', '40000000-0000-0000-0000-000000000002', 'web_push', 'msg-002', 'sent', NOW() - INTERVAL '30 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'production', '40000000-0000-0000-0000-000000000002', 'web_push', 'msg-002', 'delivered', NOW() - INTERVAL '29 minutes'),
  ('00000000-0000-0000-0000-000000000001', 'production', '40000000-0000-0000-0000-000000000002', 'web_push', 'msg-002', 'converted', NOW() - INTERVAL '20 minutes')
;

-- After the v2 revamp (supabase/sql/v2/55_rollups.sql) mv_command_center_today is
-- a plain VIEW over rollup_engagement_daily, so only REFRESH while it is still a
-- materialized view on a pre-v2 database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_command_center_today') THEN
    REFRESH MATERIALIZED VIEW public.mv_command_center_today;
  ELSIF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_rollups') THEN
    PERFORM public.refresh_rollups(now() - interval '7 days');
  END IF;
END$$;
