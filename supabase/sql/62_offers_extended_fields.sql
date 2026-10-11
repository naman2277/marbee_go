-- =============================================================================
-- MARBEE — Extended Offer Fields (images, CTAs, terms, redemption, industry)
-- Adds proper columns to loyalty_offers instead of overloading personalization.
-- Run AFTER 47_loyalty_offers.sql. Safe to re-run (idempotent).
-- =============================================================================

-- Image & visual assets
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS image_url       TEXT;
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS thumbnail_url   TEXT;

-- Terms & conditions
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

-- Call-to-action parameters (array of {id, label, type, value, style})
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS cta_params JSONB NOT NULL DEFAULT '[]';

-- Redemption settings
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS redemption_type TEXT NOT NULL DEFAULT 'auto'
  CHECK (redemption_type IN ('auto', 'code', 'link', 'manual'));
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS redemption_instructions TEXT;

-- Industry targeting
ALTER TABLE public.loyalty_offers ADD COLUMN IF NOT EXISTS target_industry TEXT;

-- Update channel CHECK to include more options
-- (cannot ALTER CHECK in-place, so we drop and re-add)
ALTER TABLE public.loyalty_offers DROP CONSTRAINT IF EXISTS loyalty_offers_channel_check;
ALTER TABLE public.loyalty_offers ADD CONSTRAINT loyalty_offers_channel_check
  CHECK (channel IN ('any', 'all', 'web', 'app', 'email', 'sms', 'whatsapp', 'pos', 'journey', 'push', 'rcs'));

-- Update placement CHECK to include more options
ALTER TABLE public.loyalty_offers DROP CONSTRAINT IF EXISTS loyalty_offers_placement_check;
ALTER TABLE public.loyalty_offers ADD CONSTRAINT loyalty_offers_placement_check
  CHECK (placement IN ('any', 'homepage', 'checkout', 'cart', 'email', 'journey', 'push', 'in_app', 'pos'));

-- Update the upsert RPC to handle new fields
CREATE OR REPLACE FUNCTION public.upsert_loyalty_offer(
  p_tenant_id  UUID,
  p_environment TEXT,
  p_id         UUID DEFAULT NULL,
  p_payload    JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.loyalty_offers SET
      program_id        = COALESCE((p_payload->>'program_id')::UUID, program_id),
      name              = COALESCE(p_payload->>'name', name),
      slug              = COALESCE(p_payload->>'slug', slug),
      description       = COALESCE(p_payload->>'description', description),
      offer_type        = COALESCE(p_payload->>'offer_type', offer_type),
      offer_value       = COALESCE((p_payload->>'offer_value')::NUMERIC, offer_value),
      max_discount      = (p_payload->>'max_discount')::NUMERIC,
      min_purchase      = (p_payload->>'min_purchase')::NUMERIC,
      channel           = COALESCE(p_payload->>'channel', channel),
      placement         = COALESCE(p_payload->>'placement', placement),
      status            = COALESCE(p_payload->>'status', status),
      priority          = COALESCE((p_payload->>'priority')::INT, priority),
      stacking_mode     = COALESCE(p_payload->>'stacking_mode', stacking_mode),
      starts_at         = (p_payload->>'starts_at')::TIMESTAMPTZ,
      ends_at           = (p_payload->>'ends_at')::TIMESTAMPTZ,
      budget_total      = (p_payload->>'budget_total')::NUMERIC,
      max_redemptions   = (p_payload->>'max_redemptions')::INT,
      frequency_cap_hours = (p_payload->>'frequency_cap_hours')::INT,
      required_tier_slug = COALESCE(p_payload->>'required_tier_slug', ''),
      tags              = COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')), tags),
      expected_lift     = COALESCE((p_payload->>'expected_lift')::NUMERIC, expected_lift),
      margin_impact     = COALESCE((p_payload->>'margin_impact')::NUMERIC, margin_impact),
      propensity_weight = COALESCE((p_payload->>'propensity_weight')::NUMERIC, propensity_weight),
      image_url         = p_payload->>'image_url',
      thumbnail_url     = p_payload->>'thumbnail_url',
      terms_and_conditions = p_payload->>'terms_and_conditions',
      cta_params        = COALESCE(p_payload->'cta_params', '[]'::JSONB),
      redemption_type   = COALESCE(p_payload->>'redemption_type', redemption_type),
      redemption_instructions = p_payload->>'redemption_instructions',
      target_industry   = p_payload->>'target_industry',
      eligibility_rules = COALESCE(p_payload->'eligibility_rules', eligibility_rules),
      personalization   = COALESCE(p_payload->'personalization', personalization),
      updated_at        = NOW()
    WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'offer not found or access denied';
    END IF;
  ELSE
    INSERT INTO public.loyalty_offers (
      tenant_id, environment, program_id, name, slug, description,
      offer_type, offer_value, max_discount, min_purchase,
      channel, placement, status, priority, stacking_mode,
      starts_at, ends_at, budget_total, max_redemptions, frequency_cap_hours,
      required_tier_slug, tags, expected_lift, margin_impact, propensity_weight,
      image_url, thumbnail_url, terms_and_conditions,
      cta_params, redemption_type, redemption_instructions, target_industry,
      eligibility_rules, personalization
    ) VALUES (
      p_tenant_id, p_environment,
      (p_payload->>'program_id')::UUID,
      p_payload->>'name',
      p_payload->>'slug',
      COALESCE(p_payload->>'description', ''),
      COALESCE(p_payload->>'offer_type', 'discount_percent'),
      COALESCE((p_payload->>'offer_value')::NUMERIC, 0),
      (p_payload->>'max_discount')::NUMERIC,
      (p_payload->>'min_purchase')::NUMERIC,
      COALESCE(p_payload->>'channel', 'all'),
      COALESCE(p_payload->>'placement', 'checkout'),
      COALESCE(p_payload->>'status', 'draft'),
      COALESCE((p_payload->>'priority')::INT, 50),
      COALESCE(p_payload->>'stacking_mode', 'exclusive'),
      (p_payload->>'starts_at')::TIMESTAMPTZ,
      (p_payload->>'ends_at')::TIMESTAMPTZ,
      (p_payload->>'budget_total')::NUMERIC,
      (p_payload->>'max_redemptions')::INT,
      (p_payload->>'frequency_cap_hours')::INT,
      COALESCE(p_payload->>'required_tier_slug', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')), '{}'),
      COALESCE((p_payload->>'expected_lift')::NUMERIC, 0),
      COALESCE((p_payload->>'margin_impact')::NUMERIC, 0),
      COALESCE((p_payload->>'propensity_weight')::NUMERIC, 1),
      p_payload->>'image_url',
      p_payload->>'thumbnail_url',
      p_payload->>'terms_and_conditions',
      COALESCE(p_payload->'cta_params', '[]'::JSONB),
      COALESCE(p_payload->>'redemption_type', 'auto'),
      p_payload->>'redemption_instructions',
      p_payload->>'target_industry',
      COALESCE(p_payload->'eligibility_rules', '[]'::JSONB),
      COALESCE(p_payload->'personalization', '{}'::JSONB)
    ) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_loyalty_offer(UUID, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_loyalty_offer(UUID, TEXT, UUID, JSONB) TO authenticated;

-- =============================================================================
-- Register new fields in schema_definitions / schema_fields
-- =============================================================================

-- Add missing fields to the existing loyalty_offers schema (a0000000-...-000000000003)
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'slug',                 'string',   TRUE,  FALSE, FALSE, TRUE,   4,  'URL-safe identifier'),
  ('a0000000-0000-0000-0000-000000000003', 'description',          'string',   FALSE, FALSE, FALSE, FALSE,  5,  'Offer description'),
  ('a0000000-0000-0000-0000-000000000003', 'offer_value',          'number',   TRUE,  FALSE, FALSE, FALSE,  6,  'Discount/cashback numeric value'),
  ('a0000000-0000-0000-0000-000000000003', 'max_discount',         'number',   FALSE, FALSE, FALSE, FALSE,  7,  'Maximum discount cap'),
  ('a0000000-0000-0000-0000-000000000003', 'min_purchase',         'number',   FALSE, FALSE, FALSE, FALSE,  8,  'Minimum order amount to qualify'),
  ('a0000000-0000-0000-0000-000000000003', 'channel',              'string',   TRUE,  FALSE, FALSE, TRUE,   9,  'Delivery channel (all, email, whatsapp, sms, web, app, pos, push)'),
  ('a0000000-0000-0000-0000-000000000003', 'placement',            'string',   TRUE,  FALSE, FALSE, TRUE,  10,  'Where the offer appears (checkout, homepage, cart, etc.)'),
  ('a0000000-0000-0000-0000-000000000003', 'priority',             'integer',  TRUE,  FALSE, FALSE, TRUE,  11,  'Ranking priority (1-100, higher = better)'),
  ('a0000000-0000-0000-0000-000000000003', 'stacking_mode',        'string',   TRUE,  FALSE, FALSE, FALSE, 12,  'exclusive or stackable with other offers'),
  ('a0000000-0000-0000-0000-000000000003', 'starts_at',            'datetime', FALSE, FALSE, FALSE, FALSE, 13,  'Offer activation date'),
  ('a0000000-0000-0000-0000-000000000003', 'ends_at',              'datetime', FALSE, FALSE, FALSE, FALSE, 14,  'Offer expiration date'),
  ('a0000000-0000-0000-0000-000000000003', 'budget_total',         'number',   FALSE, FALSE, FALSE, FALSE, 15,  'Total budget allocated'),
  ('a0000000-0000-0000-0000-000000000003', 'budget_spent',         'number',   TRUE,  FALSE, FALSE, FALSE, 16,  'Budget consumed so far'),
  ('a0000000-0000-0000-0000-000000000003', 'max_redemptions',      'integer',  FALSE, FALSE, FALSE, FALSE, 17,  'Maximum total redemptions allowed'),
  ('a0000000-0000-0000-0000-000000000003', 'redemption_count',     'integer',  TRUE,  FALSE, FALSE, FALSE, 18,  'Current redemption count'),
  ('a0000000-0000-0000-0000-000000000003', 'frequency_cap_hours',  'integer',  FALSE, FALSE, FALSE, FALSE, 19,  'Cooldown between repeat shows (hours)'),
  ('a0000000-0000-0000-0000-000000000003', 'image_url',            'string',   FALSE, FALSE, FALSE, FALSE, 20,  'Hero image URL'),
  ('a0000000-0000-0000-0000-000000000003', 'thumbnail_url',        'string',   FALSE, FALSE, FALSE, FALSE, 21,  'Thumbnail image URL for card views'),
  ('a0000000-0000-0000-0000-000000000003', 'terms_and_conditions', 'string',   FALSE, FALSE, FALSE, FALSE, 22,  'Legal terms and conditions text'),
  ('a0000000-0000-0000-0000-000000000003', 'cta_params',           'json',     FALSE, FALSE, FALSE, FALSE, 23,  'Call-to-action buttons (label, type, URL)'),
  ('a0000000-0000-0000-0000-000000000003', 'redemption_type',      'string',   TRUE,  FALSE, FALSE, FALSE, 24,  'How customers redeem (auto, code, link, manual)'),
  ('a0000000-0000-0000-0000-000000000003', 'redemption_instructions', 'string', FALSE, FALSE, FALSE, FALSE, 25, 'Redemption instructions for customer'),
  ('a0000000-0000-0000-0000-000000000003', 'target_industry',      'string',   FALSE, FALSE, FALSE, TRUE,  26,  'Industry vertical this offer targets'),
  ('a0000000-0000-0000-0000-000000000003', 'tags',                 'array',    FALSE, FALSE, FALSE, TRUE,  27,  'Tags for categorization and filtering'),
  ('a0000000-0000-0000-0000-000000000003', 'expected_lift',        'number',   FALSE, FALSE, FALSE, FALSE, 28,  'Expected conversion lift percentage'),
  ('a0000000-0000-0000-0000-000000000003', 'margin_impact',        'number',   FALSE, FALSE, FALSE, FALSE, 29,  'Estimated margin impact percentage'),
  ('a0000000-0000-0000-0000-000000000003', 'propensity_weight',    'number',   FALSE, FALSE, FALSE, FALSE, 30,  'Weight in propensity scoring (0-5)')
ON CONFLICT (schema_id, name) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description;

-- Register decision engine tables as OOTB schemas
INSERT INTO public.schema_definitions (id, tenant_id, environment, name, slug, table_name, is_system, description, status) VALUES
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'production', 'Decision Items',      'decision_items',      'decision_items',      TRUE, 'Unified catalog of items the decision engine evaluates (offers, coupons, content, recommendations)', 'active'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'production', 'Decision Policies',   'decision_policies',   'decision_policies',   TRUE, 'Decision policies: eligibility + ranking + guardrails', 'active'),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'production', 'Decision Guardrails', 'decision_guardrails', 'decision_guardrails', TRUE, 'Frequency caps, fatigue thresholds, consent, quiet hours', 'active'),
  ('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'production', 'Decision Traces',     'decision_traces',     'decision_traces',     TRUE, 'Full audit trail of every decision evaluation', 'active'),
  ('d0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'production', 'Decision Events',     'decision_events',     'decision_events',     TRUE, 'Impression, click, conversion feedback events', 'active'),
  ('d0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'production', 'Decision Placements', 'decision_placements', 'decision_placements', TRUE, 'Where decisions render (web, app, email, push, checkout)', 'active'),
  ('d0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'production', 'Coupon Campaigns',    'coupon_campaigns',    'coupon_campaigns',    TRUE, 'Coupon campaign definitions with code generation', 'active')
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

-- Decision Items fields
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'type',             'string',   TRUE,  FALSE, FALSE, TRUE,   1,  'Item type: offer, coupon, content, recommendation, action, message, experience'),
  ('d0000000-0000-0000-0000-000000000001', 'name',             'string',   TRUE,  FALSE, FALSE, TRUE,   2,  'Display name'),
  ('d0000000-0000-0000-0000-000000000001', 'description',      'string',   FALSE, FALSE, FALSE, FALSE,  3,  'Description of the item'),
  ('d0000000-0000-0000-0000-000000000001', 'category',         'string',   TRUE,  FALSE, FALSE, TRUE,   4,  'Category (discount_percent, free_shipping, etc.)'),
  ('d0000000-0000-0000-0000-000000000001', 'value',            'number',   TRUE,  FALSE, FALSE, FALSE,  5,  'Numeric value of the item'),
  ('d0000000-0000-0000-0000-000000000001', 'cost',             'number',   TRUE,  FALSE, FALSE, FALSE,  6,  'Cost to the business'),
  ('d0000000-0000-0000-0000-000000000001', 'margin',           'number',   TRUE,  FALSE, FALSE, FALSE,  7,  'Margin ratio (0-1)'),
  ('d0000000-0000-0000-0000-000000000001', 'priority',         'integer',  TRUE,  FALSE, FALSE, TRUE,   8,  'Ranking priority (1-100)'),
  ('d0000000-0000-0000-0000-000000000001', 'channels',         'array',    TRUE,  FALSE, FALSE, FALSE,  9,  'Eligible delivery channels'),
  ('d0000000-0000-0000-0000-000000000001', 'placements',       'array',    TRUE,  FALSE, FALSE, FALSE, 10,  'Eligible placements'),
  ('d0000000-0000-0000-0000-000000000001', 'status',           'string',   TRUE,  FALSE, FALSE, TRUE,  11,  'draft, active, paused, expired, archived'),
  ('d0000000-0000-0000-0000-000000000001', 'starts_at',        'datetime', FALSE, FALSE, FALSE, FALSE, 12,  'Activation date'),
  ('d0000000-0000-0000-0000-000000000001', 'ends_at',          'datetime', FALSE, FALSE, FALSE, FALSE, 13,  'Expiration date'),
  ('d0000000-0000-0000-0000-000000000001', 'budget_total',     'number',   FALSE, FALSE, FALSE, FALSE, 14,  'Total budget'),
  ('d0000000-0000-0000-0000-000000000001', 'redemption_count', 'integer',  TRUE,  FALSE, FALSE, FALSE, 15,  'Current redemptions'),
  ('d0000000-0000-0000-0000-000000000001', 'stacking',         'string',   TRUE,  FALSE, FALSE, FALSE, 16,  'exclusive or stackable'),
  ('d0000000-0000-0000-0000-000000000001', 'tags',             'array',    FALSE, FALSE, FALSE, TRUE,  17,  'Tags for filtering')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Decision Policies fields
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('d0000000-0000-0000-0000-000000000002', 'name',              'string',   TRUE,  FALSE, FALSE, TRUE,   1,  'Policy name'),
  ('d0000000-0000-0000-0000-000000000002', 'status',            'string',   TRUE,  FALSE, FALSE, TRUE,   2,  'draft, active, paused, archived'),
  ('d0000000-0000-0000-0000-000000000002', 'objective',         'string',   TRUE,  FALSE, FALSE, TRUE,   3,  'Business objective (maximize_revenue, minimize_churn, etc.)'),
  ('d0000000-0000-0000-0000-000000000002', 'ranking_method',    'string',   TRUE,  FALSE, FALSE, FALSE,  4,  'priority, formula, predictive, explore_exploit'),
  ('d0000000-0000-0000-0000-000000000002', 'ranking_formula',   'json',     FALSE, FALSE, FALSE, FALSE,  5,  'Weighted scoring formula configuration'),
  ('d0000000-0000-0000-0000-000000000002', 'eligibility',       'json',     FALSE, FALSE, FALSE, FALSE,  6,  'Eligibility condition groups (AND/OR)'),
  ('d0000000-0000-0000-0000-000000000002', 'guardrail_ids',     'array',    FALSE, FALSE, FALSE, FALSE,  7,  'Active guardrail references'),
  ('d0000000-0000-0000-0000-000000000002', 'placement_ids',     'array',    FALSE, FALSE, FALSE, FALSE,  8,  'Target placements'),
  ('d0000000-0000-0000-0000-000000000002', 'allow_no_action',   'boolean',  TRUE,  FALSE, FALSE, FALSE,  9,  'Allow suppressing communications'),
  ('d0000000-0000-0000-0000-000000000002', 'experiment',        'json',     FALSE, FALSE, FALSE, FALSE, 10,  'A/B experiment config (holdout %, exploration rate)'),
  ('d0000000-0000-0000-0000-000000000002', 'version',           'integer',  TRUE,  FALSE, FALSE, FALSE, 11,  'Policy version number')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Decision Guardrails fields
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('d0000000-0000-0000-0000-000000000003', 'name',        'string',   TRUE,  FALSE, FALSE, TRUE,  1, 'Guardrail name'),
  ('d0000000-0000-0000-0000-000000000003', 'type',        'string',   TRUE,  FALSE, FALSE, TRUE,  2, 'frequency_cap, fatigue_threshold, quiet_hours, consent_required, etc.'),
  ('d0000000-0000-0000-0000-000000000003', 'enabled',     'boolean',  TRUE,  FALSE, FALSE, TRUE,  3, 'Whether this guardrail is active'),
  ('d0000000-0000-0000-0000-000000000003', 'config',      'json',     TRUE,  FALSE, FALSE, FALSE, 4, 'Guardrail configuration parameters'),
  ('d0000000-0000-0000-0000-000000000003', 'description', 'string',   FALSE, FALSE, FALSE, FALSE, 5, 'Human-readable description')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Decision Traces fields
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('d0000000-0000-0000-0000-000000000004', 'customer_id',     'uuid',     FALSE, FALSE, TRUE,  TRUE,  1, 'Customer evaluated'),
  ('d0000000-0000-0000-0000-000000000004', 'policy_id',       'uuid',     FALSE, FALSE, FALSE, TRUE,  2, 'Policy used for evaluation'),
  ('d0000000-0000-0000-0000-000000000004', 'decision',        'string',   TRUE,  FALSE, FALSE, TRUE,  3, 'action, no_action, fallback, holdout'),
  ('d0000000-0000-0000-0000-000000000004', 'winning_item_id', 'uuid',     FALSE, FALSE, FALSE, TRUE,  4, 'Winning decision item'),
  ('d0000000-0000-0000-0000-000000000004', 'winning_score',   'number',   FALSE, FALSE, FALSE, FALSE, 5, 'Score of the winning item'),
  ('d0000000-0000-0000-0000-000000000004', 'placement',       'string',   FALSE, FALSE, FALSE, TRUE,  6, 'Placement where decision was rendered'),
  ('d0000000-0000-0000-0000-000000000004', 'channel',         'string',   FALSE, FALSE, FALSE, TRUE,  7, 'Channel used'),
  ('d0000000-0000-0000-0000-000000000004', 'trace_steps',     'json',     TRUE,  FALSE, FALSE, FALSE, 8, 'Full pipeline trace (candidates → eligibility → guardrails → ranking)'),
  ('d0000000-0000-0000-0000-000000000004', 'reason_summary',  'string',   FALSE, FALSE, FALSE, FALSE, 9, 'Human-readable decision reason'),
  ('d0000000-0000-0000-0000-000000000004', 'evaluated_at',    'datetime', TRUE,  FALSE, FALSE, TRUE, 10, 'When the decision was made')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Decision Events fields
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('d0000000-0000-0000-0000-000000000005', 'trace_id',    'uuid',     FALSE, FALSE, FALSE, TRUE,  1, 'Link to the decision trace'),
  ('d0000000-0000-0000-0000-000000000005', 'item_id',     'uuid',     FALSE, FALSE, FALSE, TRUE,  2, 'Decision item that triggered this event'),
  ('d0000000-0000-0000-0000-000000000005', 'customer_id', 'uuid',     FALSE, FALSE, TRUE,  TRUE,  3, 'Customer who interacted'),
  ('d0000000-0000-0000-0000-000000000005', 'event_type',  'string',   TRUE,  FALSE, FALSE, TRUE,  4, 'impression, click, dismiss, accept, convert, expire'),
  ('d0000000-0000-0000-0000-000000000005', 'channel',     'string',   FALSE, FALSE, FALSE, TRUE,  5, 'Channel of interaction'),
  ('d0000000-0000-0000-0000-000000000005', 'metadata',    'json',     FALSE, FALSE, FALSE, FALSE, 6, 'Additional event metadata')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Decision Placements fields
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('d0000000-0000-0000-0000-000000000006', 'name',      'string',  TRUE,  FALSE, FALSE, TRUE,  1, 'Placement name'),
  ('d0000000-0000-0000-0000-000000000006', 'channel',   'string',  TRUE,  FALSE, FALSE, TRUE,  2, 'Channel (web, email, whatsapp, etc.)'),
  ('d0000000-0000-0000-0000-000000000006', 'slot',      'string',  TRUE,  FALSE, FALSE, FALSE, 3, 'Slot identifier (hero, sidebar, inline)'),
  ('d0000000-0000-0000-0000-000000000006', 'max_items', 'integer', TRUE,  FALSE, FALSE, FALSE, 4, 'Maximum items shown at once'),
  ('d0000000-0000-0000-0000-000000000006', 'format',    'string',  TRUE,  FALSE, FALSE, FALSE, 5, 'banner, card, inline, modal, notification, message')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Coupon Campaigns fields
INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description) VALUES
  ('d0000000-0000-0000-0000-000000000007', 'name',          'string',   TRUE,  FALSE, FALSE, TRUE,  1, 'Campaign name'),
  ('d0000000-0000-0000-0000-000000000007', 'coupon_type',   'string',   TRUE,  FALSE, FALSE, TRUE,  2, 'single_code or unique_codes'),
  ('d0000000-0000-0000-0000-000000000007', 'discount_type', 'string',   TRUE,  FALSE, FALSE, FALSE, 3, 'percentage, fixed_amount, free_shipping'),
  ('d0000000-0000-0000-0000-000000000007', 'discount_value','number',   TRUE,  FALSE, FALSE, FALSE, 4, 'Discount amount'),
  ('d0000000-0000-0000-0000-000000000007', 'status',        'string',   TRUE,  FALSE, FALSE, TRUE,  5, 'draft, active, paused, expired'),
  ('d0000000-0000-0000-0000-000000000007', 'total_codes',   'integer',  FALSE, FALSE, FALSE, FALSE, 6, 'Total codes generated'),
  ('d0000000-0000-0000-0000-000000000007', 'redeemed_count','integer',  FALSE, FALSE, FALSE, FALSE, 7, 'Number of codes redeemed'),
  ('d0000000-0000-0000-0000-000000000007', 'starts_at',     'datetime', FALSE, FALSE, FALSE, FALSE, 8, 'Campaign start date'),
  ('d0000000-0000-0000-0000-000000000007', 'ends_at',       'datetime', FALSE, FALSE, FALSE, FALSE, 9, 'Campaign end date')
ON CONFLICT (schema_id, name) DO NOTHING;

-- Clone to dev/staging environments
DO $$
DECLARE v_env TEXT;
BEGIN
  FOREACH v_env IN ARRAY ARRAY['development', 'staging'] LOOP
    INSERT INTO public.schema_definitions (tenant_id, environment, name, slug, table_name, is_system, description, status)
    SELECT tenant_id, v_env, name, slug, table_name, is_system, description, status
    FROM public.schema_definitions
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
      AND environment = 'production'
      AND slug IN ('decision_items', 'decision_policies', 'decision_guardrails', 'decision_traces', 'decision_events', 'decision_placements', 'coupon_campaigns')
    ON CONFLICT (tenant_id, environment, slug) DO NOTHING;

    INSERT INTO public.schema_fields (schema_id, name, field_type, is_required, is_primary_key, is_pii, is_indexed, sort_order, description)
    SELECT new_sd.id, sf.name, sf.field_type, sf.is_required, sf.is_primary_key, sf.is_pii, sf.is_indexed, sf.sort_order, sf.description
    FROM public.schema_fields sf
    JOIN public.schema_definitions prod_sd ON sf.schema_id = prod_sd.id AND prod_sd.environment = 'production'
    JOIN public.schema_definitions new_sd ON new_sd.slug = prod_sd.slug AND new_sd.environment = v_env AND new_sd.tenant_id = prod_sd.tenant_id
    WHERE prod_sd.slug IN ('decision_items', 'decision_policies', 'decision_guardrails', 'decision_traces', 'decision_events', 'decision_placements', 'coupon_campaigns')
    ON CONFLICT (schema_id, name) DO NOTHING;
  END LOOP;
END $$;
