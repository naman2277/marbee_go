// Node executors for the Phase B vertical slice.
//
// An executor is (ctx, node, input) => Promise<ExecResult>. Input and output are
// in-memory row batches for the slice; the interface is deliberately the seam
// where streaming / object-storage handles slot in later (D2 follow-on).
//
// Implemented: source, filter, transform_map, transform_expression, validate,
// target, target_export, merge_streams, branch_if, transform_split, trigger_*.
// Any other node type returns null from getExecutor() and is marked 'skipped'.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { GNode } from './graph.ts';

export type Row = Record<string, unknown>;
export type Dataset = { rows: Row[]; truncated: boolean };

export type ExecContext = {
  supabase: SupabaseClient;
  tenantId: string;
  environment: string;
  runId: string;
  runStartedAt: string;
  rowCap: number;
  triggerPayload?: Record<string, unknown>;
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, nodeId?: string, context?: unknown) => Promise<void>;
};

/** Minimal `{{ … }}` resolver — mirrors apps/web `lib/expressions.ts` (value
 *  tokens only; the fx set is applied client-side). */
function resolveTemplate(
  tpl: string,
  ctx: { runId: string; startedAt: string; row?: Record<string, unknown> },
): string {
  if (!tpl || !tpl.includes('{{')) return tpl ?? '';
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, path) => {
    const p = String(path).trim();
    if (p === 'now') return new Date().toISOString();
    if (p === 'today') return new Date().toISOString().slice(0, 10);
    if (p === 'run.id') return ctx.runId;
    if (p === 'run.started_at') return ctx.startedAt;
    if (p.startsWith('row.')) return String(ctx.row?.[p.slice(4)] ?? '');
    return '';
  });
}

export type ExecResult = {
  /** Default output. */
  out: Dataset;
  /** Extra named outputs for branch / split nodes (keyed by sourceHandle). */
  branches?: Record<string, Dataset>;
  recordsIn: number;
  recordsOut: number;
  recordsFailed: number;
};

const EMPTY: Dataset = { rows: [], truncated: false };

/* ---------------- helpers ---------------- */

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function lines(v: unknown): string[] {
  return str(v)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

async function resolveTable(ctx: ExecContext, ref: unknown): Promise<string> {
  const key = str(ref).trim();
  if (!key) throw new Error('No schema selected');
  const { data, error } = await ctx.supabase
    .from('schema_definitions')
    .select('table_name, status, slug, name, tenant_id, environment')
    .eq('tenant_id', ctx.tenantId)
    .eq('environment', ctx.environment)
    .or(`slug.eq.${key},name.eq.${key},table_name.eq.${key}`)
    .maybeSingle();
  if (error) throw new Error(`Schema lookup failed: ${error.message}`);
  if (!data) throw new Error(`Schema "${key}" not found in this workspace`);
  if (!data.table_name || data.status !== 'published')
    throw new Error(`Schema "${key}" has no published table — publish it first`);
  return data.table_name as string;
}

function compare(op: string, left: unknown, right: string): boolean {
  const l = str(left);
  switch (op) {
    case 'equals': return l === right;
    case 'not_equals': return l !== right;
    case 'contains': return l.includes(right);
    case 'not_contains': return !l.includes(right);
    case 'gt': return Number(left) > Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lte': return Number(left) <= Number(right);
    case 'is_empty': return l === '';
    case 'not_empty': return l !== '';
    case 'in': return right.split(',').map((s) => s.trim()).includes(l);
    default: return false;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function applyFx(expr: string, value: unknown): unknown {
  const m = expr.match(/^(\w+)\((.*)\)$/);
  const fn = (m ? m[1] : expr).toLowerCase();
  switch (fn) {
    case 'lower': return str(value).toLowerCase();
    case 'upper': return str(value).toUpperCase();
    case 'trim': return str(value).trim();
    case 'year': { const d = new Date(str(value)); return isNaN(+d) ? null : d.getUTCFullYear(); }
    case 'length': return str(value).length;
    default: return value;
  }
}

async function csvFromRows(rows: Row[]): Promise<{ text: string; columns: string[] }> {
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = str(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(esc).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(',')).join('\n');
  return { text: `${head}\n${body}`, columns };
}

/* ---------------- wait/delay helpers ---------------- */

function durationToMs(c: Record<string, unknown>): number {
  return (
    (Number(c.weeks) || 0) * 7 * 24 * 3600_000 +
    (Number(c.days) || 0) * 24 * 3600_000 +
    (Number(c.hours) || 0) * 3600_000 +
    (Number(c.minutes) || 0) * 60_000 +
    (Number(c.seconds) || 0) * 1000
  );
}

function durationLabel(c: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Number(c.weeks)) parts.push(`${c.weeks}w`);
  if (Number(c.days)) parts.push(`${c.days}d`);
  if (Number(c.hours)) parts.push(`${c.hours}h`);
  if (Number(c.minutes)) parts.push(`${c.minutes}m`);
  if (Number(c.seconds)) parts.push(`${c.seconds}s`);
  return parts.join(' ') || '0s';
}

export class WaitError extends Error {
  constructor(message: string) { super(message); this.name = 'WaitError'; }
}

async function scheduleResume(ctx: ExecContext, nodeId: string, resumeAt: string, input: Dataset): Promise<void> {
  await ctx.supabase
    .from('data_job_node_runs')
    .update({
      state: 'waiting',
      checkpoint: { resume_at: resumeAt, input_rows: input.rows.length, input_truncated: input.truncated },
    })
    .eq('run_id', ctx.runId)
    .eq('node_id', nodeId);

  await ctx.supabase
    .from('data_job_runs')
    .update({ status: 'waiting', resume_at: resumeAt, stats: { waiting_node_id: nodeId, resume_at: resumeAt } })
    .eq('id', ctx.runId);
}

/* ---------------- executors ---------------- */

type Executor = (ctx: ExecContext, node: GNode, input: Dataset) => Promise<ExecResult>;

const passthrough = (input: Dataset): ExecResult => ({
  out: input,
  recordsIn: input.rows.length,
  recordsOut: input.rows.length,
  recordsFailed: 0,
});

const EXECUTORS: Record<string, Executor> = {
  trigger_schedule: async (_c, _n, input) => passthrough(input),
  trigger_webhook: async (ctx, _n, input) => {
    if (ctx.triggerPayload && Object.keys(ctx.triggerPayload).length > 0) {
      const rows = [ctx.triggerPayload as Row];
      return { out: { rows, truncated: false }, recordsIn: 1, recordsOut: 1, recordsFailed: 0 };
    }
    return passthrough(input);
  },
  trigger_form: async (ctx, node, input) => {
    const tp = ctx.triggerPayload;
    if (tp?.event_type === 'form_submission' && tp.data && typeof tp.data === 'object') {
      const realData = tp.data as Record<string, unknown>;
      const fieldsFilter = lines(node.config.fields_filter);
      const row: Row = {
        _form_id: tp.form_id ?? str(node.config.form_id),
        _form_name: tp.form_name ?? str(node.config.form_name),
        _submission_id: tp.submission_id,
        _submitted_at: tp.submitted_at ?? new Date().toISOString(),
        ...realData,
      };
      if (fieldsFilter.length > 0) {
        const filtered: Row = { _form_id: row._form_id, _form_name: row._form_name, _submission_id: row._submission_id, _submitted_at: row._submitted_at };
        fieldsFilter.forEach((f) => { if (f in row) filtered[f] = row[f]; });
        await ctx.log('info', `Form "${row._form_name}" submission (${fieldsFilter.length} fields filtered)`, node.id);
        return { out: { rows: [filtered], truncated: false }, recordsIn: 1, recordsOut: 1, recordsFailed: 0 };
      }
      await ctx.log('info', `Form "${row._form_name}" submission (${Object.keys(realData).length} fields)`, node.id);
      return { out: { rows: [row], truncated: false }, recordsIn: 1, recordsOut: 1, recordsFailed: 0 };
    }
    await ctx.log('info', 'Form trigger — no submission payload, passing through', node.id);
    return passthrough(input);
  },
  trigger_event: async (ctx, _n, input) => {
    if (ctx.triggerPayload) {
      return { out: { rows: [ctx.triggerPayload as Row], truncated: false }, recordsIn: 1, recordsOut: 1, recordsFailed: 0 };
    }
    return passthrough(input);
  },
  trigger_chat: async (ctx, _n, input) => {
    if (ctx.triggerPayload) {
      return { out: { rows: [ctx.triggerPayload as Row], truncated: false }, recordsIn: 1, recordsOut: 1, recordsFailed: 0 };
    }
    return passthrough(input);
  },
  merge_streams: async (_c, _n, input) => passthrough(input),

  flow_wait: async (ctx, node, input) => {
    const waitType = str(node.config.wait_type) || 'duration';
    let ms = 0;
    let label = '';
    if (waitType === 'datetime') {
      const dt = str(node.config.until_datetime);
      if (dt) {
        ms = new Date(dt).getTime() - Date.now();
        label = `until ${dt}`;
      }
    } else {
      ms = durationToMs(node.config);
      label = durationLabel(node.config);
    }
    if (ms <= 0) {
      await ctx.log('info', `Wait ${label || 'zero duration'} — passing through`, node.id);
      return passthrough(input);
    }
    if (ms > 10 * 60 * 1000) {
      const resumeAt = new Date(Date.now() + ms).toISOString();
      await ctx.log('info', `Wait ${label} — scheduling resume at ${resumeAt}`, node.id);
      await scheduleResume(ctx, node.id, resumeAt, input);
      throw new WaitError(`Waiting until ${resumeAt}`);
    }
    await ctx.log('info', `Wait ${label} — sleeping ${ms}ms`, node.id);
    await new Promise(r => setTimeout(r, ms));
    return passthrough(input);
  },

  source: async (ctx, node) => {
    const table = await resolveTable(ctx, node.config.schema);
    const { data, error } = await ctx.supabase
      .from(table)
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('environment', ctx.environment)
      .limit(ctx.rowCap);
    if (error) throw new Error(`Read ${table} failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    await ctx.log('info', `Read ${rows.length} row(s) from ${table}`, node.id);
    return { out: { rows, truncated: rows.length >= ctx.rowCap }, recordsIn: 0, recordsOut: rows.length, recordsFailed: 0 };
  },

  filter: async (ctx, node, input) => {
    const mode = str(node.config.mode) === 'or' ? 'or' : 'and';
    const conds = lines(node.config.conditions_text).map((l) => {
      const [field, op, ...rest] = l.split(/\s+/);
      return { field, op, value: rest.join(' ') };
    });
    const kept = input.rows.filter((row) => {
      if (!conds.length) return true;
      const results = conds.map((c) => compare(c.op, row[c.field], c.value));
      return mode === 'and' ? results.every(Boolean) : results.some(Boolean);
    });
    await ctx.log('info', `Filter kept ${kept.length} of ${input.rows.length}`, node.id);
    return {
      out: { rows: kept, truncated: input.truncated },
      recordsIn: input.rows.length,
      recordsOut: kept.length,
      recordsFailed: input.rows.length - kept.length,
    };
  },

  transform_map: async (ctx, node, input) => {
    const pairs = lines(node.config.mapping_text).map((l) => {
      const [src, dst] = l.split(/\s*(?:->|→|=>)\s*/);
      return { src: (src ?? '').trim(), dst: (dst ?? src ?? '').trim() };
    }).filter((p) => p.src && p.dst);
    const rows = input.rows.map((row) => {
      const next: Row = {};
      if ('id' in row) next.id = row.id;
      for (const p of pairs) next[p.dst] = row[p.src];
      return next;
    });
    await ctx.log('info', `Mapped ${pairs.length} field(s)`, node.id);
    return { out: { rows, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: rows.length, recordsFailed: 0 };
  },

  transform_expression: async (_c, node, input) => {
    const field = str(node.config.field);
    const outField = str(node.config.output_field) || field;
    const expr = str(node.config.expression);
    const rows = input.rows.map((row) => ({ ...row, [outField]: applyFx(expr, row[field]) }));
    return { out: { rows, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: rows.length, recordsFailed: 0 };
  },

  validate: async (ctx, node, input) => {
    const onFail = str(node.config.on_fail) || 'reject';
    const rules = lines(node.config.rules_text).map((l) => {
      const [field, rule, ...rest] = l.split(/\s+/);
      return { field, rule, arg: rest.join(' ') };
    });
    const check = (row: Row) =>
      rules.every(({ field, rule, arg }) => {
        const v = row[field];
        switch (rule) {
          case 'email_format': return EMAIL_RE.test(str(v));
          case 'not_empty': return str(v).trim() !== '';
          case 'is_number': return v !== '' && v !== null && !isNaN(Number(v));
          case 'regex': try { return new RegExp(arg).test(str(v)); } catch { return true; }
          default: return true;
        }
      });

    let failed = 0;
    const out: Row[] = [];
    for (const row of input.rows) {
      if (check(row)) { out.push(row); continue; }
      failed++;
      if (onFail === 'stop') throw new Error(`Validation failed on a row (rule set: ${rules.map((r) => r.rule).join(', ')})`);
      if (onFail === 'flag') out.push({ ...row, _dq_failed: true });
      // 'reject' → drop
    }
    await ctx.log(failed ? 'warn' : 'info', `Validation: ${failed} of ${input.rows.length} failed (${onFail})`, node.id);
    return { out: { rows: out, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: out.length, recordsFailed: failed };
  },

  transform_dedupe: async (ctx, node, input) => {
    const keys = str(node.config.keys)
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const keep = str(node.config.keep) === 'last' ? 'last' : 'first';
    const seen = new Map<string, Row>();
    const order: string[] = [];
    for (const row of input.rows) {
      const k = keys.length ? keys.map((f) => str(row[f])).join('') : JSON.stringify(row);
      if (!seen.has(k)) order.push(k);
      if (keep === 'last' || !seen.has(k)) seen.set(k, row);
    }
    const out = order.map((k) => seen.get(k)!) as Row[];
    await ctx.log('info', `Deduplicated ${input.rows.length} → ${out.length} on ${keys.join(', ') || 'whole row'}`, node.id);
    return {
      out: { rows: out, truncated: input.truncated },
      recordsIn: input.rows.length,
      recordsOut: out.length,
      recordsFailed: input.rows.length - out.length,
    };
  },

  transform_aggregate: async (ctx, node, input) => {
    const groupBy = str(node.config.group_by)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const metrics = lines(node.config.metrics_text).map((l) => {
      const [fn, field, alias] = l.split(/\s+/);
      return { fn: (fn || 'count').toLowerCase(), field: field || 'id', alias: alias || `${fn}_${field}` };
    });
    const groups = new Map<string, Row[]>();
    for (const row of input.rows) {
      const k = groupBy.map((f) => str(row[f])).join('');
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(row);
    }
    const out: Row[] = [];
    for (const [k, rows] of groups) {
      const rec: Row = {};
      groupBy.forEach((f, i) => (rec[f] = k.split('')[i]));
      for (const m of metrics) {
        const nums = rows.map((r) => Number(r[m.field])).filter((n) => !isNaN(n));
        rec[m.alias] =
          m.fn === 'sum' ? nums.reduce((a, b) => a + b, 0)
          : m.fn === 'avg' ? (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0)
          : m.fn === 'min' ? Math.min(...nums)
          : m.fn === 'max' ? Math.max(...nums)
          : rows.length; // count
      }
      out.push(rec);
    }
    await ctx.log('info', `Aggregated ${input.rows.length} rows into ${out.length} group(s)`, node.id);
    return { out: { rows: out, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: out.length, recordsFailed: 0 };
  },

  transform_join: async (ctx, node, input) => {
    const table = await resolveTable(ctx, node.config.right_schema);
    const leftKey = str(node.config.left_key) || 'id';
    const rightKey = str(node.config.right_key) || 'id';
    const joinType = str(node.config.join_type) || 'left';
    const { data } = await ctx.supabase
      .from(table)
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('environment', ctx.environment)
      .limit(ctx.rowCap);
    const rightIndex = new Map<string, Row[]>();
    for (const r of (data ?? []) as Row[]) {
      const k = str(r[rightKey]);
      (rightIndex.get(k) ?? rightIndex.set(k, []).get(k)!).push(r);
    }
    const out: Row[] = [];
    const usedRight = new Set<string>();
    for (const l of input.rows) {
      const matches = rightIndex.get(str(l[leftKey])) ?? [];
      if (matches.length) {
        for (const r of matches) {
          usedRight.add(str(r[rightKey]));
          out.push({ ...r, ...l });
        }
      } else if (joinType !== 'inner') {
        out.push({ ...l });
      }
    }
    if (joinType === 'right') {
      for (const [k, rows] of rightIndex) if (!usedRight.has(k)) out.push(...rows);
    }
    await ctx.log('info', `${joinType} join on ${leftKey}=${rightKey} → ${out.length} rows`, node.id);
    return { out: { rows: out, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: out.length, recordsFailed: 0 };
  },

  enrich_lookup: async (ctx, node, input) => {
    const table = await resolveTable(ctx, node.config.lookup_schema);
    const localKey = str(node.config.local_key) || 'id';
    const lookupKey = str(node.config.lookup_key) || 'id';
    const fields = str(node.config.fields)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const { data } = await ctx.supabase
      .from(table)
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('environment', ctx.environment)
      .limit(ctx.rowCap);
    const index = new Map<string, Row>();
    for (const r of (data ?? []) as Row[]) index.set(str(r[lookupKey]), r);
    let hit = 0;
    const out = input.rows.map((row) => {
      const match = index.get(str(row[localKey]));
      if (!match) return row;
      hit++;
      const add: Row = {};
      for (const f of fields.length ? fields : Object.keys(match)) add[f] = match[f];
      return { ...row, ...add };
    });
    await ctx.log('info', `Lookup enriched ${hit}/${input.rows.length} row(s) from ${table}`, node.id);
    return { out: { rows: out, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: out.length, recordsFailed: input.rows.length - hit };
  },

  validate_schema: async (ctx, node, input) => {
    const key = str(node.config.schema);
    const { data: schema } = await ctx.supabase
      .from('schema_definitions')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('environment', ctx.environment)
      .or(`slug.eq.${key},name.eq.${key}`)
      .maybeSingle();
    let fields: Array<{ name: string; field_type: string; is_required: boolean }> = [];
    if (schema?.id) {
      const { data } = await ctx.supabase
        .from('schema_fields')
        .select('name, field_type, is_required')
        .eq('schema_id', schema.id);
      fields = (data ?? []) as typeof fields;
    }
    const strict = node.config.strict !== false;
    const typeOk = (v: unknown, t: string) => {
      if (v === null || v === undefined || v === '') return true;
      if (['number', 'integer', 'decimal', 'float'].includes(t)) return !isNaN(Number(v));
      if (['boolean', 'bool'].includes(t)) return typeof v === 'boolean' || v === 'true' || v === 'false';
      if (['timestamp', 'date', 'datetime'].includes(t)) return !isNaN(Date.parse(str(v)));
      return true;
    };
    let failed = 0;
    const out = input.rows.filter((row) => {
      const ok = fields.every((f) => {
        if (f.is_required && (row[f.name] === undefined || row[f.name] === null || row[f.name] === '')) return false;
        return !strict || typeOk(row[f.name], f.field_type);
      });
      if (!ok) failed++;
      return ok || !strict ? ok : false;
    });
    await ctx.log(failed ? 'warn' : 'info', `Schema check: ${failed}/${input.rows.length} row(s) failed`, node.id);
    return { out: { rows: out, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: out.length, recordsFailed: failed };
  },

  validate_anomaly: async (ctx, node, input) => {
    const field = str(node.config.field);
    const method = str(node.config.method) || 'zscore';
    const threshold = Number(node.config.threshold) || 3;
    const nums = input.rows.map((r) => Number(r[field])).filter((n) => !isNaN(n));
    if (nums.length < 3) {
      await ctx.log('info', `Anomaly check on '${field}' skipped — not enough numeric values`, node.id);
      return { out: input, recordsIn: input.rows.length, recordsOut: input.rows.length, recordsFailed: 0 };
    }
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length) || 1;
    const sorted = [...nums].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1 || 1;
    const isOutlier = (v: number) =>
      method === 'iqr' ? v < q1 - threshold * iqr || v > q3 + threshold * iqr : Math.abs((v - mean) / sd) > threshold;
    let flagged = 0;
    const out = input.rows.map((row) => {
      const v = Number(row[field]);
      if (!isNaN(v) && isOutlier(v)) {
        flagged++;
        return { ...row, _anomaly: true };
      }
      return row;
    });
    await ctx.log(flagged ? 'warn' : 'info', `Anomaly (${method}) flagged ${flagged}/${input.rows.length} on '${field}'`, node.id);
    return { out: { rows: out, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: out.length, recordsFailed: flagged };
  },

  source_api: async (ctx, node) => {
    const url = resolveTemplate(str(node.config.url), { runId: ctx.runId, startedAt: ctx.runStartedAt });
    if (!url) throw new Error('HTTP request node has no URL');
    const method = str(node.config.method) || 'GET';
    let headers: Record<string, string> = { Accept: 'application/json' };
    try {
      const h = JSON.parse(str(node.config.headers) || '{}');
      if (h && typeof h === 'object') headers = { ...headers, ...h };
    } catch { /* ignore bad header JSON */ }
    const pagination = str(node.config.pagination) || 'none';

    const rows: Row[] = [];
    let next: string | null = url;
    let page = 0;
    while (next && page < 20 && rows.length < ctx.rowCap) {
      page++;
      const res = await fetch(next, { method, headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`API ${method} ${next} → HTTP ${res.status}`);
      const body = await res.json();
      const batch: unknown[] = Array.isArray(body)
        ? body
        : Array.isArray((body as Record<string, unknown>)?.data)
          ? ((body as Record<string, unknown>).data as unknown[])
          : Array.isArray((body as Record<string, unknown>)?.results)
            ? ((body as Record<string, unknown>).results as unknown[])
            : [body];
      for (const item of batch) if (item && typeof item === 'object') rows.push(item as Row);

      const b = body as Record<string, unknown>;
      if (pagination === 'cursor' && b?.next_cursor) {
        const u = new URL(url);
        u.searchParams.set('cursor', String(b.next_cursor));
        next = u.toString();
      } else if (pagination === 'page' && batch.length) {
        const u = new URL(url);
        u.searchParams.set('page', String(page + 1));
        next = u.toString();
      } else if (pagination === 'offset' && batch.length) {
        const u = new URL(url);
        u.searchParams.set('offset', String(rows.length));
        next = u.toString();
      } else {
        next = null;
      }
    }
    await ctx.log('info', `Fetched ${rows.length} record(s) from ${url} (${page} page(s))`, node.id);
    return { out: { rows: rows.slice(0, ctx.rowCap), truncated: rows.length >= ctx.rowCap }, recordsIn: 0, recordsOut: rows.length, recordsFailed: 0 };
  },

  target: async (ctx, node, input) => {
    const table = await resolveTable(ctx, node.config.schema);
    const matchKey = str(node.config.match_key) || 'id';
    const rows = input.rows.map((r) => ({ ...r, tenant_id: ctx.tenantId, environment: ctx.environment }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await ctx.supabase.from(table).upsert(batch, { onConflict: matchKey, ignoreDuplicates: false });
      if (error) throw new Error(`Write ${table} failed: ${error.message}`);
      written += batch.length;
      await ctx.log('debug', `Upserted ${written}/${rows.length} into ${table}`, node.id);
    }
    await ctx.log('info', `Wrote ${written} row(s) to ${table} (upsert on ${matchKey})`, node.id);
    return { out: { rows: input.rows, truncated: input.truncated }, recordsIn: input.rows.length, recordsOut: written, recordsFailed: 0 };
  },

  target_export: async (ctx, node, input) => {
    const format = str(node.config.format) || 'csv';
    const { text, columns } = await csvFromRows(input.rows);
    const nameHint = resolveTemplate(str(node.config.filename), { runId: ctx.runId, startedAt: ctx.runStartedAt });
    const safeName = nameHint.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || node.id;
    const path = `${ctx.tenantId}/${ctx.runId}/${safeName}.${format === 'json' ? 'json' : 'csv'}`;
    const payload = format === 'json' ? JSON.stringify(input.rows) : text;
    const { error: upErr } = await ctx.supabase.storage
      .from('data-artifacts')
      .upload(path, new Blob([payload]), { upsert: true, contentType: format === 'json' ? 'application/json' : 'text/csv' });
    if (upErr) throw new Error(`Export upload failed: ${upErr.message}`);
    await ctx.supabase.from('data_job_run_artifacts').insert({
      run_id: ctx.runId,
      node_id: node.id,
      kind: 'export',
      storage_bucket: 'data-artifacts',
      storage_path: path,
      content_type: format === 'json' ? 'application/json' : 'text/csv',
      byte_size: payload.length,
      row_count: input.rows.length,
      idempotency_key: `${ctx.runId}:${node.id}:export`,
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    }, { onConflict: 'idempotency_key' });
    await ctx.log('info', `Exported ${input.rows.length} row(s), ${columns.length} column(s) → ${path}`, node.id);
    return { out: input, recordsIn: input.rows.length, recordsOut: input.rows.length, recordsFailed: 0 };
  },

  target_webhook: async (ctx, node, input) => {
    const url = resolveTemplate(str(node.config.url), { runId: ctx.runId, startedAt: ctx.runStartedAt });
    const method = str(node.config.method) || 'POST';
    const tpl = str(node.config.payload_template) || '{{row}}';
    if (!url) throw new Error('Webhook node has no URL');
    let sent = 0;
    let failed = 0;
    const concurrency = 20;
    const sendOne = async (row: Row, index: number) => {
      const body =
        tpl.trim() === '{{row}}'
          ? JSON.stringify(row)
          : resolveTemplate(tpl, { runId: ctx.runId, startedAt: ctx.runStartedAt, row });
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(url, {
              method,
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': `${ctx.runId}:${node.id}:${index}`,
              },
              body,
              signal: AbortSignal.timeout(10_000),
            });
            if (res.ok) return true;
          } catch {
            // Retry transient network and timeout failures below.
          }
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        }
        return false;
    };
    for (let i = 0; i < input.rows.length; i += concurrency) {
      const results = await Promise.all(
        input.rows.slice(i, i + concurrency).map((row, offset) => sendOne(row, i + offset)),
      );
      sent += results.filter(Boolean).length;
      failed += results.filter((ok) => !ok).length;
    }
    await ctx.log(failed ? 'warn' : 'info', `Webhook ${method} ${url} — ${sent} ok, ${failed} failed`, node.id);
    return { out: input, recordsIn: input.rows.length, recordsOut: sent, recordsFailed: failed };
  },

  branch_if: async (_c, node, input) => {
    const field = str(node.config.field);
    const op = str(node.config.operator) || 'equals';
    const value = str(node.config.value);
    const yes: Row[] = [];
    const no: Row[] = [];
    for (const row of input.rows) (compare(op, row[field], value) ? yes : no).push(row);
    return {
      out: { rows: yes, truncated: input.truncated },
      branches: { true: { rows: yes, truncated: input.truncated }, false: { rows: no, truncated: input.truncated } },
      recordsIn: input.rows.length,
      recordsOut: yes.length,
      recordsFailed: 0,
    };
  },

  transform_split: async (_c, node, input) => {
    const field = str(node.config.field);
    const op = str(node.config.operator) || 'equals';
    const value = str(node.config.value);
    const match: Row[] = [];
    const other: Row[] = [];
    for (const row of input.rows) (compare(op, row[field], value) ? match : other).push(row);
    return {
      out: { rows: match, truncated: input.truncated },
      branches: { match: { rows: match, truncated: input.truncated }, other: { rows: other, truncated: input.truncated } },
      recordsIn: input.rows.length,
      recordsOut: match.length,
      recordsFailed: 0,
    };
  },
};

export function getExecutor(type: string): Executor | null {
  return EXECUTORS[type] ?? null;
}

/** Per-column profile for a preview sample: inferred type, null %, distinct, samples. */
export function profileRows(rows: Row[]): Array<{
  column: string;
  type: string;
  nullPct: number;
  distinct: number;
  samples: string[];
}> {
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return columns.map((col) => {
    const values = rows.map((r) => r[col]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
    const distinct = new Set(nonNull.map((v) => str(v))).size;
    const type = inferType(nonNull);
    return {
      column: col,
      type,
      nullPct: rows.length ? Math.round(((rows.length - nonNull.length) / rows.length) * 100) : 0,
      distinct,
      samples: Array.from(new Set(nonNull.map((v) => str(v)))).slice(0, 3),
    };
  });
}

function inferType(values: unknown[]): string {
  if (!values.length) return 'unknown';
  const sample = values.slice(0, 50);
  if (sample.every((v) => typeof v === 'boolean' || v === 'true' || v === 'false')) return 'boolean';
  if (sample.every((v) => v !== '' && !isNaN(Number(v)))) return 'number';
  if (sample.every((v) => !isNaN(Date.parse(str(v))) && /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(str(v))))
    return 'date';
  return 'string';
}

export { EMPTY };
