-- =============================================================================
-- 91 — Enforce workspace (tenant) suspension   (Phase 0 · TD-12)
--
-- Problem: the Platform Console can set tenants.status = 'suspended', but nothing
-- checked it — members of a suspended workspace kept full access, its API keys and
-- website keys kept accepting data, and its scheduled pipelines kept running.
--
-- What "suspended" means after this script:
--   • Members: no access at all (app, RLS, edge functions). Immediate — the access
--     helpers check the tenant on every request, so no wait for token refresh.
--   • API keys / website keys: refused (the key simply stops verifying).
--   • Engine: no new scheduled runs; queued and waiting runs are HELD (not cancelled)
--     and continue automatically if the workspace is reactivated.
--   • Data is kept. The Platform Console (service role) still sees everything.
--   • 'trial' and 'active' workspaces are unaffected.
--
-- How: one helper, tenant_is_active(), and every tenant-access helper now requires
-- it. All RLS policies and permission checks go through these helpers (verified:
-- no policy reads tenant_users directly), so this covers the whole schema.
--
-- Functions replaced (bodies identical to their latest version + the tenant check):
--   user_tenant_ids (01), user_has_tenant_access (01), user_is_tenant_admin (37),
--   user_has_permission (37), user_has_permission_as (38), verify_api_key (85),
--   resolve_ingest_site (85), enqueue_due_pipeline_runs (61),
--   sweep_queued_pipeline_runs (61), resume_waiting_pipeline_runs (73).
--
-- Order: run after 01–90. The v2 scale layer (supabase/sql/v2) must run AFTER this
-- script; v2/52 carries the same suspension checks in its JWT fast path.
-- Safe to re-run. Rollback: bottom of file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The one check
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_is_active(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Unknown tenant → false. Only 'suspended' is blocked ('trial' and 'active' pass).
  SELECT COALESCE((SELECT t.status <> 'suspended' FROM public.tenants t WHERE t.id = p_tenant_id), FALSE);
$$;
REVOKE ALL ON FUNCTION public.tenant_is_active(UUID) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.tenant_is_active(UUID) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.tenant_is_active(UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Tenant-access helpers (used by every RLS policy and permission check)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_tenant_ids()
RETURNS SETOF UUID AS $$
  SELECT tu.tenant_id
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id AND t.status <> 'suspended'
  WHERE tu.user_id = auth.uid() AND tu.status = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    JOIN public.tenants t ON t.id = tu.tenant_id AND t.status <> 'suspended'
    WHERE tu.user_id = auth.uid() AND tu.tenant_id = p_tenant_id AND tu.status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    JOIN public.roles r ON r.id = tu.role_id
    JOIN public.tenants t ON t.id = tu.tenant_id AND t.status <> 'suspended'
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = p_tenant_id
      AND tu.status = 'active'
      AND r.slug = 'tenant_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_tenant_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_is_tenant_admin(p_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      JOIN public.role_permissions rp ON rp.role_id = tu.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      JOIN public.tenants t ON t.id = tu.tenant_id AND t.status <> 'suspended'
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = p_tenant_id
        AND tu.status = 'active'
        AND p.slug = p_permission
    );
$$;

-- Used by edge functions that act with the service role on a user's behalf.
CREATE OR REPLACE FUNCTION public.user_has_permission_as(
  p_user_id UUID,
  p_tenant_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.tenant_is_active(p_tenant_id) AND (
    EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      JOIN public.roles r ON r.id = tu.role_id
      WHERE tu.user_id = p_user_id
        AND tu.tenant_id = p_tenant_id
        AND tu.status = 'active'
        AND r.slug = 'tenant_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      JOIN public.role_permissions rp ON rp.role_id = tu.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE tu.user_id = p_user_id
        AND tu.tenant_id = p_tenant_id
        AND tu.status = 'active'
        AND p.slug = p_permission
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. API keys and website keys stop verifying for suspended workspaces
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_api_key(p_raw_key TEXT)
RETURNS TABLE (
  key_id UUID,
  tenant_id UUID,
  environment TEXT,
  scopes TEXT[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions  -- Supabase installs pgcrypto (crypt) in "extensions"
AS $$
DECLARE
  v_prefix TEXT;
  v_row public.api_keys%ROWTYPE;
BEGIN
  IF p_raw_key IS NULL OR length(trim(p_raw_key)) < 16 THEN
    RETURN;
  END IF;

  v_prefix := left(trim(p_raw_key), 8);

  FOR v_row IN
    SELECT *
    FROM public.api_keys ak
    WHERE ak.key_prefix = v_prefix
      AND ak.revoked_at IS NULL
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
  LOOP
    IF v_row.key_hash = crypt(trim(p_raw_key), v_row.key_hash) THEN
      IF NOT public.tenant_is_active(v_row.tenant_id) THEN
        RETURN;  -- suspended workspace: the key does not verify (callers answer 401)
      END IF;
      UPDATE public.api_keys SET last_used_at = NOW() WHERE id = v_row.id;
      RETURN QUERY
      SELECT v_row.id, v_row.tenant_id, v_row.environment, v_row.scopes;
      RETURN;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_api_key(TEXT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.verify_api_key(TEXT) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.verify_api_key(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_ingest_site(
  p_site_id   TEXT,
  p_write_key TEXT,
  p_origin    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  s       RECORD;  -- RECORD (not %ROWTYPE) so this function can be created before script 50
  v_host  TEXT := public._ingest_host(p_origin);
  v_ok    BOOLEAN := FALSE;
  v_entry TEXT;
  v_rows  INTEGER;
BEGIN
  IF coalesce(length(p_site_id), 0) NOT BETWEEN 4 AND 64 OR coalesce(length(p_write_key), 0) NOT BETWEEN 8 AND 128 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_key');
  END IF;

  IF to_regclass('public.web_analytics_sites') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sites_not_configured');
  END IF;

  EXECUTE 'SELECT id, site_id, tenant_id, environment, domain, allowed_origins, write_key, status
           FROM public.web_analytics_sites WHERE site_id = $1'
    INTO s USING p_site_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;  -- EXECUTE doesn't set FOUND
  -- Same answer for unknown site and wrong key: don't reveal which site ids exist.
  IF v_rows = 0 OR s.write_key IS DISTINCT FROM p_write_key THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_key');
  END IF;

  -- Only after the key matched, so this reveals nothing to someone without the key.
  IF NOT public.tenant_is_active(s.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tenant_suspended');
  END IF;

  IF s.status NOT IN ('active', 'pending_verification') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'site_' || s.status);
  END IF;

  -- No Origin header = server-side caller (still needs the write key). Browser
  -- calls must come from the site's domain or an allowed origin.
  IF v_host IS NOT NULL THEN
    v_ok := public._ingest_host_matches(v_host, public._ingest_host(s.domain))
         OR public._ingest_host_matches(v_host, 'www.' || public._ingest_host(s.domain));
    IF NOT v_ok THEN
      FOREACH v_entry IN ARRAY coalesce(s.allowed_origins, '{}') LOOP
        IF public._ingest_host_matches(v_host, public._ingest_host(v_entry))
           OR (left(trim(v_entry), 2) = '*.' AND public._ingest_host_matches(v_host, lower(trim(v_entry)))) THEN
          v_ok := TRUE;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF NOT v_ok THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'origin_not_allowed');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'site_uuid', s.id,
    'site_id', s.site_id,
    'tenant_id', s.tenant_id,
    'environment', s.environment,
    'status', s.status);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_ingest_site(TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.resolve_ingest_site(TEXT, TEXT, TEXT) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.resolve_ingest_site(TEXT, TEXT, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Engine: hold suspended workspaces' runs (never cancel them)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_due_pipeline_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job record;
  v_version_id uuid;
  v_n integer := 0;
BEGIN
  FOR v_job IN
    SELECT id, tenant_id, environment, current_version
    FROM public.data_jobs
    WHERE schedule_cron IS NOT NULL
      AND schedule_enabled
      AND next_run_at IS NOT NULL
      AND next_run_at <= now()
      AND public.tenant_is_active(data_jobs.tenant_id)   -- suspended: keep next_run_at, run later
      AND NOT EXISTS (
        SELECT 1 FROM public.data_job_runs r
        WHERE r.job_id = data_jobs.id AND r.status IN ('queued','running')
      )
    LIMIT 100
  LOOP
    SELECT id INTO v_version_id
    FROM public.data_job_versions
    WHERE job_id = v_job.id AND version_number = v_job.current_version;

    INSERT INTO public.data_job_runs
      (job_id, tenant_id, environment, version_id, version_number, status, trigger_source, run_mode)
    VALUES
      (v_job.id, v_job.tenant_id, v_job.environment, v_version_id, NULLIF(v_job.current_version, 0),
       'queued', 'schedule', 'full');

    UPDATE public.data_jobs
    SET last_run_at = now(), next_run_at = NULL
    WHERE id = v_job.id;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.enqueue_due_pipeline_runs() TO service_role;

CREATE OR REPLACE FUNCTION public.sweep_queued_pipeline_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, vault
AS $$
DECLARE
  v_url  text;
  v_key  text;
  v_run  record;
  v_n    integer := 0;
BEGIN
  IF to_regprocedure('public.recover_stale_pipeline_runs(integer)') IS NOT NULL THEN
    PERFORM public.recover_stale_pipeline_runs(900);
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'vault not available — configure the worker URL/key, skipping';
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'pipeline_worker_url / pipeline_worker_key not set in Vault, skipping';
    RETURN 0;
  END IF;

  FOR v_run IN
    SELECT r.id FROM public.data_job_runs r
    WHERE r.status = 'queued' AND r.queued_at < now() - interval '2 minutes'
      -- Held runs of suspended workspaces must not fill the batch and starve others.
      AND public.tenant_is_active(r.tenant_id)
    ORDER BY r.queued_at
    LIMIT 25
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('run_id', v_run.id)
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sweep_queued_pipeline_runs() TO service_role;

CREATE OR REPLACE FUNCTION public.resume_waiting_pipeline_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, vault
AS $$
DECLARE
  v_url  text;
  v_key  text;
  v_run  record;
  v_n    integer := 0;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_run IN
    SELECT r.id FROM public.data_job_runs r
    WHERE r.status = 'waiting'
      AND r.resume_at IS NOT NULL
      AND r.resume_at <= now()
      AND public.tenant_is_active(r.tenant_id)   -- suspended: stay 'waiting' until reactivated
    ORDER BY r.resume_at
    LIMIT 25
  LOOP
    UPDATE public.data_job_runs
    SET status = 'queued', queued_at = now()
    WHERE id = v_run.id AND status = 'waiting';

    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('run_id', v_run.id, 'resume', true)
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resume_waiting_pipeline_runs() TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Ordering note for databases that already have the v2 scale layer
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.custom_access_token_hook(jsonb)') IS NOT NULL THEN
    RAISE NOTICE 'v2 scale layer detected: now re-run supabase/sql/v2/52_extensions_helpers.sql to restore the JWT fast path (it includes the same suspension checks).';
  END IF;
END $$;

-- =============================================================================
-- Verify (expected: no rows from the first query; the second shows your workspaces)
--   SELECT p.proname FROM pg_proc p
--   WHERE p.pronamespace = 'public'::regnamespace
--     AND p.proname IN ('user_tenant_ids','user_has_tenant_access','user_is_tenant_admin',
--                       'user_has_permission','user_has_permission_as')
--     AND pg_get_functiondef(p.oid) NOT ILIKE '%suspended%'
--     AND pg_get_functiondef(p.oid) NOT ILIKE '%tenant_is_active%';
--   SELECT id, name, status FROM public.tenants ORDER BY created_at;
--
-- Rollback: re-create the previous versions by re-running ONLY these statements
-- from the earlier scripts (they are idempotent CREATE OR REPLACE):
--   01: user_tenant_ids, user_has_tenant_access
--   37: user_is_tenant_admin, user_has_permission
--   38: user_has_permission_as
--   85: verify_api_key, resolve_ingest_site
--   61: enqueue_due_pipeline_runs, sweep_queued_pipeline_runs
--   73: resume_waiting_pipeline_runs
-- then: DROP FUNCTION IF EXISTS public.tenant_is_active(UUID);
-- (Rollback re-opens access for suspended workspaces — only do it if this script
--  itself causes a problem.)
-- =============================================================================
