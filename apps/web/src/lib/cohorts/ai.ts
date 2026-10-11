/**
 * AI Cohort Agent.
 *
 * The agent's only output is IR — never SQL, never a free-text query. It grounds
 * every event and property name against the semantic catalog before emitting
 * anything, and reports the terms it could not resolve instead of inventing
 * them. Three tiers, in order: the `cohort-ai` edge function, a client-side
 * OpenAI key, then a fully offline grounded parser so the studio still works
 * with no AI configured at all.
 */
import { invokeFunction } from '@/lib/functions';
import {
  ALL_TIME,
  collectConditions,
  createCohortIR,
  createEventCondition,
  createGroup,
  createMetricCondition,
  createPropertyCondition,
  createRetentionCondition,
  createSequenceStep,
  isGroup,
  lastDays,
  uid,
  type CohortCondition,
  type CohortIR,
  type CohortNode,
  type CountOperator,
  type PropertyOperator,
  type SequenceCondition,
  type TimeUnit,
  type TimeWindow,
} from './ir';
import {
  catalogForPrompt,
  findEvent,
  findMetric,
  findProperty,
  matchScore,
  suggestEvents,
  suggestMetrics,
  suggestProperties,
  type CatalogProperty,
  type SemanticCatalog,
} from './catalog';
import { validateCohortIR, type ValidationResult } from './validate';
import { explainCohort } from './compile';

/* ------------------------------------------------------------------ *
 * Agent types
 * ------------------------------------------------------------------ */

export type UnresolvedTerm = {
  term: string;
  kind: 'event' | 'property' | 'metric';
  suggestions: { label: string; value: string }[];
};

export type ClarificationOption = {
  id: string;
  label: string;
  description?: string;
  /** The condition this option would add. */
  node: CohortNode;
};

export type Clarification = {
  id: string;
  question: string;
  options: ClarificationOption[];
  /** When true the user may pick several signals at once. */
  multi: boolean;
};

export type AgentPlan = {
  /** "What I understood" — a restatement of intent in the product's language. */
  understood: string;
  ir: CohortIR;
  /** Plain-English read-back of the compiled logic. */
  explanation: string;
  /** 0–1. Falls with every unresolved term and open clarification. */
  confidence: number;
  assumptions: string[];
  clarifications: Clarification[];
  unresolved: UnresolvedTerm[];
  suggestedName: string;
  source: AgentSource;
  validation: ValidationResult;
};

export type AgentSource = 'edge' | 'openai' | 'local';

export type AgentMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: string;
  plan?: AgentPlan;
  /** Set on the agent turn that failed, so the UI can offer a retry. */
  error?: string;
};

export function agentMessage(role: AgentMessage['role'], text: string, plan?: AgentPlan): AgentMessage {
  return { id: uid(), role, text, at: new Date().toISOString(), plan };
}

/* ------------------------------------------------------------------ *
 * Natural-language primitives
 * ------------------------------------------------------------------ */

const NEGATION_PATTERNS = [
  "haven't",
  'have not',
  "hasn't",
  'has not',
  "didn't",
  'did not',
  'never',
  'without',
  'excluding',
  'exclude',
  'not ',
  'no longer',
  'stopped',
  'but not',
];

function hasNegation(text: string): boolean {
  const t = text.toLowerCase();
  return NEGATION_PATTERNS.some((p) => t.includes(p));
}

const UNIT_WORDS: Record<string, TimeUnit> = {
  minute: 'minute',
  minutes: 'minute',
  min: 'minute',
  hour: 'hour',
  hours: 'hour',
  hr: 'hour',
  day: 'day',
  days: 'day',
  week: 'week',
  weeks: 'week',
  month: 'month',
  months: 'month',
};

/** Pull a relative time window out of free text, e.g. "in the last 14 days". */
export function parseTimeWindow(text: string): TimeWindow | null {
  const t = text.toLowerCase();

  if (/\ball[- ]time\b|\bever\b/.test(t)) return ALL_TIME;
  if (/\btoday\b/.test(t)) return { kind: 'this', unit: 'day' };
  if (/\byesterday\b/.test(t)) return { kind: 'previous', unit: 'day' };
  if (/\bthis week\b/.test(t)) return { kind: 'this', unit: 'week' };
  if (/\bthis month\b/.test(t)) return { kind: 'this', unit: 'month' };
  if (/\b(last|previous) month\b/.test(t)) return { kind: 'previous', unit: 'month' };
  if (/\b(last|past) week\b/.test(t)) return lastDays(7);
  if (/\b(last|past) year\b/.test(t)) return { kind: 'last', value: 12, unit: 'month' };

  const m = t.match(/\b(?:last|past|previous|within|in the)\s+(\d+)\s*(minute|minutes|min|hour|hours|hr|day|days|week|weeks|month|months)\b/);
  if (m) return { kind: 'last', value: Number(m[1]), unit: UNIT_WORDS[m[2]] };

  const m2 = t.match(/\b(\d+)\s*(day|days|week|weeks|month|months)\b/);
  if (m2 && /\b(last|past|within|ago|recent)\b/.test(t)) {
    return { kind: 'last', value: Number(m2[1]), unit: UNIT_WORDS[m2[2]] };
  }
  return null;
}

const WORD_NUMBERS: Record<string, number> = {
  once: 1,
  one: 1,
  twice: 2,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** Pull a count constraint: "at least 3", "3+", "more than 5", "twice". */
export function parseCount(text: string): { operator: CountOperator; value: number } | null {
  const t = text.toLowerCase();

  const plus = t.match(/\b(\d+)\s*\+/);
  if (plus) return { operator: 'count_gte', value: Number(plus[1]) };

  const atLeast = t.match(/\b(?:at least|minimum of|min|>=|no fewer than)\s*(\d+)/);
  if (atLeast) return { operator: 'count_gte', value: Number(atLeast[1]) };

  const atMost = t.match(/\b(?:at most|no more than|maximum of|max|<=)\s*(\d+)/);
  if (atMost) return { operator: 'count_lte', value: Number(atMost[1]) };

  const more = t.match(/\bmore than\s*(\d+)/);
  if (more) return { operator: 'count_gt', value: Number(more[1]) };

  const fewer = t.match(/\b(?:fewer than|less than)\s*(\d+)/);
  if (fewer) return { operator: 'count_lt', value: Number(fewer[1]) };

  const exactly = t.match(/\bexactly\s*(\d+)/);
  if (exactly) return { operator: 'count_eq', value: Number(exactly[1]) };

  const times = t.match(/\b(\d+)\s*(?:times|x)\b/);
  if (times) return { operator: 'count_gte', value: Number(times[1]) };

  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return { operator: 'count_gte', value };
  }
  return null;
}

/** Numeric comparison for metric/property clauses: "MRR > 500", "over $1,000". */
export function parseComparison(text: string): { operator: PropertyOperator; value: number } | null {
  const t = text.toLowerCase().replace(/[$,]/g, '');

  const gte = t.match(/\b(?:at least|>=|minimum|no less than)\s*(\d+(?:\.\d+)?)/);
  if (gte) return { operator: 'gte', value: Number(gte[1]) };

  const gt = t.match(/\b(?:greater than|more than|over|above|>|higher than)\s*(\d+(?:\.\d+)?)/);
  if (gt) return { operator: 'gt', value: Number(gt[1]) };

  const lte = t.match(/\b(?:at most|<=|no more than)\s*(\d+(?:\.\d+)?)/);
  if (lte) return { operator: 'lte', value: Number(lte[1]) };

  const lt = t.match(/\b(?:less than|under|below|fewer than|<)\s*(\d+(?:\.\d+)?)/);
  if (lt) return { operator: 'lt', value: Number(lt[1]) };

  const between = t.match(/\bbetween\s*(\d+(?:\.\d+)?)\s*(?:and|-|to)\s*(\d+(?:\.\d+)?)/);
  if (between) return { operator: 'between', value: Number(between[1]) };

  return null;
}

/** Split a prompt into clauses the parser can treat independently. */
export function splitClauses(prompt: string): string[] {
  return prompt
    .replace(/\bwho\b|\bthat\b|\bwhich\b/gi, ',')
    .split(/,|;|\band also\b|\band\b|\bbut\b|\n/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/* ------------------------------------------------------------------ *
 * Grounding — resolve free text onto real catalog entries
 * ------------------------------------------------------------------ */

export type Grounded<T> = { item: T; score: number; term: string };

/** Best catalog event for a clause, or null with the term recorded as unresolved. */
function groundEvent(clause: string, catalog: SemanticCatalog): Grounded<{ name: string; label: string }> | null {
  let best: Grounded<{ name: string; label: string }> | null = null;
  for (const ev of catalog.events) {
    const score = Math.max(
      matchScore(clause, ev.label, ev.name, ev.synonyms),
      // Also try scoring each synonym against the clause directly.
      ...ev.synonyms.map((s) => (clause.toLowerCase().includes(s) ? 0.72 : 0)),
    );
    if (score > (best?.score ?? 0.42)) {
      best = { item: { name: ev.name, label: ev.label }, score, term: clause };
    }
  }
  return best;
}

/** Best catalog property, plus the value it should be compared against. */
function groundPropertyValue(
  clause: string,
  catalog: SemanticCatalog,
): { property: CatalogProperty; value?: string; score: number } | null {
  const lower = clause.toLowerCase();
  let best: { property: CatalogProperty; value?: string; score: number } | null = null;

  for (const prop of catalog.properties) {
    const nameScore = matchScore(clause, prop.label, prop.key, prop.synonyms);

    // A sample value appearing verbatim in the clause is the strongest signal:
    // "on a paid plan" resolves plan=paid without the word "plan" scoring at all.
    let valueHit: string | undefined;
    let valueScore = 0;
    for (const v of prop.sampleValues ?? []) {
      if (v.length < 2) continue;
      if (new RegExp(`\\b${v.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) {
        if (v.length > (valueHit?.length ?? 0)) {
          valueHit = v;
          valueScore = 0.85;
        }
      }
    }

    const score = Math.max(nameScore, valueScore);
    if (score > (best?.score ?? 0.42)) {
      best = { property: prop, value: valueHit, score };
    }
  }
  return best;
}

function groundMetric(clause: string, catalog: SemanticCatalog) {
  const hits = suggestMetrics(catalog, clause, 1);
  return hits.length && hits[0].score > 0.45 ? hits[0] : null;
}

/* ------------------------------------------------------------------ *
 * Discovery recipes — "find users likely to churn"
 * ------------------------------------------------------------------ */

export type DiscoveryRecipe = {
  id: string;
  /** Phrases that trigger this recipe. */
  triggers: string[];
  name: string;
  understood: string;
  /** The signals used, shown so an inferred cohort is never a black box. */
  signals: string[];
  build: (catalog: SemanticCatalog) => CohortNode[];
};

function metricIf(catalog: SemanticCatalog, key: string, operator: PropertyOperator, value: number) {
  if (!findMetric(catalog, key)) return null;
  const c = createMetricCondition(key);
  c.operator = operator;
  c.value = value;
  return c;
}

function propIf(
  catalog: SemanticCatalog,
  key: string,
  operator: PropertyOperator,
  value: string | number,
) {
  if (!findProperty(catalog, key)) return null;
  const c = createPropertyCondition(key, operator);
  c.value = value;
  return c;
}

export const DISCOVERY_RECIPES: DiscoveryRecipe[] = [
  {
    id: 'churn-risk',
    triggers: ['likely to churn', 'churn risk', 'at risk', 'about to leave', 'going to cancel'],
    name: 'Churn risk',
    understood:
      'People who used to be active but have gone quiet, and whose activity is trending down.',
    signals: ['Days since last active', 'Declining activity vs the previous period', 'Was previously engaged'],
    build: (catalog) => {
      const nodes: CohortNode[] = [];
      const dormant = metricIf(catalog, 'metric.days_since_last_active', 'gte', 21);
      if (dormant) nodes.push(dormant);
      const wasActive = metricIf(catalog, 'metric.events_30d', 'gte', 1);
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
    id: 'high-value',
    triggers: ['highest-value', 'high value', 'best customers', 'most valuable', 'vip', 'power users'],
    name: 'High-value customers',
    understood: 'The most engaged people: frequent activity, broad usage, and consistent presence.',
    signals: ['Engagement score', 'Active days in the last 30 days', 'Events in the last 30 days'],
    build: (catalog) => {
      const nodes: CohortNode[] = [];
      const score = metricIf(catalog, 'metric.engagement_score', 'gte', 60);
      if (score) nodes.push(score);
      const days = metricIf(catalog, 'metric.active_days_30d', 'gte', 8);
      if (days) nodes.push(days);
      return nodes;
    },
  },
  {
    id: 'engaged-not-converted',
    triggers: [
      'engaged but',
      "haven't upgraded",
      'not upgraded',
      'ready to upgrade',
      'ready for enterprise',
      'expansion',
    ],
    name: 'Engaged, not yet converted',
    understood:
      'Highly engaged people who have not taken the commercial step yet — the expansion opportunity.',
    signals: ['Engagement score', 'No purchase/upgrade event on record'],
    build: (catalog) => {
      const nodes: CohortNode[] = [];
      const score = metricIf(catalog, 'metric.engagement_score', 'gte', 50);
      if (score) nodes.push(score);
      const upgrade = catalog.events.find((e) =>
        /purchase|checkout|upgrade|subscribe|convert|order/i.test(e.name),
      );
      if (upgrade) {
        const cond = createEventCondition(upgrade.name);
        cond.performed = 'did_not';
        cond.window = ALL_TIME;
        nodes.push(cond);
      }
      return nodes;
    },
  },
  {
    id: 'dormant',
    triggers: ['dormant', 'inactive', 'gone quiet', 'lapsed', 'stopped using'],
    name: 'Dormant customers',
    understood: 'People with no tracked activity for a sustained period.',
    signals: ['Became inactive (no events for 30+ days)'],
    build: () => {
      const cond = createRetentionCondition();
      cond.pattern = 'became_inactive';
      cond.gapDays = 30;
      cond.window = ALL_TIME;
      return [cond];
    },
  },
  {
    id: 'new-signups',
    triggers: ['new users', 'new signups', 'recently joined', 'just signed up', 'new customers'],
    name: 'New customers',
    understood: 'People who joined recently and are still in their first weeks.',
    signals: ['Days since signup'],
    build: (catalog) => {
      const c = metricIf(catalog, 'metric.days_since_signup', 'lte', 30);
      return c ? [c] : [];
    },
  },
  {
    id: 'adopted-then-stopped',
    triggers: ['adopted', 'stopped using feature', 'tried but stopped', 'abandoned feature'],
    name: 'Adopted then lapsed',
    understood:
      'People who used a feature historically but have not touched it in the recent window.',
    signals: ['Performed the feature event at some point', 'Did not perform it in the last 30 days'],
    build: (catalog) => {
      const feature = catalog.events[0];
      if (!feature) return [];
      const past = createEventCondition(feature.name);
      past.window = ALL_TIME;
      past.operator = 'count_gte';
      past.value = 3;
      const recent = createEventCondition(feature.name);
      recent.performed = 'did_not';
      recent.window = lastDays(30);
      return [past, recent];
    },
  },
  {
    id: 'reachable',
    triggers: ['reachable', 'contactable', 'can be messaged', 'consented'],
    name: 'Reachable & consented',
    understood: 'People who can legally and technically be contacted.',
    signals: ['Valid email', 'Marketing consent'],
    build: (catalog) => {
      const nodes: CohortNode[] = [];
      const reach = propIf(catalog, 'is_email_reachable', 'equals', 'true');
      if (reach) nodes.push(reach);
      const consent =
        propIf(catalog, 'consent_email', 'equals', 'true') ??
        propIf(catalog, 'global_consent', 'equals', 'true');
      if (consent) nodes.push(consent);
      return nodes;
    },
  },
];

function matchRecipe(prompt: string): DiscoveryRecipe | null {
  const t = prompt.toLowerCase();
  for (const recipe of DISCOVERY_RECIPES) {
    if (recipe.triggers.some((trigger) => t.includes(trigger))) return recipe;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Ambiguity — the "which definition of high-intent?" moment
 * ------------------------------------------------------------------ */

const AMBIGUOUS_TERMS: { term: string; question: string; build: (c: SemanticCatalog) => ClarificationOption[] }[] = [
  {
    term: 'high-intent',
    question: 'I found a few possible definitions of "high-intent". Which should I use?',
    build: (catalog) => intentOptions(catalog),
  },
  {
    term: 'high intent',
    question: 'I found a few possible definitions of "high-intent". Which should I use?',
    build: (catalog) => intentOptions(catalog),
  },
  {
    term: 'engaged',
    question: '"Engaged" can mean a few things here. Which signal should I use?',
    build: (catalog) => {
      const opts: ClarificationOption[] = [];
      const score = metricIf(catalog, 'metric.engagement_score', 'gte', 50);
      if (score) {
        opts.push({
          id: 'score',
          label: 'Engagement score ≥ 50',
          description: 'Blended recency, frequency and message engagement',
          node: score,
        });
      }
      const days = metricIf(catalog, 'metric.active_days_30d', 'gte', 5);
      if (days) {
        opts.push({
          id: 'days',
          label: 'Active on 5+ days in the last 30',
          description: 'Consistent presence rather than one burst',
          node: days,
        });
      }
      const events = metricIf(catalog, 'metric.events_30d', 'gte', 10);
      if (events) {
        opts.push({
          id: 'events',
          label: '10+ events in the last 30 days',
          description: 'Raw activity volume',
          node: events,
        });
      }
      return opts;
    },
  },
  {
    term: 'active',
    question: 'How should I define "active"?',
    build: (catalog) => {
      const opts: ClarificationOption[] = [];
      const recent = metricIf(catalog, 'metric.days_since_last_active', 'lte', 7);
      if (recent) {
        opts.push({
          id: 'recent',
          label: 'Any activity in the last 7 days',
          description: 'Recency-based',
          node: recent,
        });
      }
      const status = findProperty(catalog, 'status');
      if (status?.sampleValues?.includes('active')) {
        const cond = createPropertyCondition('status', 'equals');
        cond.value = 'active';
        opts.push({
          id: 'status',
          label: 'Account status is "active"',
          description: 'The stored lifecycle flag, not behaviour',
          node: cond,
        });
      }
      const retention = createRetentionCondition();
      retention.pattern = 'active_n_of_m';
      retention.periods = 3;
      retention.periodUnit = 'day';
      retention.window = lastDays(7);
      opts.push({
        id: 'retention',
        label: 'Active on 3+ days in the last 7',
        description: 'Habitual use rather than a single visit',
        node: retention,
      });
      return opts;
    },
  },
];

function intentOptions(catalog: SemanticCatalog): ClarificationOption[] {
  const opts: ClarificationOption[] = [];
  const topEvents = catalog.events.slice(0, 3);
  topEvents.forEach((ev, i) => {
    const cond = createEventCondition(ev.name);
    cond.value = i === 0 ? 3 : 2;
    cond.window = lastDays(30);
    opts.push({
      id: `event-${ev.name}`,
      label: `Performed "${ev.label}" ${cond.value}+ times`,
      description: `${ev.uniqueUsers.toLocaleString()} people have done this`,
      node: cond,
    });
  });
  const score = metricIf(catalog, 'metric.engagement_score', 'gte', 60);
  if (score) {
    opts.push({
      id: 'score',
      label: 'Engagement score ≥ 60',
      description: 'Blended activity signal',
      node: score,
    });
  }
  return opts;
}

function detectAmbiguity(prompt: string, catalog: SemanticCatalog): Clarification[] {
  const t = prompt.toLowerCase();
  const out: Clarification[] = [];
  const seen = new Set<string>();

  for (const entry of AMBIGUOUS_TERMS) {
    if (!t.includes(entry.term) || seen.has(entry.question)) continue;
    const options = entry.build(catalog);
    if (options.length < 2) continue;
    seen.add(entry.question);
    out.push({ id: uid(), question: entry.question, options, multi: true });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The offline grounded parser
 * ------------------------------------------------------------------ */

const SEQUENCE_HINT = /\bthen\b|→|->|\bfollowed by\b|\bafter that\b|\bfunnel\b|\bsequence\b/i;

function buildSequenceFromPrompt(prompt: string, catalog: SemanticCatalog): SequenceCondition | null {
  const parts = prompt.split(/\bthen\b|→|->|\bfollowed by\b|\bafter that\b/i).map((s) => s.trim());
  if (parts.length < 2) return null;

  const steps = parts
    .map((p) => groundEvent(p, catalog))
    .filter(Boolean)
    .map((g) => createSequenceStep(g!.item.name));
  if (steps.length < 2) return null;

  const win = parseTimeWindow(prompt) ?? lastDays(90);
  const dropped = /\bdrop(ped)? ?off\b|\bdid not (finish|complete)\b|\bstarted but\b|\babandon/i.test(prompt);

  return {
    kind: 'sequence',
    id: uid(),
    ordered: true,
    steps,
    window: win,
    conversionWindow: { value: 7, unit: 'day' },
    outcome: dropped ? 'dropped_off' : 'completed',
  };
}

function conditionFromClause(
  clause: string,
  catalog: SemanticCatalog,
  defaultWindow: TimeWindow,
  unresolved: UnresolvedTerm[],
): CohortNode | null {
  const negated = hasNegation(clause);
  const window = parseTimeWindow(clause) ?? defaultWindow;

  // 1. Metric clauses ("MRR over 500", "engagement score above 60").
  const metric = groundMetric(clause, catalog);
  const cmp = parseComparison(clause);
  if (metric && cmp) {
    const cond = createMetricCondition(metric.item.key);
    cond.operator = cmp.operator;
    cond.value = cmp.value;
    return cond;
  }

  // 2. Behavioural clauses — an event verb plus optionally a count.
  const eventHit = groundEvent(clause, catalog);
  const countHit = parseCount(clause);
  const looksBehavioural =
    /\b(performed|did|does|used|use|uses|triggered|completed|viewed|clicked|opened|bought|purchased|created|invited|started|visited|signed)\b/i.test(
      clause,
    ) || Boolean(countHit);

  if (eventHit && (looksBehavioural || eventHit.score > 0.65)) {
    const cond = createEventCondition(eventHit.item.name);
    cond.window = window;
    if (negated) {
      cond.performed = 'did_not';
    } else if (countHit) {
      cond.operator = countHit.operator;
      cond.value = countHit.value;
    }
    return cond;
  }

  // 3. Attribute clauses — property name and/or a recognised value.
  const propHit = groundPropertyValue(clause, catalog);
  if (propHit) {
    const { property, value } = propHit;

    if (property.type === 'timestamp' || property.type === 'date') {
      const win = parseTimeWindow(clause);
      if (win) {
        const cond = createPropertyCondition(property.key, 'gte');
        cond.window = win;
        return cond;
      }
    }

    if (property.type === 'number' && cmp) {
      const cond = createPropertyCondition(property.key, cmp.operator);
      cond.value = cmp.value;
      return cond;
    }

    if (property.type === 'boolean') {
      const cond = createPropertyCondition(property.key, 'equals');
      cond.value = negated ? 'false' : 'true';
      return cond;
    }

    if (value) {
      const cond = createPropertyCondition(property.key, negated ? 'not_equals' : 'equals');
      cond.value = value;
      return cond;
    }

    // Name matched but no value — ask for presence rather than guess a value.
    const cond = createPropertyCondition(property.key, negated ? 'is_not_set' : 'is_set');
    return cond;
  }

  // 4. Nothing grounded. Record the term rather than inventing a field.
  const meaningful = clause.replace(/\b(users?|people|customers?|who|with|the|a|an|in|of|are|is|and)\b/gi, '').trim();
  if (meaningful.length > 2) {
    const evSuggestions = suggestEvents(catalog, meaningful, 3).map((s) => ({
      label: s.item.label,
      value: s.item.name,
    }));
    const propSuggestions = suggestProperties(catalog, meaningful, 3).map((s) => ({
      label: s.item.label,
      value: s.item.key,
    }));
    if (evSuggestions.length || propSuggestions.length) {
      unresolved.push({
        term: meaningful,
        kind: evSuggestions.length ? 'event' : 'property',
        suggestions: [...evSuggestions, ...propSuggestions].slice(0, 4),
      });
    }
  }
  return null;
}

/** Fully offline NL → IR. Deterministic, catalog-grounded, never invents names. */
export function parseCohortPromptLocal(prompt: string, catalog: SemanticCatalog): AgentPlan {
  const ir = createCohortIR('user', catalog.schemaSlug);
  const unresolved: UnresolvedTerm[] = [];
  const assumptions: string[] = [];
  const defaultWindow = parseTimeWindow(prompt) ?? lastDays(30);

  const recipe = matchRecipe(prompt);
  let understood: string;
  let name: string;

  if (recipe) {
    const nodes = recipe.build(catalog);
    ir.root.children.push(...nodes);
    understood = recipe.understood;
    name = recipe.name;
    assumptions.push(`Inferred definition from these signals: ${recipe.signals.join('; ')}.`);
    if (!nodes.length) {
      assumptions.push('None of the signals for this recipe exist in your data yet.');
    }
  } else {
    if (SEQUENCE_HINT.test(prompt)) {
      const seq = buildSequenceFromPrompt(prompt, catalog);
      if (seq) {
        ir.root.children.push(seq);
        assumptions.push('Read this as an ordered funnel with a 7-day conversion window.');
      }
    }

    if (!ir.root.children.length) {
      for (const clause of splitClauses(prompt)) {
        const node = conditionFromClause(clause, catalog, defaultWindow, unresolved);
        if (node) ir.root.children.push(node);
      }
    }

    understood = ir.root.children.length
      ? explainCohort(ir, catalog)
      : 'I could not ground any part of that request against your schema.';
    name = suggestCohortName(prompt);
  }

  if (defaultWindow.kind === 'last' && collectConditions(ir.root).some((c) => c.kind === 'event')) {
    assumptions.push(`Applied a default ${defaultWindow.value}-${defaultWindow.unit} window to behavioural rules.`);
  }

  const clarifications = detectAmbiguity(prompt, catalog);
  const validation = validateCohortIR(ir, catalog);

  return {
    understood,
    ir,
    explanation: explainCohort(ir, catalog),
    confidence: scoreConfidence(ir, unresolved, clarifications, validation),
    assumptions,
    clarifications,
    unresolved,
    suggestedName: name,
    source: 'local',
    validation,
  };
}

function scoreConfidence(
  ir: CohortIR,
  unresolved: UnresolvedTerm[],
  clarifications: Clarification[],
  validation: ValidationResult,
): number {
  if (!ir.root.children.length) return 0.1;
  let score = 0.9;
  score -= unresolved.length * 0.18;
  score -= clarifications.length * 0.15;
  score -= validation.errors.length * 0.25;
  score -= validation.warnings.length * 0.05;
  return Math.max(0.05, Math.min(1, score));
}

export function suggestCohortName(prompt: string): string {
  const cleaned = prompt
    .replace(/^(find|show|get|give|build|create)\s+(me\s+)?/i, '')
    .replace(/^(all\s+)?(the\s+)?(users?|people|customers?)\s+(who|that|which)\s+/i, '')
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(' ');
  const title = words.charAt(0).toUpperCase() + words.slice(1);
  return (title.length > 48 ? `${title.slice(0, 45)}…` : title) || 'AI cohort';
}

/* ------------------------------------------------------------------ *
 * Remote tiers
 * ------------------------------------------------------------------ */

type RemoteDraft = {
  understood?: string;
  name?: string;
  assumptions?: string[];
  ir?: unknown;
};

const SYSTEM_PROMPT = `You translate a marketer's request into a cohort Intermediate Representation (IR).

HARD RULES
- Use ONLY event names, property keys and metric keys that appear in the CATALOG below. Never invent one.
- If you cannot find a match, omit that condition and mention it in "assumptions".
- Never output SQL. Output ONLY the JSON object described below.

IR SHAPE
{
  "understood": "one sentence restating the request in the product's own vocabulary",
  "name": "short cohort name",
  "assumptions": ["any defaults you applied"],
  "ir": {
    "entity": "user",
    "root": {
      "kind": "group", "operator": "and", "children": [ ...conditions... ]
    }
  }
}

CONDITION TYPES
{"kind":"property","property":"<key>","operator":"equals|not_equals|contains|not_contains|starts_with|ends_with|is_set|is_not_set|gt|gte|lt|lte|between|in|not_in","value":"..."}
{"kind":"event","event":"<name>","performed":"did|did_not","aggregation":{"kind":"count"},"operator":"count_gte|count_lte|count_eq|count_gt|count_lt","value":1,"window":{"kind":"last","value":30,"unit":"day"},"filters":[{"property":"...","operator":"equals","value":"..."}]}
{"kind":"metric","metric":"<metric key>","operator":"gte","value":100}
{"kind":"sequence","ordered":true,"outcome":"completed|dropped_off","steps":[{"event":"<name>","filters":[]}],"window":{...},"conversionWindow":{"value":7,"unit":"day"}}
{"kind":"retention","pattern":"active_n_of_m|active_every_period|returned_after|became_inactive|reactivated|increasing_activity|declining_activity","event":"<optional>","periods":3,"periodUnit":"day","gapDays":30,"window":{...}}
{"kind":"relative_event","event":"<name>","anchorEvent":"<name>","relation":"within_after|within_before|after|before|never_after","gap":{"value":7,"unit":"day"},"minCount":1,"window":{...},"filters":[],"anchorFilters":[]}
{"kind":"group","operator":"and|or","negate":false,"children":[...]}

WINDOWS
{"kind":"all_time"} | {"kind":"last","value":N,"unit":"minute|hour|day|week|month"} | {"kind":"this","unit":"day|week|month|quarter|year"} | {"kind":"previous","unit":"..."} | {"kind":"before","date":"ISO"} | {"kind":"after","date":"ISO"} | {"kind":"between","start":"ISO","end":"ISO"}`;

function getClientOpenAiKey(): string | undefined {
  const key = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  return key?.trim() || undefined;
}

async function generateViaEdge(
  prompt: string,
  catalog: SemanticCatalog,
  currentIr?: CohortIR,
): Promise<RemoteDraft | null> {
  const res = await invokeFunction<RemoteDraft>('cohort-ai', {
    prompt,
    catalog: catalogForPrompt(catalog),
    schema_slug: catalog.schemaSlug,
    current_ir: currentIr ?? null,
  });
  return res.ok && res.data?.ir ? res.data : null;
}

async function generateViaOpenAi(
  prompt: string,
  catalog: SemanticCatalog,
  currentIr?: CohortIR,
): Promise<RemoteDraft | null> {
  const apiKey = getClientOpenAiKey();
  if (!apiKey) return null;

  const user = currentIr
    ? `CATALOG\n${catalogForPrompt(catalog)}\n\nCURRENT COHORT IR\n${JSON.stringify(currentIr.root)}\n\nMODIFY it per this instruction, returning the full updated IR: "${prompt}"`
    : `CATALOG\n${catalogForPrompt(catalog)}\n\nBuild a cohort for: "${prompt}"`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as RemoteDraft;
    return parsed.ir ? parsed : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Coercion — a remote model's JSON is never trusted directly
 * ------------------------------------------------------------------ */

const VALID_PROPERTY_OPS: PropertyOperator[] = [
  'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
  'is_set', 'is_not_set', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in',
];
const VALID_COUNT_OPS: CountOperator[] = [
  'count_gte', 'count_lte', 'count_eq', 'count_gt', 'count_lt', 'count_between',
];

function coerceWindow(raw: unknown): TimeWindow {
  if (!raw || typeof raw !== 'object') return lastDays(30);
  const w = raw as TimeWindow;
  if (
    w.kind === 'all_time' ||
    (w.kind === 'last' && Number.isFinite((w as { value: number }).value)) ||
    w.kind === 'this' ||
    w.kind === 'previous' ||
    w.kind === 'before' ||
    w.kind === 'after' ||
    w.kind === 'between'
  ) {
    return w;
  }
  return lastDays(30);
}

/**
 * Convert whatever the model returned into valid IR, dropping anything that
 * does not exist in the catalog. Unresolved names are reported, not guessed.
 */
function coerceNode(
  raw: unknown,
  catalog: SemanticCatalog,
  unresolved: UnresolvedTerm[],
): CohortNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind ?? '');

  if (kind === 'group') {
    const children = Array.isArray(r.children)
      ? (r.children.map((c) => coerceNode(c, catalog, unresolved)).filter(Boolean) as CohortNode[])
      : [];
    if (!children.length) return null;
    const group = createGroup(r.operator === 'or' ? 'or' : 'and', children);
    if (r.negate === true) group.negate = true;
    return group;
  }

  if (kind === 'property') {
    const key = String(r.property ?? '');
    if (!findProperty(catalog, key)) {
      unresolved.push({
        term: key,
        kind: 'property',
        suggestions: suggestProperties(catalog, key, 3).map((s) => ({
          label: s.item.label,
          value: s.item.key,
        })),
      });
      return null;
    }
    const op = VALID_PROPERTY_OPS.includes(r.operator as PropertyOperator)
      ? (r.operator as PropertyOperator)
      : 'equals';
    const cond = createPropertyCondition(key, op);
    cond.value = (r.value as string) ?? '';
    if (r.value2 != null) cond.value2 = r.value2 as string;
    if (Array.isArray(r.values)) cond.values = r.values as (string | number)[];
    if (r.window) cond.window = coerceWindow(r.window);
    return cond;
  }

  if (kind === 'metric') {
    const key = String(r.metric ?? '');
    if (!findMetric(catalog, key)) {
      unresolved.push({
        term: key,
        kind: 'metric',
        suggestions: suggestMetrics(catalog, key, 3).map((s) => ({
          label: s.item.label,
          value: s.item.key,
        })),
      });
      return null;
    }
    const cond = createMetricCondition(key);
    cond.operator = VALID_PROPERTY_OPS.includes(r.operator as PropertyOperator)
      ? (r.operator as PropertyOperator)
      : 'gte';
    cond.value = Number(r.value) || 0;
    if (r.value2 != null) cond.value2 = Number(r.value2);
    return cond;
  }

  if (kind === 'event') {
    const name = String(r.event ?? '');
    if (!findEvent(catalog, name)) {
      unresolved.push({
        term: name,
        kind: 'event',
        suggestions: suggestEvents(catalog, name, 3).map((s) => ({
          label: s.item.label,
          value: s.item.name,
        })),
      });
      return null;
    }
    const cond = createEventCondition(name);
    cond.performed = r.performed === 'did_not' ? 'did_not' : 'did';
    cond.operator = VALID_COUNT_OPS.includes(r.operator as CountOperator)
      ? (r.operator as CountOperator)
      : 'count_gte';
    cond.value = Number(r.value) || 1;
    if (r.value2 != null) cond.value2 = Number(r.value2);
    cond.window = coerceWindow(r.window);
    const ev = findEvent(catalog, name);
    if (Array.isArray(r.filters)) {
      cond.filters = (r.filters as Record<string, unknown>[])
        .filter((f) => {
          const p = String(f.property ?? '');
          return p && (!ev?.properties.length || ev.properties.some((ep) => ep.key === p));
        })
        .map((f) => ({
          id: uid(),
          property: String(f.property),
          operator: VALID_PROPERTY_OPS.includes(f.operator as PropertyOperator)
            ? (f.operator as PropertyOperator)
            : 'equals',
          value: (f.value as string) ?? '',
        }));
    }
    return cond;
  }

  if (kind === 'sequence') {
    const steps = Array.isArray(r.steps)
      ? (r.steps as Record<string, unknown>[])
          .map((s) => String(s.event ?? ''))
          .filter((n) => findEvent(catalog, n))
          .map((n) => createSequenceStep(n))
      : [];
    if (steps.length < 2) return null;
    return {
      kind: 'sequence',
      id: uid(),
      ordered: r.ordered !== false,
      steps,
      window: coerceWindow(r.window),
      conversionWindow:
        r.conversionWindow && typeof r.conversionWindow === 'object'
          ? (r.conversionWindow as { value: number; unit: TimeUnit })
          : { value: 7, unit: 'day' },
      outcome: r.outcome === 'dropped_off' ? 'dropped_off' : 'completed',
    };
  }

  if (kind === 'retention') {
    const cond = createRetentionCondition();
    const pattern = String(r.pattern ?? '');
    if (
      [
        'active_n_of_m',
        'active_every_period',
        'returned_after',
        'became_inactive',
        'reactivated',
        'increasing_activity',
        'declining_activity',
      ].includes(pattern)
    ) {
      cond.pattern = pattern as typeof cond.pattern;
    }
    const ev = String(r.event ?? '');
    if (ev && findEvent(catalog, ev)) cond.event = ev;
    if (Number.isFinite(Number(r.periods))) cond.periods = Number(r.periods);
    if (r.periodUnit === 'week' || r.periodUnit === 'month' || r.periodUnit === 'day') {
      cond.periodUnit = r.periodUnit;
    }
    if (Number.isFinite(Number(r.gapDays))) cond.gapDays = Number(r.gapDays);
    if (Number.isFinite(Number(r.consecutive))) cond.consecutive = Number(r.consecutive);
    cond.window = coerceWindow(r.window);
    return cond;
  }

  if (kind === 'relative_event') {
    const a = String(r.event ?? '');
    const b = String(r.anchorEvent ?? '');
    if (!findEvent(catalog, a) || !findEvent(catalog, b)) {
      [a, b].forEach((n) => {
        if (n && !findEvent(catalog, n)) {
          unresolved.push({
            term: n,
            kind: 'event',
            suggestions: suggestEvents(catalog, n, 3).map((s) => ({
              label: s.item.label,
              value: s.item.name,
            })),
          });
        }
      });
      return null;
    }
    return {
      kind: 'relative_event',
      id: uid(),
      event: a,
      anchorEvent: b,
      filters: [],
      anchorFilters: [],
      relation: (['within_after', 'within_before', 'after', 'before', 'never_after'] as const).includes(
        r.relation as never,
      )
        ? (r.relation as 'within_after')
        : 'within_after',
      gap:
        r.gap && typeof r.gap === 'object'
          ? (r.gap as { value: number; unit: TimeUnit })
          : { value: 7, unit: 'day' },
      minCount: Number(r.minCount) || 1,
      window: coerceWindow(r.window),
    };
  }

  return null;
}

function planFromRemote(
  draft: RemoteDraft,
  prompt: string,
  catalog: SemanticCatalog,
  source: AgentSource,
): AgentPlan | null {
  const unresolved: UnresolvedTerm[] = [];
  const rawRoot = (draft.ir as Record<string, unknown> | undefined)?.root ?? draft.ir;
  const root = coerceNode(rawRoot, catalog, unresolved);
  if (!root) return null;

  const ir = createCohortIR('user', catalog.schemaSlug);
  ir.root = isGroup(root) ? root : createGroup('and', [root]);
  if (!ir.root.children.length) return null;

  const clarifications = detectAmbiguity(prompt, catalog);
  const validation = validateCohortIR(ir, catalog);

  return {
    understood: draft.understood || explainCohort(ir, catalog),
    ir,
    explanation: explainCohort(ir, catalog),
    confidence: scoreConfidence(ir, unresolved, clarifications, validation),
    assumptions: draft.assumptions ?? [],
    clarifications,
    unresolved,
    suggestedName: draft.name || suggestCohortName(prompt),
    source,
    validation,
  };
}

/* ------------------------------------------------------------------ *
 * Public agent API
 * ------------------------------------------------------------------ */

/** Build a cohort from a natural-language description. */
export async function buildCohortFromPrompt(
  prompt: string,
  catalog: SemanticCatalog,
): Promise<AgentPlan> {
  const edge = await generateViaEdge(prompt, catalog).catch(() => null);
  if (edge) {
    const plan = planFromRemote(edge, prompt, catalog, 'edge');
    if (plan) return plan;
  }

  const openai = await generateViaOpenAi(prompt, catalog).catch(() => null);
  if (openai) {
    const plan = planFromRemote(openai, prompt, catalog, 'openai');
    if (plan) return plan;
  }

  return parseCohortPromptLocal(prompt, catalog);
}

/* ------------------------------------------------------------------ *
 * Conversational editing
 * ------------------------------------------------------------------ */

export type EditOutcome = {
  ir: CohortIR;
  /** What actually changed, phrased for the transcript. */
  summary: string;
  applied: boolean;
  source: AgentSource;
};

function numericConditions(ir: CohortIR): CohortCondition[] {
  return collectConditions(ir.root).filter(
    (c) => c.kind === 'event' || c.kind === 'metric',
  );
}

/** Offline edit path — pattern-matched instructions applied to the existing IR. */
export function applyEditLocal(
  instruction: string,
  ir: CohortIR,
  catalog: SemanticCatalog,
): EditOutcome {
  const next = JSON.parse(JSON.stringify(ir)) as CohortIR;
  const t = instruction.toLowerCase();
  const changes: string[] = [];

  // "change the time window to 60 days" / "make it the last 90 days"
  const win = parseTimeWindow(instruction);
  if (win && /\bwindow\b|\btimeframe\b|\btime frame\b|\bperiod\b|\bmake it\b|\bchange\b|\bset\b/.test(t)) {
    let touched = 0;
    for (const cond of collectConditions(next.root)) {
      if (cond.kind === 'event' || cond.kind === 'sequence' || cond.kind === 'retention') {
        cond.window = win;
        touched += 1;
      }
    }
    if (touched) changes.push(`updated the time window on ${touched} behavioural rule(s)`);
  }

  // "make the X requirement 5 instead of 3" / "change X to at least 5"
  const numberMatch = t.match(/\b(\d+)\s*(?:instead of|rather than)\s*(\d+)/);
  const targetEvent = groundEvent(instruction, catalog);
  if (numberMatch) {
    const [, to, from] = numberMatch;
    for (const cond of numericConditions(next)) {
      const isTarget =
        !targetEvent ||
        (cond.kind === 'event' && cond.event === targetEvent.item.name) ||
        cond.kind === 'metric';
      if (isTarget && cond.kind !== 'sequence' && Number((cond as { value: number }).value) === Number(from)) {
        (cond as { value: number }).value = Number(to);
        changes.push(`changed the threshold from ${from} to ${to}`);
      }
    }
  } else {
    const cmp = parseCount(instruction) ?? parseComparison(instruction);
    if (cmp && targetEvent && /\bmake\b|\bchange\b|\bset\b|\brequire\b|\bupdate\b/.test(t)) {
      for (const cond of collectConditions(next.root)) {
        if (cond.kind === 'event' && cond.event === targetEvent.item.name) {
          cond.value = cmp.value;
          if ('operator' in cmp && String(cmp.operator).startsWith('count_')) {
            cond.operator = cmp.operator as CountOperator;
          }
          changes.push(`set "${targetEvent.item.label}" to ${cmp.value}`);
        }
      }
    }
  }

  // "exclude enterprise customers" / "remove the country rule"
  if (/\bexclude\b|\bremove\b|\bdrop\b|\bwithout\b|\bdon'?t include\b/.test(t)) {
    const clause = instruction.replace(/\b(exclude|remove|drop|without|don'?t include)\b/gi, '').trim();
    const unresolved: UnresolvedTerm[] = [];
    const node = conditionFromClause(clause, catalog, lastDays(30), unresolved);
    if (node) {
      // An exclusion is a negated group so the visual tree shows the NOT explicitly.
      const negated = createGroup('and', [node]);
      negated.negate = true;
      next.root.children.push(negated);
      changes.push(`excluded ${clause.trim()}`);
    }
  }
  // "only include users from India" / "also require ..." / "add ..."
  else if (/\bonly (include|show)\b|\brestrict\b|\balso\b|\badd\b|\brequire\b|\bplus\b/.test(t)) {
    const clause = instruction
      .replace(/\b(only include|only show|restrict to|also require|also|add|require|plus)\b/gi, '')
      .trim();
    const unresolved: UnresolvedTerm[] = [];
    const node = conditionFromClause(clause, catalog, lastDays(30), unresolved);
    if (node) {
      next.root.children.push(node);
      changes.push(`added a rule for ${clause.trim()}`);
    }
  }

  // "make it broader" / "make it more selective"
  if (/\bbroader\b|\bwider\b|\bmore people\b|\bloosen\b/.test(t)) {
    for (const cond of collectConditions(next.root)) {
      if (cond.kind === 'event' && cond.performed === 'did' && cond.value > 1) {
        cond.value = Math.max(1, Math.floor(cond.value / 2));
        changes.push('halved behavioural thresholds');
      }
      if (cond.kind === 'event' && cond.window.kind === 'last') {
        cond.window = { ...cond.window, value: cond.window.value * 2 };
      }
    }
  } else if (/\bmore selective\b|\bnarrower\b|\btighter\b|\bstricter\b|\bfewer people\b/.test(t)) {
    for (const cond of collectConditions(next.root)) {
      if (cond.kind === 'event' && cond.performed === 'did') {
        cond.value = cond.value + 1;
        changes.push('raised behavioural thresholds');
      }
    }
  }

  const summary = changes.length
    ? `I ${[...new Set(changes)].join(', ')}.`
    : "I couldn't work out what to change from that. Try naming the rule, e.g. \"change the last-30-days window to 60 days\".";

  return { ir: changes.length ? next : ir, summary, applied: changes.length > 0, source: 'local' };
}

/** Edit an existing cohort conversationally. Prefers a model, falls back offline. */
export async function editCohortConversationally(
  instruction: string,
  ir: CohortIR,
  catalog: SemanticCatalog,
): Promise<EditOutcome> {
  const remote =
    (await generateViaEdge(instruction, catalog, ir).catch(() => null)) ??
    (await generateViaOpenAi(instruction, catalog, ir).catch(() => null));

  if (remote) {
    const plan = planFromRemote(remote, instruction, catalog, 'edge');
    if (plan && plan.ir.root.children.length) {
      return {
        ir: plan.ir,
        summary: plan.understood,
        applied: true,
        source: plan.source,
      };
    }
  }
  return applyEditLocal(instruction, ir, catalog);
}

/* ------------------------------------------------------------------ *
 * Discovery & recommendations
 * ------------------------------------------------------------------ */

export type DiscoverySuggestion = {
  id: string;
  name: string;
  understood: string;
  signals: string[];
  ir: CohortIR;
};

/** Cohorts worth building, derived from what the catalog actually contains. */
export function discoverCohorts(catalog: SemanticCatalog, limit = 6): DiscoverySuggestion[] {
  const out: DiscoverySuggestion[] = [];
  for (const recipe of DISCOVERY_RECIPES) {
    const nodes = recipe.build(catalog);
    if (!nodes.length) continue;
    const ir = createCohortIR('user', catalog.schemaSlug);
    ir.root.children.push(...nodes);
    out.push({
      id: recipe.id,
      name: recipe.name,
      understood: recipe.understood,
      signals: recipe.signals,
      ir,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export type NextAction = {
  id: string;
  label: string;
  description: string;
  /** Route to navigate to, when the action is a hand-off. */
  href?: string;
};

/** What to offer once a cohort exists. */
export function recommendedActions(
  cohortId: string | null,
  memberCount: number,
): NextAction[] {
  const suffix = cohortId ? `?audience=${cohortId}` : '';
  const actions: NextAction[] = [
    {
      id: 'campaign',
      label: 'Create a campaign',
      description: 'Send a one-off blast to this cohort',
      href: `/journeys/new${suffix}`,
    },
    {
      id: 'journey',
      label: 'Use as a journey entry',
      description: 'Enrol these people into an automated journey',
      href: `/journeys${suffix}`,
    },
    {
      id: 'export',
      label: 'Export members',
      description: 'Download the matched people as CSV',
    },
    {
      id: 'compare',
      label: 'Compare with another cohort',
      description: 'See overlap, size and engagement side by side',
    },
    {
      id: 'monitor',
      label: 'Monitor this cohort',
      description: 'Refresh on a schedule and track size over time',
    },
  ];

  if (memberCount === 0) {
    return [
      {
        id: 'broaden',
        label: 'Ask the agent to broaden this',
        description: 'Nobody matches yet — loosen the thresholds or widen the window',
      },
      ...actions.slice(2),
    ];
  }
  return actions;
}

/** Suggest one more condition, based on what similar cohorts tend to include. */
export function suggestAdditionalConditions(
  ir: CohortIR,
  catalog: SemanticCatalog,
  limit = 3,
): { label: string; reason: string; node: CohortNode }[] {
  const existing = new Set(
    collectConditions(ir.root).map((c) =>
      c.kind === 'property' ? c.property : c.kind === 'event' ? c.event : c.kind === 'metric' ? c.metric : c.kind,
    ),
  );
  const out: { label: string; reason: string; node: CohortNode }[] = [];

  const consent = findProperty(catalog, 'consent_email') ?? findProperty(catalog, 'global_consent');
  if (consent && !existing.has(consent.key)) {
    const node = createPropertyCondition(consent.key, 'equals');
    node.value = 'true';
    out.push({
      label: `${consent.label} is true`,
      reason: 'Most activation cohorts filter to people who can legally be contacted.',
      node,
    });
  }

  const reachable = findProperty(catalog, 'is_email_reachable');
  if (reachable && !existing.has(reachable.key)) {
    const node = createPropertyCondition(reachable.key, 'equals');
    node.value = 'true';
    out.push({
      label: 'Has a valid email address',
      reason: 'Avoids members who cannot receive anything you send.',
      node,
    });
  }

  const status = findProperty(catalog, 'status');
  if (status && !existing.has('status') && status.sampleValues?.includes('active')) {
    const node = createPropertyCondition('status', 'equals');
    node.value = 'active';
    out.push({
      label: 'Status is active',
      reason: 'Excludes merged and deactivated records.',
      node,
    });
  }

  const topEvent = catalog.events[0];
  if (topEvent && !existing.has(topEvent.name)) {
    const node = createEventCondition(topEvent.name);
    out.push({
      label: `Performed "${topEvent.label}" at least once`,
      reason: `Your highest-volume event (${topEvent.uniqueUsers.toLocaleString()} people).`,
      node,
    });
  }

  return out.slice(0, limit);
}

/** Existing cohorts whose definition overlaps this one — dedupe assistance. */
export function findSimilarCohorts(
  ir: CohortIR,
  saved: { slug: string; name: string; ir: CohortIR }[],
  limit = 3,
): { slug: string; name: string; shared: number; total: number }[] {
  const signature = (target: CohortIR) =>
    new Set(
      collectConditions(target.root).map((c) =>
        JSON.stringify({
          kind: c.kind,
          key:
            c.kind === 'property'
              ? c.property
              : c.kind === 'event'
                ? c.event
                : c.kind === 'metric'
                  ? c.metric
                  : c.kind,
        }),
      ),
    );

  const mine = signature(ir);
  if (!mine.size) return [];

  return saved
    .map((s) => {
      const theirs = signature(s.ir);
      const shared = [...mine].filter((k) => theirs.has(k)).length;
      return { slug: s.slug, name: s.name, shared, total: Math.max(mine.size, theirs.size) };
    })
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared / b.total - a.shared / a.total)
    .slice(0, limit);
}
