import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Columns3, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { ColumnTransformEditor } from '@/components/schemas/ColumnTransformEditor';
import { createColumnSpec, type DataColumnSpec } from '@/lib/schema-data';
import { normalizeColumnList } from '@/lib/schema-explorer-columns';
import type { ExprNode } from '@/lib/schema-expressions';
import type { SchemaFilterField } from '@/lib/schema-filters';

type AvailableField = { key: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  availableFields: AvailableField[];
  currentColumns: DataColumnSpec[];
  filterFields: SchemaFilterField[];
  schemaFields?: Array<{ name: string; description?: string | null }>;
  sampleRow?: Record<string, unknown>;
  onApply: (columns: DataColumnSpec[]) => void;
  onReset: () => void;
};

export function SchemaColumnPickerModal({
  open,
  onClose,
  availableFields,
  currentColumns,
  filterFields,
  schemaFields,
  sampleRow,
  onApply,
  onReset,
}: Props) {
  const [draft, setDraft] = useState<DataColumnSpec[]>(currentColumns);

  useEffect(() => {
    if (open) setDraft(currentColumns.map((c) => ({ ...c })));
  }, [open, currentColumns]);

  const selectedKeys = useMemo(() => new Set(draft.map((c) => c.key)), [draft]);
  const pool = availableFields.filter((f) => !selectedKeys.has(f.key));

  const addColumn = (key: string) => {
    if (selectedKeys.has(key)) return;
    setDraft((prev) => [...prev, createColumnSpec(key, schemaFields)]);
  };

  const removeColumn = (key: string) => {
    setDraft((prev) => prev.filter((c) => c.key !== key));
  };

  const setTransform = (key: string, transform: ExprNode | null) => {
    setDraft((prev) => prev.map((c) => (c.key === key ? { ...c, transform } : c)));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Columns3 className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-slate-900">Customize columns</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Double-click a column on the left to add it. Pick a transform to preview the result on a sample row.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-h-0 flex-col border-b border-slate-100 md:border-b-0 md:border-r">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available</p>
              <p className="text-xs text-slate-400">{pool.length} columns</p>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {pool.length ? (
                pool.map((field) => (
                  <li key={field.key}>
                    <button
                      type="button"
                      onDoubleClick={() => addColumn(field.key)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                      title="Double-click to add"
                    >
                      <span className="font-medium">{field.label}</span>
                      <span className="font-mono text-xs text-slate-400">{field.key}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-8 text-center text-sm text-slate-400">All columns are selected</li>
              )}
            </ul>
          </div>

          <div className="hidden items-center justify-center px-2 md:flex">
            <ArrowRight className="h-5 w-5 text-slate-300" />
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visible</p>
              <p className="text-xs text-slate-400">{draft.length} columns</p>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {draft.length ? (
                draft.map((col) => (
                  <li key={col.key} className="mb-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="mb-2 flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{col.label}</p>
                        <p className="font-mono text-xs text-slate-400">{col.key}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeColumn(col.key)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        title="Remove column"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <ColumnTransformEditor
                      columnKey={col.key}
                      transform={col.transform}
                      onChange={(next) => setTransform(col.key, next)}
                      filterFields={filterFields}
                      sampleRow={sampleRow}
                    />
                  </li>
                ))
              ) : (
                <li className="px-3 py-8 text-center text-sm text-slate-400">
                  Double-click columns on the left to build your view
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset to default
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draft.length}
              onClick={() => {
                onApply(normalizeColumnList(draft));
                onClose();
              }}
            >
              Apply columns
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
