import { supabase } from './supabase';
import { logAudit, diffChanges } from './audit';
import type { LoyaltyOffer, OfferType } from './loyalty-types';

function mapOffer(row: Record<string, unknown>): LoyaltyOffer {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    environment: row.environment as string,
    programId: (row.program_id as string | null) ?? null,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null) ?? null,
    offerType: row.offer_type as OfferType,
    offerValue: Number(row.offer_value),
    maxDiscount: row.max_discount != null ? Number(row.max_discount) : null,
    minPurchase: row.min_purchase != null ? Number(row.min_purchase) : null,
    channel: row.channel as string,
    placement: row.placement as string,
    status: row.status as LoyaltyOffer['status'],
    priority: Number(row.priority),
    stackingMode: row.stacking_mode as LoyaltyOffer['stackingMode'],
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    budgetTotal: row.budget_total != null ? Number(row.budget_total) : null,
    budgetSpent: Number(row.budget_spent ?? 0),
    maxRedemptions: row.max_redemptions != null ? Number(row.max_redemptions) : null,
    redemptionCount: Number(row.redemption_count ?? 0),
    frequencyCapHours: row.frequency_cap_hours != null ? Number(row.frequency_cap_hours) : null,
    audienceId: (row.audience_id as string | null) ?? null,
    requiredTierSlug: (row.required_tier_slug as string | null) ?? null,
    eligibilityRules: (row.eligibility_rules as unknown[]) ?? [],
    personalization: (row.personalization as Record<string, unknown>) ?? {},
    tags: (row.tags as string[]) ?? [],
    expectedLift: Number(row.expected_lift ?? 0),
    marginImpact: Number(row.margin_impact ?? 0),
    propensityWeight: Number(row.propensity_weight ?? 1),
    imageUrl: (row.image_url as string | null) ?? null,
    thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
    termsAndConditions: (row.terms_and_conditions as string | null) ?? null,
    ctaParams: (row.cta_params as LoyaltyOffer['ctaParams']) ?? [],
    redemptionType: (row.redemption_type as LoyaltyOffer['redemptionType']) ?? 'auto',
    redemptionInstructions: (row.redemption_instructions as string | null) ?? null,
    targetIndustry: (row.target_industry as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function fetchOffers(tenantId: string, environment: string): Promise<LoyaltyOffer[]> {
  const { data, error } = await supabase.rpc('list_loyalty_offers', {
    p_tenant_id: tenantId,
    p_environment: environment,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => mapOffer(r));
}

export async function saveOffer(input: {
  tenantId: string;
  environment: string;
  id?: string;
  programId?: string | null;
  name: string;
  slug: string;
  description?: string;
  offerType: OfferType;
  offerValue: number;
  maxDiscount?: number | null;
  minPurchase?: number | null;
  channel: string;
  placement: string;
  status: LoyaltyOffer['status'];
  priority: number;
  stackingMode: LoyaltyOffer['stackingMode'];
  startsAt?: string | null;
  endsAt?: string | null;
  budgetTotal?: number | null;
  maxRedemptions?: number | null;
  frequencyCapHours?: number | null;
  requiredTierSlug?: string | null;
  audienceId?: string | null;
  eligibilityRules?: unknown[];
  tags?: string[];
  expectedLift?: number;
  marginImpact?: number;
  propensityWeight?: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  termsAndConditions?: string | null;
  ctaParams?: LoyaltyOffer['ctaParams'];
  redemptionType?: LoyaltyOffer['redemptionType'];
  redemptionInstructions?: string | null;
  targetIndustry?: string | null;
  /** previous values, used to record a field-level diff in the audit log */
  previous?: Partial<LoyaltyOffer>;
}): Promise<string> {
  const payload = {
    program_id: input.programId ?? null,
    name: input.name,
    slug: input.slug,
    description: input.description ?? '',
    offer_type: input.offerType,
    offer_value: input.offerValue,
    max_discount: input.maxDiscount ?? null,
    min_purchase: input.minPurchase ?? null,
    channel: input.channel,
    placement: input.placement,
    status: input.status,
    priority: input.priority,
    stacking_mode: input.stackingMode,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
    budget_total: input.budgetTotal ?? null,
    max_redemptions: input.maxRedemptions ?? null,
    frequency_cap_hours: input.frequencyCapHours ?? null,
    required_tier_slug: input.requiredTierSlug ?? '',
    audience_id: input.audienceId ?? null,
    tags: input.tags ?? [],
    expected_lift: input.expectedLift ?? 0,
    margin_impact: input.marginImpact ?? 0,
    propensity_weight: input.propensityWeight ?? 1,
    eligibility_rules: input.eligibilityRules ?? [],
    personalization: {},
    image_url: input.imageUrl ?? null,
    thumbnail_url: input.thumbnailUrl ?? null,
    terms_and_conditions: input.termsAndConditions ?? null,
    cta_params: input.ctaParams ?? [],
    redemption_type: input.redemptionType ?? 'auto',
    redemption_instructions: input.redemptionInstructions ?? null,
    target_industry: input.targetIndustry ?? null,
  };

  const { data, error } = await supabase.rpc('upsert_loyalty_offer', {
    p_tenant_id: input.tenantId,
    p_environment: input.environment,
    p_id: input.id ?? null,
    p_payload: payload,
  });
  if (error) throw error;

  // Record exactly what changed so the Activity Log can show field-level diffs
  const changes = input.previous
    ? diffChanges(input.previous as Record<string, unknown>, {
        name: input.name,
        slug: input.slug,
        description: input.description ?? '',
        offerType: input.offerType,
        offerValue: input.offerValue,
        maxDiscount: input.maxDiscount ?? null,
        minPurchase: input.minPurchase ?? null,
        channel: input.channel,
        placement: input.placement,
        status: input.status,
        priority: input.priority,
        stackingMode: input.stackingMode,
        budgetTotal: input.budgetTotal ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        frequencyCapHours: input.frequencyCapHours ?? null,
        requiredTierSlug: input.requiredTierSlug ?? null,
        audienceId: input.audienceId ?? null,
        redemptionType: input.redemptionType ?? 'auto',
        targetIndustry: input.targetIndustry ?? null,
      })
    : undefined;

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: input.id ? 'update' : 'create',
    resourceType: 'loyalty_offer',
    resourceId: data as string,
    resourceName: input.name,
    summary: input.id
      ? `Updated offer “${input.name}”${changes?.length ? ` — ${changes.length} field(s)` : ''}`
      : `Created offer “${input.name}”`,
    changes,
  });

  return data as string;
}

/** A live offer has edits that were never pushed to the published version. */
export function needsRepublish(offer: Pick<LoyaltyOffer, 'status' | 'publishedAt' | 'updatedAt'>): boolean {
  if (offer.status !== 'active' || !offer.publishedAt) return false;
  // 1s tolerance — publishing stamps published_at and updated_at together
  return new Date(offer.updatedAt).getTime() - new Date(offer.publishedAt).getTime() > 1000;
}

export async function deleteOffer(tenantId: string, environment: string, id: string, name: string): Promise<void> {
  const { error } = await supabase.from('loyalty_offers').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) throw error;
  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'loyalty_offer',
    resourceId: id,
    resourceName: name,
  });
}

export async function clearAllOffers(tenantId: string, environment: string): Promise<void> {
  await supabase.from('loyalty_offers').delete().eq('tenant_id', tenantId).eq('environment', environment);
}

/* ------------------------------------------------------------------ *
 * Surfaces — where an offer can be delivered and rendered.
 * Values must stay in sync with the CHECK constraints in
 * supabase/sql/66_offer_placements.sql
 * ------------------------------------------------------------------ */

export const OFFER_CHANNEL_GROUPS: Array<{
  group: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    group: 'Owned surfaces',
    options: [
      { value: 'website', label: 'Website' },
      { value: 'landing_page', label: 'Landing page' },
      { value: 'pwa', label: 'PWA / mobile app' },
      { value: 'form', label: 'Form' },
      { value: 'web', label: 'Web (legacy)' },
      { value: 'app', label: 'App (legacy)' },
    ],
  },
  {
    group: 'Messaging channels',
    options: [
      { value: 'email', label: 'Email' },
      { value: 'sms', label: 'SMS' },
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'rcs', label: 'RCS' },
      { value: 'push', label: 'Web push' },
      { value: 'in_app', label: 'In-app message' },
    ],
  },
  {
    group: 'Other',
    options: [
      { value: 'any', label: 'Any channel' },
      { value: 'pos', label: 'Point of sale' },
      { value: 'journey', label: 'Journey' },
    ],
  },
];

/** Placements valid for a given channel — keeps the two selects coherent. */
export const OFFER_PLACEMENTS_BY_CHANNEL: Record<string, Array<{ value: string; label: string }>> = {
  website: [
    { value: 'homepage', label: 'Homepage' },
    { value: 'website_banner', label: 'Site-wide banner' },
    { value: 'product_page', label: 'Product page' },
    { value: 'category_page', label: 'Category page' },
    { value: 'cart', label: 'Cart' },
    { value: 'checkout', label: 'Checkout' },
    { value: 'popup', label: 'Popup' },
    { value: 'exit_intent', label: 'Exit intent' },
  ],
  landing_page: [
    { value: 'landing_page_hero', label: 'Hero section' },
    { value: 'landing_page_inline', label: 'Inline block' },
    { value: 'popup', label: 'Popup' },
  ],
  pwa: [
    { value: 'pwa_home', label: 'App home' },
    { value: 'pwa_inbox', label: 'App inbox' },
    { value: 'in_app', label: 'In-app message' },
  ],
  form: [
    { value: 'form_inline', label: 'Inline in form' },
    { value: 'form_thankyou', label: 'Thank-you screen' },
  ],
  email: [{ value: 'email', label: 'Email body' }],
  sms: [{ value: 'sms', label: 'SMS body' }],
  whatsapp: [{ value: 'whatsapp', label: 'WhatsApp message' }],
  rcs: [{ value: 'rcs', label: 'RCS card' }],
  push: [{ value: 'push', label: 'Push notification' }],
  in_app: [{ value: 'in_app', label: 'In-app message' }],
};

const ALL_PLACEMENTS = [
  { value: 'any', label: 'Any placement' },
  ...Object.values(OFFER_PLACEMENTS_BY_CHANNEL).flat(),
];

export function placementOptionsForChannel(channel: string): Array<{ value: string; label: string }> {
  const specific = OFFER_PLACEMENTS_BY_CHANNEL[channel];
  if (!specific) return ALL_PLACEMENTS;
  // de-dupe by value, always allow "any"
  const seen = new Set<string>();
  return [{ value: 'any', label: 'Any placement' }, ...specific].filter((o) =>
    seen.has(o.value) ? false : (seen.add(o.value), true),
  );
}

export function offerChannelLabel(channel: string): string {
  for (const g of OFFER_CHANNEL_GROUPS) {
    const hit = g.options.find((o) => o.value === channel);
    if (hit) return hit.label;
  }
  return channel;
}

export function offerPlacementLabel(placement: string): string {
  const hit = ALL_PLACEMENTS.find((o) => o.value === placement);
  return hit ? hit.label : placement.replace(/_/g, ' ');
}

/* ------------------------------------------------------------------ *
 * Lifecycle — offers are created as `draft` and go `active` on publish.
 * `active` is surfaced everywhere in the UI as "Live" (the DB value stays
 * `active` because the decisioning partial index and offer-decisioning
 * logic key off it).
 * ------------------------------------------------------------------ */

export function offerStatusMeta(status: string): { label: string; chip: string; dot: string } {
  switch (status) {
    case 'active':
      return { label: 'Live', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    case 'scheduled':
      return { label: 'Scheduled', chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' };
    case 'paused':
      return { label: 'Paused', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
    case 'expired':
      return { label: 'Expired', chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' };
    default:
      return { label: 'Draft', chip: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
  }
}

/** Publish (or unpublish) many offers at once. */
export async function setOffersStatus(
  tenantId: string,
  environment: string,
  ids: string[],
  status: LoyaltyOffer['status'],
): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from('loyalty_offers')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;
  void logAudit({
    tenantId,
    environment,
    action: status === 'active' ? 'publish' : 'update',
    resourceType: 'loyalty_offer',
    resourceId: ids.join(','),
    resourceName: `${ids.length} offer(s) → ${status}`,
  });
}

/** Delete many offers at once. */
export async function deleteOffers(tenantId: string, environment: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from('loyalty_offers')
    .delete()
    .in('id', ids)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;
  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'loyalty_offer',
    resourceId: ids.join(','),
    resourceName: `${ids.length} offer(s)`,
  });
}

export function formatOfferValue(offer: Pick<LoyaltyOffer, 'offerType' | 'offerValue'>): string {
  switch (offer.offerType) {
    case 'discount_percent':
      return `${offer.offerValue}% off`;
    case 'discount_fixed':
    case 'cashback':
      return `₹${offer.offerValue}`;
    case 'points_bonus':
      return `${offer.offerValue}% bonus points`;
    case 'free_shipping':
      return 'Free shipping';
    case 'bogo':
      return 'BOGO';
    default:
      return String(offer.offerValue);
  }
}
