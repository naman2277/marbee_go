-- -----------------------------------------------------------------------------
-- 50_web_analytics_platform.sql
-- Custom Web Analytics Tracking Platform: Sites, Raw Events, Sessions, Rollups
-- -----------------------------------------------------------------------------

-- 1. Web Analytics Sites Registry
CREATE TABLE IF NOT EXISTS public.web_analytics_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  write_key TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'active', 'paused', 'archived')),
  last_event_at TIMESTAMPTZ,
  total_pageviews BIGINT NOT NULL DEFAULT 0,
  total_events BIGINT NOT NULL DEFAULT 0,
  total_sessions BIGINT NOT NULL DEFAULT 0,
  settings JSONB NOT NULL DEFAULT '{"autoPageviews":true,"autoClicks":true,"autoScroll":true,"respectDoNotTrack":false,"anonymizeIp":true,"consentMode":"opt_in"}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, site_id)
);

CREATE INDEX IF NOT EXISTS idx_web_analytics_sites_lookup
  ON public.web_analytics_sites (site_id, status);

CREATE INDEX IF NOT EXISTS idx_web_analytics_sites_tenant
  ON public.web_analytics_sites (tenant_id, environment);

-- 2. Raw Web Analytics Events (Immutable event store)
CREATE TABLE IF NOT EXISTS public.web_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  site_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL DEFAULT 'pageview',
  url TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  hostname TEXT NOT NULL DEFAULT '',
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  page_title TEXT,
  screen_resolution TEXT,
  viewport_size TEXT,
  language TEXT,
  timezone TEXT,
  user_agent TEXT,
  device_type TEXT NOT NULL DEFAULT 'desktop' CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'bot', 'unknown')),
  browser TEXT NOT NULL DEFAULT 'Other',
  os TEXT NOT NULL DEFAULT 'Other',
  country_code TEXT NOT NULL DEFAULT 'IN',
  country_name TEXT NOT NULL DEFAULT 'India',
  city TEXT,
  ip_hash TEXT NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  properties JSONB NOT NULL DEFAULT '{}',
  client_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, site_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_web_analytics_events_site_time
  ON public.web_analytics_events (site_id, server_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_web_analytics_events_session
  ON public.web_analytics_events (session_id);

CREATE INDEX IF NOT EXISTS idx_web_analytics_events_tenant_time
  ON public.web_analytics_events (tenant_id, environment, server_timestamp DESC);

-- 3. Web Analytics Sessions Store
CREATE TABLE IF NOT EXISTS public.web_analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  pageview_count INTEGER NOT NULL DEFAULT 1,
  event_count INTEGER NOT NULL DEFAULT 1,
  entry_page TEXT NOT NULL DEFAULT '/',
  exit_page TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT NOT NULL DEFAULT 'desktop',
  browser TEXT NOT NULL DEFAULT 'Chrome',
  os TEXT NOT NULL DEFAULT 'Windows',
  country_code TEXT NOT NULL DEFAULT 'IN',
  is_bounce BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, site_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_web_analytics_sessions_site
  ON public.web_analytics_sessions (site_id, start_time DESC);

-- 4. Ingestion Stored Procedure
CREATE OR REPLACE FUNCTION public.collect_web_analytics_batch(
  p_site_id TEXT,
  p_origin TEXT,
  p_events JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site public.web_analytics_sites%ROWTYPE;
  v_item JSONB;
  v_inserted_count INTEGER := 0;
  v_event_id TEXT;
  v_session_id TEXT;
  v_anon_id TEXT;
  v_event_name TEXT;
  v_url TEXT;
  v_path TEXT;
  v_ip_hash TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Validate Site ID
  SELECT * INTO v_site
  FROM public.web_analytics_sites
  WHERE site_id = p_site_id AND status != 'archived'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive site_id');
  END IF;

  -- 2. Process Batch
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    v_event_id := COALESCE(v_item->>'event_id', gen_random_uuid()::TEXT);
    v_session_id := COALESCE(v_item->>'session_id', 'sess_anon');
    v_anon_id := COALESCE(v_item->>'anonymous_id', 'anon_user');
    v_event_name := COALESCE(v_item->>'event_name', 'pageview');
    v_url := COALESCE(v_item->>'url', '/');
    v_path := COALESCE(v_item->>'path', '/');
    v_ip_hash := COALESCE(v_item->>'ip_hash', md5(COALESCE(p_origin, '') || v_anon_id));

    INSERT INTO public.web_analytics_events (
      tenant_id,
      environment,
      site_id,
      event_id,
      session_id,
      anonymous_id,
      event_name,
      url,
      path,
      hostname,
      referrer,
      referrer_domain,
      utm_source,
      utm_medium,
      utm_campaign,
      page_title,
      screen_resolution,
      viewport_size,
      language,
      timezone,
      user_agent,
      device_type,
      browser,
      os,
      country_code,
      country_name,
      city,
      ip_hash,
      properties,
      client_timestamp,
      server_timestamp
    ) VALUES (
      v_site.tenant_id,
      v_site.environment,
      v_site.site_id,
      v_event_id,
      v_session_id,
      v_anon_id,
      v_event_name,
      v_url,
      v_path,
      COALESCE(v_item->>'hostname', ''),
      v_item->>'referrer',
      v_item->>'referrer_domain',
      v_item->>'utm_source',
      v_item->>'utm_medium',
      v_item->>'utm_campaign',
      v_item->>'page_title',
      v_item->>'screen_resolution',
      v_item->>'viewport_size',
      COALESCE(v_item->>'language', 'en'),
      v_item->>'timezone',
      v_item->>'user_agent',
      COALESCE(v_item->>'device_type', 'desktop'),
      COALESCE(v_item->>'browser', 'Chrome'),
      COALESCE(v_item->>'os', 'Windows'),
      COALESCE(v_item->>'country_code', 'IN'),
      COALESCE(v_item->>'country_name', 'India'),
      v_item->>'city',
      v_ip_hash,
      COALESCE(v_item->'properties', '{}'::JSONB),
      COALESCE((v_item->>'client_timestamp')::TIMESTAMPTZ, v_now),
      v_now
    )
    ON CONFLICT (tenant_id, site_id, event_id) DO NOTHING;

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  -- 3. Update Site Status & Counters
  UPDATE public.web_analytics_sites
  SET
    status = 'active',
    last_event_at = v_now,
    total_events = total_events + v_inserted_count,
    total_pageviews = total_pageviews + v_inserted_count,
    updated_at = v_now
  WHERE id = v_site.id;

  RETURN jsonb_build_object(
    'success', true,
    'site_id', v_site.site_id,
    'processed', v_inserted_count
  );
END;
$$;
