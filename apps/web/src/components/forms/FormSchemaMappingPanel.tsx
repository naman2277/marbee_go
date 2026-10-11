import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { updateForm, type FormField, type FormSchemaMapping } from '@/lib/forms';

type SchemaOption = {
  slug: string;
  name: string;
  schema_fields?: Array<{ name: string; field_type: string }>;
};

type Props = {
  formId: string;
  formFields: FormField[];
  mapping: FormSchemaMapping;
  schemas: SchemaOption[];
  onSaved?: () => void;
};

export function FormSchemaMappingPanel({
  formId,
  formFields,
  mapping,
  schemas,
  onSaved,
}: Props) {
  const [targetSlug, setTargetSlug] = useState(mapping.target_schema_slug ?? '');
  const [upsertCustomer, setUpsertCustomer] = useState(mapping.upsert_customer ?? false);
  const [fieldMappings, setFieldMappings] = useState(
    mapping.field_mappings ?? formFields.map((f) => ({ form_field: f.name, schema_field: f.name })),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedSchema = schemas.find((s) => s.slug === targetSlug);
  const schemaFieldNames = selectedSchema?.schema_fields?.map((f) => f.name) ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const next: FormSchemaMapping = {
        target_schema_slug: targetSlug || undefined,
        upsert_customer: upsertCustomer,
        field_mappings: fieldMappings.filter((m) => m.form_field && m.schema_field),
      };
      const result = await updateForm(formId, { schema_mapping: next });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setMessage('Mapping saved');
      setError('');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  const addMappingRow = () => {
    const firstForm = formFields[0]?.name ?? '';
    const firstSchema = schemaFieldNames[0] ?? '';
    setFieldMappings([...fieldMappings, { form_field: firstForm, schema_field: firstSchema }]);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="font-semibold text-slate-900">Customer upsert</h3>
        <p className="mt-1 text-sm text-slate-500">
          When enabled, email/mobile submissions create or update a customer record.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={upsertCustomer}
            onChange={(e) => setUpsertCustomer(e.target.checked)}
          />
          Upsert customer on submit (uses email / mobile / name fields)
        </label>
      </div>

      <div>
        <h3 className="font-semibold text-slate-900">Schema mapping</h3>
        <p className="mt-1 text-sm text-slate-500">
          Map form answers into a published schema table on each submission.
        </p>
        <select
          value={targetSlug}
          onChange={(e) => setTargetSlug(e.target.value)}
          className="mt-3 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">No schema target</option>
          {schemas.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {targetSlug && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-700">Field mappings</h4>
            <Button variant="ghost" size="sm" onClick={addMappingRow}>
              Add row
            </Button>
          </div>
          <div className="space-y-2">
            {fieldMappings.map((row, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select
                  value={row.form_field}
                  onChange={(e) => {
                    const next = [...fieldMappings];
                    next[idx] = { ...row, form_field: e.target.value };
                    setFieldMappings(next);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                >
                  {formFields.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.label} ({f.name})
                    </option>
                  ))}
                </select>
                <span className="text-slate-400">→</span>
                <select
                  value={row.schema_field}
                  onChange={(e) => {
                    const next = [...fieldMappings];
                    next[idx] = { ...row, schema_field: e.target.value };
                    setFieldMappings(next);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-sm"
                >
                  {schemaFieldNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setFieldMappings(fieldMappings.filter((_, i) => i !== idx))}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving…' : 'Save mapping'}
      </Button>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
