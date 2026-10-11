-- =============================================================================
-- MARBEE v2 REVAMP — PART 54: SYSTEMATIC INDEXING PASS
-- Run AFTER 53. Fully idempotent and defensive: every index is only created if
-- its table AND all referenced columns exist, so this is safe against schema
-- drift between installs.
--
-- On a LIVE database with large tables, prefer running the equivalent
--   CREATE INDEX CONCURRENTLY ...
-- manually outside a transaction. This script uses plain CREATE INDEX so it can
-- run as one migration step on fresh / small databases.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._v2_idx(p_name text, p_table text, p_def text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(p_table) IS NULL THEN
    RAISE NOTICE 'skip %: table % absent', p_name, p_table; RETURN;
  END IF;
  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s %s', p_name, p_table, p_def);
  EXCEPTION
    WHEN undefined_column OR undefined_object OR undefined_function THEN
      RAISE NOTICE 'skip %: %', p_name, SQLERRM;
    WHEN duplicate_table THEN
      NULL;
  END;
END;
$$;

-- ---- platform / access -------------------------------------------------------
SELECT public._v2_idx('idx_tenant_users_user',        'public.tenant_users',       '(user_id, status)');
SELECT public._v2_idx('idx_roles_tenant',             'public.roles',              '(tenant_id, slug)');
SELECT public._v2_idx('idx_role_permissions_perm',    'public.role_permissions',   '(permission_id)');
SELECT public._v2_idx('idx_api_keys_prefix_live',     'public.api_keys',           '(key_prefix) WHERE revoked_at IS NULL');
SELECT public._v2_idx('idx_api_keys_hash',            'public.api_keys',           '(key_hash)');
SELECT public._v2_idx('idx_api_keys_tenant',          'public.api_keys',           '(tenant_id, environment)');
SELECT public._v2_idx('idx_tenant_invites_email',     'public.tenant_invites',     '(lower(email))');

-- ---- customers / identity ---------------------------------------------------
SELECT public._v2_idx('idx_customers_list',           'public.customers',          '(tenant_id, environment, updated_at DESC)');
SELECT public._v2_idx('idx_customers_status',         'public.customers',          '(tenant_id, environment, status) WHERE deleted_at IS NULL');
SELECT public._v2_idx('idx_customers_email_trgm',     'public.customers',          'USING gin (email extensions.gin_trgm_ops) WHERE email IS NOT NULL');
SELECT public._v2_idx('idx_customers_lastname_trgm',  'public.customers',          'USING gin (last_name extensions.gin_trgm_ops) WHERE last_name IS NOT NULL');
SELECT public._v2_idx('idx_customers_firstname_trgm', 'public.customers',          'USING gin (first_name extensions.gin_trgm_ops) WHERE first_name IS NOT NULL');
SELECT public._v2_idx('idx_customers_loyalty_prog',   'public.customers',          '(loyalty_program_id) WHERE loyalty_program_id IS NOT NULL');
SELECT public._v2_idx('idx_identities_email',         'public.customer_identities','(tenant_id, environment, email) WHERE email IS NOT NULL');
SELECT public._v2_idx('idx_identities_external',      'public.customer_identities','(tenant_id, environment, external_id) WHERE external_id IS NOT NULL');
SELECT public._v2_idx('idx_identities_device',        'public.customer_identities','(tenant_id, environment, device_id) WHERE device_id IS NOT NULL');
SELECT public._v2_idx('idx_wps_active',               'public.web_push_subscribers','(tenant_id, environment, subscription_status)');
SELECT public._v2_idx('idx_wps_customer',             'public.web_push_subscribers','(customer_id) WHERE customer_id IS NOT NULL');
SELECT public._v2_idx('idx_channel_endpoints_lookup', 'public.channel_endpoints',  '(tenant_id, environment, channel, status)');
SELECT public._v2_idx('idx_channel_endpoints_sub',    'public.channel_endpoints',  '(subscriber_id) WHERE subscriber_id IS NOT NULL');

-- ---- deliveries / messaging ------------------------------------------------
SELECT public._v2_idx('idx_deliveries_list',          'public.deliveries',         '(tenant_id, environment, status, created_at DESC)');
SELECT public._v2_idx('idx_deliveries_journey',       'public.deliveries',         '(journey_id) WHERE journey_id IS NOT NULL');
SELECT public._v2_idx('idx_deliveries_campaign',      'public.deliveries',         '(campaign_id) WHERE campaign_id IS NOT NULL');
SELECT public._v2_idx('idx_deliveries_audience',      'public.deliveries',         '(audience_id) WHERE audience_id IS NOT NULL');
SELECT public._v2_idx('idx_deliveries_scheduled',     'public.deliveries',         '(scheduled_at) WHERE status = ''pending'' AND scheduled_at IS NOT NULL');

-- ---- journeys -------------------------------------------------------------
SELECT public._v2_idx('idx_journeys_list',            'public.journeys',           '(tenant_id, environment, status, updated_at DESC)');
SELECT public._v2_idx('idx_journeys_folder',          'public.journeys',           '(tenant_id, environment, folder_path)');
SELECT public._v2_idx('idx_journeys_schedule',        'public.journeys',           '(starts_at, ends_at) WHERE status = ''published''');
SELECT public._v2_idx('idx_jinst_tenant_status',      'public.journey_instances',  '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_jinst_customer',           'public.journey_instances',  '(customer_id, entered_at DESC)');
SELECT public._v2_idx('idx_jinst_journey',            'public.journey_instances',  '(journey_id, entered_at DESC)');
SELECT public._v2_idx('idx_jver_journey',             'public.journey_versions',   '(journey_id, version_number DESC)');

-- ---- content / data platform --------------------------------------------
SELECT public._v2_idx('idx_forms_list',               'public.forms',              '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_form_subs_form',           'public.form_submissions',   '(form_id, created_at DESC)');
SELECT public._v2_idx('idx_form_subs_tenant',         'public.form_submissions',   '(tenant_id, environment, created_at DESC)');
SELECT public._v2_idx('idx_form_subs_customer',       'public.form_submissions',   '(customer_id) WHERE customer_id IS NOT NULL');
SELECT public._v2_idx('idx_landing_list',             'public.landing_pages',      '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_assets_folder',            'public.assets',             '(tenant_id, environment, folder)');
SELECT public._v2_idx('idx_assets_name_trgm',         'public.assets',             'USING gin (name extensions.gin_trgm_ops)');
SELECT public._v2_idx('idx_schemadef_list',           'public.schema_definitions', '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_schemafields_schema',      'public.schema_fields',      '(schema_id, sort_order)');
SELECT public._v2_idx('idx_connectors_list',          'public.connectors',         '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_connectors_type',          'public.connectors',         '(tenant_id, environment, connector_type)');
SELECT public._v2_idx('idx_connector_runs_conn',      'public.connector_runs',     '(connector_id, started_at DESC)');
SELECT public._v2_idx('idx_connectors_config_gin',    'public.connectors',         'USING gin (config jsonb_path_ops)');
SELECT public._v2_idx('idx_data_jobs_list',           'public.data_jobs',          '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_audiences_list',           'public.audiences',          '(tenant_id, environment, updated_at DESC)');

-- ---- channels / rtm ----------------------------------------------------
SELECT public._v2_idx('idx_channel_providers_lookup', 'public.channel_providers',  '(tenant_id, environment, channel, is_default)');
SELECT public._v2_idx('idx_content_templates_list',   'public.content_templates',  '(tenant_id, environment, channel, status)');
SELECT public._v2_idx('idx_rtm_defs_list',            'public.rtm_definitions',    '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_rtm_msgs_customer',        'public.rtm_messages',       '(resolved_customer_id, received_at DESC) WHERE resolved_customer_id IS NOT NULL');
SELECT public._v2_idx('idx_rtm_templates_def',        'public.rtm_templates',      '(definition_id, channel, locale)');

-- ---- loyalty / offers / social --------------------------------------
SELECT public._v2_idx('idx_loyalty_members_customer', 'public.loyalty_members',    '(customer_id)');
SELECT public._v2_idx('idx_loyalty_members_program',  'public.loyalty_members',    '(program_id, status)');
SELECT public._v2_idx('idx_offer_log_customer',       'public.offer_decision_log', '(customer_id, created_at DESC) WHERE customer_id IS NOT NULL');
SELECT public._v2_idx('idx_coupon_codes_claim',       'public.coupon_codes',       '(campaign_id, claimed_by_customer_id)');
SELECT public._v2_idx('idx_social_posts_list',        'public.social_posts',       '(tenant_id, environment, status)');
SELECT public._v2_idx('idx_service_subs_customer',    'public.service_subscriptions','(customer_id, status)');

-- ---- misc (guarded — may not exist on every install) ----------------
SELECT public._v2_idx('idx_notifications_user',       'public.notifications',      '(user_id, read_at, created_at DESC)');
SELECT public._v2_idx('idx_tasks_tenant',            'public.tasks',              '(tenant_id, status, due_at)');
SELECT public._v2_idx('idx_web_sessions_tenant_time', 'public.web_analytics_sessions', '(tenant_id, environment, start_time DESC)');
SELECT public._v2_idx('idx_dq_violations_tenant',     'public.data_quality_violations', '(run_id)');

DROP FUNCTION IF EXISTS public._v2_idx(text, text, text);

ANALYZE;

DO $$ BEGIN RAISE NOTICE 'v2/54 complete: FK / list / search / JSONB indexes applied across the schema.'; END $$;
