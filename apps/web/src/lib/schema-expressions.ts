import type { FieldType, SchemaFilterField } from '@/lib/schema-filters';

export type ExprNode =
  | { kind: 'field'; field: string }
  | { kind: 'literal'; value: string }
  | { kind: 'func'; name: string; args: ExprNode[] };

export type FunctionCategory = 'string' | 'date' | 'number' | 'other';

export type FunctionDef = {
  name: string;
  label: string;
  category: FunctionCategory;
  description: string;
  returnType: FieldType;
  /** -1 = variadic minimum, 0 = no args */
  argCount: number | 'variadic';
  argLabels?: string[];
};

/** Curated from Adobe Campaign filter functions — https://experienceleague.adobe.com/en/docs/campaign-standard/using/managing-processes-and-data/filtering-data/list-of-functions */
export const FUNCTION_CATALOG: FunctionDef[] = [
  // String
  { name: 'Lower', label: 'Lower', category: 'string', description: 'Lowercase string', returnType: 'string', argCount: 1, argLabels: ['String'] },
  { name: 'Upper', label: 'Upper', category: 'string', description: 'Uppercase string', returnType: 'string', argCount: 1, argLabels: ['String'] },
  { name: 'Smart', label: 'Smart', category: 'string', description: 'Title case each word', returnType: 'string', argCount: 1, argLabels: ['String'] },
  { name: 'Length', label: 'Length', category: 'string', description: 'String length', returnType: 'number', argCount: 1, argLabels: ['String'] },
  { name: 'Left', label: 'Left', category: 'string', description: 'First N characters', returnType: 'string', argCount: 2, argLabels: ['String', 'Count'] },
  { name: 'Right', label: 'Right', category: 'string', description: 'Last N characters', returnType: 'string', argCount: 2, argLabels: ['String', 'Count'] },
  { name: 'Substring', label: 'Substring', category: 'string', description: 'Extract substring', returnType: 'string', argCount: 3, argLabels: ['String', 'Offset', 'Length'] },
  { name: 'Ltrim', label: 'Ltrim', category: 'string', description: 'Trim leading spaces', returnType: 'string', argCount: 1, argLabels: ['String'] },
  { name: 'Rtrim', label: 'Rtrim', category: 'string', description: 'Trim trailing spaces', returnType: 'string', argCount: 1, argLabels: ['String'] },
  { name: 'Trim', label: 'Trim', category: 'string', description: 'Trim both sides', returnType: 'string', argCount: 1, argLabels: ['String'] },
  { name: 'Charindex', label: 'Charindex', category: 'string', description: 'Position of substring', returnType: 'number', argCount: 2, argLabels: ['Haystack', 'Needle'] },
  { name: 'ToString', label: 'ToString', category: 'string', description: 'Convert to string', returnType: 'string', argCount: 1, argLabels: ['Value'] },
  // Date
  { name: 'GetDate', label: 'GetDate', category: 'date', description: 'Current date/time', returnType: 'timestamp', argCount: 0 },
  { name: 'Year', label: 'Year', category: 'date', description: 'Year from date', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'Month', label: 'Month', category: 'date', description: 'Month (1–12)', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'Day', label: 'Day', category: 'date', description: 'Day of month', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'DayOfYear', label: 'DayOfYear', category: 'date', description: 'Day in year', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'Hour', label: 'Hour', category: 'date', description: 'Hour (0–23)', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'Minute', label: 'Minute', category: 'date', description: 'Minutes', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'Second', label: 'Second', category: 'date', description: 'Seconds', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'WeekDay', label: 'WeekDay', category: 'date', description: 'Day of week', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'DateOnly', label: 'DateOnly', category: 'date', description: 'Date at midnight', returnType: 'timestamp', argCount: 1, argLabels: ['Date'] },
  { name: 'ToDate', label: 'ToDate', category: 'date', description: 'Strip time portion', returnType: 'date', argCount: 1, argLabels: ['Date'] },
  { name: 'AddDays', label: 'AddDays', category: 'date', description: 'Add days', returnType: 'timestamp', argCount: 2, argLabels: ['Date', 'Days'] },
  { name: 'SubDays', label: 'SubDays', category: 'date', description: 'Subtract days', returnType: 'timestamp', argCount: 2, argLabels: ['Date', 'Days'] },
  { name: 'AddMonths', label: 'AddMonths', category: 'date', description: 'Add months', returnType: 'timestamp', argCount: 2, argLabels: ['Date', 'Months'] },
  { name: 'AddHours', label: 'AddHours', category: 'date', description: 'Add hours', returnType: 'timestamp', argCount: 2, argLabels: ['Date', 'Hours'] },
  { name: 'DaysDiff', label: 'DaysDiff', category: 'date', description: 'Days between dates', returnType: 'number', argCount: 2, argLabels: ['End', 'Start'] },
  { name: 'DaysOld', label: 'DaysOld', category: 'date', description: 'Age in days', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'DaysAgo', label: 'DaysAgo', category: 'date', description: 'Today minus N days', returnType: 'timestamp', argCount: 1, argLabels: ['Days'] },
  { name: 'MonthsOld', label: 'MonthsOld', category: 'date', description: 'Age in months', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  { name: 'YearsOld', label: 'YearsOld', category: 'date', description: 'Age in years', returnType: 'number', argCount: 1, argLabels: ['Date'] },
  // Number
  { name: 'Abs', label: 'Abs', category: 'number', description: 'Absolute value', returnType: 'number', argCount: 1, argLabels: ['Number'] },
  { name: 'Round', label: 'Round', category: 'number', description: 'Round to decimals', returnType: 'number', argCount: 2, argLabels: ['Number', 'Decimals'] },
  { name: 'Floor', label: 'Floor', category: 'number', description: 'Round down', returnType: 'number', argCount: 1, argLabels: ['Number'] },
  { name: 'Ceil', label: 'Ceil', category: 'number', description: 'Round up', returnType: 'number', argCount: 1, argLabels: ['Number'] },
  { name: 'ToInteger', label: 'ToInteger', category: 'number', description: 'Convert to integer', returnType: 'number', argCount: 1, argLabels: ['Number'] },
  { name: 'ToDouble', label: 'ToDouble', category: 'number', description: 'Convert to float', returnType: 'number', argCount: 1, argLabels: ['Number'] },
  // Other
  { name: 'Coalesce', label: 'Coalesce', category: 'other', description: 'First non-empty value', returnType: 'string', argCount: 2, argLabels: ['Value 1', 'Value 2'] },
  { name: 'Iif', label: 'Iif', category: 'other', description: 'If condition then A else B', returnType: 'string', argCount: 3, argLabels: ['Condition', 'Then', 'Else'] },
  { name: 'IsEmptyString', label: 'IsEmptyString', category: 'other', description: 'True if empty', returnType: 'boolean', argCount: 1, argLabels: ['String'] },
];

export const FUNCTION_MAP = new Map(FUNCTION_CATALOG.map((f) => [f.name, f]));

export function fieldExpr(field: string): ExprNode {
  return { kind: 'field', field };
}

export function literalExpr(value: string): ExprNode {
  return { kind: 'literal', value };
}

export function funcExpr(name: string, args: ExprNode[]): ExprNode {
  return { kind: 'func', name, args };
}

export function defaultFieldExpr(fields: SchemaFilterField[]): ExprNode {
  return fieldExpr(fields[0]?.key ?? '');
}

function toDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isTruthy(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return true;
}

export function fieldKeyFromExpr(node: ExprNode): string {
  if (node.kind === 'field') return node.field;
  if (node.kind === 'func') {
    const first = node.args[0];
    if (first?.kind === 'field') return first.field;
  }
  return '';
}

export function exprUsesFunction(node: ExprNode): boolean {
  return node.kind === 'func';
}

export function evaluateExpr(
  node: ExprNode,
  row: Record<string, unknown>,
  fields: SchemaFilterField[],
): unknown {
  switch (node.kind) {
    case 'field': {
      const f = fields.find((x) => x.key === node.field);
      return f ? f.getValue(row) : row[node.field];
    }
    case 'literal':
      return node.value;
    case 'func':
      return evaluateFunction(node.name, node.args, row, fields);
    default:
      return null;
  }
}

function evaluateFunction(
  name: string,
  args: ExprNode[],
  row: Record<string, unknown>,
  fields: SchemaFilterField[],
): unknown {
  const evalArg = (i: number) => evaluateExpr(args[i] ?? literalExpr(''), row, fields);

  switch (name) {
    case 'Lower':
      return toStr(evalArg(0)).toLowerCase();
    case 'Upper':
      return toStr(evalArg(0)).toUpperCase();
    case 'Smart':
      return toStr(evalArg(0)).replace(/\b\w/g, (c) => c.toUpperCase());
    case 'Length':
      return toStr(evalArg(0)).length;
    case 'Left': {
      const s = toStr(evalArg(0));
      const n = toNumber(evalArg(1)) ?? 0;
      return s.slice(0, n);
    }
    case 'Right': {
      const s = toStr(evalArg(0));
      const n = toNumber(evalArg(1)) ?? 0;
      return s.slice(-n);
    }
    case 'Substring': {
      const s = toStr(evalArg(0));
      const offset = toNumber(evalArg(1)) ?? 0;
      const len = toNumber(evalArg(2)) ?? s.length;
      return s.substring(offset, offset + len);
    }
    case 'Ltrim':
      return toStr(evalArg(0)).replace(/^\s+/, '');
    case 'Rtrim':
      return toStr(evalArg(0)).replace(/\s+$/, '');
    case 'Trim':
      return toStr(evalArg(0)).trim();
    case 'Charindex': {
      const hay = toStr(evalArg(0)).toLowerCase();
      const needle = toStr(evalArg(1)).toLowerCase();
      const idx = hay.indexOf(needle);
      return idx >= 0 ? idx + 1 : 0;
    }
    case 'ToString':
      return toStr(evalArg(0));
    case 'GetDate':
      return new Date().toISOString();
    case 'Year':
      return toDate(evalArg(0))?.getFullYear() ?? null;
    case 'Month':
      return toDate(evalArg(0)) ? toDate(evalArg(0))!.getMonth() + 1 : null;
    case 'Day':
      return toDate(evalArg(0))?.getDate() ?? null;
    case 'DayOfYear': {
      const d = toDate(evalArg(0));
      if (!d) return null;
      const start = new Date(d.getFullYear(), 0, 0);
      return Math.floor((d.getTime() - start.getTime()) / 86400000);
    }
    case 'Hour':
      return toDate(evalArg(0))?.getHours() ?? null;
    case 'Minute':
      return toDate(evalArg(0))?.getMinutes() ?? null;
    case 'Second':
      return toDate(evalArg(0))?.getSeconds() ?? null;
    case 'WeekDay':
      return toDate(evalArg(0))?.getDay() ?? null;
    case 'DateOnly': {
      const d = toDate(evalArg(0));
      return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() : null;
    }
    case 'ToDate':
      return evaluateFunction('DateOnly', args, row, fields);
    case 'AddDays': {
      const d = toDate(evalArg(0));
      const n = toNumber(evalArg(1)) ?? 0;
      return d ? new Date(d.getTime() + n * 86400000).toISOString() : null;
    }
    case 'SubDays': {
      const d = toDate(evalArg(0));
      const n = toNumber(evalArg(1)) ?? 0;
      return d ? new Date(d.getTime() - n * 86400000).toISOString() : null;
    }
    case 'AddMonths': {
      const d = toDate(evalArg(0));
      const n = toNumber(evalArg(1)) ?? 0;
      if (!d) return null;
      const copy = new Date(d);
      copy.setMonth(copy.getMonth() + n);
      return copy.toISOString();
    }
    case 'AddHours': {
      const d = toDate(evalArg(0));
      const n = toNumber(evalArg(1)) ?? 0;
      return d ? new Date(d.getTime() + n * 3600000).toISOString() : null;
    }
    case 'DaysDiff': {
      const end = toDate(evalArg(0));
      const start = toDate(evalArg(1));
      if (!end || !start) return null;
      return Math.floor((end.getTime() - start.getTime()) / 86400000);
    }
    case 'DaysOld': {
      const d = toDate(evalArg(0));
      if (!d) return null;
      return Math.floor((Date.now() - d.getTime()) / 86400000);
    }
    case 'DaysAgo': {
      const n = toNumber(evalArg(0)) ?? 0;
      return new Date(Date.now() - n * 86400000).toISOString();
    }
    case 'MonthsOld': {
      const d = toDate(evalArg(0));
      if (!d) return null;
      const now = new Date();
      return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    }
    case 'YearsOld': {
      const d = toDate(evalArg(0));
      if (!d) return null;
      return new Date().getFullYear() - d.getFullYear();
    }
    case 'Abs': {
      const n = toNumber(evalArg(0));
      return n == null ? null : Math.abs(n);
    }
    case 'Round': {
      const n = toNumber(evalArg(0));
      const dec = toNumber(evalArg(1)) ?? 0;
      if (n == null) return null;
      const f = 10 ** dec;
      return Math.round(n * f) / f;
    }
    case 'Floor': {
      const n = toNumber(evalArg(0));
      return n == null ? null : Math.floor(n);
    }
    case 'Ceil': {
      const n = toNumber(evalArg(0));
      return n == null ? null : Math.ceil(n);
    }
    case 'ToInteger':
      return toNumber(evalArg(0)) != null ? Math.trunc(toNumber(evalArg(0))!) : null;
    case 'ToDouble':
      return toNumber(evalArg(0));
    case 'Coalesce': {
      const a = evalArg(0);
      return isTruthy(a) ? a : evalArg(1);
    }
    case 'Iif': {
      const cond = evalArg(0);
      return isTruthy(cond) ? evalArg(1) : evalArg(2);
    }
    case 'IsEmptyString':
      return toStr(evalArg(0)).length === 0;
    default:
      return null;
  }
}

export function inferExprType(node: ExprNode, fields: SchemaFilterField[]): FieldType {
  if (node.kind === 'field') {
    return fields.find((f) => f.key === node.field)?.type ?? 'string';
  }
  if (node.kind === 'literal') {
    const v = node.value.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'timestamp';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
    if (/^-?\d+(\.\d+)?$/.test(v)) return 'number';
    if (!Number.isNaN(Date.parse(v)) && v.includes('-')) return 'timestamp';
    if (node.value === 'true' || node.value === 'false') return 'boolean';
    return 'string';
  }
  return FUNCTION_MAP.get(node.name)?.returnType ?? 'string';
}

export function formatExpr(node: ExprNode, fields: SchemaFilterField[]): string {
  switch (node.kind) {
    case 'field':
      return fields.find((f) => f.key === node.field)?.label ?? node.field;
    case 'literal':
      return node.value.includes(' ') ? `"${node.value}"` : node.value || '""';
    case 'func':
      return `${node.name}(${node.args.map((a) => formatExpr(a, fields)).join(', ')})`;
    default:
      return '';
  }
}

/** Parse expression text: Year(created_at), Lower(fcm_token), 2026, "hello" */
export function parseExpression(text: string, fields: SchemaFilterField[]): ExprNode | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return literalExpr(trimmed.slice(1, -1));
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return literalExpr(trimmed);
  }

  const fnMatch = /^([A-Za-z][A-Za-z0-9]*)\((.*)\)$/.exec(trimmed);
  if (fnMatch) {
    const name = fnMatch[1];
    const def = FUNCTION_MAP.get(name);
    if (!def) return null;
    const args = splitArgs(fnMatch[2])
      .map((a) => parseExpression(a, fields))
      .filter((a): a is ExprNode => a != null);
    return funcExpr(name, args);
  }

  const field = fields.find((f) => f.key === trimmed || f.label === trimmed);
  if (field) return fieldExpr(field.key);

  if (/^[a-z_][a-z0-9_]*$/i.test(trimmed)) {
    return fieldExpr(trimmed);
  }

  return literalExpr(trimmed);
}

function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === quote && input[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ')') {
      depth--;
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function wrapWithFunction(expr: ExprNode, fnName: string): ExprNode {
  const def = FUNCTION_MAP.get(fnName);
  if (!def) return expr;
  const argCount = def.argCount === 'variadic' ? 1 : def.argCount;
  if (argCount === 0) return funcExpr(fnName, []);
  const args: ExprNode[] = [expr];
  while (args.length < argCount) args.push(literalExpr(''));
  return funcExpr(fnName, args);
}

export function createDefaultArgs(
  fnName: string,
  fields: SchemaFilterField[],
  baseField?: string,
): ExprNode[] {
  const def = FUNCTION_MAP.get(fnName);
  if (!def || def.argCount === 0) return [];
  const count = def.argCount === 'variadic' ? 1 : def.argCount;
  const firstArg = baseField ? fieldExpr(baseField) : defaultFieldExpr(fields);
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? firstArg : literalExpr(''),
  );
}

/** Technical expression using field keys (for previews / code display) */
export function formatExprCode(node: ExprNode): string {
  switch (node.kind) {
    case 'field':
      return node.field;
    case 'literal':
      return node.value.includes(' ') ? `"${node.value}"` : node.value || '""';
    case 'func':
      return `${node.name}(${node.args.map((a) => formatExprCode(a)).join(', ')})`;
    default:
      return '';
  }
}
