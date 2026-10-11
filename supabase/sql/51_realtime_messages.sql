-- -----------------------------------------------------------------------------
-- 51_realtime_messages.sql
-- Real-Time Messages Engine (RTM): event-triggered transactional messaging —
-- one API call in, one rendered message out, via the default or a BYOP provider.
-- Supersedes the thin `real_time_triggers` stub.
-- Run AFTER 37_access_management_rbac.sql (needs require_permission / user_tenant_ids).
-- Safe to re-run.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. Definitions — one row per message type (e.g. "order_shipped")
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rtm_definitions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment        TEXT NOT NULL DEFAULT 'production',
  slug               TEXT NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  event_type         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'active', 'paused')),
  latency_class      TEXT NOT NULL DEFAULT 'standard'
                       CHECK (latency_class IN ('standard', 'hot')),
  is_transactional   BOOLEAN NOT NULL DEFAULT TRUE,
  default_channel    TEXT NOT NULL DEFAULT 'web_push'
                       CHECK (default_channel IN ('web_push', 'sms', 'email', 'whatsapp', 'rcs')),
  fallback_channels  TEXT[] NOT NULL DEFAULT '{}',
  filters            JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- payload_schema: [{ "key": "order_id", "type": "string", "required": true, "example": "A-2231", "pii": false }, ...]
  payload_schema     JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- guardrails: { "dedupe": { "keys": ["order_id"], "window_seconds": 600 },
  --              "rate_per_recipient": { "max": 5, "window_seconds": 3600 },
  --              "spend_cap_credits_per_day": 0, "quiet_hours": null, "require_consent": false }
  guardrails         JSONB NOT NULL DEFAULT '{}'::JSONB,
  schema_version     INTEGER NOT NULL DEFAULT 1,
  published_at       TIMESTAMPTZ,
  published_config   JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID REFERENCES auth.users(id),
  UNIQUE (tenant_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS idx_rtm_definitions_event
  ON public.rtm_definitions (tenant_id, environment, event_type)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS rtm_definitions_updated_at ON public.rtm_definitions;
CREATE TRIGGER rtm_definitions_updated_at BEFORE UPDATE ON public.rtm_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 2. Templates — one per (definition, channel, locale)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rtm_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id  UUID NOT NULL REFERENCES public.rtm_definitions(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL
                   CHECK (channel IN ('web_push', 'sms', 'email', 'whatsapp', 'rcs')),
  locale         TEXT NOT NULL DEFAULT 'default',
  -- content shape depends on channel:
  --   web_push : { title, body, icon_url, image_url, click_url, buttons: [{title,url}] }
  --   sms      : { body, sender_id }
  --   email    : { subject, preheader, from_name, html }
  --   whatsapp : { template_name, variables: ["{{data.order_id}}", ...] }
  content        JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- missing_var_policy: 'fallback' | 'skip' | 'fail'
  missing_var_policy TEXT NOT NULL DEFAULT 'fallback'
                   CHECK (missing_var_policy IN ('fallback', 'skip', 'fail')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (definition_id, channel, locale)
);

DROP TRIGGER IF EXISTS rtm_templates_updated_at ON public.rtm_templates;
CREATE TRIGGER rtm_templates_updated_at BEFORE UPDATE ON public.rtm_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3. Messages — the high-volume table. Every call gets a row and a trace.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rtm_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          TEXT NOT NULL,
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment         TEXT NOT NULL DEFAULT 'production',
  definition_id       UUID REFERENCES public.rtm_definitions(id) ON DELETE SET NULL,
  event_type          TEXT NOT NULL,
  idempotency_key     TEXT,
  recipient           JSONB NOT NULL DEFAULT '{}'::JSONB,
  resolved_customer_id UUID,
  payload             JSONB NOT NULL DEFAULT '{}'::JSONB,
  channel             TEXT,
  locale              TEXT,
  status              TEXT NOT NULL DEFAULT 'accepted'
                        CHECK (status IN (
                          'accepted', 'no_match', 'invalid', 'matched', 'rendered',
                          'suppressed', 'skipped', 'sent', 'delivered', 'failed', 'dead_letter'
                        )),
  -- state_history: [{ "state": "accepted", "at": "...", "detail": "..." }, ...]
  state_history       JSONB NOT NULL DEFAULT '[]'::JSONB,
  rendered            JSONB,
  provider            TEXT,
  provider_message_id TEXT,
  reason_code         TEXT,
  error_detail        TEXT,
  cost_credits        INTEGER NOT NULL DEFAULT 0,
  attempts            INTEGER NOT NULL DEFAULT 0,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at             TIMESTAMPTZ,
  terminal_at         TIMESTAMPTZ,
  UNIQUE (tenant_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_rtm_messages_feed
  ON public.rtm_messages (tenant_id, environment, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_rtm_messages_definition
  ON public.rtm_messages (definition_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_rtm_messages_status
  ON public.rtm_messages (tenant_id, environment, status, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rtm_messages_idem
  ON public.rtm_messages (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- 4. Idempotency ledger — short-lived, swept by cron
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rtm_idempotency (
  tenant_id       UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  message_id      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  PRIMARY KEY (tenant_id, idempotency_key)
);

-- =============================================================================
-- 5. Usage rollup — hourly-grained counters for billing + dashboards
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rtm_usage_daily (
  tenant_id      UUID NOT NULL,
  environment    TEXT NOT NULL,
  definition_id  UUID NOT NULL,
  day            DATE NOT NULL,
  channel        TEXT NOT NULL DEFAULT 'web_push',
  accepted       BIGINT NOT NULL DEFAULT 0,
  sent           BIGINT NOT NULL DEFAULT 0,
  delivered      BIGINT NOT NULL DEFAULT 0,
  failed         BIGINT NOT NULL DEFAULT 0,
  suppressed     BIGINT NOT NULL DEFAULT 0,
  credits        BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, environment, definition_id, day, channel)
);

CREATE OR REPLACE FUNCTION public.rtm_bump_usage(
  p_tenant_id UUID, p_environment TEXT, p_definition_id UUID,
  p_channel TEXT, p_metric TEXT, p_credits BIGINT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_definition_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.rtm_usage_daily AS u
    (tenant_id, environment, definition_id, day, channel, accepted, sent, delivered, failed, suppressed, credits)
  VALUES (
    p_tenant_id, p_environment, p_definition_id, CURRENT_DATE, COALESCE(p_channel, 'web_push'),
    (p_metric = 'accepted')::INT, (p_metric = 'sent')::INT, (p_metric = 'delivered')::INT,
    (p_metric = 'failed')::INT, (p_metric = 'suppressed')::INT, GREATEST(p_credits, 0)
  )
  ON CONFLICT (tenant_id, environment, definition_id, day, channel) DO UPDATE SET
    accepted   = u.accepted   + (p_metric = 'accepted')::INT,
    sent       = u.sent       + (p_metric = 'sent')::INT,
    delivered  = u.delivered  + (p_metric = 'delivered')::INT,
    failed     = u.failed     + (p_metric = 'failed')::INT,
    suppressed = u.suppressed + (p_metric = 'suppressed')::INT,
    credits    = u.credits    + GREATEST(p_credits, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rtm_bump_usage(UUID, TEXT, UUID, TEXT, TEXT, BIGINT) TO service_role;

-- =============================================================================
-- 6. RLS
-- =============================================================================

ALTER TABLE public.rtm_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rtm_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rtm_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rtm_usage_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rtm_idempotency  ENABLE ROW LEVEL SECURITY;  -- no policy: service-role only

DROP POLICY IF EXISTS "rtm_definitions_tenant" ON public.rtm_definitions;
CREATE POLICY "rtm_definitions_tenant" ON public.rtm_definitions FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "rtm_templates_tenant" ON public.rtm_templates;
CREATE POLICY "rtm_templates_tenant" ON public.rtm_templates FOR SELECT TO authenticated
  USING (definition_id IN (
    SELECT id FROM public.rtm_definitions WHERE tenant_id IN (SELECT public.user_tenant_ids())
  ));

DROP POLICY IF EXISTS "rtm_messages_tenant" ON public.rtm_messages;
CREATE POLICY "rtm_messages_tenant" ON public.rtm_messages FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "rtm_usage_tenant" ON public.rtm_usage_daily;
CREATE POLICY "rtm_usage_tenant" ON public.rtm_usage_daily FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT SELECT ON public.rtm_definitions, public.rtm_templates, public.rtm_messages, public.rtm_usage_daily TO authenticated;

-- =============================================================================
-- 7. Console RPCs (all writes go through here — validated, permission-checked)
-- =============================================================================

-- List definitions with a 7-day activity rollup
CREATE OR REPLACE FUNCTION public.rtm_list_definitions(p_tenant_id UUID, p_environment TEXT)
RETURNS TABLE (
  id UUID, slug TEXT, name TEXT, description TEXT, event_type TEXT, status TEXT,
  latency_class TEXT, is_transactional BOOLEAN, default_channel TEXT, fallback_channels TEXT[],
  updated_at TIMESTAMPTZ, published_at TIMESTAMPTZ,
  template_count BIGINT, accepted_7d BIGINT, sent_7d BIGINT, delivered_7d BIGINT, failed_7d BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'journeys.read');
  RETURN QUERY
  SELECT d.id, d.slug, d.name, d.description, d.event_type, d.status,
         d.latency_class, d.is_transactional, d.default_channel, d.fallback_channels,
         d.updated_at, d.published_at,
         (SELECT count(*) FROM public.rtm_templates t WHERE t.definition_id = d.id),
         COALESCE(u.accepted, 0)::BIGINT, COALESCE(u.sent, 0)::BIGINT, COALESCE(u.delivered, 0)::BIGINT, COALESCE(u.failed, 0)::BIGINT
  FROM public.rtm_definitions d
  LEFT JOIN LATERAL (
    SELECT sum(accepted) accepted, sum(sent) sent, sum(delivered) delivered, sum(failed) failed
    FROM public.rtm_usage_daily x
    WHERE x.definition_id = d.id AND x.day >= CURRENT_DATE - 6
  ) u ON TRUE
  WHERE d.tenant_id = p_tenant_id
    AND d.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  ORDER BY d.updated_at DESC;
END;
$$;

-- Full definition + its templates
CREATE OR REPLACE FUNCTION public.rtm_get_definition(p_tenant_id UUID, p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_def public.rtm_definitions%ROWTYPE; v_templates JSONB;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'journeys.read');
  SELECT * INTO v_def FROM public.rtm_definitions WHERE id = p_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Definition not found'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.channel, t.locale), '[]'::JSONB)
    INTO v_templates FROM public.rtm_templates t WHERE t.definition_id = p_id;
  RETURN to_jsonb(v_def) || jsonb_build_object('templates', v_templates);
END;
$$;

-- Create / update a definition and replace its templates in one call
CREATE OR REPLACE FUNCTION public.rtm_upsert_definition(
  p_tenant_id UUID, p_environment TEXT, p_id UUID,
  p_name TEXT, p_slug TEXT, p_description TEXT, p_event_type TEXT,
  p_latency_class TEXT, p_is_transactional BOOLEAN,
  p_default_channel TEXT, p_fallback_channels TEXT[],
  p_filters JSONB, p_payload_schema JSONB, p_guardrails JSONB,
  p_templates JSONB, p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID := p_id;
  v_slug TEXT := lower(regexp_replace(trim(COALESCE(NULLIF(p_slug, ''), p_event_type)), '[^a-z0-9]+', '_', 'g'));
  v_env TEXT := COALESCE(NULLIF(p_environment, ''), 'production');
  v_tpl JSONB;
  v_status TEXT := COALESCE(NULLIF(p_status, ''), 'draft');
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'journeys.write');

  IF trim(COALESCE(p_name, '')) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF trim(COALESCE(p_event_type, '')) = '' THEN RAISE EXCEPTION 'Event key is required'; END IF;
  IF v_slug !~ '^[a-z0-9](_?[a-z0-9])*$' THEN RAISE EXCEPTION 'Slug must be lowercase letters, numbers and underscores'; END IF;
  IF v_status = 'active' THEN PERFORM public.require_permission(p_tenant_id, 'journeys.publish'); END IF;
  IF COALESCE(p_default_channel, 'web_push') NOT IN ('web_push','sms','email','whatsapp','rcs') THEN
    RAISE EXCEPTION 'Unsupported channel: %', p_default_channel;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.rtm_definitions (
      tenant_id, environment, slug, name, description, event_type, status,
      latency_class, is_transactional, default_channel, fallback_channels,
      filters, payload_schema, guardrails, created_by,
      published_at, published_config
    ) VALUES (
      p_tenant_id, v_env, v_slug, trim(p_name), NULLIF(trim(COALESCE(p_description,'')),''),
      trim(p_event_type), v_status,
      COALESCE(NULLIF(p_latency_class,''),'standard'), COALESCE(p_is_transactional, TRUE),
      COALESCE(NULLIF(p_default_channel,''),'web_push'), COALESCE(p_fallback_channels, '{}'),
      COALESCE(p_filters, '[]'::JSONB), COALESCE(p_payload_schema, '[]'::JSONB),
      COALESCE(p_guardrails, '{}'::JSONB), auth.uid(),
      CASE WHEN v_status = 'active' THEN NOW() END,
      CASE WHEN v_status = 'active' THEN COALESCE(p_payload_schema, '[]'::JSONB) END
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rtm_definitions SET
      slug = v_slug, name = trim(p_name),
      description = NULLIF(trim(COALESCE(p_description,'')),''),
      event_type = trim(p_event_type), status = v_status,
      latency_class = COALESCE(NULLIF(p_latency_class,''),'standard'),
      is_transactional = COALESCE(p_is_transactional, TRUE),
      default_channel = COALESCE(NULLIF(p_default_channel,''),'web_push'),
      fallback_channels = COALESCE(p_fallback_channels, '{}'),
      filters = COALESCE(p_filters, '[]'::JSONB),
      payload_schema = COALESCE(p_payload_schema, '[]'::JSONB),
      guardrails = COALESCE(p_guardrails, '{}'::JSONB),
      schema_version = CASE WHEN payload_schema IS DISTINCT FROM COALESCE(p_payload_schema, '[]'::JSONB)
                            THEN schema_version + 1 ELSE schema_version END,
      published_at = CASE WHEN v_status = 'active' THEN COALESCE(published_at, NOW()) ELSE published_at END,
      published_config = CASE WHEN v_status = 'active' THEN COALESCE(p_payload_schema, '[]'::JSONB) ELSE published_config END
    WHERE id = v_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Definition not found'; END IF;
  END IF;

  -- Replace templates
  IF p_templates IS NOT NULL AND jsonb_typeof(p_templates) = 'array' THEN
    DELETE FROM public.rtm_templates WHERE definition_id = v_id;
    FOR v_tpl IN SELECT * FROM jsonb_array_elements(p_templates) LOOP
      IF COALESCE(v_tpl->>'channel','') = '' THEN CONTINUE; END IF;
      INSERT INTO public.rtm_templates (definition_id, channel, locale, content, missing_var_policy)
      VALUES (
        v_id, v_tpl->>'channel', COALESCE(NULLIF(v_tpl->>'locale',''), 'default'),
        COALESCE(v_tpl->'content', '{}'::JSONB),
        COALESCE(NULLIF(v_tpl->>'missing_var_policy',''), 'fallback')
      )
      ON CONFLICT (definition_id, channel, locale) DO UPDATE
        SET content = EXCLUDED.content, missing_var_policy = EXCLUDED.missing_var_policy;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rtm_set_status(p_tenant_id UUID, p_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('draft', 'active', 'paused') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF p_status = 'active' THEN PERFORM public.require_permission(p_tenant_id, 'journeys.publish');
  ELSE PERFORM public.require_permission(p_tenant_id, 'journeys.write'); END IF;

  UPDATE public.rtm_definitions SET
    status = p_status,
    published_at = CASE WHEN p_status = 'active' THEN NOW() ELSE published_at END,
    published_config = CASE WHEN p_status = 'active' THEN payload_schema ELSE published_config END
  WHERE id = p_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Definition not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rtm_delete_definition(p_tenant_id UUID, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'journeys.write');
  DELETE FROM public.rtm_definitions WHERE id = p_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Definition not found'; END IF;
END;
$$;

-- Message feed for the console
CREATE OR REPLACE FUNCTION public.rtm_list_messages(
  p_tenant_id UUID, p_environment TEXT, p_definition_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL, p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 50
)
RETURNS SETOF public.rtm_messages
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'journeys.read');
  RETURN QUERY
  SELECT * FROM public.rtm_messages m
  WHERE m.tenant_id = p_tenant_id
    AND m.environment = COALESCE(NULLIF(p_environment, ''), 'production')
    AND (p_definition_id IS NULL OR m.definition_id = p_definition_id)
    AND (p_status IS NULL OR m.status = p_status)
    AND (
      p_search IS NULL OR p_search = '' OR
      m.message_id ILIKE '%' || p_search || '%' OR
      m.idempotency_key ILIKE '%' || p_search || '%' OR
      m.recipient::TEXT ILIKE '%' || p_search || '%' OR
      m.payload::TEXT ILIKE '%' || p_search || '%'
    )
  ORDER BY m.received_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

CREATE OR REPLACE FUNCTION public.rtm_get_message(p_tenant_id UUID, p_message_id TEXT)
RETURNS public.rtm_messages
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.rtm_messages;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'journeys.read');
  SELECT * INTO v_row FROM public.rtm_messages
  WHERE tenant_id = p_tenant_id AND message_id = p_message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;
  RETURN v_row;
END;
$$;

-- 30-day usage summary for the header stats
CREATE OR REPLACE FUNCTION public.rtm_usage_summary(p_tenant_id UUID, p_environment TEXT, p_days INT DEFAULT 7)
RETURNS TABLE (day DATE, accepted BIGINT, sent BIGINT, delivered BIGINT, failed BIGINT, suppressed BIGINT, credits BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'journeys.read');
  RETURN QUERY
  SELECT g.day::DATE,
         COALESCE(sum(u.accepted), 0), COALESCE(sum(u.sent), 0), COALESCE(sum(u.delivered), 0),
         COALESCE(sum(u.failed), 0), COALESCE(sum(u.suppressed), 0), COALESCE(sum(u.credits), 0)
  FROM generate_series(CURRENT_DATE - (LEAST(GREATEST(p_days,1),90) - 1), CURRENT_DATE, INTERVAL '1 day') g(day)
  LEFT JOIN public.rtm_usage_daily u
    ON u.day = g.day::DATE
   AND u.tenant_id = p_tenant_id
   AND u.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  GROUP BY g.day
  ORDER BY g.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rtm_list_definitions(UUID, TEXT)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rtm_get_definition(UUID, UUID)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rtm_upsert_definition(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT[], JSONB, JSONB, JSONB, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rtm_set_status(UUID, UUID, TEXT)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.rtm_delete_definition(UUID, UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rtm_list_messages(UUID, TEXT, UUID, TEXT, TEXT, INT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.rtm_get_message(UUID, TEXT)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.rtm_usage_summary(UUID, TEXT, INT)                      TO authenticated;

-- =============================================================================
-- 8. Idempotency sweep (best-effort; needs pg_cron enabled)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'rtm-idempotency-sweep', '17 * * * *',
      $sql$DELETE FROM public.rtm_idempotency WHERE expires_at < NOW()$sql$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- =============================================================================
-- 9. Demo seed — an "order_shipped" real-time message on the demo tenant
-- =============================================================================

INSERT INTO public.rtm_definitions (
  tenant_id, environment, slug, name, description, event_type, status,
  latency_class, is_transactional, default_channel, fallback_channels,
  payload_schema, guardrails, published_at, published_config
) VALUES (
  '00000000-0000-0000-0000-000000000001', 'production', 'order_shipped',
  'Order shipped', 'Tells the customer their order is on its way, with a tracking link.',
  'order_shipped', 'active', 'standard', TRUE, 'web_push', '{}',
  '[
    {"key":"order_id","type":"string","required":true,"example":"A-2231","pii":false},
    {"key":"eta","type":"date","required":true,"example":"2026-08-30","pii":false},
    {"key":"tracking_url","type":"url","required":false,"example":"https://track.acme.io/A-2231","pii":false},
    {"key":"carrier","type":"string","required":false,"example":"BlueDart","pii":false}
  ]'::JSONB,
  '{"dedupe":{"keys":["order_id"],"window_seconds":600},"rate_per_recipient":{"max":20,"window_seconds":3600},"spend_cap_credits_per_day":0,"require_consent":false}'::JSONB,
  NOW(),
  '[]'::JSONB
)
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

INSERT INTO public.rtm_templates (definition_id, channel, locale, content, missing_var_policy)
SELECT d.id, 'web_push', 'default',
  '{
    "title": "Order {{data.order_id}} is on its way",
    "body": "Hi {{customer.first_name | \"there\"}} — arriving {{date data.eta \"ddd D MMM\"}}. Track it below.",
    "icon_url": "",
    "image_url": "",
    "click_url": "{{data.tracking_url}}",
    "buttons": [{ "title": "Track package", "url": "{{data.tracking_url}}" }]
  }'::JSONB,
  'fallback'
FROM public.rtm_definitions d
WHERE d.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND d.environment = 'production' AND d.slug = 'order_shipped'
ON CONFLICT (definition_id, channel, locale) DO NOTHING;
