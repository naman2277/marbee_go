/**
 * Semantic catalog — the single source of truth the cohort builder and the AI
 * agent are allowed to reference.
 *
 * Everything selectable in the UI, and everything the agent may put into IR,
 * comes from here. If a name is not in the catalog the validator rejects it,
 * which is what stops the agent from inventing events or properties.
 */
import { supabase } from '@/lib/supabase';
import type { SchemaWithFields } from '@/lib/fetch-schemas';
import type { FieldType, SchemaFilterField } from '@/lib/schema-filters';
import { buildAudienceFilterFields } from '@/lib/audiences';
import { humanizeFieldName } from '@/lib/schema-filters';

export type CatalogProperty = {
  key: string;
  label: string;
  type: FieldType;
  /** Grouping used by the field picker. */
  group: string;
  description?: string;
  /** Alternative phrasings the AI matcher scores against. */
  synonyms: string[];
  /** Distinct values seen in the sample, for enum-ish fields. */
  sampleValues?: string[];
  /** 0–1 — share of sampled rows where the property is set. */
  coverage?: number;
  /** Which entity the property hangs off. */
  entity: 'user' | 'account' | 'event';
  /** True for derived/joined columns rather than raw table columns. */
  derived?: boolean;
  getValue?: (row: Record<string, unknown>) => unknown;
};

export type CatalogEvent = {
  name: string;
  label: string;
  description?: string;
  synonyms: string[];
  /** Occurrences in the sampled window. */
  volume: number;
  /** Distinct users who performed it in the sample. */
  uniqueUsers: number;
  lastSeenAt?: string;
  firstSeenAt?: string;
  /** Property keys seen inside `properties` on this event. */
  properties: CatalogProperty[];
  source: 'events' | 'engagement' | 'web';
};

export type CatalogMetric = {
  key: string;
  label: string;
  description: string;
  synonyms: string[];
  unit?: 'currency' | 'count' | 'days' | 'score' | 'percent';
  /** Reads the metric off an already-enriched row. */
  getValue: (row: Record<string, unknown>) => number;
};

export type CatalogCohortRef = {
  slug: string;
  name: string;
  memberCount: number;
};

export type SemanticCatalog = {
  schemaSlug: string;
  entityLabel: string;
  properties: CatalogProperty[];
  events: CatalogEvent[];
  metrics: CatalogMetric[];
  cohorts: CatalogCohortRef[];
  /** Total rows in the sample the preview evaluates against. */
  sampleSize: number;
  /** True when the sample is capped and counts are estimates. */
  sampled: boolean;
  /** Most recent event timestamp seen — surfaced as a freshness warning. */
  freshestEventAt?: string;
  builtAt: string;
};

export const EMPTY_CATALOG: SemanticCatalog = {
  schemaSlug: 'customer',
  entityLabel: 'Customer',
  properties: [],
  events: [],
  metrics: [],
  cohorts: [],
  sampleSize: 0,
  sampled: false,
  builtAt: new Date(0).toISOString(),
};

/* ------------------------------------------------------------------ *
 * Synonyms — how the agent maps natural language onto real fields
 * ------------------------------------------------------------------ */

const PROPERTY_SYNONYMS: Record<string, string[]> = {
  email: ['email address', 'mail', 'e-mail'],
  mobile: ['phone', 'phone number', 'mobile number', 'msisdn', 'cell'],
  first_name: ['name', 'given name', 'forename'],
  last_name: ['surname', 'family name'],
  country: ['nation', 'region', 'geo', 'location'],
  city: ['town', 'locality'],
  state: ['province', 'region'],
  status: ['state', 'lifecycle', 'account status'],
  created_at: ['signup date', 'signed up', 'registered', 'joined', 'account created'],
  updated_at: ['last modified', 'last updated'],
  dob: ['birthday', 'date of birth', 'birth date', 'age'],
  gender: ['sex'],
  consent_email: ['email consent', 'email opt-in', 'email marketing consent', 'subscribed to email'],
  consent_sms: ['sms consent', 'sms opt-in', 'text consent'],
  consent_web_push: ['push consent', 'web push opt-in', 'push permission'],
  consent_whatsapp: ['whatsapp consent', 'whatsapp opt-in'],
  global_consent: ['marketing consent', 'overall consent', 'gdpr consent'],
  is_email_reachable: ['reachable by email', 'has valid email', 'emailable'],
  is_sms_reachable: ['reachable by sms', 'has valid phone', 'textable'],
  is_push_subscribed: ['push subscriber', 'subscribed to push'],
  last_event_at: ['last active', 'last seen', 'last activity', 'recency'],
  last_delivery_at: ['last message received', 'last delivery'],
  email_opened_7d: ['opened email', 'email open', 'engaged with email'],
  email_clicked_7d: ['clicked email', 'email click', 'clicked a link'],
};

const EVENT_SYNONYMS: Record<string, string[]> = {
  purchase: ['bought', 'order', 'checkout', 'transaction', 'converted'],
  checkout_completed: ['purchase', 'bought', 'order placed', 'converted'],
  add_to_cart: ['cart', 'added to basket'],
  pageview: ['page view', 'visited', 'browsed', 'viewed page'],
  signup: ['registered', 'sign up', 'created account'],
  login: ['signed in', 'log in', 'session start'],
  trial_started: ['started trial', 'began trial'],
  subscription_cancelled: ['cancelled', 'churned', 'unsubscribed from plan'],
};

function synonymsFor(map: Record<string, string[]>, key: string): string[] {
  const direct = map[key] ?? [];
  const humanized = humanizeFieldName(key).toLowerCase();
  const spaced = key.replace(/[._-]+/g, ' ');
  return [...new Set([...direct, humanized, spaced].filter((s) => s && s !== key))];
}

/* ------------------------------------------------------------------ *
 * Metrics — derived numbers the builder exposes as first-class filters
 * ------------------------------------------------------------------ */

function num(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysSince(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  if (!v) return Number.MAX_SAFE_INTEGER;
  const t = new Date(String(v)).getTime();
  if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export const BUILT_IN_METRICS: CatalogMetric[] = [
  {
    key: 'metric.events_7d',
    label: 'Events in last 7 days',
    description: 'Total tracked events for this customer in the past week.',
    synonyms: ['weekly activity', 'events this week', 'activity level'],
    unit: 'count',
    getValue: (row) => num(row, 'events_7d_count'),
  },
  {
    key: 'metric.events_30d',
    label: 'Events in last 30 days',
    description: 'Total tracked events for this customer in the past 30 days.',
    synonyms: ['monthly activity', 'events this month'],
    unit: 'count',
    getValue: (row) => num(row, 'events_30d_count'),
  },
  {
    key: 'metric.active_days_30d',
    label: 'Active days (30d)',
    description: 'Distinct days with at least one event in the last 30 days.',
    synonyms: ['active days', 'days active', 'usage intensity'],
    unit: 'count',
    getValue: (row) => num(row, 'active_days_30d'),
  },
  {
    key: 'metric.days_since_last_active',
    label: 'Days since last active',
    description: 'Recency — days since the customer last triggered any event.',
    synonyms: ['recency', 'dormancy', 'days inactive', 'last seen days ago'],
    unit: 'days',
    getValue: (row) => daysSince(row, 'last_event_at'),
  },
  {
    key: 'metric.days_since_signup',
    label: 'Days since signup',
    description: 'Account age in days.',
    synonyms: ['tenure', 'account age', 'customer age', 'how long a customer'],
    unit: 'days',
    getValue: (row) => daysSince(row, 'created_at'),
  },
  {
    key: 'metric.deliveries_30d',
    label: 'Messages received (30d)',
    description: 'Campaign or journey messages delivered in the last 30 days.',
    synonyms: ['messages sent', 'contact frequency', 'send pressure'],
    unit: 'count',
    getValue: (row) => num(row, 'deliveries_received_30d_count'),
  },
  {
    key: 'metric.engagement_score',
    label: 'Engagement score',
    description:
      'Blended 0–100 score from recency, event frequency and message engagement. Computed at preview time.',
    synonyms: ['engagement', 'health score', 'how engaged', 'activity score'],
    unit: 'score',
    getValue: (row) => num(row, 'engagement_score'),
  },
  {
    key: 'metric.subscriptions_active',
    label: 'Active subscriptions',
    description: 'Number of information services the customer is subscribed to.',
    synonyms: ['subscriptions', 'newsletters', 'services subscribed'],
    unit: 'count',
    getValue: (row) => num(row, 'active_subscription_count'),
  },
];

/**
 * Blended engagement score, computed on the enriched row. Kept here (not in the
 * evaluator) so the catalog owns the definition the explanation panel cites.
 */
export function computeEngagementScore(row: Record<string, unknown>): number {
  const recencyDays = daysSince(row, 'last_event_at');
  const recency = recencyDays > 365 ? 0 : Math.max(0, 40 - Math.min(40, recencyDays * 1.5));
  const frequency = Math.min(30, num(row, 'events_30d_count') * 1.5);
  const breadth = Math.min(15, num(row, 'active_days_30d') * 1.5);
  const messaging =
    (row.email_opened_7d ? 8 : 0) + (row.email_clicked_7d ? 7 : 0);
  return Math.round(Math.min(100, recency + frequency + breadth + messaging));
}

/* ------------------------------------------------------------------ *
 * Building the catalog
 * ------------------------------------------------------------------ */

const ENUMISH_TYPES: FieldType[] = ['enum', 'boolean', 'string'];

function propertiesFromFilterFields(
  fields: SchemaFilterField[],
  rows: Record<string, unknown>[],
): CatalogProperty[] {
  const sample = rows.slice(0, 500);
  return fields.map((f) => {
    const values: string[] = [];
    let set = 0;
    if (sample.length) {
      const seen = new Set<string>();
      for (const row of sample) {
        const raw = f.getValue(row);
        if (raw == null || raw === '') continue;
        set += 1;
        if (ENUMISH_TYPES.includes(f.type) && seen.size < 25) {
          const s = String(raw);
          if (s.length <= 48 && !seen.has(s)) {
            seen.add(s);
            values.push(s);
          }
        }
      }
    }
    return {
      key: f.key,
      label: f.label,
      type: f.type,
      group: f.group || 'Attributes',
      synonyms: synonymsFor(PROPERTY_SYNONYMS, f.key),
      sampleValues: values.length ? values.sort() : undefined,
      coverage: sample.length ? set / sample.length : undefined,
      entity: 'user' as const,
      derived: Boolean(f.group?.includes('Linked')),
      getValue: f.getValue,
    };
  });
}

type EventAgg = {
  volume: number;
  users: Set<string>;
  first?: string;
  last?: string;
  props: Map<string, { type: FieldType; values: Set<string>; count: number }>;
};

function inferValueType(v: unknown): FieldType {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return 'timestamp';
    if (v.length < 40) return 'string';
  }
  if (v && typeof v === 'object') return 'json';
  return 'string';
}

function aggToCatalogEvent(
  name: string,
  agg: EventAgg,
  source: CatalogEvent['source'],
): CatalogEvent {
  const properties: CatalogProperty[] = [...agg.props.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, meta]) => ({
      key,
      label: humanizeFieldName(key),
      type: meta.type,
      group: 'Event properties',
      synonyms: synonymsFor({}, key),
      sampleValues: meta.values.size ? [...meta.values].slice(0, 25).sort() : undefined,
      coverage: agg.volume ? meta.count / agg.volume : undefined,
      entity: 'event' as const,
    }));

  return {
    name,
    label: humanizeFieldName(name),
    synonyms: synonymsFor(EVENT_SYNONYMS, name),
    volume: agg.volume,
    uniqueUsers: agg.users.size,
    firstSeenAt: agg.first,
    lastSeenAt: agg.last,
    properties,
    source,
  };
}

/** Sample the event stream and derive the event half of the catalog. */
export async function fetchEventCatalog(
  tenantId: string,
  environment: string,
  limit = 8000,
): Promise<{ events: CatalogEvent[]; freshestEventAt?: string; sampled: boolean }> {
  const [eventsRes, engRes] = await Promise.all([
    supabase
      .from('events')
      .select('event_type, customer_id, timestamp, properties')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .order('timestamp', { ascending: false })
      .limit(limit),
    supabase
      .from('engagement_log')
      .select('event, channel, customer_id, timestamp')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .order('timestamp', { ascending: false })
      .limit(4000),
  ]);

  const byName = new Map<string, EventAgg>();
  let freshest: string | undefined;

  function touch(map: Map<string, EventAgg>, name: string): EventAgg {
    let agg = map.get(name);
    if (!agg) {
      agg = { volume: 0, users: new Set(), props: new Map() };
      map.set(name, agg);
    }
    return agg;
  }

  for (const ev of eventsRes.data ?? []) {
    const name = String(ev.event_type ?? '').trim();
    if (!name) continue;
    const agg = touch(byName, name);
    agg.volume += 1;
    if (ev.customer_id) agg.users.add(String(ev.customer_id));
    const ts = ev.timestamp ? String(ev.timestamp) : undefined;
    if (ts) {
      if (!agg.last || ts > agg.last) agg.last = ts;
      if (!agg.first || ts < agg.first) agg.first = ts;
      if (!freshest || ts > freshest) freshest = ts;
    }
    const props = (ev.properties ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(props)) {
      if (v == null) continue;
      let meta = agg.props.get(k);
      if (!meta) {
        meta = { type: inferValueType(v), values: new Set(), count: 0 };
        agg.props.set(k, meta);
      }
      meta.count += 1;
      if (meta.values.size < 25 && (typeof v === 'string' || typeof v === 'number')) {
        const s = String(v);
        if (s.length <= 48) meta.values.add(s);
      }
    }
  }

  const engMap = new Map<string, EventAgg>();
  for (const eng of engRes.data ?? []) {
    const name = `message_${String(eng.event ?? '').trim()}`;
    if (name === 'message_') continue;
    const agg = touch(engMap, name);
    agg.volume += 1;
    if (eng.customer_id) agg.users.add(String(eng.customer_id));
    const ts = eng.timestamp ? String(eng.timestamp) : undefined;
    if (ts) {
      if (!agg.last || ts > agg.last) agg.last = ts;
      if (!agg.first || ts < agg.first) agg.first = ts;
    }
    if (eng.channel) {
      let meta = agg.props.get('channel');
      if (!meta) {
        meta = { type: 'enum', values: new Set(), count: 0 };
        agg.props.set('channel', meta);
      }
      meta.count += 1;
      meta.values.add(String(eng.channel));
    }
  }

  const events = [
    ...[...byName.entries()].map(([n, a]) => aggToCatalogEvent(n, a, 'events')),
    ...[...engMap.entries()].map(([n, a]) => aggToCatalogEvent(n, a, 'engagement')),
  ].sort((a, b) => b.volume - a.volume);

  return {
    events,
    freshestEventAt: freshest,
    sampled: (eventsRes.data?.length ?? 0) >= limit,
  };
}

/** Assemble the full catalog for a schema. */
export function buildCatalog(opts: {
  schema: SchemaWithFields;
  rows: Record<string, unknown>[];
  events: CatalogEvent[];
  cohorts: CatalogCohortRef[];
  freshestEventAt?: string;
  sampled?: boolean;
}): SemanticCatalog {
  const filterFields = buildAudienceFilterFields(opts.schema, opts.rows);
  return {
    schemaSlug: opts.schema.slug,
    entityLabel: opts.schema.name || 'Customer',
    properties: propertiesFromFilterFields(filterFields, opts.rows),
    events: opts.events,
    metrics: BUILT_IN_METRICS,
    cohorts: opts.cohorts,
    sampleSize: opts.rows.length,
    sampled: Boolean(opts.sampled),
    freshestEventAt: opts.freshestEventAt,
    builtAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Lookup & fuzzy matching (used by the picker AND the AI grounding step)
 * ------------------------------------------------------------------ */

export function findProperty(catalog: SemanticCatalog, key: string): CatalogProperty | undefined {
  return catalog.properties.find((p) => p.key === key);
}

export function findEvent(catalog: SemanticCatalog, name: string): CatalogEvent | undefined {
  return catalog.events.find((e) => e.name === name);
}

export function findMetric(catalog: SemanticCatalog, key: string): CatalogMetric | undefined {
  return catalog.metrics.find((m) => m.key === key);
}

/** Every event property key across all events, for the event-filter picker. */
export function eventPropertiesFor(
  catalog: SemanticCatalog,
  eventName: string,
): CatalogProperty[] {
  return findEvent(catalog, eventName)?.properties ?? [];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Score how well `query` matches a catalog entry. 0 = no match.
 * Deliberately simple and deterministic — the agent uses it to ground names,
 * and the UI uses the same scoring so suggestions and AI picks agree.
 */
export function matchScore(query: string, label: string, key: string, synonyms: string[]): number {
  const q = normalize(query);
  if (!q) return 0;
  const candidates = [normalize(label), normalize(key), ...synonyms.map(normalize)];

  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    if (c === q) best = Math.max(best, 1);
    else if (c.includes(q) || q.includes(c)) {
      best = Math.max(best, 0.8 * (Math.min(c.length, q.length) / Math.max(c.length, q.length)) + 0.15);
    } else {
      const qTokens = q.split(' ').filter(Boolean);
      const cTokens = new Set(c.split(' ').filter(Boolean));
      const hits = qTokens.filter((t) => cTokens.has(t)).length;
      if (hits) best = Math.max(best, 0.55 * (hits / Math.max(qTokens.length, cTokens.size)));
    }
  }
  return best;
}

export type Suggestion<T> = { item: T; score: number };

export function suggestProperties(
  catalog: SemanticCatalog,
  query: string,
  limit = 8,
): Suggestion<CatalogProperty>[] {
  return catalog.properties
    .map((p) => ({ item: p, score: matchScore(query, p.label, p.key, p.synonyms) }))
    .filter((s) => s.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function suggestEvents(
  catalog: SemanticCatalog,
  query: string,
  limit = 8,
): Suggestion<CatalogEvent>[] {
  return catalog.events
    .map((e) => ({ item: e, score: matchScore(query, e.label, e.name, e.synonyms) }))
    .filter((s) => s.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function suggestMetrics(
  catalog: SemanticCatalog,
  query: string,
  limit = 6,
): Suggestion<CatalogMetric>[] {
  return catalog.metrics
    .map((m) => ({ item: m, score: matchScore(query, m.label, m.key, m.synonyms) }))
    .filter((s) => s.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** The N highest-volume events — the "popular" list in the picker. */
export function popularEvents(catalog: SemanticCatalog, limit = 6): CatalogEvent[] {
  return catalog.events.slice(0, limit);
}

/** Properties most worth offering first: high coverage, low cardinality. */
export function popularProperties(catalog: SemanticCatalog, limit = 8): CatalogProperty[] {
  const preferred = [
    'status',
    'country',
    'city',
    'created_at',
    'consent_email',
    'global_consent',
    'is_email_reachable',
    'last_event_at',
  ];
  const byKey = new Map(catalog.properties.map((p) => [p.key, p]));
  const head = preferred.map((k) => byKey.get(k)).filter(Boolean) as CatalogProperty[];
  const rest = catalog.properties
    .filter((p) => !preferred.includes(p.key))
    .sort((a, b) => (b.coverage ?? 0) - (a.coverage ?? 0));
  return [...head, ...rest].slice(0, limit);
}

/**
 * A compact, token-efficient description of the catalog for the LLM prompt.
 * Only names that appear here may be used — the validator enforces the rest.
 */
export function catalogForPrompt(catalog: SemanticCatalog, maxEvents = 60, maxProps = 120): string {
  const props = catalog.properties.slice(0, maxProps).map((p) => {
    const vals = p.sampleValues?.length ? ` values=[${p.sampleValues.slice(0, 8).join('|')}]` : '';
    return `- ${p.key} (${p.type})${vals}`;
  });
  const events = catalog.events.slice(0, maxEvents).map((e) => {
    const props2 = e.properties.slice(0, 6).map((p) => `${p.key}:${p.type}`).join(', ');
    return `- ${e.name} (${e.volume} events, ${e.uniqueUsers} users)${props2 ? ` props: ${props2}` : ''}`;
  });
  const metrics = catalog.metrics.map((m) => `- ${m.key} — ${m.description}`);
  const cohorts = catalog.cohorts.slice(0, 30).map((c) => `- ${c.slug} (${c.name})`);

  return [
    `ENTITY: ${catalog.entityLabel} (schema "${catalog.schemaSlug}")`,
    '',
    'PROPERTIES:',
    ...props,
    '',
    'EVENTS:',
    events.length ? events.join('\n') : '(no events tracked yet)',
    '',
    'METRICS:',
    ...metrics,
    '',
    'EXISTING COHORTS:',
    cohorts.length ? cohorts.join('\n') : '(none)',
  ].join('\n');
}

/** Freshness warning text, or null when the data looks current. */
export function freshnessWarning(catalog: SemanticCatalog): string | null {
  if (!catalog.events.length) {
    return 'No events have been tracked yet — behavioural conditions will match nobody.';
  }
  if (!catalog.freshestEventAt) return null;
  const ageHours = (Date.now() - new Date(catalog.freshestEventAt).getTime()) / 3_600_000;
  if (ageHours > 48) {
    return `The most recent event is ${Math.round(ageHours / 24)} days old — behavioural conditions may be stale.`;
  }
  return null;
}
