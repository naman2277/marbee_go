import { supabase } from './supabase';

/**
 * Offer eligibility — one rule model shared by the offer editor (to size an
 * audience before launch), the "Eligible customers" tab, and the Customer 360
 * page (to explain why a given profile does or doesn't qualify).
 */

export type EligibilityOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains'
  | 'is_true' | 'is_false'
  | 'is_set' | 'is_not_set';

export type EligibilityRule = {
  id: string;
  field: string;
  operator: EligibilityOperator;
  value: string;
};

export type OfferEligibility = {
  audienceId: string | null;
  requiredTierSlug: string | null;
  rules: EligibilityRule[];
  /** all rules must pass (AND) vs any (OR) */
  match: 'all' | 'any';
};

export const EMPTY_ELIGIBILITY: OfferEligibility = {
  audienceId: null,
  requiredTierSlug: null,
  rules: [],
  match: 'all',
};

type FieldKind = 'text' | 'number' | 'boolean' | 'date';

export type EligibilityField = {
  value: string;
  label: string;
  group: string;
  kind: FieldKind;
  /** column on public.customers, or a loyalty_members embed path */
  column: string;
  embed?: 'loyalty';
};

export const ELIGIBILITY_FIELDS: EligibilityField[] = [
  // Profile
  { value: 'city', label: 'City', group: 'Profile', kind: 'text', column: 'city' },
  { value: 'state', label: 'State', group: 'Profile', kind: 'text', column: 'state' },
  { value: 'country', label: 'Country', group: 'Profile', kind: 'text', column: 'country' },
  { value: 'pincode', label: 'Postal code', group: 'Profile', kind: 'text', column: 'pincode' },
  { value: 'gender', label: 'Gender', group: 'Profile', kind: 'text', column: 'gender' },
  { value: 'status', label: 'Profile status', group: 'Profile', kind: 'text', column: 'status' },
  { value: 'email', label: 'Email', group: 'Profile', kind: 'text', column: 'email' },
  { value: 'mobile', label: 'Mobile', group: 'Profile', kind: 'text', column: 'mobile' },
  { value: 'created_at', label: 'Customer since', group: 'Profile', kind: 'date', column: 'created_at' },
  // Consent
  { value: 'consent_email', label: 'Email consent', group: 'Consent', kind: 'boolean', column: 'consent_email' },
  { value: 'consent_sms', label: 'SMS consent', group: 'Consent', kind: 'boolean', column: 'consent_sms' },
  { value: 'consent_whatsapp', label: 'WhatsApp consent', group: 'Consent', kind: 'boolean', column: 'consent_whatsapp' },
  // Loyalty (joined via loyalty_members)
  { value: 'loyalty_points', label: 'Points balance', group: 'Loyalty', kind: 'number', column: 'points_balance', embed: 'loyalty' },
  { value: 'lifetime_points', label: 'Lifetime points', group: 'Loyalty', kind: 'number', column: 'lifetime_points', embed: 'loyalty' },
  { value: 'loyalty_status', label: 'Loyalty status', group: 'Loyalty', kind: 'text', column: 'status', embed: 'loyalty' },
];

export const FIELD_GROUPS = ['Profile', 'Consent', 'Loyalty'];

export function fieldDef(field: string): EligibilityField | undefined {
  return ELIGIBILITY_FIELDS.find((f) => f.value === field);
}

const OPERATORS_BY_KIND: Record<FieldKind, Array<{ value: EligibilityOperator; label: string }>> = {
  text: [
    { value: 'eq', label: 'is' },
    { value: 'neq', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'is_set', label: 'is set' },
    { value: 'is_not_set', label: 'is empty' },
  ],
  number: [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
  ],
  boolean: [
    { value: 'is_true', label: 'is yes' },
    { value: 'is_false', label: 'is no' },
  ],
  date: [
    { value: 'gte', label: 'on or after' },
    { value: 'lte', label: 'on or before' },
  ],
};

export function operatorsForField(field: string) {
  const def = fieldDef(field);
  return OPERATORS_BY_KIND[def?.kind ?? 'text'];
}

export function needsValue(op: EligibilityOperator): boolean {
  return !['is_true', 'is_false', 'is_set', 'is_not_set'].includes(op);
}

export function newRule(): EligibilityRule {
  return {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    field: 'city',
    operator: 'eq',
    value: '',
  };
}

/** Human summary of a rule, used in the editor + Customer 360 explanation. */
export function describeRule(rule: EligibilityRule): string {
  const def = fieldDef(rule.field);
  const label = def?.label ?? rule.field;
  const op = operatorsForField(rule.field).find((o) => o.value === rule.operator)?.label ?? rule.operator;
  return needsValue(rule.operator) ? `${label} ${op} “${rule.value}”` : `${label} ${op}`;
}

/* ------------------------------------------------------------------ *
 * Server-side counting — builds a PostgREST query from the rules.
 * ------------------------------------------------------------------ */

function applyRule(query: any, rule: EligibilityRule) {
  const def = fieldDef(rule.field);
  if (!def) return query;
  const col = def.embed === 'loyalty' ? `loyalty_members.${def.column}` : def.column;
  const v = rule.value;

  switch (rule.operator) {
    case 'eq': return query.eq(col, v);
    case 'neq': return query.neq(col, v);
    case 'gt': return query.gt(col, v);
    case 'gte': return query.gte(col, v);
    case 'lt': return query.lt(col, v);
    case 'lte': return query.lte(col, v);
    case 'contains': return query.ilike(col, `%${v}%`);
    case 'is_true': return query.eq(col, true);
    case 'is_false': return query.eq(col, false);
    case 'is_set': return query.not(col, 'is', null);
    case 'is_not_set': return query.is(col, null);
    default: return query;
  }
}

function buildQuery(
  tenantId: string,
  environment: string,
  criteria: OfferEligibility,
  select: string,
  opts?: { count?: 'exact'; head?: boolean; limit?: number },
) {
  const usesLoyalty =
    criteria.rules.some((r) => fieldDef(r.field)?.embed === 'loyalty') || Boolean(criteria.requiredTierSlug);

  const selectClause = usesLoyalty
    ? `${select}, loyalty_members!inner(points_balance, lifetime_points, status, loyalty_tiers${criteria.requiredTierSlug ? '!inner' : ''}(slug, name))`
    : select;

  let query = supabase
    .from('customers')
    .select(selectClause, opts?.count ? { count: opts.count, head: opts.head } : undefined)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (criteria.requiredTierSlug) {
    query = query.eq('loyalty_members.loyalty_tiers.slug', criteria.requiredTierSlug);
  }

  // NOTE: PostgREST chains filters as AND. For 'any' we fall back to counting
  // each rule separately is not equivalent, so 'any' is evaluated client-side
  // on a bounded sample instead (see fetchEligibleCustomers).
  if (criteria.match === 'all') {
    for (const rule of criteria.rules) query = applyRule(query, rule);
  }

  if (opts?.limit) query = query.limit(opts.limit);
  return query;
}

export type EligibleCustomer = {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  loyaltyPoints: number | null;
  loyaltyTier: string | null;
};

/** Exact count of customers matching the criteria. */
export async function countEligibleCustomers(
  tenantId: string,
  environment: string,
  criteria: OfferEligibility,
): Promise<number> {
  if (!tenantId) return 0;

  // 'any' (OR) can't be expressed by chained PostgREST filters — evaluate a
  // bounded sample client-side and report what we actually verified.
  if (criteria.match === 'any' && criteria.rules.length > 0) {
    const rows = await fetchEligibleCustomers(tenantId, environment, criteria, 1000);
    return rows.length;
  }

  const { count, error } = await buildQuery(tenantId, environment, criteria, 'id', {
    count: 'exact',
    head: true,
  });
  if (error) throw error;
  return count ?? 0;
}

/** Sample of matching customers, for the "who qualifies" preview list. */
export async function fetchEligibleCustomers(
  tenantId: string,
  environment: string,
  criteria: OfferEligibility,
  limit = 25,
): Promise<EligibleCustomer[]> {
  if (!tenantId) return [];

  const isAny = criteria.match === 'any' && criteria.rules.length > 0;
  const query = buildQuery(
    tenantId,
    environment,
    isAny ? { ...criteria, rules: [] } : criteria,
    'id, first_name, last_name, email, city, gender, status, pincode, state, country, mobile, consent_email, consent_sms, consent_whatsapp, created_at',
    { limit: isAny ? Math.max(limit, 1000) : limit },
  );

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as Record<string, any>[];
  if (isAny) {
    rows = rows.filter((r) => criteria.rules.some((rule) => matchesRule(rule, toContext(r))));
    rows = rows.slice(0, limit);
  }

  return rows.map((r) => {
    const lm = Array.isArray(r.loyalty_members) ? r.loyalty_members[0] : r.loyalty_members;
    const tier = lm && (Array.isArray(lm.loyalty_tiers) ? lm.loyalty_tiers[0] : lm.loyalty_tiers);
    return {
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Unnamed',
      email: r.email ?? null,
      city: r.city ?? null,
      loyaltyPoints: lm?.points_balance ?? null,
      loyaltyTier: tier?.name ?? null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Client-side evaluation — used on Customer 360 to show which offers a
 * specific profile qualifies for, and why.
 * ------------------------------------------------------------------ */

export type EligibilityContext = Record<string, unknown>;

function toContext(row: Record<string, any>): EligibilityContext {
  const lm = Array.isArray(row.loyalty_members) ? row.loyalty_members[0] : row.loyalty_members;
  return {
    ...row,
    loyalty_points: lm?.points_balance ?? null,
    lifetime_points: lm?.lifetime_points ?? null,
    loyalty_status: lm?.status ?? null,
  };
}

export function matchesRule(rule: EligibilityRule, ctx: EligibilityContext): boolean {
  const raw = ctx[rule.field];
  const def = fieldDef(rule.field);
  const kind = def?.kind ?? 'text';

  switch (rule.operator) {
    case 'is_set': return raw != null && raw !== '';
    case 'is_not_set': return raw == null || raw === '';
    case 'is_true': return raw === true;
    case 'is_false': return raw === false;
    default: break;
  }

  if (raw == null) return false;

  if (kind === 'number') {
    const a = Number(raw);
    const b = Number(rule.value);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    switch (rule.operator) {
      case 'eq': return a === b;
      case 'neq': return a !== b;
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
      default: return false;
    }
  }

  if (kind === 'date') {
    const a = new Date(String(raw)).getTime();
    const b = new Date(rule.value).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return rule.operator === 'gte' ? a >= b : a <= b;
  }

  const a = String(raw).toLowerCase();
  const b = String(rule.value).toLowerCase();
  switch (rule.operator) {
    case 'eq': return a === b;
    case 'neq': return a !== b;
    case 'contains': return a.includes(b);
    default: return false;
  }
}

export type EligibilityVerdict = {
  eligible: boolean;
  passed: string[];
  failed: string[];
};

/** Explain whether a customer qualifies — drives the Customer 360 Offers tab. */
export function evaluateEligibility(
  criteria: OfferEligibility,
  ctx: EligibilityContext,
): EligibilityVerdict {
  const passed: string[] = [];
  const failed: string[] = [];

  if (criteria.requiredTierSlug) {
    const tier = String(ctx.loyalty_tier_slug ?? ctx.loyalty_tier ?? '').toLowerCase();
    const want = criteria.requiredTierSlug.toLowerCase();
    (tier === want ? passed : failed).push(`Loyalty tier is “${criteria.requiredTierSlug}”`);
  }

  for (const rule of criteria.rules) {
    (matchesRule(rule, ctx) ? passed : failed).push(describeRule(rule));
  }

  if (passed.length === 0 && failed.length === 0) {
    return { eligible: true, passed: ['Open to all customers'], failed: [] };
  }

  const eligible = criteria.match === 'any' && criteria.rules.length > 0
    ? failed.length === 0 || passed.length > 0
    : failed.length === 0;

  return { eligible, passed, failed };
}

/** Read the eligibility block off a stored offer row. */
export function eligibilityFromOffer(offer: {
  audienceId: string | null;
  requiredTierSlug: string | null;
  eligibilityRules: unknown[];
}): OfferEligibility {
  const raw = Array.isArray(offer.eligibilityRules) ? offer.eligibilityRules : [];
  // rules are stored as [{ match }, ...rules] or plain rule objects
  const meta = raw.find((r: any) => r && typeof r === 'object' && 'match' in r) as { match?: 'all' | 'any' } | undefined;
  const rules = raw.filter((r: any) => r && typeof r === 'object' && 'field' in r) as EligibilityRule[];
  return {
    audienceId: offer.audienceId,
    requiredTierSlug: offer.requiredTierSlug,
    rules,
    match: meta?.match ?? 'all',
  };
}

/** Serialise back into the offer's eligibility_rules JSONB column. */
export function eligibilityToRules(criteria: OfferEligibility): unknown[] {
  return [{ match: criteria.match }, ...criteria.rules];
}
