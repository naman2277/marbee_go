-- =============================================================================
-- MARBEE — Demo blast workflow (Adobe Campaign Classic targeting activities)
-- Run AFTER 01_marbee_schema.sql + 25_audiences.sql + 31_workflow_runs.sql
-- =============================================================================

INSERT INTO public.journeys (
  id, tenant_id, environment, name, description, status,
  entry_trigger_config, settings
) VALUES (
  '32000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'production',
  'August Newsletter Blast',
  'Query → deduplication → email delivery — run activities one by one',
  'draft',
  '{"type": "query", "audience_slug": "email-reachable"}',
  '{"journey_type": "blast"}'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  settings = EXCLUDED.settings;

INSERT INTO public.journey_versions (id, journey_id, version_number, canvas_json)
VALUES (
  '32000000-0000-0000-0000-000000000002',
  '32000000-0000-0000-0000-000000000001',
  1,
  '{
    "nodes": [
      {"id":"query-1","type":"campaignStep","position":{"x":280,"y":0},"data":{"label":"Query","stepType":"query","config":{"audience_slug":"email-reachable","schema_slug":"customer"}}},
      {"id":"dedupe-1","type":"campaignStep","position":{"x":280,"y":160},"data":{"label":"Deduplication","stepType":"deduplication","config":{"dedupe_field":"email"}}},
      {"id":"email-1","type":"campaignStep","position":{"x":280,"y":320},"data":{"label":"Email delivery","stepType":"send_email","config":{"delivery_name":"August Newsletter","subject":"Your monthly update"}}}
    ],
    "edges": [
      {"id":"we1","source":"query-1","target":"dedupe-1","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"we2","source":"dedupe-1","target":"email-1","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}}
    ]
  }'::jsonb
)
ON CONFLICT (journey_id, version_number) DO UPDATE SET canvas_json = EXCLUDED.canvas_json;

UPDATE public.journeys
SET current_version_id = '32000000-0000-0000-0000-000000000002'
WHERE id = '32000000-0000-0000-0000-000000000001';
