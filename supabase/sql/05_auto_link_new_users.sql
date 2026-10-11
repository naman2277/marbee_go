-- =============================================================================
-- MARBEE — PART 5: AUTO-LINK NEW USERS TO DEMO TENANT
-- Run once after 01 + 02. New signups get Tenant Admin on Demo Organization.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_demo_tenant UUID := '00000000-0000-0000-0000-000000000001';
  v_admin_role UUID := '10000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1))
  );

  -- Auto-assign to demo tenant (P1 bootstrap; replace with org creation flow in P2)
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = v_demo_tenant) THEN
    INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status)
    VALUES (v_demo_tenant, NEW.id, v_admin_role, 'active')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Link any existing users who signed up before this script
INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status)
SELECT
  '00000000-0000-0000-0000-000000000001',
  u.id,
  '10000000-0000-0000-0000-000000000001',
  'active'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = u.id
)
ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active';

-- Ensure profiles exist for existing auth users
INSERT INTO public.profiles (id, email, name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
