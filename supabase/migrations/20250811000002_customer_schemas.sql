-- Customer data schemas (OOTB)

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  email TEXT,
  mobile TEXT,
  name TEXT,
  dob DATE,
  gender TEXT,
  location JSONB DEFAULT '{}',
  consent JSONB DEFAULT '{}',
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

-- Events (partitioned by month via timestamp index for P1)
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

-- RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation customers" ON public.customers
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation identities" ON public.customer_identities
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation push subscribers" ON public.web_push_subscribers
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation endpoints" ON public.channel_endpoints
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation exclusions" ON public.exclusions
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation events" ON public.events
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation engagement" ON public.engagement_log
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation deliveries" ON public.deliveries
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());

CREATE POLICY "Tenant isolation customer_delivery" ON public.customer_delivery_log
  FOR ALL USING (tenant_id = public.current_tenant_id() AND environment = public.current_environment());
