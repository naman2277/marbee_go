-- Active member provisioning (admin sets password — no email required)
-- Run after 38/39 (safe to re-run)

CREATE OR REPLACE FUNCTION public.link_active_tenant_user(
  p_tenant_id UUID,
  p_auth_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role_id UUID,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.roles WHERE id = p_role_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Invalid role for tenant';
  END IF;

  UPDATE public.profiles
  SET name = COALESCE(NULLIF(trim(p_full_name), ''), name)
  WHERE id = p_auth_user_id;

  INSERT INTO public.tenant_users (tenant_id, user_id, role_id, status)
  VALUES (p_tenant_id, p_auth_user_id, p_role_id, 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active';

  UPDATE public.tenant_invites
  SET status = 'revoked'
  WHERE tenant_id = p_tenant_id
    AND lower(email) = v_email
    AND status = 'pending';

  RETURN p_auth_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_active_tenant_user(UUID, UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_active_tenant_user(UUID, UUID, TEXT, TEXT, UUID, UUID) TO service_role;
