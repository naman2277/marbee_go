-- =============================================================================
-- MARBEE — Access Management (RBAC, invites, secure member RPCs)
-- Run after 01_marbee_schema.sql + 36_tenant_member_directory.sql (safe to re-run)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Permission catalog (global, not tenant-scoped)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_id);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permissions_read_authenticated" ON public.permissions;
CREATE POLICY "permissions_read_authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "role_permissions_member_read" ON public.role_permissions;
CREATE POLICY "role_permissions_member_read" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    role_id IN (
      SELECT id FROM public.roles WHERE tenant_id IN (SELECT public.user_tenant_ids())
    )
  );

-- Seed permission catalog
INSERT INTO public.permissions (slug, name, description, category) VALUES
  ('access.manage', 'Manage access', 'Invite, remove, and assign roles to members', 'access'),
  ('access.roles.manage', 'Manage roles', 'Create and edit custom roles and permission sets', 'access'),
  ('access.invite', 'Invite members', 'Send workspace invitations', 'access'),
  ('api_keys.manage', 'Manage API keys', 'Create and revoke API keys', 'access'),
  ('audit.read', 'View audit log', 'Read audit trail entries', 'access'),
  ('settings.manage', 'Manage settings', 'Edit organization and general settings', 'settings'),
  ('settings.channels.manage', 'Manage channels', 'Configure delivery channels', 'settings'),
  ('journeys.read', 'View journeys', 'Read campaigns and journeys', 'journeys'),
  ('journeys.write', 'Edit journeys', 'Create and edit journey canvases', 'journeys'),
  ('journeys.publish', 'Publish journeys', 'Deploy and publish journeys', 'journeys'),
  ('customers.read', 'View customers', 'Read customer profiles', 'customers'),
  ('customers.write', 'Edit customers', 'Create and update customer profiles', 'customers'),
  ('schemas.read', 'View schemas', 'Read data schemas', 'data'),
  ('schemas.write', 'Edit schemas', 'Create and edit schemas', 'data'),
  ('schemas.publish', 'Publish schemas', 'Publish schema changes', 'data'),
  ('connectors.manage', 'Manage connectors', 'Configure data connectors', 'data'),
  ('content.manage', 'Manage content', 'Assets, templates, forms, landing pages', 'content'),
  ('data_jobs.manage', 'Manage data jobs', 'Create and run data jobs', 'data'),
  ('reporting.read', 'View reporting', 'Read analytics and reports', 'reporting')
ON CONFLICT (slug) DO NOTHING;

-- Mark seeded roles as system roles
UPDATE public.roles SET is_system = TRUE
WHERE slug IN ('tenant_admin', 'marketing_manager', 'data_engineer', 'analyst');

-- Helper: link role to permission by slugs
CREATE OR REPLACE FUNCTION public._grant_role_perm(p_tenant_id UUID, p_role_slug TEXT, p_perm_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_id UUID;
  v_perm_id UUID;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE tenant_id = p_tenant_id AND slug = p_role_slug;
  SELECT id INTO v_perm_id FROM public.permissions WHERE slug = p_perm_slug;
  IF v_role_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Seed role-permission matrix for demo tenant
DO $$
DECLARE
  v_tenant UUID := '00000000-0000-0000-0000-000000000001';
  p TEXT;
BEGIN
  -- Tenant admin: all permissions
  FOR p IN SELECT slug FROM public.permissions LOOP
    PERFORM public._grant_role_perm(v_tenant, 'tenant_admin', p);
  END LOOP;

  -- Marketing manager
  FOREACH p IN ARRAY ARRAY[
    'access.invite', 'audit.read', 'settings.channels.manage',
    'journeys.read', 'journeys.write', 'journeys.publish',
    'customers.read', 'customers.write', 'content.manage', 'reporting.read'
  ] LOOP
    PERFORM public._grant_role_perm(v_tenant, 'marketing_manager', p);
  END LOOP;

  -- Data engineer
  FOREACH p IN ARRAY ARRAY[
    'audit.read', 'schemas.read', 'schemas.write', 'schemas.publish',
    'connectors.manage', 'data_jobs.manage', 'customers.read', 'reporting.read'
  ] LOOP
    PERFORM public._grant_role_perm(v_tenant, 'data_engineer', p);
  END LOOP;

  -- Analyst (read-only)
  FOREACH p IN ARRAY ARRAY[
    'audit.read', 'journeys.read', 'customers.read', 'schemas.read', 'reporting.read'
  ] LOOP
    PERFORM public._grant_role_perm(v_tenant, 'analyst', p);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Tenant invites
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invites_pending_email
  ON public.tenant_invites (tenant_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tenant_invites_token ON public.tenant_invites (token);

ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_invites_member_read" ON public.tenant_invites;
CREATE POLICY "tenant_invites_member_read" ON public.tenant_invites
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

-- -----------------------------------------------------------------------------
-- Permission helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(p_tenant_id UUID)
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
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = p_tenant_id
      AND tu.status = 'active'
      AND r.slug = 'tenant_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_tenant_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_is_tenant_admin(p_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      JOIN public.role_permissions rp ON rp.role_id = tu.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = p_tenant_id
        AND tu.status = 'active'
        AND p.slug = p_permission
    );
$$;

CREATE OR REPLACE FUNCTION public.require_permission(p_tenant_id UUID, p_permission TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied for tenant';
  END IF;
  IF NOT public.user_has_permission(p_tenant_id, p_permission) THEN
    RAISE EXCEPTION 'Permission denied: %', p_permission;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Current user access snapshot
-- -----------------------------------------------------------------------------

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
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant_access(p_tenant_id) THEN
    RETURN jsonb_build_object('permissions', '[]'::JSONB);
  END IF;

  SELECT r.slug, r.name, r.id
  INTO v_role_slug, v_role_name, v_role_id
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

  RETURN jsonb_build_object(
    'role_slug', v_role_slug,
    'role_name', v_role_name,
    'role_id', v_role_id,
    'permissions', v_perms,
    'is_admin', v_role_slug = 'tenant_admin'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Roles with permissions (read)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_roles_with_permissions(p_tenant_id UUID)
RETURNS TABLE (
  role_id UUID,
  slug TEXT,
  name TEXT,
  description TEXT,
  is_system BOOLEAN,
  permission_slugs TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.slug,
    r.name,
    r.description,
    r.is_system,
    COALESCE(
      ARRAY_AGG(p.slug ORDER BY p.slug) FILTER (WHERE p.slug IS NOT NULL),
      ARRAY[]::TEXT[]
    )
  FROM public.roles r
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  LEFT JOIN public.permissions p ON p.id = rp.permission_id
  WHERE r.tenant_id = p_tenant_id
  GROUP BY r.id, r.slug, r.name, r.description, r.is_system
  ORDER BY r.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_roles_with_permissions(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Member management RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_tenant_member_role(
  p_tenant_id UUID,
  p_user_id UUID,
  p_role_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'access.manage');

  IF p_user_id = auth.uid() AND NOT public.user_is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.roles WHERE id = p_role_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Invalid role for tenant';
  END IF;

  UPDATE public.tenant_users
  SET role_id = p_role_id
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_tenant_member(
  p_tenant_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'access.manage');

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot disable your own account';
  END IF;

  UPDATE public.tenant_users
  SET status = 'disabled'
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
END;
$$;

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

  UPDATE public.tenant_invites
  SET status = 'revoked'
  WHERE tenant_id = p_tenant_id AND lower(email) = v_email AND status = 'pending';

  INSERT INTO public.tenant_invites (tenant_id, email, role_id, invited_by)
  VALUES (p_tenant_id, v_email, p_role_id, auth.uid())
  RETURNING id, tenant_invites.token, tenant_invites.expires_at
  INTO v_id, v_token, v_expires;

  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_invites(p_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
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

CREATE OR REPLACE FUNCTION public.revoke_tenant_invite(p_tenant_id UUID, p_invite_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'access.invite');

  UPDATE public.tenant_invites
  SET status = 'revoked'
  WHERE id = p_invite_id AND tenant_id = p_tenant_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already processed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT
    ti.id,
    ti.email,
    ti.status,
    ti.expires_at,
    t.name AS tenant_name,
    r.name AS role_name
  INTO v_row
  FROM public.tenant_invites ti
  JOIN public.tenants t ON t.id = ti.tenant_id
  JOIN public.roles r ON r.id = ti.role_id
  WHERE ti.token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invite is no longer active');
  END IF;

  IF v_row.expires_at < NOW() THEN
    UPDATE public.tenant_invites SET status = 'expired' WHERE id = v_row.id;
    RETURN jsonb_build_object('valid', false, 'reason', 'Invite has expired');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'email', v_row.email,
    'tenant_name', v_row.tenant_name,
    'role_name', v_row.role_name,
    'expires_at', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to accept this invitation';
  END IF;

  SELECT ti.*, r.slug AS role_slug
  INTO v_invite
  FROM public.tenant_invites ti
  JOIN public.roles r ON r.id = ti.role_id
  WHERE ti.token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is no longer active';
  END IF;

  IF v_invite.expires_at < NOW() THEN
    UPDATE public.tenant_invites SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  SELECT lower(email) INTO v_user_email FROM public.profiles WHERE id = auth.uid();

  IF v_user_email IS DISTINCT FROM lower(v_invite.email) THEN
    RAISE EXCEPTION 'This invite was sent to %. Sign in with that email.', v_invite.email;
  END IF;

  INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status)
  VALUES (v_invite.tenant_id, auth.uid(), v_invite.role_id, 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active';

  UPDATE public.tenant_invites
  SET status = 'accepted', accepted_at = NOW(), accepted_by = auth.uid()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'tenant_id', v_invite.tenant_id,
    'role_slug', v_invite.role_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_member_role(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_tenant_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_invites(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_invite(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- API key RPCs (secure create / list / revoke)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_api_keys(p_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  key_prefix TEXT,
  scopes TEXT[],
  environment TEXT,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');

  RETURN QUERY
  SELECT
    ak.id, ak.name, ak.key_prefix, ak.scopes, ak.environment,
    ak.expires_at, ak.last_used_at, ak.created_at, ak.revoked_at
  FROM public.api_keys ak
  WHERE ak.tenant_id = p_tenant_id
  ORDER BY ak.created_at DESC;
END;
$$;

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
SET search_path = public
AS $$
DECLARE
  v_raw TEXT;
  v_prefix TEXT;
  v_hash TEXT;
  v_id UUID;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');

  v_raw := 'mk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
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

CREATE OR REPLACE FUNCTION public.revoke_api_key(p_tenant_id UUID, p_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');

  UPDATE public.api_keys
  SET revoked_at = NOW()
  WHERE id = p_key_id AND tenant_id = p_tenant_id AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found or already revoked';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_api_keys(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_api_key(UUID, TEXT, TEXT, TEXT[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(UUID, UUID) TO authenticated;

-- Extended member directory (role id + status for access management UI)
-- Must drop first: migration 36 defined a narrower return type (OUT params differ).
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
    AND tu.status IN ('active', 'disabled')
    AND tu.tenant_id IN (SELECT public.user_tenant_ids());
$$;

GRANT EXECUTE ON FUNCTION public.list_tenant_members(UUID) TO authenticated;

-- Tighten direct mutations on sensitive tables (use RPCs instead)
DROP POLICY IF EXISTS "roles_member_access" ON public.roles;
CREATE POLICY "roles_member_read" ON public.roles
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "api_keys_member_access" ON public.api_keys;
CREATE POLICY "api_keys_member_read" ON public.api_keys
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
