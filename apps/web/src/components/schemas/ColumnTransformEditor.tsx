import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FilterSideInput } from '@/components/schemas/FilterSideInput';
import { formatCellValue, getDisplayValue } from '@/lib/schema-data';
import {
  evaluateExpr,
  fieldExpr,
  formatExprCode,
  funcExpr,
  type ExprNode,
} from '@/lib/schema-expressions';
import type { SchemaFilterField } from '@/lib/schema-filters';

export const QUICK_COLUMN_TRANSFORMS = [
  { id: 'none', label: 'None — show raw value' },
  { id: 'Lower', label: 'Lowercase' },
  { id: 'Upper', label: 'Uppercase' },
  { id: 'Trim', label: 'Trim spaces' },
  { id: 'Smart', label: 'Title case' },
  { id: 'Year', label: 'Year (from date)' },
  { id: 'Month', label: 'Month (from date)' },
  { id: 'DaysOld', label: 'Days old (from date)' },
  { id: 'ToString', label: 'To string' },
] as const;

const QUICK_IDS = new Set<string>(QUICK_COLUMN_TRANSFORMS.map((t) => t.id));

export function buildColumnTransform(fnId: string, fieldKey: string): ExprNode | null {
  if (fnId === 'none') return null;
  return funcExpr(fnId, [fieldExpr(fieldKey)]);
}

export function detectQuickColumnTransform(transform: ExprNode | null, fieldKey: string): string {
  if (!transform) return 'none';
  if (transform.kind === 'func' && transform.args.length === 1) {
    const first = transform.args[0];
    if (first?.kind === 'field' && first.field === fieldKey && QUICK_IDS.has(transform.name)) {
      return transform.name;
    }
  }
  return 'custom';
}

type Props = {
  columnKey: string;
  transform: ExprNode | null;
  onChange: (transform: ExprNode | null) => void;
  filterFields: SchemaFilterField[];
  sampleRow?: Record<string, unknown>;
};

export function ColumnTransformEditor({ columnKey, transform, onChange, filterFields, sampleRow }: Props) {
  const [forceCustom, setForceCustom] = useState(false);
  const quickId = forceCustom ? 'custom' : detectQuickColumnTransform(transform, columnKey);
  const [customOpen, setCustomOpen] = useState(quickId === 'custom');

  const expr = transform ?? fieldExpr(columnKey);

  const preview = useMemo(() => {
    if (!sampleRow) return null;
    const raw = transform
      ? evaluateExpr(transform, sampleRow, filterFields)
      : getDisplayValue(sampleRow, columnKey);
    return formatCellValue(columnKey, raw);
  }, [sampleRow, transform, columnKey, filterFields]);

  const formula = transform ? formatExprCode(transform) : columnKey;

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Transform
        </span>
        <select
          value={quickId}
          onChange={(e) => {
            const next = e.target.value;
            if (next === 'custom') {
              setForceCustom(true);
              setCustomOpen(true);
              return;
            }
            setForceCustom(false);
            setCustomOpen(false);
            onChange(buildColumnTransform(next, columnKey));
          }}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {QUICK_COLUMN_TRANSFORMS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          <option value="custom">Custom expression…</option>
        </select>
      </label>

      {preview != null && (
        <p className="rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 text-xs text-slate-600">
          <span className="font-medium text-slate-400">Preview · </span>
          <span className="font-mono text-slate-500">{formula}</span>
          <span className="text-slate-400"> → </span>
          <span className="font-medium text-slate-800">{preview}</span>
        </p>
      )}

      {(customOpen || quickId === 'custom') && (
        <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-2">
          <button
            type="button"
            onClick={() => setCustomOpen((open) => !open)}
            className="mb-2 flex w-full items-center justify-between text-xs font-medium text-violet-700"
          >
            Custom expression
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${customOpen ? 'rotate-180' : ''}`} />
          </button>
          {customOpen && (
            <FilterSideInput
              side="left"
              expr={expr}
              onChange={(next) => {
                const isPlainField = next.kind === 'field' && next.field === columnKey;
                setForceCustom(!isPlainField && detectQuickColumnTransform(isPlainField ? null : next, columnKey) === 'custom');
                onChange(isPlainField ? null : next);
              }}
              fields={filterFields}
              defaultField={columnKey}
            />
          )}
        </div>
      )}
    </div>
  );
}
