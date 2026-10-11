-- Migration: SaaS AI Engine & Chat Persistence Tables
-- Purpose: Establish database-backed persistence for LLMs, Voice, Custom Buddy personas, and chats

-- 1. AI Model Providers Configuration
CREATE TABLE IF NOT EXISTS public.ai_engine_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  provider TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  api_key TEXT,
  base_url TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'unconfigured',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  tokens_used_this_month BIGINT NOT NULL DEFAULT 0,
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 2048,
  enabled_features JSONB NOT NULL DEFAULT '{"decisionEngine":true,"copywriting":true,"rfmAnalysis":true,"voiceAgents":false,"autonomousTasks":true}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, provider, model_name)
);

-- 2. Voice AI Agents Configuration
CREATE TABLE IF NOT EXISTS public.voice_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  platform TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'English',
  status TEXT NOT NULL DEFAULT 'inactive',
  phone_assigned TEXT,
  use_case TEXT NOT NULL DEFAULT 'outbound_cart_recovery',
  total_calls_made INTEGER NOT NULL DEFAULT 0,
  avg_call_duration_sec INTEGER NOT NULL DEFAULT 0,
  sentiment_positive_rate INTEGER NOT NULL DEFAULT 0,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, id)
);

-- 3. Voice & Avatar AI Adapters Configuration
CREATE TABLE IF NOT EXISTS public.voice_avatar_adapters (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unconfigured',
  api_key TEXT,
  avatar_id TEXT,
  voice_id TEXT,
  model TEXT,
  webrtc_endpoint TEXT,
  allowed_origins TEXT,
  system_prompt TEXT,
  initial_greeting TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  docs_url TEXT,
  integration_guide JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, id)
);

-- 4. Custom AI Buddy Agents Configuration
CREATE TABLE IF NOT EXISTS public.buddy_agents (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  indic_name TEXT,
  role TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'female',
  voice_label TEXT,
  status TEXT NOT NULL DEFAULT 'online',
  image_url TEXT,
  greeting TEXT,
  context_scope TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, id)
);

-- 5. AI Chat Sessions History (Replaces LocalStorage for Chat History)
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  title TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Enablement & Policies
ALTER TABLE public.ai_engine_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_avatar_adapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_engine_providers_all ON public.ai_engine_providers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY voice_agents_all ON public.voice_agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY voice_avatar_adapters_all ON public.voice_avatar_adapters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY buddy_agents_all ON public.buddy_agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY ai_chat_sessions_all ON public.ai_chat_sessions FOR ALL USING (true) WITH CHECK (true);
