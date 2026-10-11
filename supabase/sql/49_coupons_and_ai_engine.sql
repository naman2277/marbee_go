-- -----------------------------------------------------------------------------
-- 49_coupons_and_ai_engine.sql
-- Production Schema for Coupons, Voucher Codes, AI Providers, Voice & Task Agents
-- -----------------------------------------------------------------------------

-- 1. Coupon & Voucher Campaigns Table
CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  code_pattern TEXT NOT NULL,
  is_generic BOOLEAN NOT NULL DEFAULT false,
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_shipping', 'points_multiplier', 'free_gift')),
  discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  min_cart_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  max_discount_cap NUMERIC(10, 2),
  total_codes_generated INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  max_redemptions_per_customer INTEGER NOT NULL DEFAULT 1,
  max_total_redemptions INTEGER,
  budget_cap NUMERIC(12, 2),
  revenue_generated NUMERIC(14, 2) NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'expired', 'exhausted')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_campaigns_tenant
  ON public.coupon_campaigns (tenant_id, environment, status);

-- 2. Unique Single-Use Voucher Codes Table
CREATE TABLE IF NOT EXISTS public.coupon_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.coupon_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  code TEXT NOT NULL,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_by_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  is_redeemed BOOLEAN NOT NULL DEFAULT false,
  redeemed_at TIMESTAMPTZ,
  order_id TEXT,
  discount_applied NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, code)
);

CREATE INDEX IF NOT EXISTS idx_coupon_codes_campaign
  ON public.coupon_codes (campaign_id, is_redeemed, is_claimed);

-- 3. AI Model Engine Configurations
CREATE TABLE IF NOT EXISTS public.ai_engine_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini', 'claude', 'grok', 'deepseek', 'custom_llm')),
  provider_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  api_key_encrypted TEXT,
  base_url TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'unconfigured' CHECK (status IN ('connected', 'unconfigured', 'testing')),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  tokens_used_this_month BIGINT NOT NULL DEFAULT 0,
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 2048,
  enabled_features JSONB NOT NULL DEFAULT '{"decisionEngine":true,"copywriting":true,"rfmAnalysis":true,"voiceAgents":false,"autonomousTasks":true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, provider, model_name)
);

-- 4. Voice AI Conversational Agents
CREATE TABLE IF NOT EXISTS public.voice_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  platform TEXT NOT NULL CHECK (platform IN ('elevenlabs', 'openai_realtime', 'vapi', 'retell')),
  platform_name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'English',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  phone_assigned TEXT,
  use_case TEXT NOT NULL DEFAULT 'outbound_cart_recovery',
  total_calls_made INTEGER NOT NULL DEFAULT 0,
  avg_call_duration_sec INTEGER NOT NULL DEFAULT 0,
  sentiment_positive_rate INTEGER NOT NULL DEFAULT 0,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Autonomous Task Automation Swarms
CREATE TABLE IF NOT EXISTS public.autonomous_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Bot',
  enabled BOOLEAN NOT NULL DEFAULT false,
  cadence TEXT NOT NULL DEFAULT 'daily' CHECK (cadence IN ('real_time', 'hourly', 'daily', 'weekly')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  total_actions_taken INTEGER NOT NULL DEFAULT 0,
  current_status TEXT NOT NULL DEFAULT 'idle' CHECK (current_status IN ('idle', 'executing', 'sleeping')),
  recent_log TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
