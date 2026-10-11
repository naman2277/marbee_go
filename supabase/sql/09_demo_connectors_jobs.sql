-- Demo connector + data job (run after 02_marbee_seed.sql)
INSERT INTO public.connectors (id, tenant_id, environment, name, connector_type, direction, config, mapping, status) VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'production',
    'CRM Webhook',
    'webhook',
    'inbound',
    '{"endpoint_secret": "demo"}',
    '[
      {"source_field": "crm.email", "transform": "lowercase", "target_schema": "customer", "target_field": "email"},
      {"source_field": "crm.phone", "transform": "trim", "target_schema": "customer", "target_field": "mobile"},
      {"source_field": "crm.id", "transform": "", "target_schema": "customer_identity", "target_field": "external_id"}
    ]'::jsonb,
    'active'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.data_jobs (id, tenant_id, environment, name, job_type, workflow_json, schedule_cron, status) VALUES
  (
    '60000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'production',
    'Daily Customer Export',
    'export',
    '{
      "steps": [
        {"id": "s1", "type": "source", "label": "Customer schema", "config": {"schema": "customer"}},
        {"id": "s2", "type": "filter", "label": "Active only", "config": {"field": "status", "value": "active"}},
        {"id": "s3", "type": "target", "label": "CSV export", "config": {"format": "csv"}}
      ]
    }'::jsonb,
    '0 2 * * *',
    'active'
  )
ON CONFLICT (id) DO NOTHING;
