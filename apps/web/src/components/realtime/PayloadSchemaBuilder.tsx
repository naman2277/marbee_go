import { useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { FIELD_TYPES, inferSchema, type SchemaField } from '@/lib/rtm';

type Props = {
  value: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
};

export function PayloadSchemaBuilder({ value, onChange }: Props) {
  const [sample, setSample] = useState('');
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(value.length === 0);

  function applySample() {
    try {
      const parsed = JSON.parse(sample);
      const inferred = inferSchema(parsed);
      if (inferred.length === 0) {
        setSampleError('That parsed, but it is not a JSON object with fields.');
        return;
      }
      // merge — keep existing tweaks for keys that stay
      const byKey = new Map(value.map((f) => [f.key, f]));
      onChange(inferred.map((f) => byKey.get(f.key) ?? f));
      setSampleError(null);
      setShowSample(false);
    } catch {
      setSampleError('That is not valid JSON.');
    }
  }

  function update(idx: number, patch: Partial<SchemaField>) {
    onChange(value.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...value, { key: '', type: 'string', required: false, example: '', pii: false }]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Payload fields</h4>
          <p className="text-xs text-slate-500">
            What your backend sends in <code className="rounded bg-slate-100 px-1">data</code>. Drives validation,
            template autocomplete, and the generated snippet.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowSample((s) => !s)}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Paste sample JSON
        </Button>
      </div>

      {showSample && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            rows={6}
            placeholder={'{\n  "order_id": "A-2231",\n  "eta": "2026-08-30",\n  "tracking_url": "https://track.acme.io/A-2231"\n}'}
            className="w-full rounded-md border border-slate-200 bg-white p-2 font-mono text-xs text-slate-800 focus:border-brand-500 focus:outline-none"
          />
          {sampleError && <p className="mt-1 text-xs text-red-600">{sampleError}</p>}
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={applySample} disabled={!sample.trim()}>Infer fields</Button>
          </div>
        </div>
      )}

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center">
          <p className="text-sm text-slate-500">No fields yet — paste a sample or add them by hand.</p>
          <p className="mt-1 text-xs text-slate-400">
            You can also skip this and reference <code>{'{{data.anything}}'}</code> straight in the template.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Field</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Example</th>
                <th className="px-3 py-2 text-center">Required</th>
                <th className="px-3 py-2 text-center">PII</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {value.map((field, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-1.5">
                    <input
                      value={field.key}
                      onChange={(e) => update(idx, { key: e.target.value.replace(/[^\w.]/g, '') })}
                      placeholder="order_id"
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 font-mono text-xs text-slate-800 hover:border-slate-200 focus:border-brand-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={field.type}
                      onChange={(e) => update(idx, { type: e.target.value as SchemaField['type'] })}
                      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
                    >
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={field.example ?? ''}
                      onChange={(e) => update(idx, { example: e.target.value })}
                      placeholder="A-2231"
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-slate-600 hover:border-slate-200 focus:border-brand-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input type="checkbox" checked={field.required}
                      onChange={(e) => update(idx, { required: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input type="checkbox" checked={field.pii ?? false}
                      onChange={(e) => update(idx, { pii: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={() => remove(idx)} className="text-slate-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={add}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add field
      </Button>
    </div>
  );
}
