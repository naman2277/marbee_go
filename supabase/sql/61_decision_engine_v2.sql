-- =============================================================================
-- MARBEE — Next Best Experience Decision Engine v2
-- A centralized decisioning engine that evaluates the most relevant experience,
-- offer, content, or action for an individual customer in real time.
--
-- Architecture:
--   CATALOG  : decision_items (unified: offers, coupons, content, recommendations)
--   POLICY   : decision_policies (eligibility + ranking + guardrails)
--   GUARD    : decision_guardrails (frequency, fatigue, consent, quiet hours)
--   TRACE    : decision_traces (full audit trail of every decision)
--   PLACE    : decision_placements (where decisions render)
--
-- Run AFTER 01–51 + 60. Safe to re-run (idempotent).
-- =============================================================================

-- 1. decision_items — unified catalog of things the engine can decide
CREATE TABLE IF NOT EXISTS public.decision_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment     TEXT NOT NULL DEFAULT 'production',
  type            TEXT NOT NULL CHECK (type IN ('offer','coupon','content','recommendation','action','message','experience')),
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'general',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  value           NUMERIC NOT NULL DEFAULT 0,
  cost            NUMERIC NOT NULL DEFAULT 0,
  margin          NUMERIC NOT NULL DEFAULT 1.0,
  priority        INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  channels        TEXT[] NOT NULL DEFAULT '{all}',
  placements      TEXT[] NOT NULL DEFAULT '{checkout}',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','expired','archived')),
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  budget_total    NUMERIC,
  budget_spent    NUMERIC NOT NULL DEFAULT 0,
  max_redemptions INTEGER,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  stacking        TEXT NOT NULL DEFAULT 'exclusive' CHECK (stacking IN ('exclusive','stackable')),
  content_variants JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_items_tenant ON public.decision_items (tenant_id, environment, status);
CREATE INDEX IF NOT EXISTS idx_decision_items_type   ON public.decision_items (tenant_id, type);

-- 2. decision_placements — where decisions are shown
CREATE TABLE IF NOT EXISTS public.decision_placements (
  id          TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL,
  slot        TEXT NOT NULL,
  max_items   INTEGER NOT NULL DEFAULT 1,
  format      TEXT NOT NULL DEFAULT 'card' CHECK (format IN ('banner','card','inline','modal','notification','message')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. decision_policies — the brain: ties eligibility, ranking, guardrails together
CREATE TABLE IF NOT EXISTS public.decision_policies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment          TEXT NOT NULL DEFAULT 'production',
  name                 TEXT NOT NULL,
  description          TEXT,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  objective            TEXT NOT NULL DEFAULT 'balanced_growth'
    CHECK (objective IN ('maximize_conversion','maximize_revenue','maximize_profit','maximize_engagement','minimize_churn','maximize_clv','balanced_growth')),
  placement_ids        TEXT[] NOT NULL DEFAULT '{}',
  item_collection      JSONB NOT NULL DEFAULT '{"type":"all","filter":[]}',
  eligibility          JSONB NOT NULL DEFAULT '[]',
  ranking_method       TEXT NOT NULL DEFAULT 'formula' CHECK (ranking_method IN ('priority','formula','predictive','explore_exploit')),
  ranking_formula      JSONB NOT NULL DEFAULT '{}',
  guardrail_ids        TEXT[] NOT NULL DEFAULT '{}',
  fallback_item_id     UUID REFERENCES public.decision_items(id) ON DELETE SET NULL,
  allow_no_action      BOOLEAN NOT NULL DEFAULT TRUE,
  channel_arbitration  BOOLEAN NOT NULL DEFAULT TRUE,
  timing_optimization  BOOLEAN NOT NULL DEFAULT FALSE,
  experiment           JSONB NOT NULL DEFAULT '{"enabled":false,"holdout_percent":10,"exploration_rate":0.1,"variant_splits":[]}',
  max_items_returned   INTEGER NOT NULL DEFAULT 1,
  ttl_seconds          INTEGER NOT NULL DEFAULT 300,
  version              INTEGER NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_policies_tenant ON public.decision_policies (tenant_id, environment, status);

-- 4. decision_guardrails — frequency caps, fatigue, consent, quiet hours
CREATE TABLE IF NOT EXISTS public.decision_guardrails (
  id          TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('frequency_cap','channel_limit','fatigue_threshold','budget_limit','quiet_hours','cooldown','consent_required','inventory_check','blackout_dates','global_suppression')),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  config      JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. decision_traces — full audit trail
CREATE TABLE IF NOT EXISTS public.decision_traces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id       UUID REFERENCES public.decision_policies(id) ON DELETE SET NULL,
  customer_id     UUID,
  placement       TEXT,
  channel         TEXT,
  request_context JSONB NOT NULL DEFAULT '{}',
  decision        TEXT NOT NULL CHECK (decision IN ('action','no_action','fallback','holdout')),
  winning_item_id UUID REFERENCES public.decision_items(id) ON DELETE SET NULL,
  winning_score   NUMERIC,
  candidates      JSONB NOT NULL DEFAULT '[]',
  trace_steps     JSONB NOT NULL DEFAULT '[]',
  reason_summary  TEXT,
  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_traces_tenant    ON public.decision_traces (tenant_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_traces_customer  ON public.decision_traces (customer_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_traces_policy    ON public.decision_traces (policy_id, evaluated_at DESC);

-- 6. decision_events — impression/click/conversion feedback loop
CREATE TABLE IF NOT EXISTS public.decision_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trace_id     UUID REFERENCES public.decision_traces(id) ON DELETE SET NULL,
  item_id      UUID REFERENCES public.decision_items(id) ON DELETE SET NULL,
  customer_id  UUID,
  event_type   TEXT NOT NULL CHECK (event_type IN ('impression','click','dismiss','accept','convert','expire')),
  channel      TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_events_trace  ON public.decision_events (trace_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_item   ON public.decision_events (item_id, event_type);

-- RLS
ALTER TABLE public.decision_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_placements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_policies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_guardrails  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_traces      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_events      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decision_items_tenant" ON public.decision_items;
CREATE POLICY "decision_items_tenant" ON public.decision_items FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_placements_tenant" ON public.decision_placements;
CREATE POLICY "decision_placements_tenant" ON public.decision_placements FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_policies_tenant" ON public.decision_policies;
CREATE POLICY "decision_policies_tenant" ON public.decision_policies FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_guardrails_tenant" ON public.decision_guardrails;
CREATE POLICY "decision_guardrails_tenant" ON public.decision_guardrails FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_traces_tenant" ON public.decision_traces;
CREATE POLICY "decision_traces_tenant" ON public.decision_traces FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_events_tenant" ON public.decision_events;
CREATE POLICY "decision_events_tenant" ON public.decision_events FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.decision_items       TO authenticated;
GRANT ALL ON public.decision_placements  TO authenticated;
GRANT ALL ON public.decision_policies    TO authenticated;
GRANT ALL ON public.decision_guardrails  TO authenticated;
GRANT ALL ON public.decision_traces      TO authenticated;
GRANT ALL ON public.decision_events      TO authenticated;

-- Realtime for live decision monitoring
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_traces;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_events;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- 7. decide_next_best — server-side decision RPC
CREATE OR REPLACE FUNCTION public.decide_next_best(
  p_tenant_id     UUID,
  p_customer_id   UUID,
  p_placement     TEXT DEFAULT 'web_checkout',
  p_channel       TEXT DEFAULT 'web',
  p_context       JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy    public.decision_policies%ROWTYPE;
  v_items     JSONB;
  v_winner    RECORD;
  v_trace_id  UUID;
BEGIN
  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO v_policy
  FROM public.decision_policies
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('decision', 'no_action', 'reason', 'No active policy');
  END IF;

  SELECT jsonb_agg(to_jsonb(i.*)) INTO v_items
  FROM public.decision_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.status = 'active'
    AND (i.ends_at IS NULL OR i.ends_at > NOW())
    AND (i.starts_at IS NULL OR i.starts_at <= NOW());

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('decision', 'no_action', 'reason', 'No active decision items');
  END IF;

  SELECT i.id AS item_id, i.name, i.value, i.priority
  INTO v_winner
  FROM public.decision_items i
  WHERE i.tenant_id = p_tenant_id AND i.status = 'active'
    AND (i.ends_at IS NULL OR i.ends_at > NOW())
  ORDER BY i.priority DESC, i.value DESC
  LIMIT 1;

  INSERT INTO public.decision_traces (tenant_id, policy_id, customer_id, placement, channel, request_context, decision, winning_item_id, winning_score, reason_summary)
  VALUES (p_tenant_id, v_policy.id, p_customer_id, p_placement, p_channel, p_context, 'action', v_winner.item_id, v_winner.priority, 'Server-side priority ranking')
  RETURNING id INTO v_trace_id;

  RETURN jsonb_build_object(
    'decision', 'action',
    'trace_id', v_trace_id,
    'item', jsonb_build_object('id', v_winner.item_id, 'name', v_winner.name, 'value', v_winner.value, 'priority', v_winner.priority),
    'policy', v_policy.name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_next_best(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_next_best(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;
