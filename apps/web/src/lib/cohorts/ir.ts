/**
 * Cohort Intermediate Representation (IR).
 *
 * Every path into the cohort builder — the visual rule tree, the AI agent, a
 * template, a legacy `FilterRoot` — produces one of these. Nothing downstream
 * (validation, SQL compilation, evaluation, explanation, versioning) reads
 * anything else. The AI agent NEVER emits SQL; it emits IR that is validated
 * against the semantic catalog first and compiled second.
 */
import type { FilterNode, FilterOperator, FilterRoot } from '@/lib/schema-filters';

export const COHORT_IR_VERSION = 1;

/* ------------------------------------------------------------------ *
 * Entities & time
 * ------------------------------------------------------------------ */

export type CohortEntity = 'user' | 'account';

export type TimeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month';
export type CalendarUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type TimeWindow =
  | { kind: 'all_time' }
  | { kind: 'last'; value: number; unit: TimeUnit }
  | { kind: 'this'; unit: CalendarUnit }
  | { kind: 'previous'; unit: CalendarUnit }
  | { kind: 'before'; date: string }
  | { kind: 'after'; date: string }
  | { kind: 'between'; start: string; end: string };

export const ALL_TIME: TimeWindow = { kind: 'all_time' };

export function lastDays(value: number): TimeWindow {
  return { kind: 'last', value, unit: 'day' };
}

const UNIT_MS: Record<TimeUnit, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
};

export function unitToMs(value: number, unit: TimeUnit): number {
  return value * UNIT_MS[unit];
}

/** Resolve a window to absolute epoch bounds. `now` is injectable for tests. */
export function resolveWindow(
  win: TimeWindow | undefined,
  now: number = Date.now(),
): { from: number; to: number } {
  if (!win || win.kind === 'all_time') return { from: -Infinity, to: Infinity };

  switch (win.kind) {
    case 'last':
      return { from: now - unitToMs(win.value, win.unit), to: now };
    case 'this': {
      const start = startOfCalendarUnit(new Date(now), win.unit);
      return { from: start.getTime(), to: now };
    }
    case 'previous': {
      const currentStart = startOfCalendarUnit(new Date(now), win.unit);
      const prevStart = shiftCalendarUnit(currentStart, win.unit, -1);
      return { from: prevStart.getTime(), to: currentStart.getTime() };
    }
    case 'before':
      return { from: -Infinity, to: new Date(win.date).getTime() };
    case 'after':
      return { from: new Date(win.date).getTime(), to: Infinity };
    case 'between':
      return { from: new Date(win.start).getTime(), to: new Date(win.end).getTime() };
    default:
      return { from: -Infinity, to: Infinity };
  }
}

function startOfCalendarUnit(d: Date, unit: CalendarUnit): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  if (unit === 'week') {
    const dow = (out.getDay() + 6) % 7; // Monday-first
    out.setDate(out.getDate() - dow);
  } else if (unit === 'month') {
    out.setDate(1);
  } else if (unit === 'quarter') {
    out.setMonth(Math.floor(out.getMonth() / 3) * 3, 1);
  } else if (unit === 'year') {
    out.setMonth(0, 1);
  }
  return out;
}

function shiftCalendarUnit(d: Date, unit: CalendarUnit, delta: number): Date {
  const out = new Date(d);
  switch (unit) {
    case 'day':
      out.setDate(out.getDate() + delta);
      break;
    case 'week':
      out.setDate(out.getDate() + delta * 7);
      break;
    case 'month':
      out.setMonth(out.getMonth() + delta);
      break;
    case 'quarter':
      out.setMonth(out.getMonth() + delta * 3);
      break;
    case 'year':
      out.setFullYear(out.getFullYear() + delta);
      break;
  }
  return out;
}

export function describeWindow(win: TimeWindow | undefined): string {
  if (!win || win.kind === 'all_time') return 'all time';
  switch (win.kind) {
    case 'last':
      return `in the last ${win.value} ${win.unit}${win.value === 1 ? '' : 's'}`;
    case 'this':
      return `this ${win.unit}`;
    case 'previous':
      return `previous ${win.unit}`;
    case 'before':
      return `before ${formatIsoDate(win.date)}`;
    case 'after':
      return `after ${formatIsoDate(win.date)}`;
    case 'between':
      return `between ${formatIsoDate(win.start)} and ${formatIsoDate(win.end)}`;
    default:
      return 'all time';
  }
}

function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/** Presets offered by the window picker. */
export const TIME_WINDOW_PRESETS: { label: string; window: TimeWindow }[] = [
  { label: 'All time', window: { kind: 'all_time' } },
  { label: 'Today', window: { kind: 'this', unit: 'day' } },
  { label: 'Yesterday', window: { kind: 'previous', unit: 'day' } },
  { label: 'Last 7 days', window: lastDays(7) },
  { label: 'Last 14 days', window: lastDays(14) },
  { label: 'Last 30 days', window: lastDays(30) },
  { label: 'Last 90 days', window: lastDays(90) },
  { label: 'This week', window: { kind: 'this', unit: 'week' } },
  { label: 'This month', window: { kind: 'this', unit: 'month' } },
  { label: 'Previous month', window: { kind: 'previous', unit: 'month' } },
];

/* ------------------------------------------------------------------ *
 * Operators
 * ------------------------------------------------------------------ */

export type PropertyOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_set'
  | 'is_not_set'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'not_in';

export type CountOperator =
  | 'count_gte'
  | 'count_lte'
  | 'count_eq'
  | 'count_gt'
  | 'count_lt'
  | 'count_between';

export type EventAggregation =
  | { kind: 'count' }
  | { kind: 'sum'; property: string }
  | { kind: 'avg'; property: string }
  | { kind: 'min'; property: string }
  | { kind: 'max'; property: string }
  | { kind: 'distinct_days' };

export const PROPERTY_OPERATOR_LABELS: Record<PropertyOperator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_set: 'is set',
  is_not_set: 'is not set',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  in: 'is one of',
  not_in: 'is not one of',
};

export const COUNT_OPERATOR_LABELS: Record<CountOperator, string> = {
  count_gte: 'at least',
  count_lte: 'at most',
  count_eq: 'exactly',
  count_gt: 'more than',
  count_lt: 'fewer than',
  count_between: 'between',
};

export const AGGREGATION_LABELS: Record<EventAggregation['kind'], string> = {
  count: 'times',
  sum: 'total of',
  avg: 'average of',
  min: 'minimum of',
  max: 'maximum of',
  distinct_days: 'distinct days',
};

/** Operators that take no right-hand value. */
export const NULLARY_OPERATORS: PropertyOperator[] = ['is_set', 'is_not_set'];

export function isNullaryOperator(op: PropertyOperator): boolean {
  return NULLARY_OPERATORS.includes(op);
}

/** Operators that take two right-hand values. */
export function isRangeOperator(op: PropertyOperator | CountOperator): boolean {
  return op === 'between' || op === 'count_between';
}

/** Operators whose value is a list. */
export function isListOperator(op: PropertyOperator | CountOperator): boolean {
  return op === 'in' || op === 'not_in';
}

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

export type ConditionKind =
  | 'property'
  | 'event'
  | 'sequence'
  | 'retention'
  | 'metric'
  | 'cohort'
  | 'relative_event'
  | 'account_rollup';

type ConditionBase = {
  id: string;
  /** Collapsed in the visual tree. */
  collapsed?: boolean;
  /** Free-form note surfaced in the explanation panel. */
  note?: string;
};

/** `plan = pro`, `signup_date after …`, `tier in [a,b]` */
export type PropertyCondition = ConditionBase & {
  kind: 'property';
  property: string;
  operator: PropertyOperator;
  value?: string | number | boolean | null;
  /** Second bound for `between`. */
  value2?: string | number | null;
  /** Values for `in` / `not_in`. */
  values?: (string | number)[];
  /** For date/timestamp properties — a relative window instead of a literal. */
  window?: TimeWindow;
};

export type EventPropertyFilter = {
  id: string;
  property: string;
  operator: PropertyOperator;
  value?: string | number | boolean | null;
  value2?: string | number | null;
  values?: (string | number)[];
};

/** `performed "Checkout Completed" >= 2 times where amount > 100, last 30 days` */
export type EventCondition = ConditionBase & {
  kind: 'event';
  event: string;
  /** `did` = performed, `did_not` = never performed. */
  performed: 'did' | 'did_not';
  aggregation: EventAggregation;
  operator: CountOperator;
  value: number;
  /** Second bound for `count_between`. */
  value2?: number;
  window: TimeWindow;
  filters: EventPropertyFilter[];
  /** Constrain on the first / last occurrence rather than the whole window. */
  occurrence?: 'any' | 'first' | 'last';
};

export type SequenceStep = {
  id: string;
  event: string;
  filters: EventPropertyFilter[];
  /** Max gap allowed between this step and the previous one. */
  maxGap?: { value: number; unit: TimeUnit };
  minGap?: { value: number; unit: TimeUnit };
};

/** Funnel / journey cohorts. */
export type SequenceCondition = ConditionBase & {
  kind: 'sequence';
  ordered: boolean;
  steps: SequenceStep[];
  window: TimeWindow;
  /** Overall conversion window across all steps. */
  conversionWindow?: { value: number; unit: TimeUnit };
  /** `completed` = matched every step; `dropped_off` = started but did not finish. */
  outcome: 'completed' | 'dropped_off';
  /** For `dropped_off`, the 1-indexed step they failed to reach (0 = any). */
  dropAtStep?: number;
};

export type RetentionPattern =
  | 'active_n_of_m'
  | 'active_every_period'
  | 'returned_after'
  | 'became_inactive'
  | 'reactivated'
  | 'increasing_activity'
  | 'declining_activity';

export const RETENTION_PATTERN_LABELS: Record<RetentionPattern, string> = {
  active_n_of_m: 'Active on N periods within the window',
  active_every_period: 'Active every period for N consecutive periods',
  returned_after: 'Returned after a period of silence',
  became_inactive: 'Became inactive',
  reactivated: 'Reactivated after churn',
  increasing_activity: 'Activity is increasing',
  declining_activity: 'Activity is declining',
};

/** `active 3+ days in the last 7`, `returned after 30 days of silence`, ... */
export type RetentionCondition = ConditionBase & {
  kind: 'retention';
  pattern: RetentionPattern;
  /** Which event counts as "active". Empty = any event. */
  event?: string;
  /** For `active_n_of_m`: how many periods must be active. */
  periods?: number;
  /** The size of one period. */
  periodUnit?: 'day' | 'week' | 'month';
  /** For `active_every_period`: how many consecutive periods. */
  consecutive?: number;
  /** For `returned_after` / `became_inactive`: the gap in days. */
  gapDays?: number;
  window: TimeWindow;
};

/** Numeric roll-ups that already live on the row (MRR, sessions, engagement score). */
export type MetricCondition = ConditionBase & {
  kind: 'metric';
  metric: string;
  operator: PropertyOperator;
  value: number;
  value2?: number;
  window?: TimeWindow;
};

/** Membership in another saved cohort. */
export type CohortMembershipCondition = ConditionBase & {
  kind: 'cohort';
  cohortSlug: string;
  cohortName?: string;
  member: boolean;
};

/** Cross-event relationships: A within N days after/before B. */
export type RelativeEventCondition = ConditionBase & {
  kind: 'relative_event';
  event: string;
  filters: EventPropertyFilter[];
  relation: 'within_after' | 'within_before' | 'after' | 'before' | 'never_after';
  anchorEvent: string;
  anchorFilters: EventPropertyFilter[];
  gap?: { value: number; unit: TimeUnit };
  /** Minimum number of matching occurrences. */
  minCount: number;
  window: TimeWindow;
};

/**
 * B2B: roll a condition up across every user in the account.
 * `any` / `all` / `none` / `count` over the member users.
 */
export type AccountRollupCondition = ConditionBase & {
  kind: 'account_rollup';
  mode: 'any' | 'all' | 'none' | 'count';
  /** For `count`. */
  operator?: CountOperator;
  value?: number;
  /** The condition each member user is tested against. */
  inner: CohortNode;
};

export type CohortCondition =
  | PropertyCondition
  | EventCondition
  | SequenceCondition
  | RetentionCondition
  | MetricCondition
  | CohortMembershipCondition
  | RelativeEventCondition
  | AccountRollupCondition;

export type GroupOperator = 'and' | 'or';

export type CohortGroup = {
  kind: 'group';
  id: string;
  operator: GroupOperator;
  /** Negates the whole group (`NOT (...)`). */
  negate?: boolean;
  collapsed?: boolean;
  children: CohortNode[];
};

export type CohortNode = CohortGroup | CohortCondition;

export type CohortIR = {
  version: number;
  entity: CohortEntity;
  /** Which schema the entity rows come from (defaults to `customer`). */
  schemaSlug: string;
  root: CohortGroup;
};

export function isGroup(node: CohortNode): node is CohortGroup {
  return node.kind === 'group';
}

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 11)}`;
}

export function createGroup(
  operator: GroupOperator = 'and',
  children: CohortNode[] = [],
): CohortGroup {
  return { kind: 'group', id: uid(), operator, children };
}

export function createCohortIR(entity: CohortEntity = 'user', schemaSlug = 'customer'): CohortIR {
  return { version: COHORT_IR_VERSION, entity, schemaSlug, root: createGroup('and') };
}

export function createPropertyCondition(
  property = '',
  operator: PropertyOperator = 'equals',
): PropertyCondition {
  return { kind: 'property', id: uid(), property, operator, value: '' };
}

export function createEventCondition(event = ''): EventCondition {
  return {
    kind: 'event',
    id: uid(),
    event,
    performed: 'did',
    aggregation: { kind: 'count' },
    operator: 'count_gte',
    value: 1,
    window: lastDays(30),
    filters: [],
    occurrence: 'any',
  };
}

export function createSequenceStep(event = ''): SequenceStep {
  return { id: uid(), event, filters: [] };
}

export function createSequenceCondition(): SequenceCondition {
  return {
    kind: 'sequence',
    id: uid(),
    ordered: true,
    steps: [createSequenceStep(), createSequenceStep()],
    window: lastDays(30),
    conversionWindow: { value: 7, unit: 'day' },
    outcome: 'completed',
  };
}

export function createRetentionCondition(): RetentionCondition {
  return {
    kind: 'retention',
    id: uid(),
    pattern: 'active_n_of_m',
    periods: 3,
    periodUnit: 'day',
    window: lastDays(7),
  };
}

export function createMetricCondition(metric = ''): MetricCondition {
  return { kind: 'metric', id: uid(), metric, operator: 'gte', value: 0 };
}

export function createCohortMembershipCondition(cohortSlug = ''): CohortMembershipCondition {
  return { kind: 'cohort', id: uid(), cohortSlug, member: true };
}

export function createRelativeEventCondition(): RelativeEventCondition {
  return {
    kind: 'relative_event',
    id: uid(),
    event: '',
    filters: [],
    relation: 'within_after',
    anchorEvent: '',
    anchorFilters: [],
    gap: { value: 7, unit: 'day' },
    minCount: 1,
    window: lastDays(90),
  };
}

export function createAccountRollupCondition(): AccountRollupCondition {
  return {
    kind: 'account_rollup',
    id: uid(),
    mode: 'count',
    operator: 'count_gte',
    value: 2,
    inner: createGroup('and', [createEventCondition()]),
  };
}

export function createEventPropertyFilter(property = ''): EventPropertyFilter {
  return { id: uid(), property, operator: 'equals', value: '' };
}

export function createConditionOfKind(kind: ConditionKind): CohortCondition {
  switch (kind) {
    case 'event':
      return createEventCondition();
    case 'sequence':
      return createSequenceCondition();
    case 'retention':
      return createRetentionCondition();
    case 'metric':
      return createMetricCondition();
    case 'cohort':
      return createCohortMembershipCondition();
    case 'relative_event':
      return createRelativeEventCondition();
    case 'account_rollup':
      return createAccountRollupCondition();
    default:
      return createPropertyCondition();
  }
}

export const CONDITION_KIND_META: Record<
  ConditionKind,
  { label: string; description: string; advanced?: boolean }
> = {
  property: {
    label: 'Attribute',
    description: 'Filter on a user or account property',
  },
  event: {
    label: 'Behaviour',
    description: 'Performed (or never performed) an event',
  },
  metric: {
    label: 'Metric',
    description: 'Revenue, engagement and usage roll-ups',
  },
  cohort: {
    label: 'Cohort membership',
    description: 'Is (or is not) in another saved cohort',
  },
  sequence: {
    label: 'Sequence',
    description: 'Completed — or dropped out of — a funnel',
    advanced: true,
  },
  retention: {
    label: 'Retention',
    description: 'Activity patterns over repeated periods',
    advanced: true,
  },
  relative_event: {
    label: 'Cross-event',
    description: 'One event relative to another in time',
    advanced: true,
  },
  account_rollup: {
    label: 'Account roll-up',
    description: 'Conditions across the users in an account',
    advanced: true,
  },
};

/* ------------------------------------------------------------------ *
 * Tree operations (all pure — the studio keeps IR in undo/redo history)
 * ------------------------------------------------------------------ */

export function cloneIR(ir: CohortIR): CohortIR {
  return JSON.parse(JSON.stringify(ir)) as CohortIR;
}

/** Deep clone with fresh ids, so a duplicated subtree never collides. */
export function cloneNodeWithNewIds(node: CohortNode): CohortNode {
  const copy = JSON.parse(JSON.stringify(node)) as CohortNode;
  reassignIds(copy);
  return copy;
}

function reassignIds(node: CohortNode): void {
  node.id = uid();
  if (isGroup(node)) {
    node.children.forEach(reassignIds);
    return;
  }
  if (node.kind === 'event') {
    node.filters = node.filters.map((f) => ({ ...f, id: uid() }));
  }
  if (node.kind === 'relative_event') {
    node.filters = node.filters.map((f) => ({ ...f, id: uid() }));
    node.anchorFilters = node.anchorFilters.map((f) => ({ ...f, id: uid() }));
  }
  if (node.kind === 'sequence') {
    node.steps = node.steps.map((s) => ({
      ...s,
      id: uid(),
      filters: s.filters.map((f) => ({ ...f, id: uid() })),
    }));
  }
  if (node.kind === 'account_rollup') {
    reassignIds(node.inner);
  }
}

function mapTree(node: CohortNode, fn: (n: CohortNode) => CohortNode): CohortNode {
  const mapped = fn(node);
  if (isGroup(mapped)) {
    return { ...mapped, children: mapped.children.map((c) => mapTree(c, fn)) };
  }
  if (mapped.kind === 'account_rollup') {
    return { ...mapped, inner: mapTree(mapped.inner, fn) };
  }
  return mapped;
}

export function updateNode(ir: CohortIR, id: string, patch: Record<string, unknown>): CohortIR {
  const root = mapTree(ir.root, (n) =>
    n.id === id ? ({ ...n, ...patch } as CohortNode) : n,
  ) as CohortGroup;
  return { ...ir, root };
}

export function replaceNode(ir: CohortIR, id: string, next: CohortNode): CohortIR {
  const root = mapTree(ir.root, (n) => (n.id === id ? next : n)) as CohortGroup;
  return { ...ir, root };
}

export function findNode(node: CohortNode, id: string): CohortNode | null {
  if (node.id === id) return node;
  if (isGroup(node)) {
    for (const child of node.children) {
      const hit = findNode(child, id);
      if (hit) return hit;
    }
    return null;
  }
  if (node.kind === 'account_rollup') return findNode(node.inner, id);
  return null;
}

export function findParent(node: CohortNode, id: string): CohortGroup | null {
  if (!isGroup(node)) {
    if (node.kind === 'account_rollup') return findParent(node.inner, id);
    return null;
  }
  if (node.children.some((c) => c.id === id)) return node;
  for (const child of node.children) {
    const hit = findParent(child, id);
    if (hit) return hit;
  }
  return null;
}

export function addNode(
  ir: CohortIR,
  groupId: string,
  child: CohortNode,
  index?: number,
): CohortIR {
  const root = mapTree(ir.root, (n) => {
    if (n.id !== groupId || !isGroup(n)) return n;
    const children = [...n.children];
    children.splice(index ?? children.length, 0, child);
    return { ...n, children };
  }) as CohortGroup;
  return { ...ir, root };
}

export function removeNode(ir: CohortIR, id: string): CohortIR {
  const root = mapTree(ir.root, (n) =>
    isGroup(n) ? { ...n, children: n.children.filter((c) => c.id !== id) } : n,
  ) as CohortGroup;
  return { ...ir, root };
}

export function duplicateNode(ir: CohortIR, id: string): CohortIR {
  const parent = findParent(ir.root, id);
  const node = findNode(ir.root, id);
  if (!parent || !node) return ir;
  const index = parent.children.findIndex((c) => c.id === id);
  return addNode(ir, parent.id, cloneNodeWithNewIds(node), index + 1);
}

/** Move a node within its own group. Returns the IR unchanged if out of bounds. */
export function reorderNode(ir: CohortIR, id: string, delta: number): CohortIR {
  const parent = findParent(ir.root, id);
  if (!parent) return ir;
  const from = parent.children.findIndex((c) => c.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= parent.children.length) return ir;
  const children = [...parent.children];
  const [moved] = children.splice(from, 1);
  children.splice(to, 0, moved);
  const root = mapTree(ir.root, (n) =>
    n.id === parent.id ? { ...(n as CohortGroup), children } : n,
  ) as CohortGroup;
  return { ...ir, root };
}

/** Drag-and-drop: move `id` into `targetGroupId` at `index`. */
export function moveNode(
  ir: CohortIR,
  id: string,
  targetGroupId: string,
  index: number,
): CohortIR {
  const node = findNode(ir.root, id);
  if (!node || id === targetGroupId) return ir;
  // Refuse to drop a group into its own subtree.
  if (isGroup(node) && findNode(node, targetGroupId)) return ir;

  const parent = findParent(ir.root, id);
  let targetIndex = index;
  if (parent?.id === targetGroupId) {
    const from = parent.children.findIndex((c) => c.id === id);
    if (from > -1 && from < index) targetIndex = index - 1;
  }
  const without = removeNode(ir, id);
  return addNode(without, targetGroupId, node, targetIndex);
}

/** Wrap a node in a new group — the "add nesting" affordance. */
export function wrapInGroup(ir: CohortIR, id: string, operator: GroupOperator = 'or'): CohortIR {
  const node = findNode(ir.root, id);
  if (!node || node.id === ir.root.id) return ir;
  return replaceNode(ir, id, createGroup(operator, [node]));
}

/** Collapse single-child groups and drop empty ones — used by "simplify". */
export function simplifyIR(ir: CohortIR): CohortIR {
  const rootId = ir.root.id;
  function walk(node: CohortNode): CohortNode | null {
    if (!isGroup(node)) {
      if (node.kind === 'account_rollup') {
        const inner = walk(node.inner);
        return inner ? { ...node, inner } : null;
      }
      return node;
    }
    const children = node.children.map(walk).filter(Boolean) as CohortNode[];
    // Flatten a nested, non-negated group with the same operator.
    const flattened: CohortNode[] = [];
    for (const child of children) {
      if (isGroup(child) && !child.negate && child.operator === node.operator) {
        flattened.push(...child.children);
      } else {
        flattened.push(child);
      }
    }
    if (!flattened.length) return node.id === rootId ? { ...node, children: [] } : null;
    if (flattened.length === 1 && !node.negate && node.id !== rootId) return flattened[0];
    return { ...node, children: flattened };
  }
  const root = walk(ir.root);
  return {
    ...ir,
    root: root && isGroup(root) ? root : createGroup('and', root ? [root] : []),
  };
}

export function countConditions(node: CohortNode): number {
  if (!isGroup(node)) {
    return node.kind === 'account_rollup' ? 1 + countConditions(node.inner) : 1;
  }
  return node.children.reduce((sum, c) => sum + countConditions(c), 0);
}

export function maxDepth(node: CohortNode, depth = 0): number {
  if (!isGroup(node) || !node.children.length) return depth;
  return Math.max(...node.children.map((c) => maxDepth(c, depth + 1)));
}

export function collectConditions(
  node: CohortNode,
  out: CohortCondition[] = [],
): CohortCondition[] {
  if (isGroup(node)) {
    node.children.forEach((c) => collectConditions(c, out));
  } else {
    out.push(node);
    if (node.kind === 'account_rollup') collectConditions(node.inner, out);
  }
  return out;
}

/** Every event name referenced anywhere in the tree. */
export function referencedEvents(ir: CohortIR): string[] {
  const names = new Set<string>();
  for (const c of collectConditions(ir.root)) {
    if (c.kind === 'event' && c.event) names.add(c.event);
    if (c.kind === 'retention' && c.event) names.add(c.event);
    if (c.kind === 'relative_event') {
      if (c.event) names.add(c.event);
      if (c.anchorEvent) names.add(c.anchorEvent);
    }
    if (c.kind === 'sequence') c.steps.forEach((s) => s.event && names.add(s.event));
  }
  return [...names];
}

/** Every property/metric key referenced anywhere in the tree. */
export function referencedProperties(ir: CohortIR): string[] {
  const keys = new Set<string>();
  for (const c of collectConditions(ir.root)) {
    if (c.kind === 'property' && c.property) keys.add(c.property);
    if (c.kind === 'metric' && c.metric) keys.add(c.metric);
    if (c.kind === 'event') c.filters.forEach((f) => f.property && keys.add(f.property));
    if (c.kind === 'relative_event') {
      c.filters.forEach((f) => f.property && keys.add(f.property));
      c.anchorFilters.forEach((f) => f.property && keys.add(f.property));
    }
    if (c.kind === 'sequence') {
      c.steps.forEach((s) => s.filters.forEach((f) => f.property && keys.add(f.property)));
    }
  }
  return [...keys];
}

/** True when nothing has been defined yet — drives the empty state. */
export function isEmptyIR(ir: CohortIR | null | undefined): boolean {
  return !ir || !ir.root.children.length;
}

/* ------------------------------------------------------------------ *
 * Legacy bridge — every existing cohort is stored as a `FilterRoot`
 * ------------------------------------------------------------------ */

const LEGACY_OP_MAP: Partial<Record<FilterOperator, PropertyOperator>> = {
  contains: 'contains',
  not_contains: 'not_contains',
  equals: 'equals',
  not_equals: 'not_equals',
  starts_with: 'starts_with',
  ends_with: 'ends_with',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  is_empty: 'is_not_set',
  is_not_empty: 'is_set',
};

const IR_OP_TO_LEGACY: Partial<Record<PropertyOperator, FilterOperator>> = {
  contains: 'contains',
  not_contains: 'not_contains',
  equals: 'equals',
  not_equals: 'not_equals',
  starts_with: 'starts_with',
  ends_with: 'ends_with',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  is_set: 'is_not_empty',
  is_not_set: 'is_empty',
};

/**
 * Read a stored `filter_json` as IR. Existing cohorts keep working: their
 * flat/nested attribute rules become `property` conditions.
 */
export function irFromFilterRoot(root: FilterRoot, schemaSlug = 'customer'): CohortIR {
  const ir = createCohortIR('user', schemaSlug);
  ir.root = filterGroupToCohortGroup(root);
  return ir;
}

function filterGroupToCohortGroup(group: FilterRoot): CohortGroup {
  const negate = group.logic === 'not' || group.logic === 'except';
  const operator: GroupOperator = group.logic === 'or' ? 'or' : 'and';
  const children: CohortNode[] = [];

  for (const child of (group.children ?? []) as FilterNode[]) {
    if (child.type === 'group') {
      children.push(filterGroupToCohortGroup(child));
      continue;
    }
    const property = child.left.kind === 'field' ? child.left.field : '';
    const rawValue = child.right.kind === 'literal' ? child.right.value : '';
    const op = LEGACY_OP_MAP[child.operator] ?? 'equals';
    const cond: PropertyCondition = {
      kind: 'property',
      id: child.id || uid(),
      property,
      operator: op,
      value: isNullaryOperator(op) ? undefined : String(rawValue ?? ''),
    };
    // A `not`/`except` join on a leaf means "exclude this rule".
    if (child.join === 'not' || child.join === 'except') {
      children.push({ ...createGroup('and', [cond]), negate: true });
    } else {
      children.push(cond);
    }
  }

  const out = createGroup(operator, children);
  if (negate) out.negate = true;
  return out;
}

/**
 * Compile IR back down to the legacy `FilterRoot` so cohorts stay readable by
 * the old evaluator, the campaign audience picker and anything else already
 * reading `filter_json`. Behavioural conditions have no legacy form, so they
 * are dropped — `irNeedsIrEvaluation` reports when that has happened.
 */
export function filterRootFromIR(ir: CohortIR): FilterRoot {
  return cohortGroupToFilterGroup(ir.root);
}

function cohortGroupToFilterGroup(group: CohortGroup): FilterRoot {
  const children: FilterNode[] = [];
  for (const child of group.children) {
    if (isGroup(child)) {
      const nested = cohortGroupToFilterGroup(child);
      if (nested.children.length) {
        children.push({
          ...nested,
          join: child.negate ? 'except' : group.operator,
        } as FilterNode);
      }
      continue;
    }
    if (child.kind !== 'property') continue; // behavioural rules have no legacy form
    const legacyOp = IR_OP_TO_LEGACY[child.operator];
    if (!legacyOp) continue;
    children.push({
      type: 'condition',
      id: child.id,
      join: children.length === 0 ? undefined : group.operator,
      left: { kind: 'field', field: child.property },
      operator: legacyOp,
      right: { kind: 'literal', value: String(child.value ?? '') },
    } as FilterNode);
  }
  return {
    type: 'group',
    id: group.id,
    logic: group.negate ? 'not' : group.operator,
    children,
  };
}

/** True when the IR contains rules the legacy `FilterRoot` evaluator cannot run. */
export function irNeedsIrEvaluation(ir: CohortIR): boolean {
  return collectConditions(ir.root).some((c) => c.kind !== 'property');
}

/** Parse whatever is stored in `ir_json`, falling back to a legacy filter tree. */
export function parseCohortIR(
  irJson: unknown,
  filterJson: FilterRoot,
  schemaSlug = 'customer',
): CohortIR {
  if (
    irJson &&
    typeof irJson === 'object' &&
    (irJson as CohortIR).root &&
    (irJson as CohortIR).root.kind === 'group'
  ) {
    const parsed = irJson as CohortIR;
    return {
      version: parsed.version ?? COHORT_IR_VERSION,
      entity: parsed.entity ?? 'user',
      schemaSlug: parsed.schemaSlug ?? schemaSlug,
      root: parsed.root,
    };
  }
  return irFromFilterRoot(filterJson, schemaSlug);
}
