// Decision Studio — Next Best Experience Engine
// Core type definitions for the full ML-grounded decisioning pipeline.

// ─── Decision Item (Catalog) ───────────────────────────────────────

export type DecisionItemType =
  | 'offer' | 'coupon' | 'content' | 'recommendation'
  | 'action' | 'message' | 'experience';

export type DecisionItemStatus = 'draft' | 'active' | 'paused' | 'expired' | 'archived';

export type DecisionItem = {
  id: string;
  type: DecisionItemType;
  name: string;
  description: string;
  category: string;
  tags: string[];
  // BusinessValue: normalized to [0,1] at scoring time. Raw value here.
  business_value: number;
  cost: number;
  margin: number;
  priority: number;
  channels: string[];
  placements: string[];
  status: DecisionItemStatus;
  starts_at: string | null;
  ends_at: string | null;
  budget_total: number | null;
  budget_spent: number;
  max_redemptions: number | null;
  redemption_count: number;
  stacking: 'exclusive' | 'stackable';
  content_variants: Record<string, { title: string; body: string; cta: string; image?: string }>;
  // Versioned — every change increments this so historical decisions stay reproducible.
  config_version: number;
  metadata: Record<string, unknown>;
};

// ─── Placement ─────────────────────────────────────────────────────

export type PlacementFormat = 'banner' | 'card' | 'inline' | 'modal' | 'notification' | 'message';

export type Placement = {
  id: string;
  name: string;
  channel: string;
  slot: string;
  max_items: number;
  format: PlacementFormat;
};

// ─── Customer Feature Snapshot ─────────────────────────────────────
// Pre-computed feature store entry. Must respond in <20ms — no live joins.

export type CustomerFeatures = {
  customer_id: string;
  // Profile
  loyalty_tier: string;
  lifetime_value: number;
  total_orders: number;
  avg_order_value: number;
  days_since_last_purchase: number;
  days_since_signup: number;
  age: number | null;
  gender: string | null;
  country: string;
  city: string;
  // RFM (pre-computed)
  rfm_r: number; // recency quintile 1-5
  rfm_f: number; // frequency quintile 1-5
  rfm_m: number; // monetary quintile 1-5
  rfm_segment: string;
  rfm_score: number; // composite 3-15
  // Behavioral (pre-aggregated)
  email_opens_7d: number;
  email_sends_7d: number;
  clicks_7d: number;
  sessions_30d: number;
  // Channel history (for Bayesian shrinkage)
  channel_history: Record<string, { sends: number; opens: number; clicks: number; converts: number }>;
  // Category affinity (for collaborative filtering fallback)
  category_affinities: Record<string, number>; // category -> affinity score [0,1]
  // Consent
  consent: Record<string, boolean>; // channel -> has_consent
  // Fatigue state
  messages_today: number;
  messages_this_week: number;
  last_contacted_hours_ago: number;
  // Predictive (from model or cold-start)
  churn_risk: number;
  // Lifecycle
  lifecycle_stage: 'new' | 'active' | 'loyal' | 'at_risk' | 'churned' | 'reactivated';
  // Recent events
  recent_events: CustomerEvent[];
  // Snapshot metadata
  snapshot_at: string;
};

export type CustomerEvent = {
  event_type: string;
  timestamp: string;
  properties: Record<string, unknown>;
};

// ─── Decision Request ──────────────────────────────────────────────

export type DecisionRequest = {
  customer_id: string;
  placement: string;
  channel: string;
  context: {
    // Real-time context not in feature store
    cart_value?: number;
    cart_items?: number;
    current_page?: string;
    device?: string;
    browser?: string;
    referrer?: string;
    location?: string;
    time_of_day?: number; // hour 0-23
    day_of_week?: number; // 0=Sun
    session_depth?: number;
    [key: string]: unknown;
  };
  count?: number; // how many items to return
  policy_id?: string; // optional override
};

// ─── Scoring ───────────────────────────────────────────────────────

export type ScoreBreakdown = {
  business_value: { raw: number; normalized: number };
  conversion_probability: { raw: number; normalized: number; model_version: string; calibrated: boolean };
  customer_affinity: { raw: number; normalized: number; source: 'model' | 'collaborative' | 'content_based' | 'segment_prior' };
  channel_affinity: { raw: number; normalized: number; sample_size: number; shrinkage_applied: boolean };
  context_relevance: { raw: number; normalized: number; factors: string[] };
  urgency: { raw: number; normalized: number; hours_remaining: number | null };
  fatigue_penalty: { raw: number; normalized: number; exposure_count: number };
  cost_penalty: { raw: number; normalized: number };
};

export type ScoredCandidate = {
  item: DecisionItem;
  score: number;
  breakdown: ScoreBreakdown;
  // Per-feature contributions (SHAP-like)
  feature_contributions: { feature: string; contribution: number; direction: 'positive' | 'negative' }[];
  reason_codes: string[];
  confidence: 'high' | 'medium' | 'low';
  fallback_reason: string | null;
};

// ─── Pipeline Trace ────────────────────────────────────────────────

export type PipelineStage =
  | 'context_resolution'
  | 'candidate_generation'
  | 'eligibility'
  | 'guardrails'
  | 'ranking'
  | 'arbitration'
  | 'final';

export type StageTrace = {
  stage: PipelineStage;
  input_count: number;
  output_count: number;
  filtered: { item_id: string; item_name: string; reason_code: string; reason: string }[];
  duration_ms: number;
  metadata?: Record<string, unknown>;
};

// ─── Decision Response ─────────────────────────────────────────────

export type DecisionOutcome = 'action' | 'no_action' | 'fallback' | 'holdout';

export type DecisionResponse = {
  decision_id: string;
  policy_id: string;
  policy_name: string;
  model_version: string;
  items: ScoredCandidate[];
  decision: DecisionOutcome;
  channel: string;
  reason_summary: string;
  trace: StageTrace[];
  customer_snapshot: CustomerFeatures;
  evaluated_at: string;
  ttl: number;
  is_exploration: boolean;
  replay_hash: string; // hash of inputs for idempotency verification
};

// ─── Decision Log Entry (for persistence + retraining) ─────────────

export type DecisionLogEntry = {
  id: string;
  customer_id: string;
  customer_name: string;
  policy_id: string;
  policy_name: string;
  model_version: string;
  decision: DecisionOutcome;
  winning_item_id: string | null;
  winning_item_name: string;
  score: number;
  score_breakdown: ScoreBreakdown | null;
  channel: string;
  placement: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  is_exploration: boolean;
  fallback_used: boolean;
  // Full trace for replay
  trace: StageTrace[];
  // Feature snapshot at decision time (for training-serving consistency)
  feature_snapshot: Record<string, number>;
  timestamp: string;
  // Outcome (joined asynchronously)
  outcome: DecisionEventType | null;
  outcome_at: string | null;
  outcome_value: number | null;
};

export type DecisionEventType = 'impression' | 'click' | 'dismiss' | 'accept' | 'convert' | 'expire';

// ─── Eligibility ───────────────────────────────────────────────────

export type ConditionField =
  | 'loyalty_tier' | 'lifetime_value' | 'total_orders' | 'avg_order_value'
  | 'days_since_last_purchase' | 'days_since_signup' | 'age' | 'gender' | 'country' | 'city'
  | 'cart_value' | 'cart_items' | 'current_page' | 'device' | 'browser' | 'referrer'
  | 'email_opens_7d' | 'clicks_7d' | 'sessions_30d' | 'viewed_product' | 'searched_keyword'
  | 'rfm_segment' | 'rfm_score' | 'churn_risk' | 'lifecycle_stage'
  | 'consent_email' | 'consent_whatsapp' | 'consent_sms' | 'consent_push'
  | 'messages_today' | 'messages_this_week' | 'last_contacted_hours_ago'
  | 'audience_membership' | 'tag' | 'custom_attribute';

export type ConditionOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in' | 'contains' | 'not_contains'
  | 'between' | 'exists' | 'not_exists';

export type EligibilityCondition = {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: unknown;
  label?: string;
};

export type ConditionGroup = {
  id: string;
  logic: 'and' | 'or';
  conditions: EligibilityCondition[];
};

// ─── Guardrails ────────────────────────────────────────────────────

export type GuardrailType =
  | 'frequency_cap' | 'channel_limit' | 'fatigue_threshold' | 'budget_limit'
  | 'quiet_hours' | 'cooldown' | 'consent_required' | 'inventory_check'
  | 'blackout_dates' | 'global_suppression';

export type Guardrail = {
  id: string;
  name: string;
  type: GuardrailType;
  enabled: boolean;
  config: Record<string, unknown>;
  description: string;
};

// ─── Decision Policy ───────────────────────────────────────────────

export type BusinessObjective =
  | 'maximize_conversion' | 'maximize_revenue' | 'maximize_profit'
  | 'maximize_engagement' | 'minimize_churn' | 'maximize_clv'
  | 'balanced_growth';

export type RankingMethod = 'priority' | 'formula' | 'predictive' | 'explore_exploit';

export type RankingFormula = {
  business_value_weight: number;
  conversion_probability_weight: number;
  customer_affinity_weight: number;
  channel_affinity_weight: number;
  context_relevance_weight: number;
  urgency_weight: number;
  fatigue_penalty_weight: number;
  cost_penalty_weight: number;
};

export type DecisionPolicy = {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  objective: BusinessObjective;
  placement_ids: string[];
  item_collection: { type: 'all' | 'category' | 'tag' | 'manual'; filter: string[] };
  eligibility: ConditionGroup[];
  ranking_method: RankingMethod;
  ranking_formula: RankingFormula;
  guardrail_ids: string[];
  fallback_item_id: string | null;
  allow_no_action: boolean;
  channel_arbitration: boolean;
  timing_optimization: boolean;
  experiment: {
    enabled: boolean;
    holdout_percent: number;
    exploration_rate: number;
    variant_splits: { name: string; percent: number }[];
  };
  max_items_returned: number;
  ttl_seconds: number;
  version: number;
  created_at: string;
  updated_at: string;
};

// ─── Model Metadata ────────────────────────────────────────────────

export type ModelPhase = 'bootstrap' | 'growth' | 'maturity';

export type ModelVersion = {
  id: string;
  phase: ModelPhase;
  version: string;
  trained_at: string;
  training_samples: number;
  // Offline evaluation metrics
  auc_roc: number;
  log_loss: number;
  calibration_error: number; // Expected Calibration Error
  lift_over_random: number;
  // Per-segment metrics
  segment_metrics: Record<string, { auc: number; lift: number; calibration_error: number; sample_size: number }>;
  // Feature importance
  feature_importance: { feature: string; importance: number }[];
  status: 'shadow' | 'champion' | 'retired';
  // Population Stability Index for drift detection
  psi_threshold: number;
  current_psi: number;
};

// ─── RFM Types ─────────────────────────────────────────────────────

export type RfmConfig = {
  recency_bins: number; // typically 5 (quintiles)
  frequency_bins: number;
  monetary_bins: number;
  // Thresholds computed from data — not arbitrary
  recency_thresholds: number[];
  frequency_thresholds: number[];
  monetary_thresholds: number[];
  computed_at: string;
  customer_count: number;
};

export type RfmSegment = {
  id: string;
  name: string;
  description: string;
  color: string;
  // Defining R/F/M score ranges
  r_range: [number, number]; // min, max quintile
  f_range: [number, number];
  m_range: [number, number];
  // Computed stats
  count: number;
  percent: number;
  avg_ltv: number;
  avg_orders: number;
  avg_recency_days: number;
  // Actionable recommendations
  recommended_action: string;
  recommended_offer_type: string;
  // Conversion priors for cold-start
  conversion_prior: number; // segment-level P(conversion)
  channel_priors: Record<string, number>; // channel -> P(open|segment)
};

export type RfmCustomerScore = {
  customer_id: string;
  recency_days: number;
  frequency: number;
  monetary: number;
  r_score: number; // 1-5 quintile
  f_score: number;
  m_score: number;
  composite: number; // r+f+m
  segment: string;
};

// ─── Constants ─────────────────────────────────────────────────────

export const ITEM_TYPE_LABELS: Record<DecisionItemType, string> = {
  offer: 'Offer', coupon: 'Coupon', content: 'Content',
  recommendation: 'Recommendation', action: 'Action',
  message: 'Message', experience: 'Experience',
};

export const OBJECTIVE_LABELS: Record<BusinessObjective, string> = {
  maximize_conversion: 'Maximize Conversion',
  maximize_revenue: 'Maximize Revenue',
  maximize_profit: 'Maximize Profit',
  maximize_engagement: 'Maximize Engagement',
  minimize_churn: 'Minimize Churn',
  maximize_clv: 'Maximize CLV',
  balanced_growth: 'Balanced Growth',
};

export const CONDITION_CATEGORIES: Record<string, { label: string; fields: { field: ConditionField; label: string }[] }> = {
  profile: {
    label: 'Customer Profile',
    fields: [
      { field: 'loyalty_tier', label: 'Loyalty Tier' },
      { field: 'lifetime_value', label: 'Lifetime Value' },
      { field: 'total_orders', label: 'Total Orders' },
      { field: 'avg_order_value', label: 'Avg Order Value' },
      { field: 'days_since_last_purchase', label: 'Days Since Last Purchase' },
      { field: 'days_since_signup', label: 'Days Since Signup' },
      { field: 'age', label: 'Age' },
      { field: 'country', label: 'Country' },
      { field: 'city', label: 'City' },
    ],
  },
  behavioral: {
    label: 'Behavioral',
    fields: [
      { field: 'email_opens_7d', label: 'Email Opens (7d)' },
      { field: 'clicks_7d', label: 'Clicks (7d)' },
      { field: 'sessions_30d', label: 'Sessions (30d)' },
    ],
  },
  context: {
    label: 'Real-Time Context',
    fields: [
      { field: 'cart_value', label: 'Cart Value' },
      { field: 'cart_items', label: 'Cart Items' },
      { field: 'current_page', label: 'Current Page' },
      { field: 'device', label: 'Device' },
      { field: 'referrer', label: 'Referrer' },
    ],
  },
  predictive: {
    label: 'AI / Predictive',
    fields: [
      { field: 'rfm_segment', label: 'RFM Segment' },
      { field: 'rfm_score', label: 'RFM Score' },
      { field: 'churn_risk', label: 'Churn Risk Score' },
      { field: 'lifecycle_stage', label: 'Lifecycle Stage' },
    ],
  },
  consent: {
    label: 'Consent & Fatigue',
    fields: [
      { field: 'consent_email', label: 'Email Consent' },
      { field: 'consent_whatsapp', label: 'WhatsApp Consent' },
      { field: 'consent_sms', label: 'SMS Consent' },
      { field: 'consent_push', label: 'Push Consent' },
      { field: 'messages_today', label: 'Messages Today' },
      { field: 'messages_this_week', label: 'Messages This Week' },
      { field: 'last_contacted_hours_ago', label: 'Hours Since Last Contact' },
    ],
  },
};

export const DEFAULT_FORMULA: RankingFormula = {
  business_value_weight: 0.20,
  conversion_probability_weight: 0.25,
  customer_affinity_weight: 0.15,
  channel_affinity_weight: 0.10,
  context_relevance_weight: 0.10,
  urgency_weight: 0.10,
  fatigue_penalty_weight: 0.05,
  cost_penalty_weight: 0.05,
};

export const DEFAULT_PLACEMENTS: Placement[] = [
  { id: 'web_hero', name: 'Website Hero Banner', channel: 'web', slot: 'hero', max_items: 1, format: 'banner' },
  { id: 'web_checkout', name: 'Checkout Offer', channel: 'web', slot: 'checkout', max_items: 2, format: 'card' },
  { id: 'app_home', name: 'App Home Card', channel: 'app', slot: 'home', max_items: 3, format: 'card' },
  { id: 'email_primary', name: 'Email Primary Offer', channel: 'email', slot: 'primary', max_items: 1, format: 'card' },
  { id: 'whatsapp_offer', name: 'WhatsApp Offer', channel: 'whatsapp', slot: 'offer', max_items: 1, format: 'message' },
  { id: 'push_notification', name: 'Push Notification', channel: 'push', slot: 'notification', max_items: 1, format: 'notification' },
  { id: 'sms_offer', name: 'SMS Offer', channel: 'sms', slot: 'offer', max_items: 1, format: 'message' },
  { id: 'rcs_card', name: 'RCS Rich Card', channel: 'rcs', slot: 'card', max_items: 1, format: 'card' },
  { id: 'journey_branch', name: 'Journey Decision Point', channel: 'journey', slot: 'branch', max_items: 5, format: 'inline' },
];

export const DEFAULT_GUARDRAILS: Guardrail[] = [
  { id: 'g_freq_daily', name: 'Daily Message Cap', type: 'frequency_cap', enabled: true, config: { max_messages: 3, period: 'day', scope: 'all_channels' }, description: 'Maximum 3 marketing messages per day across all channels' },
  { id: 'g_freq_wa', name: 'WhatsApp Rate Limit', type: 'channel_limit', enabled: true, config: { channel: 'whatsapp', max_messages: 1, period: '24h' }, description: 'Maximum 1 WhatsApp message per 24 hours' },
  { id: 'g_fatigue', name: 'Customer Fatigue Protection', type: 'fatigue_threshold', enabled: true, config: { max_pressure_score: 80, suppress_above: 80, prefer_inbound_above: 60 }, description: 'Suppress outbound when fatigue score exceeds 80' },
  { id: 'g_cooldown', name: 'Post-Purchase Cooldown', type: 'cooldown', enabled: true, config: { hours: 48, after_event: 'purchase' }, description: '48-hour cooldown after purchase before next promotional message' },
  { id: 'g_consent', name: 'Consent Enforcement', type: 'consent_required', enabled: true, config: { channels: ['email', 'whatsapp', 'sms', 'push'] }, description: 'Require opt-in consent before sending on each channel' },
  { id: 'g_quiet', name: 'Quiet Hours', type: 'quiet_hours', enabled: true, config: { start: '22:00', end: '08:00', timezone: 'customer' }, description: 'No outbound messages between 10 PM and 8 AM customer time' },
];
