-- =============================================================================
-- MARBEE — CLEANUP (run ONLY if a previous schema attempt failed partway)
-- Then re-run 01_marbee_schema.sql and 02_marbee_seed.sql
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_command_center_today CASCADE;

DROP TABLE IF EXISTS public.channel_providers CASCADE;
DROP TABLE IF EXISTS public.data_jobs CASCADE;
DROP TABLE IF EXISTS public.connector_runs CASCADE;
DROP TABLE IF EXISTS public.connectors CASCADE;
DROP TABLE IF EXISTS public.schema_fields CASCADE;
DROP TABLE IF EXISTS public.schema_definitions CASCADE;
DROP TABLE IF EXISTS public.landing_pages CASCADE;
DROP TABLE IF EXISTS public.form_submissions CASCADE;
DROP TABLE IF EXISTS public.forms CASCADE;
DROP TABLE IF EXISTS public.assets CASCADE;
DROP TABLE IF EXISTS public.real_time_triggers CASCADE;
DROP TABLE IF EXISTS public.journey_instance_events CASCADE;
DROP TABLE IF EXISTS public.journey_instances CASCADE;
DROP TABLE IF EXISTS public.journey_versions CASCADE;
DROP TABLE IF EXISTS public.journeys CASCADE;
DROP TABLE IF EXISTS public.customer_delivery_log CASCADE;
DROP TABLE IF EXISTS public.deliveries CASCADE;
DROP TABLE IF EXISTS public.engagement_log CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.exclusions CASCADE;
DROP TABLE IF EXISTS public.channel_endpoints CASCADE;
DROP TABLE IF EXISTS public.web_push_subscribers CASCADE;
DROP TABLE IF EXISTS public.customer_identities CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.api_keys CASCADE;
DROP TABLE IF EXISTS public.tenant_users CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.environments CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

DROP FUNCTION IF EXISTS public.user_has_tenant_access(UUID);
DROP FUNCTION IF EXISTS public.user_tenant_ids();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.set_updated_at();
DROP FUNCTION IF EXISTS public.current_user_role();
DROP FUNCTION IF EXISTS public.current_environment();
DROP FUNCTION IF EXISTS public.current_tenant_id();
