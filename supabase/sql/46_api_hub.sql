-- API hub: update keys, custom endpoints, secure key verification
-- Run after 45_get_my_access_instance.sql

-- -----------------------------------------------------------------------------
-- Allowed API scopes (whitelist)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_api_scopes(p_scopes TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY[
    'events:write',
    'events:read',
    'customers:read',
    'customers:write',
    'journeys:read',
    'schemas:read',
    'custom_api:invoke'
  ];
  v_scope TEXT;
  v_out TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_scopes IS NULL OR array_length(p_scopes, 1) IS NULL THEN
    RETURN ARRAY['events:write'];
  END IF;

  FOREACH v_scope IN ARRAY p_scopes LOOP
    IF v_scope = ANY (v_allowed) AND NOT (v_scope = ANY (v_out)) THEN
      v_out := array_append(v_out, v_scope);
    END IF;
  END LOOP;

  IF array_length(v_out, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one valid scope is required';
  END IF;

  RETURN v_out;
END;
$$;

-- -----------------------------------------------------------------------------
-- Update API key (name, scopes, expiry — never the secret)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_api_key(
  p_tenant_id UUID,
  p_key_id UUID,
  p_name TEXT,
  p_scopes TEXT[],
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');

  IF trim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  UPDATE public.api_keys
  SET
    name = trim(p_name),
    scopes = public.normalize_api_scopes(p_scopes),
    expires_at = p_expires_at
  WHERE id = p_key_id
    AND tenant_id = p_tenant_id
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found or revoked';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Verify API key (bcrypt) — used by Edge Functions only via service role
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_api_key(p_raw_key TEXT)
RETURNS TABLE (
  key_id UUID,
  tenant_id UUID,
  environment TEXT,
  scopes TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_row public.api_keys%ROWTYPE;
BEGIN
  IF p_raw_key IS NULL OR length(trim(p_raw_key)) < 16 THEN
    RETURN;
  END IF;

  v_prefix := left(trim(p_raw_key), 8);

  FOR v_row IN
    SELECT *
    FROM public.api_keys ak
    WHERE ak.key_prefix = v_prefix
      AND ak.revoked_at IS NULL
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
  LOOP
    IF v_row.key_hash = crypt(trim(p_raw_key), v_row.key_hash) THEN
      UPDATE public.api_keys SET last_used_at = NOW() WHERE id = v_row.id;
      RETURN QUERY
      SELECT v_row.id, v_row.tenant_id, v_row.environment, v_row.scopes;
      RETURN;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_api_key(TEXT) FROM PUBLIC;

-- Unique email per tenant/env for upsert_customer pipeline step
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_env_email_unique
  ON public.customers (tenant_id, environment, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_api_pipeline(p_pipeline JSONB)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_len INT;
  v_i INT;
  v_step JSONB;
  v_type TEXT;
  v_allowed TEXT[] := ARRAY[
    'require_scope', 'parse_body', 'track_event',
    'upsert_customer', 'get_customer', 'respond'
  ];
  v_has_respond BOOLEAN := FALSE;
BEGIN
  IF jsonb_typeof(COALESCE(p_pipeline, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Pipeline must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_pipeline);
  IF v_len < 1 THEN
    RAISE EXCEPTION 'Pipeline must include at least one step';
  END IF;
  IF v_len > 20 THEN
    RAISE EXCEPTION 'Pipeline cannot exceed 20 steps';
  END IF;

  FOR v_i IN 0..(v_len - 1) LOOP
    v_step := p_pipeline -> v_i;
    IF jsonb_typeof(v_step) <> 'object' THEN
      RAISE EXCEPTION 'Pipeline step % must be an object', v_i + 1;
    END IF;
    v_type := v_step ->> 'type';
    IF v_type IS NULL OR NOT (v_type = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Unknown pipeline step type at index %', v_i + 1;
    END IF;
    IF v_type = 'respond' THEN
      v_has_respond := TRUE;
    END IF;
  END LOOP;

  IF NOT v_has_respond THEN
    RAISE EXCEPTION 'Pipeline must include a respond step';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Custom API endpoints (pipeline-based, no arbitrary code in DB)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_api_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  http_method TEXT NOT NULL DEFAULT 'POST'
    CHECK (http_method IN ('GET', 'POST', 'PUT', 'PATCH')),
  required_scopes TEXT[] NOT NULL DEFAULT ARRAY['custom_api:invoke'],
  pipeline JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'disabled')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_api_endpoints_slug_format
    CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  UNIQUE (tenant_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_endpoints_lookup
  ON public.tenant_api_endpoints (tenant_id, environment, slug)
  WHERE status = 'published';

ALTER TABLE public.tenant_api_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_api_endpoints_member_read" ON public.tenant_api_endpoints;
CREATE POLICY "tenant_api_endpoints_member_read" ON public.tenant_api_endpoints
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "tenant_api_endpoints_member_write" ON public.tenant_api_endpoints;

CREATE OR REPLACE FUNCTION public.list_custom_api_endpoints(p_tenant_id UUID, p_environment TEXT)
RETURNS SETOF public.tenant_api_endpoints
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');
  RETURN QUERY
  SELECT *
  FROM public.tenant_api_endpoints e
  WHERE e.tenant_id = p_tenant_id
    AND e.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  ORDER BY e.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_custom_api_endpoint(
  p_tenant_id UUID,
  p_environment TEXT,
  p_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_http_method TEXT,
  p_required_scopes TEXT[],
  p_pipeline JSONB,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_slug TEXT := lower(trim(p_slug));
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');

  IF trim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF v_slug IS NULL OR v_slug = '' OR v_slug !~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Slug must be lowercase letters, numbers, and hyphens (2–50 chars)';
  END IF;

  IF p_http_method NOT IN ('GET', 'POST', 'PUT', 'PATCH') THEN
    RAISE EXCEPTION 'Invalid HTTP method';
  END IF;

  IF p_status NOT IN ('draft', 'published', 'disabled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  PERFORM public.validate_api_pipeline(COALESCE(p_pipeline, '[]'::JSONB));

  IF p_id IS NULL THEN
    INSERT INTO public.tenant_api_endpoints (
      tenant_id, environment, name, slug, description, http_method,
      required_scopes, pipeline, status, created_by
    )
    VALUES (
      p_tenant_id,
      COALESCE(NULLIF(p_environment, ''), 'production'),
      trim(p_name),
      v_slug,
      NULLIF(trim(COALESCE(p_description, '')), ''),
      p_http_method,
      public.normalize_api_scopes(p_required_scopes),
      COALESCE(p_pipeline, '[]'::JSONB),
      p_status,
      auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.tenant_api_endpoints
    SET
      name = trim(p_name),
      slug = v_slug,
      description = NULLIF(trim(COALESCE(p_description, '')), ''),
      http_method = p_http_method,
      required_scopes = public.normalize_api_scopes(p_required_scopes),
      pipeline = COALESCE(p_pipeline, '[]'::JSONB),
      status = p_status,
      updated_at = NOW()
    WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING id INTO v_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Endpoint not found';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_custom_api_endpoint(p_tenant_id UUID, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'api_keys.manage');

  DELETE FROM public.tenant_api_endpoints
  WHERE id = p_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Endpoint not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_api_key(UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_api_key(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_custom_api_endpoints(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_custom_api_endpoint(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_custom_api_endpoint(UUID, UUID) TO authenticated;
