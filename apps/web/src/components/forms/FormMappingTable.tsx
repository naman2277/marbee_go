import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Circle, Wand2, Search } from 'lucide-react';
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
import { getMatchConfidence, type SchemaMappingOption } from '@/lib/form-mapping';

type Draft = {
  schema_field: string;
  transform: FormFieldTransform;
  type_cast: FormFieldTypeCast;
};

type RowProps = {
  field: FormField;
  mapping: FormFieldMapping | undefined;
  allMappings: FormFieldMapping[];
  columnOptions: string[];
  schemas: SchemaMappingOption[];
  storageTarget: 'customer' | 'schema';
  schemaSlug?: string;
  destinationLabel: string;
  onApply: (row: FormFieldMapping) => void;
  onClear: () => void;
};

function emptyDraft(): Draft {
  return { schema_field: '', transform: 'none', type_cast: 'none' };
}

function draftFromMapping(mapping: FormFieldMapping | undefined): Draft {
  if (!mapping?.schema_field) return emptyDraft();
  return {
    schema_field: mapping.schema_field,
    transform: mapping.transform ?? 'none',
    type_cast: mapping.type_cast ?? 'none',
  };
}

function MappingRow({
  field,
  mapping,
  allMappings,
  columnOptions,
  schemas,
  storageTarget,
  schemaSlug,
  destinationLabel,
  onApply,
  onClear,
}: RowProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFromMapping(mapping));

  useEffect(() => {
    setDraft(draftFromMapping(mapping));
  }, [mapping?.schema_field, mapping?.transform, mapping?.type_cast, field.name]);

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

  const meta = draft.schema_field
    ? getSchemaFieldMeta(schemas, storageTarget, schemaSlug, draft.schema_field)
    : null;
  const castOptions = allowedTypeCasts(
    formTypeFamily(field.field_type),
    schemaTypeFamily(meta?.field_type),
  );

  const matchMeta = getMatchConfidence(field, draft.schema_field);

  const valid = savedValidation.valid;
  const configured = savedValidation.configured;
  const dirty =
    draft.schema_field !== (mapping?.schema_field ?? '') ||
    draft.transform !== (mapping?.transform ?? 'none') ||
    draft.type_cast !== (mapping?.type_cast ?? 'none');

  const statusIcon = valid ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  ) : configured ? (
    <AlertCircle className="h-4 w-4 text-amber-500" />
  ) : (
    <Circle className="h-4 w-4 text-slate-300" />
  );

  const issue = draftValidation.issues.find((i) => i.severity === 'error');

  return (
    <tr className="border-b border-slate-100 align-top transition-colors hover:bg-slate-50/70">
      <td className="px-4 py-3.5">{statusIcon}</td>
      <td className="px-4 py-3.5">
        <p className="text-sm font-semibold text-slate-900">{field.label}</p>
        <p className="font-mono text-xs text-slate-400">{field.name}</p>
        <Badge variant="default" className="mt-1 text-[10px] uppercase">
          {field.field_type}
        </Badge>
      </td>
      <td className="hidden px-2 py-3.5 text-slate-300 sm:table-cell">
        <ArrowRight className="mx-auto h-4 w-4" />
      </td>
      <td className="px-4 py-3.5">
        <select
          value={draft.transform}
          onChange={(e) => {
            const nextT = e.target.value as FormFieldTransform;
            setDraft((d) => ({ ...d, transform: nextT }));
            if (draft.schema_field) {
              onApply({ form_field: field.name, schema_field: draft.schema_field, transform: nextT, type_cast: draft.type_cast });
            }
          }}
          className="w-full min-w-[120px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none"
        >
          {TRANSFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3.5">
        <select
          value={draft.type_cast}
          onChange={(e) => {
            const nextC = e.target.value as FormFieldTypeCast;
            setDraft((d) => ({ ...d, type_cast: nextC }));
            if (draft.schema_field) {
              onApply({ form_field: field.name, schema_field: draft.schema_field, transform: draft.transform, type_cast: nextC });
            }
          }}
          className="w-full min-w-[120px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none"
        >
          {castOptions.map((c) => (
            <option key={c} value={c}>
              {TYPE_CAST_LABELS[c]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3.5 space-y-1">
        <div className="flex items-center gap-2">
          <select
            value={draft.schema_field}
            onChange={(e) => {
              const col = e.target.value;
              setDraft((d) => ({ ...d, schema_field: col }));
              if (col) {
                onApply({ form_field: field.name, schema_field: col, transform: draft.transform, type_cast: draft.type_cast });
              } else {
                onClear();
              }
            }}
            className="w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
            disabled={columnOptions.length === 0}
          >
            <option value="">Select column…</option>
            {columnOptions.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>

          {draft.schema_field && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                matchMeta.confidence === 'exact'
                  ? 'bg-emerald-100 text-emerald-800'
                  : matchMeta.confidence === 'high'
                  ? 'bg-blue-100 text-blue-800'
                  : matchMeta.confidence === 'medium'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-purple-100 text-purple-800'
              }`}
            >
              {matchMeta.label}
            </span>
          )}
        </div>

        {meta && (
          <p className="text-[10px] text-slate-400">
            {destinationLabel} · {schemaTypeFamily(meta.field_type)}
          </p>
        )}
        {issue && <p className="text-xs text-amber-700 font-medium">{issue.message}</p>}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={() => draft.schema_field && onApply(draftMapping)}
            disabled={!draft.schema_field || !draftValidation.valid || !dirty}
            className="text-xs"
          >
            {configured ? 'Update' : 'Apply'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(emptyDraft());
              onClear();
            }}
            className="text-xs text-slate-500 hover:text-red-600"
          >
            Clear
          </Button>
        </div>
      </td>
    </tr>
  );
}

type TableProps = {
  fields: FormField[];
  mappings: FormFieldMapping[];
  columnOptions: string[];
  schemas: SchemaMappingOption[];
  storageTarget: 'customer' | 'schema';
  schemaSlug?: string;
  onApply: (row: FormFieldMapping) => void;
  onClear: (fieldName: string) => void;
  onAutoMapAll?: () => void;
};

export function FormMappingTable({
  fields = [],
  mappings = [],
  columnOptions = [],
  schemas = [],
  storageTarget = 'customer',
  schemaSlug,
  onApply,
  onClear,
  onAutoMapAll,
}: TableProps) {
  const [filter, setFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [search, setSearch] = useState('');

  const destinationLabel = storageTarget === 'customer' ? 'Customer 360' : (schemaSlug ?? 'Schema');

  const safeFields = fields ?? [];
  const safeMappings = mappings ?? [];

  const getMapping = (name: string) => safeMappings.find((m) => m && m.form_field === name);

  const filteredFields = safeFields.filter((field) => {
    if (!field || !field.name) return false;
    const m = getMapping(field.name);
    const isMapped = Boolean(m?.schema_field);
    if (filter === 'mapped' && !isMapped) return false;
    if (filter === 'unmapped' && isMapped) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (field.label ?? '').toLowerCase().includes(q) ||
        (field.name ?? '').toLowerCase().includes(q) ||
        (m?.schema_field ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (fields.length === 0) {
    return <p className="p-6 text-sm text-slate-500">No fields detected. Save your HTML on the My Form tab first.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Search & Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search form fields…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-1 text-xs text-slate-800 focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
            {(['all', 'mapped', 'unmapped'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={`rounded px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                  filter === mode ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {onAutoMapAll && (
          <Button size="sm" variant="secondary" onClick={onAutoMapAll} className="gap-1.5 text-xs font-medium">
            <Wand2 className="h-3.5 w-3.5 text-brand-600" />
            Auto-Map Fields
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3">Form field</th>
              <th className="hidden w-10 px-2 py-3 sm:table-cell" />
              <th className="px-4 py-3">Transform</th>
              <th className="px-4 py-3">Type cast</th>
              <th className="px-4 py-3">{destinationLabel} column</th>
              <th className="w-32 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFields.map((field) => (
              <MappingRow
                key={field.id}
                field={field}
                mapping={getMapping(field.name)}
                allMappings={mappings}
                columnOptions={columnOptions}
                schemas={schemas}
                storageTarget={storageTarget}
                schemaSlug={schemaSlug}
                destinationLabel={destinationLabel}
                onApply={onApply}
                onClear={() => onClear(field.name)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
