import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { FIELD_TYPES, type SchemaFieldType } from '@/lib/schema-erd';

export type SchemaFieldRow = {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  is_primary_key: boolean;
  is_pii: boolean;
  is_indexed: boolean;
  references_schema_id: string | null;
  references_field: string | null;
  sort_order: number;
};

export type FkSchemaOption = {
  id: string;
  name: string;
  slug: string;
  table_name: string | null;
};

type Props = {
  schemaId: string;
  schemaSlug?: string;
  tenantId?: string;
  environment?: string;
  fields: SchemaFieldRow[];
  readOnly?: boolean;
  fkSchemaOptions?: FkSchemaOption[];
};

export function SchemaFieldsEditor({
  schemaId,
  schemaSlug,
  tenantId,
  environment,
  fields,
  readOnly,
  fkSchemaOptions = [],
}: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState<SchemaFieldType>('string');
  const [isPii, setIsPii] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [isRequired, setIsRequired] = useState(false);
  const [error, setError] = useState('');

  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);

  const invalidate = () => {
    if (schemaSlug && tenantId && environment) {
      queryClient.invalidateQueries({ queryKey: ['schema', schemaSlug, tenantId, environment] });
      queryClient.invalidateQueries({ queryKey: ['schemas', tenantId, environment] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['schema'] });
      queryClient.invalidateQueries({ queryKey: ['schemas'] });
    }
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const fieldName = name.trim().toLowerCase().replace(/\s+/g, '_');
      if (!fieldName) throw new Error('Field name is required');
      if (!/^[a-z][a-z0-9_]*$/.test(fieldName)) {
        throw new Error('Use lowercase letters, numbers, underscores');
      }
      const { error: err } = await supabase.from('schema_fields').insert({
        schema_id: schemaId,
        name: fieldName,
        field_type: fieldType,
        is_required: isRequired,
        is_primary_key: false,
        is_pii: isPii,
        is_indexed: isIndexed,
        sort_order: (sorted.at(-1)?.sort_order ?? 0) + 1,
      });
      if (err) throw err;
    },
    onSuccess: () => {
      setName('');
      setIsRequired(false);
      setError('');
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateField = useMutation({
    mutationFn: async (patch: Partial<SchemaFieldRow> & { id: string }) => {
      const { id, ...updates } = patch;

      if (updates.is_primary_key) {
        await supabase
          .from('schema_fields')
          .update({ is_primary_key: false })
          .eq('schema_id', schemaId)
          .neq('id', id);
      }

      const { error: err } = await supabase.from('schema_fields').update(updates).eq('id', id);
      if (err) throw err;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const { error: err } = await supabase.from('schema_fields').delete().eq('id', fieldId);
      if (err) throw err;
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="px-6 py-3 font-medium">Field</th>
            <th className="px-6 py-3 font-medium">Type</th>
            <th className="px-6 py-3 font-medium">Required</th>
            <th className="px-6 py-3 font-medium">PK</th>
            <th className="px-6 py-3 font-medium">Foreign key</th>
            <th className="px-6 py-3 font-medium">PII</th>
            <th className="px-6 py-3 font-medium">Index</th>
            {!readOnly && <th className="px-6 py-3 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-6 py-3 font-mono font-medium text-slate-900">{f.name}</td>
              <td className="px-6 py-3 text-slate-600">{f.field_type}</td>
              <td className="px-6 py-3">
                {readOnly ? (
                  f.is_required ? 'Yes' : '—'
                ) : (
                  <input
                    type="checkbox"
                    checked={f.is_required}
                    onChange={(e) => updateField.mutate({ id: f.id, is_required: e.target.checked })}
                  />
                )}
              </td>
              <td className="px-6 py-3">
                {readOnly ? (
                  f.is_primary_key ? 'Yes' : '—'
                ) : (
                  <input
                    type="radio"
                    name={`pk-${schemaId}`}
                    checked={f.is_primary_key}
                    onChange={() => updateField.mutate({ id: f.id, is_primary_key: true, is_required: true })}
                  />
                )}
              </td>
              <td className="px-6 py-3">
                {readOnly ? (
                  f.references_schema_id ? (
                    <span className="text-xs text-slate-600">
                      {fkSchemaOptions.find((s) => s.id === f.references_schema_id)?.name ?? 'Schema'}
                      .{f.references_field ?? 'id'}
                    </span>
                  ) : (
                    '—'
                  )
                ) : (
                  <select
                    value={f.references_schema_id ?? ''}
                    onChange={(e) =>
                      updateField.mutate({
                        id: f.id,
                        references_schema_id: e.target.value || null,
                        references_field: e.target.value ? 'id' : null,
                      })
                    }
                    className="max-w-[140px] rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="">None</option>
                    {fkSchemaOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="px-6 py-3">
                {readOnly ? (
                  f.is_pii ? <Badge variant="warning">PII</Badge> : '—'
                ) : (
                  <input
                    type="checkbox"
                    checked={f.is_pii}
                    onChange={(e) => updateField.mutate({ id: f.id, is_pii: e.target.checked })}
                  />
                )}
              </td>
              <td className="px-6 py-3">
                {readOnly ? (
                  f.is_indexed ? 'Yes' : '—'
                ) : (
                  <input
                    type="checkbox"
                    checked={f.is_indexed}
                    onChange={(e) => updateField.mutate({ id: f.id, is_indexed: e.target.checked })}
                  />
                )}
              </td>
              {!readOnly && (
                <td className="px-6 py-3">
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(f.id)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {!readOnly && (
        <div className="border-t border-slate-100 px-6 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Add field</p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="field_name"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as SchemaFieldType)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
              Required
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={isPii} onChange={(e) => setIsPii(e.target.checked)} />
              PII
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={isIndexed} onChange={(e) => setIsIndexed(e.target.checked)} />
              Index
            </label>
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !name.trim()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <p className="mt-2 text-xs text-slate-400">
            Select one primary key (or leave unset — an <code className="rounded bg-slate-100 px-1">id</code> UUID
            column is added on publish). Foreign keys link to published or system schemas.
          </p>
        </div>
      )}
    </div>
  );
}
