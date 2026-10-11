-- =============================================================================
-- Fix invite tokens — gen_random_bytes requires pgcrypto (often not in search_path)
-- Run in Supabase SQL Editor (safe to re-run)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.generate_secure_token()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

GRANT EXECUTE ON FUNCTION public.generate_secure_token() TO authenticated, service_role;

-- Replace column default (no pgcrypto needed)
ALTER TABLE public.tenant_invites
  ALTER COLUMN token SET DEFAULT public.generate_secure_token();

CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id UUID,
  p_email TEXT,
  p_role_id UUID
)
RETURNS TABLE (invite_id UUID, token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_id UUID;
  v_token TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'access.invite');

  IF v_email = '' OR v_email !~ '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.roles WHERE id = p_role_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Invalid role for tenant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    JOIN public.tenant_users tu ON tu.user_id = pr.id
    WHERE lower(pr.email) = v_email
      AND tu.tenant_id = p_tenant_id
      AND tu.status = 'active'
  ) THEN
    RAISE EXCEPTION 'User is already a member of this workspace';
  END IF;

  v_token := public.generate_secure_token();

  UPDATE public.tenant_invites
  SET status = 'revoked'
  WHERE tenant_id = p_tenant_id AND lower(email) = v_email AND status = 'pending';

  INSERT INTO public.tenant_invites (tenant_id, email, role_id, invited_by, token)
  VALUES (p_tenant_id, v_email, p_role_id, auth.uid(), v_token)
  RETURNING id, tenant_invites.expires_at
  INTO v_id, v_expires;

  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_tenant_member(UUID, TEXT, UUID) TO authenticated;

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
  v_token TEXT := COALESCE(NULLIF(trim(p_invite_token), ''), public.generate_secure_token());
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

-- API key creation: use extensions schema for pgcrypto crypt
CREATE OR REPLACE FUNCTION public.create_api_key(
  p_tenant_id UUID,
  p_name TEXT,
  p_environment TEXT DEFAULT 'production',
  p_scopes TEXT[] DEFAULT ARRAY['events:write'],
  p_expires_days INTEGER DEFAULT NULL
)
RETURNS TABLE (id UUID, api_key TEXT, key_prefix TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_raw TEXT;
  v_prefix TEXT;
  v_hash TEXT;
  v_id UUID;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');

  v_raw := 'mk_' || public.generate_secure_token();
  v_prefix := left(v_raw, 8);
  v_hash := crypt(v_raw, gen_salt('bf'));

  INSERT INTO public.api_keys (
    tenant_id, environment, name, key_prefix, key_hash, scopes,
    expires_at, created_by
  )
  VALUES (
    p_tenant_id,
    COALESCE(NULLIF(p_environment, ''), 'production'),
    trim(p_name),
    v_prefix,
    v_hash,
    COALESCE(p_scopes, ARRAY['events:write']),
    CASE WHEN p_expires_days IS NULL THEN NULL ELSE NOW() + (p_expires_days || ' days')::INTERVAL END,
    auth.uid()
  )
  RETURNING api_keys.id INTO v_id;

  RETURN QUERY SELECT v_id, v_raw, v_prefix;
END;
$$;
