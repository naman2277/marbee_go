import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import {
  FORM_FIELD_TYPES,
  createFormField,
  normalizeFieldName,
  updateForm,
  type FormField,
  type FormFieldType,
} from '@/lib/forms';

type Props = {
  formId: string;
  fields: FormField[];
  readOnly?: boolean;
  onSaved?: () => void;
};

export function FormFieldsEditor({ formId, fields, readOnly, onSaved }: Props) {
  const [localFields, setLocalFields] = useState<FormField[]>(() =>
    [...fields].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const saveMutation = useMutation({
    mutationFn: async (nextFields: FormField[]) => {
      const result = await updateForm(formId, { fields: nextFields });
      if (result.error) throw new Error(result.error);
      return nextFields;
    },
    onSuccess: (nextFields) => {
      setLocalFields(nextFields);
      setMessage('Fields saved');
      setError('');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  const addField = () => {
    if (!newLabel.trim()) return;
    const next = [...localFields, createFormField(newLabel, localFields.length)];
    setNewLabel('');
    saveMutation.mutate(next);
  };

  const updateField = (id: string, patch: Partial<FormField>) => {
    const next = localFields.map((f) => (f.id === id ? { ...f, ...patch } : f));
    setLocalFields(next);
  };

  const removeField = (id: string) => {
    const next = localFields
      .filter((f) => f.id !== id)
      .map((f, i) => ({ ...f, sort_order: i }));
    saveMutation.mutate(next);
  };

  const persistFields = () => {
    saveMutation.mutate(localFields.map((f, i) => ({ ...f, sort_order: i })));
  };

  return (
    <div className="p-6">
      {!readOnly && (
        <div className="mb-6 flex flex-wrap gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Field label (e.g. Email address)"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && addField()}
          />
          <Button size="sm" onClick={addField} disabled={!newLabel.trim() || saveMutation.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add field
          </Button>
        </div>
      )}

      {localFields.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No fields yet. Add text, email, dropdown, and other inputs for your form.
        </p>
      ) : (
        <div className="space-y-3">
          {localFields.map((field) => (
            <div
              key={field.id}
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
            >
              <div className="flex items-start gap-3">
                <GripVertical className="mt-2 h-4 w-4 shrink-0 text-slate-300" />
                <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Label</label>
                    <input
                      value={field.label}
                      disabled={readOnly}
                      onChange={(e) => {
                        const label = e.target.value;
                        updateField(field.id, {
                          label,
                          name: normalizeFieldName(label) || field.name,
                        });
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Field key</label>
                    <input
                      value={field.name}
                      disabled={readOnly}
                      onChange={(e) => updateField(field.id, { name: normalizeFieldName(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Type</label>
                    <select
                      value={field.field_type}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateField(field.id, { field_type: e.target.value as FormFieldType })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    >
                      {FORM_FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Placeholder</label>
                    <input
                      value={field.placeholder ?? ''}
                      disabled={readOnly}
                      onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={field.required ?? false}
                      disabled={readOnly}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeField(field.id)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {field.field_type === 'select' && (
                <div className="mt-3 pl-7">
                  <label className="mb-1 block text-xs text-slate-500">Options (comma-separated)</label>
                  <input
                    value={(field.options ?? []).join(', ')}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateField(field.id, {
                        options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean),
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    placeholder="Option A, Option B, Option C"
                  />
                </div>
              )}

              <div className="mt-2 pl-7">
                <Badge variant="default">{field.field_type}</Badge>
                {field.required && <Badge variant="warning">required</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && localFields.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={persistFields} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save fields'}
          </Button>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
