-- Create / update / delete tenant roles and permission sets
-- Run after 43_member_instance_access.sql

CREATE OR REPLACE FUNCTION public._require_roles_manage(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.user_has_permission(p_tenant_id, 'access.roles.manage')
    OR public.user_has_permission(p_tenant_id, 'access.manage')
  ) THEN
    RAISE EXCEPTION 'Permission denied — access.roles.manage required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._slugify_role_name(p_tenant_id UUID, p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
  v_suffix INT := 0;
BEGIN
  v_base := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '_', 'g'));
  v_base := trim(both '_' from v_base);
  IF v_base = '' THEN
    v_base := 'custom_role';
  END IF;
  v_base := left(v_base, 60);
  v_slug := v_base;

  WHILE EXISTS (
    SELECT 1 FROM public.roles
    WHERE tenant_id = p_tenant_id AND slug = v_slug
  ) LOOP
    v_suffix := v_suffix + 1;
    v_slug := left(v_base || '_' || v_suffix::text, 80);
  END LOOP;

  RETURN v_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public._set_role_permissions(
  p_role_id UUID,
  p_permission_slugs TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;

  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT p_role_id, p.id
  FROM public.permissions p
  WHERE p.slug = ANY(p_permission_slugs)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_role(
  p_tenant_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_permission_slugs TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := trim(p_name);
  v_description TEXT := NULLIF(trim(p_description), '');
  v_slug TEXT;
  v_role_id UUID;
BEGIN
  PERFORM public._require_roles_manage(p_tenant_id);

  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Role name must be between 2 and 80 characters';
  END IF;

  v_slug := public._slugify_role_name(p_tenant_id, v_name);

  INSERT INTO public.roles (tenant_id, name, slug, description, is_system)
  VALUES (p_tenant_id, v_name, v_slug, v_description, FALSE)
  RETURNING id INTO v_role_id;

  PERFORM public._set_role_permissions(v_role_id, COALESCE(p_permission_slugs, ARRAY[]::TEXT[]));

  RETURN v_role_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_role(
  p_tenant_id UUID,
  p_role_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_permission_slugs TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := trim(p_name);
  v_description TEXT := NULLIF(trim(p_description), '');
  v_slug TEXT;
  v_role RECORD;
BEGIN
  PERFORM public._require_roles_manage(p_tenant_id);

  SELECT id, slug, is_system INTO v_role
  FROM public.roles
  WHERE id = p_role_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Role name must be between 2 and 80 characters';
  END IF;

  IF v_role.slug = 'tenant_admin' THEN
    UPDATE public.roles
    SET
      name = v_name,
      description = v_description
    WHERE id = p_role_id;

    RETURN;
  END IF;

  UPDATE public.roles
  SET
    name = v_name,
    description = v_description
  WHERE id = p_role_id;

  PERFORM public._set_role_permissions(p_role_id, COALESCE(p_permission_slugs, ARRAY[]::TEXT[]));
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tenant_role(
  p_tenant_id UUID,
  p_role_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role RECORD;
  v_member_count INT;
  v_invite_count INT;
BEGIN
  PERFORM public._require_roles_manage(p_tenant_id);

  SELECT id, slug, is_system INTO v_role
  FROM public.roles
  WHERE id = p_role_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found';
  END IF;

  IF v_role.slug = 'tenant_admin' OR v_role.is_system THEN
    RAISE EXCEPTION 'System roles cannot be deleted';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id
    AND role_id = p_role_id
    AND status IN ('active', 'invited');

  IF v_member_count > 0 THEN
    RAISE EXCEPTION 'Role is assigned to % member(s). Reassign them first.', v_member_count;
  END IF;

  SELECT count(*) INTO v_invite_count
  FROM public.tenant_invites
  WHERE tenant_id = p_tenant_id
    AND role_id = p_role_id
    AND status = 'pending';

  IF v_invite_count > 0 THEN
    RAISE EXCEPTION 'Role is used by % pending invite(s). Revoke or reassign them first.', v_invite_count;
  END IF;

  DELETE FROM public.roles WHERE id = p_role_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tenant_role(UUID, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_role(UUID, UUID, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_role(UUID, UUID) TO authenticated;
