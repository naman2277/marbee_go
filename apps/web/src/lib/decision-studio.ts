import { supabase } from './supabase';
import { logAudit } from './audit';
import type { Customer } from '@marbee/shared';

// ─── Decision Item Types ────────────────────────────────────────────

export type DecisionItemType =
  | 'offer'
  | 'coupon'
  | 'content'
  | 'recommendation'
  | 'action'
  | 'message'
  | 'experience';

export const ITEM_TYPE_LABELS: Record<DecisionItemType, string> = {
  offer: 'Offer',
  coupon: 'Coupon',
  content: 'Content',
  recommendation: 'Recommendation',
  action: 'Action',
  message: 'Message',
  experience: 'Experience',
};

export const ITEM_TYPE_ICONS: Record<DecisionItemType, string> = {
  offer: 'gift',
  coupon: 'ticket',
  content: 'file-text',
  recommendation: 'sparkles',
  action: 'zap',
  message: 'message-square',
  experience: 'layout',
};

export type DecisionItem = {
  id: string;
  type: DecisionItemType;
  name: string;
  description: string;
  category: string;
  tags: string[];
  value: number;
  cost: number;
  margin: number;
  priority: number;
  channels: string[];
  placements: string[];
  status: 'draft' | 'active' | 'paused' | 'expired' | 'archived';
  starts_at: string | null;
  ends_at: string | null;
  budget_total: number | null;
  budget_spent: number;
  max_redemptions: number | null;
  redemption_count: number;
  stacking: 'exclusive' | 'stackable';
  content_variants: Record<string, { title: string; body: string; cta: string; image?: string }>;
  metadata: Record<string, unknown>;
};

// ─── Placements ─────────────────────────────────────────────────────

export type Placement = {
  id: string;
  name: string;
  channel: string;
  slot: string;
  max_items: number;
  format: 'banner' | 'card' | 'inline' | 'modal' | 'notification' | 'message';
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

// ─── Eligibility Conditions ─────────────────────────────────────────

export type ConditionField =
  | 'loyalty_tier' | 'lifetime_value' | 'total_orders' | 'avg_order_value'
  | 'days_since_last_purchase' | 'days_since_signup' | 'age' | 'gender' | 'country' | 'city'
  | 'cart_value' | 'cart_items' | 'current_page' | 'device' | 'browser' | 'referrer'
  | 'email_opens_7d' | 'clicks_7d' | 'sessions_30d' | 'viewed_product' | 'searched_keyword'
  | 'rfm_segment' | 'churn_risk' | 'propensity_score' | 'channel_preference'
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
  behavior: {
    label: 'Behavioral',
    fields: [
      { field: 'email_opens_7d', label: 'Email Opens (7d)' },
      { field: 'clicks_7d', label: 'Clicks (7d)' },
      { field: 'sessions_30d', label: 'Sessions (30d)' },
      { field: 'viewed_product', label: 'Viewed Product' },
      { field: 'searched_keyword', label: 'Searched Keyword' },
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
      { field: 'churn_risk', label: 'Churn Risk Score' },
      { field: 'propensity_score', label: 'Purchase Propensity' },
      { field: 'channel_preference', label: 'Channel Preference' },
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

// ─── Ranking Strategies ─────────────────────────────────────────────

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

export const DEFAULT_FORMULA: RankingFormula = {
  business_value_weight: 0.25,
  conversion_probability_weight: 0.20,
  customer_affinity_weight: 0.15,
  channel_affinity_weight: 0.10,
  context_relevance_weight: 0.10,
  urgency_weight: 0.10,
  fatigue_penalty_weight: 0.05,
  cost_penalty_weight: 0.05,
};

// ─── Guardrails ─────────────────────────────────────────────────────

export type GuardrailType =
  | 'frequency_cap'
  | 'channel_limit'
  | 'fatigue_threshold'
  | 'budget_limit'
  | 'quiet_hours'
  | 'cooldown'
  | 'consent_required'
  | 'inventory_check'
  | 'blackout_dates'
  | 'global_suppression';

export type Guardrail = {
  id: string;
  name: string;
  type: GuardrailType;
  enabled: boolean;
  config: Record<string, unknown>;
  description: string;
};

export const DEFAULT_GUARDRAILS: Guardrail[] = [
  {
    id: 'g_freq_daily',
    name: 'Daily Message Cap',
    type: 'frequency_cap',
    enabled: true,
    config: { max_messages: 3, period: 'day', scope: 'all_channels' },
    description: 'Maximum 3 marketing messages per day across all channels',
  },
  {
    id: 'g_freq_wa',
    name: 'WhatsApp Rate Limit',
    type: 'channel_limit',
    enabled: true,
    config: { channel: 'whatsapp', max_messages: 1, period: '24h' },
    description: 'Maximum 1 WhatsApp message per 24 hours',
  },
  {
    id: 'g_fatigue',
    name: 'Customer Fatigue Protection',
    type: 'fatigue_threshold',
    enabled: true,
    config: { max_pressure_score: 80, suppress_above: 80, prefer_inbound_above: 60 },
    description: 'Suppress outbound when fatigue score exceeds 80',
  },
  {
    id: 'g_cooldown',
    name: 'Post-Purchase Cooldown',
    type: 'cooldown',
    enabled: true,
    config: { hours: 48, after_event: 'purchase' },
    description: '48-hour cooldown after purchase before next promotional message',
  },
  {
    id: 'g_consent',
    name: 'Consent Enforcement',
    type: 'consent_required',
    enabled: true,
    config: { channels: ['email', 'whatsapp', 'sms', 'push'] },
    description: 'Require opt-in consent before sending on each channel',
  },
  {
    id: 'g_quiet',
    name: 'Quiet Hours',
    type: 'quiet_hours',
    enabled: true,
    config: { start: '22:00', end: '08:00', timezone: 'customer' },
    description: 'No outbound messages between 10 PM and 8 AM customer time',
  },
];

// ─── Decision Policy ────────────────────────────────────────────────

export type BusinessObjective =
  | 'maximize_conversion' | 'maximize_revenue' | 'maximize_profit'
  | 'maximize_engagement' | 'minimize_churn' | 'maximize_clv'
  | 'balanced_growth';

export const OBJECTIVE_LABELS: Record<BusinessObjective, string> = {
  maximize_conversion: 'Maximize Conversion',
  maximize_revenue: 'Maximize Revenue',
  maximize_profit: 'Maximize Profit',
  maximize_engagement: 'Maximize Engagement',
  minimize_churn: 'Minimize Churn',
  maximize_clv: 'Maximize CLV',
  balanced_growth: 'Balanced Growth',
};

export type DecisionPolicy = {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  objective: BusinessObjective;
  placement_ids: string[];
  item_collection: { type: 'all' | 'category' | 'tag' | 'manual'; filter: string[]; };
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

// ─── Decision Request / Response ────────────────────────────────────

export type DecisionRequest = {
  customer_id: string;
  placement: string;
  channel: string;
  context: {
    customer_name?: string;
    loyalty_tier?: string;
    cart_value?: number;
    cart_items?: number;
    current_page?: string;
    device?: string;
    location?: string;
    rfm_segment?: string;
    churn_risk?: number;
    propensity_score?: number;
    days_since_last_purchase?: number;
    messages_today?: number;
    lifetime_value?: number;
    total_orders?: number;
    [key: string]: unknown;
  };
  count?: number;
};

export type ScoredCandidate = {
  item: DecisionItem;
  score: number;
  breakdown: {
    business_value: number;
    conversion_prob: number;
    customer_affinity: number;
    channel_affinity: number;
    context_relevance: number;
    urgency: number;
    fatigue_penalty: number;
    cost_penalty: number;
    priority_bonus: number;
  };
  reason_codes: string[];
};

export type DecisionTraceStep = {
  stage: 'candidates' | 'eligibility' | 'guardrails' | 'ranking' | 'arbitration' | 'final';
  input_count: number;
  output_count: number;
  filtered: { item_name: string; reason: string }[];
  duration_ms: number;
};

export type DecisionResponse = {
  decision_id: string;
  policy_id: string;
  policy_name: string;
  items: ScoredCandidate[];
  decision: 'action' | 'no_action' | 'fallback' | 'holdout';
  channel: string;
  reason_summary: string;
  trace: DecisionTraceStep[];
  evaluated_at: string;
  ttl: number;
};

// ─── Storage Keys ───────────────────────────────────────────────────

const SK = {
  items: (t: string, e: string) => `marbee_decision_items_${t}_${e}`,
  policies: (t: string, e: string) => `marbee_decision_policies_v4_${t}_${e}`,
  guardrails: (t: string, e: string) => `marbee_decision_guardrails_${t}_${e}`,
  log: (t: string, e: string) => `marbee_decision_log_${t}_${e}`,
};

function lsGet<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─── CRUD Functions ─────────────────────────────────────────────────

export async function fetchDecisionItems(tenantId: string, env: string): Promise<DecisionItem[]> {
  const items = lsGet<DecisionItem[]>(SK.items(tenantId, env), []);
  if (items.length) return items;

  // Pull offers + coupons from existing tables as decision items
  try {
    const [offersRes, couponsRes] = await Promise.all([
      supabase.from('loyalty_offers').select('*').eq('tenant_id', tenantId).eq('environment', env),
      supabase.from('coupon_campaigns').select('*').eq('tenant_id', tenantId).eq('environment', env),
    ]);

    const mapped: DecisionItem[] = [];
    for (const o of offersRes.data ?? []) {
      mapped.push({
        id: o.id,
        type: 'offer',
        name: o.name,
        description: o.description || '',
        category: o.offer_type || 'discount_percent',
        tags: o.tags || [],
        value: o.offer_value || 0,
        cost: (o.offer_value || 0) * (o.margin_impact || 0.1),
        margin: 1 - (o.margin_impact || 0.1),
        priority: o.priority || 50,
        channels: [o.channel || 'all'],
        placements: [o.placement || 'checkout'],
        status: o.status || 'active',
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        budget_total: o.budget_total,
        budget_spent: o.budget_spent || 0,
        max_redemptions: o.max_redemptions,
        redemption_count: o.redemption_count || 0,
        stacking: o.stacking_mode || 'exclusive',
        content_variants: {},
        metadata: { source: 'loyalty_offers', offer_type: o.offer_type },
      });
    }
    for (const c of couponsRes.data ?? []) {
      mapped.push({
        id: c.id,
        type: 'coupon',
        name: c.name,
        description: c.description || '',
        category: c.discount_type || 'percentage',
        tags: [],
        value: c.discount_value || 0,
        cost: c.discount_value || 0,
        margin: 1 - ((c.discount_value || 0) / 100),
        priority: 50,
        channels: ['all'],
        placements: ['checkout'],
        status: c.status || 'active',
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        budget_total: c.budget_cap,
        budget_spent: c.revenue_redeemed || 0,
        max_redemptions: c.max_total_redemptions,
        redemption_count: c.total_redeemed || 0,
        stacking: 'exclusive',
        content_variants: {},
        metadata: { source: 'coupon_campaigns', code_prefix: c.code_prefix },
      });
    }
    if (mapped.length) lsSet(SK.items(tenantId, env), mapped);
    return mapped;
  } catch { return []; }
}

export function saveDecisionItems(tenantId: string, env: string, items: DecisionItem[]): DecisionItem[] {
  lsSet(SK.items(tenantId, env), items);
  return items;
}

export function saveDecisionItem(tenantId: string, env: string, item: DecisionItem): DecisionItem[] {
  const items = lsGet<DecisionItem[]>(SK.items(tenantId, env), []);
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) items[idx] = item; else items.unshift(item);
  lsSet(SK.items(tenantId, env), items);
  return items;
}

export function deleteDecisionItem(tenantId: string, env: string, id: string): DecisionItem[] {
  const items = lsGet<DecisionItem[]>(SK.items(tenantId, env), []).filter(i => i.id !== id);
  lsSet(SK.items(tenantId, env), items);
  return items;
}

export function fetchDecisionPolicies(tenantId: string, env: string): DecisionPolicy[] {
  return lsGet<DecisionPolicy[]>(SK.policies(tenantId, env), []);
}

export function saveDecisionPolicies(tenantId: string, env: string, policies: DecisionPolicy[]): DecisionPolicy[] {
  lsSet(SK.policies(tenantId, env), policies);
  void logAudit({ tenantId, environment: env, action: 'update', resourceType: 'decision_policies', resourceId: tenantId, resourceName: `Updated ${policies.length} Decision Policies` });
  return policies;
}

export function saveDecisionPolicyItem(tenantId: string, env: string, policy: DecisionPolicy): DecisionPolicy[] {
  const all = fetchDecisionPolicies(tenantId, env);
  const idx = all.findIndex(p => p.id === policy.id);
  if (idx >= 0) all[idx] = policy; else all.unshift(policy);
  return saveDecisionPolicies(tenantId, env, all);
}

export function deleteDecisionPolicyItem(tenantId: string, env: string, id: string): DecisionPolicy[] {
  const all = fetchDecisionPolicies(tenantId, env).filter(p => p.id !== id);
  return saveDecisionPolicies(tenantId, env, all);
}

export function fetchGuardrails(tenantId: string, env: string): Guardrail[] {
  return lsGet<Guardrail[]>(SK.guardrails(tenantId, env), DEFAULT_GUARDRAILS);
}

export function saveGuardrails(tenantId: string, env: string, guardrails: Guardrail[]): Guardrail[] {
  lsSet(SK.guardrails(tenantId, env), guardrails);
  return guardrails;
}

// ─── Decision Log ───────────────────────────────────────────────────

export type DecisionLogEntry = {
  id: string;
  customer_id: string;
  customer_name: string;
  policy_name: string;
  decision: string;
  winning_item: string;
  score: number;
  channel: string;
  reason: string;
  timestamp: string;
};

export function fetchDecisionLog(tenantId: string, env: string): DecisionLogEntry[] {
  return lsGet<DecisionLogEntry[]>(SK.log(tenantId, env), []);
}

function appendDecisionLog(tenantId: string, env: string, entry: DecisionLogEntry) {
  const log = fetchDecisionLog(tenantId, env);
  log.unshift(entry);
  if (log.length > 500) log.length = 500;
  lsSet(SK.log(tenantId, env), log);
}

// ─── Scoring Engine ─────────────────────────────────────────────────

function normalizeScore(val: number, max: number): number {
  return Math.min(Math.max(val / max, 0), 1);
}

function computeContextRelevance(item: DecisionItem, req: DecisionRequest): number {
  let score = 0.5;
  const ctx = req.context;
  if (item.placements.includes(req.placement) || item.placements.includes('all')) score += 0.2;
  if (item.channels.includes(req.channel) || item.channels.includes('all')) score += 0.15;
  if (ctx.cart_value && item.category === 'discount_percent' && ctx.cart_value > 2000) score += 0.15;
  return Math.min(score, 1);
}

function computeUrgency(item: DecisionItem): number {
  if (!item.ends_at) return 0.3;
  const hoursLeft = (new Date(item.ends_at).getTime() - Date.now()) / 3600000;
  if (hoursLeft < 0) return 0;
  if (hoursLeft < 24) return 1.0;
  if (hoursLeft < 72) return 0.7;
  if (hoursLeft < 168) return 0.4;
  return 0.2;
}

function computeFatigue(ctx: DecisionRequest['context']): number {
  const msgToday = ctx.messages_today ?? 0;
  if (msgToday >= 3) return 1.0;
  if (msgToday >= 2) return 0.6;
  if (msgToday >= 1) return 0.3;
  return 0;
}

function scoreCandidate(
  item: DecisionItem,
  req: DecisionRequest,
  formula: RankingFormula,
): ScoredCandidate {
  const ctx = req.context;

  const bv = normalizeScore(item.value, 100) * 100;
  const cp = (ctx.propensity_score ?? 0.5) * 100;
  const ca = item.priority / 100 * 100;
  const cha = (item.channels.includes(req.channel) || item.channels.includes('all')) ? 90 : 40;
  const cr = computeContextRelevance(item, req) * 100;
  const urg = computeUrgency(item) * 100;
  const fat = computeFatigue(ctx) * 100;
  const cost = normalizeScore(item.cost, item.value || 1) * 100;
  const prio = (100 - item.priority);

  const weighted =
    bv * formula.business_value_weight +
    cp * formula.conversion_probability_weight +
    ca * formula.customer_affinity_weight +
    cha * formula.channel_affinity_weight +
    cr * formula.context_relevance_weight +
    urg * formula.urgency_weight -
    fat * formula.fatigue_penalty_weight -
    cost * formula.cost_penalty_weight +
    prio * 0.05;

  const reasons: string[] = [];
  if (bv > 60) reasons.push('HIGH_VALUE');
  if (cp > 70) reasons.push('HIGH_CONVERSION_PROPENSITY');
  if (cha > 80) reasons.push('CHANNEL_MATCH');
  if (urg > 70) reasons.push('TIME_SENSITIVE');
  if (cr > 70) reasons.push('CONTEXT_RELEVANT');
  if (ctx.loyalty_tier === 'Gold' || ctx.loyalty_tier === 'Platinum') reasons.push('PREMIUM_CUSTOMER');
  if ((ctx.churn_risk ?? 0) > 0.6) reasons.push('CHURN_RISK');

  return {
    item,
    score: Math.round(weighted * 10) / 10,
    breakdown: {
      business_value: Math.round(bv),
      conversion_prob: Math.round(cp),
      customer_affinity: Math.round(ca),
      channel_affinity: Math.round(cha),
      context_relevance: Math.round(cr),
      urgency: Math.round(urg),
      fatigue_penalty: Math.round(fat),
      cost_penalty: Math.round(cost),
      priority_bonus: Math.round(prio),
    },
    reason_codes: reasons,
  };
}

function checkCondition(cond: EligibilityCondition, ctx: DecisionRequest['context']): boolean {
  const val = ctx[cond.field];
  const target = cond.value;

  switch (cond.operator) {
    case 'eq': return val === target;
    case 'neq': return val !== target;
    case 'gt': return Number(val) > Number(target);
    case 'gte': return Number(val) >= Number(target);
    case 'lt': return Number(val) < Number(target);
    case 'lte': return Number(val) <= Number(target);
    case 'in': return Array.isArray(target) ? target.includes(val) : String(target).split(',').map(s => s.trim()).includes(String(val));
    case 'not_in': return Array.isArray(target) ? !target.includes(val) : !String(target).split(',').map(s => s.trim()).includes(String(val));
    case 'contains': return String(val ?? '').toLowerCase().includes(String(target).toLowerCase());
    case 'exists': return val != null && val !== '';
    case 'not_exists': return val == null || val === '';
    default: return true;
  }
}

function checkGuardrail(g: Guardrail, ctx: DecisionRequest['context'], channel: string): { pass: boolean; reason: string } {
  if (!g.enabled) return { pass: true, reason: '' };

  const cfg = g.config;
  switch (g.type) {
    case 'frequency_cap': {
      const max = (cfg.max_messages as number) ?? 3;
      const actual = ctx.messages_today ?? 0;
      return actual >= max
        ? { pass: false, reason: `Frequency cap: ${actual}/${max} messages today` }
        : { pass: true, reason: '' };
    }
    case 'channel_limit': {
      if (cfg.channel !== channel) return { pass: true, reason: '' };
      const max = (cfg.max_messages as number) ?? 1;
      const actual = ctx.messages_today ?? 0;
      return actual >= max
        ? { pass: false, reason: `${channel} limit: ${actual}/${max}` }
        : { pass: true, reason: '' };
    }
    case 'fatigue_threshold': {
      const pressure = (ctx.messages_today ?? 0) * 25 + (ctx.messages_this_week ?? 0) * 5;
      const max = (cfg.max_pressure_score as number) ?? 80;
      return pressure >= max
        ? { pass: false, reason: `Fatigue score ${pressure} >= ${max}` }
        : { pass: true, reason: '' };
    }
    case 'cooldown': {
      const hours = (cfg.hours as number) ?? 48;
      const lastContact = ctx.last_contacted_hours_ago;
      return lastContact != null && Number(lastContact) < hours
        ? { pass: false, reason: `Cooldown: last contact ${lastContact}h ago < ${hours}h` }
        : { pass: true, reason: '' };
    }
    case 'consent_required': {
      const consentKey = `consent_${channel}` as ConditionField;
      const hasConsent = ctx[consentKey];
      return hasConsent === false
        ? { pass: false, reason: `No ${channel} consent` }
        : { pass: true, reason: '' };
    }
    case 'quiet_hours': {
      const hour = new Date().getHours();
      const start = parseInt(String(cfg.start ?? '22').split(':')[0]);
      const end = parseInt(String(cfg.end ?? '8').split(':')[0]);
      const inQuiet = start > end ? (hour >= start || hour < end) : (hour >= start && hour < end);
      return inQuiet
        ? { pass: false, reason: `Quiet hours (${cfg.start}-${cfg.end})` }
        : { pass: true, reason: '' };
    }
    default:
      return { pass: true, reason: '' };
  }
}

// ─── Main Decision Engine ───────────────────────────────────────────

export function evaluateDecision(
  items: DecisionItem[],
  policy: DecisionPolicy,
  guardrails: Guardrail[],
  request: DecisionRequest,
): DecisionResponse {
  const trace: DecisionTraceStep[] = [];
  const t0 = Date.now();

  // Stage 1: Candidate generation
  let candidates = items.filter(i => {
    if (i.status !== 'active') return false;
    if (i.ends_at && new Date(i.ends_at) < new Date()) return false;
    if (i.starts_at && new Date(i.starts_at) > new Date()) return false;
    if (i.budget_total && i.budget_spent >= i.budget_total) return false;
    if (i.max_redemptions && i.redemption_count >= i.max_redemptions) return false;

    if (policy.item_collection.type === 'category') {
      return policy.item_collection.filter.includes(i.category);
    }
    if (policy.item_collection.type === 'tag') {
      return i.tags.some(t => policy.item_collection.filter.includes(t));
    }
    if (policy.item_collection.type === 'manual') {
      return policy.item_collection.filter.includes(i.id);
    }
    return true;
  });

  const candidateFiltered = items.filter(i => !candidates.includes(i)).map(i => ({
    item_name: i.name,
    reason: i.status !== 'active' ? 'Inactive' : i.ends_at && new Date(i.ends_at) < new Date() ? 'Expired' : 'Not in collection',
  }));

  trace.push({
    stage: 'candidates',
    input_count: items.length,
    output_count: candidates.length,
    filtered: candidateFiltered.slice(0, 20),
    duration_ms: Date.now() - t0,
  });

  // Stage 2: Eligibility
  const t1 = Date.now();
  const eligibleFiltered: { item_name: string; reason: string }[] = [];

  if (policy.eligibility.length > 0) {
    candidates = candidates.filter(item => {
      for (const group of policy.eligibility) {
        const results = group.conditions.map(c => checkCondition(c, request.context));
        const pass = group.logic === 'and' ? results.every(Boolean) : results.some(Boolean);
        if (!pass) {
          const failedCond = group.conditions.find((_c, i) => !results[i]);
          eligibleFiltered.push({
            item_name: item.name,
            reason: failedCond ? `${failedCond.field} ${failedCond.operator} ${JSON.stringify(failedCond.value)}` : 'Eligibility rule failed',
          });
          return false;
        }
      }
      return true;
    });
  }

  trace.push({
    stage: 'eligibility',
    input_count: trace[0].output_count,
    output_count: candidates.length,
    filtered: eligibleFiltered,
    duration_ms: Date.now() - t1,
  });

  // Stage 3: Guardrails
  const t2 = Date.now();
  const guardrailFiltered: { item_name: string; reason: string }[] = [];
  const activeGuardrails = guardrails.filter(g => policy.guardrail_ids.includes(g.id));
  let suppressed = false;

  for (const g of activeGuardrails) {
    const { pass, reason } = checkGuardrail(g, request.context, request.channel);
    if (!pass) {
      suppressed = true;
      guardrailFiltered.push({ item_name: '[ALL]', reason });
    }
  }

  if (suppressed && !policy.allow_no_action) {
    candidates = [];
  }

  trace.push({
    stage: 'guardrails',
    input_count: trace[1].output_count,
    output_count: suppressed ? 0 : candidates.length,
    filtered: guardrailFiltered,
    duration_ms: Date.now() - t2,
  });

  // Stage 4: Ranking
  const t3 = Date.now();
  const scored = candidates.map(item => scoreCandidate(item, request, policy.ranking_formula));
  scored.sort((a, b) => b.score - a.score);

  trace.push({
    stage: 'ranking',
    input_count: candidates.length,
    output_count: scored.length,
    filtered: [],
    duration_ms: Date.now() - t3,
  });

  // Stage 5: Arbitration
  const t4 = Date.now();
  const maxItems = policy.max_items_returned || 1;
  const final = scored.slice(0, maxItems);

  // Holdout check
  let isHoldout = false;
  if (policy.experiment.enabled && policy.experiment.holdout_percent > 0) {
    const hash = simpleHash(request.customer_id + policy.id);
    if ((hash % 100) < policy.experiment.holdout_percent) {
      isHoldout = true;
    }
  }

  trace.push({
    stage: 'final',
    input_count: scored.length,
    output_count: isHoldout ? 0 : final.length,
    filtered: isHoldout ? [{ item_name: '[HOLDOUT]', reason: `Customer in ${policy.experiment.holdout_percent}% holdout group` }] : [],
    duration_ms: Date.now() - t4,
  });

  let decision: DecisionResponse['decision'] = 'action';
  let responseItems = final;

  if (isHoldout) {
    decision = 'holdout';
    responseItems = [];
  } else if (suppressed && policy.allow_no_action) {
    decision = 'no_action';
    responseItems = [];
  } else if (final.length === 0 && policy.fallback_item_id) {
    const fb = items.find(i => i.id === policy.fallback_item_id);
    if (fb) {
      responseItems = [scoreCandidate(fb, request, policy.ranking_formula)];
      decision = 'fallback';
    } else {
      decision = 'no_action';
    }
  } else if (final.length === 0) {
    decision = 'no_action';
  }

  const winner = responseItems[0];
  let reasonSummary = '';
  if (decision === 'action' && winner) {
    reasonSummary = `Selected "${winner.item.name}" (score ${winner.score}) — ${winner.reason_codes.join(', ')}`;
  } else if (decision === 'no_action') {
    reasonSummary = suppressed
      ? `Suppressed: ${guardrailFiltered.map(f => f.reason).join('; ')}`
      : 'No eligible items matched';
  } else if (decision === 'holdout') {
    reasonSummary = 'Customer is in holdout control group';
  } else if (decision === 'fallback') {
    reasonSummary = `Fallback: "${winner?.item.name}" — no primary candidates qualified`;
  }

  return {
    decision_id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    policy_id: policy.id,
    policy_name: policy.name,
    items: responseItems,
    decision,
    channel: request.channel,
    reason_summary: reasonSummary,
    trace,
    evaluated_at: new Date().toISOString(),
    ttl: policy.ttl_seconds,
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ─── Simulation Wrapper ─────────────────────────────────────────────

export function simulateDecisionForCustomer(
  tenantId: string,
  env: string,
  request: DecisionRequest,
  policyId?: string,
): DecisionResponse {
  const items = lsGet<DecisionItem[]>(SK.items(tenantId, env), []);
  const policies = fetchDecisionPolicies(tenantId, env);
  const guardrails = fetchGuardrails(tenantId, env);

  const policy = policyId
    ? policies.find(p => p.id === policyId)
    : policies.find(p => p.status === 'active');

  if (!policy) {
    return {
      decision_id: `dec_${Date.now()}`,
      policy_id: '',
      policy_name: 'No Active Policy',
      items: [],
      decision: 'no_action',
      channel: request.channel,
      reason_summary: 'No active decision policy configured',
      trace: [],
      evaluated_at: new Date().toISOString(),
      ttl: 0,
    };
  }

  const response = evaluateDecision(items, policy, guardrails, request);

  appendDecisionLog(tenantId, env, {
    id: response.decision_id,
    customer_id: request.customer_id,
    customer_name: request.context.customer_name || request.customer_id,
    policy_name: policy.name,
    decision: response.decision,
    winning_item: response.items[0]?.item.name || 'None',
    score: response.items[0]?.score || 0,
    channel: response.channel,
    reason: response.reason_summary,
    timestamp: response.evaluated_at,
  });

  return response;
}

// ─── Fatigue Score Calculator ───────────────────────────────────────

export function calculateFatigueScore(ctx: DecisionRequest['context']): {
  score: number;
  level: 'low' | 'moderate' | 'high' | 'critical';
  recommendation: string;
} {
  const msgToday = ctx.messages_today ?? 0;
  const msgWeek = ctx.messages_this_week ?? 0;
  const lastHours = ctx.last_contacted_hours_ago ?? 999;

  const score = Math.min(100, msgToday * 25 + msgWeek * 5 + (lastHours < 2 ? 20 : lastHours < 6 ? 10 : 0));

  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'moderate' : 'low';

  const recommendation = level === 'critical'
    ? 'Suppress all outbound. Wait for customer-initiated interaction.'
    : level === 'high'
    ? 'Prefer inbound channels only. High-value communications only.'
    : level === 'moderate'
    ? 'Proceed with caution. Prefer preferred channel.'
    : 'Normal engagement permitted.';

  return { score, level, recommendation };
}

// ─── RFM from Real Customers ────────────────────────────────────────

export type RfmSegment = {
  id: string;
  name: string;
  description: string;
  color: string;
  count: number;
  percent: number;
  r: number; f: number; m: number;
  action: string;
  offer_type: string;
};

export function computeRfmSegments(customers: Customer[]): RfmSegment[] {
  const total = customers.length || 1;
  const now = Date.now();

  let champions = 0, loyal = 0, potential = 0, atRisk = 0, hibernating = 0;

  for (const c of customers) {
    const days = Math.max(0, Math.floor((now - new Date(c.created_at || now).getTime()) / 86400000));
    if (days < 14) potential++;
    else if (days < 45) { if (c.email && c.mobile) champions++; else loyal++; }
    else if (days < 90) atRisk++;
    else hibernating++;
  }

  return [
    { id: 'champions', name: 'Champions', description: 'High-value frequent buyers', color: 'emerald', count: champions, percent: Math.round(champions/total*100), r: 5, f: 5, m: 5, action: 'VIP rewards, early access, loyalty program upgrades', offer_type: 'Exclusive VIP Experience' },
    { id: 'loyal', name: 'Loyal', description: 'Consistent repeating customers', color: 'blue', count: loyal, percent: Math.round(loyal/total*100), r: 4, f: 4, m: 4, action: 'Cross-sell, upsell bundles, referral program', offer_type: 'Category Cross-Sell' },
    { id: 'potential', name: 'Potential Loyalists', description: 'Recent buyers with high engagement', color: 'purple', count: potential, percent: Math.round(potential/total*100), r: 4, f: 2, m: 3, action: 'Welcome series, second-purchase incentive, points onboarding', offer_type: 'Welcome Bonus' },
    { id: 'at_risk', name: 'At Risk', description: 'Previously active, showing inactivity', color: 'amber', count: atRisk, percent: Math.round(atRisk/total*100), r: 1, f: 4, m: 4, action: 'Win-back campaign, personalized re-engagement, voice outreach', offer_type: 'Win-Back Discount' },
    { id: 'hibernating', name: 'Hibernating', description: 'Dormant profiles requiring reactivation', color: 'rose', count: hibernating, percent: Math.round(hibernating/total*100), r: 1, f: 1, m: 2, action: 'Zero-friction gift, catalog update, brand awareness', offer_type: 'Free Reactivation Gift' },
  ];
}

// ─── Default Policy Factory ─────────────────────────────────────────

export function createDefaultPolicy(): DecisionPolicy {
  return {
    id: `pol_${Date.now()}`,
    name: '',
    description: '',
    status: 'draft',
    objective: 'balanced_growth',
    placement_ids: ['web_checkout', 'email_primary', 'whatsapp_offer'],
    item_collection: { type: 'all', filter: [] },
    eligibility: [{
      id: `eg_${Date.now()}`,
      logic: 'and',
      conditions: [
        { id: `c_${Date.now()}_1`, field: 'cart_value', operator: 'gt', value: 500 },
      ],
    }],
    ranking_method: 'formula',
    ranking_formula: { ...DEFAULT_FORMULA },
    guardrail_ids: DEFAULT_GUARDRAILS.filter(g => g.enabled).map(g => g.id),
    fallback_item_id: null,
    allow_no_action: true,
    channel_arbitration: true,
    timing_optimization: false,
    experiment: {
      enabled: false,
      holdout_percent: 10,
      exploration_rate: 0.1,
      variant_splits: [],
    },
    max_items_returned: 1,
    ttl_seconds: 300,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
