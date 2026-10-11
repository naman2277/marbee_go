// Decision Studio — Storage Layer
// localStorage persistence with Supabase fallback, matching existing patterns.

import { supabase } from '../supabase';
import { logAudit } from '../audit';
import type {
  DecisionItem,
  DecisionPolicy,
  Guardrail,
  DecisionLogEntry,
  CustomerFeatures,
  DecisionRequest,
  DecisionResponse,
} from './types';
import { DEFAULT_GUARDRAILS, DEFAULT_FORMULA } from './types';
import { evaluateDecision, buildLogEntry, getModel } from './pipeline';
import type { Customer } from '@marbee/shared';

// ─── Storage Keys ──────────────────────────────────────────────────

const SK = {
  items: (t: string, e: string) => `marbee_nbe_items_${t}_${e}`,
  policies: (t: string, e: string) => `marbee_nbe_policies_${t}_${e}`,
  guardrails: (t: string, e: string) => `marbee_nbe_guardrails_${t}_${e}`,
  log: (t: string, e: string) => `marbee_nbe_log_${t}_${e}`,
  modelWeights: (t: string, e: string) => `marbee_nbe_model_${t}_${e}`,
};

function lsGet<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ─── CRUD: Decision Items ──────────────────────────────────────────

export async function fetchDecisionItems(tenantId: string, env: string): Promise<DecisionItem[]> {
  const cached = lsGet<DecisionItem[]>(SK.items(tenantId, env), []);
  if (cached.length) return cached;

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
        business_value: o.offer_value || 0,
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
        config_version: 1,
        metadata: { source: 'loyalty_offers' },
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
        business_value: c.discount_value || 0,
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
        config_version: 1,
        metadata: { source: 'coupon_campaigns' },
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

// ─── CRUD: Policies ────────────────────────────────────────────────

export function fetchDecisionPolicies(tenantId: string, env: string): DecisionPolicy[] {
  return lsGet<DecisionPolicy[]>(SK.policies(tenantId, env), []);
}

export function saveDecisionPolicies(tenantId: string, env: string, policies: DecisionPolicy[]): DecisionPolicy[] {
  lsSet(SK.policies(tenantId, env), policies);
  void logAudit({ tenantId, environment: env, action: 'update', resourceType: 'nbe_policies', resourceId: tenantId, resourceName: `Updated ${policies.length} NBE Policies` });
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

// ─── CRUD: Guardrails ──────────────────────────────────────────────

export function fetchGuardrails(tenantId: string, env: string): Guardrail[] {
  return lsGet<Guardrail[]>(SK.guardrails(tenantId, env), DEFAULT_GUARDRAILS);
}

export function saveGuardrails(tenantId: string, env: string, guardrails: Guardrail[]): Guardrail[] {
  lsSet(SK.guardrails(tenantId, env), guardrails);
  return guardrails;
}

// ─── Decision Log ──────────────────────────────────────────────────

export function fetchDecisionLog(tenantId: string, env: string): DecisionLogEntry[] {
  return lsGet<DecisionLogEntry[]>(SK.log(tenantId, env), []);
}

export function appendDecisionLog(tenantId: string, env: string, entry: DecisionLogEntry) {
  const log = fetchDecisionLog(tenantId, env);
  log.unshift(entry);
  if (log.length > 1000) log.length = 1000;
  lsSet(SK.log(tenantId, env), log);
}

export function updateDecisionOutcome(
  tenantId: string,
  env: string,
  decisionId: string,
  outcome: DecisionLogEntry['outcome'],
  value?: number,
) {
  const log = fetchDecisionLog(tenantId, env);
  const entry = log.find(e => e.id === decisionId);
  if (entry) {
    entry.outcome = outcome;
    entry.outcome_at = new Date().toISOString();
    entry.outcome_value = value ?? null;
    lsSet(SK.log(tenantId, env), log);
  }
}

// ─── Simulation ────────────────────────────────────────────────────

export function simulateDecision(
  tenantId: string,
  env: string,
  customer: CustomerFeatures,
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
      model_version: getModel().version.id,
      items: [],
      decision: 'no_action',
      channel: request.channel,
      reason_summary: 'No active decision policy configured',
      trace: [],
      customer_snapshot: customer,
      evaluated_at: new Date().toISOString(),
      ttl: 0,
      is_exploration: false,
      replay_hash: '',
    };
  }

  const response = evaluateDecision(items, policy, guardrails, customer, request);

  const logEntry = buildLogEntry(response, request, customer.customer_id);
  appendDecisionLog(tenantId, env, logEntry);

  return response;
}

// ─── Customer → CustomerFeatures Mapper ────────────────────────────
// Converts a raw Customer from the DB into a CustomerFeatures snapshot.

export function customerToFeatures(
  c: Customer,
  overrides?: Partial<CustomerFeatures>,
): CustomerFeatures {
  const now = Date.now();
  const createdAt = new Date(c.created_at || now).getTime();
  const daysSinceSignup = Math.max(0, Math.floor((now - createdAt) / 86400000));

  return {
    customer_id: c.id,
    loyalty_tier: (c as Record<string, unknown>).loyalty_tier as string ?? 'Bronze',
    lifetime_value: (c as Record<string, unknown>).lifetime_value as number ?? Math.floor(Math.random() * 50000),
    total_orders: (c as Record<string, unknown>).total_orders as number ?? Math.floor(Math.random() * 30),
    avg_order_value: (c as Record<string, unknown>).avg_order_value as number ?? Math.floor(Math.random() * 3000),
    days_since_last_purchase: (c as Record<string, unknown>).days_since_last_purchase as number ?? Math.floor(Math.random() * 90),
    days_since_signup: daysSinceSignup,
    age: null,
    gender: null,
    country: (c as Record<string, unknown>).country as string ?? 'IN',
    city: (c as Record<string, unknown>).city as string ?? 'Mumbai',
    rfm_r: 3,
    rfm_f: 3,
    rfm_m: 3,
    rfm_segment: 'potential_loyalists',
    rfm_score: 9,
    email_opens_7d: Math.floor(Math.random() * 5),
    email_sends_7d: Math.floor(Math.random() * 8) + 1,
    clicks_7d: Math.floor(Math.random() * 10),
    sessions_30d: Math.floor(Math.random() * 20),
    channel_history: {
      email: { sends: 10 + Math.floor(Math.random() * 50), opens: 3 + Math.floor(Math.random() * 20), clicks: Math.floor(Math.random() * 10), converts: Math.floor(Math.random() * 5) },
      whatsapp: { sends: Math.floor(Math.random() * 10), opens: Math.floor(Math.random() * 8), clicks: Math.floor(Math.random() * 3), converts: Math.floor(Math.random() * 2) },
      push: { sends: Math.floor(Math.random() * 20), opens: Math.floor(Math.random() * 8), clicks: Math.floor(Math.random() * 4), converts: Math.floor(Math.random() * 2) },
      sms: { sends: Math.floor(Math.random() * 5), opens: Math.floor(Math.random() * 4), clicks: 0, converts: Math.floor(Math.random() * 1) },
    },
    category_affinities: {
      discount_percent: 0.3 + Math.random() * 0.5,
      free_shipping: 0.2 + Math.random() * 0.4,
      cashback: 0.1 + Math.random() * 0.3,
    },
    consent: {
      email: Math.random() > 0.1,
      whatsapp: Math.random() > 0.3,
      sms: Math.random() > 0.4,
      push: Math.random() > 0.2,
    },
    messages_today: 0,
    messages_this_week: Math.floor(Math.random() * 3),
    last_contacted_hours_ago: 48 + Math.floor(Math.random() * 120),
    churn_risk: Math.random() * 0.5,
    lifecycle_stage: daysSinceSignup < 30 ? 'new' : daysSinceSignup < 90 ? 'active' : daysSinceSignup < 180 ? 'loyal' : 'at_risk',
    recent_events: [],
    snapshot_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Default Policy Factory ────────────────────────────────────────

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
