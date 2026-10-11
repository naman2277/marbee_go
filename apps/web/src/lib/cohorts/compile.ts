/**
 * Query compiler.
 *
 * IR in, artefacts out: SQL, JSON, and plain English. The AI agent never writes
 * SQL — it writes IR, the validator checks it, and this module compiles it. That
 * separation is what makes the generated query inspectable, versionable and
 * safe to show a user.
 */
import {
  AGGREGATION_LABELS,
  COUNT_OPERATOR_LABELS,
  PROPERTY_OPERATOR_LABELS,
  RETENTION_PATTERN_LABELS,
  collectConditions,
  describeWindow,
  isGroup,
  isListOperator,
  isNullaryOperator,
  isRangeOperator,

  type CohortCondition,
  type CohortGroup,
  type CohortIR,
  type CohortNode,
  type CountOperator,
  type EventPropertyFilter,
  type PropertyOperator,
  type TimeWindow,
} from './ir';
import { findEvent, findMetric, findProperty, type SemanticCatalog } from './catalog';

/* ------------------------------------------------------------------ *
 * SQL
 * ------------------------------------------------------------------ */

/** Single-quote escape. Values are always emitted as literals, never concatenated user SQL. */
function lit(value: unknown): string {
  if (value == null || value === '') return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const s = String(value);
  if (s === 'true' || s === 'false') return s.toUpperCase();
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}

function ident(name: string): string {
  return /^[a-z_][a-z0-9_]*$/i.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

function windowSql(win: TimeWindow | undefined, column = 'e.timestamp'): string | null {
  if (!win || win.kind === 'all_time') return null;
  switch (win.kind) {
    case 'last':
      return `${column} >= NOW() - INTERVAL '${win.value} ${win.unit}'`;
    case 'this':
      return `${column} >= DATE_TRUNC('${win.unit}', NOW())`;
    case 'previous':
      return `${column} >= DATE_TRUNC('${win.unit}', NOW()) - INTERVAL '1 ${win.unit}' AND ${column} < DATE_TRUNC('${win.unit}', NOW())`;
    case 'before':
      return `${column} < ${lit(win.date)}::timestamptz`;
    case 'after':
      return `${column} >= ${lit(win.date)}::timestamptz`;
    case 'between':
      return `${column} >= ${lit(win.start)}::timestamptz AND ${column} < ${lit(win.end)}::timestamptz`;
    default:
      return null;
  }
}

function comparisonSql(
  lhs: string,
  operator: PropertyOperator,
  value: unknown,
  value2: unknown,
  values: (string | number)[] | undefined,
): string {
  switch (operator) {
    case 'equals':
      return `${lhs} = ${lit(value)}`;
    case 'not_equals':
      return `(${lhs} IS DISTINCT FROM ${lit(value)})`;
    case 'contains':
      return `${lhs} ILIKE ${lit(`%${value}%`)}`;
    case 'not_contains':
      return `(${lhs} IS NULL OR ${lhs} NOT ILIKE ${lit(`%${value}%`)})`;
    case 'starts_with':
      return `${lhs} ILIKE ${lit(`${value}%`)}`;
    case 'ends_with':
      return `${lhs} ILIKE ${lit(`%${value}`)}`;
    case 'is_set':
      return `(${lhs} IS NOT NULL AND ${lhs}::text <> '')`;
    case 'is_not_set':
      return `(${lhs} IS NULL OR ${lhs}::text = '')`;
    case 'gt':
      return `${lhs} > ${lit(value)}`;
    case 'gte':
      return `${lhs} >= ${lit(value)}`;
    case 'lt':
      return `${lhs} < ${lit(value)}`;
    case 'lte':
      return `${lhs} <= ${lit(value)}`;
    case 'between':
      return `${lhs} BETWEEN ${lit(value)} AND ${lit(value2)}`;
    case 'in':
      return `${lhs} IN (${(values ?? []).map(lit).join(', ') || 'NULL'})`;
    case 'not_in':
      return `${lhs} NOT IN (${(values ?? []).map(lit).join(', ') || 'NULL'})`;
    default:
      return 'TRUE';
  }
}

function countComparisonSql(expr: string, operator: CountOperator, value: number, value2?: number): string {
  switch (operator) {
    case 'count_gte':
      return `${expr} >= ${value}`;
    case 'count_lte':
      return `${expr} <= ${value}`;
    case 'count_eq':
      return `${expr} = ${value}`;
    case 'count_gt':
      return `${expr} > ${value}`;
    case 'count_lt':
      return `${expr} < ${value}`;
    case 'count_between':
      return `${expr} BETWEEN ${value} AND ${value2 ?? value}`;
    default:
      return 'TRUE';
  }
}

function eventFilterSql(filters: EventPropertyFilter[], alias = 'e'): string[] {
  return filters
    .filter((f) => f.property)
    .map((f) => {
      const lhs = `${alias}.properties ->> ${lit(f.property)}`;
      const numeric = ['gt', 'gte', 'lt', 'lte', 'between'].includes(f.operator);
      return comparisonSql(
        numeric ? `(${lhs})::numeric` : lhs,
        f.operator,
        f.value,
        f.value2,
        f.values,
      );
    });
}

function aggregationSql(cond: Extract<CohortCondition, { kind: 'event' }>): string {
  switch (cond.aggregation.kind) {
    case 'count':
      return 'COUNT(*)';
    case 'distinct_days':
      return 'COUNT(DISTINCT DATE_TRUNC(\'day\', e.timestamp))';
    case 'sum':
      return `COALESCE(SUM((e.properties ->> ${lit(cond.aggregation.property)})::numeric), 0)`;
    case 'avg':
      return `COALESCE(AVG((e.properties ->> ${lit(cond.aggregation.property)})::numeric), 0)`;
    case 'min':
      return `MIN((e.properties ->> ${lit(cond.aggregation.property)})::numeric)`;
    case 'max':
      return `MAX((e.properties ->> ${lit(cond.aggregation.property)})::numeric)`;
    default:
      return 'COUNT(*)';
  }
}

const METRIC_SQL: Record<string, string> = {
  'metric.events_7d':
    "(SELECT COUNT(*) FROM events e WHERE e.customer_id = c.id AND e.timestamp >= NOW() - INTERVAL '7 days')",
  'metric.events_30d':
    "(SELECT COUNT(*) FROM events e WHERE e.customer_id = c.id AND e.timestamp >= NOW() - INTERVAL '30 days')",
  'metric.active_days_30d':
    "(SELECT COUNT(DISTINCT DATE_TRUNC('day', e.timestamp)) FROM events e WHERE e.customer_id = c.id AND e.timestamp >= NOW() - INTERVAL '30 days')",
  'metric.days_since_last_active':
    '(SELECT EXTRACT(DAY FROM NOW() - MAX(e.timestamp)) FROM events e WHERE e.customer_id = c.id)',
  'metric.days_since_signup': 'EXTRACT(DAY FROM NOW() - c.created_at)',
  'metric.deliveries_30d':
    "(SELECT COUNT(*) FROM engagement_log g WHERE g.customer_id = c.id AND g.timestamp >= NOW() - INTERVAL '30 days')",
  'metric.subscriptions_active':
    "(SELECT COUNT(*) FROM service_subscriptions s WHERE s.customer_id = c.id AND s.status = 'active')",
  'metric.engagement_score': '/* blended score, computed at preview time */ 0',
};

function conditionSql(cond: CohortCondition, catalog: SemanticCatalog): string {
  switch (cond.kind) {
    case 'property': {
      const prop = findProperty(catalog, cond.property);
      const lhs = prop?.derived ? `/* derived */ ${ident(cond.property)}` : `c.${ident(cond.property)}`;
      if (cond.window) {
        const w = windowSql(cond.window, `c.${ident(cond.property)}`);
        if (w) return `(${w})`;
      }
      return comparisonSql(lhs, cond.operator, cond.value, cond.value2, cond.values);
    }

    case 'metric': {
      const expr = METRIC_SQL[cond.metric] ?? `/* ${cond.metric} */ 0`;
      return comparisonSql(expr, cond.operator, cond.value, cond.value2, undefined);
    }

    case 'cohort': {
      const sub = `c.id IN (SELECT customer_id FROM cohort_members WHERE cohort_slug = ${lit(cond.cohortSlug)})`;
      return cond.member ? sub : `NOT (${sub})`;
    }

    case 'event': {
      const where = [
        'e.customer_id = c.id',
        `e.event_type = ${lit(cond.event)}`,
        windowSql(cond.window),
        ...eventFilterSql(cond.filters),
      ].filter(Boolean) as string[];

      if (cond.performed === 'did_not') {
        return `NOT EXISTS (\n      SELECT 1 FROM events e\n      WHERE ${where.join('\n        AND ')}\n    )`;
      }
      const agg = aggregationSql(cond);
      return `(\n      SELECT ${agg} FROM events e\n      WHERE ${where.join('\n        AND ')}\n    ) ${countComparisonSql('', cond.operator, cond.value, cond.value2).trim()}`;
    }

    case 'relative_event': {
      const anchorWhere = [
        'a.customer_id = c.id',
        `a.event_type = ${lit(cond.anchorEvent)}`,
        windowSql(cond.window, 'a.timestamp'),
        ...eventFilterSql(cond.anchorFilters, 'a'),
      ].filter(Boolean) as string[];

      const gap = cond.gap ? `INTERVAL '${cond.gap.value} ${cond.gap.unit}'` : "INTERVAL '7 days'";
      let timing: string;
      switch (cond.relation) {
        case 'within_after':
          timing = `e.timestamp > a.timestamp AND e.timestamp <= a.timestamp + ${gap}`;
          break;
        case 'within_before':
          timing = `e.timestamp < a.timestamp AND e.timestamp >= a.timestamp - ${gap}`;
          break;
        case 'after':
          timing = 'e.timestamp > a.timestamp';
          break;
        case 'before':
          timing = 'e.timestamp < a.timestamp';
          break;
        case 'never_after':
          timing = `e.timestamp > a.timestamp AND e.timestamp <= a.timestamp + ${gap}`;
          break;
        default:
          timing = 'TRUE';
      }

      const inner = [
        'e.customer_id = c.id',
        `e.event_type = ${lit(cond.event)}`,
        timing,
        ...eventFilterSql(cond.filters),
      ].join('\n            AND ');

      const exists = `EXISTS (\n        SELECT 1 FROM events e\n        WHERE ${inner}\n      )`;
      const negated = cond.relation === 'never_after' ? `NOT ${exists}` : exists;

      return `EXISTS (\n      SELECT 1 FROM events a\n      WHERE ${anchorWhere.join('\n        AND ')}\n        AND ${negated}\n    )`;
    }

    case 'sequence': {
      const steps = cond.steps.filter((s) => s.event);
      const ctes = steps.map((s, i) => {
        const where = [
          `s${i}.customer_id = c.id`,
          `s${i}.event_type = ${lit(s.event)}`,
          windowSql(cond.window, `s${i}.timestamp`),
          ...eventFilterSql(s.filters, `s${i}`),
        ].filter(Boolean) as string[];
        return `      (SELECT MIN(s${i}.timestamp) FROM events s${i} WHERE ${where.join(' AND ')}) AS step_${i}`;
      });

      const ordering = cond.ordered
        ? steps.slice(1).map((_, i) => `step_${i} < step_${i + 1}`)
        : [];
      const present = steps.map((_, i) => `step_${i} IS NOT NULL`);
      const conv = cond.conversionWindow
        ? [
            `step_${steps.length - 1} <= step_0 + INTERVAL '${cond.conversionWindow.value} ${cond.conversionWindow.unit}'`,
          ]
        : [];

      const all = [...present, ...ordering, ...conv];
      const completed = `(\n      SELECT ${all.join('\n        AND ')}\n      FROM (SELECT\n${ctes.join(',\n')}\n      ) seq\n    )`;

      if (cond.outcome === 'dropped_off') {
        const reached = `step_0 IS NOT NULL`;
        return `(\n      SELECT ${reached} AND NOT (${all.join(' AND ')})\n      FROM (SELECT\n${ctes.join(',\n')}\n      ) seq\n    )`;
      }
      return completed;
    }

    case 'retention': {
      const eventClause = cond.event ? ` AND e.event_type = ${lit(cond.event)}` : '';
      const unit = cond.periodUnit ?? 'day';
      const win = windowSql(cond.window) ?? 'TRUE';
      switch (cond.pattern) {
        case 'active_n_of_m':
          return `(\n      SELECT COUNT(DISTINCT DATE_TRUNC('${unit}', e.timestamp))\n      FROM events e\n      WHERE e.customer_id = c.id${eventClause} AND ${win}\n    ) >= ${cond.periods ?? 1}`;
        case 'active_every_period':
          return `(\n      SELECT COUNT(DISTINCT DATE_TRUNC('${unit}', e.timestamp))\n      FROM events e\n      WHERE e.customer_id = c.id${eventClause} AND ${win}\n    ) >= ${cond.consecutive ?? cond.periods ?? 4}`;
        case 'returned_after':
        case 'reactivated':
          return `EXISTS (\n      SELECT 1 FROM (\n        SELECT e.timestamp,\n               LAG(e.timestamp) OVER (ORDER BY e.timestamp) AS prev_ts\n        FROM events e\n        WHERE e.customer_id = c.id${eventClause}\n      ) gaps\n      WHERE prev_ts IS NOT NULL\n        AND timestamp - prev_ts >= INTERVAL '${cond.gapDays ?? 30} days'\n    )`;
        case 'became_inactive':
          return `(\n      SELECT MAX(e.timestamp) FROM events e WHERE e.customer_id = c.id${eventClause}\n    ) < NOW() - INTERVAL '${cond.gapDays ?? 30} days'`;
        case 'increasing_activity':
        case 'declining_activity': {
          const cmp = cond.pattern === 'increasing_activity' ? '>' : '<';
          return `(\n      SELECT COUNT(*) FROM events e\n      WHERE e.customer_id = c.id${eventClause}\n        AND e.timestamp >= NOW() - INTERVAL '${cond.gapDays ?? 30} days'\n    ) ${cmp} (\n      SELECT COUNT(*) FROM events e\n      WHERE e.customer_id = c.id${eventClause}\n        AND e.timestamp >= NOW() - INTERVAL '${(cond.gapDays ?? 30) * 2} days'\n        AND e.timestamp < NOW() - INTERVAL '${cond.gapDays ?? 30} days'\n    )`;
        }
        default:
          return 'TRUE';
      }
    }

    case 'account_rollup': {
      const innerSql = nodeSql(cond.inner, catalog, 3).replace(/\bc\./g, 'm.');
      const base = `SELECT COUNT(*) FROM customers m WHERE m.account_id = c.account_id AND (${innerSql})`;
      switch (cond.mode) {
        case 'any':
          return `(${base}) >= 1`;
        case 'none':
          return `(${base}) = 0`;
        case 'all':
          return `(${base}) = (SELECT COUNT(*) FROM customers m WHERE m.account_id = c.account_id)`;
        case 'count':
          return countComparisonSql(`(${base})`, cond.operator ?? 'count_gte', cond.value ?? 1);
        default:
          return 'TRUE';
      }
    }

    default:
      return 'TRUE';
  }
}

function nodeSql(node: CohortNode, catalog: SemanticCatalog, indent = 1): string {
  const pad = '  '.repeat(indent);
  if (!isGroup(node)) return conditionSql(node, catalog);
  if (!node.children.length) return 'TRUE';

  const parts = node.children.map((c) => nodeSql(c, catalog, indent + 1));
  const joined = parts.join(`\n${pad}${node.operator.toUpperCase()} `);
  const body = parts.length > 1 ? `(\n${pad}${joined}\n${'  '.repeat(indent - 1)})` : parts[0];
  return node.negate ? `NOT ${body}` : body;
}

export type CompiledQuery = {
  sql: string;
  /** IR serialised for the JSON tab / API consumers. */
  json: string;
  /** True when the SQL is illustrative because the preview runs client-side. */
  advisory: boolean;
};

/**
 * Compile IR to a readable SELECT. The preview engine evaluates IR directly
 * against sampled rows; this SQL is what a warehouse materialisation would run,
 * and what the user copies out.
 */
export function compileToSql(ir: CohortIR, catalog: SemanticCatalog): CompiledQuery {
  const where = nodeSql(ir.root, catalog, 1);
  const table = ir.entity === 'account' ? 'accounts' : 'customers';
  const sql = [
    `-- Cohort: ${catalog.entityLabel} (${ir.entity}-level)`,
    `-- Generated from cohort IR v${ir.version}. Do not edit by hand;`,
    '-- edits made here are not read back into the visual builder.',
    `SELECT c.id, c.email, c.first_name, c.last_name, c.created_at`,
    `FROM ${table} c`,
    `WHERE c.tenant_id = :tenant_id`,
    `  AND c.environment = :environment`,
    `  AND ${where}`,
    `ORDER BY c.created_at DESC;`,
  ].join('\n');

  return { sql, json: JSON.stringify(ir, null, 2), advisory: true };
}

/* ------------------------------------------------------------------ *
 * Plain English — powers the explanation panel and reverse-AI summaries
 * ------------------------------------------------------------------ */

function valuePhrase(
  operator: PropertyOperator,
  value: unknown,
  value2: unknown,
  values: (string | number)[] | undefined,
): string {
  if (isNullaryOperator(operator)) return '';
  if (isListOperator(operator)) return ` ${(values ?? []).map((v) => `"${v}"`).join(', ')}`;
  if (isRangeOperator(operator)) return ` ${value} and ${value2}`;
  return ` "${value}"`;
}

function filterPhrase(filters: EventPropertyFilter[], _catalog: SemanticCatalog): string {
  if (!filters.length) return '';
  const parts = filters
    .filter((f) => f.property)
    .map(
      (f) =>
        `${f.property} ${PROPERTY_OPERATOR_LABELS[f.operator]}${valuePhrase(f.operator, f.value, f.value2, f.values)}`,
    );
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}

/** One-line English for a single condition — used in the tree and the audit list. */
export function describeCondition(cond: CohortCondition, catalog: SemanticCatalog): string {
  switch (cond.kind) {
    case 'property': {
      const label = findProperty(catalog, cond.property)?.label ?? cond.property ?? 'property';
      if (cond.window) return `${label} falls ${describeWindow(cond.window)}`;
      return `${label} ${PROPERTY_OPERATOR_LABELS[cond.operator]}${valuePhrase(
        cond.operator,
        cond.value,
        cond.value2,
        cond.values,
      )}`;
    }

    case 'metric': {
      const m = findMetric(catalog, cond.metric);
      const label = m?.label ?? cond.metric;
      return `${label} ${PROPERTY_OPERATOR_LABELS[cond.operator]} ${cond.value}${
        isRangeOperator(cond.operator) ? ` and ${cond.value2}` : ''
      }`;
    }

    case 'cohort': {
      const name = cond.cohortName ?? catalog.cohorts.find((c) => c.slug === cond.cohortSlug)?.name ?? cond.cohortSlug;
      return `${cond.member ? 'Is in' : 'Is not in'} the "${name}" cohort`;
    }

    case 'event': {
      const label = findEvent(catalog, cond.event)?.label ?? cond.event ?? 'event';
      if (cond.performed === 'did_not') {
        return `Never performed "${label}"${filterPhrase(cond.filters, catalog)} ${describeWindow(cond.window)}`;
      }
      const agg = cond.aggregation;
      const countPart =
        agg.kind === 'count'
          ? `${COUNT_OPERATOR_LABELS[cond.operator]} ${cond.value}${
              cond.operator === 'count_between' ? ` and ${cond.value2}` : ''
            } time${cond.value === 1 && cond.operator !== 'count_between' ? '' : 's'}`
          : agg.kind === 'distinct_days'
            ? `on ${COUNT_OPERATOR_LABELS[cond.operator]} ${cond.value} distinct days`
            : `with ${AGGREGATION_LABELS[agg.kind]} ${'property' in agg ? agg.property : ''} ${
                COUNT_OPERATOR_LABELS[cond.operator]
              } ${cond.value}`;
      const occ =
        cond.occurrence === 'first'
          ? ' (first occurrence only)'
          : cond.occurrence === 'last'
            ? ' (most recent occurrence only)'
            : '';
      return `Performed "${label}" ${countPart}${filterPhrase(cond.filters, catalog)} ${describeWindow(
        cond.window,
      )}${occ}`;
    }

    case 'relative_event': {
      const a = findEvent(catalog, cond.event)?.label ?? cond.event;
      const b = findEvent(catalog, cond.anchorEvent)?.label ?? cond.anchorEvent;
      const gap = cond.gap ? `${cond.gap.value} ${cond.gap.unit}s` : '';
      const rel: Record<typeof cond.relation, string> = {
        within_after: `within ${gap} after`,
        within_before: `within ${gap} before`,
        after: 'at any point after',
        before: 'at any point before',
        never_after: `never within ${gap} after`,
      };
      const verb = cond.relation === 'never_after' ? 'Did' : 'Performed';
      return `${verb} "${a}"${filterPhrase(cond.filters, catalog)} ${rel[cond.relation]} performing "${b}"${filterPhrase(
        cond.anchorFilters,
        catalog,
      )}, ${describeWindow(cond.window)}`;
    }

    case 'sequence': {
      const names = cond.steps
        .filter((s) => s.event)
        .map((s) => `"${findEvent(catalog, s.event)?.label ?? s.event}"`);
      const chain = names.join(cond.ordered ? ' → ' : ', ');
      const conv = cond.conversionWindow
        ? ` within a ${cond.conversionWindow.value} ${cond.conversionWindow.unit} conversion window`
        : '';
      if (cond.outcome === 'dropped_off') {
        return `Started but did not complete the sequence ${chain}${conv}, ${describeWindow(cond.window)}`;
      }
      return `Completed the ${cond.ordered ? 'ordered' : 'unordered'} sequence ${chain}${conv}, ${describeWindow(
        cond.window,
      )}`;
    }

    case 'retention': {
      const evPart = cond.event
        ? ` on "${findEvent(catalog, cond.event)?.label ?? cond.event}"`
        : '';
      const unit = cond.periodUnit ?? 'day';
      switch (cond.pattern) {
        case 'active_n_of_m':
          return `Active${evPart} on at least ${cond.periods ?? 1} ${unit}${(cond.periods ?? 1) === 1 ? '' : 's'} ${describeWindow(cond.window)}`;
        case 'active_every_period':
          return `Active${evPart} every ${unit} for ${cond.consecutive ?? cond.periods ?? 4} consecutive ${unit}s`;
        case 'returned_after':
          return `Returned${evPart} after at least ${cond.gapDays ?? 30} days of silence`;
        case 'became_inactive':
          return `Has not been active${evPart} for ${cond.gapDays ?? 30}+ days`;
        case 'reactivated':
          return `Reactivated${evPart} after ${cond.gapDays ?? 30}+ days away`;
        case 'increasing_activity':
          return `Activity${evPart} is increasing versus the previous period`;
        case 'declining_activity':
          return `Activity${evPart} is declining versus the previous period`;
        default:
          return RETENTION_PATTERN_LABELS[cond.pattern];
      }
    }

    case 'account_rollup': {
      const inner = isGroup(cond.inner)
        ? cond.inner.children.map((c) => (isGroup(c) ? 'a nested group' : describeCondition(c, catalog))).join(' and ')
        : describeCondition(cond.inner, catalog);
      switch (cond.mode) {
        case 'any':
          return `Belongs to an account where at least one user: ${inner}`;
        case 'all':
          return `Belongs to an account where every user: ${inner}`;
        case 'none':
          return `Belongs to an account where no user: ${inner}`;
        case 'count':
          return `Belongs to an account where ${COUNT_OPERATOR_LABELS[cond.operator ?? 'count_gte']} ${cond.value ?? 1} users: ${inner}`;
        default:
          return inner;
      }
    }

    default:
      return 'Unknown condition';
  }
}

function describeGroup(group: CohortGroup, catalog: SemanticCatalog, depth = 0): string {
  if (!group.children.length) return 'everyone';
  const parts = group.children.map((child) =>
    isGroup(child) ? `(${describeGroup(child, catalog, depth + 1)})` : describeCondition(child, catalog),
  );
  const joined = parts.join(group.operator === 'and' ? ' AND ' : ' OR ');
  return group.negate ? `NOT (${joined})` : joined;
}

/** One-paragraph summary — the "reverse AI" read-back of a manually built cohort. */
export function explainCohort(ir: CohortIR, catalog: SemanticCatalog): string {
  if (!ir.root.children.length) {
    return `Every ${catalog.entityLabel.toLowerCase()} — no conditions have been added yet.`;
  }
  const noun = ir.entity === 'account' ? 'Accounts' : `${catalog.entityLabel}s`;
  const body = describeGroup(ir.root, catalog);
  return `${noun} where ${body}.`;
}

/** Structured breakdown for the Explanation tab: one line per condition. */
export type ExplanationLine = {
  nodeId: string;
  depth: number;
  connector?: 'AND' | 'OR';
  negated?: boolean;
  text: string;
  kind: string;
  /** Catalog names this line depends on — the "data sources" list. */
  sources: string[];
};

export function explainLines(ir: CohortIR, catalog: SemanticCatalog): ExplanationLine[] {
  const out: ExplanationLine[] = [];

  function walk(node: CohortNode, depth: number, connector?: 'AND' | 'OR'): void {
    if (isGroup(node)) {
      if (depth > 0) {
        out.push({
          nodeId: node.id,
          depth,
          connector,
          negated: node.negate,
          text: `${node.negate ? 'NOT — ' : ''}${node.operator === 'and' ? 'All of' : 'Any of'} the following:`,
          kind: 'group',
          sources: [],
        });
      }
      node.children.forEach((child, i) =>
        walk(child, depth + (depth > 0 ? 1 : 0), i === 0 ? undefined : (node.operator.toUpperCase() as 'AND' | 'OR')),
      );
      return;
    }
    out.push({
      nodeId: node.id,
      depth,
      connector,
      text: describeCondition(node, catalog),
      kind: node.kind,
      sources: conditionSources(node),
    });
    if (node.kind === 'account_rollup') walk(node.inner, depth + 1);
  }

  walk(ir.root, 0);
  return out;
}

function conditionSources(cond: CohortCondition): string[] {
  switch (cond.kind) {
    case 'property':
      return [cond.property];
    case 'metric':
      return [cond.metric];
    case 'cohort':
      return [`cohort:${cond.cohortSlug}`];
    case 'event':
      return [cond.event, ...cond.filters.map((f) => `${cond.event}.${f.property}`)];
    case 'relative_event':
      return [cond.event, cond.anchorEvent];
    case 'sequence':
      return cond.steps.map((s) => s.event).filter(Boolean);
    case 'retention':
      return cond.event ? [cond.event] : ['(any event)'];
    default:
      return [];
  }
}

/** Which catalog entries the whole cohort touches — the "Data sources" panel. */
export function dataSources(
  ir: CohortIR,
  catalog: SemanticCatalog,
): { events: string[]; properties: string[]; metrics: string[]; cohorts: string[] } {
  const events = new Set<string>();
  const properties = new Set<string>();
  const metrics = new Set<string>();
  const cohorts = new Set<string>();

  for (const c of collectConditions(ir.root)) {
    switch (c.kind) {
      case 'property':
        if (c.property) properties.add(c.property);
        break;
      case 'metric':
        if (c.metric) metrics.add(c.metric);
        break;
      case 'cohort':
        if (c.cohortSlug) cohorts.add(c.cohortSlug);
        break;
      case 'event':
        if (c.event) events.add(c.event);
        c.filters.forEach((f) => f.property && properties.add(`${c.event}.${f.property}`));
        break;
      case 'relative_event':
        if (c.event) events.add(c.event);
        if (c.anchorEvent) events.add(c.anchorEvent);
        break;
      case 'sequence':
        c.steps.forEach((s) => s.event && events.add(s.event));
        break;
      case 'retention':
        if (c.event) events.add(c.event);
        break;
    }
  }

  const label = (key: string) => findProperty(catalog, key)?.label ?? key;
  return {
    events: [...events],
    properties: [...properties].map(label),
    metrics: [...metrics].map((k) => findMetric(catalog, k)?.label ?? k),
    cohorts: [...cohorts].map((s) => catalog.cohorts.find((c) => c.slug === s)?.name ?? s),
  };
}

/** Compact one-liner for cards and list rows. */
export function summarizeCohort(ir: CohortIR, catalog: SemanticCatalog, maxLength = 120): string {
  const text = explainCohort(ir, catalog);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
