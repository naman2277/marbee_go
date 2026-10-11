import { supabase } from './supabase';
import { logAudit } from './audit';
import type { Customer } from '@marbee/shared';

export type DecisionGoal = 'maximize_conversion' | 'maximize_margin' | 'churn_prevention' | 'customer_reactivation' | 'balanced_growth';

export type EligibilityCondition = {
  id: string;
  field: 'rfm_segment' | 'cart_value' | 'purchase_frequency' | 'lifetime_value' | 'tier' | 'inactivity_days' | 'channel_affinity';
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in_list' | 'between';
  value: string | number | string[];
};

export type DecisionPolicyRule = {
  id: string;
  name: string;
  priority: number;
  offer_id: string;
  offer_name: string;
  offer_type: string;
  discount_display: string;
  channel: 'all' | 'email' | 'whatsapp' | 'sms' | 'web_push' | 'checkout';
  goal: DecisionGoal;
  eligibility_conditions: EligibilityCondition[];
  value_weight: number;
  propensity_weight: number;
  margin_weight: number;
  fatigue_penalty_weight: number;
  cooldown_days: number;
  status: 'active' | 'paused' | 'draft';
  impressions: number;
  conversions: number;
  revenue_attributed: number;
};

export type RfmCluster = {
  id: string;
  name: string;
  description: string;
  badge_color: string;
  recency_score: number; // 1-5
  frequency_score: number; // 1-5
  monetary_score: number; // 1-5
  customer_count: number;
  percentage: number;
  recommended_action: string;
  suggested_offer_type: string;
};

export type DecisionSimulationContext = {
  customer_id?: string;
  customer_name?: string;
  email?: string;
  mobile?: string;
  tier?: string;
  cart_value: number;
  channel: string;
  placement: string;
  rfm_segment: string;
  inactivity_days: number;
  propensity_score: number;
};

export type DecisionEvaluationResult = {
  winning_rule: DecisionPolicyRule | null;
  arbitration_score: number;
  qualified_rules: {
    rule: DecisionPolicyRule;
    score: number;
    breakdown: {
      value_score: number;
      propensity_score: number;
      margin_score: number;
      fatigue_penalty: number;
    };
  }[];
  disqualified_rules: {
    rule: DecisionPolicyRule;
    failed_reason: string;
  }[];
  ai_intent_insights: {
    user_intent: string;
    churn_risk_level: 'low' | 'medium' | 'high' | 'critical';
    channel_recommendation: string;
    suggested_messaging: string;
  };
};

const STORAGE_POLICY_KEY = 'marbee_decision_policies_v3';

/** Fetch Decision Rules */
export async function fetchDecisionRules(tenantId: string, environment: string): Promise<DecisionPolicyRule[]> {
  try {
    const raw = localStorage.getItem(`${STORAGE_POLICY_KEY}_${tenantId}_${environment}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Decision rules storage read error:', e);
  }

  try {
    const { data, error } = await supabase
      .from('offer_decision_policies')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const mapped = data.map((d: Record<string, unknown>, idx: number) => ({
        id: String(d.id),
        name: String(d.name),
        priority: idx + 1,
        offer_id: String(d.fallback_offer_id || ''),
        offer_name: String(d.name),
        offer_type: 'discount_percent',
        discount_display: 'ACTIVE',
        channel: (d.channel as DecisionPolicyRule['channel']) || 'all',
        goal: 'maximize_conversion' as const,
        eligibility_conditions: [],
        value_weight: 0.4,
        propensity_weight: 0.35,
        margin_weight: 0.2,
        fatigue_penalty_weight: 0.1,
        cooldown_days: 7,
        status: (d.status as DecisionPolicyRule['status']) || 'active',
        impressions: 0,
        conversions: 0,
        revenue_attributed: 0,
      }));
      localStorage.setItem(`${STORAGE_POLICY_KEY}_${tenantId}_${environment}`, JSON.stringify(mapped));
      return mapped;
    }
  } catch {}

  return [];
}

/** Save Decision Rules */
export async function saveDecisionRules(
  tenantId: string,
  environment: string,
  rules: DecisionPolicyRule[]
): Promise<DecisionPolicyRule[]> {
  try {
    localStorage.setItem(`${STORAGE_POLICY_KEY}_${tenantId}_${environment}`, JSON.stringify(rules));
  } catch (e) {
    console.warn('Decision rules storage write error:', e);
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'decision_policies',
    resourceId: tenantId,
    resourceName: `Updated ${rules.length} Decision Policies`,
  });

  return rules;
}

/** Delete an individual decision policy rule */
export async function deleteDecisionRule(
  tenantId: string,
  environment: string,
  ruleId: string
): Promise<DecisionPolicyRule[]> {
  try {
    await supabase.from('offer_decision_policies').delete().eq('id', ruleId).eq('tenant_id', tenantId);
  } catch {}

  const current = await fetchDecisionRules(tenantId, environment);
  const updated = current.filter((r) => r.id !== ruleId);
  return await saveDecisionRules(tenantId, environment, updated);
}

/** Clear all decision rules */
export async function clearAllDecisionRules(tenantId: string, environment: string): Promise<void> {
  try {
    await supabase.from('offer_decision_policies').delete().eq('tenant_id', tenantId).eq('environment', environment);
  } catch {}

  try {
    localStorage.removeItem(`${STORAGE_POLICY_KEY}_${tenantId}_${environment}`);
    localStorage.removeItem(`marbee_decision_policies_v2_${tenantId}_${environment}`);
  } catch {}
}

/** Dynamically calculate RFM segmentation clusters from real customer dataset */
export function calculateLiveRfmClusters(customers: Customer[]): RfmCluster[] {
  const total = customers.length;
  if (total === 0) {
    return [
      {
        id: 'rfm_champions',
        name: 'Champions',
        description: 'High-value frequent buyers with recent transaction activity.',
        badge_color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        recency_score: 5,
        frequency_score: 5,
        monetary_score: 5,
        customer_count: 0,
        percentage: 0,
        recommended_action: 'Reward with VIP early access and tier badges.',
        suggested_offer_type: 'Exclusive VIP Pre-Launch',
      },
      {
        id: 'rfm_loyal',
        name: 'Loyal Customers',
        description: 'Consistent purchase frequency with steady order value.',
        badge_color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        recency_score: 4,
        frequency_score: 4,
        monetary_score: 4,
        customer_count: 0,
        percentage: 0,
        recommended_action: 'Upsell related categories and cross-sell bundles.',
        suggested_offer_type: 'Category Cross-Sell Incentives',
      },
      {
        id: 'rfm_potential',
        name: 'Potential Loyalists',
        description: 'Recent buyers with high engagement and repeat purchase potential.',
        badge_color: 'bg-purple-100 text-purple-800 border-purple-200',
        recency_score: 4,
        frequency_score: 2,
        monetary_score: 3,
        customer_count: 0,
        percentage: 0,
        recommended_action: 'Incentivize second order with welcome points bonus.',
        suggested_offer_type: 'Points Multiplier & Welcome Reward',
      },
      {
        id: 'rfm_at_risk',
        name: 'At Risk / Churn Warning',
        description: 'Previously active customers showing signs of inactivity.',
        badge_color: 'bg-rose-100 text-rose-800 border-rose-200',
        recency_score: 1,
        frequency_score: 4,
        monetary_score: 4,
        customer_count: 0,
        percentage: 0,
        recommended_action: 'Trigger urgent personalized win-back offers and voice calls.',
        suggested_offer_type: 'Win-Back Flash Discount Voucher',
      },
      {
        id: 'rfm_hibernating',
        name: 'Hibernating',
        description: 'Low frequency, dormant customer profiles requiring reactivation.',
        badge_color: 'bg-amber-100 text-amber-800 border-amber-200',
        recency_score: 1,
        frequency_score: 1,
        monetary_score: 2,
        customer_count: 0,
        percentage: 0,
        recommended_action: 'Re-engage with zero-friction free gift or catalog updates.',
        suggested_offer_type: 'Free Reactivation Gift Voucher',
      },
    ];
  }

  const now = Date.now();
  let champions = 0;
  let loyal = 0;
  let potential = 0;
  let atRisk = 0;
  let hibernating = 0;

  customers.forEach((c) => {
    const createdTime = new Date(c.created_at || now).getTime();
    const daysSinceCreation = Math.max(0, Math.floor((now - createdTime) / 86400000));

    if (daysSinceCreation < 14) {
      potential++;
    } else if (daysSinceCreation < 45) {
      if (c.email && c.mobile) champions++;
      else loyal++;
    } else if (daysSinceCreation < 90) {
      atRisk++;
    } else {
      hibernating++;
    }
  });

  return [
    {
      id: 'rfm_champions',
      name: 'Champions',
      description: 'High-value frequent buyers with recent transaction activity.',
      badge_color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      recency_score: 5,
      frequency_score: 5,
      monetary_score: 5,
      customer_count: champions,
      percentage: total > 0 ? Math.round((champions / total) * 1000) / 10 : 0,
      recommended_action: 'Reward with VIP early access, exclusive perks, and zero-discount brand gifts.',
      suggested_offer_type: 'Exclusive VIP Pre-Launch',
    },
    {
      id: 'rfm_loyal',
      name: 'Loyal Customers',
      description: 'Consistent purchase frequency with steady order value.',
      badge_color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      recency_score: 4,
      frequency_score: 4,
      monetary_score: 4,
      customer_count: loyal,
      percentage: total > 0 ? Math.round((loyal / total) * 1000) / 10 : 0,
      recommended_action: 'Upsell related product categories and cross-sell bundles.',
      suggested_offer_type: 'Category Cross-Sell Bundles',
    },
    {
      id: 'rfm_potential',
      name: 'Potential Loyalists',
      description: 'Recent buyers with high engagement and repeat purchase potential.',
      badge_color: 'bg-purple-100 text-purple-800 border-purple-200',
      recency_score: 4,
      frequency_score: 2,
      monetary_score: 3,
      customer_count: potential,
      percentage: total > 0 ? Math.round((potential / total) * 1000) / 10 : 0,
      recommended_action: 'Incentivize second purchase with personalized membership points onboarding.',
      suggested_offer_type: 'Points Multiplier & Welcome Reward',
    },
    {
      id: 'rfm_at_risk',
      name: 'At Risk / Churn Warning',
      description: 'Previously active customers showing signs of inactivity.',
      badge_color: 'bg-rose-100 text-rose-800 border-rose-200',
      recency_score: 1,
      frequency_score: 4,
      monetary_score: 4,
      customer_count: atRisk,
      percentage: total > 0 ? Math.round((atRisk / total) * 1000) / 10 : 0,
      recommended_action: 'Trigger urgent personalized win-back offers and proactive voice call outreach.',
      suggested_offer_type: 'Win-Back Flash Discount Voucher',
    },
    {
      id: 'rfm_hibernating',
      name: 'Hibernating',
      description: 'Low frequency, dormant customer profiles requiring reactivation.',
      badge_color: 'bg-amber-100 text-amber-800 border-amber-200',
      recency_score: 1,
      frequency_score: 1,
      monetary_score: 2,
      customer_count: hibernating,
      percentage: total > 0 ? Math.round((hibernating / total) * 1000) / 10 : 0,
      recommended_action: 'Re-engage with zero-friction free gift on reactivation or brand updates.',
      suggested_offer_type: 'Free Reactivation Gift Voucher',
    },
  ];
}

/** Evaluate Next Best Action (NBA) Decisioning Simulation */
export function evaluateNextBestAction(
  rules: DecisionPolicyRule[],
  context: DecisionSimulationContext
): DecisionEvaluationResult {
  const qualified: DecisionEvaluationResult['qualified_rules'] = [];
  const disqualified: DecisionEvaluationResult['disqualified_rules'] = [];

  rules.forEach((rule) => {
    if (rule.status !== 'active') {
      disqualified.push({ rule, failed_reason: 'Policy is currently paused/draft' });
      return;
    }

    if (rule.channel !== 'all' && context.channel !== 'any' && rule.channel !== context.channel) {
      disqualified.push({ rule, failed_reason: `Channel mismatch (Rule requires ${rule.channel}, current is ${context.channel})` });
      return;
    }

    let isEligible = true;
    let failedConditionDesc = '';

    for (const cond of rule.eligibility_conditions) {
      if (cond.field === 'cart_value') {
        const target = Number(cond.value);
        if (cond.operator === 'greater_than' && context.cart_value <= target) {
          isEligible = false;
          failedConditionDesc = `Cart value (₹${context.cart_value}) not > ₹${target}`;
          break;
        }
      } else if (cond.field === 'rfm_segment') {
        const list = Array.isArray(cond.value) ? cond.value : [String(cond.value)];
        if (!list.includes(context.rfm_segment)) {
          isEligible = false;
          failedConditionDesc = `RFM segment "${context.rfm_segment}" not in [${list.join(', ')}]`;
          break;
        }
      } else if (cond.field === 'inactivity_days') {
        const target = Number(cond.value);
        if (cond.operator === 'greater_than' && context.inactivity_days <= target) {
          isEligible = false;
          failedConditionDesc = `Inactivity (${context.inactivity_days}d) not > ${target}d`;
          break;
        }
        if (cond.operator === 'less_than' && context.inactivity_days >= target) {
          isEligible = false;
          failedConditionDesc = `Inactivity (${context.inactivity_days}d) not < ${target}d`;
          break;
        }
      } else if (cond.field === 'tier' && context.tier) {
        const list = Array.isArray(cond.value) ? cond.value : [String(cond.value)];
        if (!list.includes(context.tier)) {
          isEligible = false;
          failedConditionDesc = `Loyalty tier "${context.tier}" not in [${list.join(', ')}]`;
          break;
        }
      }
    }

    if (!isEligible) {
      disqualified.push({ rule, failed_reason: failedConditionDesc });
      return;
    }

    // Arbitration scoring calculation
    const normalizedCart = Math.min(context.cart_value / 5000, 1.0);
    const valueScore = normalizedCart * rule.value_weight * 100;
    const propensityScore = context.propensity_score * rule.propensity_weight * 100;
    const marginScore = (1.0 - (rule.discount_display.includes('%') ? parseInt(rule.discount_display) / 100 : 0.15)) * rule.margin_weight * 100;
    const fatiguePenalty = (context.inactivity_days < 7 ? 0.2 : 0) * rule.fatigue_penalty_weight * 100;

    const totalScore = Math.round(valueScore + propensityScore + marginScore - fatiguePenalty + (100 - rule.priority * 2));

    qualified.push({
      rule,
      score: totalScore,
      breakdown: {
        value_score: Math.round(valueScore),
        propensity_score: Math.round(propensityScore),
        margin_score: Math.round(marginScore),
        fatigue_penalty: Math.round(fatiguePenalty),
      },
    });
  });

  qualified.sort((a, b) => b.score - a.score);

  const winning = qualified[0]?.rule ?? null;
  const winningScore = qualified[0]?.score ?? 0;

  const churnRisk =
    context.inactivity_days > 40 ? 'critical' : context.inactivity_days > 20 ? 'high' : context.inactivity_days > 7 ? 'medium' : 'low';

  const aiIntent =
    context.cart_value > 2500
      ? 'High-intent buyer actively browsing premium products. High sensitivity to checkout incentives.'
      : context.inactivity_days > 30
      ? 'Dormant user showing reactivation signals. Needs emotionally compelling or zero-friction gift.'
      : 'Regular engaged customer with steady repeat order cadence.';

  return {
    winning_rule: winning,
    arbitration_score: winningScore,
    qualified_rules: qualified,
    disqualified_rules: disqualified,
    ai_intent_insights: {
      user_intent: aiIntent,
      churn_risk_level: churnRisk,
      channel_recommendation: context.channel === 'any' ? (churnRisk === 'high' || churnRisk === 'critical' ? 'WhatsApp + Push' : 'Email + In-App') : context.channel,
      suggested_messaging: winning
        ? `Deliver "${winning.offer_name}" with personalized subject line highlighting "${winning.discount_display}" unlock.`
        : 'Engage with brand story or catalog showcase without discount degradation.',
    },
  };
}
