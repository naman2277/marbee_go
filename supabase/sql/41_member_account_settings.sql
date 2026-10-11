-- Per-member account settings (company, IP allowlist, folder access)
-- Run after 40_admin_password_provision.sql

ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.sanitize_member_settings(p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_ips JSONB := '[]'::jsonb;
  v_journey JSONB := '[]'::jsonb;
  v_asset JSONB := '[]'::jsonb;
  v_item TEXT;
  v_path TEXT;
BEGIN
  IF p_settings IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF jsonb_typeof(p_settings->'allowed_ips') = 'array' THEN
    FOR v_item IN SELECT jsonb_array_elements_text(p_settings->'allowed_ips')
    LOOP
      v_item := trim(v_item);
      IF length(v_item) > 0 AND length(v_item) <= 64 THEN
        v_ips := v_ips || to_jsonb(v_item);
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_settings->'journey_folder_paths') = 'array' THEN
    FOR v_path IN SELECT jsonb_array_elements_text(p_settings->'journey_folder_paths')
    LOOP
      v_path := trim(v_path);
      IF length(v_path) > 0 AND length(v_path) <= 512 THEN
        IF NOT v_path LIKE '/%' THEN
          v_path := '/' || v_path;
        END IF;
        v_journey := v_journey || to_jsonb(v_path);
      END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_settings->'asset_folder_paths') = 'array' THEN
    FOR v_path IN SELECT jsonb_array_elements_text(p_settings->'asset_folder_paths')
    LOOP
      v_path := trim(v_path);
      IF length(v_path) > 0 AND length(v_path) <= 512 THEN
        IF NOT v_path LIKE '/%' THEN
          v_path := '/' || v_path;
        END IF;
        v_asset := v_asset || to_jsonb(v_path);
      END IF;
    END LOOP;
  END IF;

  v_result := jsonb_build_object(
    'company', left(coalesce(p_settings->>'company', ''), 200),
    'job_title', left(coalesce(p_settings->>'job_title', ''), 120),
    'department', left(coalesce(p_settings->>'department', ''), 120),
    'phone', left(coalesce(p_settings->>'phone', ''), 40),
    'notes', left(coalesce(p_settings->>'notes', ''), 2000),
    'allowed_ips', v_ips,
    'restrict_journey_folders', coalesce((p_settings->>'restrict_journey_folders')::boolean, false),
    'journey_folder_paths', v_journey,
    'restrict_asset_folders', coalesce((p_settings->>'restrict_asset_folders')::boolean, false),
    'asset_folder_paths', v_asset
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_member_detail(
  p_tenant_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'access.manage');

  SELECT
    tu.user_id,
    p.email,
    p.name,
    p.avatar_url,
    p.last_login_at,
    tu.role_id,
    r.name AS role_name,
    r.slug AS role_slug,
    tu.status,
    tu.created_at AS member_since,
    tu.settings
  INTO v_row
  FROM public.tenant_users tu
  JOIN public.profiles p ON p.id = tu.user_id
  JOIN public.roles r ON r.id = tu.role_id
  WHERE tu.tenant_id = p_tenant_id
    AND tu.user_id = p_user_id
    AND tu.status IN ('active', 'disabled', 'invited');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_row.user_id,
    'email', v_row.email,
    'name', v_row.name,
    'avatar_url', v_row.avatar_url,
    'last_login_at', v_row.last_login_at,
    'role_id', v_row.role_id,
    'role_name', v_row.role_name,
    'role_slug', v_row.role_slug,
    'status', v_row.status,
    'member_since', v_row.member_since,
    'settings', public.sanitize_member_settings(v_row.settings)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_tenant_member_account(
  p_tenant_id UUID,
  p_user_id UUID,
  p_name TEXT,
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_name TEXT := NULLIF(trim(p_name), '');
  v_clean_settings JSONB;
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

  IF v_clean_name IS NOT NULL THEN
    UPDATE public.profiles
    SET name = left(v_clean_name, 120)
    WHERE id = p_user_id;
  END IF;

  UPDATE public.tenant_users
  SET settings = v_clean_settings
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id;

  RETURN public.get_tenant_member_detail(p_tenant_id, p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_member_settings(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_member_detail(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_member_account(UUID, UUID, TEXT, JSONB) TO authenticated;
