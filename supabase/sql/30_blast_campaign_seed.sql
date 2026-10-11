-- =============================================================================
-- MARBEE — Demo nurture blast campaign (Adobe Campaign–style canvas)
-- Run AFTER 01_marbee_schema.sql + 25_audiences.sql (safe to re-run)
-- =============================================================================

INSERT INTO public.journeys (
  id, tenant_id, environment, name, description, status,
  entry_trigger_config, settings
) VALUES (
  '30000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'production',
  'Nurture Email Series',
  'Segment → wait → email → clicked? branching nurture flow with shared list exit',
  'draft',
  '{"type": "segment", "audience_slug": "email-reachable"}',
  '{"journey_type": "flow"}'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  settings = EXCLUDED.settings;

INSERT INTO public.journey_versions (id, journey_id, version_number, canvas_json)
VALUES (
  '30000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000003',
  1,
  '{
    "nodes": [
      {"id":"entry-1","type":"campaignStep","position":{"x":340,"y":0},"data":{"label":"Segment members","stepType":"segment_entry","config":{"audience_name":"Nurture_Segment","audience_slug":"email-reachable"},"liveCount":28396}},
      {"id":"wait-1","type":"campaignStep","position":{"x":340,"y":160},"data":{"label":"Wait","stepType":"wait_duration","config":{"duration_value":1,"duration_unit":"hours"}}},
      {"id":"email-1","type":"campaignStep","position":{"x":340,"y":320},"data":{"label":"Email","stepType":"send_email","config":{"delivery_name":"1st Nurture Email","subject":"Welcome"}}},
      {"id":"cond-1","type":"campaignStep","position":{"x":340,"y":480},"data":{"label":"Clicked Email?","stepType":"condition_clicked","config":{"delivery_ref":"1st Nurture Email","within_hours":168}}},
      {"id":"wait-2","type":"campaignStep","position":{"x":80,"y":640},"data":{"label":"Wait","stepType":"wait_duration","config":{"duration_value":1,"duration_unit":"weeks"}}},
      {"id":"email-2","type":"campaignStep","position":{"x":80,"y":800},"data":{"label":"Email","stepType":"send_email","config":{"delivery_name":"2nd Nurture Email - No Action"}}},
      {"id":"cond-2","type":"campaignStep","position":{"x":80,"y":960},"data":{"label":"Clicked Email?","stepType":"condition_clicked","config":{"delivery_ref":"2nd Nurture Email - No Action"}}},
      {"id":"wait-3","type":"campaignStep","position":{"x":-120,"y":1120},"data":{"label":"Wait","stepType":"wait_duration","config":{"duration_value":2,"duration_unit":"weeks"}}},
      {"id":"email-3","type":"campaignStep","position":{"x":-120,"y":1280},"data":{"label":"Email","stepType":"send_email","config":{"delivery_name":"3rd Nurture Email - No Action"}}},
      {"id":"cond-3","type":"campaignStep","position":{"x":-120,"y":1440},"data":{"label":"Clicked Email?","stepType":"condition_clicked","config":{"delivery_ref":"3rd Nurture Email - No Action"}}},
      {"id":"list-1","type":"campaignStep","position":{"x":-120,"y":1600},"data":{"label":"Add To Shared List","stepType":"add_to_list","config":{"list_name":"Not Engaged"}}},
      {"id":"wait-4","type":"campaignStep","position":{"x":600,"y":640},"data":{"label":"Wait","stepType":"wait_duration","config":{"duration_value":1,"duration_unit":"weeks"}}},
      {"id":"email-4","type":"campaignStep","position":{"x":600,"y":800},"data":{"label":"Email","stepType":"send_email","config":{"delivery_name":"2nd Nurture Email - Clicked"}}},
      {"id":"cond-4","type":"campaignStep","position":{"x":600,"y":960},"data":{"label":"Clicked Email?","stepType":"condition_clicked","config":{"delivery_ref":"2nd Nurture Email - Clicked"}}},
      {"id":"wait-5","type":"campaignStep","position":{"x":880,"y":1120},"data":{"label":"Wait","stepType":"wait_duration","config":{"duration_value":2,"duration_unit":"weeks"}}},
      {"id":"email-5","type":"campaignStep","position":{"x":880,"y":1280},"data":{"label":"Email","stepType":"send_email","config":{"delivery_name":"3rd Nurture Email - Clicked"}}},
      {"id":"exit-1","type":"campaignStep","position":{"x":880,"y":1440},"data":{"label":"Exit journey","stepType":"exit","config":{"reason":"engaged"}}},
      {"id":"exit-2","type":"campaignStep","position":{"x":340,"y":640},"data":{"label":"Exit journey","stepType":"exit","config":{"reason":"converted"}}}
    ],
    "edges": [
      {"id":"e1","source":"entry-1","target":"wait-1","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e2","source":"wait-1","target":"email-1","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e3","source":"email-1","target":"cond-1","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e4","source":"cond-1","target":"exit-2","sourceHandle":"yes","label":"✓","animated":true,"style":{"stroke":"#3b82f6","strokeWidth":2}},
      {"id":"e5","source":"cond-1","target":"wait-2","sourceHandle":"no","label":"✗","animated":true,"style":{"stroke":"#f97316","strokeWidth":2}},
      {"id":"e6","source":"wait-2","target":"email-2","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e7","source":"email-2","target":"cond-2","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e8","source":"cond-2","target":"wait-4","sourceHandle":"yes","label":"✓","animated":true,"style":{"stroke":"#3b82f6","strokeWidth":2}},
      {"id":"e9","source":"cond-2","target":"wait-3","sourceHandle":"no","label":"✗","animated":true,"style":{"stroke":"#f97316","strokeWidth":2}},
      {"id":"e10","source":"wait-3","target":"email-3","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e11","source":"email-3","target":"cond-3","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e12","source":"cond-3","target":"list-1","sourceHandle":"no","label":"✗","animated":true,"style":{"stroke":"#f97316","strokeWidth":2}},
      {"id":"e13","source":"wait-4","target":"email-4","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e14","source":"email-4","target":"cond-4","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e15","source":"cond-4","target":"wait-5","sourceHandle":"no","label":"✗","animated":true,"style":{"stroke":"#f97316","strokeWidth":2}},
      {"id":"e16","source":"cond-4","target":"exit-1","sourceHandle":"yes","label":"✓","animated":true,"style":{"stroke":"#3b82f6","strokeWidth":2}},
      {"id":"e17","source":"wait-5","target":"email-5","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}},
      {"id":"e18","source":"email-5","target":"exit-1","animated":true,"style":{"stroke":"#94a3b8","strokeWidth":2}}
    ]
  }'::jsonb
)
ON CONFLICT (journey_id, version_number) DO UPDATE SET canvas_json = EXCLUDED.canvas_json;

UPDATE public.journeys
SET current_version_id = '30000000-0000-0000-0000-000000000004'
WHERE id = '30000000-0000-0000-0000-000000000003';
