-- Loyalty platform + Offers + Best Offer Decisioning (BOD)
-- Run after 46_api_hub.sql

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (slug, name, description, category) VALUES
  ('loyalty.read', 'View loyalty', 'Read loyalty programs, offers, and members', 'loyalty'),
  ('loyalty.write', 'Manage loyalty', 'Create and edit loyalty programs and offers', 'loyalty'),
  ('loyalty.publish', 'Publish loyalty', 'Activate offers and decisioning policies', 'loyalty'),
  ('offers.decide', 'Run offer decisioning', 'Execute best-offer decisioning API', 'loyalty')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v_tenant UUID := '00000000-0000-0000-0000-000000000001';
  p TEXT;
BEGIN
  FOREACH p IN ARRAY ARRAY['loyalty.read', 'loyalty.write', 'loyalty.publish', 'offers.decide'] LOOP
    PERFORM public._grant_role_perm(v_tenant, 'tenant_admin', p);
    PERFORM public._grant_role_perm(v_tenant, 'marketing_manager', p);
  END LOOP;
  FOREACH p IN ARRAY ARRAY['loyalty.read', 'offers.decide'] LOOP
    PERFORM public._grant_role_perm(v_tenant, 'analyst', p);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Loyalty programs & tiers
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  points_currency TEXT NOT NULL DEFAULT 'Points',
  earn_rate NUMERIC(10, 4) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  settings JSONB NOT NULL DEFAULT '{}',
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE TABLE IF NOT EXISTS public.loyalty_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  min_points INTEGER NOT NULL DEFAULT 0,
  points_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  benefits JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, slug)
);

CREATE TABLE IF NOT EXISTS public.loyalty_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  program_id UUID NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES public.loyalty_tiers(id) ON DELETE SET NULL,
  points_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'churned')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE (program_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_members_tenant
  ON public.loyalty_members (tenant_id, environment, program_id);

-- -----------------------------------------------------------------------------
-- Offer catalog
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.loyalty_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  program_id UUID REFERENCES public.loyalty_programs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  offer_type TEXT NOT NULL DEFAULT 'discount_percent'
    CHECK (offer_type IN (
      'discount_percent', 'discount_fixed', 'cashback', 'bogo',
      'free_shipping', 'points_bonus', 'bundle', 'tier_upgrade', 'custom'
    )),
  offer_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(12, 2),
  min_purchase NUMERIC(12, 2),
  channel TEXT NOT NULL DEFAULT 'any'
    CHECK (channel IN ('any', 'web', 'app', 'email', 'sms', 'whatsapp', 'pos', 'journey')),
  placement TEXT NOT NULL DEFAULT 'any'
    CHECK (placement IN ('any', 'homepage', 'checkout', 'cart', 'email', 'journey', 'push', 'in_app')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'expired')),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  stacking_mode TEXT NOT NULL DEFAULT 'exclusive'
    CHECK (stacking_mode IN ('exclusive', 'stackable')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  budget_total NUMERIC(14, 2),
  budget_spent NUMERIC(14, 2) NOT NULL DEFAULT 0,
  max_redemptions INTEGER,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  frequency_cap_hours INTEGER,
  audience_id UUID,
  required_tier_slug TEXT,
  eligibility_rules JSONB NOT NULL DEFAULT '[]',
  personalization JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  expected_lift NUMERIC(6, 3) NOT NULL DEFAULT 0,
  margin_impact NUMERIC(6, 3) NOT NULL DEFAULT 0,
  propensity_weight NUMERIC(6, 3) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_offers_active
  ON public.loyalty_offers (tenant_id, environment, status, priority DESC)
  WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- Best Offer Decisioning (BOD)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.offer_decision_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused')),
  strategy TEXT NOT NULL DEFAULT 'balanced'
    CHECK (strategy IN ('highest_value', 'margin_aware', 'balanced', 'explore_exploit', 'personalized')),
  channel TEXT NOT NULL DEFAULT 'any',
  placement TEXT NOT NULL DEFAULT 'any',
  fallback_offer_id UUID REFERENCES public.loyalty_offers(id) ON DELETE SET NULL,
  settings JSONB NOT NULL DEFAULT '{
    "exploration_rate": 0.1,
    "frequency_cap_hours": 24,
    "holdout_percent": 5,
    "tie_breaker": "priority",
    "value_weight": 0.4,
    "margin_weight": 0.3,
    "propensity_weight": 0.3
  }',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE TABLE IF NOT EXISTS public.offer_policy_links (
  policy_id UUID NOT NULL REFERENCES public.offer_decision_policies(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.loyalty_offers(id) ON DELETE CASCADE,
  boost_score NUMERIC(8, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (policy_id, offer_id)
);

CREATE TABLE IF NOT EXISTS public.offer_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  policy_id UUID REFERENCES public.offer_decision_policies(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  placement TEXT,
  channel TEXT,
  context JSONB NOT NULL DEFAULT '{}',
  candidates JSONB NOT NULL DEFAULT '[]',
  winner_offer_id UUID REFERENCES public.loyalty_offers(id) ON DELETE SET NULL,
  score_breakdown JSONB NOT NULL DEFAULT '{}',
  strategy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_decision_log_tenant
  ON public.offer_decision_log (tenant_id, environment, created_at DESC);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_decision_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_policy_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_programs_tenant" ON public.loyalty_programs FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "loyalty_tiers_tenant" ON public.loyalty_tiers FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "loyalty_members_tenant" ON public.loyalty_members FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "loyalty_offers_tenant" ON public.loyalty_offers FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "offer_policies_tenant" ON public.offer_decision_policies FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
CREATE POLICY "offer_policy_links_tenant" ON public.offer_policy_links FOR ALL
  USING (policy_id IN (
    SELECT id FROM public.offer_decision_policies
    WHERE tenant_id IN (SELECT public.user_tenant_ids())
  ));
CREATE POLICY "offer_decision_log_tenant" ON public.offer_decision_log FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.loyalty_programs TO authenticated;
GRANT ALL ON public.loyalty_tiers TO authenticated;
GRANT ALL ON public.loyalty_members TO authenticated;
GRANT ALL ON public.loyalty_offers TO authenticated;
GRANT ALL ON public.offer_decision_policies TO authenticated;
GRANT ALL ON public.offer_policy_links TO authenticated;
GRANT SELECT, INSERT ON public.offer_decision_log TO authenticated;

CREATE TRIGGER loyalty_programs_updated_at BEFORE UPDATE ON public.loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER loyalty_offers_updated_at BEFORE UPDATE ON public.loyalty_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER offer_policies_updated_at BEFORE UPDATE ON public.offer_decision_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- List / upsert RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_loyalty_programs(p_tenant_id UUID, p_environment TEXT)
RETURNS SETOF public.loyalty_programs
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'loyalty.read');
  RETURN QUERY
  SELECT * FROM public.loyalty_programs lp
  WHERE lp.tenant_id = p_tenant_id
    AND lp.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  ORDER BY lp.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_loyalty_program(
  p_tenant_id UUID, p_environment TEXT, p_id UUID,
  p_name TEXT, p_slug TEXT, p_description TEXT,
  p_points_currency TEXT, p_earn_rate NUMERIC, p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID; v_slug TEXT := lower(trim(p_slug));
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'loyalty.write');
  IF p_status NOT IN ('draft', 'active', 'paused', 'archived') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.loyalty_programs (tenant_id, environment, name, slug, description, points_currency, earn_rate, status)
    VALUES (p_tenant_id, COALESCE(NULLIF(p_environment, ''), 'production'), trim(p_name), v_slug,
      NULLIF(trim(COALESCE(p_description, '')), ''), COALESCE(p_points_currency, 'Points'), COALESCE(p_earn_rate, 1), p_status)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.loyalty_programs SET
      name = trim(p_name), slug = v_slug, description = NULLIF(trim(COALESCE(p_description, '')), ''),
      points_currency = COALESCE(p_points_currency, points_currency),
      earn_rate = COALESCE(p_earn_rate, earn_rate), status = p_status, updated_at = NOW()
    WHERE id = p_id AND tenant_id = p_tenant_id RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Program not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_loyalty_offers(p_tenant_id UUID, p_environment TEXT)
RETURNS SETOF public.loyalty_offers
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'loyalty.read');
  RETURN QUERY
  SELECT * FROM public.loyalty_offers o
  WHERE o.tenant_id = p_tenant_id
    AND o.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  ORDER BY o.priority DESC, o.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_loyalty_offer(
  p_tenant_id UUID, p_environment TEXT, p_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'loyalty.write');
  IF p_id IS NULL THEN
    INSERT INTO public.loyalty_offers (
      tenant_id, environment, program_id, name, slug, description, offer_type, offer_value,
      max_discount, min_purchase, channel, placement, status, priority, stacking_mode,
      starts_at, ends_at, budget_total, max_redemptions, frequency_cap_hours,
      audience_id, required_tier_slug, eligibility_rules, personalization, tags,
      expected_lift, margin_impact, propensity_weight
    ) VALUES (
      p_tenant_id, COALESCE(NULLIF(p_environment, ''), 'production'),
      (p_payload->>'program_id')::UUID,
      trim(p_payload->>'name'),
      lower(trim(p_payload->>'slug')),
      NULLIF(trim(p_payload->>'description'), ''),
      COALESCE(p_payload->>'offer_type', 'discount_percent'),
      COALESCE((p_payload->>'offer_value')::NUMERIC, 0),
      (p_payload->>'max_discount')::NUMERIC,
      (p_payload->>'min_purchase')::NUMERIC,
      COALESCE(p_payload->>'channel', 'any'),
      COALESCE(p_payload->>'placement', 'any'),
      COALESCE(p_payload->>'status', 'draft'),
      COALESCE((p_payload->>'priority')::INTEGER, 50),
      COALESCE(p_payload->>'stacking_mode', 'exclusive'),
      (p_payload->>'starts_at')::TIMESTAMPTZ,
      (p_payload->>'ends_at')::TIMESTAMPTZ,
      (p_payload->>'budget_total')::NUMERIC,
      (p_payload->>'max_redemptions')::INTEGER,
      (p_payload->>'frequency_cap_hours')::INTEGER,
      (p_payload->>'audience_id')::UUID,
      NULLIF(p_payload->>'required_tier_slug', ''),
      COALESCE(p_payload->'eligibility_rules', '[]'::JSONB),
      COALESCE(p_payload->'personalization', '{}'::JSONB),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'tags', '[]'::JSONB))), '{}'),
      COALESCE((p_payload->>'expected_lift')::NUMERIC, 0),
      COALESCE((p_payload->>'margin_impact')::NUMERIC, 0),
      COALESCE((p_payload->>'propensity_weight')::NUMERIC, 1)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.loyalty_offers SET
      program_id = (p_payload->>'program_id')::UUID,
      name = trim(p_payload->>'name'),
      slug = lower(trim(p_payload->>'slug')),
      description = NULLIF(trim(p_payload->>'description'), ''),
      offer_type = COALESCE(p_payload->>'offer_type', offer_type),
      offer_value = COALESCE((p_payload->>'offer_value')::NUMERIC, offer_value),
      max_discount = (p_payload->>'max_discount')::NUMERIC,
      min_purchase = (p_payload->>'min_purchase')::NUMERIC,
      channel = COALESCE(p_payload->>'channel', channel),
      placement = COALESCE(p_payload->>'placement', placement),
      status = COALESCE(p_payload->>'status', status),
      priority = COALESCE((p_payload->>'priority')::INTEGER, priority),
      stacking_mode = COALESCE(p_payload->>'stacking_mode', stacking_mode),
      starts_at = (p_payload->>'starts_at')::TIMESTAMPTZ,
      ends_at = (p_payload->>'ends_at')::TIMESTAMPTZ,
      budget_total = (p_payload->>'budget_total')::NUMERIC,
      max_redemptions = (p_payload->>'max_redemptions')::INTEGER,
      frequency_cap_hours = (p_payload->>'frequency_cap_hours')::INTEGER,
      audience_id = (p_payload->>'audience_id')::UUID,
      required_tier_slug = NULLIF(p_payload->>'required_tier_slug', ''),
      eligibility_rules = COALESCE(p_payload->'eligibility_rules', eligibility_rules),
      personalization = COALESCE(p_payload->'personalization', personalization),
      tags = COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'tags', '[]'::JSONB))), tags),
      expected_lift = COALESCE((p_payload->>'expected_lift')::NUMERIC, expected_lift),
      margin_impact = COALESCE((p_payload->>'margin_impact')::NUMERIC, margin_impact),
      propensity_weight = COALESCE((p_payload->>'propensity_weight')::NUMERIC, propensity_weight),
      updated_at = NOW()
    WHERE id = p_id AND tenant_id = p_tenant_id RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_offer_decision_policies(p_tenant_id UUID, p_environment TEXT)
RETURNS SETOF public.offer_decision_policies
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'loyalty.read');
  RETURN QUERY
  SELECT * FROM public.offer_decision_policies p
  WHERE p.tenant_id = p_tenant_id
    AND p.environment = COALESCE(NULLIF(p_environment, ''), 'production')
  ORDER BY p.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_offer_decision_policy(
  p_tenant_id UUID, p_environment TEXT, p_id UUID,
  p_name TEXT, p_slug TEXT, p_description TEXT,
  p_status TEXT, p_strategy TEXT, p_channel TEXT, p_placement TEXT,
  p_fallback_offer_id UUID, p_settings JSONB, p_offer_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID; v_slug TEXT := lower(trim(p_slug)); v_offer UUID;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'loyalty.write');
  IF p_id IS NULL THEN
    INSERT INTO public.offer_decision_policies (
      tenant_id, environment, name, slug, description, status, strategy,
      channel, placement, fallback_offer_id, settings
    ) VALUES (
      p_tenant_id, COALESCE(NULLIF(p_environment, ''), 'production'),
      trim(p_name), v_slug, NULLIF(trim(COALESCE(p_description, '')), ''),
      p_status, p_strategy, p_channel, p_placement, p_fallback_offer_id,
      COALESCE(p_settings, '{}'::JSONB)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.offer_decision_policies SET
      name = trim(p_name), slug = v_slug,
      description = NULLIF(trim(COALESCE(p_description, '')), ''),
      status = p_status, strategy = p_strategy,
      channel = p_channel, placement = p_placement,
      fallback_offer_id = p_fallback_offer_id,
      settings = COALESCE(p_settings, settings), updated_at = NOW()
    WHERE id = p_id AND tenant_id = p_tenant_id RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Policy not found'; END IF;
    DELETE FROM public.offer_policy_links WHERE policy_id = v_id;
  END IF;

  IF p_offer_ids IS NOT NULL THEN
    FOREACH v_offer IN ARRAY p_offer_ids LOOP
      INSERT INTO public.offer_policy_links (policy_id, offer_id, boost_score)
      VALUES (v_id, v_offer, 0) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Best Offer Decisioning engine
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_best_offer(
  p_tenant_id UUID,
  p_environment TEXT,
  p_policy_slug TEXT,
  p_customer_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_policy public.offer_decision_policies%ROWTYPE;
  v_offer public.loyalty_offers%ROWTYPE;
  v_channel TEXT := COALESCE(p_context->>'channel', 'any');
  v_placement TEXT := COALESCE(p_context->>'placement', 'any');
  v_cart NUMERIC := COALESCE((p_context->>'cart_value')::NUMERIC, 0);
  v_tier TEXT := COALESCE(p_context->>'tier_slug', '');
  v_now TIMESTAMPTZ := NOW();
  v_candidates JSONB := '[]'::JSONB;
  v_scored JSONB := '[]'::JSONB;
  v_best JSONB;
  v_score NUMERIC;
  v_value_score NUMERIC;
  v_margin_penalty NUMERIC;
  v_propensity NUMERIC;
  v_boost NUMERIC;
  v_exploration NUMERIC;
  v_holdout NUMERIC;
  v_winner_id UUID;
  v_breakdown JSONB;
  v_rec RECORD;
  v_settings JSONB;
  v_vw NUMERIC; v_mw NUMERIC; v_pw NUMERIC;
BEGIN
  PERFORM public.require_permission(p_tenant_id, 'offers.decide');

  SELECT * INTO v_policy
  FROM public.offer_decision_policies
  WHERE tenant_id = p_tenant_id
    AND environment = COALESCE(NULLIF(p_environment, ''), 'production')
    AND slug = p_policy_slug
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Active decision policy not found', 'policy_slug', p_policy_slug);
  END IF;

  v_settings := v_policy.settings;
  v_vw := COALESCE((v_settings->>'value_weight')::NUMERIC, 0.4);
  v_mw := COALESCE((v_settings->>'margin_weight')::NUMERIC, 0.3);
  v_pw := COALESCE((v_settings->>'propensity_weight')::NUMERIC, 0.3);
  v_holdout := COALESCE((v_settings->>'holdout_percent')::NUMERIC, 0);

  IF v_holdout > 0 AND random() * 100 < v_holdout THEN
    RETURN jsonb_build_object(
      'holdout', TRUE,
      'policy_id', v_policy.id,
      'message', 'Customer in holdout group — no offer presented'
    );
  END IF;

  FOR v_rec IN
    SELECT o.*, COALESCE(l.boost_score, 0) AS policy_boost
    FROM public.loyalty_offers o
    LEFT JOIN public.offer_policy_links l ON l.offer_id = o.id AND l.policy_id = v_policy.id
    WHERE o.tenant_id = p_tenant_id
      AND o.environment = COALESCE(NULLIF(p_environment, ''), 'production')
      AND o.status = 'active'
      AND (o.starts_at IS NULL OR o.starts_at <= v_now)
      AND (o.ends_at IS NULL OR o.ends_at >= v_now)
      AND (o.channel IN ('any', v_channel) OR v_channel = 'any')
      AND (o.placement IN ('any', v_placement) OR v_placement = 'any')
      AND (o.budget_total IS NULL OR o.budget_spent < o.budget_total)
      AND (o.max_redemptions IS NULL OR o.redemption_count < o.max_redemptions)
      AND (o.min_purchase IS NULL OR v_cart >= o.min_purchase)
      AND (o.required_tier_slug IS NULL OR o.required_tier_slug = '' OR o.required_tier_slug = v_tier)
      AND (
        NOT EXISTS (SELECT 1 FROM public.offer_policy_links WHERE policy_id = v_policy.id)
        OR l.offer_id IS NOT NULL
      )
  LOOP
  v_offer := v_rec;
  v_boost := v_rec.policy_boost;

  IF v_offer.frequency_cap_hours IS NOT NULL AND p_customer_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.offer_decision_log d
      WHERE d.tenant_id = p_tenant_id
        AND d.customer_id = p_customer_id
        AND d.winner_offer_id = v_offer.id
        AND d.created_at > v_now - (v_offer.frequency_cap_hours || ' hours')::INTERVAL
    ) THEN
      CONTINUE;
    END IF;
  END IF;

  v_value_score := v_offer.offer_value * (1 + v_offer.expected_lift / 100);
  v_margin_penalty := v_offer.margin_impact;
  v_propensity := v_offer.propensity_weight * COALESCE((p_context->>'propensity')::NUMERIC, 1);

  v_score := CASE v_policy.strategy
    WHEN 'highest_value' THEN v_value_score + v_offer.priority
    WHEN 'margin_aware' THEN v_value_score - v_margin_penalty + v_offer.priority * 0.5
    WHEN 'explore_exploit' THEN v_value_score + (random() * 20)
    WHEN 'personalized' THEN v_value_score * v_propensity + v_boost + v_offer.priority
    ELSE (v_value_score * v_vw) + (v_propensity * 10 * v_pw) - (v_margin_penalty * v_mw) + v_boost + v_offer.priority
  END;

  v_scored := v_scored || jsonb_build_array(jsonb_build_object(
    'offer_id', v_offer.id,
    'name', v_offer.name,
    'slug', v_offer.slug,
    'offer_type', v_offer.offer_type,
    'offer_value', v_offer.offer_value,
    'score', round(v_score::NUMERIC, 2),
    'breakdown', jsonb_build_object(
      'value', v_value_score,
      'margin_penalty', v_margin_penalty,
      'propensity', v_propensity,
      'priority', v_offer.priority,
      'policy_boost', v_boost
    )
  ));
  END LOOP;

  IF jsonb_array_length(v_scored) = 0 AND v_policy.fallback_offer_id IS NOT NULL THEN
    SELECT * INTO v_offer FROM public.loyalty_offers WHERE id = v_policy.fallback_offer_id;
    v_winner_id := v_offer.id;
    v_best := jsonb_build_object(
      'offer_id', v_offer.id, 'name', v_offer.name, 'slug', v_offer.slug,
      'offer_type', v_offer.offer_type, 'offer_value', v_offer.offer_value,
      'score', 0, 'fallback', TRUE
    );
  ELSIF jsonb_array_length(v_scored) = 0 THEN
    RETURN jsonb_build_object('error', 'No eligible offers', 'policy_id', v_policy.id);
  ELSE
    SELECT elem INTO v_best
    FROM jsonb_array_elements(v_scored) elem
    ORDER BY (elem->>'score')::NUMERIC DESC
    LIMIT 1;
    v_winner_id := (v_best->>'offer_id')::UUID;
  END IF;

  v_breakdown := jsonb_build_object(
    'strategy', v_policy.strategy,
    'candidates_evaluated', jsonb_array_length(v_scored),
    'winner', v_best
  );

  INSERT INTO public.offer_decision_log (
    tenant_id, environment, policy_id, customer_id,
    placement, channel, context, candidates, winner_offer_id, score_breakdown, strategy
  ) VALUES (
    p_tenant_id, COALESCE(NULLIF(p_environment, ''), 'production'),
    v_policy.id, p_customer_id, v_placement, v_channel,
    p_context, v_scored, v_winner_id, v_breakdown, v_policy.strategy
  );

  RETURN jsonb_build_object(
    'policy_id', v_policy.id,
    'policy_slug', v_policy.slug,
    'strategy', v_policy.strategy,
    'winner', v_best,
    'alternatives', (
      SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'score')::NUMERIC DESC), '[]'::JSONB)
      FROM jsonb_array_elements(v_scored) elem
      WHERE (elem->>'offer_id')::UUID IS DISTINCT FROM v_winner_id
      LIMIT 5
    ),
    'candidates', v_scored
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_loyalty_programs(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_loyalty_program(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_loyalty_offers(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_loyalty_offer(UUID, TEXT, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_offer_decision_policies(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_offer_decision_policy(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_best_offer(UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;

-- Demo seed
INSERT INTO public.loyalty_programs (id, tenant_id, environment, name, slug, description, status, member_count)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', 'production',
  'Marbee Rewards', 'marbee-rewards', 'Core loyalty program with tiered benefits', 'active', 0
) ON CONFLICT DO NOTHING;

INSERT INTO public.loyalty_tiers (id, program_id, tenant_id, environment, name, slug, min_points, points_multiplier, color, sort_order)
VALUES
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Bronze', 'bronze', 0, 1, '#cd7f32', 1),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Silver', 'silver', 500, 1.25, '#94a3b8', 2),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Gold', 'gold', 2000, 1.5, '#eab308', 3),
  ('a2000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Platinum', 'platinum', 5000, 2, '#6366f1', 4)
ON CONFLICT DO NOTHING;

INSERT INTO public.loyalty_offers (id, tenant_id, environment, program_id, name, slug, description, offer_type, offer_value, channel, placement, status, priority, expected_lift, margin_impact, propensity_weight, tags)
VALUES
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'a1000000-0000-0000-0000-000000000001',
   'Welcome 15% Off', 'welcome-15', 'First purchase discount for new members', 'discount_percent', 15, 'any', 'checkout', 'active', 80, 12, 8, 1.2, ARRAY['onboarding', 'acquisition']),
  ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', 'a1000000-0000-0000-0000-000000000001',
   'Free Shipping', 'free-ship-50', 'Free shipping on orders over ₹50', 'free_shipping', 0, 'web', 'cart', 'active', 60, 8, 3, 1, ARRAY['shipping']),
  ('b1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', 'a1000000-0000-0000-0000-000000000001',
   'Gold Tier 2x Points', 'gold-2x-points', 'Double points weekend for Gold+ members', 'points_bonus', 100, 'app', 'homepage', 'active', 70, 18, 5, 1.5, ARRAY['loyalty', 'tier']),
  ('b1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'production', 'a1000000-0000-0000-0000-000000000001',
   'Cart Abandon ₹200 Off', 'cart-abandon-200', 'Win-back offer for high-intent carts', 'discount_fixed', 200, 'email', 'journey', 'active', 90, 22, 15, 1.8, ARRAY['retention', 'cart'])
ON CONFLICT DO NOTHING;

INSERT INTO public.offer_decision_policies (id, tenant_id, environment, name, slug, description, status, strategy, channel, placement, fallback_offer_id)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', 'production',
  'Checkout Best Offer', 'checkout-best-offer',
  'Real-time best offer selection at checkout using balanced scoring',
  'active', 'balanced', 'any', 'checkout',
  'b1000000-0000-0000-0000-000000000002'
) ON CONFLICT DO NOTHING;

INSERT INTO public.offer_policy_links (policy_id, offer_id, boost_score)
SELECT 'c1000000-0000-0000-0000-000000000001', id, 0
FROM public.loyalty_offers
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND slug IN ('welcome-15', 'free-ship-50', 'cart-abandon-200')
ON CONFLICT DO NOTHING;
