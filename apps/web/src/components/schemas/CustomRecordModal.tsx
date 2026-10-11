import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { SchemaFieldRow } from '@/components/schemas/SchemaFieldsEditor';

type Props = {
  fields: SchemaFieldRow[];
  initial?: Record<string, unknown>;
  onSave: (record: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  title: string;
};

const SKIP_KEYS = new Set(['id', 'tenant_id', 'environment', 'created_at', 'updated_at']);

export function CustomRecordModal({ fields, initial, onSave, onClose, title }: Props) {
  const editableFields = fields.filter((f) => !SKIP_KEYS.has(f.name) && !f.is_primary_key);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of editableFields) {
      const raw = initial?.[f.name];
      init[f.name] = raw != null ? String(raw) : '';
    }
    return init;
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const coerce = (field: SchemaFieldRow, raw: string): unknown => {
    if (raw === '') return field.is_required ? '' : null;
    switch (field.field_type) {
      case 'number':
        return Number(raw);
      case 'boolean':
        return raw === 'true';
      case 'json':
        return JSON.parse(raw);
      default:
        return raw;
    }
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const record: Record<string, unknown> = {};
      for (const f of editableFields) {
        const raw = values[f.name] ?? '';
        if (f.is_required && raw === '') {
          throw new Error(`${f.name} is required`);
        }
        if (raw !== '') {
          record[f.name] = coerce(f, raw);
        }
      }
      await onSave(record);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {editableFields.map((f) => (
            <div key={f.id}>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {f.name}
                {f.is_required && <span className="text-red-500"> *</span>}
                <span className="ml-1 font-normal text-slate-400">({f.field_type})</span>
              </label>
              {f.field_type === 'json' ? (
                <textarea
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  placeholder="{}"
                />
              ) : f.field_type === 'boolean' ? (
                <select
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={
                    f.field_type === 'number'
                      ? 'number'
                      : f.field_type === 'date'
                        ? 'date'
                        : f.field_type === 'timestamp'
                          ? 'datetime-local'
                          : 'text'
                  }
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
