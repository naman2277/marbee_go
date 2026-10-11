import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import type { FormField, FormFieldMapping, FormFieldTransform, FormFieldTypeCast } from '@/lib/forms';
import {
  TRANSFORM_OPTIONS,
  TYPE_CAST_LABELS,
  allowedTypeCasts,
  formTypeFamily,
  getSchemaFieldMeta,
  schemaTypeFamily,
  validateFieldMapping,
} from '@/lib/form-field-mapping-rules';
import type { SchemaMappingOption } from '@/lib/form-mapping';
import { suggestTargetColumn } from '@/lib/form-mapping';

type Draft = {
  schema_field: string;
  transform: FormFieldTransform;
  type_cast: FormFieldTypeCast;
};

type Props = {
  field: FormField;
  mapping: FormFieldMapping | undefined;
  allMappings: FormFieldMapping[];
  columnOptions: string[];
  schemas: SchemaMappingOption[];
  storageTarget: 'customer' | 'schema';
  schemaSlug?: string;
  open: boolean;
  onToggle: () => void;
  onApply: (row: FormFieldMapping) => void;
  onClear: () => void;
  onApplyAndNext?: () => void;
};

function defaultColumn(field: FormField, options: string[]): string {
  const suggested = suggestTargetColumn(field, options);
  if (options.includes(suggested)) return suggested;
  return options[0] ?? '';
}

function draftFromMapping(field: FormField, mapping: FormFieldMapping | undefined, options: string[]): Draft {
  return {
    schema_field: mapping?.schema_field || defaultColumn(field, options),
    transform: mapping?.transform ?? 'none',
    type_cast: mapping?.type_cast ?? 'none',
  };
}

export function FormFieldMappingRow({
  field,
  mapping,
  allMappings,
  columnOptions,
  schemas,
  storageTarget,
  schemaSlug,
  open,
  onToggle,
  onApply,
  onClear,
  onApplyAndNext,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFromMapping(field, mapping, columnOptions));

  useEffect(() => {
    if (open) {
      setDraft(draftFromMapping(field, mapping, columnOptions));
    }
  }, [open, field.name, mapping, columnOptions, field, columnOptions.length]);

  const savedValidation = validateFieldMapping({
    field,
    mapping,
    allMappings,
    columnOptions,
    schemas,
    storageTarget,
    schemaSlug,
  });

  const draftMapping: FormFieldMapping = useMemo(
    () => ({
      form_field: field.name,
      schema_field: draft.schema_field,
      transform: draft.transform,
      type_cast: draft.type_cast,
    }),
    [field.name, draft],
  );

  const draftValidation = validateFieldMapping({
    field,
    mapping: draft.schema_field ? draftMapping : undefined,
    allMappings: [
      ...(allMappings ?? []).filter((m) => m.form_field !== field.name),
      ...(draft.schema_field ? [draftMapping] : []),
    ],
    columnOptions,
    schemas,
    storageTarget,
    schemaSlug,
  });

  const meta = getSchemaFieldMeta(schemas, storageTarget, schemaSlug, draft.schema_field);
  const sourceFamily = formTypeFamily(field.field_type);
  const targetFamily = schemaTypeFamily(meta?.field_type);
  const castOptions = allowedTypeCasts(sourceFamily, targetFamily);

  const valid = savedValidation.valid;
  const statusIcon = valid ? (
    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
  ) : savedValidation.configured ? (
    <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
  ) : (
    <Circle className="h-5 w-5 shrink-0 text-slate-300" />
  );

  const handleApply = () => {
    if (!draft.schema_field) return;
    onApply(draftMapping);
    onApplyAndNext?.();
  };

  const handleClear = () => {
    setDraft({ schema_field: defaultColumn(field, columnOptions), transform: 'none', type_cast: 'none' });
    onClear();
  };

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80"
      >
        {statusIcon}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{field.label}</p>
          <p className="font-mono text-xs text-slate-400">{field.name}</p>
        </div>
        {valid && mapping?.schema_field && (
          <span className="hidden text-xs font-medium text-emerald-600 sm:inline">
            → {mapping.schema_field}
          </span>
        )}
        <Badge variant="default">{field.field_type}</Badge>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
          {columnOptions.length === 0 && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              No columns available. Select a storage destination above first.
            </div>
          )}

          {draftValidation.issues.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {draftValidation.issues.map((issue, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Form field</label>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="font-mono text-sm text-slate-800">{field.name}</p>
                <p className="text-[10px] text-slate-400">{field.field_type} · {sourceFamily}</p>
              </div>
            </div>

            <div className="hidden items-center justify-center pb-2 text-slate-300 sm:flex">
              <ArrowRight className="h-4 w-4" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Transform</label>
              <select
                value={draft.transform}
                onChange={(e) => setDraft((d) => ({ ...d, transform: e.target.value as FormFieldTransform }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {TRANSFORM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Type cast</label>
              <select
                value={draft.type_cast}
                onChange={(e) => setDraft((d) => ({ ...d, type_cast: e.target.value as FormFieldTypeCast }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {castOptions.map((c) => (
                  <option key={c} value={c}>{TYPE_CAST_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {storageTarget === 'customer' ? 'Customer 360 column' : `${schemaSlug ?? 'Schema'} column`}
              </label>
              <select
                value={draft.schema_field}
                onChange={(e) => setDraft((d) => ({ ...d, schema_field: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                disabled={columnOptions.length === 0}
              >
                {columnOptions.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              {meta && <p className="mt-1 text-[10px] text-slate-400">Target type: {targetFamily}</p>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={!draft.schema_field || !draftValidation.valid}
            >
              {savedValidation.valid ? 'Update mapping' : 'Apply mapping'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
