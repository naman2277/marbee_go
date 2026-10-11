-- =============================================================================
-- MARBEE — Connector links (source ↔ schema ↔ target) + connection test logs
-- Run AFTER 01_marbee_schema.sql (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.connector_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  source_connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  target_connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  bridge_schema TEXT NOT NULL,
  sync_mode TEXT NOT NULL DEFAULT 'batch',
  status TEXT NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}',
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, source_connector_id, target_connector_id)
);

CREATE TABLE IF NOT EXISTS public.connector_test_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  connector_id UUID REFERENCES public.connectors(id) ON DELETE SET NULL,
  link_id UUID REFERENCES public.connector_links(id) ON DELETE SET NULL,
  test_type TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  message TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_links_tenant ON public.connector_links (tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_connector_test_logs_connector ON public.connector_test_logs (connector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connector_test_logs_link ON public.connector_test_logs (link_id, created_at DESC);

ALTER TABLE public.connector_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_test_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connector_links_tenant_access" ON public.connector_links;
CREATE POLICY "connector_links_tenant_access" ON public.connector_links FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "connector_test_logs_tenant_access" ON public.connector_test_logs;
CREATE POLICY "connector_test_logs_tenant_access" ON public.connector_test_logs FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.connector_links TO authenticated;
GRANT ALL ON public.connector_test_logs TO authenticated;
