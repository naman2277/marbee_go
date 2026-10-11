import { useEffect, useRef, useState } from 'react';
import { Database, Link2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { FormField, FormSchemaMapping } from '@/lib/forms';
import {
  customerSchemaFields,
  customSchemaOptions,
  getFieldMapping,
  getStorageTarget,
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
  anchorRect: DOMRect | null;
  onClose: () => void;
  onSave: (next: FormSchemaMapping) => void;
  saving?: boolean;
};

export function FormFieldMappingPopover({
  field,
  mapping = {},
  schemas = [],
  formFields = [],
  anchorRect,
  onClose,
  onSave,
  saving,
}: Props) {
  if (!field) return null;

  const popoverRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!columnOptions.includes(column) && columnOptions.length) {
      setColumn(columnOptions.includes(suggestTargetColumn(field)) ? suggestTargetColumn(field) : columnOptions[0]);
    }
  }, [target, schemaSlug, columnOptions, column, field]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const handleSave = () => {
    const rest = (mapping.field_mappings ?? []).filter((m) => m.form_field !== field.name);
    const nextMappings = column
      ? [...rest, { form_field: field.name, schema_field: column }]
      : rest;

    onSave({
      ...mapping,
      storage_target: target,
      target_schema_slug: target === 'schema' ? schemaSlug || undefined : undefined,
      upsert_customer: target === 'customer' ? true : linkCustomer,
      field_mappings: nextMappings,
      customer_match_key: matchKey,
      customer_email_field: emailField || undefined,
      customer_mobile_field: mobileField || undefined,
    });
  };

  const handleClear = () => {
    const rest = (mapping.field_mappings ?? []).filter((m) => m.form_field !== field.name);
    onSave({ ...mapping, field_mappings: rest });
  };

  const top = anchorRect ? Math.min(anchorRect.bottom + 8, window.innerHeight - 420) : 80;
  const left = anchorRect ? Math.min(anchorRect.left, window.innerWidth - 340) : 80;

  return (
    <div
      ref={popoverRef}
      className="fixed z-[100] w-[min(320px,calc(100vw-24px))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      style={{ top, left }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Map field</p>
          <p className="text-xs text-slate-500">
            {field.label} <span className="font-mono text-slate-400">({field.name})</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">Store in</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTarget('customer')}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                target === 'customer'
                  ? 'border-brand-300 bg-brand-50 text-brand-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              Customer 360
            </button>
            <button
              type="button"
              onClick={() => setTarget('schema')}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                target === 'schema'
                  ? 'border-brand-300 bg-brand-50 text-brand-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Database className="h-3.5 w-3.5 shrink-0" />
              Custom table
            </button>
          </div>
        </div>

        {target === 'schema' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Schema table</label>
            <select
              value={schemaSlug}
              onChange={(e) => setSchemaSlug(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
            >
              {customSchemas.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Table column</label>
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm"
          >
            {columnOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {target === 'schema' && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={linkCustomer}
                onChange={(e) => setLinkCustomer(e.target.checked)}
              />
              <Link2 className="h-3.5 w-3.5 text-slate-500" />
              Link submission to Customer 360
            </label>
            {linkCustomer && (
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">Match existing customer by</label>
                  <select
                    value={matchKey}
                    onChange={(e) => setMatchKey(e.target.value as CustomerMatchKey)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="email">Email only</option>
                    <option value="mobile">Mobile only</option>
                    <option value="email_or_mobile">Email, else mobile</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">Email field</label>
                  <select
                    value={emailField}
                    onChange={(e) => setEmailField(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
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
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">Mobile field</label>
                  <select
                    value={mobileField}
                    onChange={(e) => setMobileField(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
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
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={handleClear} className="text-xs text-red-500 hover:underline">
          Clear mapping
        </button>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
