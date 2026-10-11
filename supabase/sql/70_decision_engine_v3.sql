-- =============================================================================
-- MARBEE — Next Best Experience Engine v3 (ML-grounded)
-- Additive migration on top of 61_decision_engine_v2.sql.
--
-- Adds:
--   1. business_value + config_version columns on decision_items (renames value)
--   2. decision_model_versions — model registry with offline metrics
--   3. decision_traces_v3 — enhanced traces with ML explainability fields
--   4. decision_feature_snapshots — frozen feature vectors for retraining
--   5. decision_outcomes — async outcome joining for model feedback
--   6. Updated RPC: decide_next_best_v3 with model_version param
--
-- Safe to re-run (idempotent). Run AFTER 61.
-- =============================================================================

-- ── 1. Evolve decision_items ──────────────────────────────────────────

-- Rename 'value' → 'business_value' for clarity (additive: add new, keep old)
ALTER TABLE public.decision_items
  ADD COLUMN IF NOT EXISTS business_value NUMERIC NOT NULL DEFAULT 0;

-- Backfill from old 'value' column
UPDATE public.decision_items
  SET business_value = COALESCE(value, 0)
  WHERE business_value = 0 AND value IS NOT NULL AND value != 0;

ALTER TABLE public.decision_items
  ADD COLUMN IF NOT EXISTS config_version INTEGER NOT NULL DEFAULT 1;

-- ── 2. Model Version Registry ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_model_versions (
  id                TEXT PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment       TEXT NOT NULL DEFAULT 'production',
  phase             TEXT NOT NULL DEFAULT 'bootstrap'
    CHECK (phase IN ('bootstrap', 'logistic', 'gbm', 'two_tower')),
  version           TEXT NOT NULL,
  trained_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  training_samples  INTEGER NOT NULL DEFAULT 0,

  -- Offline evaluation metrics
  auc_roc           NUMERIC NOT NULL DEFAULT 0.5,
  log_loss          NUMERIC NOT NULL DEFAULT 1.0,
  calibration_error NUMERIC NOT NULL DEFAULT 0.5,
  lift_over_random  NUMERIC NOT NULL DEFAULT 1.0,
  psi               NUMERIC NOT NULL DEFAULT 0.0,

  -- Segment-level metrics
  segment_metrics   JSONB NOT NULL DEFAULT '{}',
  -- Feature importance ranking
  feature_importance JSONB NOT NULL DEFAULT '[]',

  status            TEXT NOT NULL DEFAULT 'shadow'
    CHECK (status IN ('shadow', 'champion', 'retired')),

  -- Serialized model weights (logistic: JSON, GBM+: binary reference)
  weights           JSONB,
  calibration_map   JSONB,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_model_versions_tenant
  ON public.decision_model_versions (tenant_id, environment, status);

-- ── 3. Enhanced Traces (v3) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_traces_v3 (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id         UUID REFERENCES public.decision_policies(id) ON DELETE SET NULL,
  customer_id       UUID,
  placement         TEXT,
  channel           TEXT,
  request_context   JSONB NOT NULL DEFAULT '{}',

  -- Decision output
  decision          TEXT NOT NULL CHECK (decision IN ('action','no_action','fallback','holdout')),
  winning_item_id   UUID REFERENCES public.decision_items(id) ON DELETE SET NULL,
  winning_item_name TEXT,
  winning_score     NUMERIC,

  -- ML explainability
  model_version     TEXT REFERENCES public.decision_model_versions(id) ON DELETE SET NULL,
  score_breakdown   JSONB NOT NULL DEFAULT '{}',
  feature_contributions JSONB NOT NULL DEFAULT '[]',
  confidence        TEXT NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low')),
  is_exploration    BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_reason   TEXT,

  -- All scored candidates (top N)
  scored_candidates JSONB NOT NULL DEFAULT '[]',
  -- Full stage trace
  trace_steps       JSONB NOT NULL DEFAULT '[]',
  reason_summary    TEXT,
  replay_hash       TEXT,

  evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_traces_v3_tenant
  ON public.decision_traces_v3 (tenant_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_traces_v3_customer
  ON public.decision_traces_v3 (customer_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_traces_v3_model
  ON public.decision_traces_v3 (model_version);

-- ── 4. Feature Snapshots (for retraining) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_feature_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trace_id    UUID REFERENCES public.decision_traces_v3(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL,
  features    JSONB NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_feature_snapshots_trace
  ON public.decision_feature_snapshots (trace_id);
CREATE INDEX IF NOT EXISTS idx_decision_feature_snapshots_tenant
  ON public.decision_feature_snapshots (tenant_id, snapshot_at DESC);

-- ── 5. Async Outcome Joining ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_outcomes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trace_id    UUID NOT NULL REFERENCES public.decision_traces_v3(id) ON DELETE CASCADE,
  item_id     UUID REFERENCES public.decision_items(id) ON DELETE SET NULL,
  customer_id UUID,
  outcome     TEXT NOT NULL CHECK (outcome IN ('convert','dismiss','ignore','expire')),
  value       NUMERIC,
  latency_ms  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_outcomes_trace
  ON public.decision_outcomes (trace_id);
CREATE INDEX IF NOT EXISTS idx_decision_outcomes_tenant_created
  ON public.decision_outcomes (tenant_id, created_at DESC);

-- ── 6. RFM Snapshots ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_rfm_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment   TEXT NOT NULL DEFAULT 'production',
  customer_id   UUID NOT NULL,
  r_score       SMALLINT NOT NULL CHECK (r_score BETWEEN 1 AND 5),
  f_score       SMALLINT NOT NULL CHECK (f_score BETWEEN 1 AND 5),
  m_score       SMALLINT NOT NULL CHECK (m_score BETWEEN 1 AND 5),
  composite     SMALLINT NOT NULL,
  segment       TEXT NOT NULL,
  recency_days  INTEGER NOT NULL,
  frequency     INTEGER NOT NULL,
  monetary      NUMERIC NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, customer_id, computed_at)
);

CREATE INDEX IF NOT EXISTS idx_decision_rfm_tenant
  ON public.decision_rfm_snapshots (tenant_id, environment, segment);
CREATE INDEX IF NOT EXISTS idx_decision_rfm_customer
  ON public.decision_rfm_snapshots (customer_id, computed_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.decision_model_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_traces_v3          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_feature_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_outcomes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_rfm_snapshots      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decision_model_versions_tenant" ON public.decision_model_versions;
CREATE POLICY "decision_model_versions_tenant" ON public.decision_model_versions FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_traces_v3_tenant" ON public.decision_traces_v3;
CREATE POLICY "decision_traces_v3_tenant" ON public.decision_traces_v3 FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_feature_snapshots_tenant" ON public.decision_feature_snapshots;
CREATE POLICY "decision_feature_snapshots_tenant" ON public.decision_feature_snapshots FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_outcomes_tenant" ON public.decision_outcomes;
CREATE POLICY "decision_outcomes_tenant" ON public.decision_outcomes FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "decision_rfm_snapshots_tenant" ON public.decision_rfm_snapshots;
CREATE POLICY "decision_rfm_snapshots_tenant" ON public.decision_rfm_snapshots FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.decision_model_versions    TO authenticated;
GRANT ALL ON public.decision_traces_v3         TO authenticated;
GRANT ALL ON public.decision_feature_snapshots TO authenticated;
GRANT ALL ON public.decision_outcomes          TO authenticated;
GRANT ALL ON public.decision_rfm_snapshots     TO authenticated;

-- ── Realtime for live decision monitoring ─────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_traces_v3;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.decision_outcomes;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- ── 7. Updated RPC: ML-backed decision ────────────────────────────────

CREATE OR REPLACE FUNCTION public.decide_next_best_v3(
  p_tenant_id     UUID,
  p_customer_id   UUID,
  p_placement     TEXT DEFAULT 'web_checkout',
  p_channel       TEXT DEFAULT 'web',
  p_context       JSONB DEFAULT '{}',
  p_model_version TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy    public.decision_policies%ROWTYPE;
  v_model     TEXT;
  v_items     JSONB;
  v_winner    RECORD;
  v_trace_id  UUID;
BEGIN
  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  -- Resolve model version
  IF p_model_version IS NOT NULL THEN
    v_model := p_model_version;
  ELSE
    SELECT id INTO v_model
    FROM public.decision_model_versions
    WHERE tenant_id = p_tenant_id AND status = 'champion'
    ORDER BY trained_at DESC LIMIT 1;
  END IF;

  -- Resolve policy
  SELECT * INTO v_policy
  FROM public.decision_policies
  WHERE tenant_id = p_tenant_id AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('decision', 'no_action', 'reason', 'No active policy');
  END IF;

  -- Fetch active items
  SELECT jsonb_agg(to_jsonb(i.*)) INTO v_items
  FROM public.decision_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.status = 'active'
    AND (i.ends_at IS NULL OR i.ends_at > NOW())
    AND (i.starts_at IS NULL OR i.starts_at <= NOW());

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('decision', 'no_action', 'reason', 'No active items');
  END IF;

  -- Server-side ranking (priority-based fallback; ML scoring happens client-side)
  SELECT i.id AS item_id, i.name, i.business_value, i.priority
  INTO v_winner
  FROM public.decision_items i
  WHERE i.tenant_id = p_tenant_id AND i.status = 'active'
    AND (i.ends_at IS NULL OR i.ends_at > NOW())
  ORDER BY i.priority DESC, i.business_value DESC
  LIMIT 1;

  -- Write trace
  INSERT INTO public.decision_traces_v3 (
    tenant_id, policy_id, customer_id, placement, channel,
    request_context, decision, winning_item_id, winning_item_name,
    winning_score, model_version, confidence, reason_summary
  ) VALUES (
    p_tenant_id, v_policy.id, p_customer_id, p_placement, p_channel,
    p_context, 'action', v_winner.item_id, v_winner.name,
    v_winner.priority, v_model, 'medium', 'Server-side priority fallback'
  ) RETURNING id INTO v_trace_id;

  RETURN jsonb_build_object(
    'decision', 'action',
    'trace_id', v_trace_id,
    'model_version', v_model,
    'item', jsonb_build_object(
      'id', v_winner.item_id,
      'name', v_winner.name,
      'business_value', v_winner.business_value,
      'priority', v_winner.priority
    ),
    'policy', v_policy.name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_next_best_v3(UUID, UUID, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_next_best_v3(UUID, UUID, TEXT, TEXT, JSONB, TEXT) TO authenticated;
