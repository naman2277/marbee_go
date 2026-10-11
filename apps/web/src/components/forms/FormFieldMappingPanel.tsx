import { useEffect, useState } from 'react';
import { Database, Link2 } from 'lucide-react';
import { Button } from '@/components/ui';
import type { FormField, FormSchemaMapping } from '@/lib/forms';
import {
  customerSchemaFields,
  customSchemaOptions,
  getFieldMapping,
  getFieldMappingLabel,
  getMatchConfidence,
  getStorageTarget,
  isFieldMapped,
  schemaFieldNames,
  suggestTargetColumn,
  type CustomerMatchKey,
  type SchemaMappingOption,
} from '@/lib/form-mapping';

type Props = {
  field: FormField;
  mapping: FormSchemaMapping;
  schemas: SchemaMappingOption[];
  formFields: FormField[];
  onSave: (next: FormSchemaMapping) => void;
  saving?: boolean;
  compact?: boolean;
};

export function FormFieldMappingPanel({
  field,
  mapping = {},
  schemas = [],
  formFields = [],
  onSave,
  saving,
  compact,
}: Props) {
  if (!field) {
    return <p className="p-4 text-xs text-slate-500">Select a field to configure its mapping.</p>;
  }

  const safeFormFields = formFields ?? [];
  const safeSchemas = schemas ?? [];
  const storageTarget = getStorageTarget(mapping);
  const existing = getFieldMapping(mapping, field.name);
  const customSchemas = customSchemaOptions(safeSchemas);
  const customerFields = customerSchemaFields(safeSchemas);

  const [target, setTarget] = useState<'customer' | 'schema'>(storageTarget);
  const [schemaSlug, setSchemaSlug] = useState(
    mapping?.target_schema_slug ?? customSchemas[0]?.slug ?? '',
  );
  const [column, setColumn] = useState(existing?.schema_field ?? suggestTargetColumn(field));
  const [linkCustomer, setLinkCustomer] = useState(mapping?.upsert_customer ?? false);
  const [matchKey, setMatchKey] = useState<CustomerMatchKey>(
    mapping?.customer_match_key ?? 'email_or_mobile',
  );
  const [emailField, setEmailField] = useState(
    mapping?.customer_email_field ?? safeFormFields.find((f) => f?.field_type === 'email')?.name ?? '',
  );
  const [mobileField, setMobileField] = useState(
    mapping?.customer_mobile_field ?? safeFormFields.find((f) => f?.field_type === 'phone')?.name ?? '',
  );

  const columnOptions = target === 'customer' ? customerFields : schemaFieldNames(schemas, schemaSlug);
  const mapped = isFieldMapped(mapping, field.name);
  const mappingLabel = getFieldMappingLabel(mapping, field.name);

  useEffect(() => {
    setTarget(getStorageTarget(mapping));
    setSchemaSlug(mapping.target_schema_slug ?? customSchemas[0]?.slug ?? '');
    const row = getFieldMapping(mapping, field.name);
    setColumn(row?.schema_field ?? suggestTargetColumn(field));
    setLinkCustomer(mapping.upsert_customer ?? false);
    setMatchKey(mapping.customer_match_key ?? 'email_or_mobile');
    setEmailField(
      mapping.customer_email_field ?? formFields.find((f) => f.field_type === 'email')?.name ?? '',
    );
    setMobileField(
      mapping.customer_mobile_field ?? formFields.find((f) => f.field_type === 'phone')?.name ?? '',
    );
  }, [field.id, field.name, mapping, customSchemas, formFields]);

  useEffect(() => {
    if (!columnOptions.includes(column) && columnOptions.length) {
      setColumn(
        columnOptions.includes(suggestTargetColumn(field))
          ? suggestTargetColumn(field)
          : columnOptions[0],
      );
    }
  }, [target, schemaSlug, columnOptions, column, field]);

  const buildNext = (clearColumn = false): FormSchemaMapping => {
    const rest = (mapping.field_mappings ?? []).filter((m) => m.form_field !== field.name);
    const nextMappings =
      !clearColumn && column
        ? [...rest, { form_field: field.name, schema_field: column }]
        : rest;

    return {
      ...mapping,
      storage_target: target,
      target_schema_slug: target === 'schema' ? schemaSlug || undefined : undefined,
      upsert_customer: target === 'customer' ? true : linkCustomer,
      field_mappings: nextMappings,
      customer_match_key: matchKey,
      customer_email_field: emailField || undefined,
      customer_mobile_field: mobileField || undefined,
    };
  };

  const handleSave = () => onSave(buildNext());
  const handleClear = () => onSave(buildNext(true));

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {mapped && mappingLabel && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span>
            Mapped to <span className="font-medium">{mappingLabel}</span>
          </span>
          {existing?.schema_field && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
              {getMatchConfidence(field, existing.schema_field).label}
            </span>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">Store responses in</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTarget('customer')}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
              target === 'customer'
                ? 'border-brand-400 bg-brand-50 text-brand-800 font-medium'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Database className="h-4 w-4 shrink-0" />
            Customer 360
          </button>
          <button
            type="button"
            onClick={() => setTarget('schema')}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
              target === 'schema'
                ? 'border-brand-400 bg-brand-50 text-brand-800 font-medium'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Database className="h-4 w-4 shrink-0" />
            Custom table
          </button>
        </div>
      </div>

      {target === 'schema' && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">Schema table</label>
          <select
            value={schemaSlug}
            onChange={(e) => setSchemaSlug(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {customSchemas.length === 0 && <option value="">No published schemas</option>}
            {customSchemas.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-slate-600">Table column</label>
          {column && (
            <span className="text-[10px] text-slate-400">
              {getMatchConfidence(field, column).label}
            </span>
          )}
        </div>
        <select
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
        >
          {columnOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {target === 'schema' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={linkCustomer}
              onChange={(e) => setLinkCustomer(e.target.checked)}
            />
            <Link2 className="h-4 w-4 text-slate-500" />
            Link to Customer 360
          </label>
          {linkCustomer && (
            <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Match existing customer by
                </label>
                <select
                  value={matchKey}
                  onChange={(e) => setMatchKey(e.target.value as CustomerMatchKey)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="email">Email only</option>
                  <option value="mobile">Mobile only</option>
                  <option value="email_or_mobile">Email, else mobile</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Email field</label>
                <select
                  value={emailField}
                  onChange={(e) => setEmailField(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Auto-detect</option>
                  {formFields.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Mobile field</label>
                <select
                  value={mobileField}
                  onChange={(e) => setMobileField(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Auto-detect</option>
                  {formFields.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {mapped ? (
          <button type="button" onClick={handleClear} className="text-xs text-red-500 hover:underline">
            Clear mapping
          </button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" onClick={handleSave} disabled={saving || !column}>
          {saving ? 'Saving…' : 'Apply mapping'}
        </Button>
      </div>
    </div>
  );
}
