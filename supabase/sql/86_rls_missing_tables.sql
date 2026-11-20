-- =============================================================================
-- MARBEE — 86: ROW-LEVEL SECURITY FOR TABLES THAT HAD NONE   (SEC-17, Phase 0)
--
-- Found 2026-11-20 by auditing every table the full script chain creates
-- (supabase/tests/sql/rls_audit.mjs). These tenant tables were created without RLS:
--   49: coupon_campaigns, coupon_codes, voice_agents, autonomous_agent_tasks
--   50: web_analytics_sites, web_analytics_events, web_analytics_sessions
-- Supabase grants table access to anon/authenticated by default, so with RLS off,
-- anyone holding the public app key could read/modify every tenant's rows
-- (incl. redeemable coupon codes). On projects where Supabase auto-enabled RLS the
-- tables were instead unusable from the app (no policies) — e.g. "Add website" failed.
--
-- Fix: RLS on, one tenant-isolation policy per table (same rule as the rest of the
-- schema: tenant_id IN user_tenant_ids()), anon gets nothing, authenticated gets
-- only what RLS allows. Ingest edge functions use the service role and are unaffected.
--
-- Safe to re-run. Run after 01–85. Rollback at the bottom.
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['coupon_campaigns', 'coupon_codes', 'voice_agents', 'autonomous_agent_tasks',
                           'web_analytics_sites', 'web_analytics_events', 'web_analytics_sessions'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '86: table public.% not found — skipped (run its creating script first, then re-run 86)', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated
         USING (tenant_id IN (SELECT public.user_tenant_ids()))
         WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Partitions of web_analytics_events (if v2/53 partitioned it) inherit the parent's
-- policies for queries through the parent; direct access to child partitions is
-- closed off too, in case any exist.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname IN ('web_analytics_events', 'web_analytics_sessions') AND p.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

-- =============================================================================
-- ROLLBACK (manual — re-opens the security hole; only for emergencies)
-- =============================================================================
-- DO $$ DECLARE t TEXT; BEGIN
--   FOREACH t IN ARRAY ARRAY['coupon_campaigns','coupon_codes','voice_agents','autonomous_agent_tasks',
--                            'web_analytics_sites','web_analytics_events','web_analytics_sessions'] LOOP
--     EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--   END LOOP; END $$;
