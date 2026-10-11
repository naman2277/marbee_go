-- =============================================================================
-- MARBEE — Data Quality: rules, runs, violations, quarantine, duplicate config
-- Run AFTER 01_marbee_schema.sql (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.data_quality_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  schema_id UUID NOT NULL REFERENCES public.schema_definitions(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schema_id, field_name, rule_type)
);

CREATE TABLE IF NOT EXISTS public.data_quality_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  schema_id UUID NOT NULL REFERENCES public.schema_definitions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  quality_score NUMERIC(5,2),
  records_checked INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  records_quarantined INTEGER DEFAULT 0,
  summary JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.data_quality_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.data_quality_runs(id) ON DELETE CASCADE,
  record_id TEXT,
  field_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quarantine_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  schema_id UUID NOT NULL REFERENCES public.schema_definitions(id) ON DELETE CASCADE,
  record_id TEXT,
  record_data JSONB NOT NULL,
  violations JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'quarantined',
  run_id UUID REFERENCES public.data_quality_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.schema_duplicate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  schema_id UUID NOT NULL REFERENCES public.schema_definitions(id) ON DELETE CASCADE,
  match_keys TEXT[] NOT NULL DEFAULT '{}',
  strategy TEXT NOT NULL DEFAULT 'flag',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, schema_id)
);

CREATE INDEX IF NOT EXISTS idx_dq_rules_schema ON public.data_quality_rules (schema_id, is_active);
CREATE INDEX IF NOT EXISTS idx_dq_runs_schema ON public.data_quality_runs (schema_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dq_violations_run ON public.data_quality_violations (run_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_schema ON public.quarantine_records (schema_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dup_config_schema ON public.schema_duplicate_config (schema_id);

ALTER TABLE public.data_quality_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarantine_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_duplicate_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dq_rules_tenant_access" ON public.data_quality_rules;
CREATE POLICY "dq_rules_tenant_access" ON public.data_quality_rules FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "dq_runs_tenant_access" ON public.data_quality_runs;
CREATE POLICY "dq_runs_tenant_access" ON public.data_quality_runs FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "dq_violations_tenant_access" ON public.data_quality_violations;
CREATE POLICY "dq_violations_tenant_access" ON public.data_quality_violations FOR ALL
  USING (run_id IN (
    SELECT id FROM public.data_quality_runs WHERE tenant_id IN (SELECT public.user_tenant_ids())
  ));

DROP POLICY IF EXISTS "quarantine_tenant_access" ON public.quarantine_records;
CREATE POLICY "quarantine_tenant_access" ON public.quarantine_records FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "dup_config_tenant_access" ON public.schema_duplicate_config;
CREATE POLICY "dup_config_tenant_access" ON public.schema_duplicate_config FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.data_quality_rules TO authenticated;
GRANT ALL ON public.data_quality_runs TO authenticated;
GRANT ALL ON public.data_quality_violations TO authenticated;
GRANT ALL ON public.quarantine_records TO authenticated;
GRANT ALL ON public.schema_duplicate_config TO authenticated;

-- Demo: customer quality rules + duplicate config
INSERT INTO public.data_quality_rules (id, tenant_id, environment, schema_id, field_name, rule_type, config) VALUES
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', '20000000-0000-0000-0000-000000000001', 'email', 'email_format', '{}'),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', '20000000-0000-0000-0000-000000000001', 'email', 'not_empty', '{}'),
  ('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', '20000000-0000-0000-0000-000000000001', 'mobile', 'phone_format', '{}')
ON CONFLICT (schema_id, field_name, rule_type) DO NOTHING;

INSERT INTO public.schema_duplicate_config (id, tenant_id, environment, schema_id, match_keys, strategy) VALUES
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', '20000000-0000-0000-0000-000000000001', ARRAY['email'], 'quarantine')
ON CONFLICT (tenant_id, environment, schema_id) DO NOTHING;

-- Demo record with invalid email for quality checks
INSERT INTO public.customers (id, tenant_id, environment, email, mobile, first_name, last_name, status) VALUES
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', 'not-an-email', NULL, 'Bad', 'Record', 'active')
ON CONFLICT (id) DO NOTHING;
