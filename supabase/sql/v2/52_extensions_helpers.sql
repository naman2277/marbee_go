-- =============================================================================
-- MARBEE v2 REVAMP — PART 52: EXTENSIONS + FAST TENANT-CONTEXT HELPERS
-- Run AFTER 01..51. Safe to re-run (idempotent).
--
-- What this does
--   1. Enables the extensions the scale plan needs (pg_stat_statements, pg_trgm,
--      btree_gin, and — if available on this instance — pg_cron / pgmq / pg_partman).
--   2. Adds public.uuid_generate_v7() — time-ordered UUIDs for high-insert tables
--      (kills the random-UUIDv4 index-fragmentation problem).
--   3. Adds a JWT-first tenant/permission context:
--        - public.custom_access_token_hook(jsonb)  -> injects tenant_id/role/perms
--        - auth.tenant_id() / auth.jwt_role() / auth.has_perm(text)
--      and REWRITES the existing helpers (user_tenant_ids, current_tenant_id,
--      user_has_permission, user_is_tenant_admin) to read the JWT claim FIRST and
--      only fall back to a table lookup when the claim is absent.
--      => every existing RLS policy of the form
--           tenant_id IN (SELECT public.user_tenant_ids())
--         becomes a single-value, no-table-access InitPlan. No policy edits needed.
--   4. Adds public._ensure_time_partitions() — native monthly partition maintenance
--      used by 53_partitioning.sql (no hard dependency on pg_partman).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gin     WITH SCHEMA extensions;

-- Optional / infra extensions — enabled here if the instance allows it, otherwise
-- 56/57 degrade gracefully. On Supabase these may need a one-time Dashboard toggle
-- (Database -> Extensions) for pg_cron / pg_net; pgmq ships enabled on recent images.
DO $$
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron; EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not enabled (%). 57_cron.sql will no-op; enable it in the Dashboard.', SQLERRM; END;
  BEGIN CREATE EXTENSION IF NOT EXISTS pgmq;    EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgmq not enabled (%). 56_queues will create a fallback table queue.', SQLERRM; END;
END$$;

-- -----------------------------------------------------------------------------
-- 2. Time-ordered UUID (RFC 9562 v7). PG15-compatible (no core uuidv7() yet).
--    Ordering is guaranteed by the 48-bit ms timestamp prefix.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE PARALLEL SAFE
AS $fn$
DECLARE
  v_bytes bytea;
BEGIN
  -- start from a random v4, overlay the top 48 bits with unix-ms
  v_bytes := overlay(
    uuid_send(gen_random_uuid())
    PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
    FROM 1 FOR 6
  );
  -- set the 4-bit version field (bits 48..51) to 0111 = 7
  v_bytes := set_bit(v_bytes, 48, 0);
  v_bytes := set_bit(v_bytes, 49, 1);
  v_bytes := set_bit(v_bytes, 50, 1);
  v_bytes := set_bit(v_bytes, 51, 1);
  -- variant bits (byte 8) are already 10xx from gen_random_uuid()
  RETURN encode(v_bytes, 'hex')::uuid;
END;
$fn$;
COMMENT ON FUNCTION public.uuid_generate_v7() IS
  'Time-ordered UUID for high-insert tables. Use as column DEFAULT instead of gen_random_uuid().';

-- extract the embedded timestamp (handy for retention / debugging)
CREATE OR REPLACE FUNCTION public.uuid_v7_timestamp(p_uuid uuid)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT to_timestamp(
    ('x' || substr(replace(p_uuid::text, '-', ''), 1, 12))::bit(48)::bigint / 1000.0
  );
$$;

-- -----------------------------------------------------------------------------
-- 3a. JWT-only accessors (STABLE, zero table access). Kept in `public` so no
--     CREATE privilege on the `auth` schema is required. `auth.tenant_id()` is
--     also provided as a thin alias for policy readability where `auth` is writable.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jwt_claims()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
           coalesce(
             public.jwt_claims() ->> 'tenant_id',
             public.jwt_claims() -> 'app_metadata' ->> 'tenant_id'
           ), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
           public.jwt_claims() ->> 'app_role',
           public.jwt_claims() -> 'app_metadata' ->> 'role'
         );
$$;

CREATE OR REPLACE FUNCTION public.jwt_has_perm(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT coalesce((public.jwt_claims() -> 'perms') ? p_perm, false);
$$;

GRANT EXECUTE ON FUNCTION public.jwt_claims(), public.jwt_tenant_id(),
                          public.jwt_role(), public.jwt_has_perm(text)
  TO authenticated, anon, service_role;

-- Optional convenience alias in the auth schema (skipped if not writable here).
DO $$
BEGIN
  EXECUTE 'CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT public.jwt_tenant_id() $f$';
  EXECUTE 'GRANT EXECUTE ON FUNCTION auth.tenant_id() TO authenticated, anon, service_role';
EXCEPTION WHEN insufficient_privilege OR undefined_schema THEN
  RAISE NOTICE 'auth.tenant_id() alias not created (auth schema not writable) — use public.jwt_tenant_id().';
END$$;

-- -----------------------------------------------------------------------------
-- 3b. Custom Access Token hook — stamps tenant_id / app_role / perms into the JWT
--     Registered in supabase/config.toml:
--       [auth.hook.custom_access_token]
--       enabled = true
--       uri = "pg-functions://postgres/public/custom_access_token_hook"
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := (event ->> 'user_id')::uuid;
  v_tenant     uuid;
  v_role_slug  text;
  v_perms      jsonb;
  v_claims     jsonb := coalesce(event -> 'claims', '{}'::jsonb);
BEGIN
  -- Pick the user's active tenant. If they belong to several, prefer the one
  -- pinned in their membership settings (active_tenant_id), else the most
  -- recently created membership. The settings value is validated as a uuid
  -- text before comparison so a bad value can never break token issuance.
  SELECT tu.tenant_id, r.slug
    INTO v_tenant, v_role_slug
  FROM public.tenant_users tu
  JOIN public.roles r ON r.id = tu.role_id
  WHERE tu.user_id = v_uid
    AND tu.status = 'active'
  ORDER BY
    (coalesce(tu.settings ->> 'active_tenant_id', '') ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (tu.settings ->> 'active_tenant_id') = tu.tenant_id::text) DESC,
    tu.created_at DESC
  LIMIT 1;

  IF v_tenant IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(DISTINCT p.slug), '[]'::jsonb)
      INTO v_perms
    FROM public.tenant_users tu
    JOIN public.role_permissions rp ON rp.role_id = tu.role_id
    JOIN public.permissions p       ON p.id = rp.permission_id
    WHERE tu.user_id = v_uid AND tu.tenant_id = v_tenant AND tu.status = 'active';

    v_claims := v_claims
      || jsonb_build_object('tenant_id', v_tenant)
      || jsonb_build_object('app_role', coalesce(v_role_slug, 'member'))
      || jsonb_build_object('perms', coalesce(v_perms, '[]'::jsonb));
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
DO $$
BEGIN
  EXECUTE 'GRANT USAGE ON SCHEMA public TO supabase_auth_admin';
  EXECUTE 'GRANT SELECT ON public.tenant_users, public.roles, public.role_permissions, public.permissions TO supabase_auth_admin';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'supabase_auth_admin role not present (non-Supabase Postgres) — skipping hook grants.';
END$$;

-- -----------------------------------------------------------------------------
-- 3c. Rewrite existing helpers: JWT fast-path, table fallback.
--     Signatures unchanged => every current RLS policy keeps working, but the
--     common single-tenant session no longer touches tenant_users at all.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_claim text := public.jwt_claims() ->> 'tenant_id';
BEGIN
  IF v_claim IS NOT NULL AND v_claim <> '' THEN
    RETURN NEXT v_claim::uuid;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT tu.tenant_id
    FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid() AND tu.status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    public.jwt_tenant_id(),
    (SELECT tu.tenant_id FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid() AND tu.status = 'active'
      ORDER BY tu.created_at DESC LIMIT 1)
  );
$$;

-- user_has_permission(p_tenant_id uuid, p_permission text): check the JWT perms
-- array first (only valid when the JWT is scoped to that same tenant).
CREATE OR REPLACE FUNCTION public.user_has_permission(p_tenant_id uuid, p_permission text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_claims jsonb := public.jwt_claims();
BEGIN
  IF (v_claims ->> 'tenant_id')::uuid IS NOT DISTINCT FROM p_tenant_id
     AND v_claims ? 'perms' THEN
    RETURN (v_claims -> 'perms') ? p_permission
        OR coalesce(v_claims ->> 'app_role', '') = 'tenant_admin';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    JOIN public.role_permissions rp ON rp.role_id = tu.role_id
    JOIN public.permissions pm      ON pm.id = rp.permission_id
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = p_tenant_id
      AND tu.status = 'active'
      AND pm.slug = p_permission
  ) OR EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    JOIN public.roles r ON r.id = tu.role_id
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = p_tenant_id
      AND tu.status = 'active'
      AND r.slug = 'tenant_admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_claims jsonb := public.jwt_claims();
BEGIN
  IF (v_claims ->> 'tenant_id')::uuid IS NOT DISTINCT FROM p_tenant_id THEN
    RETURN coalesce(v_claims ->> 'app_role', '') = 'tenant_admin';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_users tu
    JOIN public.roles r ON r.id = tu.role_id
    WHERE tu.user_id = auth.uid() AND tu.tenant_id = p_tenant_id
      AND tu.status = 'active' AND r.slug = 'tenant_admin'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3d. Cross-tenant write guard for denormalized child tables (used by 54).
--     Fills tenant_id from the parent when omitted; rejects a mismatch.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_inherit_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_table text := TG_ARGV[0];   -- e.g. 'public.journeys'
  v_local_fk     text := TG_ARGV[1];   -- e.g. 'journey_id'
  v_parent_tenant uuid;
BEGIN
  EXECUTE format('SELECT tenant_id FROM %s WHERE id = $1', v_parent_table)
    INTO v_parent_tenant USING (to_jsonb(NEW) ->> v_local_fk)::uuid;

  IF v_parent_tenant IS NULL THEN
    RETURN NEW; -- parent row gone / FK will handle it
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_parent_tenant;
  ELSIF NEW.tenant_id <> v_parent_tenant THEN
    RAISE EXCEPTION 'tenant_id %/% does not match parent % tenant %',
      NEW.tenant_id, v_local_fk, v_parent_table, v_parent_tenant
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Native monthly partition maintenance (no pg_partman dependency).
--    Creates the current month +N ahead, plus optional retention drop.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ensure_time_partitions(
  p_parent      regclass,
  p_months_ahead int  DEFAULT 3,
  p_retain_months int DEFAULT NULL   -- NULL = keep everything
)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_parent_rel text := (SELECT relname FROM pg_class WHERE oid = p_parent);
  v_base        date := date_trunc('month', now())::date;
  v_from        date;
  v_to          date;
  v_child       text;
  v_i           int;
  r             record;
BEGIN
  FOR v_i IN 0 .. p_months_ahead LOOP
    v_from := (v_base + (v_i || ' month')::interval)::date;
    v_to   := (v_from + interval '1 month')::date;
    v_child := format('%s_p%s', v_parent_rel, to_char(v_from, 'YYYYMM'));
    IF to_regclass(format('public.%I', v_child)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
        v_child, p_parent::text, v_from, v_to);
    END IF;
  END LOOP;

  IF p_retain_months IS NOT NULL THEN
    FOR r IN
      SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c    ON c.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.inhparent = p_parent
        AND n.nspname = 'public'
        AND c.relname ~ '_p[0-9]{6}$'
        AND to_date(right(c.relname, 6), 'YYYYMM')
            < (v_base - (p_retain_months || ' month')::interval)::date
    LOOP
      EXECUTE format('DROP TABLE IF EXISTS public.%I', r.relname);
      RAISE NOTICE 'dropped aged partition public.%', r.relname;
    END LOOP;
  END IF;
END;
$fn$;

-- Registry so 57_cron.sql knows what to maintain and how long to keep it.
CREATE TABLE IF NOT EXISTS public._partition_policy (
  parent          text PRIMARY KEY,
  months_ahead    int  NOT NULL DEFAULT 3,
  retain_months   int,
  partition_key   text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.partition_health AS
SELECT
  pp.parent,
  pp.retain_months,
  count(c.*)                                   AS partition_count,
  min(right(c.relname, 6))                     AS oldest_yyyymm,
  max(right(c.relname, 6))                     AS newest_yyyymm,
  (max(right(c.relname, 6)) >= to_char(now() + interval '1 month', 'YYYYMM')) AS has_future_partition
FROM public._partition_policy pp
LEFT JOIN pg_class pc  ON pc.relname = split_part(pp.parent, '.', 2)
LEFT JOIN pg_inherits i ON i.inhparent = pc.oid
LEFT JOIN pg_class c    ON c.oid = i.inhrelid AND c.relname ~ '_p[0-9]{6}$'
GROUP BY pp.parent, pp.retain_months;

DO $$ BEGIN RAISE NOTICE 'v2/52 complete: extensions, uuid_generate_v7(), JWT-fast tenant context, partition maintenance.'; END $$;
