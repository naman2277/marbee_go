// Decision Studio — RFM Segmentation Engine
// Proper quintile-based RFM scoring with documented thresholds,
// segment definitions, and conversion priors for cold-start.

import type { RfmConfig, RfmSegment, RfmCustomerScore } from './types';
import { computeQuantiles, assignQuantile } from './ml';

// ─── RFM Score Computation ─────────────────────────────────────────
// R (Recency): days since last purchase — LOWER is better (inverted quintile)
// F (Frequency): number of purchases — HIGHER is better
// M (Monetary): total spend — HIGHER is better

export type RfmInput = {
  customer_id: string;
  days_since_last_purchase: number;
  total_orders: number;
  lifetime_value: number;
};

export function computeRfmConfig(customers: RfmInput[], bins: number = 5): RfmConfig {
  const recency_values = customers.map(c => c.days_since_last_purchase);
  const frequency_values = customers.map(c => c.total_orders);
  const monetary_values = customers.map(c => c.lifetime_value);

  return {
    recency_bins: bins,
    frequency_bins: bins,
    monetary_bins: bins,
    recency_thresholds: computeQuantiles(recency_values, bins),
    frequency_thresholds: computeQuantiles(frequency_values, bins),
    monetary_thresholds: computeQuantiles(monetary_values, bins),
    computed_at: new Date().toISOString(),
    customer_count: customers.length,
  };
}

export function scoreCustomer(customer: RfmInput, config: RfmConfig): RfmCustomerScore {
  // Recency: INVERT because lower days = better. Quintile 5 = most recent.
  const r_raw = assignQuantile(customer.days_since_last_purchase, config.recency_thresholds);
  const r_score = config.recency_bins + 1 - r_raw; // invert

  const f_score = assignQuantile(customer.total_orders, config.frequency_thresholds);
  const m_score = assignQuantile(customer.lifetime_value, config.monetary_thresholds);
  const composite = r_score + f_score + m_score;

  return {
    customer_id: customer.customer_id,
    recency_days: customer.days_since_last_purchase,
    frequency: customer.total_orders,
    monetary: customer.lifetime_value,
    r_score,
    f_score,
    m_score,
    composite,
    segment: classifySegment(r_score, f_score, m_score),
  };
}

export function scoreAllCustomers(customers: RfmInput[]): {
  config: RfmConfig;
  scores: RfmCustomerScore[];
  segments: RfmSegment[];
} {
  if (customers.length === 0) {
    return { config: emptyConfig(), scores: [], segments: defaultSegments() };
  }

  const config = computeRfmConfig(customers);
  const scores = customers.map(c => scoreCustomer(c, config));
  const segments = buildSegments(scores, customers);

  return { config, scores, segments };
}

// ─── Segment Classification ────────────────────────────────────────
// Based on standard RFM segment definitions with clear, non-arbitrary rules.

function classifySegment(r: number, f: number, m: number): string {
  // Champions: R>=4, F>=4, M>=4
  if (r >= 4 && f >= 4 && m >= 4) return 'champions';
  // Loyal Customers: F>=3, M>=3 (regardless of recency)
  if (f >= 3 && m >= 3) return 'loyal';
  // Potential Loyalists: R>=3, F>=2, moderate monetary
  if (r >= 3 && f >= 2 && m >= 2) return 'potential_loyalists';
  // New Customers: R>=4, F<=2 (very recent but few purchases)
  if (r >= 4 && f <= 2) return 'new_customers';
  // Promising: R>=3, F<=2, M<=2
  if (r >= 3 && f <= 2) return 'promising';
  // Need Attention: R=2-3, F=2-3, M=2-3 (used to be good, slipping)
  if (r >= 2 && r <= 3 && f >= 2 && f <= 3) return 'need_attention';
  // About to Sleep: R=2, F<=2
  if (r === 2 && f <= 2) return 'about_to_sleep';
  // At Risk: R<=2, F>=3 (used to buy frequently, now gone)
  if (r <= 2 && f >= 3) return 'at_risk';
  // Cannot Lose: R<=2, F>=4, M>=4 (were champions, now absent)
  if (r <= 2 && f >= 4 && m >= 4) return 'cannot_lose';
  // Hibernating: R<=2, F<=2
  if (r <= 2 && f <= 2) return 'hibernating';
  // Default
  return 'other';
}

// ─── Segment Definitions ───────────────────────────────────────────

const SEGMENT_DEFS: Record<string, {
  name: string;
  description: string;
  color: string;
  r_range: [number, number];
  f_range: [number, number];
  m_range: [number, number];
  action: string;
  offer_type: string;
  conversion_prior: number;
  channel_priors: Record<string, number>;
}> = {
  champions: {
    name: 'Champions',
    description: 'Highest value: recent, frequent, big spenders',
    color: 'emerald',
    r_range: [4, 5], f_range: [4, 5], m_range: [4, 5],
    action: 'VIP rewards, early access, loyalty program upgrades, referral program',
    offer_type: 'Exclusive VIP Experience',
    conversion_prior: 0.35,
    channel_priors: { email: 0.45, push: 0.30, whatsapp: 0.40, sms: 0.25, web: 0.50 },
  },
  loyal: {
    name: 'Loyal Customers',
    description: 'Consistent repeating customers with good spend',
    color: 'blue',
    r_range: [2, 5], f_range: [3, 5], m_range: [3, 5],
    action: 'Cross-sell, upsell bundles, referral program, exclusive previews',
    offer_type: 'Category Cross-Sell Bundle',
    conversion_prior: 0.25,
    channel_priors: { email: 0.40, push: 0.25, whatsapp: 0.35, sms: 0.20, web: 0.40 },
  },
  potential_loyalists: {
    name: 'Potential Loyalists',
    description: 'Recent buyers with growing engagement',
    color: 'purple',
    r_range: [3, 5], f_range: [2, 4], m_range: [2, 4],
    action: 'Welcome series, second-purchase incentive, points onboarding',
    offer_type: 'Second Purchase Bonus',
    conversion_prior: 0.20,
    channel_priors: { email: 0.35, push: 0.20, whatsapp: 0.30, sms: 0.15, web: 0.35 },
  },
  new_customers: {
    name: 'New Customers',
    description: 'Very recent first-time or near-first-time buyers',
    color: 'cyan',
    r_range: [4, 5], f_range: [1, 2], m_range: [1, 5],
    action: 'Welcome journey, onboarding, product education, first loyalty points',
    offer_type: 'Welcome Discount',
    conversion_prior: 0.15,
    channel_priors: { email: 0.30, push: 0.15, whatsapp: 0.25, sms: 0.10, web: 0.30 },
  },
  promising: {
    name: 'Promising',
    description: 'Recent but low frequency — could become loyal',
    color: 'indigo',
    r_range: [3, 4], f_range: [1, 2], m_range: [1, 2],
    action: 'Category recommendations, time-limited offers, loyalty program invite',
    offer_type: 'Try More Categories',
    conversion_prior: 0.12,
    channel_priors: { email: 0.25, push: 0.12, whatsapp: 0.20, sms: 0.08, web: 0.25 },
  },
  need_attention: {
    name: 'Need Attention',
    description: 'Above average but slipping — engagement declining',
    color: 'yellow',
    r_range: [2, 3], f_range: [2, 3], m_range: [2, 3],
    action: 'Re-engagement campaign, limited time offers, feedback survey',
    offer_type: 'We Miss You Offer',
    conversion_prior: 0.10,
    channel_priors: { email: 0.20, push: 0.10, whatsapp: 0.18, sms: 0.08, web: 0.20 },
  },
  about_to_sleep: {
    name: 'About to Sleep',
    description: 'Below average recently, low activity',
    color: 'orange',
    r_range: [2, 2], f_range: [1, 2], m_range: [1, 3],
    action: 'Urgency-based re-engagement, survey, "last chance" messaging',
    offer_type: 'Flash Re-engagement Deal',
    conversion_prior: 0.08,
    channel_priors: { email: 0.15, push: 0.08, whatsapp: 0.12, sms: 0.06, web: 0.15 },
  },
  at_risk: {
    name: 'At Risk',
    description: 'Previously frequent buyers now gone quiet',
    color: 'amber',
    r_range: [1, 2], f_range: [3, 5], m_range: [1, 5],
    action: 'Win-back campaign, personalized re-engagement, voice outreach',
    offer_type: 'Win-Back Discount',
    conversion_prior: 0.07,
    channel_priors: { email: 0.12, push: 0.06, whatsapp: 0.10, sms: 0.05, web: 0.12 },
  },
  cannot_lose: {
    name: 'Cannot Lose Them',
    description: 'Were champions — highest historical value, now absent',
    color: 'red',
    r_range: [1, 2], f_range: [4, 5], m_range: [4, 5],
    action: 'Personal outreach, premium win-back, exclusive comeback offer',
    offer_type: 'VIP Comeback Package',
    conversion_prior: 0.06,
    channel_priors: { email: 0.10, push: 0.05, whatsapp: 0.08, sms: 0.04, web: 0.10 },
  },
  hibernating: {
    name: 'Hibernating',
    description: 'Dormant — long inactive, low purchase history',
    color: 'slate',
    r_range: [1, 2], f_range: [1, 2], m_range: [1, 2],
    action: 'Zero-friction gift, brand awareness, consider suppression',
    offer_type: 'Free Reactivation Gift',
    conversion_prior: 0.03,
    channel_priors: { email: 0.05, push: 0.02, whatsapp: 0.04, sms: 0.02, web: 0.05 },
  },
  other: {
    name: 'Other',
    description: 'Does not fit standard segment definitions',
    color: 'gray',
    r_range: [1, 5], f_range: [1, 5], m_range: [1, 5],
    action: 'General engagement, monitor for migration into defined segments',
    offer_type: 'General Promotion',
    conversion_prior: 0.10,
    channel_priors: { email: 0.20, push: 0.10, whatsapp: 0.15, sms: 0.08, web: 0.20 },
  },
};

function buildSegments(scores: RfmCustomerScore[], inputs: RfmInput[]): RfmSegment[] {
  const inputMap = new Map(inputs.map(i => [i.customer_id, i]));
  const segmentCounts = new Map<string, { count: number; ltv_sum: number; orders_sum: number; recency_sum: number }>();

  for (const s of scores) {
    const existing = segmentCounts.get(s.segment) ?? { count: 0, ltv_sum: 0, orders_sum: 0, recency_sum: 0 };
    const input = inputMap.get(s.customer_id);
    existing.count++;
    existing.ltv_sum += input?.lifetime_value ?? 0;
    existing.orders_sum += input?.total_orders ?? 0;
    existing.recency_sum += input?.days_since_last_purchase ?? 0;
    segmentCounts.set(s.segment, existing);
  }

  const total = scores.length || 1;

  return Object.entries(SEGMENT_DEFS).map(([id, def]) => {
    const stats = segmentCounts.get(id) ?? { count: 0, ltv_sum: 0, orders_sum: 0, recency_sum: 0 };
    const count = stats.count;
    return {
      id,
      name: def.name,
      description: def.description,
      color: def.color,
      r_range: def.r_range,
      f_range: def.f_range,
      m_range: def.m_range,
      count,
      percent: Math.round((count / total) * 100),
      avg_ltv: count > 0 ? Math.round(stats.ltv_sum / count) : 0,
      avg_orders: count > 0 ? Math.round((stats.orders_sum / count) * 10) / 10 : 0,
      avg_recency_days: count > 0 ? Math.round(stats.recency_sum / count) : 0,
      recommended_action: def.action,
      recommended_offer_type: def.offer_type,
      conversion_prior: def.conversion_prior,
      channel_priors: def.channel_priors,
    };
  }).filter(s => s.count > 0 || ['champions', 'loyal', 'potential_loyalists', 'at_risk', 'hibernating'].includes(s.id));
}

function emptyConfig(): RfmConfig {
  return { recency_bins: 5, frequency_bins: 5, monetary_bins: 5, recency_thresholds: [], frequency_thresholds: [], monetary_thresholds: [], computed_at: new Date().toISOString(), customer_count: 0 };
}

function defaultSegments(): RfmSegment[] {
  return Object.entries(SEGMENT_DEFS)
    .filter(([id]) => ['champions', 'loyal', 'potential_loyalists', 'at_risk', 'hibernating'].includes(id))
    .map(([id, def]) => ({
      id, name: def.name, description: def.description, color: def.color,
      r_range: def.r_range, f_range: def.f_range, m_range: def.m_range,
      count: 0, percent: 0, avg_ltv: 0, avg_orders: 0, avg_recency_days: 0,
      recommended_action: def.action, recommended_offer_type: def.offer_type,
      conversion_prior: def.conversion_prior, channel_priors: def.channel_priors,
    }));
}

export function getSegmentPriors(segment_id: string): { conversion: number; channels: Record<string, number> } {
  const def = SEGMENT_DEFS[segment_id] ?? SEGMENT_DEFS['other'];
  return { conversion: def.conversion_prior, channels: def.channel_priors };
}

export function getSegmentDefinitions() {
  return SEGMENT_DEFS;
}
