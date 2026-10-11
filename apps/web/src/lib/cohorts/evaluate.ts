/**
 * Cohort execution engine.
 *
 * Loads a sampled dataset once, then evaluates IR against it in memory. Every
 * evaluation can also produce a per-person trace ("John matched because …"),
 * which is what makes an AI-built cohort auditable rather than a black box.
 */
import { supabase } from '@/lib/supabase';
import type { SchemaWithFields } from '@/lib/fetch-schemas';
import { fetchSchemaRows } from '@/lib/schema-records';
import {
  collectConditions,
  isGroup,
  isListOperator,


  resolveWindow,
  unitToMs,
  type CohortCondition,
  type CohortIR,
  type CohortNode,
  type CountOperator,
  type EventPropertyFilter,
  type PropertyOperator,
  type TimeWindow,
} from './ir';
import {
  buildCatalog,
  computeEngagementScore,
  fetchEventCatalog,
  findMetric,
  findProperty,
  type CatalogCohortRef,
  type SemanticCatalog,
} from './catalog';

export type EventRecord = {
  name: string;
  ts: number;
  properties: Record<string, unknown>;
};

export type CohortDataset = {
  catalog: SemanticCatalog;
  rows: Record<string, unknown>[];
  /** customer id → their events, ascending by time. */
  eventsByEntity: Map<string, EventRecord[]>;
  /** cohort slug → member ids, for `cohort` membership conditions. */
  membership: Map<string, Set<string>>;
  /** account id → member customer ids, for account roll-ups. */
  accountMembers: Map<string, Record<string, unknown>[]>;
  sampled: boolean;
  loadedAt: number;
};

export const ENTITY_SAMPLE_LIMIT = 5000;
export const EVENT_SAMPLE_LIMIT = 20000;

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

function rowId(row: Record<string, unknown>): string {
  return String(row.id ?? '');
}

/** Attach the derived columns the metrics and linked properties read. */
function enrichRows(
  rows: Record<string, unknown>[],
  eventsByEntity: Map<string, EventRecord[]>,
  subscriptions: Map<string, number>,
  deliveries: Map<string, { count7d: number; count30d: number; opened7d: boolean; clicked7d: boolean; lastAt?: string; lastChannel?: string }>,
): void {
  const now = Date.now();
  const d7 = now - 7 * 86_400_000;
  const d30 = now - 30 * 86_400_000;

  for (const row of rows) {
    const id = rowId(row);
    const evs = eventsByEntity.get(id) ?? [];

    let count7 = 0;
    let count30 = 0;
    const days30 = new Set<string>();
    const names = new Set<string>();
    let last: EventRecord | undefined;

    for (const ev of evs) {
      names.add(ev.name);
      if (ev.ts >= d7) count7 += 1;
      if (ev.ts >= d30) {
        count30 += 1;
        days30.add(new Date(ev.ts).toISOString().slice(0, 10));
      }
      if (!last || ev.ts > last.ts) last = ev;
    }

    row.events_7d_count = count7;
    row.events_30d_count = count30;
    row.active_days_30d = days30.size;
    row.event_names = [...names].join(', ');
    row.last_event_name = last?.name ?? '';
    row.last_event_at = last ? new Date(last.ts).toISOString() : null;

    const d = deliveries.get(id);
    row.deliveries_received_7d_count = d?.count7d ?? 0;
    row.deliveries_received_30d_count = d?.count30d ?? 0;
    row.email_opened_7d = d?.opened7d ?? false;
    row.email_clicked_7d = d?.clicked7d ?? false;
    row.last_delivery_at = d?.lastAt ?? null;
    row.last_delivery_channel = d?.lastChannel ?? '';

    row.active_subscription_count = subscriptions.get(id) ?? 0;
    row.is_email_reachable = Boolean(row.email && String(row.email).includes('@'));
    row.is_sms_reachable = Boolean(row.mobile && String(row.mobile).replace(/\D/g, '').length >= 7);
    row.engagement_score = computeEngagementScore(row);
  }
}

/**
 * Load everything a preview needs, in parallel. Deliberately one call per
 * studio session — conditions are then evaluated against this snapshot so
 * dragging a slider does not re-hit the database.
 */
export async function loadCohortDataset(opts: {
  tenantId: string;
  environment: string;
  schema: SchemaWithFields;
  cohorts: CatalogCohortRef[];
  entityLimit?: number;
  eventLimit?: number;
}): Promise<CohortDataset> {
  const entityLimit = opts.entityLimit ?? ENTITY_SAMPLE_LIMIT;
  const eventLimit = opts.eventLimit ?? EVENT_SAMPLE_LIMIT;
  const tableName = opts.schema.table_name ?? 'customers';

  const [rows, eventCatalog, eventsRes, engRes, subsRes] = await Promise.all([
    fetchSchemaRows(tableName, opts.tenantId, opts.environment, entityLimit),
    fetchEventCatalog(opts.tenantId, opts.environment),
    supabase
      .from('events')
      .select('event_type, customer_id, timestamp, properties')
      .eq('tenant_id', opts.tenantId)
      .eq('environment', opts.environment)
      .order('timestamp', { ascending: false })
      .limit(eventLimit),
    supabase
      .from('engagement_log')
      .select('event, channel, customer_id, timestamp, metadata')
      .eq('tenant_id', opts.tenantId)
      .eq('environment', opts.environment)
      .order('timestamp', { ascending: false })
      .limit(8000),
    supabase
      .from('service_subscriptions')
      .select('customer_id, status')
      .eq('tenant_id', opts.tenantId)
      .eq('environment', opts.environment)
      .eq('status', 'active')
      .limit(20000),
  ]);

  const eventsByEntity = new Map<string, EventRecord[]>();
  const push = (id: string | null | undefined, rec: EventRecord) => {
    if (!id) return;
    const list = eventsByEntity.get(id);
    if (list) list.push(rec);
    else eventsByEntity.set(id, [rec]);
  };

  for (const ev of eventsRes.data ?? []) {
    const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : NaN;
    if (Number.isNaN(ts)) continue;
    push(ev.customer_id as string | null, {
      name: String(ev.event_type ?? ''),
      ts,
      properties: (ev.properties ?? {}) as Record<string, unknown>,
    });
  }

  const now = Date.now();
  const d7 = now - 7 * 86_400_000;
  const d30 = now - 30 * 86_400_000;
  const deliveries = new Map<
    string,
    { count7d: number; count30d: number; opened7d: boolean; clicked7d: boolean; lastAt?: string; lastChannel?: string }
  >();

  for (const eng of engRes.data ?? []) {
    const id = eng.customer_id as string | null;
    const ts = eng.timestamp ? new Date(eng.timestamp).getTime() : NaN;
    if (Number.isNaN(ts)) continue;
    const evName = String(eng.event ?? '');

    push(id, {
      name: `message_${evName}`,
      ts,
      properties: {
        channel: eng.channel,
        ...((eng.metadata ?? {}) as Record<string, unknown>),
      },
    });

    if (!id) continue;
    let agg = deliveries.get(id);
    if (!agg) {
      agg = { count7d: 0, count30d: 0, opened7d: false, clicked7d: false };
      deliveries.set(id, agg);
    }
    if (!agg.lastAt || String(eng.timestamp) > agg.lastAt) {
      agg.lastAt = String(eng.timestamp);
      agg.lastChannel = String(eng.channel ?? '');
    }
    if (ts >= d7) {
      agg.count7d += 1;
      if (evName === 'opened') agg.opened7d = true;
      if (evName === 'clicked') agg.clicked7d = true;
    }
    if (ts >= d30) agg.count30d += 1;
  }

  for (const list of eventsByEntity.values()) list.sort((a, b) => a.ts - b.ts);

  const subscriptions = new Map<string, number>();
  for (const s of subsRes.data ?? []) {
    const id = s.customer_id as string | null;
    if (!id) continue;
    subscriptions.set(id, (subscriptions.get(id) ?? 0) + 1);
  }

  enrichRows(rows, eventsByEntity, subscriptions, deliveries);

  const accountMembers = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const acc = row.account_id ?? row.company_id;
    if (!acc) continue;
    const key = String(acc);
    const list = accountMembers.get(key);
    if (list) list.push(row);
    else accountMembers.set(key, [row]);
  }

  const catalog = buildCatalog({
    schema: opts.schema,
    rows,
    events: eventCatalog.events,
    cohorts: opts.cohorts,
    freshestEventAt: eventCatalog.freshestEventAt,
    sampled: rows.length >= entityLimit || eventCatalog.sampled,
  });

  return {
    catalog,
    rows,
    eventsByEntity,
    membership: new Map(),
    accountMembers,
    sampled: rows.length >= entityLimit || (eventsRes.data?.length ?? 0) >= eventLimit,
    loadedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ *
 * Comparison primitives
 * ------------------------------------------------------------------ */

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toTime(v: unknown): number | null {
  if (v == null || v === '') return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

function isBlank(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

function compare(
  left: unknown,
  operator: PropertyOperator,
  value: unknown,
  value2: unknown,
  values: (string | number)[] | undefined,
): boolean {
  if (operator === 'is_set') return !isBlank(left);
  if (operator === 'is_not_set') return isBlank(left);

  if (isListOperator(operator)) {
    const set = new Set((values ?? []).map((v) => String(v).toLowerCase()));
    const has = set.has(String(left ?? '').toLowerCase());
    return operator === 'in' ? has : !has;
  }

  const ls = String(left ?? '').toLowerCase();
  const rs = String(value ?? '').toLowerCase();

  switch (operator) {
    case 'contains':
      return ls.includes(rs);
    case 'not_contains':
      return !ls.includes(rs);
    case 'starts_with':
      return ls.startsWith(rs);
    case 'ends_with':
      return ls.endsWith(rs);
    case 'equals':
      return ls === rs;
    case 'not_equals':
      return ls !== rs;
    default:
      break;
  }

  // Ordered comparisons: prefer numeric, fall back to date, then string.
  const ln = toNumber(left);
  const rn = toNumber(value);
  let a: number | null = ln;
  let b: number | null = rn;
  if (a == null || b == null) {
    a = toTime(left);
    b = toTime(value);
  }
  if (a == null || b == null) {
    switch (operator) {
      case 'gt':
        return ls > rs;
      case 'gte':
        return ls >= rs;
      case 'lt':
        return ls < rs;
      case 'lte':
        return ls <= rs;
      default:
        return false;
    }
  }

  switch (operator) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'between': {
      const b2 = toNumber(value2) ?? toTime(value2);
      return b2 != null && a >= b && a <= b2;
    }
    default:
      return false;
  }
}

function compareCount(actual: number, operator: CountOperator, value: number, value2?: number): boolean {
  switch (operator) {
    case 'count_gte':
      return actual >= value;
    case 'count_lte':
      return actual <= value;
    case 'count_eq':
      return actual === value;
    case 'count_gt':
      return actual > value;
    case 'count_lt':
      return actual < value;
    case 'count_between':
      return actual >= value && actual <= (value2 ?? value);
    default:
      return false;
  }
}

function eventMatchesFilters(ev: EventRecord, filters: EventPropertyFilter[]): boolean {
  return filters.every((f) => {
    if (!f.property) return true;
    return compare(ev.properties?.[f.property], f.operator, f.value, f.value2, f.values);
  });
}

function eventsInWindow(
  events: EventRecord[],
  name: string,
  win: TimeWindow | undefined,
  filters: EventPropertyFilter[],
  now: number,
): EventRecord[] {
  const { from, to } = resolveWindow(win, now);
  return events.filter(
    (e) => e.name === name && e.ts >= from && e.ts <= to && eventMatchesFilters(e, filters),
  );
}

/* ------------------------------------------------------------------ *
 * Condition evaluation (with trace)
 * ------------------------------------------------------------------ */

export type ConditionTrace = {
  nodeId: string;
  matched: boolean;
  /** Human-readable observed value, e.g. "5 times" or "pro". */
  observed: string;
};

type EvalCtx = {
  dataset: CohortDataset;
  now: number;
  trace?: ConditionTrace[];
};

function record(ctx: EvalCtx, nodeId: string, matched: boolean, observed: string): boolean {
  ctx.trace?.push({ nodeId, matched, observed });
  return matched;
}

function propertyValue(
  row: Record<string, unknown>,
  key: string,
  catalog: SemanticCatalog,
): unknown {
  const prop = findProperty(catalog, key);
  if (prop?.getValue) return prop.getValue(row);
  return row[key];
}

function evaluateCondition(cond: CohortCondition, row: Record<string, unknown>, ctx: EvalCtx): boolean {
  const { dataset, now } = ctx;
  const id = rowId(row);
  const events = dataset.eventsByEntity.get(id) ?? [];

  switch (cond.kind) {
    case 'property': {
      const raw = propertyValue(row, cond.property, dataset.catalog);
      if (cond.window) {
        const { from, to } = resolveWindow(cond.window, now);
        const t = toTime(raw);
        return record(
          ctx,
          cond.id,
          t != null && t >= from && t <= to,
          raw ? String(raw).slice(0, 24) : 'not set',
        );
      }
      const matched = compare(raw, cond.operator, cond.value, cond.value2, cond.values);
      return record(ctx, cond.id, matched, isBlank(raw) ? 'not set' : String(raw).slice(0, 40));
    }

    case 'metric': {
      const metric = findMetric(dataset.catalog, cond.metric);
      const actual = metric ? metric.getValue(row) : 0;
      const matched = compare(actual, cond.operator, cond.value, cond.value2, undefined);
      return record(ctx, cond.id, matched, String(actual));
    }

    case 'cohort': {
      const members = dataset.membership.get(cond.cohortSlug);
      const inCohort = members ? members.has(id) : false;
      return record(ctx, cond.id, inCohort === cond.member, inCohort ? 'is a member' : 'not a member');
    }

    case 'event': {
      const matches = eventsInWindow(events, cond.event, cond.window, cond.filters, now);

      if (cond.performed === 'did_not') {
        return record(ctx, cond.id, matches.length === 0, `${matches.length} times`);
      }

      let scoped = matches;
      if (cond.occurrence === 'first' && matches.length) scoped = [matches[0]];
      if (cond.occurrence === 'last' && matches.length) scoped = [matches[matches.length - 1]];

      let actual: number;
      switch (cond.aggregation.kind) {
        case 'distinct_days':
          actual = new Set(scoped.map((e) => new Date(e.ts).toISOString().slice(0, 10))).size;
          break;
        case 'sum':
        case 'avg':
        case 'min':
        case 'max': {
          const key = cond.aggregation.property;
          const nums = scoped
            .map((e) => toNumber(e.properties?.[key]))
            .filter((n): n is number => n != null);
          if (!nums.length) actual = 0;
          else if (cond.aggregation.kind === 'sum') actual = nums.reduce((a, b) => a + b, 0);
          else if (cond.aggregation.kind === 'avg') actual = nums.reduce((a, b) => a + b, 0) / nums.length;
          else if (cond.aggregation.kind === 'min') actual = Math.min(...nums);
          else actual = Math.max(...nums);
          break;
        }
        default:
          actual = scoped.length;
      }

      const matched = compareCount(actual, cond.operator, cond.value, cond.value2);
      const unit = cond.aggregation.kind === 'count' ? ' times' : '';
      return record(ctx, cond.id, matched, `${Math.round(actual * 100) / 100}${unit}`);
    }

    case 'relative_event': {
      const anchors = eventsInWindow(events, cond.anchorEvent, cond.window, cond.anchorFilters, now);
      if (!anchors.length) {
        return record(ctx, cond.id, false, 'anchor never happened');
      }
      const candidates = events.filter(
        (e) => e.name === cond.event && eventMatchesFilters(e, cond.filters),
      );
      const gapMs = cond.gap ? unitToMs(cond.gap.value, cond.gap.unit) : Infinity;

      let hits = 0;
      for (const anchor of anchors) {
        for (const c of candidates) {
          const delta = c.ts - anchor.ts;
          let ok = false;
          switch (cond.relation) {
            case 'within_after':
            case 'never_after':
              ok = delta > 0 && delta <= gapMs;
              break;
            case 'within_before':
              ok = delta < 0 && -delta <= gapMs;
              break;
            case 'after':
              ok = delta > 0;
              break;
            case 'before':
              ok = delta < 0;
              break;
          }
          if (ok) hits += 1;
        }
      }

      if (cond.relation === 'never_after') {
        return record(ctx, cond.id, hits === 0, `${hits} follow-ups`);
      }
      return record(ctx, cond.id, hits >= cond.minCount, `${hits} matching pairs`);
    }

    case 'sequence': {
      const steps = cond.steps.filter((s) => s.event);
      if (steps.length < 2) return record(ctx, cond.id, false, 'incomplete sequence');

      const { from, to } = resolveWindow(cond.window, now);
      const inWindow = events.filter((e) => e.ts >= from && e.ts <= to);
      const convMs = cond.conversionWindow
        ? unitToMs(cond.conversionWindow.value, cond.conversionWindow.unit)
        : Infinity;

      let reached = 0;
      let completed = false;

      if (cond.ordered) {
        let cursor = -Infinity;
        let startTs: number | null = null;
        completed = true;
        for (let i = 0; i < steps.length; i += 1) {
          const step = steps[i];
          const minGap = step.minGap ? unitToMs(step.minGap.value, step.minGap.unit) : 0;
          const maxGap = step.maxGap ? unitToMs(step.maxGap.value, step.maxGap.unit) : Infinity;
          const hit = inWindow.find(
            (e) =>
              e.name === step.event &&
              eventMatchesFilters(e, step.filters) &&
              e.ts > cursor &&
              (cursor === -Infinity || (e.ts - cursor >= minGap && e.ts - cursor <= maxGap)) &&
              (startTs == null || e.ts - startTs <= convMs),
          );
          if (!hit) {
            completed = false;
            break;
          }
          if (startTs == null) startTs = hit.ts;
          cursor = hit.ts;
          reached = i + 1;
        }
      } else {
        reached = steps.filter((s) =>
          inWindow.some((e) => e.name === s.event && eventMatchesFilters(e, s.filters)),
        ).length;
        completed = reached === steps.length;
      }

      const observed = `reached ${reached}/${steps.length} steps`;
      if (cond.outcome === 'dropped_off') {
        const dropTarget = cond.dropAtStep ?? 0;
        const matched = reached >= 1 && !completed && (dropTarget === 0 || reached < dropTarget);
        return record(ctx, cond.id, matched, observed);
      }
      return record(ctx, cond.id, completed, observed);
    }

    case 'retention': {
      const { from, to } = resolveWindow(cond.window, now);
      const relevant = events.filter(
        (e) => (!cond.event || e.name === cond.event) && e.ts >= from && e.ts <= to,
      );
      const unit = cond.periodUnit ?? 'day';
      const bucketMs = unit === 'day' ? 86_400_000 : unit === 'week' ? 604_800_000 : 2_592_000_000;
      const buckets = new Set(relevant.map((e) => Math.floor(e.ts / bucketMs)));

      switch (cond.pattern) {
        case 'active_n_of_m':
          return record(
            ctx,
            cond.id,
            buckets.size >= (cond.periods ?? 1),
            `${buckets.size} active ${unit}s`,
          );

        case 'active_every_period': {
          const need = cond.consecutive ?? cond.periods ?? 4;
          const sorted = [...buckets].sort((a, b) => a - b);
          let run = sorted.length ? 1 : 0;
          let best = run;
          for (let i = 1; i < sorted.length; i += 1) {
            run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
            best = Math.max(best, run);
          }
          return record(ctx, cond.id, best >= need, `${best} consecutive ${unit}s`);
        }

        case 'returned_after':
        case 'reactivated': {
          const all = events.filter((e) => !cond.event || e.name === cond.event);
          const gapMs = (cond.gapDays ?? 30) * 86_400_000;
          let maxGap = 0;
          for (let i = 1; i < all.length; i += 1) {
            maxGap = Math.max(maxGap, all[i].ts - all[i - 1].ts);
          }
          return record(
            ctx,
            cond.id,
            maxGap >= gapMs,
            `longest gap ${Math.round(maxGap / 86_400_000)}d`,
          );
        }

        case 'became_inactive': {
          const all = events.filter((e) => !cond.event || e.name === cond.event);
          const last = all.length ? all[all.length - 1].ts : 0;
          const days = last ? Math.floor((now - last) / 86_400_000) : Number.MAX_SAFE_INTEGER;
          return record(
            ctx,
            cond.id,
            days >= (cond.gapDays ?? 30),
            last ? `${days}d since last activity` : 'never active',
          );
        }

        case 'increasing_activity':
        case 'declining_activity': {
          const span = (cond.gapDays ?? 30) * 86_400_000;
          const all = events.filter((e) => !cond.event || e.name === cond.event);
          const recent = all.filter((e) => e.ts >= now - span).length;
          const prior = all.filter((e) => e.ts >= now - span * 2 && e.ts < now - span).length;
          const matched =
            cond.pattern === 'increasing_activity' ? recent > prior : recent < prior;
          return record(ctx, cond.id, matched, `${prior} → ${recent} events`);
        }

        default:
          return record(ctx, cond.id, false, 'unsupported pattern');
      }
    }

    case 'account_rollup': {
      const accountId = String(row.account_id ?? row.company_id ?? '');
      const members = ctx.dataset.accountMembers.get(accountId) ?? [row];
      // Inner conditions are evaluated without tracing — only the roll-up is traced.
      const innerCtx: EvalCtx = { dataset: ctx.dataset, now: ctx.now };
      const hits = members.filter((m) => evaluateNode(cond.inner, m, innerCtx)).length;

      let matched: boolean;
      switch (cond.mode) {
        case 'any':
          matched = hits >= 1;
          break;
        case 'all':
          matched = members.length > 0 && hits === members.length;
          break;
        case 'none':
          matched = hits === 0;
          break;
        default:
          matched = compareCount(hits, cond.operator ?? 'count_gte', cond.value ?? 1);
      }
      return record(ctx, cond.id, matched, `${hits} of ${members.length} users in account`);
    }

    default:
      return record(ctx, (cond as CohortCondition).id, false, 'unsupported');
  }
}

function evaluateNode(node: CohortNode, row: Record<string, unknown>, ctx: EvalCtx): boolean {
  if (!isGroup(node)) return evaluateCondition(node, row, ctx);
  if (!node.children.length) return true;

  let result: boolean;
  if (node.operator === 'and') {
    // No short-circuit when tracing — every condition needs an observed value.
    result = ctx.trace
      ? node.children.map((c) => evaluateNode(c, row, ctx)).every(Boolean)
      : node.children.every((c) => evaluateNode(c, row, ctx));
  } else {
    result = ctx.trace
      ? node.children.map((c) => evaluateNode(c, row, ctx)).some(Boolean)
      : node.children.some((c) => evaluateNode(c, row, ctx));
  }
  return node.negate ? !result : result;
}

/* ------------------------------------------------------------------ *
 * Public evaluation API
 * ------------------------------------------------------------------ */

export type CohortMatch = {
  row: Record<string, unknown>;
  id: string;
  label: string;
  sublabel: string;
};

export type CohortTrend = { date: string; count: number };

export type CohortEvaluation = {
  /** Matching rows in the sample. */
  total: number;
  /** Total rows considered. */
  universe: number;
  percent: number;
  members: CohortMatch[];
  /** Distinct accounts represented in the match set. */
  accountCount: number;
  /** Cumulative cohort size by signup date — the "size over time" sparkline. */
  trend: CohortTrend[];
  sampled: boolean;
  /** Wall-clock evaluation time, shown as the perf indicator. */
  elapsedMs: number;
};

export function memberLabel(row: Record<string, unknown>): { label: string; sublabel: string } {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  const label = name || String(row.email ?? row.mobile ?? row.id ?? 'Unknown');
  const sublabel = name ? String(row.email ?? row.mobile ?? '') : String(row.country ?? row.status ?? '');
  return { label, sublabel };
}

export function evaluateCohort(
  ir: CohortIR,
  dataset: CohortDataset,
  opts: { limit?: number; now?: number } = {},
): CohortEvaluation {
  const started = performance.now();
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 100;
  const ctx: EvalCtx = { dataset, now };

  const matched: Record<string, unknown>[] = [];
  for (const row of dataset.rows) {
    if (evaluateNode(ir.root, row, ctx)) matched.push(row);
  }

  const accounts = new Set<string>();
  for (const row of matched) {
    const acc = row.account_id ?? row.company_id;
    if (acc) accounts.add(String(acc));
  }

  const byDay = new Map<string, number>();
  for (const row of matched) {
    const t = toTime(row.created_at);
    if (t == null) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  let running = 0;
  const trend: CohortTrend[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => {
      running += count;
      return { date, count: running };
    })
    .slice(-90);

  return {
    total: matched.length,
    universe: dataset.rows.length,
    percent: dataset.rows.length ? (matched.length / dataset.rows.length) * 100 : 0,
    members: matched.slice(0, limit).map((row) => ({
      row,
      id: rowId(row),
      ...memberLabel(row),
    })),
    accountCount: accounts.size,
    trend,
    sampled: dataset.sampled,
    elapsedMs: Math.round(performance.now() - started),
  };
}

/** Just the count — used by the AI agent and cohort comparison. */
export function countCohort(ir: CohortIR, dataset: CohortDataset, now = Date.now()): number {
  const ctx: EvalCtx = { dataset, now };
  let n = 0;
  for (const row of dataset.rows) if (evaluateNode(ir.root, row, ctx)) n += 1;
  return n;
}

export type MemberTrace = {
  matched: boolean;
  label: string;
  lines: { nodeId: string; matched: boolean; text: string; observed: string }[];
};

/**
 * "Why did this person match?" — re-runs the tree for one row with tracing on,
 * so every condition reports its observed value even when a group short-circuits.
 */
export function traceMember(
  ir: CohortIR,
  row: Record<string, unknown>,
  dataset: CohortDataset,
  describe: (cond: CohortCondition) => string,
  now = Date.now(),
): MemberTrace {
  const trace: ConditionTrace[] = [];
  const ctx: EvalCtx = { dataset, now, trace };
  const matched = evaluateNode(ir.root, row, ctx);

  const byId = new Map(collectConditions(ir.root).map((c) => [c.id, c]));
  const seen = new Set<string>();
  const lines = trace
    .filter((t) => {
      if (seen.has(t.nodeId)) return false;
      seen.add(t.nodeId);
      return true;
    })
    .map((t) => {
      const cond = byId.get(t.nodeId);
      return {
        nodeId: t.nodeId,
        matched: t.matched,
        text: cond ? describe(cond) : 'Condition',
        observed: t.observed,
      };
    });

  return { matched, label: memberLabel(row).label, lines };
}

/** Overlap statistics between two cohorts — powers the comparison view. */
export function compareCohorts(
  a: CohortIR,
  b: CohortIR,
  dataset: CohortDataset,
  now = Date.now(),
): {
  onlyA: number;
  onlyB: number;
  both: number;
  neither: number;
  jaccard: number;
} {
  const ctx: EvalCtx = { dataset, now };
  let onlyA = 0;
  let onlyB = 0;
  let both = 0;
  let neither = 0;

  for (const row of dataset.rows) {
    const inA = evaluateNode(a.root, row, ctx);
    const inB = evaluateNode(b.root, row, ctx);
    if (inA && inB) both += 1;
    else if (inA) onlyA += 1;
    else if (inB) onlyB += 1;
    else neither += 1;
  }

  const union = onlyA + onlyB + both;
  return { onlyA, onlyB, both, neither, jaccard: union ? both / union : 0 };
}

/**
 * Per-condition contribution: how many people each rule keeps or drops on its
 * own. Surfaced as the "which rule is costing me reach?" breakdown.
 */
export function conditionImpact(
  ir: CohortIR,
  dataset: CohortDataset,
  now = Date.now(),
): { nodeId: string; matches: number; percent: number }[] {
  const ctx: EvalCtx = { dataset, now };
  return collectConditions(ir.root).map((cond) => {
    let n = 0;
    for (const row of dataset.rows) if (evaluateCondition(cond, row, ctx)) n += 1;
    return {
      nodeId: cond.id,
      matches: n,
      percent: dataset.rows.length ? (n / dataset.rows.length) * 100 : 0,
    };
  });
}

/** Distribution of a property across the matched set — the analytics tab. */
export function propertyBreakdown(
  ir: CohortIR,
  dataset: CohortDataset,
  propertyKey: string,
  limit = 8,
  now = Date.now(),
): { value: string; count: number; percent: number }[] {
  const ctx: EvalCtx = { dataset, now };
  const counts = new Map<string, number>();
  let total = 0;

  for (const row of dataset.rows) {
    if (!evaluateNode(ir.root, row, ctx)) continue;
    total += 1;
    const raw = propertyValue(row, propertyKey, dataset.catalog);
    const key = isBlank(raw) ? '(not set)' : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count, percent: total ? (count / total) * 100 : 0 }));
}

/** Top events performed by the matched set — the analytics tab. */
export function topEvents(
  ir: CohortIR,
  dataset: CohortDataset,
  limit = 8,
  now = Date.now(),
): { name: string; count: number; users: number }[] {
  const ctx: EvalCtx = { dataset, now };
  const counts = new Map<string, { count: number; users: Set<string> }>();

  for (const row of dataset.rows) {
    if (!evaluateNode(ir.root, row, ctx)) continue;
    const id = rowId(row);
    for (const ev of dataset.eventsByEntity.get(id) ?? []) {
      let agg = counts.get(ev.name);
      if (!agg) {
        agg = { count: 0, users: new Set() };
        counts.set(ev.name, agg);
      }
      agg.count += 1;
      agg.users.add(id);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([name, agg]) => ({ name, count: agg.count, users: agg.users.size }));
}
