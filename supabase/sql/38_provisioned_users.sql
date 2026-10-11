-- =============================================================================
-- MARBEE — Provisioned users (admin creates account + email password setup)
-- Run after 37_access_management_rbac.sql
-- =============================================================================

ALTER TABLE public.tenant_invites
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS invite_kind TEXT NOT NULL DEFAULT 'link'
    CHECK (invite_kind IN ('link', 'provisioned')),
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_invites_auth_user
  ON public.tenant_invites (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

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
  SELECT EXISTS (
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
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_permission_as(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_permission_as(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.link_provisioned_tenant_user(
  p_tenant_id UUID,
  p_auth_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role_id UUID,
  p_invited_by UUID,
  p_invite_token TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_invite_id UUID;
  v_token TEXT := COALESCE(NULLIF(trim(p_invite_token), ''), replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.roles WHERE id = p_role_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Invalid role for tenant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_users tu
    JOIN public.profiles p ON p.id = tu.user_id
    WHERE tu.tenant_id = p_tenant_id
      AND lower(p.email) = v_email
      AND tu.status = 'active'
  ) THEN
    RAISE EXCEPTION 'User is already an active member of this workspace';
  END IF;

  UPDATE public.profiles
  SET name = COALESCE(NULLIF(trim(p_full_name), ''), name)
  WHERE id = p_auth_user_id;

  INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status)
  VALUES (p_tenant_id, p_auth_user_id, p_role_id, 'invited')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'invited';

  UPDATE public.tenant_invites
  SET status = 'revoked'
  WHERE tenant_id = p_tenant_id
    AND lower(email) = v_email
    AND status = 'pending';

  INSERT INTO public.tenant_invites (
    tenant_id, email, role_id, token, invited_by,
    full_name, invite_kind, auth_user_id, status
  )
  VALUES (
    p_tenant_id, v_email, p_role_id, v_token, p_invited_by,
    NULLIF(trim(p_full_name), ''), 'provisioned', p_auth_user_id, 'pending'
  )
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_provisioned_tenant_user(UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_provisioned_tenant_user(UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_provisioned_membership(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_activated INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(email) INTO v_user_email FROM public.profiles WHERE id = auth.uid();

  UPDATE public.tenant_users tu
  SET status = 'active'
  FROM public.tenant_invites ti
  WHERE tu.user_id = auth.uid()
    AND tu.status = 'invited'
    AND ti.auth_user_id = auth.uid()
    AND ti.invite_kind = 'provisioned'
    AND ti.status = 'pending'
    AND ti.tenant_id = tu.tenant_id
    AND lower(ti.email) = v_user_email
    AND (p_tenant_id IS NULL OR tu.tenant_id = p_tenant_id);

  GET DIAGNOSTICS v_activated = ROW_COUNT;

  UPDATE public.tenant_invites ti
  SET status = 'accepted', accepted_at = NOW(), accepted_by = auth.uid()
  WHERE ti.auth_user_id = auth.uid()
    AND ti.invite_kind = 'provisioned'
    AND ti.status = 'pending'
    AND lower(ti.email) = v_user_email
    AND (p_tenant_id IS NULL OR ti.tenant_id = p_tenant_id);

  RETURN jsonb_build_object('activated', v_activated, 'tenant_id', p_tenant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_provisioned_membership(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.list_tenant_members(UUID);

CREATE OR REPLACE FUNCTION public.list_tenant_members(p_tenant_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  role_id UUID,
  role_name TEXT,
  role_slug TEXT,
  status TEXT
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
    tu.role_id,
    r.name AS role_name,
    r.slug AS role_slug,
    tu.status
  FROM public.tenant_users tu
  JOIN public.profiles p ON p.id = tu.user_id
  JOIN public.roles r ON r.id = tu.role_id
  WHERE tu.tenant_id = p_tenant_id
    AND tu.status IN ('active', 'disabled', 'invited')
    AND tu.tenant_id IN (SELECT public.user_tenant_ids());
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_members(UUID) TO authenticated;

-- Must drop first: migration 37 used a narrower return type (no full_name / invite_kind).
DROP FUNCTION IF EXISTS public.list_tenant_invites(UUID);

CREATE OR REPLACE FUNCTION public.list_tenant_invites(p_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  invite_kind TEXT,
  role_name TEXT,
  role_slug TEXT,
  status TEXT,
  invited_by_email TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.user_has_permission(p_tenant_id, 'access.manage')
    OR public.user_has_permission(p_tenant_id, 'access.invite')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    ti.id,
    ti.email,
    ti.full_name,
    ti.invite_kind,
    r.name,
    r.slug,
    ti.status,
    inv.email,
    ti.expires_at,
    ti.created_at
  FROM public.tenant_invites ti
  JOIN public.roles r ON r.id = ti.role_id
  LEFT JOIN public.profiles inv ON inv.id = ti.invited_by
  WHERE ti.tenant_id = p_tenant_id
  ORDER BY ti.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_invites(UUID) TO authenticated;
