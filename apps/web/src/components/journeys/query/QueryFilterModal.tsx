import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Filter,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { SchemaFilterEditor } from '@/components/schemas/SchemaFilterEditor';
import { buildQuerySummary } from '@/lib/query-activity';
import {
  createFilterRoot,
  formatFilterRoot,
  type FilterOperator,
  type FilterRoot,
  type SchemaFilterField,
} from '@/lib/schema-filters';

type Props = {
  open: boolean;
  fields: SchemaFilterField[];
  filterRoot: FilterRoot;
  quickSearch: string;
  sampleRow?: Record<string, unknown>;
  onClose: () => void;
  onSave: (filter: FilterRoot, quickSearch: string, summaryLabel: string) => void;
};

const PRESETS = [
  {
    name: 'All Active Profiles',
    field: 'status',
    op: 'equals',
    val: 'active',
  },
  {
    name: 'High Value Customers',
    field: 'total_spent',
    op: 'greater_than_or_equal',
    val: '500',
  },
  {
    name: 'Has Valid Email',
    field: 'email',
    op: 'is_not_null',
    val: '',
  },
];

export function QueryFilterModal({
  open,
  fields,
  filterRoot,
  quickSearch,
  sampleRow,
  onClose,
  onSave,
}: Props) {
  const [draftRoot, setDraftRoot] = useState(filterRoot);
  const [draftSearch, setDraftSearch] = useState(quickSearch);

  useEffect(() => {
    if (!open) return;
    setDraftRoot(filterRoot);
    setDraftSearch(quickSearch);
  }, [open, filterRoot, quickSearch]);

  const summary = useMemo(
    () => buildQuerySummary(draftRoot, draftSearch, fields),
    [draftRoot, draftSearch, fields],
  );

  const filterPreview = formatFilterRoot(draftRoot, fields);
  // TD-11: filter groups hold `children` now (the old `conditions` read always gave 0).
  const conditionsCount = draftRoot.children?.length || 0;

  if (!open) return null;

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    // TD-11: used the old filter shape (prev.conditions / field.name) and crashed.
    const targetField = fields.find((f) => f.key === preset.field || f.label.toLowerCase().includes(preset.field));
    if (!targetField) return;

    setDraftRoot((prev) => ({
      ...prev,
      children: [
        ...(prev.children ?? []),
        {
          type: 'condition',
          id: `cond_${Date.now()}`,
          join: 'and',
          left: { kind: 'field', field: targetField.key },
          operator: preset.op as FilterOperator,
          right: { kind: 'literal', value: String(preset.val ?? '') },
        },
      ],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 shadow-2xs">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900">Visual Rule & Target Filter</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {conditionsCount} rule{conditionsCount === 1 ? '' : 's'} defined
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Construct expressive AND/OR logic to segment and filter audience records in real-time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Quick Presets Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              Quick Presets:
            </span>
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-800 transition"
              >
                + {preset.name}
              </button>
            ))}
          </div>

          {/* Rule Filter Editor Container */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-brand-600" />
                Audience Filter Conditions
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {fields.length} attributes available
              </span>
            </div>

            <div className="p-5">
              <SchemaFilterEditor
                fields={fields}
                root={draftRoot}
                onChange={setDraftRoot}
                quickSearch={draftSearch}
                onQuickSearchChange={setDraftSearch}
                layout="sidebar"
                sampleRow={sampleRow}
              />
            </div>
          </div>

          {/* Live Query Summary Banner */}
          {filterPreview && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-brand-900">
                <CheckCircle2 className="h-4 w-4 text-brand-600" />
                <span>Generated Filter Formula:</span>
              </div>
              <p className="font-mono text-[11px] text-brand-950 font-semibold bg-white/70 p-2.5 rounded-xl border border-brand-200/60">
                {filterPreview}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              setDraftRoot(createFilterRoot());
              setDraftSearch('');
            }}
            className="text-xs font-bold text-slate-500 hover:text-slate-800"
          >
            Clear all rules
          </button>

          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-xs"
              onClick={() => {
                onSave(draftRoot, draftSearch, summary);
                onClose();
              }}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Apply Rules & Save Filter
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
