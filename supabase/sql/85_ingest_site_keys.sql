-- =============================================================================
-- MARBEE — 85: INGEST AUTH (Phase 0 · SEC-02, SEC-04 follow-up)
--
-- 1. verify_api_key() was declared STABLE but performs an UPDATE (last_used_at),
--    which Postgres rejects at runtime ("UPDATE is not allowed in a non-volatile
--    function") — so every VALID API key errored in tenant-api / rtm-ingest.
--    Re-created as VOLATILE with the same body (bcrypt compare unchanged).
-- 2. web_analytics_sites.site_id becomes globally unique, so a public site key
--    can only ever resolve to one tenant.
-- 3. resolve_ingest_site(): one server-side check for every public (browser)
--    ingest endpoint — site_id + write_key + site status + allowed origin.
--    Returns the tenant/environment taken from the site row, never from the caller.
--
-- Additive / replace-only. Safe to re-run. Run after 01–84. Staging first.
-- Rollback block at the bottom.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. verify_api_key: STABLE → VOLATILE (body identical to 46_api_hub.sql)
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
      UPDATE public.api_keys SET last_used_at = NOW() WHERE id = v_row.id;
      RETURN QUERY
      SELECT v_row.id, v_row.tenant_id, v_row.environment, v_row.scopes;
      RETURN;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_api_key(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_api_key(TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Globally unique public site ids  (skipped if 50_web_analytics_platform.sql
--    hasn't been run on this database — re-run 85 after running 50)
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_dupes TEXT;
BEGIN
  IF to_regclass('public.web_analytics_sites') IS NULL THEN
    RAISE NOTICE '85: public.web_analytics_sites not found (script 50 not applied) — site-key index skipped. verify_api_key fix applied.';
    RETURN;
  END IF;
  EXECUTE 'SELECT string_agg(site_id, '', '') FROM (SELECT site_id FROM public.web_analytics_sites GROUP BY site_id HAVING count(*) > 1) d'
    INTO v_dupes;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate web_analytics_sites.site_id values: % — rename or archive duplicates, then re-run 85.', v_dupes;
  END IF;
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS web_analytics_sites_site_id_unique ON public.web_analytics_sites (site_id)';
END $$;

-- -----------------------------------------------------------------------------
-- 3. Host normalisation + site key resolution
-- -----------------------------------------------------------------------------
-- 'https://WWW.Example.com:443/path' → 'www.example.com:443'; 'example.com/' → 'example.com'
CREATE OR REPLACE FUNCTION public._ingest_host(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(lower(split_part(regexp_replace(trim(coalesce(p, '')), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''), '/', 1)), '');
$$;

-- Does host h match allowed entry e?  'example.com' matches exactly;
-- '*.example.com' matches any subdomain (not the apex); ports must match when given.
CREATE OR REPLACE FUNCTION public._ingest_host_matches(h TEXT, e TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN h IS NULL OR e IS NULL THEN FALSE
    WHEN left(e, 2) = '*.' THEN h LIKE '%.' || substr(e, 3) AND h <> substr(e, 3)
    ELSE h = e
  END;
$$;

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

REVOKE EXECUTE ON FUNCTION public.resolve_ingest_site(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ingest_site(TEXT, TEXT, TEXT) TO service_role;

-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.resolve_ingest_site(TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public._ingest_host_matches(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public._ingest_host(TEXT);
-- DROP INDEX IF EXISTS public.web_analytics_sites_site_id_unique;
-- (verify_api_key: leave VOLATILE — reverting re-breaks valid API keys.)
