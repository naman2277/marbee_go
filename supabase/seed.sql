-- Seed: demo tenant, roles, OOTB schema definitions

INSERT INTO public.tenants (id, name, slug, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Organization', 'demo', 'growth', 'active');

INSERT INTO public.environments (tenant_id, name, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'development', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'staging', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'production', TRUE);

INSERT INTO public.roles (id, tenant_id, name, slug, description) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tenant Admin', 'tenant_admin', 'Full tenant access'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Marketing Manager', 'marketing_manager', 'Manage journeys and campaigns'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Data Engineer', 'data_engineer', 'Manage schemas and connectors'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Analyst', 'analyst', 'Read-only analytics');

-- OOTB schema definitions
INSERT INTO public.schema_definitions (id, tenant_id, environment, name, slug, table_name, is_system, description) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Customer', 'customer', 'customers', TRUE, 'Core customer profile'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', 'Customer Identity', 'customer_identity', 'customer_identities', TRUE, 'Identity resolution graph'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', 'Events', 'events', 'events', TRUE, 'Behavioral event stream'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'production', 'Engagement Log', 'engagement_log', 'engagement_log', TRUE, 'Channel engagement events'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'production', 'Delivery', 'delivery', 'deliveries', TRUE, 'Message delivery batches'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'production', 'Exclusion', 'exclusion', 'exclusions', TRUE, 'Suppression list'),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'production', 'Web Push Subscriber', 'web_push_subscriber', 'web_push_subscribers', TRUE, 'Web push subscriptions'),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'production', 'Real-Time Triggers', 'real_time_triggers', 'real_time_triggers', TRUE, 'Event-driven messaging rules');

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
);

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
);

UPDATE public.journeys SET current_version_id = '30000000-0000-0000-0000-000000000002' WHERE id = '30000000-0000-0000-0000-000000000001';

-- OOTB schema fields (Customer)
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000001', 'customer_id', 'uuid', TRUE, TRUE, FALSE, TRUE, 1),
  ('20000000-0000-0000-0000-000000000001', 'email', 'email', FALSE, FALSE, TRUE, TRUE, 2),
  ('20000000-0000-0000-0000-000000000001', 'mobile', 'phone', FALSE, FALSE, TRUE, TRUE, 3),
  ('20000000-0000-0000-0000-000000000001', 'name', 'string', FALSE, FALSE, TRUE, FALSE, 4),
  ('20000000-0000-0000-0000-000000000001', 'dob', 'date', FALSE, FALSE, TRUE, FALSE, 5),
  ('20000000-0000-0000-0000-000000000001', 'gender', 'enum', FALSE, FALSE, FALSE, FALSE, 6),
  ('20000000-0000-0000-0000-000000000001', 'location', 'json', FALSE, FALSE, TRUE, FALSE, 7),
  ('20000000-0000-0000-0000-000000000001', 'consent', 'json', FALSE, FALSE, FALSE, FALSE, 8),
  ('20000000-0000-0000-0000-000000000001', 'status', 'enum', FALSE, FALSE, FALSE, TRUE, 9),
  ('20000000-0000-0000-0000-000000000001', 'created_at', 'timestamp', TRUE, FALSE, FALSE, TRUE, 10),
  ('20000000-0000-0000-0000-000000000001', 'updated_at', 'timestamp', TRUE, FALSE, FALSE, FALSE, 11);
