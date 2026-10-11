-- =============================================================================
-- MARBEE — Audit trail RPC + indexes (uses audit_logs from 01_marbee_schema.sql)
-- Run after platform foundation migrations (safe to re-run)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON public.audit_logs (tenant_id, resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_environment
  ON public.audit_logs (tenant_id, environment, created_at DESC);

-- SECURITY DEFINER insert — clients cannot INSERT directly (SELECT-only RLS)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_tenant_id UUID,
  p_environment TEXT,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied for tenant';
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id,
    environment,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  VALUES (
    p_tenant_id,
    COALESCE(NULLIF(p_environment, ''), 'production'),
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated;
