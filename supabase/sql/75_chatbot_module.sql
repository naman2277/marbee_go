-- =============================================================================
-- MARBEE — Chat Bot Module (Content → Chat Bots)
-- Production multi-tenant AI chatbot platform: bot config, versioning, LLM
-- context, knowledge sources, data-capture fields, schema mapping, CTAs,
-- conversations/messages/captured-data, CTA tracking, publish configs and
-- audit logs. Additive; safe to re-run. Run AFTER 01_marbee_schema.sql,
-- 37_access_management_rbac.sql (user_tenant_ids helper), and
-- 49_coupons_and_ai_engine.sql (ai_engine_providers).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Chatbots (core config)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,

  welcome_message TEXT NOT NULL DEFAULT 'Hi! How can I help you today?',
  placeholder_text TEXT NOT NULL DEFAULT 'Type your message…',
  primary_language TEXT NOT NULL DEFAULT 'en',
  supported_languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
  business_name TEXT,
  powered_by_text TEXT NOT NULL DEFAULT 'Powered by Marbee',
  show_powered_by BOOLEAN NOT NULL DEFAULT TRUE,

  conversation_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  max_conversation_length INTEGER NOT NULL DEFAULT 50,
  enable_conversation_history BOOLEAN NOT NULL DEFAULT TRUE,
  enable_sentiment_analysis BOOLEAN NOT NULL DEFAULT TRUE,
  enable_data_capture BOOLEAN NOT NULL DEFAULT TRUE,

  -- LLM configuration (references Settings → AI Engine; never store keys here)
  llm_provider_id UUID REFERENCES public.ai_engine_providers(id) ON DELETE SET NULL,
  llm_temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.70,
  llm_max_output_tokens INTEGER NOT NULL DEFAULT 1024,
  llm_system_instruction TEXT,
  llm_response_style TEXT NOT NULL DEFAULT 'balanced'
    CHECK (llm_response_style IN ('concise', 'balanced', 'detailed')),
  llm_streaming BOOLEAN NOT NULL DEFAULT FALSE,
  llm_timeout_seconds INTEGER NOT NULL DEFAULT 20,
  llm_retry_count INTEGER NOT NULL DEFAULT 2,

  -- Chat context (system instructions, personality, rules, escalation, fallback…)
  context JSONB NOT NULL DEFAULT '{
    "personality": "",
    "business_context": "",
    "product_info": "",
    "faqs": "",
    "policies": "",
    "conversation_rules": "",
    "do_rules": [],
    "dont_rules": [],
    "escalation_rules": "",
    "fallback_response": "I''m sorry, I don''t have that information right now. Would you like me to connect you with our team?",
    "restricted_topics": [],
    "dynamic_variables": {}
  }'::jsonb,
  context_version INTEGER NOT NULL DEFAULT 1,

  -- Schema configuration (target Marbee schema for captured data)
  target_schema_id UUID REFERENCES public.schema_definitions(id) ON DELETE SET NULL,
  insert_mode TEXT NOT NULL DEFAULT 'upsert' CHECK (insert_mode IN ('insert', 'update', 'upsert')),
  upsert_key TEXT,
  duplicate_handling TEXT NOT NULL DEFAULT 'update_existing'
    CHECK (duplicate_handling IN ('update_existing', 'skip', 'create_new')),
  validation_behaviour TEXT NOT NULL DEFAULT 'reject_invalid'
    CHECK (validation_behaviour IN ('reject_invalid', 'store_anyway')),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'testing', 'published', 'paused', 'archived')),
  published_version_id UUID,

  -- Retention (section 21)
  conversation_retention_days INTEGER NOT NULL DEFAULT 90,
  message_retention_days INTEGER NOT NULL DEFAULT 90,
  captured_data_retention_days INTEGER NOT NULL DEFAULT 365,
  anonymous_session_retention_days INTEGER NOT NULL DEFAULT 30,

  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbots_tenant ON public.mb_chatbots (tenant_id, environment, status);

ALTER TABLE public.mb_chatbots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbots_tenant_access" ON public.mb_chatbots;
CREATE POLICY "mb_chatbots_tenant_access" ON public.mb_chatbots FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbots TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Versions (immutable config snapshots; conversations pin a version)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  version_label TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  config_snapshot JSONB NOT NULL,
  change_summary TEXT,

  published_at TIMESTAMPTZ,
  published_by UUID,
  published_by_name TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (chatbot_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbot_versions_bot ON public.mb_chatbot_versions (chatbot_id, version_number DESC);

ALTER TABLE public.mb_chatbot_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbot_versions_tenant_access" ON public.mb_chatbot_versions;
CREATE POLICY "mb_chatbot_versions_tenant_access" ON public.mb_chatbot_versions FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_versions TO authenticated;

ALTER TABLE public.mb_chatbots
  ADD CONSTRAINT mb_chatbots_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES public.mb_chatbot_versions(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. Knowledge sources
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  source_type TEXT NOT NULL CHECK (source_type IN (
    'content_block', 'document', 'faq', 'knowledge_article', 'url',
    'product_catalog', 'schema_data', 'manual_text'
  )),
  source_name TEXT NOT NULL,
  source_ref TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  indexing_status TEXT NOT NULL DEFAULT 'pending' CHECK (indexing_status IN ('pending', 'indexed', 'failed')),
  last_indexed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbot_knowledge_bot ON public.mb_chatbot_knowledge_sources (chatbot_id, status);

ALTER TABLE public.mb_chatbot_knowledge_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbot_knowledge_tenant_access" ON public.mb_chatbot_knowledge_sources;
CREATE POLICY "mb_chatbot_knowledge_tenant_access" ON public.mb_chatbot_knowledge_sources FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_knowledge_sources TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Data-capture field definitions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  field_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  description TEXT,
  data_type TEXT NOT NULL DEFAULT 'string'
    CHECK (data_type IN ('string', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'email', 'phone', 'json')),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  validation JSONB NOT NULL DEFAULT '{}',
  collection_order INTEGER NOT NULL DEFAULT 0,
  ask_question TEXT,
  retry_count INTEGER NOT NULL DEFAULT 2,
  default_value TEXT,
  pii_flag BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (chatbot_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbot_fields_bot ON public.mb_chatbot_fields (chatbot_id, collection_order);

ALTER TABLE public.mb_chatbot_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbot_fields_tenant_access" ON public.mb_chatbot_fields;
CREATE POLICY "mb_chatbot_fields_tenant_access" ON public.mb_chatbot_fields FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_fields TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Field → Schema mappings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  source_field_key TEXT NOT NULL,
  target_field TEXT NOT NULL,
  transformation TEXT NOT NULL DEFAULT 'none' CHECK (transformation IN (
    'none', 'lowercase', 'uppercase', 'trim', 'format_phone', 'format_date',
    'default_value', 'static_value', 'concatenate', 'expression'
  )),
  transformation_config JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (chatbot_id, target_field)
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbot_mappings_bot ON public.mb_chatbot_field_mappings (chatbot_id);

ALTER TABLE public.mb_chatbot_field_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbot_mappings_tenant_access" ON public.mb_chatbot_field_mappings;
CREATE POLICY "mb_chatbot_mappings_tenant_access" ON public.mb_chatbot_field_mappings FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_field_mappings TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. CTAs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_ctas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  cta_key TEXT NOT NULL,
  name TEXT NOT NULL,
  button_label TEXT NOT NULL,
  description TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'book_now', 'contact_us', 'request_callback', 'submit_lead',
    'visit_website', 'whatsapp', 'call', 'open_form', 'custom_url'
  )),
  destination TEXT,
  conditions JSONB NOT NULL DEFAULT '{}',
  visibility_rule TEXT NOT NULL DEFAULT 'always' CHECK (visibility_rule IN ('always', 'conditional')),
  tracking_params JSONB NOT NULL DEFAULT '{}',
  conversion_event TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (chatbot_id, cta_key)
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbot_ctas_bot ON public.mb_chatbot_ctas (chatbot_id, is_active);

ALTER TABLE public.mb_chatbot_ctas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbot_ctas_tenant_access" ON public.mb_chatbot_ctas;
CREATE POLICY "mb_chatbot_ctas_tenant_access" ON public.mb_chatbot_ctas FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_ctas TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Sessions (anonymous visitor session, pre-dates a conversation)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  visitor_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  captured_attributes JSONB NOT NULL DEFAULT '{}',
  context_state JSONB NOT NULL DEFAULT '{}',
  conversation_id UUID,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbot_sessions_bot ON public.mb_chatbot_sessions (chatbot_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_mb_chatbot_sessions_expiry ON public.mb_chatbot_sessions (expires_at) WHERE status = 'active';

ALTER TABLE public.mb_chatbot_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbot_sessions_tenant_access" ON public.mb_chatbot_sessions;
CREATE POLICY "mb_chatbot_sessions_tenant_access" ON public.mb_chatbot_sessions FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_sessions TO authenticated;
-- No anon grant: the public runtime talks to sessions exclusively through the
-- chatbot-runtime Edge Function (service role), never straight from the browser.

-- ---------------------------------------------------------------------------
-- 8. Conversations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  chatbot_version_id UUID REFERENCES public.mb_chatbot_versions(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  session_id UUID REFERENCES public.mb_chatbot_sessions(id) ON DELETE SET NULL,
  visitor_id TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'web',

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned', 'escalated', 'converted')),
  language TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,

  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  sentiment_score NUMERIC(4, 3),
  intent TEXT,
  lead_status TEXT NOT NULL DEFAULT 'new'
    CHECK (lead_status IN ('new', 'in_progress', 'qualified', 'converted', 'dropped')),
  captured_data JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mb_conversations_tenant_bot_created
  ON public.mb_chatbot_conversations (tenant_id, chatbot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mb_conversations_bot_last_message
  ON public.mb_chatbot_conversations (chatbot_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_mb_conversations_session ON public.mb_chatbot_conversations (session_id);
CREATE INDEX IF NOT EXISTS idx_mb_conversations_visitor ON public.mb_chatbot_conversations (visitor_id);
CREATE INDEX IF NOT EXISTS idx_mb_conversations_status ON public.mb_chatbot_conversations (chatbot_id, status);
CREATE INDEX IF NOT EXISTS idx_mb_conversations_sentiment ON public.mb_chatbot_conversations (chatbot_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_mb_conversations_customer ON public.mb_chatbot_conversations (customer_id);

ALTER TABLE public.mb_chatbot_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_conversations_tenant_access" ON public.mb_chatbot_conversations;
CREATE POLICY "mb_conversations_tenant_access" ON public.mb_chatbot_conversations FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_conversations TO authenticated;

ALTER TABLE public.mb_chatbot_sessions
  ADD CONSTRAINT mb_chatbot_sessions_conversation_fk
  FOREIGN KEY (conversation_id) REFERENCES public.mb_chatbot_conversations(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 9. Messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.mb_chatbot_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  client_message_id TEXT,
  sequence_number INTEGER NOT NULL DEFAULT 0,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'bot', 'system', 'agent')),
  sender_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'button', 'cta', 'form', 'image', 'link', 'file', 'system_event')),
  message_text TEXT,
  message_json JSONB,

  llm_provider TEXT,
  llm_model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms INTEGER,

  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  sentiment_score NUMERIC(4, 3),
  intent TEXT,
  request_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mb_messages_idempotency
  ON public.mb_chatbot_messages (conversation_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mb_messages_conversation
  ON public.mb_chatbot_messages (conversation_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_mb_messages_tenant_created
  ON public.mb_chatbot_messages (tenant_id, created_at DESC);

ALTER TABLE public.mb_chatbot_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_messages_tenant_access" ON public.mb_chatbot_messages;
CREATE POLICY "mb_messages_tenant_access" ON public.mb_chatbot_messages FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Captured data (per-field provenance)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_captured_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.mb_chatbot_conversations(id) ON DELETE CASCADE,
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  field_id UUID REFERENCES public.mb_chatbot_fields(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL,
  field_value TEXT,
  normalized_value TEXT,
  data_type TEXT NOT NULL DEFAULT 'string',
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.0,
  source_message_id UUID REFERENCES public.mb_chatbot_messages(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapped_status TEXT NOT NULL DEFAULT 'pending' CHECK (mapped_status IN ('pending', 'mapped', 'failed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (conversation_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_mb_captured_data_bot ON public.mb_chatbot_captured_data (chatbot_id, field_name);
CREATE INDEX IF NOT EXISTS idx_mb_captured_data_conversation ON public.mb_chatbot_captured_data (conversation_id);
CREATE INDEX IF NOT EXISTS idx_mb_captured_data_email
  ON public.mb_chatbot_captured_data (chatbot_id, normalized_value) WHERE field_name = 'email';

ALTER TABLE public.mb_chatbot_captured_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_captured_data_tenant_access" ON public.mb_chatbot_captured_data;
CREATE POLICY "mb_captured_data_tenant_access" ON public.mb_chatbot_captured_data FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_captured_data TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Validation failures (section 41 — troubleshooting trail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_validation_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.mb_chatbot_conversations(id) ON DELETE CASCADE,
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  field_name TEXT NOT NULL,
  attempted_value TEXT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mb_validation_failures_bot
  ON public.mb_chatbot_validation_failures (chatbot_id, created_at DESC);

ALTER TABLE public.mb_chatbot_validation_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_validation_failures_tenant_access" ON public.mb_chatbot_validation_failures;
CREATE POLICY "mb_validation_failures_tenant_access" ON public.mb_chatbot_validation_failures FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_validation_failures TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. CTA events (impression + conversion tracking)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_cta_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.mb_chatbot_conversations(id) ON DELETE CASCADE,
  chatbot_id UUID NOT NULL REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  cta_id UUID NOT NULL REFERENCES public.mb_chatbot_ctas(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('shown', 'clicked', 'completed', 'failed')),
  destination TEXT,
  clicked_at TIMESTAMPTZ,
  visitor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mb_cta_events_bot ON public.mb_chatbot_cta_events (chatbot_id, cta_id, event_type);
CREATE INDEX IF NOT EXISTS idx_mb_cta_events_conversation ON public.mb_chatbot_cta_events (conversation_id);

ALTER TABLE public.mb_chatbot_cta_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_cta_events_tenant_access" ON public.mb_chatbot_cta_events;
CREATE POLICY "mb_cta_events_tenant_access" ON public.mb_chatbot_cta_events FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_cta_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 13. Publish / deployment configuration
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_publish_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatbot_id UUID NOT NULL UNIQUE REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  public_url_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  public_slug TEXT NOT NULL,

  iframe_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  iframe_width TEXT NOT NULL DEFAULT '100%',
  iframe_height TEXT NOT NULL DEFAULT '700',
  iframe_border_radius TEXT NOT NULL DEFAULT '16',
  iframe_theme TEXT NOT NULL DEFAULT 'light' CHECK (iframe_theme IN ('light', 'dark')),
  iframe_position TEXT NOT NULL DEFAULT 'inline',

  widget_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  widget_position TEXT NOT NULL DEFAULT 'bottom-right'
    CHECK (widget_position IN ('bottom-right', 'bottom-left')),
  widget_icon TEXT,
  widget_greeting TEXT,
  widget_primary_color TEXT NOT NULL DEFAULT '#4f46e5',

  api_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, environment, public_slug)
);

ALTER TABLE public.mb_chatbot_publish_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_publish_configs_tenant_access" ON public.mb_chatbot_publish_configs;
CREATE POLICY "mb_publish_configs_tenant_access" ON public.mb_chatbot_publish_configs FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_publish_configs TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Audit logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mb_chatbot_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT,
  chatbot_id UUID REFERENCES public.mb_chatbots(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'updated', 'published', 'paused', 'resumed', 'archived', 'deleted',
    'llm_changed', 'context_changed', 'schema_changed', 'mapping_changed', 'cta_changed'
  )),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mb_chatbot_audit_bot ON public.mb_chatbot_audit_logs (chatbot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mb_chatbot_audit_tenant ON public.mb_chatbot_audit_logs (tenant_id, created_at DESC);

ALTER TABLE public.mb_chatbot_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mb_chatbot_audit_tenant_access" ON public.mb_chatbot_audit_logs;
CREATE POLICY "mb_chatbot_audit_tenant_access" ON public.mb_chatbot_audit_logs FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.mb_chatbot_audit_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- 15. updated_at triggers (reuse shared trigger fn if present, else define)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    CREATE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_mb_chatbots_updated_at ON public.mb_chatbots;
CREATE TRIGGER trg_mb_chatbots_updated_at BEFORE UPDATE ON public.mb_chatbots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mb_chatbot_knowledge_updated_at ON public.mb_chatbot_knowledge_sources;
CREATE TRIGGER trg_mb_chatbot_knowledge_updated_at BEFORE UPDATE ON public.mb_chatbot_knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mb_chatbot_fields_updated_at ON public.mb_chatbot_fields;
CREATE TRIGGER trg_mb_chatbot_fields_updated_at BEFORE UPDATE ON public.mb_chatbot_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mb_chatbot_mappings_updated_at ON public.mb_chatbot_field_mappings;
CREATE TRIGGER trg_mb_chatbot_mappings_updated_at BEFORE UPDATE ON public.mb_chatbot_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mb_chatbot_ctas_updated_at ON public.mb_chatbot_ctas;
CREATE TRIGGER trg_mb_chatbot_ctas_updated_at BEFORE UPDATE ON public.mb_chatbot_ctas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mb_conversations_updated_at ON public.mb_chatbot_conversations;
CREATE TRIGGER trg_mb_conversations_updated_at BEFORE UPDATE ON public.mb_chatbot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mb_captured_data_updated_at ON public.mb_chatbot_captured_data;
CREATE TRIGGER trg_mb_captured_data_updated_at BEFORE UPDATE ON public.mb_chatbot_captured_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mb_publish_configs_updated_at ON public.mb_chatbot_publish_configs;
CREATE TRIGGER trg_mb_publish_configs_updated_at BEFORE UPDATE ON public.mb_chatbot_publish_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 16. Demo chatbot (visible immediately in the list for the demo tenant)
-- ---------------------------------------------------------------------------

INSERT INTO public.mb_chatbots (
  id, tenant_id, environment, name, slug, description, welcome_message,
  business_name, status, llm_response_style, context
) VALUES (
  '90000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'production',
  'Support Concierge',
  'support-concierge',
  'Answers product questions, captures lead details, and routes qualified visitors to sales.',
  'Hi! How can I help you today?',
  'Marbee',
  'draft',
  'balanced',
  jsonb_build_object(
    'personality', 'Friendly, concise, and helpful. Never pushy.',
    'business_context', 'You are a customer support assistant for Marbee, a customer data & marketing automation platform.',
    'product_info', 'Marbee unifies customer data, journeys, offers, and messaging in one platform.',
    'faqs', 'Q: Is there a free trial? A: Yes, 14 days, no credit card required.',
    'policies', '',
    'conversation_rules', 'Keep responses under 3 sentences unless asked for detail.',
    'do_rules', jsonb_build_array('Ask for the visitor''s email before ending the conversation', 'Offer to connect to sales when the visitor asks about pricing'),
    'dont_rules', jsonb_build_array('Never invent pricing figures', 'Never promise a specific delivery date'),
    'escalation_rules', 'If the visitor is frustrated or asks for a human, offer the "Talk to Sales" CTA.',
    'fallback_response', 'I''m not totally sure about that — want me to connect you with our team?',
    'restricted_topics', jsonb_build_array('competitor pricing', 'legal advice'),
    'dynamic_variables', '{}'::jsonb
  )
)
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

INSERT INTO public.mb_chatbot_fields (chatbot_id, tenant_id, environment, field_key, display_label, data_type, required, collection_order, ask_question, pii_flag)
SELECT '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', v.field_key, v.display_label, v.data_type, v.required, v.collection_order, v.ask_question, v.pii_flag
FROM (VALUES
  ('first_name', 'First Name', 'string', TRUE, 1, 'What''s your first name?', FALSE),
  ('email', 'Email', 'email', TRUE, 2, 'What''s the best email to reach you at?', TRUE),
  ('requirement', 'Requirement', 'string', FALSE, 3, 'What are you looking to do with Marbee?', FALSE)
) AS v(field_key, display_label, data_type, required, collection_order, ask_question, pii_flag)
WHERE EXISTS (SELECT 1 FROM public.mb_chatbots WHERE id = '90000000-0000-0000-0000-000000000001')
ON CONFLICT (chatbot_id, field_key) DO NOTHING;

INSERT INTO public.mb_chatbot_ctas (chatbot_id, tenant_id, environment, cta_key, name, button_label, action_type, destination, visibility_rule, conditions, sort_order)
SELECT '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', v.cta_key, v.name, v.button_label, v.action_type, v.destination, v.visibility_rule, v.conditions::jsonb, v.sort_order
FROM (VALUES
  ('talk_to_sales', 'Talk to Sales', 'Talk to Sales', 'contact_us', 'mailto:sales@marbee.io', 'conditional', '{"field":"lead_status","operator":"equals","value":"qualified"}', 1),
  ('visit_website', 'Visit Website', 'Visit Website', 'visit_website', 'https://marbee.io', 'always', '{}', 2)
) AS v(cta_key, name, button_label, action_type, destination, visibility_rule, conditions, sort_order)
WHERE EXISTS (SELECT 1 FROM public.mb_chatbots WHERE id = '90000000-0000-0000-0000-000000000001')
ON CONFLICT (chatbot_id, cta_key) DO NOTHING;

INSERT INTO public.mb_chatbot_publish_configs (chatbot_id, tenant_id, environment, public_slug, widget_greeting)
SELECT '90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'support-concierge', 'Hi! Have a question? Chat with us.'
WHERE EXISTS (SELECT 1 FROM public.mb_chatbots WHERE id = '90000000-0000-0000-0000-000000000001')
ON CONFLICT (chatbot_id) DO NOTHING;
