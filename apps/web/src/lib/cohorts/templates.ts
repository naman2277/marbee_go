/**
 * Cohort templates.
 *
 * Each template is a builder rather than a frozen IR blob: it is handed the
 * live catalog and returns only the conditions whose events, properties and
 * metrics actually exist in this tenant. A template that cannot be grounded
 * reports `available: false` instead of producing a cohort that matches nobody.
 */
import {
  ALL_TIME,
  createCohortIR,
  createEventCondition,
  createMetricCondition,
  createPropertyCondition,
  createRetentionCondition,
  createSequenceStep,
  lastDays,
  uid,
  type CohortIR,
  type CohortNode,
} from './ir';
import { findMetric, findProperty, type SemanticCatalog } from './catalog';

export type CohortTemplateCategory =
  | 'Lifecycle'
  | 'Engagement'
  | 'Retention'
  | 'Revenue'
  | 'Reachability';

export type CohortTemplate = {
  id: string;
  name: string;
  description: string;
  category: CohortTemplateCategory;
  /** Shown on the card so the definition is never a surprise. */
  signals: string[];
  build: (catalog: SemanticCatalog) => CohortNode[];
};

function metric(catalog: SemanticCatalog, key: string, operator: 'gte' | 'lte' | 'gt' | 'lt', value: number) {
  if (!findMetric(catalog, key)) return null;
  const c = createMetricCondition(key);
  c.operator = operator;
  c.value = value;
  return c;
}

function prop(catalog: SemanticCatalog, key: string, value: string, operator: 'equals' | 'not_equals' = 'equals') {
  if (!findProperty(catalog, key)) return null;
  const c = createPropertyCondition(key, operator);
  c.value = value;
  return c;
}

/** The busiest event, used where a template needs "your main activity event". */
function primaryEvent(catalog: SemanticCatalog): string | null {
  return catalog.events[0]?.name ?? null;
}

/** First event matching a semantic role, e.g. a conversion or a signup. */
function eventLike(catalog: SemanticCatalog, pattern: RegExp): string | null {
  return catalog.events.find((e) => pattern.test(e.name) || pattern.test(e.label))?.name ?? null;
}

export const COHORT_TEMPLATES: CohortTemplate[] = [
  {
    id: 'new-users',
    name: 'New customers',
    description: 'Joined in the last 30 days — the onboarding audience.',
    category: 'Lifecycle',
    signals: ['Signed up within 30 days'],
    build: (catalog) => [metric(catalog, 'metric.days_since_signup', 'lte', 30)].filter(Boolean) as CohortNode[],
  },
  {
    id: 'activated',
    name: 'Activated customers',
    description: 'Reached a meaningful level of use in their first weeks.',
    category: 'Lifecycle',
    signals: ['Signed up within 60 days', 'Performed the main event 3+ times'],
    build: (catalog) => {
      const nodes: CohortNode[] = [];
      const recent = metric(catalog, 'metric.days_since_signup', 'lte', 60);
      if (recent) nodes.push(recent);
      const ev = primaryEvent(catalog);
      if (ev) {
        const cond = createEventCondition(ev);
        cond.value = 3;
        cond.window = lastDays(60);
        nodes.push(cond);
      }
      return nodes;
    },
  },
  {
    id: 'power-users',
    name: 'Power users',
    description: 'Your most consistently active customers.',
    category: 'Engagement',
    signals: ['Engagement score ≥ 70', 'Active on 10+ days in the last 30'],
    build: (catalog) =>
      [
        metric(catalog, 'metric.engagement_score', 'gte', 70),
        metric(catalog, 'metric.active_days_30d', 'gte', 10),
      ].filter(Boolean) as CohortNode[],
  },
  {
    id: 'at-risk',
    name: 'At-risk customers',
    description: 'Previously engaged, now trending down and going quiet.',
    category: 'Retention',
    signals: ['Quiet for 14+ days', 'Was active in the last 30 days', 'Declining activity'],
    build: (catalog) => {
      const nodes: CohortNode[] = [];
      const quiet = metric(catalog, 'metric.days_since_last_active', 'gte', 14);
      if (quiet) nodes.push(quiet);
      const wasActive = metric(catalog, 'metric.events_30d', 'gte', 1);
      if (wasActive) nodes.push(wasActive);
      const declining = createRetentionCondition();
      declining.pattern = 'declining_activity';
      declining.gapDays = 30;
      declining.window = lastDays(60);
      nodes.push(declining);
      return nodes;
    },
  },
  {
    id: 'dormant',
    name: 'Dormant customers',
    description: 'No tracked activity for over a month.',
    category: 'Retention',
    signals: ['No events for 30+ days'],
    build: () => {
      const cond = createRetentionCondition();
      cond.pattern = 'became_inactive';
      cond.gapDays = 30;
      cond.window = ALL_TIME;
      return [cond];
    },
  },
  {
    id: 'reactivated',
    name: 'Reactivated customers',
    description: 'Came back after a long silence — worth reinforcing.',
    category: 'Retention',
    signals: ['Returned after a 30+ day gap'],
    build: () => {
      const cond = createRetentionCondition();
      cond.pattern = 'reactivated';
      cond.gapDays = 30;
      cond.window = ALL_TIME;
      return [cond];
    },
  },
  {
    id: 'habitual',
    name: 'Habitual users',
    description: 'Active every week for the last four weeks.',
    category: 'Retention',
    signals: ['Active every week, 4 consecutive weeks'],
    build: () => {
      const cond = createRetentionCondition();
      cond.pattern = 'active_every_period';
      cond.periodUnit = 'week';
      cond.consecutive = 4;
      cond.window = lastDays(28);
      return [cond];
    },
  },
  {
    id: 'feature-adopters',
    name: 'Feature adopters',
    description: 'Repeatedly used your highest-volume feature this month.',
    category: 'Engagement',
    signals: ['Main event 5+ times in the last 30 days'],
    build: (catalog) => {
      const ev = primaryEvent(catalog);
      if (!ev) return [];
      const cond = createEventCondition(ev);
      cond.value = 5;
      cond.window = lastDays(30);
      return [cond];
    },
  },
  {
    id: 'adopted-lapsed',
    name: 'Adopted then lapsed',
    description: 'Used a feature historically but has stopped.',
    category: 'Retention',
    signals: ['Used the feature 3+ times ever', 'Not once in the last 30 days'],
    build: (catalog) => {
      const ev = primaryEvent(catalog);
      if (!ev) return [];
      const past = createEventCondition(ev);
      past.value = 3;
      past.window = ALL_TIME;
      const recent = createEventCondition(ev);
      recent.performed = 'did_not';
      recent.window = lastDays(30);
      return [past, recent];
    },
  },
  {
    id: 'converters',
    name: 'Converted customers',
    description: 'Completed a purchase or conversion event.',
    category: 'Revenue',
    signals: ['At least one conversion event'],
    build: (catalog) => {
      const ev = eventLike(catalog, /purchase|checkout|order|convert|subscribe|payment/i);
      if (!ev) return [];
      const cond = createEventCondition(ev);
      cond.window = ALL_TIME;
      return [cond];
    },
  },
  {
    id: 'repeat-buyers',
    name: 'Repeat buyers',
    description: 'Converted more than once — your revenue base.',
    category: 'Revenue',
    signals: ['2+ conversion events in the last 90 days'],
    build: (catalog) => {
      const ev = eventLike(catalog, /purchase|checkout|order|convert|payment/i);
      if (!ev) return [];
      const cond = createEventCondition(ev);
      cond.value = 2;
      cond.window = lastDays(90);
      return [cond];
    },
  },
  {
    id: 'engaged-not-converted',
    name: 'Expansion opportunities',
    description: 'Highly engaged but has never converted.',
    category: 'Revenue',
    signals: ['Engagement score ≥ 50', 'No conversion event on record'],
    build: (catalog) => {
      const nodes: CohortNode[] = [];
      const score = metric(catalog, 'metric.engagement_score', 'gte', 50);
      if (score) nodes.push(score);
      const ev = eventLike(catalog, /purchase|checkout|order|convert|subscribe|payment/i);
      if (ev) {
        const cond = createEventCondition(ev);
        cond.performed = 'did_not';
        cond.window = ALL_TIME;
        nodes.push(cond);
      }
      return nodes;
    },
  },
  {
    id: 'funnel-dropoff',
    name: 'Funnel drop-offs',
    description: 'Started your main funnel but never finished it.',
    category: 'Engagement',
    signals: ['Entered the funnel', 'Did not reach the final step'],
    build: (catalog) => {
      const events = catalog.events.slice(0, 3);
      if (events.length < 2) return [];
      return [
        {
          kind: 'sequence' as const,
          id: uid(),
          ordered: true,
          steps: events.map((e) => createSequenceStep(e.name)),
          window: lastDays(30),
          conversionWindow: { value: 7, unit: 'day' as const },
          outcome: 'dropped_off' as const,
        },
      ];
    },
  },
  {
    id: 'email-engaged',
    name: 'Email engaged',
    description: 'Opened or clicked an email in the last week.',
    category: 'Engagement',
    signals: ['Email opened or clicked in 7 days'],
    build: (catalog) => {
      const opened = prop(catalog, 'email_opened_7d', 'true');
      const clicked = prop(catalog, 'email_clicked_7d', 'true');
      const kids = [opened, clicked].filter(Boolean) as CohortNode[];
      if (!kids.length) return [];
      return [{ kind: 'group', id: uid(), operator: 'or', children: kids }];
    },
  },
  {
    id: 'reachable',
    name: 'Reachable & consented',
    description: 'Safe to message: valid address plus marketing consent.',
    category: 'Reachability',
    signals: ['Valid email address', 'Email marketing consent'],
    build: (catalog) =>
      [
        prop(catalog, 'is_email_reachable', 'true'),
        prop(catalog, 'consent_email', 'true') ?? prop(catalog, 'global_consent', 'true'),
      ].filter(Boolean) as CohortNode[],
  },
  {
    id: 'omnichannel',
    name: 'Omnichannel reachable',
    description: 'Contactable on both email and SMS.',
    category: 'Reachability',
    signals: ['Valid email', 'Valid mobile number'],
    build: (catalog) =>
      [prop(catalog, 'is_email_reachable', 'true'), prop(catalog, 'is_sms_reachable', 'true')].filter(
        Boolean,
      ) as CohortNode[],
  },
  {
    id: 'over-messaged',
    name: 'Over-messaged',
    description: 'Received a lot of messages recently — suppress before sending more.',
    category: 'Reachability',
    signals: ['10+ messages received in the last 30 days'],
    build: (catalog) => [metric(catalog, 'metric.deliveries_30d', 'gte', 10)].filter(Boolean) as CohortNode[],
  },
];

export type ResolvedTemplate = {
  template: CohortTemplate;
  /** False when the template's signals do not exist in this tenant's data. */
  available: boolean;
  /** Why it is unavailable, shown on the disabled card. */
  reason?: string;
  ir: CohortIR | null;
};

export function resolveTemplate(
  template: CohortTemplate,
  catalog: SemanticCatalog,
): ResolvedTemplate {
  const nodes = template.build(catalog);
  if (!nodes.length) {
    return {
      template,
      available: false,
      reason: catalog.events.length
        ? 'The properties or events this template needs are not in your schema yet.'
        : 'No events have been tracked yet.',
      ir: null,
    };
  }
  const ir = createCohortIR('user', catalog.schemaSlug);
  ir.root.children.push(...nodes);
  return { template, available: true, ir };
}

export function resolveAllTemplates(catalog: SemanticCatalog): ResolvedTemplate[] {
  return COHORT_TEMPLATES.map((t) => resolveTemplate(t, catalog));
}

export const TEMPLATE_CATEGORIES: CohortTemplateCategory[] = [
  'Lifecycle',
  'Engagement',
  'Retention',
  'Revenue',
  'Reachability',
];
