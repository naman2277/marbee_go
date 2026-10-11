-- =============================================================================
-- MARBEE v2 — RLS ISOLATION + PARTITIONING SMOKE TEST
-- Run with psql against a database that has 01..51 + v2/52..58 applied.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/sql/v2/tests/rls_isolation.sql
-- Exits non-zero on the first failed assertion.
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

-- two throwaway tenants + customers
INSERT INTO public.tenants (id, name, slug, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','RLS A','rls-test-a','active'),
       ('bbbbbbbb-0000-0000-0000-000000000002','RLS B','rls-test-b','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers (tenant_id, environment, email, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','production','a@rls.test','active'),
       ('bbbbbbbb-0000-0000-0000-000000000002','production','b@rls.test','active');

-- ---- act as an authenticated user whose JWT is scoped to tenant A ----------
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","tenant_id":"aaaaaaaa-0000-0000-0000-000000000001","app_role":"tenant_admin","perms":["customers.read","customers.write"]}';

DO $$
DECLARE v_a int; v_b int;
BEGIN
  SELECT count(*) INTO v_a FROM public.customers WHERE email = 'a@rls.test';
  SELECT count(*) INTO v_b FROM public.customers WHERE email = 'b@rls.test';
  ASSERT v_a = 1, 'tenant A should see its own customer';
  ASSERT v_b = 0, 'tenant A must NOT see tenant B customer (leak!)';
  RAISE NOTICE 'PASS: read isolation';
END$$;

-- write into another tenant must be rejected by the policy WITH CHECK
DO $$
BEGIN
  BEGIN
    INSERT INTO public.customers (tenant_id, environment, email, status)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002','production','evil@rls.test','active');
    RAISE EXCEPTION 'FAIL: cross-tenant insert was allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'PASS: cross-tenant write blocked (%)' , SQLERRM;
  END;
END$$;

-- jwt_tenant_id() resolves from the claim, no table hit
DO $$
BEGIN
  ASSERT public.jwt_tenant_id() = 'aaaaaaaa-0000-0000-0000-000000000001', 'jwt_tenant_id() from JWT';
  ASSERT (SELECT count(*) FROM public.user_tenant_ids()) = 1, 'user_tenant_ids() single value from JWT';
  ASSERT public.user_has_permission('aaaaaaaa-0000-0000-0000-000000000001','customers.read'), 'perm from JWT';
  RAISE NOTICE 'PASS: JWT-fast context helpers';
END$$;

RESET role;

-- ---- partitioning smoke -------------------------------------------------
DO $$
DECLARE v_parts int;
BEGIN
  SELECT count(*) INTO v_parts
  FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
  WHERE i.inhparent = 'public.events'::regclass;
  ASSERT v_parts >= 2, 'events should have >= 2 partitions (default + monthly)';

  ASSERT EXISTS (SELECT 1 FROM public.partition_health WHERE parent = 'public.events' AND has_future_partition),
    'events must have a future-month partition ready';
  RAISE NOTICE 'PASS: events partitioned with lookahead (% partitions)', v_parts;
END$$;

-- rollups match source
SELECT public.refresh_rollups(now() - interval '2 days');
DO $$
DECLARE v_roll bigint; v_raw bigint;
BEGIN
  SELECT coalesce(sum(sent),0) INTO v_roll FROM public.rollup_engagement_daily
   WHERE channel = 'all' AND day = CURRENT_DATE;
  SELECT count(*) INTO v_raw FROM public.engagement_log
   WHERE event = 'sent' AND "timestamp" >= CURRENT_DATE;
  ASSERT v_roll = v_raw, format('rollup sent (%) must equal raw sent (%)', v_roll, v_raw);
  RAISE NOTICE 'PASS: rollup == source';
END$$;

ROLLBACK;   -- leave no test data behind
\echo 'ALL RLS / PARTITION / ROLLUP ASSERTIONS PASSED'
