-- =============================================================================
-- MARBEE — PART 1: SCHEMA
-- Run this first in Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_environment()
RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'environment', 'production');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- NOTE: user_tenant_ids() and user_has_tenant_access() are created AFTER tenant_users table (see below)

-- -----------------------------------------------------------------------------
-- Platform tables
-- -----------------------------------------------------------------------------

CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active', 'suspended', 'trial')),
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name IN ('development', 'staging', 'production')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE public.tenant_users (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

-- Functions that depend on tenant_users (must come after table exists)
CREATE OR REPLACE FUNCTION public.user_tenant_ids()
RETURNS SETOF UUID AS $$
  SELECT tenant_id
  FROM public.tenant_users
  WHERE user_id = auth.uid() AND status = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['events:write'],
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON public.audit_logs (tenant_id, created_at DESC);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Customer & event tables (OOTB)
-- -----------------------------------------------------------------------------

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  email TEXT,
  mobile TEXT,
  mobile_country_code TEXT,
  title TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  dob DATE,
  gender TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  pincode TEXT,
  location JSONB DEFAULT '{}',
  consent_email BOOLEAN NOT NULL DEFAULT FALSE,
  consent_sms BOOLEAN NOT NULL DEFAULT FALSE,
  consent_web_push BOOLEAN NOT NULL DEFAULT FALSE,
  consent_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  global_consent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'merged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_tenant_env ON public.customers (tenant_id, environment);
CREATE INDEX idx_customers_email ON public.customers (tenant_id, environment, email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_mobile ON public.customers (tenant_id, environment, mobile) WHERE mobile IS NOT NULL;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ecid TEXT,
  email TEXT,
  mobile TEXT,
  device_id TEXT,
  anonymous_id TEXT,
  external_id TEXT,
  source TEXT,
  identity_type TEXT NOT NULL DEFAULT 'anonymous' CHECK (identity_type IN ('anonymous', 'known', 'merged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identities_ecid ON public.customer_identities (tenant_id, environment, ecid) WHERE ecid IS NOT NULL;
CREATE INDEX idx_identities_anonymous ON public.customer_identities (tenant_id, environment, anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX idx_identities_customer ON public.customer_identities (customer_id);

CREATE TABLE public.web_push_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ecid TEXT,
  fcm_token TEXT NOT NULL,
  browser TEXT,
  os TEXT,
  device TEXT,
  permission_status TEXT DEFAULT 'granted',
  subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'inactive', 'invalid')),
  last_seen TIMESTAMPTZ,
  token_invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, fcm_token)
);

CREATE TRIGGER web_push_subscribers_updated_at BEFORE UPDATE ON public.web_push_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.channel_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  subscriber_id UUID REFERENCES public.web_push_subscribers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web_push', 'whatsapp', 'sms', 'email', 'api')),
  provider TEXT NOT NULL DEFAULT 'firebase',
  provider_config_id UUID,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel TEXT,
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exclusions_customer ON public.exclusions (tenant_id, environment, customer_id);

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  event_type TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  ecid TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT,
  properties JSONB NOT NULL DEFAULT '{}',
  context JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_events_tenant_type ON public.events (tenant_id, environment, event_type, timestamp DESC);
CREATE INDEX idx_events_customer ON public.events (tenant_id, environment, customer_id, timestamp DESC) WHERE customer_id IS NOT NULL;

CREATE TABLE public.engagement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  message_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('sent', 'delivered', 'opened', 'clicked', 'failed', 'unsubscribed', 'converted')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  journey_id UUID,
  campaign_id UUID
);

CREATE INDEX idx_engagement_tenant ON public.engagement_log (tenant_id, environment, timestamp DESC);
CREATE INDEX idx_engagement_customer ON public.engagement_log (customer_id, timestamp DESC);

CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  campaign_id UUID,
  journey_id UUID,
  channel TEXT NOT NULL,
  provider TEXT,
  template_id UUID,
  audience_id UUID,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  stats JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.customer_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
  journey_id UUID,
  campaign_id UUID,
  channel TEXT NOT NULL,
  provider TEXT,
  message_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  error_code TEXT
);

-- -----------------------------------------------------------------------------
-- Journeys, content, data platform
-- -----------------------------------------------------------------------------

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

CREATE INDEX idx_journey_instances_active ON public.journey_instances (journey_id, status)
  WHERE status IN ('entered', 'active', 'waiting');

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

-- Analytics view
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

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Uses tenant_users membership (works after you run 03_link_user.sql)
-- -----------------------------------------------------------------------------

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_delivery_log ENABLE ROW LEVEL SECURITY;
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

-- Profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Platform
CREATE POLICY "tenants_member_read" ON public.tenants FOR SELECT
  USING (id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "environments_member_read" ON public.environments FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "roles_member_access" ON public.roles FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "tenant_users_member_read" ON public.tenant_users FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "api_keys_member_access" ON public.api_keys FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "audit_logs_member_read" ON public.audit_logs FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

-- Tenant-scoped tables (tenant_id + environment)
CREATE POLICY "customers_tenant_access" ON public.customers FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "identities_tenant_access" ON public.customer_identities FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "push_subscribers_tenant_access" ON public.web_push_subscribers FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "endpoints_tenant_access" ON public.channel_endpoints FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "exclusions_tenant_access" ON public.exclusions FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "events_tenant_access" ON public.events FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "engagement_tenant_access" ON public.engagement_log FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "deliveries_tenant_access" ON public.deliveries FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "customer_delivery_tenant_access" ON public.customer_delivery_log FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "journeys_tenant_access" ON public.journeys FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "journey_versions_tenant_access" ON public.journey_versions FOR ALL
  USING (journey_id IN (SELECT id FROM public.journeys WHERE tenant_id IN (SELECT public.user_tenant_ids())));
CREATE POLICY "journey_instances_tenant_access" ON public.journey_instances FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "journey_instance_events_tenant_access" ON public.journey_instance_events FOR ALL
  USING (instance_id IN (SELECT id FROM public.journey_instances WHERE tenant_id IN (SELECT public.user_tenant_ids())));
CREATE POLICY "realtime_tenant_access" ON public.real_time_triggers FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "assets_tenant_access" ON public.assets FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "forms_tenant_access" ON public.forms FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "form_submissions_tenant_access" ON public.form_submissions FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "landing_pages_tenant_access" ON public.landing_pages FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "schemas_tenant_access" ON public.schema_definitions FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "schema_fields_tenant_access" ON public.schema_fields FOR ALL
  USING (schema_id IN (SELECT id FROM public.schema_definitions WHERE tenant_id IN (SELECT public.user_tenant_ids())));
CREATE POLICY "connectors_tenant_access" ON public.connectors FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "connector_runs_tenant_access" ON public.connector_runs FOR ALL
  USING (connector_id IN (SELECT id FROM public.connectors WHERE tenant_id IN (SELECT public.user_tenant_ids())));
CREATE POLICY "data_jobs_tenant_access" ON public.data_jobs FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "channel_providers_tenant_access" ON public.channel_providers FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

-- Grant access to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Enable Realtime on key tables (Supabase Dashboard may also need toggles)
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_instances;
