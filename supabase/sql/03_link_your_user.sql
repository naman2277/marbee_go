-- =============================================================================
-- MARBEE — PART 3: LINK YOUR USER TO DEMO TENANT
-- Run this AFTER you sign up in the Marbee app (or Supabase Auth)
--
-- STEP 1: Replace 'your-email@example.com' below with your actual login email
-- STEP 2: Run this script in Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
  v_role_id UUID := '10000000-0000-0000-0000-000000000001'; -- Tenant Admin
BEGIN
  -- ⚠️ CHANGE THIS EMAIL to the one you used to sign up
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'your-email@example.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found. Sign up first, then update the email in this script.';
  END IF;

  INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status)
  VALUES (v_tenant_id, v_user_id, v_role_id, 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active';

  RAISE NOTICE 'Linked user % to Demo Organization as Tenant Admin', v_user_id;
END $$;

-- Verify it worked:
SELECT
  u.email,
  t.name AS tenant,
  r.name AS role,
  tu.status
FROM public.tenant_users tu
JOIN auth.users u ON u.id = tu.user_id
JOIN public.tenants t ON t.id = tu.tenant_id
JOIN public.roles r ON r.id = tu.role_id;
