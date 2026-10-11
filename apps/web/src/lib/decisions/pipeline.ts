// Decision Studio — 7-Stage Decision Pipeline
// Each stage is independent, deterministic where required, and fully traceable.
// The pipeline never lets ML scores override a hard guardrail.

import type {
  DecisionItem,
  DecisionPolicy,
  Guardrail,
  CustomerFeatures,
  DecisionRequest,
  DecisionResponse,
  DecisionOutcome,
  ScoredCandidate,
  ScoreBreakdown,
  StageTrace,
  PipelineStage,
  ConditionGroup,
  EligibilityCondition,
  RankingFormula,
  DecisionLogEntry,
} from './types';
import {
  normalizeMinMax,
  normalizeAcrossCatalog,
  sigmoidSquash,
  computeAttributions,
  deterministicHash,
  assignToExperimentGroup,
  computeReplayHash,
  type FeatureAttribution,
} from './ml';
import {
  extractFeatures,
  predictConversion,
  computeCustomerAffinity,
  computeChannelAffinity,
  computeContextRelevance,
  computeFatigueScore,
  createBootstrapModel,
  thompsonScoredProbability,
  type ConversionModel,
} from './features';

// ─── Pipeline Configuration ────────────────────────────────────────

let _model: ConversionModel | null = null;

export function getModel(): ConversionModel {
  if (!_model) _model = createBootstrapModel();
  return _model;
}

export function setModel(model: ConversionModel) {
  _model = model;
}

// ─── Stage 1: Customer Context Resolver ────────────────────────────
// Pulls the pre-computed feature snapshot. In production this reads from
// a feature store (Redis/DynamoDB), not live DB joins. <20ms.

function resolveCustomerContext(
  customer: CustomerFeatures,
  context: DecisionRequest['context'],
): { features: CustomerFeatures; duration_ms: number } {
  const t0 = performance.now();

  // Merge real-time context into the feature snapshot
  const merged: CustomerFeatures = {
    ...customer,
    messages_today: (context.messages_today as number) ?? customer.messages_today,
    messages_this_week: (context.messages_this_week as number) ?? customer.messages_this_week,
  };

  return { features: merged, duration_ms: performance.now() - t0 };
}

// ─── Stage 2: Candidate Generation ─────────────────────────────────
// Narrows N items to ~20-50 candidates via inverted index (segment→tags). <10ms.

function generateCandidates(
  items: DecisionItem[],
  policy: DecisionPolicy,
  customer: CustomerFeatures,
): { candidates: DecisionItem[]; filtered: StageTrace['filtered']; duration_ms: number } {
  const t0 = performance.now();
  const filtered: StageTrace['filtered'] = [];

  const candidates = items.filter(item => {
    // Status check
    if (item.status !== 'active') {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'INACTIVE', reason: `Status: ${item.status}` });
      return false;
    }
    // Date range
    if (item.ends_at && new Date(item.ends_at) < new Date()) {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'EXPIRED', reason: `Expired: ${item.ends_at}` });
      return false;
    }
    if (item.starts_at && new Date(item.starts_at) > new Date()) {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'NOT_STARTED', reason: `Starts: ${item.starts_at}` });
      return false;
    }
    // Budget exhaustion (real-time counter — needs live check)
    if (item.budget_total != null && item.budget_spent >= item.budget_total) {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'BUDGET_EXHAUSTED', reason: `Budget: ${item.budget_spent}/${item.budget_total}` });
      return false;
    }
    // Redemption cap
    if (item.max_redemptions != null && item.redemption_count >= item.max_redemptions) {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'REDEMPTION_CAP', reason: `Redeemed: ${item.redemption_count}/${item.max_redemptions}` });
      return false;
    }
    // Collection filter
    if (policy.item_collection.type === 'category' && !policy.item_collection.filter.includes(item.category)) {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'CATEGORY_MISMATCH', reason: `Category ${item.category} not in policy filter` });
      return false;
    }
    if (policy.item_collection.type === 'tag' && !item.tags.some(t => policy.item_collection.filter.includes(t))) {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'TAG_MISMATCH', reason: 'No matching tags' });
      return false;
    }
    if (policy.item_collection.type === 'manual' && !policy.item_collection.filter.includes(item.id)) {
      filtered.push({ item_id: item.id, item_name: item.name, reason_code: 'NOT_IN_MANUAL_LIST', reason: 'Not in manual selection' });
      return false;
    }
    return true;
  });

  return { candidates, filtered, duration_ms: performance.now() - t0 };
}

// ─── Stage 3: Eligibility Filter (DETERMINISTIC, NO ML) ────────────
// Hard business rules. Every rejection MUST log a reason code.
// This is the layer auditors inspect — 100% branch coverage required.

function filterEligibility(
  candidates: DecisionItem[],
  policy: DecisionPolicy,
  customer: CustomerFeatures,
  context: DecisionRequest['context'],
): { eligible: DecisionItem[]; filtered: StageTrace['filtered']; duration_ms: number } {
  const t0 = performance.now();
  const filtered: StageTrace['filtered'] = [];

  if (policy.eligibility.length === 0) {
    return { eligible: candidates, filtered, duration_ms: performance.now() - t0 };
  }

  const eligible = candidates.filter(item => {
    // Build the context map with both customer features and real-time context
    const ctx: Record<string, unknown> = {
      loyalty_tier: customer.loyalty_tier,
      lifetime_value: customer.lifetime_value,
      total_orders: customer.total_orders,
      avg_order_value: customer.avg_order_value,
      days_since_last_purchase: customer.days_since_last_purchase,
      days_since_signup: customer.days_since_signup,
      age: customer.age,
      gender: customer.gender,
      country: customer.country,
      city: customer.city,
      rfm_segment: customer.rfm_segment,
      rfm_score: customer.rfm_score,
      churn_risk: customer.churn_risk,
      lifecycle_stage: customer.lifecycle_stage,
      email_opens_7d: customer.email_opens_7d,
      clicks_7d: customer.clicks_7d,
      sessions_30d: customer.sessions_30d,
      consent_email: customer.consent['email'] ?? false,
      consent_whatsapp: customer.consent['whatsapp'] ?? false,
      consent_sms: customer.consent['sms'] ?? false,
      consent_push: customer.consent['push'] ?? false,
      messages_today: customer.messages_today,
      messages_this_week: customer.messages_this_week,
      last_contacted_hours_ago: customer.last_contacted_hours_ago,
      ...context,
    };

    for (const group of policy.eligibility) {
      const results = group.conditions.map(c => evaluateCondition(c, ctx));
      const pass = group.logic === 'and' ? results.every(r => r.pass) : results.some(r => r.pass);

      if (!pass) {
        const failed = group.conditions.find((_, i) => !results[i].pass);
        const failedResult = failed ? results[group.conditions.indexOf(failed)] : null;
        filtered.push({
          item_id: item.id,
          item_name: item.name,
          reason_code: 'ELIGIBILITY_FAILED',
          reason: failedResult
            ? `${failed!.field} ${failed!.operator} ${JSON.stringify(failed!.value)} — actual: ${JSON.stringify(failedResult.actual_value)}`
            : 'Eligibility group failed',
        });
        return false;
      }
    }
    return true;
  });

  return { eligible, filtered, duration_ms: performance.now() - t0 };
}

function evaluateCondition(
  cond: EligibilityCondition,
  ctx: Record<string, unknown>,
): { pass: boolean; actual_value: unknown } {
  const val = ctx[cond.field];
  const target = cond.value;

  let pass: boolean;
  switch (cond.operator) {
    case 'eq': pass = val === target; break;
    case 'neq': pass = val !== target; break;
    case 'gt': pass = Number(val) > Number(target); break;
    case 'gte': pass = Number(val) >= Number(target); break;
    case 'lt': pass = Number(val) < Number(target); break;
    case 'lte': pass = Number(val) <= Number(target); break;
    case 'in': pass = Array.isArray(target) ? target.includes(val) : String(target).split(',').map(s => s.trim()).includes(String(val)); break;
    case 'not_in': pass = Array.isArray(target) ? !target.includes(val) : !String(target).split(',').map(s => s.trim()).includes(String(val)); break;
    case 'contains': pass = String(val ?? '').toLowerCase().includes(String(target).toLowerCase()); break;
    case 'not_contains': pass = !String(val ?? '').toLowerCase().includes(String(target).toLowerCase()); break;
    case 'exists': pass = val != null && val !== ''; break;
    case 'not_exists': pass = val == null || val === ''; break;
    case 'between': {
      const [lo, hi] = Array.isArray(target) ? target : [0, 0];
      pass = Number(val) >= Number(lo) && Number(val) <= Number(hi);
      break;
    }
    default: pass = true;
  }

  return { pass, actual_value: val };
}

// ─── Stage 4: Guardrails (DETERMINISTIC, POLICY-DRIVEN, NO ML) ─────
// Hard vetoes. ML ranking CANNOT override a guardrail rejection.
// Each guardrail returns pass/fail + reason code for the audit trail.

function applyGuardrails(
  candidates: DecisionItem[],
  guardrails: Guardrail[],
  policy: DecisionPolicy,
  customer: CustomerFeatures,
  channel: string,
  context?: DecisionRequest['context'],
): { surviving: DecisionItem[]; suppressed: boolean; filtered: StageTrace['filtered']; duration_ms: number } {
  const t0 = performance.now();
  const filtered: StageTrace['filtered'] = [];

  const activeGuardrails = guardrails.filter(g => g.enabled && policy.guardrail_ids.includes(g.id));

  // Global guardrails suppress ALL candidates
  let globalSuppression = false;
  for (const g of activeGuardrails) {
    const result = checkGuardrail(g, customer, channel, context);
    if (!result.pass) {
      globalSuppression = true;
      filtered.push({
        item_id: '[ALL]',
        item_name: '[Global Suppression]',
        reason_code: result.reason_code,
        reason: result.reason,
      });
    }
  }

  // Per-item guardrails (e.g., budget/inventory checks)
  let surviving = candidates;
  if (!globalSuppression) {
    surviving = candidates.filter(item => {
      // Inventory/budget guardrail per item
      if (item.budget_total != null && item.budget_spent >= item.budget_total * 0.95) {
        filtered.push({
          item_id: item.id,
          item_name: item.name,
          reason_code: 'NEAR_BUDGET_CAP',
          reason: `Budget ${Math.round(item.budget_spent / item.budget_total! * 100)}% spent`,
        });
        return false;
      }
      return true;
    });
  }

  return {
    surviving: globalSuppression ? [] : surviving,
    suppressed: globalSuppression,
    filtered,
    duration_ms: performance.now() - t0,
  };
}

function checkGuardrail(
  g: Guardrail,
  customer: CustomerFeatures,
  channel: string,
  context?: DecisionRequest['context'],
): { pass: boolean; reason_code: string; reason: string } {
  const cfg = g.config;

  switch (g.type) {
    case 'frequency_cap': {
      const max = (cfg.max_messages as number) ?? 3;
      return customer.messages_today >= max
        ? { pass: false, reason_code: 'FREQ_CAP_EXCEEDED', reason: `${customer.messages_today}/${max} messages today` }
        : { pass: true, reason_code: '', reason: '' };
    }
    case 'channel_limit': {
      if (cfg.channel !== channel) return { pass: true, reason_code: '', reason: '' };
      const max = (cfg.max_messages as number) ?? 1;
      return customer.messages_today >= max
        ? { pass: false, reason_code: 'CHANNEL_LIMIT', reason: `${channel}: ${customer.messages_today}/${max}` }
        : { pass: true, reason_code: '', reason: '' };
    }
    case 'fatigue_threshold': {
      const fatigue = computeFatigueScore(customer);
      const max = (cfg.max_pressure_score as number) ?? 80;
      return fatigue.score >= max
        ? { pass: false, reason_code: 'FATIGUE_EXCEEDED', reason: `Fatigue ${fatigue.score}/${max} (${fatigue.level})` }
        : { pass: true, reason_code: '', reason: '' };
    }
    case 'cooldown': {
      const hours = (cfg.hours as number) ?? 48;
      return customer.last_contacted_hours_ago < hours
        ? { pass: false, reason_code: 'COOLDOWN_ACTIVE', reason: `Last contact ${Math.round(customer.last_contacted_hours_ago)}h ago < ${hours}h cooldown` }
        : { pass: true, reason_code: '', reason: '' };
    }
    case 'consent_required': {
      const channels = (cfg.channels as string[]) ?? [];
      if (!channels.includes(channel)) return { pass: true, reason_code: '', reason: '' };
      return customer.consent[channel] === false
        ? { pass: false, reason_code: 'NO_CONSENT', reason: `No ${channel} consent` }
        : { pass: true, reason_code: '', reason: '' };
    }
    case 'quiet_hours': {
      const hour = context?.time_of_day ?? new Date().getHours();
      const start = parseInt(String(cfg.start ?? '22').split(':')[0]);
      const end = parseInt(String(cfg.end ?? '8').split(':')[0]);
      const inQuiet = start > end ? (hour >= start || hour < end) : (hour >= start && hour < end);
      return inQuiet
        ? { pass: false, reason_code: 'QUIET_HOURS', reason: `Quiet hours ${cfg.start}-${cfg.end}` }
        : { pass: true, reason_code: '', reason: '' };
    }
    default:
      return { pass: true, reason_code: '', reason: '' };
  }
}

// ─── Stage 5: Ranking (ML Layer) ───────────────────────────────────
// Scores each surviving candidate using the multiplicative utility model.
// All terms normalized to [0,1]. Penalties subtracted after normalization.
// Every term's raw and normalized value is logged for full reproducibility.

function rankCandidates(
  candidates: DecisionItem[],
  customer: CustomerFeatures,
  channel: string,
  placement: string,
  context: DecisionRequest['context'],
  formula: RankingFormula,
  policy: DecisionPolicy,
  allItems: DecisionItem[],
): { scored: ScoredCandidate[]; duration_ms: number } {
  const t0 = performance.now();
  const model = getModel();

  // Pre-compute normalization ranges across entire catalog for BusinessValue
  const allValues = allItems.filter(i => i.status === 'active').map(i => i.business_value);
  const bvNorm = normalizeAcrossCatalog(allValues);
  const allCosts = allItems.filter(i => i.status === 'active').map(i => i.cost);
  const costNorm = normalizeAcrossCatalog(allCosts);

  const scored: ScoredCandidate[] = candidates.map(item => {
    const features = extractFeatures(customer, item, channel, context);

    // 1. BusinessValue [0,1]
    const bv_raw = item.business_value;
    const bv_norm = normalizeMinMax(bv_raw, bvNorm.min, bvNorm.max);

    // 2. ConversionProbability [0,1] — REAL ML MODEL
    const prediction = predictConversion(features, model, item.redemption_count);
    let cp_raw = prediction.probability;
    let is_exploration = false;

    // Apply Thompson sampling if in explore/exploit mode
    if (policy.ranking_method === 'explore_exploit' && policy.experiment.exploration_rate > 0) {
      const thompson = thompsonScoredProbability(
        cp_raw,
        item.redemption_count,
        Math.max(0, (item.budget_spent || 0) - item.redemption_count),
        policy.experiment.exploration_rate,
      );
      cp_raw = thompson.probability;
      is_exploration = thompson.is_exploration;
    }
    const cp_norm = Math.max(0, Math.min(1, cp_raw));

    // 3. CustomerAffinity [0,1]
    const affinity = computeCustomerAffinity(customer, item);
    const ca_norm = Math.max(0, Math.min(1, affinity.score));

    // 4. ChannelAffinity [0,1] — Bayesian-shrunk
    const channelAff = computeChannelAffinity(customer, channel);
    const cha_norm = Math.max(0, Math.min(1, channelAff.score));

    // 5. ContextRelevance [0,1]
    const ctxRel = computeContextRelevance(item, placement, channel, context);
    const cr_norm = Math.max(0, Math.min(1, ctxRel.score));

    // 6. Urgency [0,1]
    const urg_raw = features.item_urgency;
    const urg_norm = urg_raw;

    // 7. FatiguePenalty [0,1] — soft secondary (guardrails handle hard cap)
    const fatigue = computeFatigueScore(customer);
    const fat_norm = fatigue.penalty;

    // 8. CostPenalty [0,1]
    const cost_raw = item.cost;
    const cost_norm = normalizeMinMax(cost_raw, costNorm.min, costNorm.max);

    // ── Compute score using multiplicative model with additive penalties ──
    const positive_score =
      bv_norm * formula.business_value_weight +
      cp_norm * formula.conversion_probability_weight +
      ca_norm * formula.customer_affinity_weight +
      cha_norm * formula.channel_affinity_weight +
      cr_norm * formula.context_relevance_weight +
      urg_norm * formula.urgency_weight;

    const penalties =
      fat_norm * formula.fatigue_penalty_weight +
      cost_norm * formula.cost_penalty_weight;

    // Clip at 0 via sigmoid squashing to prevent negative scores breaking ranking
    const raw_score = positive_score - penalties;
    const final_score = sigmoidSquash(raw_score, 0.3, 8);

    // ── SHAP-like attribution ──
    const attributions = computeAttributions([
      { name: 'business_value', value: bv_norm, weight: formula.business_value_weight, is_penalty: false },
      { name: 'conversion_probability', value: cp_norm, weight: formula.conversion_probability_weight, is_penalty: false },
      { name: 'customer_affinity', value: ca_norm, weight: formula.customer_affinity_weight, is_penalty: false },
      { name: 'channel_affinity', value: cha_norm, weight: formula.channel_affinity_weight, is_penalty: false },
      { name: 'context_relevance', value: cr_norm, weight: formula.context_relevance_weight, is_penalty: false },
      { name: 'urgency', value: urg_norm, weight: formula.urgency_weight, is_penalty: false },
      { name: 'fatigue_penalty', value: fat_norm, weight: formula.fatigue_penalty_weight, is_penalty: true },
      { name: 'cost_penalty', value: cost_norm, weight: formula.cost_penalty_weight, is_penalty: true },
    ]);

    const breakdown: ScoreBreakdown = {
      business_value: { raw: bv_raw, normalized: bv_norm },
      conversion_probability: {
        raw: prediction.probability,
        normalized: cp_norm,
        model_version: prediction.model_version,
        calibrated: prediction.calibrated,
      },
      customer_affinity: { raw: affinity.score, normalized: ca_norm, source: affinity.source },
      channel_affinity: {
        raw: channelAff.score,
        normalized: cha_norm,
        sample_size: channelAff.sample_size,
        shrinkage_applied: channelAff.shrinkage_applied,
      },
      context_relevance: { raw: ctxRel.score, normalized: cr_norm, factors: ctxRel.factors },
      urgency: {
        raw: urg_raw,
        normalized: urg_norm,
        hours_remaining: item.ends_at ? Math.max(0, (new Date(item.ends_at).getTime() - Date.now()) / 3600000) : null,
      },
      fatigue_penalty: { raw: fatigue.score, normalized: fat_norm, exposure_count: customer.messages_today },
      cost_penalty: { raw: cost_raw, normalized: cost_norm },
    };

    // Reason codes
    const reasons: string[] = [];
    if (bv_norm > 0.7) reasons.push('HIGH_VALUE');
    if (cp_norm > 0.3) reasons.push('HIGH_CONVERSION_PROPENSITY');
    if (cha_norm > 0.3) reasons.push('CHANNEL_MATCH');
    if (urg_norm > 0.7) reasons.push('TIME_SENSITIVE');
    if (cr_norm > 0.6) reasons.push('CONTEXT_RELEVANT');
    if (customer.rfm_score >= 12) reasons.push('PREMIUM_CUSTOMER');
    if (customer.churn_risk > 0.6) reasons.push('CHURN_RISK');
    if (is_exploration) reasons.push('EXPLORATION');
    if (prediction.fallback_reason) reasons.push('COLD_START');

    return {
      item,
      score: Math.round(final_score * 1000) / 10, // 0-100 scale, 1 decimal
      breakdown,
      feature_contributions: attributions.map(a => ({
        feature: a.feature,
        contribution: Math.round(a.contribution * 1000) / 10,
        direction: a.direction,
      })),
      reason_codes: reasons,
      confidence: prediction.confidence,
      fallback_reason: prediction.fallback_reason,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return { scored, duration_ms: performance.now() - t0 };
}

// ─── Stage 6: Arbitration ──────────────────────────────────────────
// Cross-candidate business logic applied AFTER ranking.
// - Diversity constraints: max N items per category
// - Explore/exploit: reserve slots for lower-ranked / newer items
// - Stacking: exclusive items take only one slot

function arbitrate(
  scored: ScoredCandidate[],
  policy: DecisionPolicy,
  customer: CustomerFeatures,
): { final: ScoredCandidate[]; is_holdout: boolean; is_exploration: boolean; filtered: StageTrace['filtered']; duration_ms: number } {
  const t0 = performance.now();
  const filtered: StageTrace['filtered'] = [];
  const maxItems = policy.max_items_returned || 1;

  // Holdout check (deterministic assignment)
  const experimentGroup = policy.experiment.enabled
    ? assignToExperimentGroup(customer.customer_id, policy.id, policy.experiment.holdout_percent)
    : 'treatment';

  if (experimentGroup === 'holdout') {
    filtered.push({
      item_id: '[HOLDOUT]',
      item_name: '[Holdout Group]',
      reason_code: 'HOLDOUT',
      reason: `Customer in ${policy.experiment.holdout_percent}% holdout group`,
    });
    return { final: [], is_holdout: true, is_exploration: false, filtered, duration_ms: performance.now() - t0 };
  }

  // Diversity: max 2 items per category in the final set
  const MAX_PER_CATEGORY = 2;
  const categoryCounts = new Map<string, number>();
  const diverse: ScoredCandidate[] = [];

  for (const s of scored) {
    const catCount = categoryCounts.get(s.item.category) ?? 0;
    if (catCount >= MAX_PER_CATEGORY) {
      filtered.push({
        item_id: s.item.id,
        item_name: s.item.name,
        reason_code: 'DIVERSITY_CAP',
        reason: `Max ${MAX_PER_CATEGORY} items per category "${s.item.category}"`,
      });
      continue;
    }

    // Stacking: exclusive items can't coexist
    if (s.item.stacking === 'exclusive' && diverse.some(d => d.item.stacking === 'exclusive')) {
      filtered.push({
        item_id: s.item.id,
        item_name: s.item.name,
        reason_code: 'EXCLUSIVE_CONFLICT',
        reason: 'Only one exclusive item allowed',
      });
      continue;
    }

    diverse.push(s);
    categoryCounts.set(s.item.category, catCount + 1);

    if (diverse.length >= maxItems) break;
  }

  const is_exploration = diverse.some(s => s.reason_codes.includes('EXPLORATION'));

  return { final: diverse, is_holdout: false, is_exploration, filtered, duration_ms: performance.now() - t0 };
}

// ─── Stage 7: Decision + Logging ───────────────────────────────────
// Assembles the final response with full trace. Must be replayable.

export function evaluateDecision(
  items: DecisionItem[],
  policy: DecisionPolicy,
  guardrails: Guardrail[],
  customer: CustomerFeatures,
  request: DecisionRequest,
): DecisionResponse {
  const trace: StageTrace[] = [];
  const model = getModel();

  // Stage 1: Context Resolution
  const ctx = resolveCustomerContext(customer, request.context);
  trace.push({
    stage: 'context_resolution',
    input_count: 1,
    output_count: 1,
    filtered: [],
    duration_ms: ctx.duration_ms,
    metadata: {
      rfm_segment: ctx.features.rfm_segment,
      rfm_score: ctx.features.rfm_score,
      lifecycle: ctx.features.lifecycle_stage,
      fatigue: computeFatigueScore(ctx.features).level,
    },
  });

  // Stage 2: Candidate Generation
  const gen = generateCandidates(items, policy, ctx.features);
  trace.push({
    stage: 'candidate_generation',
    input_count: items.length,
    output_count: gen.candidates.length,
    filtered: gen.filtered,
    duration_ms: gen.duration_ms,
  });

  // Stage 3: Eligibility (DETERMINISTIC)
  const elig = filterEligibility(gen.candidates, policy, ctx.features, request.context);
  trace.push({
    stage: 'eligibility',
    input_count: gen.candidates.length,
    output_count: elig.eligible.length,
    filtered: elig.filtered,
    duration_ms: elig.duration_ms,
  });

  // Stage 4: Guardrails (DETERMINISTIC — hard veto, never overridden by ML)
  const guard = applyGuardrails(elig.eligible, guardrails, policy, ctx.features, request.channel, request.context);
  trace.push({
    stage: 'guardrails',
    input_count: elig.eligible.length,
    output_count: guard.surviving.length,
    filtered: guard.filtered,
    duration_ms: guard.duration_ms,
    metadata: { global_suppression: guard.suppressed },
  });

  // Stage 5: Ranking (ML layer — only runs on survivors)
  const ranked = guard.surviving.length > 0
    ? rankCandidates(guard.surviving, ctx.features, request.channel, request.placement, request.context, policy.ranking_formula, policy, items)
    : { scored: [], duration_ms: 0 };
  trace.push({
    stage: 'ranking',
    input_count: guard.surviving.length,
    output_count: ranked.scored.length,
    filtered: [],
    duration_ms: ranked.duration_ms,
    metadata: { model_version: model.version.id, model_phase: model.version.phase },
  });

  // Stage 6: Arbitration
  const arb = arbitrate(ranked.scored, policy, ctx.features);
  trace.push({
    stage: 'arbitration',
    input_count: ranked.scored.length,
    output_count: arb.final.length,
    filtered: arb.filtered,
    duration_ms: arb.duration_ms,
    metadata: { is_holdout: arb.is_holdout, is_exploration: arb.is_exploration },
  });

  // Stage 7: Determine outcome
  let decision: DecisionOutcome = 'action';
  let responseItems = arb.final;

  if (arb.is_holdout) {
    decision = 'holdout';
    responseItems = [];
  } else if (guard.suppressed && policy.allow_no_action) {
    decision = 'no_action';
    responseItems = [];
  } else if (arb.final.length === 0 && policy.fallback_item_id) {
    const fb = items.find(i => i.id === policy.fallback_item_id);
    if (fb) {
      const fbFeatures = extractFeatures(ctx.features, fb, request.channel, request.context);
      const fbPred = predictConversion(fbFeatures, model, fb.redemption_count);
      responseItems = [{
        item: fb,
        score: 0,
        breakdown: {
          business_value: { raw: fb.business_value, normalized: 0 },
          conversion_probability: { raw: fbPred.probability, normalized: fbPred.probability, model_version: fbPred.model_version, calibrated: fbPred.calibrated },
          customer_affinity: { raw: 0, normalized: 0, source: 'segment_prior' },
          channel_affinity: { raw: 0, normalized: 0, sample_size: 0, shrinkage_applied: true },
          context_relevance: { raw: 0, normalized: 0, factors: ['FALLBACK'] },
          urgency: { raw: 0, normalized: 0, hours_remaining: null },
          fatigue_penalty: { raw: 0, normalized: 0, exposure_count: 0 },
          cost_penalty: { raw: 0, normalized: 0 },
        },
        feature_contributions: [],
        reason_codes: ['FALLBACK'],
        confidence: 'low',
        fallback_reason: 'No primary candidates qualified',
      }];
      decision = 'fallback';
    } else {
      decision = 'no_action';
    }
  } else if (arb.final.length === 0) {
    decision = 'no_action';
  }

  trace.push({
    stage: 'final',
    input_count: arb.final.length,
    output_count: responseItems.length,
    filtered: [],
    duration_ms: 0,
    metadata: { decision, is_exploration: arb.is_exploration },
  });

  const winner = responseItems[0];
  let reasonSummary = '';
  if (decision === 'action' && winner) {
    reasonSummary = `Selected "${winner.item.name}" (score ${winner.score}) — ${winner.reason_codes.join(', ')}`;
  } else if (decision === 'no_action') {
    reasonSummary = guard.suppressed
      ? `Suppressed: ${guard.filtered.map(f => f.reason).join('; ')}`
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
    model_version: model.version.id,
    items: responseItems,
    decision,
    channel: request.channel,
    reason_summary: reasonSummary,
    trace,
    customer_snapshot: ctx.features,
    evaluated_at: new Date().toISOString(),
    ttl: policy.ttl_seconds,
    is_exploration: arb.is_exploration,
    replay_hash: computeReplayHash(
      request.customer_id,
      request.placement,
      request.channel,
      model.version.id,
      items.map(i => i.id),
    ),
  };
}

// ─── Decision Log Entry Builder ────────────────────────────────────

export function buildLogEntry(
  response: DecisionResponse,
  request: DecisionRequest,
  customerName: string,
): DecisionLogEntry {
  const winner = response.items[0];
  const features = winner
    ? extractFeatures(response.customer_snapshot, winner.item, request.channel, request.context)
    : {};

  return {
    id: response.decision_id,
    customer_id: request.customer_id,
    customer_name: customerName,
    policy_id: response.policy_id,
    policy_name: response.policy_name,
    model_version: response.model_version,
    decision: response.decision,
    winning_item_id: winner?.item.id ?? null,
    winning_item_name: winner?.item.name ?? '',
    score: winner?.score ?? 0,
    score_breakdown: winner?.breakdown ?? null,
    channel: response.channel,
    placement: request.placement,
    reason: response.reason_summary,
    confidence: winner?.confidence ?? 'low',
    is_exploration: response.is_exploration,
    fallback_used: response.decision === 'fallback',
    trace: response.trace,
    feature_snapshot: features as Record<string, number>,
    timestamp: response.evaluated_at,
    outcome: null,
    outcome_at: null,
    outcome_value: null,
  };
}
