-- Journeys, content, connectors, channel providers

CREATE TABLE public.journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  current_version_id UUID,
  entry_trigger_config JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ
);

CREATE TRIGGER journeys_updated_at BEFORE UPDATE ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.journey_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  canvas_json JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (journey_id, version_number)
);

ALTER TABLE public.journeys
  ADD CONSTRAINT journeys_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.journey_versions(id) ON DELETE SET NULL;

CREATE TABLE public.journey_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.journey_versions(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'entered' CHECK (status IN ('entered', 'active', 'waiting', 'completed', 'exited', 'failed')),
  current_node_id TEXT,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  context JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_journey_instances_active ON public.journey_instances (journey_id, status) WHERE status IN ('entered', 'active', 'waiting');

CREATE TABLE public.journey_instance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.journey_instances(id) ON DELETE CASCADE,
  node_id TEXT,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.real_time_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  channel TEXT NOT NULL DEFAULT 'web_push',
  template_config JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  is_transactional BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER real_time_triggers_updated_at BEFORE UPDATE ON public.real_time_triggers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Content
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  folder TEXT DEFAULT '/',
  tags TEXT[] DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  public_url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TRIGGER assets_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  schema_mapping JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE TABLE public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  customer_id UUID REFERENCES public.customers(id),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{"sections":[]}',
  seo JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  published_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

-- Data platform
CREATE TABLE public.schema_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  table_name TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE TABLE public.schema_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID NOT NULL REFERENCES public.schema_definitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary_key BOOLEAN NOT NULL DEFAULT FALSE,
  is_nullable BOOLEAN NOT NULL DEFAULT TRUE,
  is_pii BOOLEAN NOT NULL DEFAULT FALSE,
  is_indexed BOOLEAN NOT NULL DEFAULT FALSE,
  default_value TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (schema_id, name)
);

CREATE TABLE public.connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  connector_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  config JSONB NOT NULL DEFAULT '{}',
  mapping JSONB NOT NULL DEFAULT '[]',
  schedule_cron TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.connector_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.data_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  workflow_json JSONB NOT NULL DEFAULT '{}',
  schedule_cron TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Channel providers
CREATE TABLE public.channel_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  channel TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL,
  credentials_encrypted TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Analytics materialized views (refreshed by cron)
CREATE MATERIALIZED VIEW public.mv_command_center_today AS
SELECT
  e.tenant_id,
  e.environment,
  COUNT(*) FILTER (WHERE el.event = 'sent') AS messages_sent,
  COUNT(*) FILTER (WHERE el.event = 'delivered') AS messages_delivered,
  COUNT(*) FILTER (WHERE el.event IN ('opened', 'clicked')) AS messages_engaged,
  COUNT(*) FILTER (WHERE el.event = 'converted') AS conversions
FROM public.engagement_log el
JOIN public.tenants t ON t.id = el.tenant_id
LEFT JOIN public.events e ON FALSE
WHERE el.timestamp >= CURRENT_DATE
GROUP BY e.tenant_id, e.environment;

-- Fix MV - simpler version
DROP MATERIALIZED VIEW IF EXISTS public.mv_command_center_today;

CREATE MATERIALIZED VIEW public.mv_command_center_today AS
SELECT
  tenant_id,
  environment,
  COUNT(*) FILTER (WHERE event = 'sent') AS messages_sent,
  COUNT(*) FILTER (WHERE event = 'delivered') AS messages_delivered,
  COUNT(*) FILTER (WHERE event IN ('opened', 'clicked')) AS messages_engaged,
  COUNT(*) FILTER (WHERE event = 'converted') AS conversions
FROM public.engagement_log
WHERE timestamp >= CURRENT_DATE
GROUP BY tenant_id, environment;

CREATE UNIQUE INDEX idx_mv_command_center ON public.mv_command_center_today (tenant_id, environment);

-- RLS for all new tables
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_instance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_time_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation journeys" ON public.journeys FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation journey_versions" ON public.journey_versions FOR ALL
  USING (journey_id IN (SELECT id FROM public.journeys WHERE tenant_id = public.current_tenant_id()));
CREATE POLICY "Tenant isolation journey_instances" ON public.journey_instances FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation journey_events" ON public.journey_instance_events FOR ALL
  USING (instance_id IN (SELECT id FROM public.journey_instances WHERE tenant_id = public.current_tenant_id()));
CREATE POLICY "Tenant isolation realtime" ON public.real_time_triggers FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation assets" ON public.assets FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation forms" ON public.forms FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation submissions" ON public.form_submissions FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation landing_pages" ON public.landing_pages FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation schemas" ON public.schema_definitions FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation schema_fields" ON public.schema_fields FOR ALL
  USING (schema_id IN (SELECT id FROM public.schema_definitions WHERE tenant_id = public.current_tenant_id()));
CREATE POLICY "Tenant isolation connectors" ON public.connectors FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation connector_runs" ON public.connector_runs FOR ALL
  USING (connector_id IN (SELECT id FROM public.connectors WHERE tenant_id = public.current_tenant_id()));
CREATE POLICY "Tenant isolation data_jobs" ON public.data_jobs FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
CREATE POLICY "Tenant isolation channel_providers" ON public.channel_providers FOR ALL
  USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
