-- =============================================================================
-- MARBEE — Audiences / cohorts (schema-based segments)
-- Run AFTER 01_marbee_schema.sql (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  schema_slug TEXT NOT NULL,
  filter_json JSONB NOT NULL DEFAULT '{"type":"group","logic":"and","children":[]}',
  quick_search TEXT DEFAULT '',
  creation_mode TEXT NOT NULL DEFAULT 'diy' CHECK (creation_mode IN ('diy', 'ai', 'template')),
  ai_prompt TEXT,
  member_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS idx_audiences_tenant ON public.audiences (tenant_id, environment, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audiences_schema ON public.audiences (schema_slug);

ALTER TABLE public.audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audiences_tenant_access" ON public.audiences;
CREATE POLICY "audiences_tenant_access" ON public.audiences FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.audiences TO authenticated;

-- Demo cohorts on customer schema
INSERT INTO public.audiences (
  id, tenant_id, environment, name, slug, description, schema_slug,
  filter_json, creation_mode, member_count, status
) VALUES
  (
    '80000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'production',
    'Active customers',
    'active-customers',
    'Customers with status active',
    'customer',
    '{"type":"group","id":"g1","logic":"and","children":[{"type":"condition","id":"c1","left":{"kind":"field","field":"status"},"operator":"equals","right":{"kind":"literal","value":"active"}}]}'::jsonb,
    'template',
    0,
    'active'
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'production',
    'Email reachable',
    'email-reachable',
    'Has email and email marketing consent',
    'customer',
    '{"type":"group","id":"g2","logic":"and","children":[{"type":"condition","id":"c1","left":{"kind":"field","field":"email"},"operator":"is_not_empty","right":{"kind":"literal","value":""}},{"type":"condition","id":"c2","join":"and","left":{"kind":"field","field":"consent_email"},"operator":"equals","right":{"kind":"literal","value":"true"}}]}'::jsonb,
    'template',
    0,
    'active'
  )
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;
