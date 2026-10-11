-- Extend get_my_access with per-environment instance delete flags
-- Run after 44_role_management.sql

CREATE OR REPLACE FUNCTION public.get_my_access(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_slug TEXT;
  v_role_name TEXT;
  v_role_id UUID;
  v_perms JSONB;
  v_settings JSONB;
  v_instance JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant_access(p_tenant_id) THEN
    RETURN jsonb_build_object('permissions', '[]'::JSONB);
  END IF;

  SELECT r.slug, r.name, r.id, tu.settings
  INTO v_role_slug, v_role_name, v_role_id, v_settings
  FROM public.tenant_users tu
  JOIN public.roles r ON r.id = tu.role_id
  WHERE tu.user_id = auth.uid()
    AND tu.tenant_id = p_tenant_id
    AND tu.status = 'active';

  IF v_role_slug = 'tenant_admin' THEN
    SELECT COALESCE(jsonb_agg(p.slug ORDER BY p.category, p.slug), '[]'::JSONB)
    INTO v_perms
    FROM public.permissions p;
  ELSE
    SELECT COALESCE(jsonb_agg(p.slug ORDER BY p.category, p.slug), '[]'::JSONB)
    INTO v_perms
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id;
  END IF;

  v_instance := public.sanitize_member_settings(v_settings)->'instance_access';

  RETURN jsonb_build_object(
    'role_slug', v_role_slug,
    'role_name', v_role_name,
    'role_id', v_role_id,
    'permissions', v_perms,
    'is_admin', v_role_slug = 'tenant_admin',
    'instance_access', v_instance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_access(UUID) TO authenticated;
