import { supabase } from './supabase';
import { logAudit } from './audit';
import type { LoyaltyMember, LoyaltyProgram, LoyaltyTier } from './loyalty-types';

function mapProgram(row: Record<string, unknown>): LoyaltyProgram {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    environment: row.environment as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    pointsCurrency: row.points_currency as string,
    earnRate: Number(row.earn_rate),
    status: row.status as LoyaltyProgram['status'],
    memberCount: Number(row.member_count ?? 0),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapTier(row: Record<string, unknown>): LoyaltyTier {
  return {
    id: row.id as string,
    programId: row.program_id as string,
    name: row.name as string,
    slug: row.slug as string,
    minPoints: Number(row.min_points),
    pointsMultiplier: Number(row.points_multiplier),
    color: row.color as string,
    benefits: (row.benefits as unknown[]) ?? [],
    sortOrder: Number(row.sort_order),
  };
}

export async function fetchLoyaltyPrograms(tenantId: string, environment: string): Promise<LoyaltyProgram[]> {
  const { data, error } = await supabase.rpc('list_loyalty_programs', {
    p_tenant_id: tenantId,
    p_environment: environment,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => mapProgram(r));
}

export async function saveLoyaltyProgram(input: {
  tenantId: string;
  environment: string;
  id?: string;
  name: string;
  slug: string;
  description?: string;
  pointsCurrency?: string;
  earnRate?: number;
  status: LoyaltyProgram['status'];
}): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_loyalty_program', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_id: input.id ?? null,
    p_name: input.name.trim(),
    p_slug: input.slug.trim().toLowerCase(),
    p_description: input.description ?? null,
    p_points_currency: input.pointsCurrency ?? 'Points',
    p_earn_rate: input.earnRate ?? 1,
    p_status: input.status,
  });
  if (error) throw error;
  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: input.id ? 'update' : 'create',
    resourceType: 'loyalty_program',
    resourceId: data as string,
    resourceName: input.name,
  });
  return data as string;
}

export async function fetchLoyaltyTiers(programId: string): Promise<LoyaltyTier[]> {
  const { data, error } = await supabase
    .from('loyalty_tiers')
    .select('*')
    .eq('program_id', programId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r) => mapTier(r as Record<string, unknown>));
}

export async function fetchLoyaltyMembers(
  tenantId: string,
  environment: string,
  programId?: string,
): Promise<LoyaltyMember[]> {
  let query = supabase
    .from('loyalty_members')
    .select(`
      id, program_id, customer_id, tier_id, points_balance, lifetime_points, status, enrolled_at,
      customers (email, first_name, last_name),
      loyalty_tiers (name, slug, color)
    `)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('enrolled_at', { ascending: false })
    .limit(100);

  if (programId) query = query.eq('program_id', programId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const customer = r.customers as Record<string, unknown> | null;
    const tier = r.loyalty_tiers as Record<string, unknown> | null;
    return {
      id: r.id as string,
      programId: r.program_id as string,
      customerId: r.customer_id as string,
      tierId: (r.tier_id as string | null) ?? null,
      pointsBalance: Number(r.points_balance),
      lifetimePoints: Number(r.lifetime_points),
      status: r.status as LoyaltyMember['status'],
      enrolledAt: r.enrolled_at as string,
      customer: customer
        ? {
            email: customer.email as string | null,
            first_name: customer.first_name as string | null,
            last_name: customer.last_name as string | null,
          }
        : undefined,
      tier: tier
        ? { name: tier.name as string, slug: tier.slug as string, color: tier.color as string }
        : undefined,
    };
  });
}

export async function enrollCustomerLoyalty(
  tenantId: string,
  environment: string,
  customerId: string,
  programId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('enroll_customer_loyalty', {
    p_tenant_id: tenantId,
    p_environment: environment,
    p_customer_id: customerId,
    p_program_id: programId,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchLoyaltyOverviewStats(tenantId: string, environment: string) {
  const [programs, offers, policies, members] = await Promise.all([
    fetchLoyaltyPrograms(tenantId, environment),
    supabase.from('loyalty_offers').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId).eq('environment', environment),
    supabase.from('offer_decision_policies').select('id, status', { count: 'exact' }).eq('tenant_id', tenantId).eq('environment', environment),
    supabase.from('loyalty_members').select('points_balance').eq('tenant_id', tenantId).eq('environment', environment),
  ]);

  const activeOffers = (offers.data ?? []).filter((o) => o.status === 'active').length;
  const activePolicies = (policies.data ?? []).filter((p) => p.status === 'active').length;
  const totalPoints = (members.data ?? []).reduce((s, m) => s + Number(m.points_balance), 0);

  return {
    programs: programs.length,
    activePrograms: programs.filter((p) => p.status === 'active').length,
    members: members.data?.length ?? 0,
    totalPoints,
    activeOffers,
    activePolicies,
  };
}
