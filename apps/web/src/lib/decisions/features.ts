// Decision Studio — Feature Store
// Shared feature transformation layer. The SAME code produces features
// for both training and serving, eliminating training-serving skew.

import type {
  CustomerFeatures,
  DecisionItem,
  DecisionRequest,
  ModelVersion,
} from './types';
import {
  bayesianShrinkage,
  logisticPredict,
  trainLogistic,
  calibrateScore,
  buildCalibrationMap,
  thompsonSampleForItem,
  type LogisticWeights,
  type CalibrationBin,
} from './ml';
import { getSegmentPriors } from './rfm';

// ─── Feature Extraction (shared train/serve) ──────────────────────
// Every feature used at prediction time must be produced by this function.
// If you add a feature for training, it MUST be added here too.

export type FeatureVector = Record<string, number>;

export function extractFeatures(
  customer: CustomerFeatures,
  item: DecisionItem,
  channel: string,
  context: DecisionRequest['context'],
): FeatureVector {
  const priors = getSegmentPriors(customer.rfm_segment);

  // Channel history for this channel
  const ch = customer.channel_history[channel] ?? { sends: 0, opens: 0, clicks: 0, converts: 0 };
  const channelRate = bayesianShrinkage(
    ch.converts,
    ch.sends,
    priors.channels[channel] ?? 0.1,
    20,
  );

  // Category affinity
  const catAffinity = customer.category_affinities[item.category] ?? 0;

  return {
    // RFM features
    rfm_r: customer.rfm_r,
    rfm_f: customer.rfm_f,
    rfm_m: customer.rfm_m,
    rfm_score: customer.rfm_score,

    // Customer profile
    loyalty_tier_numeric: tierToNumeric(customer.loyalty_tier),
    lifetime_value_log: Math.log1p(customer.lifetime_value),
    total_orders_log: Math.log1p(customer.total_orders),
    avg_order_value_log: Math.log1p(customer.avg_order_value),
    days_since_last_purchase: customer.days_since_last_purchase,
    days_since_signup: customer.days_since_signup,

    // Behavioral
    email_opens_7d: customer.email_opens_7d,
    email_open_rate_7d: customer.email_sends_7d > 0
      ? customer.email_opens_7d / customer.email_sends_7d
      : priors.channels['email'] ?? 0.2,
    clicks_7d: customer.clicks_7d,
    sessions_30d: customer.sessions_30d,

    // Channel affinity (Bayesian-shrunk)
    channel_response_rate: channelRate.rate,
    channel_sample_size: channelRate.sample_size,
    channel_shrinkage: channelRate.shrinkage_weight,

    // Item features
    item_value_normalized: item.business_value,
    item_cost: item.cost,
    item_margin: item.margin,
    item_priority: item.priority / 100,
    item_category_affinity: catAffinity,

    // Item-channel match
    channel_match: (item.channels.includes(channel) || item.channels.includes('all')) ? 1 : 0,

    // Context features
    cart_value_log: Math.log1p(context.cart_value ?? 0),
    time_of_day: context.time_of_day ?? new Date().getHours(),
    day_of_week: context.day_of_week ?? new Date().getDay(),
    is_weekend: [0, 6].includes(context.day_of_week ?? new Date().getDay()) ? 1 : 0,

    // Fatigue
    messages_today: customer.messages_today,
    messages_this_week: customer.messages_this_week,
    hours_since_contact: customer.last_contacted_hours_ago,

    // Risk
    churn_risk: customer.churn_risk,

    // Urgency (deterministic)
    item_urgency: computeItemUrgency(item),

    // Segment prior (cold-start baseline)
    segment_conversion_prior: priors.conversion,
  };
}

function tierToNumeric(tier: string): number {
  const map: Record<string, number> = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4, Diamond: 5 };
  return map[tier] ?? 0;
}

function computeItemUrgency(item: DecisionItem): number {
  if (!item.ends_at) return 0.3;
  const hoursLeft = (new Date(item.ends_at).getTime() - Date.now()) / 3600000;
  if (hoursLeft < 0) return 0;
  if (hoursLeft < 24) return 1.0;
  if (hoursLeft < 72) return 0.7;
  if (hoursLeft < 168) return 0.4;
  return 0.2;
}

// ─── Conversion Probability Model ──────────────────────────────────
// Three-phase model with explicit cold-start fallback ladder.

export type ConversionModel = {
  version: ModelVersion;
  weights: LogisticWeights;
  calibration: CalibrationBin[];
};

// Bootstrap model: hand-tuned logistic weights based on domain knowledge.
// Used when no training data is available (day 1).
export function createBootstrapModel(): ConversionModel {
  return {
    version: {
      id: 'bootstrap_v1',
      phase: 'bootstrap',
      version: '0.1.0',
      trained_at: new Date().toISOString(),
      training_samples: 0,
      auc_roc: 0.5,
      log_loss: 0.693, // random baseline
      calibration_error: 0,
      lift_over_random: 1.0,
      segment_metrics: {},
      feature_importance: [
        { feature: 'segment_conversion_prior', importance: 0.25 },
        { feature: 'channel_response_rate', importance: 0.20 },
        { feature: 'item_category_affinity', importance: 0.15 },
        { feature: 'rfm_score', importance: 0.12 },
        { feature: 'cart_value_log', importance: 0.10 },
        { feature: 'days_since_last_purchase', importance: 0.08 },
        { feature: 'churn_risk', importance: 0.05 },
        { feature: 'item_urgency', importance: 0.05 },
      ],
      status: 'champion',
      psi_threshold: 0.25,
      current_psi: 0,
    },
    weights: {
      _intercept: -2.0,
      segment_conversion_prior: 4.0,
      channel_response_rate: 2.5,
      item_category_affinity: 2.0,
      rfm_score: 0.15,
      cart_value_log: 0.3,
      days_since_last_purchase: -0.01,
      churn_risk: -1.5,
      item_urgency: 1.0,
      loyalty_tier_numeric: 0.3,
      email_open_rate_7d: 1.5,
      sessions_30d: 0.05,
      channel_match: 0.8,
      item_priority: 0.5,
      messages_today: -0.3,
      is_weekend: 0.1,
    },
    calibration: [],
  };
}

// Train a model from historical decision+outcome data.
export function trainConversionModel(
  data: { features: FeatureVector; converted: boolean }[],
  previous_version: string,
): ConversionModel {
  const training_data = data.map(d => ({ features: d.features, label: d.converted }));
  const result = trainLogistic(training_data, 0.01, 200, 0.001);

  // Build calibration on the same data (in production, use a held-out set)
  const predictions = data.map(d => logisticPredict(d.features, result.weights));
  const actuals = data.map(d => d.converted);
  const calibration = buildCalibrationMap(predictions, actuals, 10);

  const versionNum = parseInt(previous_version.split('.')[1] ?? '0') + 1;

  return {
    version: {
      id: `trained_v${versionNum}`,
      phase: data.length > 5000 ? 'growth' : 'bootstrap',
      version: `1.${versionNum}.0`,
      trained_at: new Date().toISOString(),
      training_samples: data.length,
      auc_roc: result.auc,
      log_loss: result.log_loss,
      calibration_error: 0,
      lift_over_random: 1.0,
      segment_metrics: {},
      feature_importance: Object.entries(result.weights)
        .filter(([k]) => k !== '_intercept')
        .map(([feature, w]) => ({ feature, importance: Math.abs(w) }))
        .sort((a, b) => b.importance - a.importance),
      status: 'shadow',
      psi_threshold: 0.25,
      current_psi: 0,
    },
    weights: result.weights,
    calibration,
  };
}

// ─── Prediction with Cold-Start Fallback Ladder ────────────────────
// 1. New customer, no history → segment-level priors
// 2. New item, no history → content-based similarity
// 3. Sparse customer×item → Bayesian shrinkage toward prior
// 4. Every fallback is FLAGGED in the response

export type PredictionResult = {
  probability: number;
  calibrated: boolean;
  model_version: string;
  confidence: 'high' | 'medium' | 'low';
  fallback_reason: string | null;
};

export function predictConversion(
  features: FeatureVector,
  model: ConversionModel,
  item_exposure_count: number,
  min_item_exposures: number = 200,
): PredictionResult {
  const raw = logisticPredict(features, model.weights);

  // Apply calibration if available
  const calibrated_prob = model.calibration.length > 0
    ? calibrateScore(raw, model.calibration)
    : raw;

  // Cold-start fallback ladder
  let fallback_reason: string | null = null;
  let confidence: PredictionResult['confidence'] = 'high';
  let final_prob = calibrated_prob;

  // Check if this is a new customer (no channel history)
  if (features.channel_sample_size === 0 && features.total_orders_log < 0.7) {
    // Fall back to segment prior, blended with model output
    final_prob = 0.7 * features.segment_conversion_prior + 0.3 * calibrated_prob;
    fallback_reason = 'cold_start_customer';
    confidence = 'low';
  }
  // Check if this is a new/under-observed item
  else if (item_exposure_count < min_item_exposures) {
    // Shrink toward segment prior weighted by exposure count
    const shrinkage_weight = min_item_exposures / (item_exposure_count + min_item_exposures);
    final_prob = (1 - shrinkage_weight) * calibrated_prob + shrinkage_weight * features.segment_conversion_prior;
    fallback_reason = `cold_start_item (${item_exposure_count}/${min_item_exposures} exposures)`;
    confidence = item_exposure_count < 50 ? 'low' : 'medium';
  }
  // Sparse interaction — rely on Bayesian-shrunk channel rate
  else if (features.channel_shrinkage > 0.5) {
    confidence = 'medium';
    fallback_reason = `sparse_channel_data (shrinkage=${Math.round(features.channel_shrinkage * 100)}%)`;
  }

  return {
    probability: Math.max(0.001, Math.min(0.999, final_prob)),
    calibrated: model.calibration.length > 0,
    model_version: model.version.id,
    confidence,
    fallback_reason,
  };
}

// ─── Thompson Sampling Integration ─────────────────────────────────
// Used in explore/exploit mode. Samples from the posterior distribution
// of each item's conversion rate rather than using the point estimate.

export function thompsonScoredProbability(
  base_probability: number,
  item_successes: number,
  item_failures: number,
  exploration_rate: number,
): { probability: number; is_exploration: boolean } {
  // With (1 - exploration_rate) probability, use point estimate.
  // With exploration_rate probability, sample from posterior.
  if (Math.random() > exploration_rate) {
    return { probability: base_probability, is_exploration: false };
  }

  // Sample from Beta posterior
  const sampled = thompsonSampleForItem(item_successes, item_failures, 1, 1);

  return { probability: sampled, is_exploration: true };
}

// ─── Customer Affinity Computation ─────────────────────────────────
// Combines collaborative filtering (category_affinities from feature store)
// with content-based similarity for cold-start items.

export function computeCustomerAffinity(
  customer: CustomerFeatures,
  item: DecisionItem,
): { score: number; source: 'model' | 'collaborative' | 'content_based' | 'segment_prior' } {
  // 1. Direct category affinity from collaborative filtering
  const cat_affinity = customer.category_affinities[item.category];
  if (cat_affinity !== undefined && cat_affinity > 0) {
    return { score: Math.min(1, cat_affinity), source: 'collaborative' };
  }

  // 2. Content-based: match by tags overlap with customer's top categories
  const customer_categories = Object.entries(customer.category_affinities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  if (customer_categories.length > 0 && item.tags.length > 0) {
    const overlap = item.tags.filter(t =>
      customer_categories.some(c => c.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(c.toLowerCase()))
    ).length;
    if (overlap > 0) {
      return { score: Math.min(1, overlap / Math.max(item.tags.length, 1) * 0.8), source: 'content_based' };
    }
  }

  // 3. Segment-level prior
  const priors = getSegmentPriors(customer.rfm_segment);
  return { score: priors.conversion * 2, source: 'segment_prior' };
}

// ─── Channel Affinity (Bayesian-Shrunk) ────────────────────────────

export function computeChannelAffinity(
  customer: CustomerFeatures,
  channel: string,
): { score: number; sample_size: number; shrinkage_applied: boolean } {
  const priors = getSegmentPriors(customer.rfm_segment);
  const prior_rate = priors.channels[channel] ?? 0.1;

  const history = customer.channel_history[channel];
  if (!history || history.sends === 0) {
    return { score: prior_rate, sample_size: 0, shrinkage_applied: true };
  }

  const result = bayesianShrinkage(history.opens, history.sends, prior_rate, 20);

  return {
    score: result.rate,
    sample_size: result.sample_size,
    shrinkage_applied: result.shrinkage_weight > 0.1,
  };
}

// ─── Context Relevance (Rule-Based, Explainable) ───────────────────

export function computeContextRelevance(
  item: DecisionItem,
  placement: string,
  channel: string,
  context: DecisionRequest['context'],
): { score: number; factors: string[] } {
  let score = 0.4; // baseline
  const factors: string[] = [];

  // Placement match
  if (item.placements.includes(placement) || item.placements.includes('all')) {
    score += 0.15;
    factors.push('PLACEMENT_MATCH');
  }

  // Channel match
  if (item.channels.includes(channel) || item.channels.includes('all')) {
    score += 0.1;
    factors.push('CHANNEL_MATCH');
  }

  // Cart value relevance (discounts more relevant for higher carts)
  if (context.cart_value && context.cart_value > 1000) {
    if (item.category.includes('discount') || item.type === 'coupon') {
      score += 0.15;
      factors.push('HIGH_CART_DISCOUNT');
    }
  }

  // Time relevance
  const hour = context.time_of_day ?? new Date().getHours();
  if (hour >= 10 && hour <= 14) {
    score += 0.05;
    factors.push('PEAK_HOURS');
  }

  // Referrer relevance (if from search, recommendations are more relevant)
  if (context.referrer && context.referrer.includes('search')) {
    if (item.type === 'recommendation') {
      score += 0.1;
      factors.push('SEARCH_REFERRAL');
    }
  }

  return { score: Math.min(1, score), factors };
}

// ─── Fatigue Score ─────────────────────────────────────────────────

export function computeFatigueScore(customer: CustomerFeatures): {
  score: number;
  level: 'low' | 'moderate' | 'high' | 'critical';
  penalty: number;
  recommendation: string;
} {
  const msgToday = customer.messages_today;
  const msgWeek = customer.messages_this_week;
  const lastHours = customer.last_contacted_hours_ago;

  // Composite fatigue: weighted sum of signals
  const score = Math.min(100,
    msgToday * 25 +
    msgWeek * 5 +
    (lastHours < 2 ? 20 : lastHours < 6 ? 10 : 0)
  );

  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'moderate' : 'low';

  // Exponential penalty for near-cap cases (soft secondary, guardrails handle the hard cap)
  const penalty = Math.min(1, 1 - Math.exp(-score / 50));

  const recommendation = level === 'critical'
    ? 'Suppress all outbound. Wait for customer-initiated interaction.'
    : level === 'high'
    ? 'Prefer inbound channels only. High-value communications only.'
    : level === 'moderate'
    ? 'Proceed with caution. Prefer preferred channel.'
    : 'Normal engagement permitted.';

  return { score, level, penalty, recommendation };
}
