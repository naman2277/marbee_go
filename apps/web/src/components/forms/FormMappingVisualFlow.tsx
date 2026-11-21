import { useState, useEffect } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, Circle, Wand2 } from 'lucide-react';
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

type Props = {
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

export function FormMappingVisualFlow({
  fields = [],
  mappings = [],
  columnOptions = [],
  schemas = [],
  storageTarget = 'customer',
  schemaSlug,
  onApply,
  onClear,
  onAutoMapAll,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [search, setSearch] = useState('');

  const destinationTitle = storageTarget === 'customer' ? 'Customer 360' : (schemaSlug ?? 'Custom Schema');

  const safeFields = fields ?? [];
  const safeMappings = mappings ?? [];

  const getMapping = (fieldName: string) => safeMappings.find((m) => m && m.form_field === fieldName);

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

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <input
              type="text"
              placeholder="Search fields or columns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 shadow-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['all', 'mapped', 'unmapped'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                  filter === mode
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
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
            Auto-Map Unmapped Fields
          </Button>
        )}
      </div>

      {filteredFields.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No matching fields found for filter: <span className="font-medium">{filter}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFields.map((field) => {
            const currentMapping = getMapping(field.name);
            return (
              <VisualMappingCard
                key={field.id}
                field={field}
                mapping={currentMapping}
                allMappings={mappings}
                columnOptions={columnOptions}
                schemas={schemas}
                storageTarget={storageTarget}
                schemaSlug={schemaSlug}
                destinationTitle={destinationTitle}
                onApply={onApply}
                onClear={() => onClear(field.name)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

type CardProps = {
  field: FormField;
  mapping: FormFieldMapping | undefined;
  allMappings: FormFieldMapping[];
  columnOptions: string[];
  schemas: SchemaMappingOption[];
  storageTarget: 'customer' | 'schema';
  schemaSlug?: string;
  destinationTitle: string;
  onApply: (row: FormFieldMapping) => void;
  onClear: () => void;
};

function VisualMappingCard({
  field,
  mapping,
  allMappings,
  columnOptions,
  schemas,
  storageTarget,
  schemaSlug,
  destinationTitle,
  onApply,
  onClear,
}: CardProps) {
  const [targetCol, setTargetCol] = useState(mapping?.schema_field ?? '');
  const [transform, setTransform] = useState<FormFieldTransform>(mapping?.transform ?? 'none');
  const [typeCast, setTypeCast] = useState<FormFieldTypeCast>(mapping?.type_cast ?? 'none');

  useEffect(() => {
    setTargetCol(mapping?.schema_field ?? '');
    setTransform(mapping?.transform ?? 'none');
    setTypeCast(mapping?.type_cast ?? 'none');
  }, [mapping?.schema_field, mapping?.transform, mapping?.type_cast, field.name]);

  const isMapped = Boolean(targetCol);

  const draftMapping: FormFieldMapping = {
    form_field: field.name,
    schema_field: targetCol,
    transform,
    type_cast: typeCast,
  };

  const validation = validateFieldMapping({
    field,
    mapping: targetCol ? draftMapping : undefined,
    allMappings: [
      ...allMappings.filter((m) => m.form_field !== field.name),
      ...(targetCol ? [draftMapping] : []),
    ],
    columnOptions,
    schemas,
    storageTarget,
    schemaSlug,
  });

  const matchMeta = getMatchConfidence(field, targetCol);
  const schemaMeta = targetCol ? getSchemaFieldMeta(schemas, storageTarget, schemaSlug, targetCol) : null;
  const castOptions = allowedTypeCasts(
    formTypeFamily(field.field_type),
    schemaTypeFamily(schemaMeta?.field_type),
  );


  const handleSave = () => {
    if (targetCol) {
      onApply(draftMapping);
    }
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all duration-200 ${
        isMapped
          ? validation.valid
            ? 'border-emerald-200/80 bg-gradient-to-r from-emerald-50/30 via-white to-slate-50/30 shadow-sm hover:border-emerald-300'
            : 'border-amber-200 bg-amber-50/30 shadow-sm hover:border-amber-300'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="grid gap-4 p-4 md:grid-cols-12 md:items-center">
        {/* Left: Form Field Node */}
        <div className="space-y-1 md:col-span-4">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                isMapped && validation.valid
                  ? 'bg-emerald-100 text-emerald-700'
                  : isMapped
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {isMapped && validation.valid ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isMapped ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Circle className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="font-semibold text-slate-900 text-sm">{field.label}</span>
          </div>
          <div className="flex items-center gap-2 pl-8 text-xs text-slate-500">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
              {field.name}
            </code>
            <Badge variant="default" className="text-[10px] uppercase tracking-wider">
              {field.field_type}
            </Badge>
          </div>
        </div>

        {/* Middle: Transform Connector & Type Cast */}
        <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50/80 p-2 text-xs md:col-span-4">
          <div className="flex flex-col gap-1 w-full max-w-[170px]">
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Transform</label>
            <select
              value={transform}
              onChange={(e) => {
                const nextT = e.target.value as FormFieldTransform;
                setTransform(nextT);
                if (targetCol) {
                  onApply({ form_field: field.name, schema_field: targetCol, transform: nextT, type_cast: typeCast });
                }
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
            >
              {TRANSFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />

          <div className="flex flex-col gap-1 w-full max-w-[150px]">
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Type Cast</label>
            <select
              value={typeCast}
              onChange={(e) => {
                const nextC = e.target.value as FormFieldTypeCast;
                setTypeCast(nextC);
                if (targetCol) {
                  onApply({ form_field: field.name, schema_field: targetCol, transform, type_cast: nextC });
                }
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
            >
              {castOptions.map((c) => (
                <option key={c} value={c}>
                  {TYPE_CAST_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Target Schema Column & Action */}
        <div className="space-y-1.5 md:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {destinationTitle} Column
            </span>
            {isMapped && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
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

          <div className="flex items-center gap-2">
            <select
              value={targetCol}
              onChange={(e) => {
                const col = e.target.value;
                setTargetCol(col);
                if (col) {
                  onApply({ form_field: field.name, schema_field: col, transform, type_cast: typeCast });
                } else {
                  onClear();
                }
              }}
              className={`w-full rounded-lg border px-3 py-1.5 font-mono text-xs focus:outline-none ${
                targetCol
                  ? 'border-emerald-300 bg-white text-slate-900 font-semibold'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              <option value="">Select column…</option>
              {columnOptions.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>

            {isMapped ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTargetCol('');
                  onClear();
                }}
                className="shrink-0 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                Clear
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!targetCol}
                className="shrink-0 text-xs"
              >
                Apply
              </Button>
            )}
          </div>

          {validation.issues.length > 0 && targetCol && (
            <p className="text-[11px] text-amber-700 font-medium">
              {validation.issues[0]?.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
