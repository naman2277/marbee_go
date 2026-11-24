/**
 * Pipeline execution engine — processes data through nodes.
 * Source nodes query real data from Supabase. Transform/action nodes process rows in-memory.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type DataRow = Record<string, unknown>;

export type ErrorCategory = 'validation' | 'configuration' | 'transient' | 'external' | 'internal';

export type NodeResult = {
  status: 'success' | 'failed';
  executionTimeMs: number;
  output: {
    rows_in: number;
    rows_out: number;
    rows_processed: number;
    rows_error: number;
    data: DataRow[];
    error_rows?: DataRow[];
    summary: string;
    error?: string;
    error_category?: ErrorCategory;
    retryable?: boolean;
  };
  /** For branching nodes: which output handle gets which rows */
  branches?: Record<string, DataRow[]>;
};

type Cfg = Record<string, unknown>;
const str = (c: Cfg, k: string) => (c[k] != null ? String(c[k]) : '');
const num = (c: Cfg, k: string, def = 0) => (c[k] != null ? Number(c[k]) : def);
const bool = (c: Cfg, k: string) => c[k] === true || c[k] === 'true';
const val = (row: DataRow, field: string): unknown => {
  if (!field) return undefined;
  const parts = field.split('.');
  let cur: unknown = row;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
};

const resolveTemplate = (template: string, row: DataRow, extra?: Record<string, unknown>): string =>
  template.replace(/\{\{(\w[\w.]*)\}\}/g, (_, k) => {
    if (extra && k in extra) return String(extra[k] ?? '');
    return String(val(row, k) ?? k);
  });

export function formatDynamicAudienceName(pattern: string, row?: DataRow): string {
  if (!pattern) return `Audience_${new Date().toISOString().split('T')[0]}`;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hours}:${minutes}:${seconds}`;
  const timestamp = String(now.getTime());

  let result = pattern
    .replace(/\{\{\s*date(?:\s+["']?([^"'}]+)["']?)?\s*\}\}/g, dateStr)
    .replace(/\{date\}/g, dateStr)
    .replace(/\{\{\s*now\s*\}\}/g, `${dateStr}_${hours}-${minutes}`)
    .replace(/\{now\}/g, `${dateStr}_${hours}-${minutes}`)
    .replace(/\{\{\s*timestamp\s*\}\}/g, timestamp)
    .replace(/\{timestamp\}/g, timestamp)
    .replace(/\{\{\s*time\s*\}\}/g, timeStr)
    .replace(/\{time\}/g, timeStr);

  if (row) {
    for (const [key, v] of Object.entries(row)) {
      if (v != null && typeof v !== 'object') {
        result = result.replace(new RegExp(`\\{\\{\\s*(?:row\\.)?${key}\\s*\\}\\}`, 'g'), String(v));
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(v));
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Seeded PRNG — deterministic data across executions
// ═══════════════════════════════════════════════════════════════════════════

class SeededRng {
  private s: number;
  constructor(seed: number) { this.s = seed; }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) & 0xffffffff;
    return (this.s >>> 0) / 0x100000000;
  }
  int(min: number, max: number) { return Math.floor(this.next() * (max - min + 1)) + min; }
  from<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(threshold = 0.5) { return this.next() > threshold; }
}

let rng = new SeededRng(42);

export function resetSeed(seed = 42) { rng = new SeededRng(seed); }

// ═══════════════════════════════════════════════════════════════════════════
// Sample data generators (for sources/triggers that produce data)
// ═══════════════════════════════════════════════════════════════════════════


function randomFrom<T>(arr: T[]): T { return rng.from(arr); }
function randomInt(min: number, max: number) { return rng.int(min, max); }
function randomDate(daysBack: number) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(rng.next() * daysBack));
  return d.toISOString().split('T')[0];
}




// ═══════════════════════════════════════════════════════════════════════════
// Operator evaluation
// ═══════════════════════════════════════════════════════════════════════════

function evalOp(fieldVal: unknown, operator: string, compareVal: string): boolean {
  const s = fieldVal != null ? String(fieldVal) : '';
  const n = Number(fieldVal);
  const cn = Number(compareVal);
  switch (operator) {
    case 'equals': case 'eq': case '==': return s === compareVal;
    case 'not_equals': case 'ne': case '!=': return s !== compareVal;
    case 'contains': return s.toLowerCase().includes(compareVal.toLowerCase());
    case 'not_contains': return !s.toLowerCase().includes(compareVal.toLowerCase());
    case 'starts_with': return s.toLowerCase().startsWith(compareVal.toLowerCase());
    case 'ends_with': return s.toLowerCase().endsWith(compareVal.toLowerCase());
    case 'gt': case '>': return n > cn;
    case 'lt': case '<': return n < cn;
    case 'gte': case '>=': return n >= cn;
    case 'lte': case '<=': return n <= cn;
    case 'is_empty': return s === '' || fieldVal == null;
    case 'is_not_empty': return s !== '' && fieldVal != null;
    case 'in': return compareVal.split(',').map((v) => v.trim()).includes(s);
    case 'not_in': return !compareVal.split(',').map((v) => v.trim()).includes(s);
    case 'regex': try { return new RegExp(compareVal).test(s); } catch { return false; }
    default: return s === compareVal;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Recursive filter group evaluator (for Read Schema's nested AND/OR groups)
// ═══════════════════════════════════════════════════════════════════════════

type FilterCondition = { field?: string; operator?: string; value?: string };
type FilterGroup = { logic?: string; conditions?: (FilterCondition | FilterGroup)[] };

function isFilterGroup(item: FilterCondition | FilterGroup): item is FilterGroup {
  return 'conditions' in item && Array.isArray((item as FilterGroup).conditions);
}

function evalFilterItem(row: DataRow, item: FilterCondition | FilterGroup): boolean {
  if (isFilterGroup(item)) {
    const logic = item.logic || 'and';
    const conds = item.conditions || [];
    if (conds.length === 0) return true;
    if (logic === 'or') return conds.some((c) => evalFilterItem(row, c));
    return conds.every((c) => evalFilterItem(row, c));
  }
  // Leaf condition
  if (!item.field) return true; // empty condition = pass
  const fieldVal = val(row, item.field);
  const op = item.operator || 'equals';
  const cmpVal = item.value ?? '';

  // Handle date relative operators
  if (op === 'in_last' || op === 'in_next') {
    const parts = cmpVal.split(' ');
    const amount = parseInt(parts[0] || '30');
    const unit = parts[1] || 'days';
    const ms = amount * (unit === 'hours' ? 3600000 : unit === 'weeks' ? 604800000 : unit === 'months' ? 2592000000 : 86400000);
    const fieldDate = new Date(String(fieldVal ?? '')).getTime();
    const now = Date.now();
    if (op === 'in_last') return fieldDate >= now - ms && fieldDate <= now;
    return fieldDate >= now && fieldDate <= now + ms;
  }
  // Handle date presets
  if (['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'last_month'].includes(cmpVal)) {
    const fieldDate = new Date(String(fieldVal ?? '')).getTime();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (cmpVal) {
      case 'today': return fieldDate >= startOfDay;
      case 'yesterday': return fieldDate >= startOfDay - 86400000 && fieldDate < startOfDay;
      case 'last_7_days': return fieldDate >= startOfDay - 7 * 86400000;
      case 'last_30_days': return fieldDate >= startOfDay - 30 * 86400000;
      case 'last_90_days': return fieldDate >= startOfDay - 90 * 86400000;
      case 'this_month': return fieldDate >= new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      case 'last_month': {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const tm = new Date(now.getFullYear(), now.getMonth(), 1);
        return fieldDate >= lm.getTime() && fieldDate < tm.getTime();
      }
      default: return true;
    }
  }
  // Boolean operators
  if (op === 'is_true') return fieldVal === true || fieldVal === 'true';
  if (op === 'is_false') return fieldVal === false || fieldVal === 'false';
  // Date before/after
  if (op === 'before') return new Date(String(fieldVal ?? '')).getTime() < new Date(cmpVal).getTime();
  if (op === 'after') return new Date(String(fieldVal ?? '')).getTime() > new Date(cmpVal).getTime();

  return evalOp(fieldVal, op, cmpVal);
}

function applyFilterGroup(rows: DataRow[], group: FilterGroup): DataRow[] {
  return rows.filter((row) => evalFilterItem(row, group));
}

// Simple expression evaluator for calculate/format nodes
function evalExpression(expr: string, row: DataRow): unknown {
  try {
    const sanitized = expr.replace(/[a-zA-Z_][a-zA-Z0-9_.]*/g, (match) => {
      if (['Math', 'parseInt', 'parseFloat', 'Number', 'String', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity'].includes(match)) return match;
      const v = val(row, match);
      if (v == null) return '0';
      if (typeof v === 'string') return JSON.stringify(v);
      return String(v);
    });
    return new Function(`return (${sanitized})`)();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Node executors — each returns processed rows
// ═══════════════════════════════════════════════════════════════════════════

export type PipelineContext = {
  supabase: SupabaseClient;
  tenantId: string;
  environment: string;
  triggerPayload?: Record<string, unknown>;
};

type ExecContext = {
  config: Cfg;
  inputRows: DataRow[];
  nodeLabel: string;
  ctx?: PipelineContext;
  /** Per-parent-node inputs for multi-input nodes (join, union, intersection, exclusion). Keys are parent node IDs or edge handle labels. */
  allInputs?: Record<string, DataRow[]>;
};

type ExecResult = {
  rows: DataRow[];
  branches?: Record<string, DataRow[]>;
  summary: string;
  errorRows?: DataRow[];
};

const MAX_CLIENT_WAIT_MS = 5 * 60 * 1000; // 5 min max for client-side waits

function durationToMs(c: Cfg): number {
  return (
    num(c, 'weeks') * 7 * 24 * 3600_000 +
    num(c, 'days') * 24 * 3600_000 +
    num(c, 'hours') * 3600_000 +
    num(c, 'minutes') * 60_000 +
    num(c, 'seconds') * 1000
  );
}

function durationLabel(c: Cfg): string {
  const parts: string[] = [];
  if (num(c, 'weeks')) parts.push(`${num(c, 'weeks')}w`);
  if (num(c, 'days')) parts.push(`${num(c, 'days')}d`);
  if (num(c, 'hours')) parts.push(`${num(c, 'hours')}h`);
  if (num(c, 'minutes')) parts.push(`${num(c, 'minutes')}m`);
  if (num(c, 'seconds')) parts.push(`${num(c, 'seconds')}s`);
  return parts.join(' ') || '0s';
}

const executors: Record<string, (ctx: ExecContext) => ExecResult | Promise<ExecResult>> = {
  // ─── TRIGGERS ────────────────────────────────────────────────────
  trigger_schedule: ({ config }) => {
    const freq = str(config, 'frequency') || 'daily';
    const tz = str(config, 'timezone') || 'UTC';
    const cron = str(config, 'cron');
    const misfire = str(config, 'misfire') || 'skip';
    const maxConcurrent = Number(config.max_concurrent) || 1;
    const maxExec = Number(config.max_executions) || 0;
    const now = new Date().toISOString();
    const row: DataRow = {
      triggerType: 'SCHEDULE',
      scheduledTime: now,
      actualTime: now,
      scheduleExpression: freq === 'custom_cron' ? cron : freq,
      timezone: tz,
      executionNumber: 1,
      misfired: false,
      _simulated: true,
      metadata: { scheduleType: freq === 'once' ? 'ONCE' : 'CRON', misfirePolicy: misfire, maxConcurrent, maxExecutions: maxExec },
    };
    const desc = freq === 'custom_cron' ? cron || 'cron' : freq;
    return { rows: [row], summary: `Schedule trigger: ${desc} (${tz}) — sample payload` };
  },
  trigger_webhook: ({ config, ctx }) => {
    const path = str(config, 'path') || crypto.randomUUID();
    const method = str(config, 'method') || 'POST';
    const auth = str(config, 'auth') || 'none';
    const respond = str(config, 'respond') || 'immediately';
    const contentType = str(config, 'content_type') || 'json';
    const ignoreBots = config.ignore_bots === true;
    const rawBody = config.raw_body === true;
    const noResponseBody = config.no_response_body === true;
    const responseCode = Number(config.response_code) || 200;
    const responseContentType = str(config, 'response_content_type') || 'json';
    const ipAllowlist = str(config, 'ip_allowlist');
    const allowedOrigins = str(config, 'allowed_origins');
    const onlyRunIf = str(config, 'only_run_if');
    const idempotencyKey = str(config, 'idempotency_key');
    const binaryField = str(config, 'binary_field');

    const webhookUrl = `/functions/v1/webhook-trigger/${path}`;

    if (ctx?.triggerPayload) {
      const payload = ctx.triggerPayload as DataRow;
      const row: DataRow = {
        ...payload,
        _webhook_path: webhookUrl,
        _webhook_method: method,
        _webhook_content_type: contentType,
        _webhook_received_at: new Date().toISOString(),
        _webhook_respond: respond,
        _webhook_response_code: responseCode,
      };
      if (rawBody && payload.body) row._webhook_raw_body = String(payload.body);
      if (binaryField && payload[binaryField]) row._webhook_binary = `[binary:${binaryField}]`;
      return { rows: [row], summary: `Webhook ${method} ${webhookUrl} → 1 payload received (respond: ${respond})` };
    }

    const details: string[] = [`${method} ${webhookUrl}`];
    if (auth !== 'none') details.push(`auth: ${auth}`);
    if (respond !== 'immediately') details.push(`respond: ${respond}`);
    if (ignoreBots) details.push('ignore bots');
    if (ipAllowlist) details.push(`IP filter: ${ipAllowlist.split(',').length} range(s)`);
    if (allowedOrigins) details.push('CORS restricted');
    if (onlyRunIf) details.push('conditional');
    if (noResponseBody) details.push(`${responseCode} no body`);
    else details.push(`${responseCode} ${responseContentType}`);
    if (idempotencyKey) details.push(`dedup: ${idempotencyKey}`);

    const sampleRow: DataRow = {
      _webhook_path: webhookUrl,
      _webhook_method: method,
      _webhook_auth: auth,
      _webhook_content_type: contentType,
      _webhook_respond: respond,
      _webhook_response_code: responseCode,
      _webhook_response_content_type: responseContentType,
      _webhook_no_response_body: noResponseBody,
      _webhook_ignore_bots: ignoreBots,
      _webhook_raw_body: rawBody,
      _simulated: true,
      body: contentType === 'json' ? '{"example":"payload"}' : '<example>payload</example>',
      headers: '{"content-type":"application/json"}',
      query: '{}',
      method,
    };
    if (ipAllowlist) sampleRow._webhook_ip_allowlist = ipAllowlist;
    if (allowedOrigins) sampleRow._webhook_allowed_origins = allowedOrigins;
    if (onlyRunIf) sampleRow._webhook_only_run_if = onlyRunIf;
    if (idempotencyKey) sampleRow._webhook_idempotency_key = idempotencyKey;
    if (binaryField) sampleRow._webhook_binary_field = binaryField;

    const responseMode = str(config, 'response_mode') || 'ASYNC';
    const maxPayloadSize = Number(config.max_payload_size) || 1048576;
    const rateLimit = Number(config.rate_limit) || 1000;
    const replayProtection = config.replay_protection === true;
    const hmacAlgorithm = str(config, 'hmac_algorithm') || 'SHA256';
    sampleRow._webhook_response_mode = responseMode;
    sampleRow._webhook_max_payload_size = maxPayloadSize;
    sampleRow._webhook_rate_limit = rateLimit;
    if (auth === 'hmac') {
      sampleRow._webhook_hmac_algorithm = hmacAlgorithm;
      sampleRow._webhook_hmac_header = str(config, 'hmac_header') || 'X-Signature';
    }
    if (replayProtection) sampleRow._webhook_replay_protection = true;
    if (responseMode !== 'ASYNC') details.push(`response: ${responseMode}`);
    if (rateLimit !== 1000) details.push(`rate: ${rateLimit}/min`);
    if (replayProtection) details.push('replay protection');

    return { rows: [sampleRow], summary: `Webhook ${details.join(' · ')} — sample payload (awaiting HTTP call)` };
  },
  trigger_event: async ({ config, ctx }) => {
    const eventName = str(config, 'event_name') || 'purchase';
    const source = str(config, 'source') || 'platform';
    const dedupWindow = Number(config.dedup_window) || 0;
    const dedupKey = str(config, 'dedup_key');
    const batchWindow = Number(config.batch_window) || 0;
    const maxBatchSize = Number(config.max_batch_size) || 100;
    if (ctx) {
      let query = ctx.supabase.from('events').select('*').eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(maxBatchSize);
      if (eventName) query = query.eq('event_type', eventName);
      const { data } = await query;
      const rows = (data ?? []) as unknown as DataRow[];
      return { rows, summary: `${rows.length} "${eventName}" events from DB (source: ${source})` };
    }
    const sampleRow: DataRow = {
      triggerType: 'EVENT',
      event: { eventId: 'evt_sample', eventType: eventName, eventSource: source, timestamp: new Date().toISOString(), data: {} },
      subscription: { eventType: eventName, matchedConditions: true },
      metadata: { receivedAt: new Date().toISOString(), deduplicationWindow: dedupWindow, deduplicationKey: dedupKey, batchWindow, maxBatchSize },
      _simulated: true,
    };
    const details = [eventName, `source: ${source}`];
    if (dedupWindow > 0) details.push(`dedup: ${dedupWindow}s`);
    if (batchWindow > 0) details.push(`batch: ${batchWindow}s/${maxBatchSize}`);
    return { rows: [sampleRow], summary: `Event trigger: ${details.join(' · ')} — sample payload` };
  },
  trigger_api: async ({ ctx }) => {
    if (ctx) {
      const { data } = await ctx.supabase.from('customers').select('*').eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(100);
      const rows = (data ?? []) as unknown as DataRow[];
      return { rows, summary: `API trigger → ${rows.length} records from DB` };
    }
    return { rows: [], summary: `API trigger — 0 data rows (awaiting API call)` };
  },
  trigger_manual: async ({ config, ctx }) => {
    if (ctx) {
      const { data } = await ctx.supabase.from('customers').select('*').eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(100);
      const rows = (data ?? []) as unknown as DataRow[];
      return { rows, summary: `Manual run → ${rows.length} records` };
    }
    return { rows: [], summary: `Manual trigger "${str(config, 'description') || ''}" — 0 data rows (connect a source node)` };
  },
  trigger_file: ({ config, ctx }) => {
    const source = str(config, 'source') || 'storage';
    const folder = str(config, 'watch_folder') || '/';
    const namePattern = str(config, 'file_name_pattern') || '*';
    const format = str(config, 'format') || 'csv';
    const label = `${folder}/${namePattern}.${format}`;
    if (ctx?.triggerPayload) {
      const rows = Array.isArray(ctx.triggerPayload) ? ctx.triggerPayload as DataRow[] : [ctx.triggerPayload as DataRow];
      return { rows, summary: `File ${source}:${label} → ${rows.length} rows` };
    }
    return { rows: [], summary: `File trigger ${source}:${label} — awaiting file` };
  },
  trigger_form: ({ config, ctx }) => {
    const formName = str(config, 'form_name') || 'Contact Form';
    const formId = str(config, 'form_id') || 'form_001';
    const fieldsFilter = str(config, 'fields_filter').split('\n').filter(Boolean);

    // Use real form submission data if available from a trigger event
    const tp = ctx?.triggerPayload;
    if (tp?.event_type === 'form_submission' && tp.data && typeof tp.data === 'object') {
      const realData = tp.data as Record<string, unknown>;
      const row: Record<string, unknown> = {
        _form_id: tp.form_id ?? formId,
        _form_name: tp.form_name ?? formName,
        _submission_id: tp.submission_id,
        _submitted_at: tp.submitted_at ?? new Date().toISOString(),
        ...realData,
      };
      if (fieldsFilter.length > 0) {
        const filtered: Record<string, unknown> = { _form_id: row._form_id, _form_name: row._form_name, _submission_id: row._submission_id, _submitted_at: row._submitted_at };
        fieldsFilter.forEach((f) => { if (f in row) filtered[f] = row[f]; });
        return { rows: [filtered], summary: `Form "${row._form_name}" submission (${fieldsFilter.length} fields)` };
      }
      return { rows: [row], summary: `Form "${row._form_name}" submission (${Object.keys(realData).length} fields)` };
    }

    // Fallback: generate sample data for test runs
    const row: Record<string, unknown> = {
      _form_id: formId, _form_name: formName, _submitted_at: new Date().toISOString(),
      name: 'Jane Doe', email: 'jane@example.com', phone: '+15551234567', message: 'I am interested in your product',
    };
    if (fieldsFilter.length > 0) {
      const filtered: Record<string, unknown> = { _form_id: formId, _form_name: formName, _submitted_at: row._submitted_at };
      fieldsFilter.forEach((f) => { if (f in row) filtered[f] = row[f]; });
      return { rows: [filtered], summary: `Form "${formName}" (${fieldsFilter.length} fields)` };
    }
    return { rows: [row], summary: `Form "${formName}" (all fields)` };
  },
  trigger_chat: ({ config, ctx }) => {
    const chatName = str(config, 'chat_name') || 'Workflow Bot';
    if (ctx?.triggerPayload) {
      const rows = [ctx.triggerPayload as DataRow];
      return { rows, summary: `Chat "${chatName}" → 1 message received` };
    }
    return { rows: [], summary: `Chat trigger "${chatName}" — 0 data rows (awaiting message)` };
  },
  trigger_workflow: ({ config, ctx }) => {
    const sourceWorkflow = str(config, 'source_workflow_name') || 'Parent Workflow';
    const passData = config.pass_data !== false;
    if (ctx?.triggerPayload && passData) {
      const rows = Array.isArray(ctx.triggerPayload) ? ctx.triggerPayload as DataRow[] : [ctx.triggerPayload as DataRow];
      return { rows, summary: `Triggered by "${sourceWorkflow}" → ${rows.length} rows passed` };
    }
    return { rows: [], summary: `Workflow trigger "${sourceWorkflow}" — 0 data rows (${passData ? 'awaiting trigger' : 'no data pass'})` };
  },

  // ─── SOURCES ─────────────────────────────────────────────────────
  source: async ({ config, inputRows, ctx }) => {
    const schemaSlug = str(config, 'schema') || 'customer';
    const selectedFields = config.selected_fields as string[] | undefined;
    const filterGroup = config.filter_group as FilterGroup | undefined;
    const sortField = str(config, 'sort_field');
    const sortOrder = str(config, 'sort_order') || 'desc';
    const limit = num(config, 'limit', 10000);
    const dedup = config.deduplicate === true;
    const dedupField = str(config, 'deduplicate_field');

    // Query real data from Supabase
    let rows: DataRow[] = [];
    if (ctx) {
      // Resolve table_name from schema_definitions
      let tableName = str(config, 'table_name');
      if (!tableName) {
        // Try exact slug match, then without common suffixes like _profile
        const slugVariants = [schemaSlug, schemaSlug.replace(/_profile$/, ''), schemaSlug.replace(/_data$/, '')];
        for (const slug of slugVariants) {
          try {
            const { data: schemaDef } = await ctx.supabase
              .from('schema_definitions')
              .select('table_name')
              .eq('tenant_id', ctx.tenantId)
              .eq('environment', ctx.environment)
              .eq('slug', slug)
              .maybeSingle();
            if (schemaDef?.table_name) { tableName = schemaDef.table_name; break; }
          } catch { /* continue to next variant */ }
        }
        if (!tableName) tableName = 'customers';
      }

      // Always select all columns — selected_fields are applied client-side
      // because field names in configs may not match actual DB column names
      let query = ctx.supabase
        .from(tableName)
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('environment', ctx.environment)
        .limit(Math.min(limit, 10000));

      if (sortField) {
        query = query.order(sortField, { ascending: sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        console.error('[pipeline] source query error:', { tableName, tenantId: ctx.tenantId, environment: ctx.environment, error });
        return { rows: [], summary: `Schema "${schemaSlug}" from ${tableName} (tenant: ${ctx.tenantId}, env: ${ctx.environment}): query error — ${error.message}`, errorRows: [] };
      }
      rows = (data ?? []) as unknown as DataRow[];

      // Apply field selection client-side (keep only selected fields if specified)
      if (selectedFields && selectedFields.length > 0) {
        rows = rows.map((row) => {
          const out: DataRow = {};
          for (const f of selectedFields) {
            if (f in row) out[f] = row[f];
          }
          return out;
        });
      }
    } else {
      rows = inputRows;
    }

    const totalBefore = rows.length;

    // Apply client-side filter conditions
    if (filterGroup && Array.isArray(filterGroup.conditions) && filterGroup.conditions.length > 0) {
      rows = applyFilterGroup(rows, filterGroup);
    }
    const afterFilter = rows.length;

    // Deduplicate
    if (dedup && dedupField) {
      const seen = new Set<string>();
      rows = rows.filter((row) => {
        const key = String(val(row, dedupField) ?? '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    const afterDedup = rows.length;

    const parts = [`Schema "${schemaSlug}": ${totalBefore} rows from DB`];
    if (afterFilter < totalBefore) parts.push(`${afterFilter} after filter`);
    if (dedup && afterDedup < afterFilter) parts.push(`${afterDedup} after dedup`);
    parts.push(`→ ${rows.length} rows output`);

    return { rows, summary: parts.join(' · ') };
  },
  source_connector: async ({ config, inputRows, ctx }) => {
    const connectorId = str(config, 'connector_id');
    const object = str(config, 'object') || 'customers';
    const fieldsStr = str(config, 'fields');
    const filterExpr = str(config, 'filter');
    if (ctx) {
      const { data: schemaDef } = await ctx.supabase
        .from('schema_definitions').select('table_name').eq('tenant_id', ctx.tenantId).eq('name', object).maybeSingle();
      const table = schemaDef?.table_name || object;
      const selectCols = fieldsStr ? fieldsStr.split(',').map((f: string) => f.trim()).filter(Boolean).join(',') : '*';
      let q = ctx.supabase.from(table).select(selectCols).eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment);
      if (filterExpr) {
        const parts = filterExpr.trim().split(/\s+/);
        if (parts.length >= 3) {
          const [field, op, ...rest] = parts;
          const value = rest.join(' ').replace(/^["']|["']$/g, '');
          if (op === '=' || op === 'eq') q = q.eq(field, value);
          else if (op === '!=' || op === 'neq') q = q.neq(field, value);
          else if (op === '>' || op === 'gt') q = q.gt(field, value);
          else if (op === '<' || op === 'lt') q = q.lt(field, value);
          else if (op === 'like' || op === 'ilike') q = q.ilike(field, value);
        }
      }
      const { data } = await q.limit(1000);
      const rows = (data ?? []) as unknown as DataRow[];
      return { rows, summary: `Connector "${connectorId || 'crm'}" → ${object} → ${rows.length} rows` };
    }
    if (inputRows.length > 0) return { rows: inputRows, summary: `Connector "${connectorId || 'crm'}" → ${object} → ${inputRows.length} rows (pass-through)` };
    return { rows: [], summary: `Connector "${connectorId || 'crm'}" → ${object} — 0 rows (no DB connection)` };
  },
  source_api: ({ config, inputRows }) => {
    const url = str(config, 'url');
    if (inputRows.length > 0) return { rows: inputRows, summary: `${str(config, 'method') || 'GET'} ${url || 'API'} → ${inputRows.length} rows (pass-through)` };
    return { rows: [], summary: `${str(config, 'method') || 'GET'} ${url || 'API'} — 0 rows (requires live API call)` };
  },
  source_file: ({ config, inputRows }) => {
    if (inputRows.length > 0) return { rows: inputRows, summary: `${str(config, 'format') || 'CSV'} file → ${inputRows.length} rows (pass-through)` };
    return { rows: [], summary: `${str(config, 'format') || 'CSV'} file — 0 rows (requires file upload)` };
  },
  source_query: async ({ config, inputRows, ctx }) => {
    const query = str(config, 'query');
    const maxRows = num(config, 'max_rows', 1000);
    if (ctx && query) {
      const tableMatch = query.match(/FROM\s+(\w+)/i);
      const table = tableMatch?.[1] || 'customers';
      const selectMatch = query.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
      const selectCols = selectMatch?.[1]?.trim() === '*' ? '*' : selectMatch?.[1]?.trim() || '*';
      let q = ctx.supabase.from(table).select(selectCols === '*' ? '*' : selectCols).eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment);
      const whereMatch = query.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|\s*$)/i);
      if (whereMatch) {
        const clauses = whereMatch[1].split(/\s+AND\s+/i);
        for (const clause of clauses) {
          const m = clause.trim().match(/^(\w+)\s*(=|!=|>|<|>=|<=|LIKE|ILIKE)\s*'?([^']*)'?$/i);
          if (m) {
            const [, field, op, value] = m;
            if (op === '=' || op.toLowerCase() === 'eq') q = q.eq(field, value);
            else if (op === '!=' || op.toLowerCase() === 'neq') q = q.neq(field, value);
            else if (op === '>') q = q.gt(field, value);
            else if (op === '<') q = q.lt(field, value);
            else if (op === '>=') q = q.gte(field, value);
            else if (op === '<=') q = q.lte(field, value);
            else if (op.toLowerCase() === 'ilike' || op.toLowerCase() === 'like') q = q.ilike(field, `%${value}%`);
          }
        }
      }
      const orderMatch = query.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
      if (orderMatch) q = q.order(orderMatch[1], { ascending: orderMatch[2]?.toUpperCase() !== 'DESC' });
      const limitMatch = query.match(/LIMIT\s+(\d+)/i);
      const limit = limitMatch ? Math.min(parseInt(limitMatch[1]), maxRows) : maxRows;
      const { data } = await q.limit(limit);
      const rows = (data ?? []) as unknown as DataRow[];
      return { rows, summary: `SQL → ${table}: ${rows.length} rows` };
    }
    if (inputRows.length > 0) return { rows: inputRows, summary: `SQL query → ${inputRows.length} rows (pass-through)` };
    return { rows: [], summary: `SQL query — 0 rows (requires DB connection)` };
  },
  source_db_query: async ({ config, inputRows, ctx }) => {
    const connectorId = str(config, 'connector_id');
    const query = str(config, 'query');
    const timeout = num(config, 'timeout', 60);
    if (ctx && query) {
      const tableMatch = query.match(/FROM\s+(\w+)/i);
      const table = tableMatch?.[1] || 'customers';
      let q = ctx.supabase.from(table).select('*').eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment);
      const limitMatch = query.match(/LIMIT\s+(\d+)/i);
      const limit = limitMatch ? parseInt(limitMatch[1]) : 1000;
      const { data } = await q.limit(limit);
      const rows = (data ?? []) as unknown as DataRow[];
      return { rows, summary: `DB "${connectorId || 'db'}" → ${table}: ${rows.length} rows (timeout: ${timeout}s)` };
    }
    if (inputRows.length > 0) return { rows: inputRows, summary: `DB query (${connectorId || 'db'}) → ${inputRows.length} rows (pass-through)` };
    return { rows: [], summary: `DB query (${connectorId || 'db'}) — 0 rows (requires DB connection)` };
  },
  source_api_graphql: ({ config, inputRows }) => {
    if (inputRows.length > 0) return { rows: inputRows, summary: `GraphQL ${str(config, 'url') || 'endpoint'} → ${inputRows.length} rows (pass-through)` };
    return { rows: [], summary: `GraphQL ${str(config, 'url') || 'endpoint'} — 0 rows (requires live API call)` };
  },
  source_storage: async ({ config, inputRows, ctx }) => {
    if (ctx) {
      const table = str(config, 'table_name') || 'customers';
      const { data } = await ctx.supabase.from(table).select('*').eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(1000);
      const rows = (data ?? []) as unknown as DataRow[];
      return { rows, summary: `${str(config, 'provider') || 'storage'}://${str(config, 'bucket') || 'bucket'} → ${rows.length} rows` };
    }
    if (inputRows.length > 0) return { rows: inputRows, summary: `${str(config, 'provider') || 's3'}://${str(config, 'bucket') || 'bucket'} → ${inputRows.length} rows (pass-through)` };
    return { rows: [], summary: `${str(config, 'provider') || 's3'}://${str(config, 'bucket') || 'bucket'} — 0 rows (requires storage connection)` };
  },

  // ─── TRANSFORM ───────────────────────────────────────────────────
  transform_select: ({ config, inputRows }) => {
    const fieldList = str(config, 'fields').split(/[\n,]/).map((f) => f.trim()).filter(Boolean);
    if (!fieldList.length) return { rows: inputRows, summary: 'No fields specified — pass-through' };
    const exclude = bool(config, 'exclude');
    const rows = inputRows.map((row) => {
      if (exclude) {
        const out = { ...row };
        fieldList.forEach((f) => delete out[f]);
        return out;
      }
      const out: DataRow = {};
      fieldList.forEach((f) => { if (f in row) out[f] = row[f]; });
      return out;
    });
    return { rows, summary: `${exclude ? 'Excluded' : 'Selected'} ${fieldList.length} fields → ${rows.length} rows` };
  },

  transform_map: ({ config, inputRows }) => {
    const mappingText = str(config, 'mapping_text');
    const mappings = mappingText.split('\n').filter(Boolean).map((line) => {
      const [from, to] = line.split('→').map((s) => s.trim());
      return { from: from || '', to: to || from || '' };
    });
    if (!mappings.length) return { rows: inputRows, summary: 'No mappings — pass-through' };
    const rows = inputRows.map((row) => {
      const out: DataRow = {};
      mappings.forEach((m) => { out[m.to] = val(row, m.from); });
      return out;
    });
    return { rows, summary: `Mapped ${mappings.length} fields → ${rows.length} rows` };
  },

  transform_rename: ({ config, inputRows }) => {
    const renames = str(config, 'renames').split('\n').filter(Boolean).map((line) => {
      const [from, to] = line.split('→').map((s) => s.trim());
      return { from: from || '', to: to || '' };
    }).filter((r) => r.from && r.to);
    if (!renames.length) return { rows: inputRows, summary: 'No renames — pass-through' };
    const rows = inputRows.map((row) => {
      const out = { ...row };
      renames.forEach((r) => { if (r.from in out) { out[r.to] = out[r.from]; delete out[r.from]; } });
      return out;
    });
    return { rows, summary: `Renamed ${renames.length} fields → ${rows.length} rows` };
  },

  filter: ({ config, inputRows }) => {
    const mode = str(config, 'mode') || 'and';
    const condText = str(config, 'conditions_text');
    const emitNoMatch = config.emit_no_match !== false;
    const conditions = (Array.isArray(config.conditions) ? config.conditions as { field: string; operator: string; value: string }[] : [])
      .concat(condText ? condText.split('\n').filter(Boolean).map((line) => {
        const parts = line.trim().split(/\s+/);
        return { field: parts[0] || '', operator: parts[1] || 'equals', value: parts.slice(2).join(' ') };
      }) : [])
      .filter((c) => c.field);
    if (!conditions.length) return { rows: inputRows, summary: 'No conditions — pass-through' };
    const matchRows: DataRow[] = [];
    const noMatchRows: DataRow[] = [];
    for (const row of inputRows) {
      const results = conditions.map((c) => evalOp(val(row, c.field), c.operator, c.value));
      const matches = mode === 'or' ? results.some(Boolean) : results.every(Boolean);
      if (matches) matchRows.push(row);
      else noMatchRows.push(row);
    }
    const branches: Record<string, DataRow[]> = { match: matchRows };
    if (emitNoMatch) branches.no_match = noMatchRows;
    return { rows: matchRows, summary: `Filtered ${inputRows.length} → ${matchRows.length} match, ${noMatchRows.length} no_match (${mode.toUpperCase()}, ${conditions.length} rules)`, branches };
  },

  transform_calculate: ({ config, inputRows }) => {
    const outputField = str(config, 'output_field') || 'calculated';
    const expression = str(config, 'expression');
    if (!expression) return { rows: inputRows, summary: 'No expression — pass-through' };
    const rows = inputRows.map((row) => ({ ...row, [outputField]: evalExpression(expression, row) }));
    return { rows, summary: `Calculated "${outputField}" → ${rows.length} rows` };
  },

  transform_format: ({ config, inputRows }) => {
    const field = str(config, 'field');
    const operation = str(config, 'operation');
    if (!field) return { rows: inputRows, summary: 'No field — pass-through' };
    const rows = inputRows.map((row) => {
      const v = val(row, field);
      const s = v != null ? String(v) : '';
      let result: unknown = s;
      switch (operation) {
        case 'lowercase': result = s.toLowerCase(); break;
        case 'uppercase': result = s.toUpperCase(); break;
        case 'trim': result = s.trim(); break;
        case 'titlecase': result = s.replace(/\b\w/g, (c) => c.toUpperCase()); break;
        case 'slug': result = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); break;
        case 'phone_format': result = s.replace(/\D/g, '').replace(/^(\d)(\d{3})(\d{3})(\d{4})$/, '+$1$2$3$4'); break;
        case 'date_format': {
          try { const d = new Date(s); result = d.toISOString().split('T')[0]; } catch { result = s; }
          break;
        }
        default: result = s;
      }
      return { ...row, [field]: result };
    });
    return { rows, summary: `${operation} on "${field}" → ${rows.length} rows` };
  },

  transform_join: async ({ config, inputRows, allInputs, ctx }) => {
    const joinType = str(config, 'join_type') || 'left';
    const leftKey = str(config, 'left_key') || 'id';
    const rightKey = str(config, 'right_key') || 'id';
    const rightSchema = str(config, 'right_schema');

    // Resolve left and right streams from multi-input
    let leftRows: DataRow[] = [];
    let rightRows: DataRow[] = [];

    if (allInputs) {
      const inputKeys = Object.keys(allInputs);
      if (inputKeys.length >= 2) {
        leftRows = allInputs[inputKeys[0]] ?? [];
        rightRows = allInputs[inputKeys[1]] ?? [];
      } else if (inputKeys.length === 1) {
        leftRows = allInputs[inputKeys[0]] ?? [];
      }
    }
    if (leftRows.length === 0) leftRows = inputRows;

    // If right side is empty, try loading from right_schema config
    if (rightRows.length === 0 && ctx && rightSchema) {
      const { data: schemaDef } = await ctx.supabase
        .from('schema_definitions').select('table_name').eq('tenant_id', ctx.tenantId).eq('name', rightSchema).maybeSingle();
      const table = schemaDef?.table_name || rightSchema;
      const { data } = await ctx.supabase.from(table).select('*').eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(5000);
      rightRows = (data ?? []) as unknown as DataRow[];
    }

    if (leftRows.length === 0 && rightRows.length === 0) {
      return { rows: [], summary: `${joinType} join — no input data on either side` };
    }
    if (rightRows.length === 0) {
      return { rows: leftRows, summary: `${joinType} join — no right-side data (connect a second input or set right schema)` };
    }

    // Build right-side index (supports duplicate keys via array)
    const rightIndex = new Map<string, DataRow[]>();
    rightRows.forEach((r) => {
      const k = String(val(r, rightKey) ?? '');
      if (k) {
        if (!rightIndex.has(k)) rightIndex.set(k, []);
        rightIndex.get(k)!.push(r);
      }
    });

    let rows: DataRow[] = [];
    const usedRightKeys = new Set<string>();

    if (joinType === 'inner') {
      for (const l of leftRows) {
        const k = String(val(l, leftKey) ?? '');
        const matches = rightIndex.get(k);
        if (matches) {
          matches.forEach((r) => rows.push({ ...l, ...r }));
          usedRightKeys.add(k);
        }
      }
    } else if (joinType === 'left') {
      for (const l of leftRows) {
        const k = String(val(l, leftKey) ?? '');
        const matches = rightIndex.get(k);
        if (matches) {
          matches.forEach((r) => rows.push({ ...l, ...r }));
        } else {
          rows.push(l);
        }
      }
    } else if (joinType === 'right') {
      const leftIndex = new Map<string, DataRow[]>();
      leftRows.forEach((r) => {
        const k = String(val(r, leftKey) ?? '');
        if (k) {
          if (!leftIndex.has(k)) leftIndex.set(k, []);
          leftIndex.get(k)!.push(r);
        }
      });
      for (const r of rightRows) {
        const k = String(val(r, rightKey) ?? '');
        const matches = leftIndex.get(k);
        if (matches) {
          matches.forEach((l) => rows.push({ ...l, ...r }));
        } else {
          rows.push(r);
        }
      }
    } else {
      // Full outer join
      for (const l of leftRows) {
        const k = String(val(l, leftKey) ?? '');
        const matches = rightIndex.get(k);
        if (matches) {
          matches.forEach((r) => rows.push({ ...l, ...r }));
          usedRightKeys.add(k);
        } else {
          rows.push(l);
        }
      }
      for (const r of rightRows) {
        const k = String(val(r, rightKey) ?? '');
        if (!usedRightKeys.has(k)) rows.push(r);
      }
    }

    return { rows, summary: `${joinType} join on ${leftKey}↔${rightKey}: ${leftRows.length} left + ${rightRows.length} right → ${rows.length} result` };
  },

  transform_aggregate: ({ config, inputRows }) => {
    const groupBy = str(config, 'group_by');
    if (!groupBy) return { rows: inputRows, summary: 'No group-by — pass-through' };
    const groups = new Map<string, DataRow[]>();
    inputRows.forEach((r) => {
      const key = String(val(r, groupBy) ?? '(null)');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    const metricsText = str(config, 'metrics_text');
    const metrics = metricsText ? metricsText.split('\n').filter(Boolean).map((l) => {
      const [fn, field, alias] = l.trim().split(/\s+/);
      return { fn: fn || 'count', field: field || 'id', alias: alias || `${fn}_${field}` };
    }) : [{ fn: 'count', field: 'id', alias: 'count' }];

    const rows: DataRow[] = [];
    groups.forEach((groupRows, key) => {
      const out: DataRow = { [groupBy]: key };
      metrics.forEach((m) => {
        const vals = groupRows.map((r) => Number(val(r, m.field) ?? 0)).filter((v) => !isNaN(v));
        switch (m.fn) {
          case 'count': out[m.alias] = groupRows.length; break;
          case 'sum': out[m.alias] = vals.reduce((a, b) => a + b, 0); break;
          case 'avg': out[m.alias] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100 : 0; break;
          case 'min': out[m.alias] = vals.length ? Math.min(...vals) : 0; break;
          case 'max': out[m.alias] = vals.length ? Math.max(...vals) : 0; break;
          default: out[m.alias] = groupRows.length;
        }
      });
      rows.push(out);
    });
    return { rows, summary: `Grouped by "${groupBy}" → ${rows.length} groups` };
  },

  transform_dedupe: ({ config, inputRows }) => {
    const keys = str(config, 'keys').split(',').map((k) => k.trim()).filter(Boolean);
    if (!keys.length) return { rows: inputRows, summary: 'No keys — pass-through' };
    const keep = str(config, 'keep') || 'first';
    const maxDupes = num(config, 'max_duplicates', 0);
    const outputDuplicates = Boolean(config.output_duplicates);
    const seen = new Map<string, number>();
    const ordered = keep === 'last' ? [...inputRows].reverse() : inputRows;
    const kept: DataRow[] = [];
    const excluded: DataRow[] = [];
    ordered.forEach((row) => {
      const key = keys.map((k) => String(val(row, k) ?? '')).join('|');
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count === 0) {
        kept.push(row);
      } else if (maxDupes === -1 || count <= maxDupes) {
        kept.push({ ...row, _duplicate_number: count });
      } else {
        excluded.push(row);
      }
    });
    const finalKept = keep === 'last' ? kept.reverse() : kept;
    const finalExcluded = keep === 'last' ? excluded.reverse() : excluded;
    const dupeLabel = maxDupes === -1 ? 'keep all' : maxDupes === 0 ? 'unique only' : `keep ${maxDupes}`;
    const result: ExecResult = {
      rows: finalKept,
      summary: `Deduped by ${keys.join(',')} (${dupeLabel}) → ${finalKept.length} kept, ${finalExcluded.length} excluded`,
    };
    if (outputDuplicates) {
      result.branches = { unique: finalKept, duplicates: finalExcluded };
    }
    return result;
  },

  enrich_lookup: async ({ config, inputRows, ctx }) => {
    const localKey = str(config, 'local_key') || 'email';
    const lookupKey = str(config, 'lookup_key') || 'email';
    const fieldsToAdd = str(config, 'fields').split(',').map((f: string) => f.trim()).filter(Boolean);
    const lookupSchema = str(config, 'lookup_schema');

    let lookupRows: DataRow[];
    if (ctx && lookupSchema) {
      const { data: schemaDef } = await ctx.supabase
        .from('schema_definitions').select('table_name').eq('tenant_id', ctx.tenantId).eq('name', lookupSchema).maybeSingle();
      const table = schemaDef?.table_name || lookupSchema;
      const selectCols = fieldsToAdd.length ? [lookupKey, ...fieldsToAdd].join(',') : '*';
      const { data } = await ctx.supabase.from(table).select(selectCols).eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(5000);
      lookupRows = (data ?? []) as unknown as DataRow[];
    } else if (!lookupSchema) {
      return { rows: inputRows, summary: `Enrich — no lookup schema configured` };
    } else {
      return { rows: inputRows, summary: `Enrich from "${lookupSchema}" — 0 matched (requires DB connection)` };
    }

    const lookupMap = new Map<string, DataRow>();
    lookupRows.forEach((r) => { const k = String(val(r, lookupKey) ?? ''); if (k) lookupMap.set(k, r); });
    let enriched = 0;
    const rows = inputRows.map((row) => {
      const k = String(val(row, localKey) ?? '');
      const match = lookupMap.get(k);
      if (match) {
        enriched++;
        const extra: DataRow = {};
        if (fieldsToAdd.length) { fieldsToAdd.forEach((f) => { extra[f] = val(match, f); }); }
        else { Object.assign(extra, match); }
        return { ...row, ...extra };
      }
      return row;
    });
    return { rows, summary: `Enriched ${enriched}/${inputRows.length} rows from ${lookupSchema || 'lookup'}` };
  },

  transform_lookup: async ({ config, inputRows, ctx }) => {
    const localKey = str(config, 'local_key');
    const lookupKeyField = str(config, 'lookup_key');
    const returnField = str(config, 'return_field') || 'value';
    const defaultValue = str(config, 'default_value') || '';
    const lookupTable = str(config, 'lookup_table');

    const lookupMap = new Map<string, string>();
    if (ctx && lookupTable) {
      const { data: schemaDef } = await ctx.supabase
        .from('schema_definitions').select('table_name').eq('tenant_id', ctx.tenantId).eq('name', lookupTable).maybeSingle();
      const table = schemaDef?.table_name || lookupTable;
      const cols = [lookupKeyField || 'id', returnField].join(',');
      const { data } = await ctx.supabase.from(table).select(cols).eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(5000);
      ((data ?? []) as unknown as DataRow[]).forEach((r) => {
        const k = String(val(r, lookupKeyField || 'id') ?? '');
        const v = String(val(r, returnField) ?? '');
        if (k) lookupMap.set(k, v);
      });
    }

    let matched = 0;
    const rows = inputRows.map((row) => {
      const k = String(val(row, localKey) ?? '');
      const found = lookupMap.get(k);
      if (found !== undefined) matched++;
      return { ...row, [returnField]: found ?? defaultValue };
    });
    return { rows, summary: `Lookup "${returnField}" from ${lookupTable || 'table'}: ${matched}/${rows.length} matched` };
  },

  transform_split: ({ config, inputRows }) => {
    const field = str(config, 'field');
    const operator = str(config, 'operator') || 'equals';
    const value = str(config, 'value');
    if (!field) return { rows: inputRows, summary: 'No field — pass-through' };
    const match: DataRow[] = [], other: DataRow[] = [];
    inputRows.forEach((row) => {
      if (evalOp(val(row, field), operator, value)) match.push(row);
      else other.push(row);
    });
    return { rows: match, branches: { match, other }, summary: `Split: ${match.length} match / ${other.length} other` };
  },

  merge_streams: ({ config, inputRows, allInputs }) => {
    const mode = str(config, 'mode') || 'append';
    const dedupeKeys = str(config, 'dedupe_keys').split(',').map((k: string) => k.trim()).filter(Boolean);

    // Collect rows from all input streams
    let combined: DataRow[] = [];
    const streamSizes: number[] = [];
    if (allInputs && Object.keys(allInputs).length > 0) {
      for (const [, rows] of Object.entries(allInputs)) {
        streamSizes.push(rows.length);
        combined = combined.concat(rows);
      }
    } else {
      combined = inputRows;
      streamSizes.push(inputRows.length);
    }

    let rows = combined;
    if (mode === 'union' || dedupeKeys.length) {
      const keys = dedupeKeys.length ? dedupeKeys : Object.keys(combined[0] ?? {});
      const seen = new Set<string>();
      rows = combined.filter((row) => {
        const k = keys.map((f) => String(val(row, f) ?? '')).join('|');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    const removed = combined.length - rows.length;
    const streamsLabel = streamSizes.length > 1 ? `${streamSizes.length} streams (${streamSizes.join('+')})` : `${combined.length} rows`;
    return { rows, summary: `Merged ${streamsLabel} (${mode}): ${combined.length} → ${rows.length} rows${removed ? `, ${removed} dupes removed` : ''}` };
  },

  // ─── SET OPERATIONS (multi-input) ─────────────────────────────
  set_union: ({ config, inputRows, allInputs }) => {
    const keyFields = str(config, 'key_fields').split(',').map((k) => k.trim()).filter(Boolean);
    let combined: DataRow[] = [];
    const streamSizes: number[] = [];
    if (allInputs && Object.keys(allInputs).length > 0) {
      for (const [, rows] of Object.entries(allInputs)) {
        streamSizes.push(rows.length);
        combined = combined.concat(rows);
      }
    } else {
      combined = inputRows;
      streamSizes.push(inputRows.length);
    }
    if (combined.length === 0) return { rows: [], summary: `Union — no input data` };
    const keys = keyFields.length > 0 ? keyFields : Object.keys(combined[0] ?? {});
    const seen = new Set<string>();
    const rows = combined.filter((row) => {
      const k = keys.map((f) => String(val(row, f) ?? '')).join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const dupes = combined.length - rows.length;
    return { rows, summary: `Union of ${streamSizes.length} streams (${streamSizes.join('+')}): ${combined.length} total → ${rows.length} unique, ${dupes} duplicates removed` };
  },

  set_intersection: ({ config, allInputs }) => {
    const keyFields = str(config, 'key_fields').split(',').map((k) => k.trim()).filter(Boolean);
    const streams: DataRow[][] = [];
    if (allInputs && Object.keys(allInputs).length >= 2) {
      for (const [, rows] of Object.entries(allInputs)) streams.push(rows);
    } else {
      return { rows: [], summary: `Intersection — requires at least 2 input streams (connect 2+ nodes)` };
    }
    if (streams.length < 2) return { rows: [], summary: `Intersection — requires at least 2 input streams` };

    const firstStream = streams[0];
    const keys = keyFields.length > 0 ? keyFields : Object.keys(firstStream[0] ?? {});
    const rowKey = (row: DataRow) => keys.map((f) => String(val(row, f) ?? '')).join('|');

    // Build key sets for all streams except the first
    const otherKeySets = streams.slice(1).map((stream) => {
      const set = new Set<string>();
      stream.forEach((r) => set.add(rowKey(r)));
      return set;
    });

    // Keep rows from first stream that exist in ALL other streams
    const rows = firstStream.filter((row) => {
      const k = rowKey(row);
      return otherKeySets.every((set) => set.has(k));
    });

    const sizesStr = streams.map((s) => s.length).join(' ∩ ');
    return { rows, summary: `Intersection (${sizesStr}): ${rows.length} rows present in all ${streams.length} streams` };
  },

  set_exclusion: ({ config, inputRows, allInputs }) => {
    const keyFields = str(config, 'key_fields').split(',').map((k) => k.trim()).filter(Boolean);
    let primaryStream: DataRow[] = [];
    let excludeStreams: DataRow[][] = [];

    if (allInputs && Object.keys(allInputs).length >= 2) {
      const inputKeys = Object.keys(allInputs);
      primaryStream = allInputs[inputKeys[0]] ?? [];
      excludeStreams = inputKeys.slice(1).map((k) => allInputs[k] ?? []);
    } else {
      return { rows: inputRows, summary: `Exclusion — requires at least 2 input streams (first = keep, rest = exclude)` };
    }

    if (primaryStream.length === 0) return { rows: [], summary: `Exclusion — primary stream is empty` };

    const keys = keyFields.length > 0 ? keyFields : Object.keys(primaryStream[0] ?? {});
    const rowKey = (row: DataRow) => keys.map((f) => String(val(row, f) ?? '')).join('|');

    // Build exclude set from all exclude streams
    const excludeSet = new Set<string>();
    excludeStreams.forEach((stream) => {
      stream.forEach((r) => excludeSet.add(rowKey(r)));
    });

    const rows = primaryStream.filter((row) => !excludeSet.has(rowKey(row)));
    const excluded = primaryStream.length - rows.length;
    return { rows, summary: `Exclusion: ${primaryStream.length} primary − ${excludeSet.size} exclude keys → ${rows.length} rows (${excluded} excluded)` };
  },

  transform_expression: ({ config, inputRows }) => {
    const field = str(config, 'field');
    const expression = str(config, 'expression');
    const outputField = str(config, 'output_field') || field;
    if (!field || !expression) return { rows: inputRows, summary: 'No expression — pass-through' };
    const exprLower = expression.toLowerCase();
    const rows = inputRows.map((row) => {
      const v = val(row, field);
      const s = v != null ? String(v) : '';
      let result: unknown = s;
      if (exprLower.startsWith('lower(')) result = s.toLowerCase();
      else if (exprLower.startsWith('upper(')) result = s.toUpperCase();
      else if (exprLower.startsWith('trim(')) result = s.trim();
      else if (exprLower.startsWith('year(')) { try { result = new Date(s).getFullYear(); } catch { result = null; } }
      else if (exprLower.startsWith('length(')) result = s.length;
      else if (exprLower.startsWith('left(')) { const n = parseInt(expression.match(/,\s*(\d+)/)?.[1] || '0'); result = s.substring(0, n); }
      else if (exprLower.startsWith('right(')) { const n = parseInt(expression.match(/,\s*(\d+)/)?.[1] || '0'); result = s.substring(s.length - n); }
      else result = evalExpression(expression, row);
      return { ...row, [outputField]: result };
    });
    return { rows, summary: `Expression "${expression}" → ${rows.length} rows` };
  },

  // ─── DECISIONING ─────────────────────────────────────────────────
  decision_condition: ({ config, inputRows }) => {
    const field = str(config, 'field');
    const operator = str(config, 'operator') || 'equals';
    const value = str(config, 'value');
    const evalMode = str(config, 'evaluation_mode') || 'workflow';
    if (!field) return { rows: inputRows, branches: { true: inputRows, false: [] }, summary: 'No condition — all pass' };

    if (evalMode === 'workflow') {
      const firstRow = inputRows[0] ?? {};
      const result = evalOp(val(firstRow, field), operator, value);
      return {
        rows: result ? inputRows : [],
        branches: { true: result ? inputRows : [], false: result ? [] : inputRows },
        summary: `IF ${field} ${operator} ${value}: ${result ? 'TRUE' : 'FALSE'} (workflow mode, ${inputRows.length} rows)`,
      };
    }
    const trueRows: DataRow[] = [], falseRows: DataRow[] = [];
    inputRows.forEach((row) => {
      if (evalOp(val(row, field), operator, value)) trueRows.push(row);
      else falseRows.push(row);
    });
    return { rows: trueRows, branches: { true: trueRows, false: falseRows }, summary: `IF ${field} ${operator} ${value}: ${trueRows.length}T / ${falseRows.length}F (record mode)` };
  },

  branch_if: ({ config, inputRows }) => {
    return executors.decision_condition({ config, inputRows, nodeLabel: '' });
  },

  decision_audience: async ({ config, inputRows, ctx }) => {
    const audienceId = str(config, 'audience_id');
    const checkType = str(config, 'check_type') || 'is_member';
    const pass: DataRow[] = [], fail: DataRow[] = [];

    let memberSet: Set<string> | null = null;
    if (ctx && audienceId) {
      const { data: members } = await ctx.supabase
        .from('audience_members').select('customer_id').eq('tenant_id', ctx.tenantId).eq('audience_id', audienceId).limit(50000);
      if (members) memberSet = new Set(members.map((m: DataRow) => String(m.customer_id)));
    }

    if (!memberSet && !audienceId) {
      return { rows: inputRows, branches: { true: inputRows, false: [] }, summary: `Audience split — no audience ID configured, all rows pass` };
    }

    inputRows.forEach((row) => {
      let isMember: boolean;
      if (memberSet) {
        const cid = String(val(row, 'customer_id') ?? val(row, 'id') ?? val(row, 'email') ?? '');
        isMember = memberSet.has(cid);
      } else {
        isMember = false;
      }
      if ((checkType === 'is_member' && isMember) || (checkType === 'is_not_member' && !isMember)) pass.push(row);
      else fail.push(row);
    });
    return { rows: pass, branches: { true: pass, false: fail }, summary: `Audience "${audienceId}": ${pass.length} ${checkType} / ${fail.length} other` };
  },

  decision_ab_test: ({ config, inputRows }) => {
    const ratio = num(config, 'split_ratio', 50) / 100;
    const a: DataRow[] = [], b: DataRow[] = [];
    inputRows.forEach((row) => {
      if (rng.next() < ratio) a.push({ ...row, _variant: 'A' });
      else b.push({ ...row, _variant: 'B' });
    });
    return { rows: [...a, ...b], branches: { a, b }, summary: `A/B: ${a.length}A / ${b.length}B (${Math.round(ratio * 100)}/${Math.round((1 - ratio) * 100)})` };
  },

  decision_eligibility: ({ config, inputRows }) => {
    const eligible: DataRow[] = [], ineligible: DataRow[] = [];
    const rulesText = str(config, 'rules');
    const rules = rulesText ? rulesText.split('\n').filter(Boolean).map((line: string) => {
      const m = line.trim().match(/^(\w[\w.]*)\s+(in|not_in|equals|not_equals|gt|lt|gte|lte|contains|is_empty|is_not_empty|>=|<=|>|<|==|!=)\s*(.*)/i);
      if (!m) return null;
      return { field: m[1], operator: m[2], value: m[3].replace(/^\[|\]$/g, '').trim() };
    }).filter(Boolean) as { field: string; operator: string; value: string }[] : [];

    inputRows.forEach((row) => {
      let pass = true;
      for (const rule of rules) {
        if (!evalOp(val(row, rule.field), rule.operator, rule.value)) {
          pass = false;
          break;
        }
      }
      if (!rules.length) pass = true;
      if (pass) eligible.push({ ...row, _eligible: true });
      else ineligible.push({ ...row, _eligible: false });
    });
    return { rows: eligible, branches: { eligible, ineligible }, summary: `Eligibility (${rules.length} rules): ${eligible.length} pass / ${ineligible.length} fail` };
  },

  decision_freq_cap: ({ config, inputRows }) => {
    const maxDay = num(config, 'max_per_day', 3);
    const maxWeek = num(config, 'max_per_week', 10);
    const maxMonth = num(config, 'max_per_month', 30);
    const channel = str(config, 'channel') || 'all';
    const pass: DataRow[] = [], capped: DataRow[] = [];
    inputRows.forEach((row) => {
      const campaignCount = Number(val(row, 'campaign_count') ?? 0);
      const dayCount = Math.min(campaignCount, Math.ceil(campaignCount / 30));
      const weekCount = Math.min(campaignCount, Math.ceil(campaignCount / 4));
      if (dayCount >= maxDay) {
        capped.push({ ...row, _capped_reason: `${dayCount}/${maxDay} daily`, _cap_channel: channel });
      } else if (weekCount >= maxWeek) {
        capped.push({ ...row, _capped_reason: `${weekCount}/${maxWeek} weekly`, _cap_channel: channel });
      } else if (campaignCount >= maxMonth) {
        capped.push({ ...row, _capped_reason: `${campaignCount}/${maxMonth} monthly`, _cap_channel: channel });
      } else {
        pass.push(row);
      }
    });
    return { rows: pass, branches: { pass, capped }, summary: `Freq cap (${channel}): ${pass.length} pass / ${capped.length} capped (${maxDay}/d, ${maxWeek}/w, ${maxMonth}/m)` };
  },

  decision_suppression: async ({ config, inputRows, ctx }) => {
    const listId = str(config, 'list_id');
    const matchField = str(config, 'match_field') || 'email';
    const pass: DataRow[] = [], suppressed: DataRow[] = [];

    let suppressionSet: Set<string> | null = null;
    if (ctx && listId) {
      const { data: entries } = await ctx.supabase
        .from('suppression_lists').select('value').eq('tenant_id', ctx.tenantId).eq('list_id', listId).limit(50000);
      if (entries) suppressionSet = new Set(entries.map((e: DataRow) => String(e.value).toLowerCase()));
    }

    inputRows.forEach((row) => {
      const fieldVal = String(val(row, matchField) ?? '').toLowerCase();
      const isSuppressed = suppressionSet ? suppressionSet.has(fieldVal) : false;
      if (isSuppressed) suppressed.push({ ...row, _suppression_reason: `matched on ${matchField}` });
      else pass.push(row);
    });
    return { rows: pass, branches: { pass, suppressed }, summary: `Suppression "${listId || 'list'}": ${suppressed.length} suppressed, ${pass.length} pass` };
  },

  decision_engine: ({ config, inputRows }) => {
    const strategy = str(config, 'strategy') || 'highest_score';
    const criteriaText = str(config, 'criteria');
    const fallback = str(config, 'fallback') || 'skip';
    const criteria = criteriaText ? criteriaText.split('\n').filter(Boolean).map((line: string) => {
      const parts = line.split(':').map((s: string) => s.trim());
      return { action: parts[0] || 'default', scoreExpr: parts[1] || '' };
    }) : [];

    const rows = inputRows.map((row) => {
      let bestAction = fallback === 'skip' ? 'skip' : 'default';
      let bestScore = -Infinity;
      if (criteria.length) {
        for (const c of criteria) {
          const score = c.scoreExpr ? Number(evalExpression(c.scoreExpr, row) ?? 0) : rng.next() * 100;
          if (strategy === 'highest_score' && score > bestScore) { bestScore = score; bestAction = c.action; }
          else if (strategy === 'weighted_random') { bestScore = rng.next() * (score || 50); if (bestScore > (Number(row._decision_score) || 0)) bestAction = c.action; }
          else if (strategy === 'priority') { bestAction = c.action; break; }
        }
        if (strategy === 'round_robin') {
          const idx = (Number(val(row, 'id') ?? 0)) % criteria.length;
          bestAction = criteria[idx].action;
          bestScore = 100;
        }
      } else {
        bestAction = 'skip';
        bestScore = 0;
      }
      return { ...row, _decision: bestAction, _decision_score: Math.round(bestScore * 100) / 100, _decision_strategy: strategy };
    });
    return { rows, summary: `${strategy} (${criteria.length} criteria): decided for ${rows.length} contacts` };
  },

  decision_score: ({ config, inputRows }) => {
    const outputField = str(config, 'output_field') || 'score';
    const model = str(config, 'model') || 'engagement';
    const weightsText = str(config, 'field_weights');
    const weights = weightsText ? weightsText.split('\n').filter(Boolean).map((line: string) => {
      const [field, w] = line.split(':').map((s: string) => s.trim());
      return { field: field || '', weight: parseFloat(w) || 0 };
    }).filter((w) => w.field && w.weight) : [];

    const rows = inputRows.map((row) => {
      let score: number;
      if (weights.length) {
        score = weights.reduce((sum, w) => {
          const v = Number(val(row, w.field) ?? 0);
          const normalized = Math.min(Math.max(v, 0), 100);
          return sum + normalized * w.weight;
        }, 0);
        score = Math.round(Math.min(Math.max(score, 0), 100) * 100) / 100;
      } else {
        const engagement = Number(val(row, 'engagement_score') ?? rng.next() * 100);
        const ltv = Number(val(row, 'lifetime_value') ?? 0);
        const recency = Number(val(row, 'campaign_count') ?? 0);
        if (model === 'engagement') score = Math.round(engagement * 100) / 100;
        else if (model === 'propensity') score = Math.round((engagement * 0.4 + Math.min(ltv / 50, 100) * 0.4 + Math.min(recency * 2, 100) * 0.2) * 100) / 100;
        else if (model === 'churn') score = Math.round((100 - engagement) * 100) / 100;
        else if (model === 'lead') score = Math.round((engagement * 0.5 + Math.min(recency * 5, 100) * 0.5) * 100) / 100;
        else score = Math.round(engagement * 100) / 100;
      }
      return { ...row, [outputField]: score, [`${outputField}_model`]: model };
    });
    return { rows, summary: `${model} score (${weights.length ? weights.length + ' weights' : 'default'}): ${rows.length} scored` };
  },

  // ─── AI & PERSONALIZATION ────────────────────────────────────────
  ai_generate: ({ config, inputRows }) => {
    const outputField = str(config, 'output_field') || 'generated_text';
    const provider = str(config, 'provider') || 'anthropic';
    const model = str(config, 'model') || 'claude-sonnet-4';
    const promptTemplate = str(config, 'prompt');
    const systemPrompt = str(config, 'system_prompt');
    const maxTokens = num(config, 'max_tokens', 1024);
    const responseFormat = str(config, 'response_format') || 'text';
    const jsonSchema = str(config, 'json_schema');
    const trackCost = config.track_cost !== false;
    const fallbackModel = str(config, 'fallback_model');
    const fallbackProvider = str(config, 'fallback_provider');
    const fallbackTemplates = [
      'Exclusive offer just for you, {{first_name}}!',
      "We miss you, {{first_name}}! Here's 20% off.",
      '{{first_name}}, your {{loyalty_tier}} rewards are waiting!',
      "Don't miss out — new arrivals in {{last_purchase_category}}!",
      'Hi {{first_name}}, we picked these just for you.',
    ];
    const rows = inputRows.map((row) => {
      let text: string;
      if (promptTemplate) {
        text = resolveTemplate(promptTemplate, row);
      } else {
        const t = randomFrom(fallbackTemplates);
        text = resolveTemplate(t, row);
      }
      const promptTokens = Math.ceil((systemPrompt.length + text.length) / 4);
      const completionTokens = Math.min(randomInt(20, 200), maxTokens);
      const totalTokens = promptTokens + completionTokens;
      const costPer1k = provider === 'anthropic' ? 0.003 : 0.002;
      const estimatedCost = Math.round((totalTokens / 1000) * costPer1k * 100000) / 100000;

      let responseValue: unknown = text;
      if (responseFormat === 'json' || responseFormat === 'json_schema') {
        try {
          if (jsonSchema) {
            const schema = JSON.parse(jsonSchema);
            const obj: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(schema.properties ?? {})) {
              const t = (v as { type?: string }).type;
              if (t === 'number') obj[k] = rng.next() * 100;
              else if (t === 'boolean') obj[k] = rng.next() > 0.5;
              else obj[k] = text.substring(0, 50);
            }
            responseValue = obj;
          } else {
            responseValue = { result: text };
          }
        } catch { responseValue = { result: text }; }
      }

      const result: DataRow = {
        ...row,
        [outputField]: responseValue,
        _simulated: true,
        _ai_provider: provider,
        _ai_model: model,
        _ai_response_format: responseFormat,
        _ai_finish_reason: 'stop',
      };
      if (trackCost) {
        result._ai_prompt_tokens = promptTokens;
        result._ai_completion_tokens = completionTokens;
        result._ai_total_tokens = totalTokens;
        result._ai_estimated_cost = estimatedCost;
      }
      if (fallbackModel) result._ai_fallback_model = fallbackModel;
      if (fallbackProvider) result._ai_fallback_provider = fallbackProvider;
      return result;
    });
    const totalTokens = rows.reduce((s, r) => s + (Number(r._ai_total_tokens) || 0), 0);
    const totalCost = rows.reduce((s, r) => s + (Number(r._ai_estimated_cost) || 0), 0);
    const costStr = trackCost ? ` ($${totalCost.toFixed(4)})` : '';
    return { rows, summary: `${provider}/${model}: ${rows.length} rows, ${totalTokens} tokens${costStr} → ${responseFormat}` };
  },

  ai_classify: ({ config, inputRows }) => {
    const outputField = str(config, 'output_field') || 'category';
    const inputField = str(config, 'input_field');
    const categories = str(config, 'categories').split('\n').filter(Boolean);
    const cats = categories.length ? categories : ['positive', 'negative', 'neutral'];
    const threshold = num(config, 'confidence_threshold', 0.8);
    const rows = inputRows.map((row) => {
      const text = inputField ? String(val(row, inputField) ?? '') : '';
      let category: string;
      let confidence: number;
      if (text && cats.length > 0) {
        const textLower = text.toLowerCase();
        const scores = cats.map((c) => {
          let score = 0.3 + rng.next() * 0.3;
          if (textLower.includes(c.toLowerCase())) score += 0.3;
          return score;
        });
        const maxIdx = scores.indexOf(Math.max(...scores));
        category = cats[maxIdx];
        confidence = Math.round(scores[maxIdx] * 100) / 100;
      } else {
        category = randomFrom(cats);
        confidence = Math.round((0.6 + rng.next() * 0.4) * 100) / 100;
      }
      return {
        ...row,
        [outputField]: category,
        [`${outputField}_confidence`]: confidence,
        [`${outputField}_above_threshold`]: confidence >= threshold,
      };
    });
    return { rows, summary: `Classified into ${cats.length} categories (threshold ${threshold}): ${rows.length} rows` };
  },

  ai_extract: ({ config, inputRows }) => {
    const inputField = str(config, 'input_field');
    const outputFormat = str(config, 'output_format') || 'json';
    const schemaText = str(config, 'schema');
    let schemaFields: { name: string; type: string }[] = [];
    if (schemaText) {
      try {
        const parsed = JSON.parse(schemaText);
        schemaFields = Object.entries(parsed).map(([name, type]) => ({ name, type: String(type) }));
      } catch { /* use default extraction */ }
    }
    const rows = inputRows.map((row) => {
      const text = inputField ? String(val(row, inputField) ?? '') : '';
      const extracted: DataRow = {};
      if (schemaFields.length) {
        for (const f of schemaFields) {
          const existingVal = val(row, f.name);
          if (existingVal !== undefined) extracted[f.name] = existingVal;
          else if (f.type === 'number') extracted[f.name] = Math.round(rng.next() * 500 * 100) / 100;
          else if (f.type === 'date') extracted[f.name] = randomDate(30);
          else if (f.type === 'boolean') extracted[f.name] = rng.next() > 0.5;
          else extracted[f.name] = text ? text.substring(0, 50) : `${f.name}_value`;
        }
      } else {
        extracted.name = val(row, 'first_name') || 'Unknown';
        extracted.date = randomDate(30);
        extracted.amount = Math.round(rng.next() * 500 * 100) / 100;
      }
      if (outputFormat === 'flat') return { ...row, ...extracted, _ai_extracted: true };
      return { ...row, _extracted: extracted, _ai_extracted: true };
    });
    return { rows, summary: `Extracted ${schemaFields.length || 3} fields (${outputFormat}) → ${rows.length} rows` };
  },

  ai_translate: ({ config, inputRows }) => {
    const sourceLang = str(config, 'source_lang') || 'auto';
    const targetLang = str(config, 'target_lang') || 'en';
    const inputField = str(config, 'input_field');
    const outputField = str(config, 'output_field') || 'translated';
    const model = str(config, 'model') || 'claude-sonnet-4';
    const langNames: Record<string, string> = { en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German', ja: 'Japanese', zh: 'Chinese' };
    const rows = inputRows.map((row) => {
      const original = inputField ? String(val(row, inputField) ?? '') : '';
      const translated = original ? `[${langNames[targetLang] || targetLang}] ${original}` : '';
      return {
        ...row,
        [outputField]: translated,
        _translation_source: sourceLang,
        _translation_target: targetLang,
        _translation_model: model,
        _translation_chars: original.length,
      };
    });
    const totalChars = rows.reduce((s, r) => s + (r._translation_chars as number), 0);
    return { rows, summary: `Translated ${sourceLang}→${targetLang} (${model}): ${rows.length} rows, ${totalChars} chars` };
  },

  ai_personalize: ({ config, inputRows }) => {
    const outputField = str(config, 'output_field') || 'personalized_content';
    const template = str(config, 'template');
    const contextFields = str(config, 'context_fields').split(',').map((f: string) => f.trim()).filter(Boolean);
    const model = str(config, 'model') || 'claude-sonnet-4';
    const fallbackTemplate = 'Hi {{first_name}}, as a valued {{loyalty_tier}} member, here\'s something special for you!';

    const rows = inputRows.map((row) => {
      const tpl = template || fallbackTemplate;
      const text = resolveTemplate(tpl, row);
      const context: DataRow = {};
      if (contextFields.length) {
        contextFields.forEach((f) => { context[f] = val(row, f); });
      }
      return {
        ...row,
        [outputField]: text,
        _ai_model: model,
        _ai_context_fields: contextFields.length || Object.keys(row).length,
      };
    });
    return { rows, summary: `Personalized (${model}): ${rows.length} contacts, ${contextFields.length || 'all'} context fields` };
  },

  ai_recommend: async ({ config, inputRows, ctx }) => {
    const outputField = str(config, 'output_field') || 'recommendations';
    const topK = num(config, 'top_k', 5);
    const itemCatalog = str(config, 'item_catalog');
    const model = str(config, 'model') || 'collaborative';
    const userField = str(config, 'user_field') || 'customer_id';

    let products: DataRow[];
    if (ctx && itemCatalog) {
      const { data: schemaDef } = await ctx.supabase
        .from('schema_definitions').select('table_name').eq('tenant_id', ctx.tenantId).eq('name', itemCatalog).maybeSingle();
      const table = schemaDef?.table_name || itemCatalog;
      const { data } = await ctx.supabase.from(table).select('*').eq('tenant_id', ctx.tenantId).eq('environment', ctx.environment).limit(500);
      products = (data ?? []) as unknown as DataRow[];
    } else if (!itemCatalog) {
      return { rows: inputRows.map((r) => ({ ...r, [outputField]: [], _rec_model: model })), summary: `Recommendation — no item catalog configured` };
    } else {
      return { rows: inputRows.map((r) => ({ ...r, [outputField]: [], _rec_model: model })), summary: `Recommendation from "${itemCatalog}" — requires DB connection` };
    }
    if (products.length === 0) {
      return { rows: inputRows.map((r) => ({ ...r, [outputField]: [], _rec_model: model })), summary: `Recommendation — item catalog "${itemCatalog}" is empty` };
    }

    const rows = inputRows.map((row) => {
      const userId = String(val(row, userField) ?? '');
      const recs = Array.from({ length: Math.min(topK, products.length) }, () => {
        const p = randomFrom(products);
        const relevance = model === 'popularity' ? Number(val(p, 'rating') ?? rng.next()) : rng.next();
        return { product_id: val(p, 'product_id') ?? val(p, 'id'), name: val(p, 'name'), score: Math.round(relevance * 100) / 100 };
      }).sort((a, b) => b.score - a.score);
      return { ...row, [outputField]: recs, _rec_model: model, _rec_user: userId };
    });
    return { rows, summary: `Top-${topK} ${model} recommendations for ${rows.length} users (${products.length} items)` };
  },

  // ─── ACTIONS ─────────────────────────────────────────────────────
  action_email: ({ config, inputRows }) => {
    const provider = str(config, 'provider') || 'resend';
    const subjectTemplate = str(config, 'subject') || 'No subject';
    const preheader = str(config, 'preheader');
    const templateId = str(config, 'template_id');
    const rawToConfig = str(config, 'to').trim();
    const toField = rawToConfig ? rawToConfig.replace(/\{\{|\}\}/g, '').trim() : 'email';
    const from = str(config, 'from');
    const cc = str(config, 'cc');
    const bcc = str(config, 'bcc');
    const commType = str(config, 'communication_type') || 'promotional';
    const fallbackPolicy = str(config, 'fallback_policy') || 'use_default';
    const suppressDupes = config.suppress_duplicates !== false;
    const trackOpens = bool(config, 'track_opens');
    const trackClicks = bool(config, 'track_clicks');
    const utmSource = str(config, 'utm_source');
    const utmMedium = str(config, 'utm_medium');
    const utmCampaign = str(config, 'utm_campaign');

    const sent: DataRow[] = [], failed: DataRow[] = [], skipped: DataRow[] = [];
    const seenEmails = new Set<string>();
    inputRows.forEach((row) => {
      let email = String(
        (toField && val(row, toField)) ??
        val(row, 'email') ??
        val(row, 'customer_email') ??
        val(row, 'customer.email') ??
        val(row, 'recipient') ??
        val(row, 'email_address') ??
        val(row, 'to') ??
        ''
      );
      if (!email && rawToConfig.includes('@')) email = rawToConfig;

      if (suppressDupes && email && seenEmails.has(email.toLowerCase())) {
        skipped.push({ ...row, _email_status: 'skipped', _email_skip_reason: 'DUPLICATE' });
        return;
      }
      if (email) seenEmails.add(email.toLowerCase());

      const subject = resolveTemplate(subjectTemplate, row);
      const resolvedPreheader = preheader ? resolveTemplate(preheader, row) : '';
      if (email && email.includes('@')) {
        const result: DataRow = {
          ...row, _simulated: true, _email_status: 'sent', _email_subject: subject, _email_to: email,
          _email_from: from || 'noreply@marbee.io', _email_provider: provider, _email_template: templateId,
          _email_communication_type: commType, _email_fallback_policy: fallbackPolicy,
          _track_opens: trackOpens, _track_clicks: trackClicks, _sent_at: new Date().toISOString(),
        };
        if (resolvedPreheader) result._email_preheader = resolvedPreheader;
        if (cc) result._email_cc = cc;
        if (bcc) result._email_bcc = bcc;
        if (utmSource || utmCampaign) result._email_utm = { source: utmSource, medium: utmMedium, campaign: utmCampaign ? resolveTemplate(utmCampaign, row) : '' };
        sent.push(result);
      } else {
        failed.push({ ...row, _email_status: 'failed', _email_error: email ? 'Invalid email format' : `No recipient email found in field "${toField || 'email'}"` });
      }
    });
    const summary = `Email (${provider}, ${commType}): ${sent.length} sent, ${failed.length} failed, ${skipped.length} skipped${templateId ? ` [tpl: ${templateId}]` : ''}`;
    return { rows: sent, errorRows: [...failed, ...skipped], summary };
  },

  action_sms: ({ config, inputRows }) => {
    const provider = str(config, 'provider') || 'twilio';
    const toField = str(config, 'to_field') || 'mobile';
    const messageTemplate = str(config, 'message') || 'SMS notification';
    const senderId = str(config, 'sender_id') || 'MARBEE';
    const sent: DataRow[] = [], failed: DataRow[] = [];
    inputRows.forEach((row) => {
      const phone = String(val(row, toField) ?? '');
      const message = resolveTemplate(messageTemplate, row);
      if (phone && phone.replace(/\D/g, '').length >= 10) {
        sent.push({ ...row, _simulated: true, _sms_status: 'sent', _sms_to: phone, _sms_message: message, _sms_sender: senderId, _sms_provider: provider, _sms_chars: message.length, _sms_segments: Math.ceil(message.length / 160), _sent_at: new Date().toISOString() });
      } else {
        failed.push({ ...row, _sms_status: 'failed', _sms_error: phone ? 'Invalid phone number' : `No phone in field "${toField}"` });
      }
    });
    return { rows: sent, errorRows: failed, summary: `SMS (${provider}): ${sent.length} sent, ${failed.length} failed [sender: ${senderId}]` };
  },

  action_whatsapp: ({ config, inputRows }) => {
    const provider = str(config, 'provider') || 'meta';
    const toField = str(config, 'to_field') || 'mobile';
    const templateName = str(config, 'template_id') || 'notification';
    const language = str(config, 'language') || 'en';
    const mediaUrl = str(config, 'media_url');
    const sent: DataRow[] = [], failed: DataRow[] = [];
    inputRows.forEach((row) => {
      const phone = String(val(row, toField) ?? '');
      if (phone && phone.replace(/\D/g, '').length >= 10) {
        sent.push({ ...row, _simulated: true, _wa_status: 'sent', _wa_template: templateName, _wa_to: phone, _wa_provider: provider, _wa_language: language, _wa_has_media: !!mediaUrl, _sent_at: new Date().toISOString() });
      } else {
        failed.push({ ...row, _wa_status: 'failed', _wa_error: phone ? 'Invalid phone number' : `No phone in field "${toField}"` });
      }
    });
    return { rows: sent, errorRows: failed, summary: `WhatsApp (${provider}) "${templateName}" [${language}]: ${sent.length} sent, ${failed.length} failed` };
  },

  action_push: ({ config, inputRows }) => {
    const provider = str(config, 'provider') || 'fcm';
    const tokenField = str(config, 'token_field') || 'push_token';
    const titleTemplate = str(config, 'title') || 'Notification';
    const bodyTemplate = str(config, 'body') || '';
    const icon = str(config, 'icon');
    const clickUrl = str(config, 'url');
    const sent: DataRow[] = [], skipped: DataRow[] = [];
    inputRows.forEach((row) => {
      const token = val(row, tokenField);
      const title = resolveTemplate(titleTemplate, row);
      const body = resolveTemplate(bodyTemplate, row);
      if (token) {
        sent.push({ ...row, _simulated: true, _push_status: 'sent', _push_title: title, _push_body: body, _push_provider: provider, _push_icon: icon || undefined, _push_url: clickUrl || undefined, _sent_at: new Date().toISOString() });
      } else {
        skipped.push({ ...row, _push_status: 'skipped', _push_error: `No token in "${tokenField}"` });
      }
    });
    return { rows: sent, errorRows: skipped, summary: `Push (${provider}) "${titleTemplate}": ${sent.length} sent, ${skipped.length} no token` };
  },

  action_webhook: ({ config, inputRows }) => {
    const url = str(config, 'url') || 'https://webhook.endpoint';
    const method = str(config, 'method') || 'POST';
    const payloadTemplate = str(config, 'payload_template') || '{{row}}';
    const retry = num(config, 'retry', 3);
    const rows = inputRows.map((row) => {
      const payload = payloadTemplate === '{{row}}' ? row : payloadTemplate.replace(/\{\{(\w[\w.]*)\}\}/g, (_, k) => JSON.stringify(val(row, k) ?? ''));
      return { ...row, _simulated: true, _webhook_status: 'delivered', _webhook_url: url, _webhook_method: method, _webhook_response: 200, _webhook_retry_config: retry, _webhook_payload_size: JSON.stringify(payload).length, _sent_at: new Date().toISOString() };
    });
    return { rows, summary: `Webhook ${method} → ${url}: ${rows.length} delivered (retry: ${retry})` };
  },

  action_http: ({ config, inputRows }) => {
    const url = str(config, 'url') || 'https://api.endpoint';
    const method = str(config, 'method') || 'POST';
    const timeout = num(config, 'timeout', 30);
    const retry = num(config, 'retry', 3);
    const authType = str(config, 'auth_type') || 'none';
    const authCredential = str(config, 'auth_credential');
    const bodyContentType = str(config, 'body_content_type') || 'json';
    const responseType = str(config, 'response_type') || 'json';
    const followRedirects = config.follow_redirects !== false;
    const successCodes = str(config, 'success_codes') || '200-299';
    const paginationType = str(config, 'pagination_type') || 'none';
    const paginationMaxPages = num(config, 'pagination_max_pages', 100);
    const rateLimit = num(config, 'rate_limit', 0);

    const isPaginated = paginationType !== 'none';
    const pagesSimulated = isPaginated ? Math.min(3, paginationMaxPages) : 1;

    const rows = inputRows.map((row) => {
      const resolvedUrl = url.includes('{{') ? resolveTemplate(url, row) : url;
      const result: DataRow = {
        ...row, _simulated: true, _api_status: 200, _api_method: method, _api_url: resolvedUrl,
        _api_timeout: timeout, _api_retry: retry, _api_auth_type: authType,
        _api_body_content_type: bodyContentType, _api_response_type: responseType,
        _api_follow_redirects: followRedirects, _api_success_codes: successCodes,
        _sent_at: new Date().toISOString(),
      };
      if (authCredential) result._api_credential = authCredential;
      if (isPaginated) {
        result._api_pagination = paginationType;
        result._api_pages_retrieved = pagesSimulated;
        result._api_total_records = pagesSimulated * num(config, 'pagination_limit', 100);
      }
      if (rateLimit > 0) result._api_rate_limit = rateLimit;
      return result;
    });
    const paginationInfo = isPaginated ? `, ${paginationType} pagination (${pagesSimulated} pages)` : '';
    return { rows, summary: `${method} ${url}: ${rows.length} calls (${authType}, ${responseType}, timeout: ${timeout}s${paginationInfo})` };
  },

  action_crm: ({ config, inputRows }) => {
    const connectorId = str(config, 'connector_id');
    const operation = str(config, 'operation') || 'upsert';
    const object = str(config, 'object') || 'Contact';
    const matchField = str(config, 'match_field') || 'email';
    const fieldMappingText = str(config, 'field_mapping');
    const mappings = fieldMappingText ? fieldMappingText.split('\n').filter(Boolean).map((line: string) => {
      const parts = line.split('→').map((s: string) => s.trim());
      return { from: parts[0] || '', to: parts[1] || parts[0] || '' };
    }).filter((m) => m.from) : [];

    const rows = inputRows.map((row) => {
      const mapped: DataRow = {};
      if (mappings.length) {
        mappings.forEach((m) => { mapped[m.to] = val(row, m.from); });
      }
      return { ...row, _simulated: true, _crm_status: 'synced', _crm_operation: operation, _crm_object: object, _crm_connector: connectorId, _crm_match: matchField, _crm_fields_mapped: mappings.length || Object.keys(row).length };
    });
    return { rows, summary: `CRM ${operation} ${object} (${connectorId || 'connector'}): ${rows.length} synced, ${mappings.length || 'all'} fields mapped` };
  },

  action_db_write: async ({ config, inputRows, ctx }) => {
    const schemaName = str(config, 'schema') || 'target_table';
    const mode = str(config, 'mode') || 'upsert';
    const matchKey = str(config, 'match_key') || 'email';
    const batchSize = num(config, 'batch_size', 500);

    if (ctx) {
      const { data: schemaDef } = await ctx.supabase
        .from('schema_definitions').select('table_name').eq('tenant_id', ctx.tenantId).eq('name', schemaName).maybeSingle();
      const table = schemaDef?.table_name || schemaName;

      let written = 0, errors = 0;
      const errorRows: DataRow[] = [];
      for (let i = 0; i < inputRows.length; i += batchSize) {
        const batch = inputRows.slice(i, i + batchSize).map((row) => ({
          ...row, tenant_id: ctx.tenantId, environment: ctx.environment,
        }));
        try {
          if (mode === 'insert') {
            const { error } = await ctx.supabase.from(table).insert(batch);
            if (error) { errors += batch.length; batch.forEach((r) => errorRows.push({ ...r, _write_error: error.message })); }
            else written += batch.length;
          } else if (mode === 'update') {
            for (const row of batch) {
              const key = String(val(row, matchKey) ?? '');
              if (!key) { errors++; errorRows.push({ ...row, _write_error: `No ${matchKey}` }); continue; }
              const { error } = await ctx.supabase.from(table).update(row).eq('tenant_id', ctx.tenantId).eq(matchKey, key);
              if (error) { errors++; errorRows.push({ ...row, _write_error: error.message }); }
              else written++;
            }
          } else {
            const { error } = await ctx.supabase.from(table).upsert(batch, { onConflict: `tenant_id,${matchKey}` });
            if (error) { errors += batch.length; batch.forEach((r) => errorRows.push({ ...r, _write_error: error.message })); }
            else written += batch.length;
          }
        } catch (err) {
          errors += batch.length;
          batch.forEach((r) => errorRows.push({ ...r, _write_error: err instanceof Error ? err.message : String(err) }));
        }
      }
      const rows = inputRows.map((row) => ({ ...row, _write_status: 'written', _write_mode: mode, _write_schema: schemaName }));
      return { rows, errorRows: errorRows.length ? errorRows : undefined, summary: `DB ${mode} → "${schemaName}": ${written} written, ${errors} errors` };
    }

    const rows = inputRows.map((row) => ({
      ...row, _write_status: 'written', _write_mode: mode, _write_schema: schemaName,
    }));
    return { rows, summary: `DB ${mode} → "${schemaName}": ${rows.length} rows (simulated)` };
  },

  action_audience: async ({ config, inputRows, ctx }) => {
    const operation = str(config, 'operation') || 'add';
    const matchFieldStr = str(config, 'match_field') || str(config, 'match_fields') || 'email';
    const matchFields = matchFieldStr.split(',').map((s) => s.trim()).filter(Boolean);
    const primaryMatchField = matchFields[0] || 'email';

    let audienceId = '';
    if (operation === 'create') {
      const pattern = str(config, 'audience_name') || str(config, 'audience_id') || 'Audience_{{date}}';
      audienceId = formatDynamicAudienceName(pattern, inputRows[0]);
    } else {
      const pattern = str(config, 'audience_id') || str(config, 'audience_name') || 'audience';
      audienceId = formatDynamicAudienceName(pattern, inputRows[0]);
    }

    if (ctx && audienceId) {
      const entries = inputRows.map((row) => {
        const custId = String(val(row, 'customer_id') ?? val(row, 'id') ?? val(row, primaryMatchField) ?? '');
        const matchVal = matchFields.map((f) => `${f}:${val(row, f) ?? ''}`).join(';');
        return {
          tenant_id: ctx.tenantId,
          audience_id: audienceId,
          customer_id: custId,
          match_value: matchVal,
        };
      }).filter((e) => e.customer_id);

      try {
        const audienceSlug = audienceId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

        if (operation === 'create' || operation === 'purge_refresh' || operation === 'add') {
          // Register / update audience record in audiences table so it shows in Audience module
          await ctx.supabase.from('audiences').upsert({
            tenant_id: ctx.tenantId,
            environment: ctx.environment || 'production',
            name: audienceId,
            slug: audienceSlug,
            description: `Workflow audience (${operation}) created on ${new Date().toLocaleString()}`,
            schema_slug: 'customer',
            creation_mode: 'diy',
            member_count: entries.length,
            status: 'active',
            filter_json: { type: 'group', join: 'and', children: [] },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,environment,slug' });
        }

        if (operation === 'create' || operation === 'purge_refresh') {
          // Purge existing members first if purge_refresh
          if (operation === 'purge_refresh') {
            await ctx.supabase.from('audience_members').delete().eq('tenant_id', ctx.tenantId).eq('audience_id', audienceId);
          }
          if (entries.length) {
            await ctx.supabase.from('audience_members').upsert(entries, { onConflict: 'tenant_id,audience_id,customer_id' });
          }
        } else if (operation === 'add') {
          if (entries.length) {
            await ctx.supabase.from('audience_members').upsert(entries, { onConflict: 'tenant_id,audience_id,customer_id' });
          }
        } else if (operation === 'remove') {
          for (const e of entries) {
            await ctx.supabase.from('audience_members').delete().eq('tenant_id', ctx.tenantId).eq('audience_id', audienceId).eq('customer_id', e.customer_id);
          }
        }
      } catch { /* best-effort fallback */ }
    }

    const rows = inputRows.map((row) => ({
      ...row,
      _audience_op: operation,
      _audience_id: audienceId,
      _audience_match: matchFields.join(','),
    }));

    const summaryLabels: Record<string, string> = {
      add: 'Added to (if not exist)',
      purge_refresh: 'Purged & Refreshed',
      remove: 'Removed from',
      create: 'Created new audience',
    };

    return {
      rows,
      summary: `${summaryLabels[operation] ?? operation} "${audienceId}": ${rows.length} contacts (keys: ${matchFields.join(', ')})`,
    };
  },

  action_export: ({ config, inputRows }) => {
    const format = str(config, 'format') || 'csv';
    const destination = str(config, 'destination') || 'storage';
    const filenamePattern = str(config, 'filename') || 'export_{date}';
    const compress = bool(config, 'compress');
    const filename = filenamePattern.replace(/\{date\}/g, new Date().toISOString().split('T')[0]).replace(/\{timestamp\}/g, String(Date.now()));
    const estimatedSize = inputRows.length * 200;
    const sizeLabel = estimatedSize > 1048576 ? `${(estimatedSize / 1048576).toFixed(1)}MB` : `${Math.round(estimatedSize / 1024)}KB`;
    return { rows: inputRows, summary: `Export ${format.toUpperCase()} → ${destination}/${filename}.${format}${compress ? '.gz' : ''} (~${sizeLabel}, ${inputRows.length} rows)` };
  },

  // Legacy destinations
  target: ({ config, inputRows }) => executors.action_db_write({ config, inputRows, nodeLabel: '' }),
  target_export: ({ config, inputRows }) => executors.action_export({ config, inputRows, nodeLabel: '' }),
  target_connector: ({ config, inputRows }) => {
    const connectorId = str(config, 'connector_id');
    const batchSize = num(config, 'batch_size', 100);
    const batches = Math.ceil(inputRows.length / batchSize);
    const rows = inputRows.map((r) => ({ ...r, _connector_status: 'synced', _connector_id: connectorId }));
    return { rows, summary: `Connector "${connectorId || 'out'}": ${rows.length} rows synced in ${batches} batch(es)` };
  },
  target_webhook: ({ config, inputRows }) => executors.action_webhook({ config, inputRows, nodeLabel: '' }),
  target_email: ({ config, inputRows }) => {
    const to = str(config, 'to') || 'ops@company.com';
    const subject = str(config, 'subject') || 'Data job report';
    const attachExport = bool(config, 'attach_export');
    return { rows: inputRows, summary: `Email report → ${to}: "${subject}" (${inputRows.length} rows${attachExport ? ', file attached' : ''})` };
  },

  // ─── CONTROL FLOW ────────────────────────────────────────────────
  flow_wait: async ({ config, inputRows }) => {
    const waitType = str(config, 'wait_type') || 'duration';
    let ms = 0;
    let label = '';
    if (waitType === 'datetime') {
      const dt = str(config, 'until_datetime');
      if (dt) {
        ms = new Date(dt).getTime() - Date.now();
        label = `until ${dt}`;
      }
    } else {
      ms = durationToMs(config);
      label = durationLabel(config);
    }
    if (ms > 0 && ms <= MAX_CLIENT_WAIT_MS) {
      await new Promise(r => setTimeout(r, ms));
      return { rows: inputRows, summary: `Waited ${label} → resumed with ${inputRows.length} rows` };
    }
    if (ms <= 0 && waitType === 'datetime') {
      return { rows: inputRows, summary: `Resume time already passed → ${inputRows.length} rows` };
    }
    return { rows: inputRows, summary: `Wait ${label} (server-side) → ${inputRows.length} rows passed through`, _simulated: true };
  },

  flow_loop: ({ config, inputRows }) => {
    const inputField = str(config, 'input_field') || 'items';
    let expanded: DataRow[] = [];
    inputRows.forEach((row) => {
      const items = val(row, inputField);
      if (Array.isArray(items)) {
        items.forEach((item, i) => expanded.push({ ...row, _loop_item: item, _loop_index: i }));
      } else {
        expanded.push({ ...row, _loop_item: row, _loop_index: 0 });
      }
    });
    const max = num(config, 'max_iterations', 10000);
    if (expanded.length > max) expanded = expanded.slice(0, max);
    return { rows: expanded, summary: `Loop over "${inputField}": ${inputRows.length} → ${expanded.length} iterations` };
  },

  flow_batch: ({ config, inputRows }) => {
    const batchSize = num(config, 'batch_size', 1000);
    const batches = Math.ceil(inputRows.length / batchSize);
    const rows = inputRows.map((r, i) => ({ ...r, _batch_number: Math.floor(i / batchSize) + 1, _batch_size: batchSize }));
    return { rows, summary: `Batched ${inputRows.length} rows into ${batches} batches of ${batchSize}` };
  },

  flow_parallel: ({ config, inputRows }) => {
    const branchCount = num(config, 'branches', 2);
    const branches: Record<string, DataRow[]> = {};
    for (let i = 0; i < branchCount; i++) {
      branches[`branch_${i + 1}`] = [...inputRows];
    }
    return { rows: inputRows, branches, summary: `Parallel: ${inputRows.length} rows → ${branchCount} branches` };
  },

  flow_merge: ({ config, inputRows, allInputs }) => {
    const strategy = str(config, 'strategy') || 'wait_all';
    let combined: DataRow[] = [];
    const streamSizes: number[] = [];
    if (allInputs && Object.keys(allInputs).length > 0) {
      for (const [, rows] of Object.entries(allInputs)) {
        streamSizes.push(rows.length);
        combined = combined.concat(rows);
      }
    } else {
      combined = inputRows;
      streamSizes.push(inputRows.length);
    }
    const streamsLabel = streamSizes.length > 1 ? `${streamSizes.length} branches (${streamSizes.join('+')})` : `${combined.length} rows`;
    return { rows: combined, summary: `Merge ${streamsLabel} (${strategy}): → ${combined.length} rows` };
  },

  flow_sub_workflow: ({ config, inputRows }) => {
    const wfId = str(config, 'workflow_id') || 'sub-workflow';
    return { rows: inputRows, summary: `Sub-workflow "${wfId}": ${inputRows.length} rows processed` };
  },

  flow_end: ({ config, inputRows }) => {
    return { rows: inputRows, summary: `End (${str(config, 'status') || 'success'}): ${inputRows.length} rows` };
  },
  end: ({ config, inputRows }) => executors.flow_end({ config, inputRows, nodeLabel: '' }),
  action_end: ({ config, inputRows }) => executors.flow_end({ config, inputRows, nodeLabel: '' }),
  control_end: ({ config, inputRows }) => executors.flow_end({ config, inputRows, nodeLabel: '' }),
  read_schema: ({ config, inputRows }) => executors.source({ config, inputRows, nodeLabel: '' }),

  // ─── MONITORING ──────────────────────────────────────────────────
  monitor_log: ({ config, inputRows }) => {
    const level = str(config, 'level') || 'info';
    const messageTemplate = str(config, 'message') || `Processing ${inputRows.length} rows`;
    const includeData = bool(config, 'include_data');
    const maskPii = bool(config, 'mask_pii');
    const message = resolveTemplate(messageTemplate, inputRows[0] ?? {}, { count: inputRows.length });
    const rows = inputRows.map((row) => {
      const logEntry: DataRow = { ...row, _log_level: level, _log_message: message };
      if (includeData) logEntry._log_data = maskPii ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, (k === 'email' || k === 'phone' || k === 'mobile' || k === 'ssn') ? '***' : v])) : row;
      return logEntry;
    });
    return { rows, summary: `[${level.toUpperCase()}] ${message} (${inputRows.length} rows)` };
  },

  monitor_track: async ({ config, inputRows, ctx }) => {
    const eventName = str(config, 'event_name') || 'workflow_event';
    const propertiesText = str(config, 'properties');
    const customerIdField = str(config, 'customer_id_field') || 'customer_id';
    let parsedProps: Record<string, unknown> = {};
    if (propertiesText) {
      try { parsedProps = JSON.parse(propertiesText.replace(/\{\{(\w+)\}\}/g, '"$1"')); } catch { /* ignore */ }
    }

    if (ctx) {
      const events = inputRows.slice(0, 1000).map((row) => ({
        tenant_id: ctx.tenantId,
        environment: ctx.environment,
        customer_id: String(val(row, customerIdField) ?? ''),
        event_name: eventName,
        properties: { ...parsedProps },
        created_at: new Date().toISOString(),
      }));
      try {
        await ctx.supabase.from('events').insert(events);
      } catch { /* best-effort tracking */ }
    }

    return { rows: inputRows, summary: `Tracked "${eventName}" for ${inputRows.length} contacts` };
  },

  monitor_profile: async ({ config, inputRows, ctx }) => {
    const customerIdField = str(config, 'customer_id_field') || 'customer_id';
    const attrsText = str(config, 'attributes');
    const mergeStrategy = str(config, 'merge_strategy') || 'overwrite';
    const attrLines = attrsText ? attrsText.split('\n').filter(Boolean) : [];
    const attrCount = attrLines.length;

    if (ctx && attrCount) {
      const updates: { id: string; attrs: Record<string, unknown> }[] = [];
      for (const row of inputRows.slice(0, 500)) {
        const cid = String(val(row, customerIdField) ?? '');
        if (!cid) continue;
        const attrs: Record<string, unknown> = {};
        for (const line of attrLines) {
          const [key, expr] = line.split(':').map((s: string) => s.trim());
          if (!key) continue;
          let value: unknown = expr || '';
          value = resolveTemplate(String(value), row);
          if (String(value).match(/^\d+(\.\d+)?$/)) value = Number(value);
          attrs[key] = value;
        }
        updates.push({ id: cid, attrs });
      }
      if (updates.length) {
        for (const u of updates.slice(0, 100)) {
          try {
            await ctx.supabase.from('customers').update(u.attrs).eq('tenant_id', ctx.tenantId).eq('customer_id', u.id);
          } catch { /* best-effort */ }
        }
      }
    }

    return { rows: inputRows, summary: `Updated ${attrCount} profile attributes (${mergeStrategy}) for ${inputRows.length} contacts` };
  },

  monitor_status: ({ config, inputRows }) => {
    const status = str(config, 'status') || 'success';
    const metadataText = str(config, 'metadata');
    let metadata: Record<string, unknown> = {};
    if (metadataText) {
      try {
        const resolved = resolveTemplate(metadataText, inputRows[0] ?? {}, { count: inputRows.length });
        metadata = JSON.parse(resolved);
      } catch { metadata = { raw: metadataText }; }
    }
    const rows = inputRows.map((row) => ({
      ...row, _workflow_status: status, _workflow_metadata: metadata, _workflow_row_count: inputRows.length,
    }));
    return { rows, summary: `Status: ${status} — ${inputRows.length} rows${Object.keys(metadata).length ? ` (${Object.keys(metadata).length} metadata keys)` : ''}` };
  },

  monitor_alert: ({ config, inputRows }) => {
    const channel = str(config, 'channel') || 'slack';
    const severity = str(config, 'severity') || 'warning';
    const condition = str(config, 'condition') || 'always';
    const messageTemplate = str(config, 'message') || 'Pipeline alert';
    const webhookUrl = str(config, 'webhook_url');
    let shouldAlert = condition === 'always';
    if (condition === 'on_error') shouldAlert = inputRows.some((r) => val(r, '_error') || val(r, '_validation_failed'));
    if (condition === 'on_threshold') shouldAlert = inputRows.length > 0;
    const message = resolveTemplate(messageTemplate, inputRows[0] ?? {}, { count: inputRows.length });
    const rows = inputRows.map((row) => ({
      ...row, _alert_fired: shouldAlert, _alert_channel: channel, _alert_severity: severity, _alert_message: message,
    }));
    return { rows, summary: `Alert (${severity}) → ${channel}${webhookUrl ? ` [${webhookUrl.substring(0, 30)}…]` : ''}: ${shouldAlert ? 'FIRED' : 'skipped'} (${inputRows.length} rows)` };
  },

  // Legacy quality
  validate: ({ config, inputRows }) => {
    const rulesText = str(config, 'rules_text');
    const rules = rulesText ? rulesText.split('\n').filter(Boolean) : [];
    const onFail = str(config, 'on_fail') || 'reject';
    const passed: DataRow[] = [], failed: DataRow[] = [];
    inputRows.forEach((row) => {
      let ok = true;
      for (const rule of rules) {
        const [field, check] = rule.trim().split(/\s+/);
        if (!field) continue;
        const v = val(row, field);
        switch (check) {
          case 'not_empty': if (!v || String(v).trim() === '') ok = false; break;
          case 'email_format': if (!String(v ?? '').includes('@')) ok = false; break;
          case 'numeric': if (isNaN(Number(v))) ok = false; break;
          case 'positive': if (Number(v) <= 0) ok = false; break;
          default: if (!v) ok = false;
        }
      }
      if (ok) passed.push(row);
      else failed.push({ ...row, _validation_failed: true });
    });
    const result = onFail === 'reject' ? passed : inputRows;
    return { rows: result, errorRows: failed, summary: `Validated: ${passed.length} pass, ${failed.length} fail (${rules.length} rules, on-fail: ${onFail})` };
  },

  validate_schema: async ({ config, inputRows, ctx }) => {
    const schemaName = str(config, 'schema');
    const strict = bool(config, 'strict');
    let schemaFields: { name: string; data_type: string }[] = [];

    if (ctx && schemaName) {
      const { data: schemaDef } = await ctx.supabase
        .from('schema_definitions').select('id').eq('tenant_id', ctx.tenantId).eq('name', schemaName).maybeSingle();
      if (schemaDef) {
        const { data: fields } = await ctx.supabase
          .from('schema_fields').select('name, data_type').eq('schema_id', schemaDef.id);
        schemaFields = (fields ?? []) as { name: string; data_type: string }[];
      }
    }

    let totalIssues = 0;
    const errorRows: DataRow[] = [];
    const rows = inputRows.map((row) => {
      const issues: string[] = [];
      if (schemaFields.length) {
        for (const f of schemaFields) {
          const v = val(row, f.name);
          if (strict && v === undefined) { issues.push(`missing: ${f.name}`); continue; }
          if (v === undefined || v === null) continue;
          const dt = f.data_type?.toLowerCase() || 'text';
          if ((dt === 'integer' || dt === 'bigint' || dt === 'numeric' || dt === 'decimal') && isNaN(Number(v))) issues.push(`${f.name}: expected ${dt}, got "${String(v).substring(0, 20)}"`);
          else if (dt === 'boolean' && typeof v !== 'boolean' && v !== 'true' && v !== 'false') issues.push(`${f.name}: expected boolean`);
          else if ((dt === 'timestamp' || dt === 'date' || dt === 'timestamptz') && isNaN(new Date(String(v)).getTime())) issues.push(`${f.name}: invalid ${dt}`);
        }
      } else {
        for (const [k, v] of Object.entries(row)) {
          if (k === 'email' && v && !String(v).includes('@')) issues.push('email: invalid format');
          if ((k.endsWith('_date') || k === 'created_at' || k === 'updated_at') && v && isNaN(new Date(String(v)).getTime())) issues.push(`${k}: invalid date`);
        }
      }
      if (issues.length) { totalIssues += issues.length; errorRows.push({ ...row, _schema_issues: issues }); }
      return { ...row, _schema_valid: issues.length === 0, _schema_issue_count: issues.length };
    });
    return { rows, errorRows: errorRows.length ? errorRows : undefined, summary: `Schema check (${strict ? 'strict' : 'lenient'}): ${totalIssues} issues in ${errorRows.length}/${rows.length} rows` };
  },

  validate_anomaly: ({ config, inputRows }) => {
    const field = str(config, 'field');
    const method = str(config, 'method') || 'zscore';
    const threshold = num(config, 'threshold', 3);

    if (!field || !inputRows.length) {
      return { rows: inputRows, summary: `Anomaly: no field specified — pass-through` };
    }

    const values = inputRows.map((r) => Number(val(r, field) ?? 0)).filter((v) => !isNaN(v));
    let anomalyFlags: boolean[];

    if (method === 'iqr') {
      const sorted = [...values].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      const lower = q1 - threshold * iqr;
      const upper = q3 + threshold * iqr;
      anomalyFlags = values.map((v) => v < lower || v > upper);
    } else {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance) || 1;
      anomalyFlags = values.map((v) => Math.abs((v - mean) / stdDev) > threshold);
    }

    let anomalyCount = 0;
    const rows = inputRows.map((r, i) => {
      const v = Number(val(r, field) ?? 0);
      const isAnomaly = i < anomalyFlags.length ? anomalyFlags[i] : false;
      if (isAnomaly) anomalyCount++;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(values.reduce((sum, v2) => sum + (v2 - mean) ** 2, 0) / values.length) || 1;
      const zScore = Math.round(Math.abs((v - mean) / stdDev) * 100) / 100;
      return { ...r, _is_anomaly: isAnomaly, _anomaly_score: zScore };
    });
    return { rows, summary: `Anomaly (${method}): ${anomalyCount} outliers in "${field}" (threshold ${threshold}, n=${values.length})` };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Main execution function
// ═══════════════════════════════════════════════════════════════════════════

export async function executeNode(
  stepType: string,
  config: Cfg,
  inputRows: DataRow[],
  nodeLabel: string,
  ctx?: PipelineContext,
  allInputs?: Record<string, DataRow[]>,
): Promise<NodeResult> {
  const start = performance.now();
  try {
    const executor = executors[stepType];

    if (!executor) {
      const elapsed = Math.round(performance.now() - start);
      return {
        status: 'success',
        executionTimeMs: elapsed,
        output: { rows_in: inputRows.length, rows_out: inputRows.length, rows_processed: inputRows.length, rows_error: 0, data: inputRows, summary: `Unknown type "${stepType}" — pass-through` },
      };
    }

    const result = await executor({ config, inputRows, nodeLabel, ctx, allInputs });
    const elapsed = Math.max(Math.round(performance.now() - start), 1);

    return {
      status: 'success',
      executionTimeMs: elapsed,
      output: {
        rows_in: inputRows.length,
        rows_out: result.rows.length,
        rows_processed: result.rows.length,
        rows_error: result.errorRows?.length ?? 0,
        data: result.rows,
        error_rows: result.errorRows,
        summary: result.summary,
      },
      branches: result.branches,
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    const lmsg = msg.toLowerCase();
    const isConfig = lmsg.includes('required') || lmsg.includes('missing') || lmsg.includes('invalid config');
    const isExternal = lmsg.includes('timeout') || lmsg.includes('network') || lmsg.includes('fetch') || lmsg.includes('econnrefused');
    const category: ErrorCategory = isConfig ? 'configuration' : isExternal ? 'transient' : 'internal';
    return {
      status: 'failed',
      executionTimeMs: elapsed,
      output: {
        rows_in: inputRows.length,
        rows_out: 0,
        rows_processed: 0,
        rows_error: inputRows.length,
        data: [],
        summary: `Error: ${msg}`,
        error: msg,
        error_category: category,
        retryable: category === 'transient',
      },
    };
  }
}
