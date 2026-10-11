import { supabase } from './supabase';
import { logAudit } from './audit';
import type { DecisionResult, DecisionStrategy, OfferDecisionPolicy } from './loyalty-types';

function mapPolicy(row: Record<string, unknown>): OfferDecisionPolicy {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    environment: row.environment as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    status: row.status as OfferDecisionPolicy['status'],
    strategy: row.strategy as DecisionStrategy,
    channel: row.channel as string,
    placement: row.placement as string,
    fallbackOfferId: (row.fallback_offer_id as string | null) ?? null,
    settings: (row.settings as OfferDecisionPolicy['settings']) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function fetchDecisionPolicies(
  tenantId: string,
  environment: string,
): Promise<OfferDecisionPolicy[]> {
  const { data, error } = await supabase.rpc('list_offer_decision_policies', {
    p_tenant_id: tenantId,
    p_environment: environment,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => mapPolicy(r));
}

export async function fetchPolicyOfferIds(policyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('offer_policy_links')
    .select('offer_id')
    .eq('policy_id', policyId);
  if (error) throw error;
  return (data ?? []).map((r) => r.offer_id as string);
}

export async function saveDecisionPolicy(input: {
  tenantId: string;
  environment: string;
  id?: string;
  name: string;
  slug: string;
  description?: string;
  status: OfferDecisionPolicy['status'];
  strategy: DecisionStrategy;
  channel: string;
  placement: string;
  fallbackOfferId?: string | null;
  settings?: OfferDecisionPolicy['settings'];
  offerIds?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_offer_decision_policy', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_id: input.id ?? null,
    p_name: input.name.trim(),
    p_slug: input.slug.trim().toLowerCase(),
    p_description: input.description ?? null,
    p_status: input.status,
    p_strategy: input.strategy,
    p_channel: input.channel,
    p_placement: input.placement,
    p_fallback_offer_id: input.fallbackOfferId ?? null,
    p_settings: input.settings ?? {},
    p_offer_ids: input.offerIds ?? [],
  });
  if (error) throw error;

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: input.id ? 'update' : 'create',
    resourceType: 'offer_decision_policy',
    resourceId: data as string,
    resourceName: input.name,
  });

  return data as string;
}

export async function simulateBestOffer(input: {
  tenantId: string;
  environment: string;
  policySlug: string;
  customerId?: string | null;
  context: {
    channel?: string;
    placement?: string;
    cart_value?: number;
    tier_slug?: string;
    propensity?: number;
  };
}): Promise<DecisionResult> {
  const { data, error } = await supabase.rpc('decide_best_offer', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_policy_slug: input.policySlug,
    p_customer_id: input.customerId ?? null,
    p_context: input.context,
  });
  if (error) throw error;
  return data as DecisionResult;
}

export async function fetchRecentDecisions(tenantId: string, environment: string, limit = 20) {
  const { data, error } = await supabase
    .from('offer_decision_log')
    .select('id, policy_id, customer_id, placement, channel, winner_offer_id, strategy, created_at, score_breakdown')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
