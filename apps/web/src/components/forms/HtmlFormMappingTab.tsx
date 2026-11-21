import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, Info, Link2, Sparkles, LayoutGrid, Table } from 'lucide-react';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { FormMappingTable } from '@/components/forms/FormMappingTable';
import { FormMappingVisualFlow } from '@/components/forms/FormMappingVisualFlow';
import { FormPayloadPreviewDrawer } from '@/components/forms/FormPayloadPreviewDrawer';
import {
  updateForm,
  type FormFieldMapping,
  type FormSchemaMapping,
  type MarbeeForm,
} from '@/lib/forms';
import {
  buildAutoFieldMappings,
  customSchemaOptions,
  customerSchemaFields,
  getFieldMapping,
  getStorageTarget,
  normalizeMapping,
  schemaFieldNames,
  type CustomerMatchKey,
  type SchemaMappingOption,
} from '@/lib/form-mapping';
import { syncFieldsFromHtml } from '@/lib/form-html-fields';
import { validateFieldMapping } from '@/lib/form-field-mapping-rules';

type Props = {
  form: MarbeeForm;
  html: string;
  schemas: SchemaMappingOption[];
  isHtmlMode?: boolean;
  onSaved?: () => void;
  onNext?: () => void;
};

export function HtmlFormMappingTab({ form, html = '', schemas = [], isHtmlMode = true, onSaved, onNext }: Props) {
  const fields = useMemo(
    () => (isHtmlMode ? syncFieldsFromHtml(html ?? '', form?.fields ?? []) : form?.fields ?? []),
    [html, form?.fields, isHtmlMode]
  );
  const customSchemas = useMemo(() => customSchemaOptions(schemas ?? []), [schemas]);

  const [mapping, setMapping] = useState(() => normalizeMapping(form?.schema_mapping));
  const [message, setMessage] = useState('');
  const [viewMode, setViewMode] = useState<'flow' | 'table'>('flow');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [storageTarget, setStorageTarget] = useState<'customer' | 'schema'>(getStorageTarget(mapping));
  const [schemaSlug, setSchemaSlug] = useState(mapping?.target_schema_slug ?? customSchemas[0]?.slug ?? '');
  const [linkCustomer, setLinkCustomer] = useState(mapping?.upsert_customer ?? false);
  const [matchKey, setMatchKey] = useState<CustomerMatchKey>(mapping?.customer_match_key ?? 'email_or_mobile');
  const [emailField, setEmailField] = useState(mapping?.customer_email_field ?? '');
  const [mobileField, setMobileField] = useState(mapping?.customer_mobile_field ?? '');

  useEffect(() => {
    if (form?.schema_mapping) {
      setMapping(normalizeMapping(form.schema_mapping));
      setStorageTarget(getStorageTarget(form.schema_mapping));
      setSchemaSlug(form.schema_mapping.target_schema_slug ?? customSchemas[0]?.slug ?? '');
      setLinkCustomer(form.schema_mapping.upsert_customer ?? false);
    }
  }, [form?.schema_mapping, customSchemas]);

  const columnOptions =
    storageTarget === 'customer' ? customerSchemaFields(schemas ?? []) : schemaFieldNames(schemas ?? [], schemaSlug);

  const mappingCtx = {
    allMappings: mapping.field_mappings ?? [],
    columnOptions,
    schemas,
    storageTarget,
    schemaSlug: storageTarget === 'schema' ? schemaSlug : undefined,
  };

  const validCount = fields.filter((f) => {
    const row = getFieldMapping(mapping, f.name);
    return validateFieldMapping({ ...mappingCtx, field: f, mapping: row }).valid;
  }).length;

  const allMapped = fields.length > 0 && validCount === fields.length;

  const saveMutation = useMutation({
    mutationFn: async (customNextMapping?: FormSchemaMapping) => {
      const targetMapping = customNextMapping ?? {
        ...mapping,
        storage_target: storageTarget,
        target_schema_slug: storageTarget === 'schema' ? schemaSlug || undefined : undefined,
        upsert_customer: storageTarget === 'customer' ? true : linkCustomer,
        customer_match_key: matchKey,
        customer_email_field: emailField || undefined,
        customer_mobile_field: mobileField || undefined,
      };

      const normalized = normalizeMapping(targetMapping);
      const result = await updateForm(form.id, {
        schema_mapping: normalized,
        fields,
      });
      if (result.error) throw new Error(result.error);
      return normalized;
    },
    onSuccess: (normalized) => {
      setMapping(normalized);
      setMessage('✓ Saved to database');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
  });

  const applyFieldMapping = (row: FormFieldMapping) => {
    const rest = (mapping.field_mappings ?? []).filter((m) => m.form_field !== row.form_field);
    const nextMapping: FormSchemaMapping = {
      ...mapping,
      storage_target: storageTarget,
      target_schema_slug: storageTarget === 'schema' ? schemaSlug || undefined : undefined,
      upsert_customer: storageTarget === 'customer' ? true : linkCustomer,
      customer_match_key: matchKey,
      customer_email_field: emailField || undefined,
      customer_mobile_field: mobileField || undefined,
      field_mappings: [...rest, row],
    };
    setMapping(nextMapping);
    saveMutation.mutate(nextMapping);
  };

  const clearFieldMapping = (fieldName: string) => {
    const nextMapping: FormSchemaMapping = {
      ...mapping,
      storage_target: storageTarget,
      target_schema_slug: storageTarget === 'schema' ? schemaSlug || undefined : undefined,
      upsert_customer: storageTarget === 'customer' ? true : linkCustomer,
      customer_match_key: matchKey,
      customer_email_field: emailField || undefined,
      customer_mobile_field: mobileField || undefined,
      field_mappings: (mapping.field_mappings ?? []).filter((m) => m.form_field !== fieldName),
    };
    setMapping(nextMapping);
    saveMutation.mutate(nextMapping);
  };

  const handleAutoMapAll = () => {
    const autoMapped = buildAutoFieldMappings(fields, columnOptions, schemas, storageTarget, schemaSlug);
    const existingMap = new Map((mapping.field_mappings ?? []).map((m) => [m.form_field, m]));
    autoMapped.forEach((m) => {
      if (!existingMap.has(m.form_field)) {
        existingMap.set(m.form_field, m);
      }
    });

    const nextMapping: FormSchemaMapping = {
      ...mapping,
      storage_target: storageTarget,
      target_schema_slug: storageTarget === 'schema' ? schemaSlug || undefined : undefined,
      upsert_customer: storageTarget === 'customer' ? true : linkCustomer,
      customer_match_key: matchKey,
      customer_email_field: emailField || undefined,
      customer_mobile_field: mobileField || undefined,
      field_mappings: Array.from(existingMap.values()),
    };
    setMapping(nextMapping);
    saveMutation.mutate(nextMapping);
  };

  const goNext = () => {
    saveMutation.mutate(undefined, { onSuccess: () => onNext?.() });
  };

  return (
    <div className="space-y-6">
      {/* Information Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <div className="flex-1">
          <p className="font-medium text-slate-900">Map form inputs to database schema columns</p>
          <p className="mt-1 text-slate-600">
            Select your storage target, then use Visual Flow or Data Table view to map inputs. Use AI Auto-Map to instantly match detected fields!
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          className="gap-1.5 shrink-0 text-xs bg-slate-900 text-white hover:bg-slate-800"
        >
          <Sparkles className="h-3.5 w-3.5 text-brand-400" />
          Test Payload Playground
        </Button>
      </div>

      {/* Storage Destination Selection */}
      <Card>
        <CardHeader title="Storage destination" subtitle="Where form responses are written" />
        <div className="space-y-4 border-t border-slate-100 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStorageTarget('customer')}
              className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                storageTarget === 'customer'
                  ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="font-semibold text-slate-900">Customer 360</p>
              <p className="mt-1 text-xs text-slate-500">Upsert customer profiles by email or mobile</p>
            </button>
            <button
              type="button"
              onClick={() => setStorageTarget('schema')}
              className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                storageTarget === 'schema'
                  ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="font-semibold text-slate-900">Custom schema table</p>
              <p className="mt-1 text-xs text-slate-500">Store in a published data schema</p>
            </button>
          </div>

          {storageTarget === 'schema' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Schema / table</label>
                <select
                  value={schemaSlug}
                  onChange={(e) => setSchemaSlug(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {customSchemas.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" checked={linkCustomer} onChange={(e) => setLinkCustomer(e.target.checked)} />
                  <Link2 className="h-4 w-4 text-slate-500" />
                  Link submissions to Customer 360
                </label>
                {linkCustomer && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Match by</label>
                      <select
                        value={matchKey}
                        onChange={(e) => setMatchKey(e.target.value as CustomerMatchKey)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
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
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      >
                        <option value="">Auto-detect</option>
                        {fields.map((f) => (
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
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      >
                        <option value="">Auto-detect</option>
                        {fields.map((f) => (
                          <option key={f.id} value={f.name}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {storageTarget === 'customer' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">Customer match key</p>
              <p className="mt-1 text-xs text-slate-500">
                Used to update an existing profile instead of creating duplicates.
              </p>
              <select
                value={matchKey}
                onChange={(e) => setMatchKey(e.target.value as CustomerMatchKey)}
                className="mt-3 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="email">Email only</option>
                <option value="mobile">Mobile only</option>
                <option value="email_or_mobile">Email, else mobile</option>
              </select>
            </div>
          )}
        </div>
      </Card>

      {/* Field Mapping Section */}
      <Card>
        <CardHeader
          title="Field mapping"
          subtitle={`${validCount} of ${fields.length} configured`}
          action={
            <div className="flex items-center gap-3">
              {allMapped && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  All mapped
                </Badge>
              )}

              {/* View Mode Toggle */}
              <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('flow')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    viewMode === 'flow'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Visual Flow
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    viewMode === 'table'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Table className="h-3.5 w-3.5" />
                  Data Table
                </button>
              </div>
            </div>
          }
        />

        <div className="p-4">
          {viewMode === 'flow' ? (
            <FormMappingVisualFlow
              fields={fields}
              mappings={mapping.field_mappings ?? []}
              columnOptions={columnOptions}
              schemas={schemas}
              storageTarget={storageTarget}
              schemaSlug={storageTarget === 'schema' ? schemaSlug : undefined}
              onApply={applyFieldMapping}
              onClear={clearFieldMapping}
              onAutoMapAll={handleAutoMapAll}
            />
          ) : (
            <FormMappingTable
              fields={fields}
              mappings={mapping.field_mappings ?? []}
              columnOptions={columnOptions}
              schemas={schemas}
              storageTarget={storageTarget}
              schemaSlug={storageTarget === 'schema' ? schemaSlug : undefined}
              onApply={applyFieldMapping}
              onClear={clearFieldMapping}
              onAutoMapAll={handleAutoMapAll}
            />
          )}
        </div>
      </Card>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          {validCount}/{fields.length} fields configured
          {message && <span className="ml-3 text-emerald-600 font-medium">{message}</span>}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || fields.length === 0}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save mapping'}
          </Button>
          <Button onClick={goNext} disabled={saveMutation.isPending || fields.length === 0}>
            Next: Submit
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Payload Playground Drawer */}
      <FormPayloadPreviewDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fields={fields}
        mappings={mapping.field_mappings ?? []}
        storageTarget={storageTarget}
        schemaSlug={storageTarget === 'schema' ? schemaSlug : undefined}
        customerMatchKey={matchKey}
        customerEmailField={emailField}
        customerMobileField={mobileField}
      />
    </div>
  );
}
