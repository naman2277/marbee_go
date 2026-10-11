/* ================================================================
   Phase E — expression engine. A tiny, safe `{{ … }}` template
   language usable in any pipeline config field. No eval: only
   whitelisted tokens + a handful of pure functions.

     {{run.id}} {{run.started_at}} {{now}} {{today}}
     {{env.NAME}}            workspace / environment value
     {{row.field}}           current row field (per-row templates)
     {{node.<id>.count}}     a completed node's output row count
     Lower(x) Upper(x) Trim(x) Year(x) Default(x, "fallback")
   ================================================================ */

export type ExpressionContext = {
  run?: { id?: string; started_at?: string; version_number?: number | null };
  env?: Record<string, string | number | null | undefined>;
  row?: Record<string, unknown>;
  node?: Record<string, { count?: number }>;
};

export type ExpressionToken = {
  token: string;
  label: string;
  kind: 'value' | 'function';
  insert: string;
};

export const EXPRESSION_TOKENS: ExpressionToken[] = [
  { token: 'run.id', label: 'Run ID', kind: 'value', insert: '{{run.id}}' },
  { token: 'run.started_at', label: 'Run start time', kind: 'value', insert: '{{run.started_at}}' },
  { token: 'run.version_number', label: 'Pinned version', kind: 'value', insert: '{{run.version_number}}' },
  { token: 'now', label: 'Now (ISO)', kind: 'value', insert: '{{now}}' },
  { token: 'today', label: 'Today (YYYY-MM-DD)', kind: 'value', insert: '{{today}}' },
  { token: 'env.', label: 'Environment value', kind: 'value', insert: '{{env.}}' },
  { token: 'row.', label: 'Current row field', kind: 'value', insert: '{{row.}}' },
  { token: 'Lower(', label: 'Lower(x)', kind: 'function', insert: 'Lower({{row.}})' },
  { token: 'Upper(', label: 'Upper(x)', kind: 'function', insert: 'Upper({{row.}})' },
  { token: 'Trim(', label: 'Trim(x)', kind: 'function', insert: 'Trim({{row.}})' },
  { token: 'Year(', label: 'Year(date)', kind: 'function', insert: 'Year({{row.}})' },
  { token: 'Default(', label: 'Default(x, "fallback")', kind: 'function', insert: 'Default({{row.}}, "")' },
];

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function lookup(path: string, ctx: ExpressionContext): unknown {
  const [head, ...rest] = path.split('.');
  if (head === 'now') return new Date().toISOString();
  if (head === 'today') return new Date().toISOString().slice(0, 10);
  if (head === 'run') return (ctx.run as Record<string, unknown> | undefined)?.[rest[0]] ?? '';
  if (head === 'env') return ctx.env?.[rest.join('.')] ?? '';
  if (head === 'row') return ctx.row?.[rest.join('.')] ?? '';
  if (head === 'node') return ctx.node?.[rest[0]]?.count ?? '';
  return '';
}

/** Resolve `{{…}}` tokens and the small function set. Unknown tokens → ''. */
export function resolveExpression(template: string, ctx: ExpressionContext = {}): string {
  if (!template || !template.includes('{{')) return applyFns(template ?? '', ctx);
  return applyFns(template.replace(TOKEN_RE, (_m, path) => String(lookup(String(path).trim(), ctx) ?? '')), ctx);
}

function applyFns(s: string, ctx: ExpressionContext): string {
  // Non-nested single pass is enough for the supported set.
  return s.replace(/(Lower|Upper|Trim|Year|Default)\(([^()]*)\)/g, (_m, fn, argStr) => {
    const args = splitArgs(argStr).map((a) => stripQuotes(resolveExpression(a.trim(), ctx)));
    const x = args[0] ?? '';
    switch (fn) {
      case 'Lower': return x.toLowerCase();
      case 'Upper': return x.toUpperCase();
      case 'Trim': return x.trim();
      case 'Year': { const d = new Date(x); return isNaN(+d) ? '' : String(d.getUTCFullYear()); }
      case 'Default': return x.trim() ? x : (args[1] ?? '');
      default: return x;
    }
  });
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const stripQuotes = (s: string) => s.replace(/^["']|["']$/g, '');

export type ExpressionValidation = { ok: boolean; errors: string[] };

const KNOWN_PREFIXES = ['run', 'env', 'row', 'node', 'now', 'today'];
const KNOWN_FNS = ['Lower', 'Upper', 'Trim', 'Year', 'Default'];

export function validateExpression(template: string): ExpressionValidation {
  const errors: string[] = [];
  if (!template) return { ok: true, errors };

  const opens = (template.match(/\{\{/g) ?? []).length;
  const closes = (template.match(/\}\}/g) ?? []).length;
  if (opens !== closes) errors.push('Unbalanced {{ }}');

  let m: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, 'g');
  while ((m = re.exec(template))) {
    const head = m[1].trim().split('.')[0].replace(/\(.*$/, '');
    if (!KNOWN_PREFIXES.includes(head) && !KNOWN_FNS.includes(head)) {
      errors.push(`Unknown token "${m[1].trim()}"`);
    }
  }

  for (const fn of template.match(/([A-Za-z]+)\(/g) ?? []) {
    const name = fn.slice(0, -1);
    if (name && /^[A-Z]/.test(name) && !KNOWN_FNS.includes(name)) errors.push(`Unknown function "${name}()"`);
  }

  return { ok: errors.length === 0, errors };
}

/** Autocomplete entries for a `{{` prefix being typed. */
export function expressionSuggestions(fragment: string): ExpressionToken[] {
  const f = fragment.toLowerCase().replace(/^\{+/, '').trim();
  if (!f) return EXPRESSION_TOKENS;
  return EXPRESSION_TOKENS.filter((t) => t.token.toLowerCase().includes(f) || t.label.toLowerCase().includes(f));
}
