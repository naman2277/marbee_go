import { supabase } from './supabase';
import type { Customer, CustomerIdentity, WebPushSubscriber, Exclusion } from '@marbee/shared';
import { logAudit } from './audit';
import {
  formatJourneyTimelineSubtitle,
  formatJourneyTimelineTitle,
} from './customer-journeys';

export type CustomerRow = Customer;

export type CustomerEvent = {
  id: string;
  event_type: string;
  timestamp: string;
  source: string | null;
  properties: Record<string, unknown>;
};

export type CustomerEngagement = {
  id: string;
  channel: string;
  message_id: string;
  event: string;
  timestamp: string;
};

export type CustomerFormSubmission = {
  id: string;
  form_id: string;
  data: Record<string, unknown>;
  created_at: string;
  forms?: { name: string; slug: string } | null;
};

export type CustomerJourneyInstance = {
  id: string;
  journey_id: string;
  status: string;
  entered_at: string;
  completed_at: string | null;
  current_node_id: string | null;
  journeys?: { id: string; name: string; status?: string } | null;
};

export type TimelineItem =
  | { kind: 'event'; id: string; timestamp: string; title: string; subtitle?: string; meta?: string; properties?: Record<string, unknown> }
  | { kind: 'engagement'; id: string; timestamp: string; title: string; subtitle?: string; meta?: string }
  | { kind: 'form'; id: string; timestamp: string; title: string; subtitle?: string; meta?: string }
  | { kind: 'journey'; id: string; timestamp: string; title: string; subtitle?: string; meta?: string };

export type Customer360Metrics = {
  totalEvents: number;
  totalEngagements: number;
  messagesSent: number;
  messagesClicked: number;
  messagesConverted: number;
  engagementRate: number;
  formSubmissions: number;
  activeJourneys: number;
  identityCount: number;
  channelCount: number;
  lastActivityAt: string | null;
  estimatedValue: number;
  loyaltyMember: boolean;
  loyaltyPoints: number;
  loyaltyTier: string | null;
};

export type Customer360 = {
  customer: CustomerRow;
  identities: CustomerIdentity[];
  subscribers: WebPushSubscriber[];
  exclusions: Exclusion[];
  events: CustomerEvent[];
  engagements: CustomerEngagement[];
  formSubmissions: CustomerFormSubmission[];
  journeyInstances: CustomerJourneyInstance[];
  timeline: TimelineItem[];
  metrics: Customer360Metrics;
};

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function formatLocation(location: Record<string, unknown> | null): string | null {
  if (!location || !Object.keys(location).length) return null;
  const city = location.city ?? location.City;
  const country = location.country ?? location.Country;
  if (city && country) return `${city}, ${country}`;
  return String(city ?? country ?? JSON.stringify(location));
}

export function buildCustomerFullName(
  parts: Pick<Customer, 'title' | 'first_name' | 'middle_name' | 'last_name'>,
): string | null {
  const nameParts = [parts.first_name, parts.middle_name, parts.last_name]
    .map((p) => p?.trim())
    .filter(Boolean);
  if (!nameParts.length) return null;
  const full = nameParts.join(' ');
  const title = parts.title?.trim();
  return title ? `${title} ${full}` : full;
}

export function getCustomerDisplayName(
  customer: Pick<Customer, 'email' | 'mobile' | 'title' | 'first_name' | 'middle_name' | 'last_name'>,
): string {
  return (
    buildCustomerFullName(customer) ||
    customer.email ||
    customer.mobile ||
    'Unknown customer'
  );
}

export function getCustomerInitials(
  customer: Pick<Customer, 'email' | 'first_name' | 'last_name'>,
): string {
  const first = customer.first_name?.trim();
  const last = customer.last_name?.trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (customer.email) return customer.email.slice(0, 2).toUpperCase();
  return '?';
}

export function getCustomerAvatarColor(id: string): string {
  const palette = [
    'from-violet-500 to-purple-600',
    'from-brand-500 to-indigo-600',
    'from-cyan-500 to-teal-600',
    'from-amber-400 to-orange-500',
    'from-pink-500 to-rose-600',
    'from-emerald-500 to-green-600',
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % palette.length;
  return palette[hash];
}

function customerSearchFilter(q: string): string {
  return [
    `email.ilike.%${q}%`,
    `mobile.ilike.%${q}%`,
    `first_name.ilike.%${q}%`,
    `middle_name.ilike.%${q}%`,
    `last_name.ilike.%${q}%`,
    `title.ilike.%${q}%`,
  ].join(',');
}

export type CustomerFilters = {
  search?: string;
  status?: string;
  loyaltyTier?: string;
  country?: string;
  city?: string;
  consentEmail?: boolean;
  consentSms?: boolean;
  consentWebPush?: boolean;
  consentWhatsapp?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  loyaltyMember?: boolean;
};

function applyCustomerFilters(
  query: ReturnType<typeof supabase.from<'customers'>>,
  filters: CustomerFilters,
) {
  let q = query;
  if (filters.search?.trim()) {
    q = q.or(customerSearchFilter(filters.search.trim())) as typeof q;
  }
  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status) as typeof q;
  }
  if (filters.loyaltyTier && filters.loyaltyTier !== 'all') {
    q = q.eq('loyalty_tier_slug', filters.loyaltyTier) as typeof q;
  }
  if (filters.country && filters.country !== 'all') {
    q = q.eq('country', filters.country) as typeof q;
  }
  if (filters.city && filters.city !== 'all') {
    q = q.eq('city', filters.city) as typeof q;
  }
  if (filters.consentEmail === true) q = q.eq('consent_email', true) as typeof q;
  if (filters.consentEmail === false) q = q.eq('consent_email', false) as typeof q;
  if (filters.consentSms === true) q = q.eq('consent_sms', true) as typeof q;
  if (filters.consentSms === false) q = q.eq('consent_sms', false) as typeof q;
  if (filters.consentWebPush === true) q = q.eq('consent_web_push', true) as typeof q;
  if (filters.consentWebPush === false) q = q.eq('consent_web_push', false) as typeof q;
  if (filters.consentWhatsapp === true) q = q.eq('consent_whatsapp', true) as typeof q;
  if (filters.consentWhatsapp === false) q = q.eq('consent_whatsapp', false) as typeof q;
  if (filters.hasEmail === true) q = q.not('email', 'is', null) as typeof q;
  if (filters.hasPhone === true) q = q.not('mobile', 'is', null) as typeof q;
  if (filters.loyaltyMember === true) q = q.eq('loyalty_member', true) as typeof q;
  if (filters.loyaltyMember === false) q = q.eq('loyalty_member', false) as typeof q;
  return q;
}

export async function fetchCustomers(
  tenantId: string,
  environment: string,
  search?: string,
  limit = 100,
  page = 0,
  filters?: CustomerFilters,
): Promise<CustomerRow[]> {
  const from = Math.max(0, page) * limit;
  let query = supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false })
    .range(from, from + limit - 1);

  const mergedFilters: CustomerFilters = { ...filters, search };
  query = applyCustomerFilters(query, mergedFilters) as typeof query;

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CustomerRow[];
}

export async function fetchCustomersCount(
  tenantId: string,
  environment: string,
  search?: string,
  filters?: CustomerFilters,
): Promise<number> {
  let query = supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  const mergedFilters: CustomerFilters = { ...filters, search };
  query = applyCustomerFilters(query, mergedFilters) as typeof query;

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchCustomerFilterOptions(
  tenantId: string,
  environment: string,
): Promise<{ countries: string[]; cities: string[]; loyaltyTiers: { slug: string; name: string }[] }> {
  const { data: geo } = await supabase
    .from('customers')
    .select('country, city')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .limit(5000);

  const countries = [...new Set((geo ?? []).map((r) => r.country).filter(Boolean) as string[])].sort();
  const cities = [...new Set((geo ?? []).map((r) => r.city).filter(Boolean) as string[])].sort();

  const { data: tiers } = await supabase
    .from('customers')
    .select('loyalty_tier_slug, loyalty_tier_name')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .not('loyalty_tier_slug', 'is', null)
    .limit(5000);

  const tierMap = new Map<string, string>();
  for (const r of tiers ?? []) {
    if (r.loyalty_tier_slug) tierMap.set(r.loyalty_tier_slug, r.loyalty_tier_name ?? r.loyalty_tier_slug);
  }
  const loyaltyTiers = [...tierMap.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));

  return { countries, cities, loyaltyTiers };
}

export async function fetchCustomerListSummary(
  tenantId: string,
  environment: string,
): Promise<{ total: number; active: number; withEvents: number }> {
  const { count: total } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  const { count: active } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('status', 'active');

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentEvents } = await supabase
    .from('events')
    .select('customer_id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .gte('timestamp', weekAgo)
    .not('customer_id', 'is', null);

  const withEvents = new Set(recentEvents?.map((e) => e.customer_id)).size;

  return { total: total ?? 0, active: active ?? 0, withEvents };
}

export async function fetchCustomer360(
  customerId: string,
  tenantId: string,
  environment: string,
): Promise<Customer360 | null> {
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .maybeSingle();

  if (error) throw error;
  if (!customer) return null;

  const [
    identitiesRes,
    subscribersRes,
    exclusionsRes,
    eventsRes,
    engagementRes,
    submissionsRes,
    journeysRes,
  ] = await Promise.all([
    supabase
      .from('customer_identities')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('web_push_subscribers')
      .select('*')
      .eq('customer_id', customerId)
      .order('last_seen', { ascending: false, nullsFirst: false }),
    supabase
      .from('exclusions')
      .select('*')
      .eq('customer_id', customerId)
      .order('start_date', { ascending: false }),
    supabase
      .from('events')
      .select('id, event_type, timestamp, source, properties')
      .eq('customer_id', customerId)
      .order('timestamp', { ascending: false })
      .limit(50),
    supabase
      .from('engagement_log')
      .select('id, channel, message_id, event, timestamp')
      .eq('customer_id', customerId)
      .order('timestamp', { ascending: false })
      .limit(50),
    supabase
      .from('form_submissions')
      .select('id, form_id, data, created_at, forms(name, slug)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('journey_instances')
      .select('id, journey_id, status, entered_at, completed_at, current_node_id, journeys(id, name, status)')
      .eq('customer_id', customerId)
      .order('entered_at', { ascending: false })
      .limit(20),
  ]);

  const events = (eventsRes.data ?? []) as CustomerEvent[];
  const engagements = (engagementRes.data ?? []) as CustomerEngagement[];
  const formSubmissions = (submissionsRes.data ?? []).map((row) => ({
    ...row,
    forms: Array.isArray(row.forms) ? row.forms[0] ?? null : row.forms,
  })) as CustomerFormSubmission[];
  const journeyInstances = (journeysRes.data ?? []).map((row) => ({
    ...row,
    journeys: Array.isArray(row.journeys) ? row.journeys[0] ?? null : row.journeys,
  })) as CustomerJourneyInstance[];

  const timeline = buildTimeline(events, engagements, formSubmissions, journeyInstances);
  const metrics = computeMetrics(
    events,
    engagements,
    formSubmissions,
    journeyInstances,
    identitiesRes.data ?? [],
    subscribersRes.data ?? [],
    customer as CustomerRow,
  );

  return {
    customer: customer as CustomerRow,
    identities: (identitiesRes.data ?? []) as CustomerIdentity[],
    subscribers: (subscribersRes.data ?? []) as WebPushSubscriber[],
    exclusions: (exclusionsRes.data ?? []) as Exclusion[],
    events,
    engagements,
    formSubmissions,
    journeyInstances,
    timeline,
    metrics,
  };
}

function buildTimeline(
  events: CustomerEvent[],
  engagements: CustomerEngagement[],
  formSubmissions: CustomerFormSubmission[],
  journeyInstances: CustomerJourneyInstance[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...events.map((e) => ({
      kind: 'event' as const,
      id: e.id,
      timestamp: e.timestamp,
      title: formatEventType(e.event_type),
      subtitle: e.source ?? undefined,
      meta: summarizeProperties(e.properties),
      properties: e.properties,
    })),
    ...engagements.map((e) => ({
      kind: 'engagement' as const,
      id: e.id,
      timestamp: e.timestamp,
      title: `${e.channel.replace('_', ' ')} · ${e.event}`,
      subtitle: e.message_id,
    })),
    ...formSubmissions.map((s) => ({
      kind: 'form' as const,
      id: s.id,
      timestamp: s.created_at,
      title: `Form submitted · ${s.forms?.name ?? 'Unknown form'}`,
      subtitle: summarizeProperties(s.data),
    })),
    ...journeyInstances.map((j) => ({
      kind: 'journey' as const,
      id: j.id,
      timestamp: j.entered_at,
      title: formatJourneyTimelineTitle(j),
      subtitle: formatJourneyTimelineSubtitle(j),
      meta: j.completed_at ? `Completed ${new Date(j.completed_at).toLocaleDateString()}` : undefined,
    })),
  ];

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function computeMetrics(
  events: CustomerEvent[],
  engagements: CustomerEngagement[],
  formSubmissions: CustomerFormSubmission[],
  journeyInstances: CustomerJourneyInstance[],
  identities: CustomerIdentity[],
  subscribers: WebPushSubscriber[],
  customer: CustomerRow,
): Customer360Metrics {
  const messagesSent = engagements.filter((e) => e.event === 'sent').length;
  const messagesClicked = engagements.filter((e) => e.event === 'clicked' || e.event === 'opened').length;
  const messagesConverted = engagements.filter((e) => e.event === 'converted').length;
  const engagementRate = messagesSent > 0 ? (messagesClicked / messagesSent) * 100 : 0;

  let estimatedValue = 0;
  for (const e of events) {
    if (e.event_type.includes('purchase') || e.event_type.includes('order')) {
      const val = e.properties.value ?? e.properties.cart_value ?? e.properties.amount;
      if (typeof val === 'number') estimatedValue += val;
    }
  }

  const timestamps = [
    ...events.map((e) => e.timestamp),
    ...engagements.map((e) => e.timestamp),
    ...formSubmissions.map((s) => s.created_at),
    ...subscribers.map((s) => s.last_seen).filter(Boolean) as string[],
  ];
  const lastActivityAt = timestamps.length
    ? timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  const activeChannels = new Set(subscribers.filter((s) => s.subscription_status === 'active').map(() => 'web_push'));

  return {
    totalEvents: events.length,
    totalEngagements: engagements.length,
    messagesSent,
    messagesClicked,
    messagesConverted,
    engagementRate,
    formSubmissions: formSubmissions.length,
    activeJourneys: journeyInstances.filter((j) => ['entered', 'active', 'waiting'].includes(j.status)).length,
    identityCount: identities.length,
    channelCount: activeChannels.size,
    lastActivityAt,
    estimatedValue,
    loyaltyMember: Boolean(customer.loyalty_member),
    loyaltyPoints: Number(customer.loyalty_points_balance ?? 0),
    loyaltyTier: customer.loyalty_tier_name ?? customer.loyalty_tier_slug ?? null,
  };
}

export function formatEventType(eventType: string): string {
  return eventType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function summarizeProperties(props: Record<string, unknown>): string | undefined {
  const keys = Object.keys(props);
  if (!keys.length) return undefined;
  const preview = keys.slice(0, 3).map((k) => {
    const v = props[k];
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `${k}: ${val.length > 24 ? `${val.slice(0, 24)}…` : val}`;
  });
  return preview.join(' · ');
}

export function formatCustomerLocation(
  customer: Pick<Customer, 'city' | 'state' | 'country' | 'pincode' | 'location'>,
): string | null {
  const parts = [customer.city, customer.state, customer.country, customer.pincode]
    .map((p) => p?.trim())
    .filter(Boolean);
  if (parts.length) return parts.join(', ');
  return formatLocation(parseJsonObject(customer.location));
}

export function formatCustomerMobile(
  customer: Pick<Customer, 'mobile_country_code' | 'mobile'>,
): string | null {
  if (!customer.mobile) return null;
  const code = customer.mobile_country_code?.trim();
  return code ? `${code} ${customer.mobile}` : customer.mobile;
}

export function getChannelConsentFlags(
  customer: Pick<
    Customer,
    'consent_email' | 'consent_sms' | 'consent_web_push' | 'consent_whatsapp' | 'global_consent'
  >,
): Array<{ channel: string; enabled: boolean }> {
  return [
    { channel: 'Email', enabled: Boolean(customer.consent_email) },
    { channel: 'SMS', enabled: Boolean(customer.consent_sms) },
    { channel: 'Web Push', enabled: Boolean(customer.consent_web_push) },
    { channel: 'WhatsApp', enabled: Boolean(customer.consent_whatsapp) },
  ];
}

export function getLoyaltyFlags(
  customer: Pick<
    Customer,
    | 'loyalty_member'
    | 'loyalty_program_name'
    | 'loyalty_tier_slug'
    | 'loyalty_tier_name'
    | 'loyalty_points_balance'
    | 'loyalty_lifetime_points'
    | 'loyalty_status'
    | 'loyalty_enrolled_at'
  >,
): Array<{ label: string; value: string; highlight?: boolean }> {
  if (!customer.loyalty_member) {
    return [{ label: 'Membership', value: 'Not enrolled', highlight: false }];
  }
  return [
    { label: 'Program', value: customer.loyalty_program_name ?? '—', highlight: true },
    { label: 'Tier', value: customer.loyalty_tier_name ?? customer.loyalty_tier_slug ?? '—', highlight: true },
    { label: 'Points balance', value: String(customer.loyalty_points_balance ?? 0), highlight: true },
    { label: 'Lifetime points', value: String(customer.loyalty_lifetime_points ?? 0) },
    { label: 'Status', value: customer.loyalty_status ?? 'active' },
    {
      label: 'Enrolled',
      value: customer.loyalty_enrolled_at
        ? new Date(customer.loyalty_enrolled_at).toLocaleDateString()
        : '—',
    },
  ];
}

export async function createCustomer(
  tenantId: string,
  environment: string,
  input: {
    title?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    email?: string;
    mobile?: string;
  },
): Promise<{ error?: string }> {
  const title = input.title?.trim() || null;
  const first_name = input.first_name?.trim() || null;
  const middle_name = input.middle_name?.trim() || null;
  const last_name = input.last_name?.trim() || null;

  if (!first_name && !input.email?.trim() && !input.mobile?.trim()) {
    return { error: 'Enter at least a first name or contact detail' };
  }

  const { data, error } = await supabase.from('customers').insert({
    tenant_id: tenantId,
    environment,
    title,
    first_name,
    middle_name,
    last_name,
    email: input.email?.trim() || null,
    mobile: input.mobile?.trim() || null,
    status: 'active',
  }).select('id').single();
  if (error) return { error: error.message };
  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'customer',
    resourceId: data?.id,
    resourceName: [first_name, last_name].filter(Boolean).join(' ') || input.email || 'Customer',
  });
  return {};
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatCurrency(value: number, currency = 'INR'): string {
  if (!value) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}
