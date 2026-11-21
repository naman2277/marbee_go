import type { DataColumnSpec } from '@/lib/schema-data';
import { getColumnCellValue } from '@/lib/schema-data';
import {
  evaluateExpr,
  fieldExpr,
  inferExprType,
  type ExprNode,
} from '@/lib/schema-expressions';
import { inferFieldType, type SchemaFilterField } from '@/lib/schema-filters';

export const COLUMN_FILTER_PREFIX = 'col:';

export function columnFilterKey(col: DataColumnSpec): string {
  return `${COLUMN_FILTER_PREFIX}${col.id}`;
}

export function isColumnFilterKey(key: string): boolean {
  return key.startsWith(COLUMN_FILTER_PREFIX);
}

function columnHasTransform(col: DataColumnSpec): boolean {
  if (col.key.startsWith('expr_')) return true;
  if (!col.transform) return false;
  return !(col.transform.kind === 'field' && col.transform.field === col.key);
}

/** Adds transformed / expression output columns to the filter field list. */
export function mergeColumnFilterFields(
  baseFields: SchemaFilterField[],
  dataColumns: DataColumnSpec[],
): SchemaFilterField[] {
  const columnFields: SchemaFilterField[] = dataColumns
    .filter(columnHasTransform)
    .map((col) => ({
      key: columnFilterKey(col),
      label: col.label,
      type: col.transform
        ? inferExprType(col.transform, baseFields)
        : inferFieldType(col.key),
      getValue: (row: Record<string, unknown>) => getColumnCellValue(row, col, baseFields),
      group: 'Transformed columns',
    }));

  const rawFields = baseFields.map((f) => ({
    ...f,
    group: f.group ?? 'Fields',
  }));

  return [...rawFields, ...columnFields].sort((a, b) => {
    if (a.group !== b.group) {
      return (a.group ?? '').localeCompare(b.group ?? '');
    }
    return a.label.localeCompare(b.label);
  });
}

export function fieldToAlias(key: string): string {
  return `@${key}`;
}

/** Underlying row field a column reads from (handles duplicate suffix keys like browser_2). */
export function resolveColumnSourceKey(col: DataColumnSpec): string {
  if (col.transform?.kind === 'field') return col.transform.field;
  const suffixMatch = /^(.+)_(\d+)$/.exec(col.key);
  if (suffixMatch) return suffixMatch[1]!;
  return col.key;
}

export function normalizeColumnSpec(
  col: Partial<DataColumnSpec> & Pick<DataColumnSpec, 'key' | 'label'>,
): DataColumnSpec {
  const stableId =
    col.id && String(col.id).length > 0
      ? col.id
      : `col-${col.key}-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id: stableId,
    key: col.key,
    label: col.label,
    transform: col.transform ?? null,
    alias: col.alias ?? fieldToAlias(col.key),
    groupBy: col.groupBy ?? false,
  };
}

export function normalizeColumnList(columns: DataColumnSpec[]): DataColumnSpec[] {
  return columns.map((c) => normalizeColumnSpec(c));
}

export function columnsStorageKey(tenantId: string, environment: string, schemaSlug: string): string {
  return `marbee:explorer-columns:${tenantId}:${environment}:${schemaSlug}`;
}

export function loadSavedColumns(key: string): DataColumnSpec[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DataColumnSpec[];
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return normalizeColumnList(parsed);
  } catch {
    return null;
  }
}

export function saveColumns(key: string, columns: DataColumnSpec[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(columns));
  } catch {
    /* ignore quota */
  }
}

export function clearSavedColumns(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Display form: @field_key or Lower(@email) */
export function formatExpressionDisplay(node: ExprNode | null, fieldKey: string, sourceKey?: string): string {
  const base = sourceKey ?? fieldKey;
  if (!node) return fieldToAlias(base);
  switch (node.kind) {
    case 'field':
      return fieldToAlias(node.field);
    case 'literal':
      return node.value.includes(' ') ? `"${node.value}"` : node.value || '""';
    case 'func':
      return `${node.name}(${node.args.map((a) => formatExpressionDisplay(a, '')).join(', ')})`;
    default:
      return fieldToAlias(base);
  }
}

/** Parse @field references then expression (supports functions like Lower(@email)). */
export function parseExpressionDisplay(text: string, fields: SchemaFilterField[]): ExprNode | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const stripped = trimmed.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1');
  const field = fields.find((f) => trimmed === fieldToAlias(f.key));
  if (field) return fieldExpr(field.key);

  const parsed = parseExpression(stripped, fields) ?? parseExpression(trimmed, fields);
  if (parsed) return parsed;

  if (/^@?[a-z_][a-z0-9_]*$/i.test(trimmed)) {
    const key = trimmed.replace(/^@/, '');
    return fieldExpr(key);
  }

  return null;
}

export function isPlainFieldExpression(node: ExprNode | null, fieldKey: string): boolean {
  return !node || (node.kind === 'field' && node.field === fieldKey);
}

export type DataExplorerSortDir = 'asc' | 'desc';

function compareSortValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null || a === '') return 1;
  if (b == null || b === '') return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  const aStr = String(a);
  const bStr = String(b);
  const aNum = Number(aStr);
  const bNum = Number(bStr);
  if (aStr.trim() !== '' && bStr.trim() !== '' && !Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    return aNum - bNum;
  }

  const aDate = Date.parse(aStr);
  const bDate = Date.parse(bStr);
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
    return aDate - bDate;
  }

  return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortExplorerRows(
  rows: Record<string, unknown>[],
  column: DataColumnSpec,
  direction: DataExplorerSortDir,
  filterFields: SchemaFilterField[],
): Record<string, unknown>[] {
  const mult = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aVal = getColumnCellValue(a, column, filterFields);
    const bVal = getColumnCellValue(b, column, filterFields);
    return mult * compareSortValues(aVal, bVal);
  });
}

export function applyOutputGrouping(
  rows: Record<string, unknown>[],
  columns: DataColumnSpec[],
  filterFields: SchemaFilterField[],
): Record<string, unknown>[] {
  const groupCols = columns.filter((c) => c.groupBy);
  if (!groupCols.length || !rows.length) return rows;

  const buckets = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    const parts = groupCols.map((col) => {
      const v = getColumnCellValue(row, col, filterFields);
      return v == null || v === '' ? '∅' : String(v);
    });
    const bucketKey = parts.join('\u0001');
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(row);
  }

  return [...buckets.values()].map((groupRows, index) => {
    const out: Record<string, unknown> = {
      id: `group-${index}`,
      __group_count: groupRows.length,
    };

    for (const col of columns) {
      if (col.groupBy) {
        out[col.id] = getColumnCellValue(groupRows[0]!, col, filterFields);
        continue;
      }

      const values = groupRows.map((r) => getColumnCellValue(r, col, filterFields));
      const distinct = [...new Set(values.map((v) => JSON.stringify(v ?? null)))];
      if (distinct.length === 1) {
        out[col.id] = values[0];
      } else if (values.every((v) => typeof v === 'number' || v == null || v === '')) {
        const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
        out[col.id] = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
        out[`${col.id}__agg`] = 'sum';
      } else {
        out[col.id] = `(${groupRows.length} values)`;
        out[`${col.id}__agg`] = 'mixed';
      }
    }

    return out;
  });
}

export function moveColumn(columns: DataColumnSpec[], id: string, direction: 'up' | 'down'): DataColumnSpec[] {
  const index = columns.findIndex((c) => c.id === id);
  if (index < 0) return columns;
  const next = direction === 'up' ? index - 1 : index + 1;
  if (next < 0 || next >= columns.length) return columns;
  const copy = [...columns];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item!);
  return copy;
}

function sourceFieldKey(col: DataColumnSpec): string {
  return resolveColumnSourceKey(col);
}

function countColumnsForField(columns: DataColumnSpec[], fieldKey: string): number {
  return columns.filter((c) => sourceFieldKey(c) === fieldKey).length;
}

/** Plain alias without @ prefix for display / export */
export function aliasPlain(alias: string): string {
  return alias.startsWith('@') ? alias.slice(1) : alias;
}

export function aliasToStorage(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : trimmed;
}

/** Create an output column from a source field; supports adding the same field multiple times. */
export function createOutputColumnFromField(
  field: { key: string; label: string },
  existingColumns: DataColumnSpec[],
): DataColumnSpec {
  const count = countColumnsForField(existingColumns, field.key);
  const next = count + 1;
  const isFirst = count === 0;

  const key = isFirst ? field.key : `${field.key}_${next}`;
  const label = isFirst ? field.label : `${field.label} ${next}`;
  const alias = isFirst ? field.key : `${field.key}_${next}`;

  return normalizeColumnSpec({
    key,
    label,
    alias,
    transform: isFirst ? null : fieldExpr(field.key),
  });
}

export function addFieldsToOutput(
  columns: DataColumnSpec[],
  fields: Array<{ key: string; label: string }>,
): DataColumnSpec[] {
  let next = [...columns];
  for (const field of fields) {
    next = [...next, createOutputColumnFromField(field, next)];
  }
  return next;
}

export function removeColumnsById(columns: DataColumnSpec[], ids: Set<string>): DataColumnSpec[] {
  return columns.filter((c) => !ids.has(c.id));
}

export function previewColumnValue(
  col: DataColumnSpec,
  sampleRow: Record<string, unknown> | undefined,
  filterFields: SchemaFilterField[],
): string {
  if (!sampleRow) return '—';
  const raw = col.transform
    ? evaluateExpr(col.transform, sampleRow, filterFields)
    : getColumnCellValue(sampleRow, { ...col, transform: null }, filterFields);
  if (raw == null || raw === '') return '—';
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}
