-- =============================================================================
-- MARBEE v2 REVAMP — PART 58: STORAGE / AUTOVACUUM / TIMEOUT / GRANT HARDENING
-- Run AFTER 53. Re-runnable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-table autovacuum + fillfactor for hot / high-churn tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  -- append-heavy: aggressive analyze, normal fill
  v_append text[] := ARRAY['public.events','public.engagement_log','public.customer_delivery_log',
                           'public.journey_instance_events','public.audit_logs','public.web_analytics_events',
                           'public.rtm_messages','public.rollup_engagement_daily','public.rollup_events_daily'];
  -- update-heavy: tighter vacuum + fillfactor 90 to keep HOT updates on-page
  v_update text[] := ARRAY['public.journey_instances','public.web_push_subscribers','public.deliveries',
                           'public.rtm_definitions','public.idempotency_keys','public.job_queue',
                           'public.rollup_journey_daily','public.audiences','public.connectors'];
  t text;
BEGIN
  FOREACH t IN ARRAY v_append LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format($f$ALTER TABLE %s SET (
        autovacuum_vacuum_scale_factor = 0.02,
        autovacuum_analyze_scale_factor = 0.01,
        autovacuum_vacuum_cost_limit = 2000,
        autovacuum_vacuum_insert_scale_factor = 0.02
      )$f$, t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY v_update LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format($f$ALTER TABLE %s SET (
        autovacuum_vacuum_scale_factor = 0.02,
        autovacuum_analyze_scale_factor = 0.01,
        autovacuum_vacuum_cost_limit = 2000,
        fillfactor = 90
      )$f$, t);
    END IF;
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- 2. Statement / transaction timeouts per role (safe under Supavisor txn pooling)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'ALTER ROLE authenticated SET statement_timeout = ''15s''';
  EXECUTE 'ALTER ROLE authenticated SET idle_in_transaction_session_timeout = ''30s''';
  EXECUTE 'ALTER ROLE anon SET statement_timeout = ''5s''';
  EXECUTE 'ALTER ROLE anon SET idle_in_transaction_session_timeout = ''15s''';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'roles authenticated/anon not present — skipping role timeouts';
END$$;

-- ---------------------------------------------------------------------------
-- 3. Grant hardening
--    v1 did a one-time GRANT ALL ON ALL TABLES TO authenticated, which does NOT
--    cover tables created afterwards (the v2 partitioned events/engagement_log,
--    rollups, queues). Re-affirm DML for authenticated (RLS still constrains it)
--    and set DEFAULT PRIVILEGES so future tables are covered. Then strip all
--    write access from anon, which reaches only the few explicitly-public tables.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I', schemaname, tablename) AS t
    FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM anon', r.t);
  END LOOP;
END$$;

-- service-role-only tables: keep them off the authenticated grant surface
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.idempotency_keys','public.rtm_idempotency','public.job_queue','public._partition_policy'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON %s FROM authenticated, anon', t);
    END IF;
  END LOOP;
END$$;

-- Re-affirm the intended public (anon) surfaces — these rely on their own
-- policies from v1 scripts 14 / 18 / 46. Grant only what those need.
DO $$
BEGIN
  IF to_regclass('public.forms') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.forms TO anon';
  END IF;
  IF to_regclass('public.form_submissions') IS NOT NULL THEN
    EXECUTE 'GRANT INSERT ON public.form_submissions TO anon';
  END IF;
  IF to_regclass('public.landing_pages') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.landing_pages TO anon';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4. Observability helper — top time-consuming statements
-- ---------------------------------------------------------------------------
-- Operator-only (owned by postgres, NOT granted to authenticated/anon — the raw
-- statement text would leak cross-tenant query shapes).
CREATE OR REPLACE VIEW public.perf_slow_queries AS
SELECT
  round(total_exec_time::numeric, 1)              AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)               AS mean_ms,
  round((100 * total_exec_time / nullif(sum(total_exec_time) OVER (), 0))::numeric, 1) AS pct,
  rows,
  regexp_replace(left(query, 240), '\s+', ' ', 'g') AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 50;

REVOKE ALL ON public.perf_slow_queries FROM authenticated, anon;

DO $$ BEGIN RAISE NOTICE 'v2/58 complete: autovacuum/fillfactor tuned, role timeouts set, anon writes revoked, perf view added.'; END $$;
