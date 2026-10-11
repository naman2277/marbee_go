// Shared logic for the Real-Time Messages engine: payload validation, a
// sandboxed template renderer (Handlebars subset), and filter evaluation.
// Used by rtm-ingest (validation) and rtm-worker (render + filters).

export type SchemaField = {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'url' | 'email' | 'object' | 'array';
  required?: boolean;
  example?: unknown;
  pii?: boolean;
};

export type Filter = { path: string; op: string; value?: unknown };

export type RenderContext = {
  data: Record<string, unknown>;
  customer: Record<string, unknown>;
  env: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

export type ValidationError = { field: string; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePayload(schema: SchemaField[], data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const obj = (data && typeof data === 'object' && !Array.isArray(data))
    ? (data as Record<string, unknown>)
    : {};

  for (const field of schema ?? []) {
    if (!field?.key) continue;
    const present = Object.prototype.hasOwnProperty.call(obj, field.key)
      && obj[field.key] !== null && obj[field.key] !== undefined && obj[field.key] !== '';
    if (!present) {
      if (field.required) errors.push({ field: `data.${field.key}`, message: `${field.key} is required` });
      continue;
    }
    const v = obj[field.key];
    switch (field.type) {
      case 'number':
        if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))))
          errors.push({ field: `data.${field.key}`, message: `${field.key} must be a number, got ${JSON.stringify(v)}` });
        break;
      case 'boolean':
        if (typeof v !== 'boolean' && v !== 'true' && v !== 'false')
          errors.push({ field: `data.${field.key}`, message: `${field.key} must be a boolean` });
        break;
      case 'date':
        if (typeof v !== 'string' || !ISO_DATE.test(v))
          errors.push({ field: `data.${field.key}`, message: `${field.key} must be an ISO date, got ${JSON.stringify(v)}` });
        break;
      case 'url':
        if (typeof v !== 'string' || !/^https?:\/\//i.test(v))
          errors.push({ field: `data.${field.key}`, message: `${field.key} must be an http(s) URL` });
        break;
      case 'email':
        if (typeof v !== 'string' || !EMAIL_RE.test(v))
          errors.push({ field: `data.${field.key}`, message: `${field.key} must be an email address` });
        break;
      case 'object':
        if (typeof v !== 'object' || Array.isArray(v))
          errors.push({ field: `data.${field.key}`, message: `${field.key} must be an object` });
        break;
      case 'array':
        if (!Array.isArray(v))
          errors.push({ field: `data.${field.key}`, message: `${field.key} must be an array` });
        break;
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Path access + filters
// ---------------------------------------------------------------------------

export function getPath(root: unknown, path: string): unknown {
  const parts = String(path).split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function evalFilters(filters: Filter[], ctx: RenderContext): boolean {
  if (!Array.isArray(filters) || filters.length === 0) return true;
  return filters.every((f) => {
    const left = getPath(ctx, f.path);
    const right = f.value;
    switch (f.op) {
      case 'exists': return left !== undefined && left !== null && left !== '';
      case 'not_exists': return left === undefined || left === null || left === '';
      case 'eq': return String(left) === String(right);
      case 'neq': return String(left) !== String(right);
      case 'gt': return Number(left) > Number(right);
      case 'lt': return Number(left) < Number(right);
      case 'gte': return Number(left) >= Number(right);
      case 'lte': return Number(left) <= Number(right);
      case 'contains': return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
      case 'in': return Array.isArray(right) && right.map(String).includes(String(left));
      default: return true;
    }
  });
}

// ---------------------------------------------------------------------------
// Template rendering — {{ns.path}}, {{ns.path | "fallback"}}, {{helper a b}}
// No loops, no conditionals, no I/O. Whitelisted helpers only.
// ---------------------------------------------------------------------------

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(value: unknown, pattern: string): string {
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value ?? '');
  const pad = (n: number) => String(n).padStart(2, '0');
  return (pattern || 'YYYY-MM-DD')
    .replace(/ddd/g, DOW[d.getUTCDay()])
    .replace(/MMM/g, MONTH[d.getUTCMonth()])
    .replace(/YYYY/g, String(d.getUTCFullYear()))
    .replace(/MM/g, pad(d.getUTCMonth() + 1))
    .replace(/DD/g, pad(d.getUTCDate()))
    .replace(/D/g, String(d.getUTCDate()))
    .replace(/HH/g, pad(d.getUTCHours()))
    .replace(/mm/g, pad(d.getUTCMinutes()));
}

const HELPERS: Record<string, (args: unknown[]) => string> = {
  date: (a) => fmtDate(a[0], String(a[1] ?? 'YYYY-MM-DD')),
  currency: (a) => {
    const n = Number(a[0]);
    if (isNaN(n)) return String(a[0] ?? '');
    const code = String(a[1] ?? 'USD');
    try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(n); }
    catch { return `${code} ${n.toFixed(2)}`; }
  },
  number: (a) => {
    const n = Number(a[0]);
    return isNaN(n) ? String(a[0] ?? '') : new Intl.NumberFormat('en').format(n);
  },
  uppercase: (a) => String(a[0] ?? '').toUpperCase(),
  lowercase: (a) => String(a[0] ?? '').toLowerCase(),
  truncate: (a) => {
    const s = String(a[0] ?? ''); const n = Number(a[1] ?? 80);
    return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
  },
  default: (a) => {
    const v = a[0];
    return v === undefined || v === null || v === '' ? String(a[1] ?? '') : String(v);
  },
};

export type RenderResult = { text: string; missing: string[] };

// Tokenise a "{{ ... }}" body into arg strings, respecting quotes.
function splitArgs(body: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === quote) { out.push(JSON.stringify(cur)); cur = ''; quote = null; }
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (/\s/.test(c)) {
      if (cur) { out.push(cur); cur = ''; }
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function resolveToken(raw: string, ctx: RenderContext, missing: string[]): string {
  // fallback form:  a.b.c | "text"
  const [pathPart, ...fbParts] = raw.split('|');
  const path = pathPart.trim();
  const fallbackRaw = fbParts.join('|').trim();
  const fallback = fallbackRaw.startsWith('"') || fallbackRaw.startsWith("'")
    ? fallbackRaw.slice(1, -1)
    : fallbackRaw;

  const tokens = splitArgs(path);
  // helper call:  helperName arg1 arg2
  if (tokens.length >= 1 && HELPERS[tokens[0]] && tokens.length > 1) {
    const args = tokens.slice(1).map((t) => {
      if (t.startsWith('"')) return JSON.parse(t);
      const val = getPath(ctx, t);
      if (val === undefined && (t.startsWith('data.') || t.startsWith('customer.'))) missing.push(t);
      return val;
    });
    const result = HELPERS[tokens[0]](args);
    return result === '' && fallback ? fallback : result;
  }

  // plain path
  const val = getPath(ctx, path);
  if (val === undefined || val === null || val === '') {
    if (path.startsWith('data.') || path.startsWith('customer.')) missing.push(path);
    return fallback;
  }
  return typeof val === 'object' ? JSON.stringify(val) : String(val);
}

export function renderString(tpl: string, ctx: RenderContext): RenderResult {
  const missing: string[] = [];
  if (!tpl) return { text: '', missing };
  const text = tpl.replace(/\{\{([^}]+)\}\}/g, (_m, body) => resolveToken(String(body).trim(), ctx, missing));
  return { text, missing };
}

// Render every string leaf in a template content object.
export function renderContent(
  content: Record<string, unknown>,
  ctx: RenderContext,
): { rendered: Record<string, unknown>; missing: string[] } {
  const missing: string[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = renderString(v, ctx);
      missing.push(...r.missing);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return { rendered: walk(content) as Record<string, unknown>, missing: [...new Set(missing)] };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function scrubPii(payload: Record<string, unknown>, schema: SchemaField[]): Record<string, unknown> {
  const piiKeys = new Set((schema ?? []).filter((f) => f.pii).map((f) => f.key));
  if (piiKeys.size === 0) return payload;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) out[k] = piiKeys.has(k) ? '[redacted]' : v;
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}
