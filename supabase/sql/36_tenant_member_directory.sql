-- Tenant member directory for assignable campaign roles (owner / developer)
-- Run in Supabase SQL Editor (safe to re-run)

CREATE OR REPLACE FUNCTION public.list_tenant_members(p_tenant_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  role_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tu.user_id,
    p.email,
    p.name,
    r.name AS role_name
  FROM public.tenant_users tu
  JOIN public.profiles p ON p.id = tu.user_id
  JOIN public.roles r ON r.id = tu.role_id
  WHERE tu.tenant_id = p_tenant_id
    AND tu.status = 'active'
    AND tu.tenant_id IN (SELECT public.user_tenant_ids());
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_members(UUID) TO authenticated;
