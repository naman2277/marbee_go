-- Profile avatar + self-service profile RPCs
-- Run after 41_member_account_settings.sql

DROP FUNCTION IF EXISTS public.list_tenant_members(UUID);

CREATE OR REPLACE FUNCTION public.list_tenant_members(p_tenant_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
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
    p.avatar_url,
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

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, email, name, avatar_url, last_login_at
  INTO v_row
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'email', v_row.email,
    'name', v_row.name,
    'avatar_url', v_row.avatar_url,
    'last_login_at', v_row.last_login_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_avatar TEXT := NULLIF(trim(p_avatar_url), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET
    name = COALESCE(v_name, name),
    avatar_url = CASE
      WHEN p_avatar_url IS NULL THEN avatar_url
      ELSE v_avatar
    END
  WHERE id = auth.uid();

  RETURN public.get_my_profile();
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_member_account(
  p_tenant_id UUID,
  p_user_id UUID,
  p_name TEXT,
  p_settings JSONB,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_name TEXT := NULLIF(trim(p_name), '');
  v_clean_settings JSONB;
  v_avatar TEXT := NULLIF(trim(p_avatar_url), '');
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'access.manage');

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = p_user_id
      AND status IN ('active', 'disabled', 'invited')
  ) THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  v_clean_settings := public.sanitize_member_settings(p_settings);

  UPDATE public.profiles
  SET
    name = COALESCE(v_clean_name, name),
    avatar_url = CASE
      WHEN p_avatar_url IS NULL THEN avatar_url
      ELSE v_avatar
    END
  WHERE id = p_user_id;

  UPDATE public.tenant_users
  SET settings = v_clean_settings
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id;

  RETURN public.get_tenant_member_detail(p_tenant_id, p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT) TO authenticated;
