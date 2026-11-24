-- =============================================================================
-- Verify sql/91 (TD-12) on a live project — safe, self-cleaning.
-- Creates a throwaway workspace "[TEST] TD-12 suspension check", makes the oldest
-- user its admin, checks access as that user while active and while suspended,
-- then deletes the throwaway workspace. Your real workspaces are never suspended.
-- Run in the SQL editor AFTER 91. Expected: every row says PASS.
-- =============================================================================
CREATE TEMP TABLE IF NOT EXISTS td12_results (n int, check_name text, result text);
TRUNCATE td12_results;

DO $$
DECLARE
  v_uid    uuid := (SELECT id FROM auth.users ORDER BY created_at LIMIT 1);
  v_tenant uuid := gen_random_uuid();
  v_role   uuid := gen_random_uuid();
  v_real   uuid;
  b1 boolean; b2 boolean; b3 boolean; n1 int; n2 int;
BEGIN
  SELECT tu.tenant_id INTO v_real FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id
  WHERE tu.user_id = v_uid AND tu.status = 'active' AND t.status <> 'suspended' LIMIT 1;

  INSERT INTO public.tenants (id, name, slug, status) VALUES (v_tenant, '[TEST] TD-12 suspension check', 'td12-check-' || left(v_tenant::text, 8), 'active');
  INSERT INTO public.roles (id, tenant_id, name, slug) VALUES (v_role, v_tenant, 'Tenant Admin', 'tenant_admin');
  INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status) VALUES (v_tenant, v_uid, v_role, 'active');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  -- Active
  SET LOCAL ROLE authenticated;
  SELECT public.user_has_tenant_access(v_tenant), public.user_has_permission(v_tenant, 'access.manage'),
         (SELECT count(*) FROM public.tenants WHERE id = v_tenant) = 1
    INTO b1, b2, b3;
  RESET ROLE;
  INSERT INTO td12_results VALUES (1, 'Active workspace: member has access', CASE WHEN b1 AND b2 AND b3 THEN 'PASS' ELSE 'FAIL' END);

  -- Suspended
  UPDATE public.tenants SET status = 'suspended' WHERE id = v_tenant;
  SET LOCAL ROLE authenticated;
  SELECT public.user_has_tenant_access(v_tenant), public.user_has_permission(v_tenant, 'access.manage'),
         (SELECT count(*) FROM public.tenants WHERE id = v_tenant) = 0
    INTO b1, b2, b3;
  SELECT count(*) INTO n1 FROM public.roles WHERE tenant_id = v_tenant;
  SELECT count(*) INTO n2 FROM public.tenant_users WHERE tenant_id = v_tenant;
  RESET ROLE;
  INSERT INTO td12_results VALUES (2, 'Suspended: access and permission checks refuse', CASE WHEN NOT b1 AND NOT b2 THEN 'PASS' ELSE 'FAIL' END);
  INSERT INTO td12_results VALUES (3, 'Suspended: member sees no rows of that workspace', CASE WHEN b3 AND n1 = 0 AND n2 = 0 THEN 'PASS' ELSE 'FAIL' END);
  INSERT INTO td12_results VALUES (4, 'Suspended: edge-function permission check refuses',
    CASE WHEN NOT public.user_has_permission_as(v_uid, v_tenant, 'access.manage') THEN 'PASS' ELSE 'FAIL' END);

  IF v_real IS NOT NULL THEN
    SET LOCAL ROLE authenticated;
    SELECT public.user_has_tenant_access(v_real) INTO b1;
    RESET ROLE;
    INSERT INTO td12_results VALUES (5, 'Same user keeps access to their real workspace', CASE WHEN b1 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- Reactivated
  UPDATE public.tenants SET status = 'active' WHERE id = v_tenant;
  SET LOCAL ROLE authenticated;
  SELECT public.user_has_tenant_access(v_tenant) INTO b1;
  RESET ROLE;
  INSERT INTO td12_results VALUES (6, 'Reactivated: access restored', CASE WHEN b1 THEN 'PASS' ELSE 'FAIL' END);

  -- Clean up the throwaway workspace
  DELETE FROM public.tenant_users WHERE tenant_id = v_tenant;
  DELETE FROM public.roles WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants WHERE id = v_tenant;
  INSERT INTO td12_results VALUES (7, 'Throwaway workspace removed',
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant) THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT n, check_name, result FROM td12_results ORDER BY n;
