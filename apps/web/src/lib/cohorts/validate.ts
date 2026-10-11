/**
 * Validation engine.
 *
 * Sits between IR production (visual builder / AI agent / template) and IR
 * consumption (compile, evaluate, save). Nothing is compiled or run until it
 * passes here, which is the guardrail that stops the agent referencing events
 * or properties that do not exist.
 */
import {
  collectConditions,
  countConditions,
  isGroup,
  isListOperator,
  isNullaryOperator,
  isRangeOperator,
  maxDepth,
  resolveWindow,
  type CohortCondition,
  type CohortIR,
  type CohortNode,
  type EventPropertyFilter,
  type TimeWindow,
} from './ir';
import {
  findEvent,
  findMetric,
  findProperty,
  suggestEvents,
  suggestMetrics,
  suggestProperties,
  type SemanticCatalog,
} from './catalog';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssue = {
  severity: ValidationSeverity;
  /** Node the issue belongs to, so the tree can highlight it. */
  nodeId?: string;
  message: string;
  /** Machine-readable code, used by the AI agent to phrase clarifications. */
  code:
    | 'unknown_event'
    | 'unknown_property'
    | 'unknown_metric'
    | 'unknown_cohort'
    | 'missing_value'
    | 'empty_group'
    | 'empty_cohort'
    | 'invalid_range'
    | 'invalid_window'
    | 'sequence_too_short'
    | 'expensive'
    | 'stale_data'
    | 'low_coverage'
    | 'contradiction'
    | 'redundant'
    | 'depth';
  /** Suggested replacements — surfaced as "did you mean …?" chips. */
  suggestions?: { label: string; value: string }[];
};

export type QueryCost = 'instant' | 'fast' | 'moderate' | 'heavy';

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Rough cost class, used for the query-performance indicator. */
  cost: QueryCost;
  /** Estimated seconds — shown as "~12 seconds" on heavy queries. */
  estimatedSeconds: number;
  conditionCount: number;
  depth: number;
};

const MAX_RECOMMENDED_DEPTH = 6;

function issue(
  severity: ValidationSeverity,
  code: ValidationIssue['code'],
  message: string,
  nodeId?: string,
  suggestions?: ValidationIssue['suggestions'],
): ValidationIssue {
  return { severity, code, message, nodeId, suggestions };
}

function validateWindow(win: TimeWindow | undefined, nodeId: string, out: ValidationIssue[]): void {
  if (!win) return;
  if (win.kind === 'last' && (!Number.isFinite(win.value) || win.value <= 0)) {
    out.push(issue('error', 'invalid_window', 'Time window must be a positive number.', nodeId));
  }
  if (win.kind === 'between') {
    const { from, to } = resolveWindow(win);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      out.push(issue('error', 'invalid_window', 'Date range is not a valid date.', nodeId));
    } else if (from > to) {
      out.push(issue('error', 'invalid_window', 'Date range starts after it ends.', nodeId));
    }
  }
}

function validateValuePresence(
  operator: string,
  value: unknown,
  values: unknown[] | undefined,
  value2: unknown,
  nodeId: string,
  label: string,
  out: ValidationIssue[],
): void {
  if (isNullaryOperator(operator as never)) return;
  if (isListOperator(operator as never)) {
    if (!values?.length) {
      out.push(issue('error', 'missing_value', `${label} needs at least one value.`, nodeId));
    }
    return;
  }
  if (value === '' || value == null) {
    out.push(issue('error', 'missing_value', `${label} is missing a value.`, nodeId));
  }
  if (isRangeOperator(operator as never)) {
    if (value2 === '' || value2 == null) {
      out.push(issue('error', 'invalid_range', `${label} needs an upper bound.`, nodeId));
    } else if (Number(value2) < Number(value)) {
      out.push(issue('error', 'invalid_range', `${label}: upper bound is below the lower bound.`, nodeId));
    }
  }
}

function validateEventFilters(
  filters: EventPropertyFilter[],
  eventName: string,
  catalog: SemanticCatalog,
  nodeId: string,
  out: ValidationIssue[],
): void {
  const known = findEvent(catalog, eventName);
  for (const f of filters) {
    if (!f.property) {
      out.push(issue('error', 'missing_value', 'Event filter has no property selected.', nodeId));
      continue;
    }
    if (known && known.properties.length && !known.properties.some((p) => p.key === f.property)) {
      const near = known.properties
        .filter((p) => p.key.includes(f.property) || f.property.includes(p.key))
        .slice(0, 3);
      out.push(
        issue(
          'warning',
          'unknown_property',
          `"${f.property}" has not been seen on ${eventName} events.`,
          nodeId,
          near.map((p) => ({ label: p.label, value: p.key })),
        ),
      );
    }
    validateValuePresence(
      f.operator,
      f.value,
      f.values,
      f.value2,
      nodeId,
      `Filter on ${f.property}`,
      out,
    );
  }
}

function validateCondition(
  cond: CohortCondition,
  catalog: SemanticCatalog,
  out: ValidationIssue[],
): void {
  switch (cond.kind) {
    case 'property': {
      if (!cond.property) {
        out.push(issue('error', 'missing_value', 'No property selected.', cond.id));
        break;
      }
      if (!findProperty(catalog, cond.property)) {
        out.push(
          issue(
            'error',
            'unknown_property',
            `"${cond.property}" is not a property on ${catalog.entityLabel}.`,
            cond.id,
            suggestProperties(catalog, cond.property, 3).map((s) => ({
              label: s.item.label,
              value: s.item.key,
            })),
          ),
        );
        break;
      }
      validateValuePresence(
        cond.operator,
        cond.value,
        cond.values,
        cond.value2,
        cond.id,
        findProperty(catalog, cond.property)?.label ?? cond.property,
        out,
      );
      validateWindow(cond.window, cond.id, out);
      const prop = findProperty(catalog, cond.property);
      if (prop && prop.coverage !== undefined && prop.coverage < 0.1) {
        out.push(
          issue(
            'warning',
            'low_coverage',
            `${prop.label} is set on only ${Math.round(prop.coverage * 100)}% of records — this rule will exclude most people.`,
            cond.id,
          ),
        );
      }
      break;
    }

    case 'event': {
      if (!cond.event) {
        out.push(issue('error', 'missing_value', 'No event selected.', cond.id));
        break;
      }
      if (!findEvent(catalog, cond.event)) {
        out.push(
          issue(
            'error',
            'unknown_event',
            `I couldn't find an event called "${cond.event}".`,
            cond.id,
            suggestEvents(catalog, cond.event, 3).map((s) => ({
              label: s.item.label,
              value: s.item.name,
            })),
          ),
        );
        break;
      }
      if (cond.performed === 'did') {
        if (!Number.isFinite(cond.value) || cond.value < 0) {
          out.push(issue('error', 'missing_value', 'Event count must be zero or more.', cond.id));
        }
        if (cond.operator === 'count_between' && (cond.value2 ?? 0) < cond.value) {
          out.push(issue('error', 'invalid_range', 'Event count range is inverted.', cond.id));
        }
      }
      if (cond.aggregation.kind !== 'count' && cond.aggregation.kind !== 'distinct_days') {
        const target = cond.aggregation.property;
        const ev = findEvent(catalog, cond.event);
        if (!target) {
          out.push(issue('error', 'missing_value', 'Aggregation needs a numeric event property.', cond.id));
        } else if (ev && ev.properties.length && !ev.properties.some((p) => p.key === target)) {
          out.push(
            issue('warning', 'unknown_property', `"${target}" has not been seen on ${cond.event}.`, cond.id),
          );
        }
      }
      validateWindow(cond.window, cond.id, out);
      validateEventFilters(cond.filters, cond.event, catalog, cond.id, out);
      break;
    }

    case 'sequence': {
      const filled = cond.steps.filter((s) => s.event);
      if (filled.length < 2) {
        out.push(
          issue('error', 'sequence_too_short', 'A sequence needs at least two steps with events.', cond.id),
        );
      }
      for (const step of cond.steps) {
        if (!step.event) continue;
        if (!findEvent(catalog, step.event)) {
          out.push(
            issue(
              'error',
              'unknown_event',
              `Sequence step references unknown event "${step.event}".`,
              cond.id,
              suggestEvents(catalog, step.event, 3).map((s) => ({
                label: s.item.label,
                value: s.item.name,
              })),
            ),
          );
          continue;
        }
        validateEventFilters(step.filters, step.event, catalog, cond.id, out);
      }
      if (cond.outcome === 'dropped_off' && (cond.dropAtStep ?? 0) > cond.steps.length) {
        out.push(issue('error', 'invalid_range', 'Drop-off step is beyond the end of the sequence.', cond.id));
      }
      validateWindow(cond.window, cond.id, out);
      out.push(
        issue('info', 'expensive', 'Sequence conditions scan the full event stream per person.', cond.id),
      );
      break;
    }

    case 'retention': {
      if (cond.event && !findEvent(catalog, cond.event)) {
        out.push(
          issue(
            'error',
            'unknown_event',
            `Retention rule references unknown event "${cond.event}".`,
            cond.id,
            suggestEvents(catalog, cond.event, 3).map((s) => ({
              label: s.item.label,
              value: s.item.name,
            })),
          ),
        );
      }
      if (cond.pattern === 'active_n_of_m' && (!cond.periods || cond.periods < 1)) {
        out.push(issue('error', 'missing_value', 'Retention needs at least one active period.', cond.id));
      }
      if (
        (cond.pattern === 'returned_after' ||
          cond.pattern === 'became_inactive' ||
          cond.pattern === 'reactivated') &&
        (!cond.gapDays || cond.gapDays < 1)
      ) {
        out.push(issue('error', 'missing_value', 'Retention needs a gap in days.', cond.id));
      }
      validateWindow(cond.window, cond.id, out);
      break;
    }

    case 'metric': {
      if (!cond.metric) {
        out.push(issue('error', 'missing_value', 'No metric selected.', cond.id));
        break;
      }
      if (!findMetric(catalog, cond.metric)) {
        out.push(
          issue(
            'error',
            'unknown_metric',
            `"${cond.metric}" is not an available metric.`,
            cond.id,
            suggestMetrics(catalog, cond.metric, 3).map((s) => ({
              label: s.item.label,
              value: s.item.key,
            })),
          ),
        );
        break;
      }
      if (!Number.isFinite(cond.value)) {
        out.push(issue('error', 'missing_value', 'Metric threshold must be a number.', cond.id));
      }
      if (isRangeOperator(cond.operator) && (cond.value2 ?? 0) < cond.value) {
        out.push(issue('error', 'invalid_range', 'Metric range is inverted.', cond.id));
      }
      break;
    }

    case 'cohort': {
      if (!cond.cohortSlug) {
        out.push(issue('error', 'missing_value', 'No cohort selected.', cond.id));
        break;
      }
      if (!catalog.cohorts.some((c) => c.slug === cond.cohortSlug)) {
        out.push(
          issue(
            'error',
            'unknown_cohort',
            `Cohort "${cond.cohortSlug}" no longer exists.`,
            cond.id,
            catalog.cohorts.slice(0, 3).map((c) => ({ label: c.name, value: c.slug })),
          ),
        );
      }
      break;
    }

    case 'relative_event': {
      for (const [name, label] of [
        [cond.event, 'Event'],
        [cond.anchorEvent, 'Anchor event'],
      ] as const) {
        if (!name) {
          out.push(issue('error', 'missing_value', `${label} is not selected.`, cond.id));
          continue;
        }
        if (!findEvent(catalog, name)) {
          out.push(
            issue(
              'error',
              'unknown_event',
              `${label} "${name}" does not exist.`,
              cond.id,
              suggestEvents(catalog, name, 3).map((s) => ({
                label: s.item.label,
                value: s.item.name,
              })),
            ),
          );
        }
      }
      if (
        (cond.relation === 'within_after' || cond.relation === 'within_before' || cond.relation === 'never_after') &&
        (!cond.gap || cond.gap.value <= 0)
      ) {
        out.push(issue('error', 'missing_value', 'Relative window needs a positive gap.', cond.id));
      }
      validateEventFilters(cond.filters, cond.event, catalog, cond.id, out);
      validateEventFilters(cond.anchorFilters, cond.anchorEvent, catalog, cond.id, out);
      validateWindow(cond.window, cond.id, out);
      out.push(
        issue('info', 'expensive', 'Cross-event rules compare every occurrence pair per person.', cond.id),
      );
      break;
    }

    case 'account_rollup': {
      if (cond.mode === 'count' && (!Number.isFinite(cond.value ?? NaN) || (cond.value ?? 0) < 0)) {
        out.push(issue('error', 'missing_value', 'Account roll-up needs a user count.', cond.id));
      }
      if (isGroup(cond.inner) && !cond.inner.children.length) {
        out.push(issue('error', 'empty_group', 'Account roll-up has no inner condition.', cond.id));
      }
      out.push(
        issue('info', 'expensive', 'Account roll-ups evaluate every user in every account.', cond.id),
      );
      break;
    }
  }
}

/** Cheap contradiction / redundancy detection across sibling property rules. */
function detectLogicSmells(node: CohortNode, out: ValidationIssue[]): void {
  if (!isGroup(node)) {
    if (node.kind === 'account_rollup') detectLogicSmells(node.inner, out);
    return;
  }
  if (node.operator === 'and') {
    const equalityByProp = new Map<string, Set<string>>();
    for (const child of node.children) {
      if (isGroup(child) || child.kind !== 'property' || child.operator !== 'equals') continue;
      const set = equalityByProp.get(child.property) ?? new Set<string>();
      set.add(String(child.value ?? ''));
      equalityByProp.set(child.property, set);
    }
    for (const [prop, values] of equalityByProp) {
      if (values.size > 1) {
        out.push(
          issue(
            'warning',
            'contradiction',
            `"${prop}" is required to equal ${[...values].map((v) => `"${v}"`).join(' and ')} at the same time — nobody can match. Use OR, or "is one of".`,
            node.id,
          ),
        );
      }
    }
  }

  const seen = new Map<string, string>();
  for (const child of node.children) {
    if (isGroup(child)) continue;
    const sig = JSON.stringify({ ...child, id: undefined, collapsed: undefined, note: undefined });
    if (seen.has(sig)) {
      out.push(issue('warning', 'redundant', 'This condition duplicates a sibling condition.', child.id));
    } else {
      seen.set(sig, child.id);
    }
  }

  node.children.forEach((c) => detectLogicSmells(c, out));
}

function detectEmptyGroups(node: CohortNode, out: ValidationIssue[], isRoot: boolean): void {
  if (!isGroup(node)) {
    if (node.kind === 'account_rollup') detectEmptyGroups(node.inner, out, false);
    return;
  }
  if (!node.children.length && !isRoot) {
    out.push(issue('warning', 'empty_group', 'This group is empty and will be ignored.', node.id));
  }
  node.children.forEach((c) => detectEmptyGroups(c, out, false));
}

/** Rough execution-cost model, mirrored in the query performance indicator. */
export function estimateCost(
  ir: CohortIR,
  catalog: SemanticCatalog,
): { cost: QueryCost; seconds: number } {
  const conditions = collectConditions(ir.root);
  let units = catalog.sampleSize / 5000;

  for (const c of conditions) {
    switch (c.kind) {
      case 'property':
      case 'cohort':
        units += 0.1;
        break;
      case 'metric':
        units += 0.2;
        break;
      case 'event':
        units += 1 + (findEvent(catalog, c.event)?.volume ?? 0) / 20000;
        break;
      case 'retention':
        units += 2;
        break;
      case 'sequence':
        units += 2 + c.steps.length * 1.2;
        break;
      case 'relative_event':
        units += 4;
        break;
      case 'account_rollup':
        units += 3;
        break;
    }
  }

  const seconds = Math.max(0.2, Math.round(units * 1.2 * 10) / 10);
  const cost: QueryCost =
    seconds < 1 ? 'instant' : seconds < 4 ? 'fast' : seconds < 12 ? 'moderate' : 'heavy';
  return { cost, seconds };
}

export function validateCohortIR(ir: CohortIR, catalog: SemanticCatalog): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!ir.root.children.length) {
    issues.push(
      issue(
        'warning',
        'empty_cohort',
        'This cohort has no conditions yet — it currently matches everyone.',
        ir.root.id,
      ),
    );
  }

  for (const cond of collectConditions(ir.root)) {
    validateCondition(cond, catalog, issues);
  }
  detectEmptyGroups(ir.root, issues, true);
  detectLogicSmells(ir.root, issues);

  const depth = maxDepth(ir.root);
  if (depth > MAX_RECOMMENDED_DEPTH) {
    issues.push(
      issue(
        'warning',
        'depth',
        `Logic is nested ${depth} levels deep — consider flattening it or splitting into two cohorts.`,
        ir.root.id,
      ),
    );
  }

  const { cost, seconds } = estimateCost(ir, catalog);
  if (cost === 'heavy') {
    issues.push(
      issue(
        'warning',
        'expensive',
        `This definition is expensive — roughly ${seconds}s per refresh. Narrow the time windows or reduce behavioural rules.`,
      ),
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
    cost,
    estimatedSeconds: seconds,
    conditionCount: countConditions(ir.root),
    depth,
  };
}

/** Issues attached to one node — used to badge rows in the visual tree. */
export function issuesForNode(result: ValidationResult, nodeId: string): ValidationIssue[] {
  return result.issues.filter((i) => i.nodeId === nodeId);
}

export const COST_LABELS: Record<QueryCost, { label: string; tone: 'good' | 'ok' | 'warn' | 'bad' }> = {
  instant: { label: 'Instant', tone: 'good' },
  fast: { label: 'Fast', tone: 'good' },
  moderate: { label: 'Moderate', tone: 'ok' },
  heavy: { label: 'Expensive', tone: 'warn' },
};
