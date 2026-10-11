import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Hash,
  Mail,
  Phone,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { FormDesignPanel } from '@/components/forms/FormDesignPanel';
import { FormPreview } from '@/components/forms/FormPreview';
import {
  FORM_FIELD_TYPES,
  createFormField,
  normalizeFieldName,
  updateForm,
  type FormField,
  type FormFieldType,
  type FormFieldWidth,
  type MarbeeForm,
} from '@/lib/forms';
import { useTenantScope } from '@/contexts/AuthContext';

const PALETTE: Array<{ type: FormFieldType; icon: typeof Type; label: string }> = [
  { type: 'text', icon: Type, label: 'Text' },
  { type: 'email', icon: Mail, label: 'Email' },
  { type: 'phone', icon: Phone, label: 'Phone' },
  { type: 'number', icon: Hash, label: 'Number' },
  { type: 'textarea', icon: AlignLeft, label: 'Long text' },
  { type: 'select', icon: ChevronDown, label: 'Dropdown' },
  { type: 'checkbox', icon: CheckSquare, label: 'Checkbox' },
  { type: 'date', icon: Calendar, label: 'Date' },
];

type Props = {
  form: MarbeeForm;
  onSaved?: () => void;
};

export function FormStudio({ form, onSaved }: Props) {
  const { tenantId, environment } = useTenantScope();
  const [fields, setFields] = useState<FormField[]>(() =>
    [...form.fields].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [selectedId, setSelectedId] = useState<string | null>(fields[0]?.id ?? null);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [message, setMessage] = useState('');

  const selected = fields.find((f) => f.id === selectedId);

  const saveMutation = useMutation({
    mutationFn: async (nextFields: FormField[]) => {
      const result = await updateForm(form.id, {
        fields: nextFields.map((f, i) => ({ ...f, sort_order: i })),
      });
      if (result.error) throw new Error(result.error);
      return nextFields;
    },
    onSuccess: (next) => {
      setFields(next);
      setMessage('Saved');
      onSaved?.();
      setTimeout(() => setMessage(''), 2000);
    },
  });

  const persist = (next: FormField[]) => {
    setFields(next);
    saveMutation.mutate(next);
  };

  const addField = (type: FormFieldType) => {
    const label = PALETTE.find((p) => p.type === type)?.label ?? 'New field';
    const f = { ...createFormField(label, fields.length), field_type: type, width: 'full' as const };
    const next = [...fields, f];
    setSelectedId(f.id);
    persist(next);
  };

  const updateField = (id: string, patch: Partial<FormField>) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const saveFieldEdits = () => persist(fields.map((f, i) => ({ ...f, sort_order: i })));

  const removeField = (id: string) => {
    const next = fields.filter((f) => f.id !== id).map((f, i) => ({ ...f, sort_order: i }));
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    persist(next);
  };

  const moveField = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    persist(next.map((f, i) => ({ ...f, sort_order: i })));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <FormDesignPanel formId={form.id} formName={form.name} settings={form.settings} onSaved={onSaved} />

      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['edit', 'preview'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                view === v ? 'bg-white shadow-sm' : 'text-slate-500'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {message && <span className="text-xs text-emerald-600">{message}</span>}
      </div>

      {view === 'preview' ? (
        <FormPreview form={{ ...form, fields }} tenantId={tenantId} environment={environment} preview />
      ) : (
        <div className="grid min-h-[520px] lg:grid-cols-[200px_1fr_280px]">
          {/* Palette */}
          <div className="border-r border-slate-100 bg-slate-50/50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Add fields</p>
            <div className="space-y-1">
              {PALETTE.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addField(type)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-white hover:shadow-sm"
                >
                  <Icon className="h-4 w-4 text-slate-400" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div className="overflow-y-auto p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Form canvas</p>
            {fields.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-center text-sm text-slate-500">
                <Plus className="mb-2 h-8 w-8 text-slate-300" />
                Add fields from the palette or use AI to generate a form
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => setSelectedId(field.id)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      selectedId === field.id
                        ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-100'
                        : 'border-slate-200 hover:border-slate-300'
                    } ${field.width === 'half' ? 'sm:col-span-1' : 'sm:col-span-2'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{field.label}</p>
                        <p className="text-[10px] font-mono text-slate-400">{field.name}</p>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="default">{field.field_type}</Badge>
                        {field.required && <Badge variant="warning">req</Badge>}
                      </div>
                    </div>
                    <div className="mt-2 h-9 rounded-lg bg-white ring-1 ring-slate-100" />
                    <div className="mt-2 flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(field.id, -1);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(field.id, 1);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Properties */}
          <div className="border-l border-slate-100 bg-slate-50/30 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Field properties</p>
            {selected ? (
              <div className="space-y-3">
                <input
                  value={selected.label}
                  onChange={(e) =>
                    updateField(selected.id, {
                      label: e.target.value,
                      name: normalizeFieldName(e.target.value) || selected.name,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Label"
                />
                <input
                  value={selected.name}
                  onChange={(e) => updateField(selected.id, { name: normalizeFieldName(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  placeholder="Field key"
                />
                <select
                  value={selected.field_type}
                  onChange={(e) => updateField(selected.id, { field_type: e.target.value as FormFieldType })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {FORM_FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select
                  value={selected.width ?? 'full'}
                  onChange={(e) => updateField(selected.id, { width: e.target.value as FormFieldWidth })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="full">Full width</option>
                  <option value="half">Half width</option>
                </select>
                <input
                  value={selected.placeholder ?? ''}
                  onChange={(e) => updateField(selected.id, { placeholder: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Placeholder"
                />
                {selected.field_type === 'select' && (
                  <input
                    value={(selected.options ?? []).join(', ')}
                    onChange={(e) =>
                      updateField(selected.id, {
                        options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean),
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Options, comma-separated"
                  />
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.required ?? false}
                    onChange={(e) => updateField(selected.id, { required: e.target.checked })}
                  />
                  Required field
                </label>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={saveFieldEdits} disabled={saveMutation.isPending}>
                    Apply
                  </Button>
                  <button
                    type="button"
                    onClick={() => removeField(selected.id)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a field to edit its properties.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
