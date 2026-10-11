-- =============================================================================
-- Fix: OOTB schemas missing (wrong environment or seed not run)
-- Run in Supabase SQL Editor — safe to re-run
-- =============================================================================

-- 1) Ensure production OOTB schema definitions exist
INSERT INTO public.schema_definitions (id, tenant_id, environment, name, slug, table_name, is_system, description, status) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Customer', 'customer', 'customers', TRUE, 'Core customer profile', 'active'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', 'Customer Identity', 'customer_identity', 'customer_identities', TRUE, 'Identity resolution graph', 'active'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', 'Events', 'events', 'events', TRUE, 'Behavioral event stream', 'active'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'production', 'Engagement Log', 'engagement_log', 'engagement_log', TRUE, 'Channel engagement events', 'active'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'production', 'Delivery', 'delivery', 'deliveries', TRUE, 'Message delivery batches', 'active'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'production', 'Exclusion', 'exclusion', 'exclusions', TRUE, 'Suppression list', 'active'),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'production', 'Web Push Subscriber', 'web_push_subscriber', 'web_push_subscribers', TRUE, 'Web push subscriptions', 'active'),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'production', 'Real-Time Triggers', 'real_time_triggers', 'real_time_triggers', TRUE, 'Event-driven messaging rules', 'active')
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

-- 2) Clone OOTB schemas (+ fields) to development and staging
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

-- 3) Link all auth users to demo tenant (fixes RLS empty results)
INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status)
SELECT
  '00000000-0000-0000-0000-000000000001',
  u.id,
  '10000000-0000-0000-0000-000000000001',
  'active'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_users tu
  WHERE tu.user_id = u.id AND tu.tenant_id = '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active';

-- 4) Diagnostic — should show 8 rows per environment
SELECT environment, COUNT(*) AS ootb_schema_count
FROM public.schema_definitions
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND is_system = TRUE
GROUP BY environment
ORDER BY environment;
