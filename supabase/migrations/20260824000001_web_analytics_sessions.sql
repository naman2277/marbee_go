-- ============================================================
-- Migration: web_analytics_sessions + web_analytics_sites
-- Adds proper session-level storage for the Marbee SDK
-- ============================================================

-- ── web_analytics_sites: ensure it exists with write_key column ──────────
CREATE TABLE IF NOT EXISTS web_analytics_sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  environment     text NOT NULL DEFAULT 'production',
  site_id         text NOT NULL UNIQUE,
  name            text NOT NULL,
  domain          text NOT NULL,
  write_key       text NOT NULL,
  verification_token text,
  allowed_origins text[] DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending_verification',
  last_event_at   timestamptz,
  total_pageviews bigint NOT NULL DEFAULT 0,
  total_events    bigint NOT NULL DEFAULT 0,
  total_sessions  bigint NOT NULL DEFAULT 0,
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Add write_key column if upgrading from older schema
ALTER TABLE web_analytics_sites ADD COLUMN IF NOT EXISTS write_key text;
ALTER TABLE web_analytics_sites ADD COLUMN IF NOT EXISTS verification_token text;

-- ── web_analytics_events: full event log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS web_analytics_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  environment      text NOT NULL DEFAULT 'production',
  site_id          text NOT NULL,
  event_id         text NOT NULL,
  session_id       text NOT NULL,
  anonymous_id     text NOT NULL,
  customer_id      text,
  event_name       text NOT NULL,
  url              text,
  path             text,
  hostname         text,
  page_title       text,
  referrer         text,
  referrer_domain  text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  screen_resolution text,
  viewport_size    text,
  language         text,
  timezone         text,
  user_agent       text,
  device_type      text,
  browser          text,
  os               text,
  country_code     char(2),
  country_name     text,
  city             text,
  region           text,
  ip_hash          text,
  is_bot           boolean NOT NULL DEFAULT false,
  properties       jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_timestamp timestamptz NOT NULL,
  server_timestamp timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, site_id, event_id)
);

-- ── web_analytics_sessions: one row per session ───────────────────────────
CREATE TABLE IF NOT EXISTS web_analytics_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  environment      text NOT NULL DEFAULT 'production',
  site_id          text NOT NULL,
  session_id       text NOT NULL,
  anonymous_id     text NOT NULL,
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  duration_sec     integer NOT NULL DEFAULT 0,
  active_time_sec  integer NOT NULL DEFAULT 0,
  page_count       integer NOT NULL DEFAULT 1,
  pages_visited    text[] DEFAULT '{}',
  max_scroll_depth integer NOT NULL DEFAULT 0,  -- 0-100
  click_count      integer NOT NULL DEFAULT 0,
  rage_click_count integer NOT NULL DEFAULT 0,
  form_submit_count integer NOT NULL DEFAULT 0,
  js_error_count   integer NOT NULL DEFAULT 0,
  converted        boolean NOT NULL DEFAULT false,
  device_type      text,
  browser          text,
  os               text,
  country_code     char(2),
  country_name     text,
  city             text,
  region           text,
  referrer         text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  landing_page     text,
  exit_page        text,
  is_bot           boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, site_id, session_id)
);

-- ── Indexes for fast dashboard queries ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wa_events_site_ts   ON web_analytics_events (site_id, server_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wa_events_session    ON web_analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_wa_events_anon       ON web_analytics_events (anonymous_id);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_site_ts  ON web_analytics_sessions (site_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_anon     ON web_analytics_sessions (anonymous_id);
CREATE INDEX IF NOT EXISTS idx_wa_sites_tenant      ON web_analytics_sites (tenant_id);

-- ── RLS: allow service role to write, anon cannot ─────────────────────────
ALTER TABLE web_analytics_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_analytics_sites    ENABLE ROW LEVEL SECURITY;

-- Service role bypass (Edge Function uses service role)
CREATE POLICY IF NOT EXISTS "service_role_all_events"   ON web_analytics_events   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_sessions" ON web_analytics_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_sites"    ON web_analytics_sites    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their own tenant's data
CREATE POLICY IF NOT EXISTS "auth_read_events"   ON web_analytics_events   FOR SELECT TO authenticated USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');
CREATE POLICY IF NOT EXISTS "auth_read_sessions" ON web_analytics_sessions FOR SELECT TO authenticated USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');
CREATE POLICY IF NOT EXISTS "auth_read_sites"    ON web_analytics_sites    FOR SELECT TO authenticated USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');
