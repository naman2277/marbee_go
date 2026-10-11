-- -----------------------------------------------------------------------------
-- 62_global_variables.sql
-- Tenant/environment scoped named variables: plain config, secrets, and
-- AES-256 encryption keys referenced as {{vars.NAME}} across forms, workflows,
-- landing pages, imports, exports and connectors.
--
-- Run after 61_pipeline_worker_cron.sql
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.global_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  -- Canonical UPPER_SNAKE identifier used in {{vars.NAME}} references
  name TEXT NOT NULL CHECK (name ~ '^[A-Z0-9_]{1,64}$'),
  description TEXT,

  kind TEXT NOT NULL DEFAULT 'plain'
    CHECK (kind IN ('plain', 'secret', 'encryption_key')),

  -- Plaintext for 'plain'; AES-GCM envelope (mbe1.<iv>.<ct>) for the others.
  -- Sealed client-side with the tenant master key before it reaches this table.
  value TEXT NOT NULL DEFAULT '',

  -- Modules allowed to resolve this variable
  scopes TEXT[] NOT NULL DEFAULT ARRAY['all']::TEXT[],

  -- Short SHA-256 fingerprint of key material, for display without revealing it
  fingerprint TEXT,

  rotated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, environment, name)
);

CREATE INDEX IF NOT EXISTS idx_global_variables_tenant
  ON public.global_variables (tenant_id, environment, kind);

CREATE INDEX IF NOT EXISTS idx_global_variables_name
  ON public.global_variables (tenant_id, environment, name);

-- -----------------------------------------------------------------------------
-- Keep updated_at fresh
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_global_variable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_variables_touch ON public.global_variables;
CREATE TRIGGER trg_global_variables_touch
  BEFORE UPDATE ON public.global_variables
  FOR EACH ROW EXECUTE FUNCTION public.touch_global_variable();

-- -----------------------------------------------------------------------------
-- Row level security — tenant members only, writes gated on api_keys.manage
-- -----------------------------------------------------------------------------

ALTER TABLE public.global_variables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_variables_select ON public.global_variables;
CREATE POLICY global_variables_select ON public.global_variables
  FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS global_variables_insert ON public.global_variables;
CREATE POLICY global_variables_insert ON public.global_variables
  FOR INSERT
  WITH CHECK (public.user_has_permission(tenant_id, 'api_keys.manage'));

DROP POLICY IF EXISTS global_variables_update ON public.global_variables;
CREATE POLICY global_variables_update ON public.global_variables
  FOR UPDATE
  USING (public.user_has_permission(tenant_id, 'api_keys.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'api_keys.manage'));

DROP POLICY IF EXISTS global_variables_delete ON public.global_variables;
CREATE POLICY global_variables_delete ON public.global_variables
  FOR DELETE
  USING (public.user_has_permission(tenant_id, 'api_keys.manage'));

-- -----------------------------------------------------------------------------
-- Record usage without granting write access to the whole row
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_variable_usage(
  p_tenant_id UUID,
  p_environment TEXT,
  p_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.global_variables
  SET last_used_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND environment = p_environment
    AND name = p_name;
END;
$$;
