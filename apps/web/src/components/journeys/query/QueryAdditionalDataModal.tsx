import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Database,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { SelectCheckbox } from '@/components/bulk/SelectCheckbox';
import type { SchemaFilterField } from '@/lib/schema-filters';

type OutputColumn = {
  key: string;
  label: string;
  expression: string;
  alias: string;
};

type Props = {
  open: boolean;
  schemaName: string;
  fields: SchemaFilterField[];
  selectedKeys: string[];
  targetingDimension: string;
  onClose: () => void;
  onSave: (keys: string[]) => void;
};

function toColumns(keys: string[], fields: SchemaFilterField[]): OutputColumn[] {
  return keys.map((key) => {
    const field = fields.find((f) => f.key === key);
    const label = field?.label ?? key.replace(/_/g, ' ');
    return { key, label, expression: `@${key}`, alias: key };
  });
}

export function QueryAdditionalDataModal({
  open,
  schemaName,
  fields,
  selectedKeys,
  targetingDimension,
  onClose,
  onSave,
}: Props) {
  const [find, setFind] = useState('');
  const [draftKeys, setDraftKeys] = useState<string[]>(selectedKeys);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setDraftKeys(selectedKeys);
    setSelectedRows(new Set());
    setSelectedAvailable(new Set());
    setFind('');
  }, [open, selectedKeys]);

  const availableFields = useMemo(
    () => fields.filter((f) => f.key !== targetingDimension && !draftKeys.includes(f.key)),
    [fields, targetingDimension, draftKeys],
  );

  const filteredAvailable = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return availableFields;
    return availableFields.filter(
      (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
    );
  }, [availableFields, find]);

  const columns = useMemo(() => toColumns(draftKeys, fields), [draftKeys, fields]);

  const toggleRow = (key: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAvailable = (key: string) => {
    setSelectedAvailable((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addSelected = () => {
    if (!selectedAvailable.size) return;
    setDraftKeys((prev) => [...prev, ...selectedAvailable]);
    setSelectedAvailable(new Set());
  };

  const removeSelected = () => {
    if (!selectedRows.size) return;
    setDraftKeys((prev) => prev.filter((k) => !selectedRows.has(k)));
    setSelectedRows(new Set());
  };

  const moveColumn = (key: string, dir: -1 | 1) => {
    setDraftKeys((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      return next;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Additional data</h2>
            <p className="text-sm text-slate-500">Select the data to keep in the query work table output.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
          <div className="flex min-h-[320px] flex-col border-b border-slate-100 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Available fields</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Find…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Database className="h-3.5 w-3.5" />
                {schemaName}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredAvailable.map((field) => (
                <div
                  key={field.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleAvailable(field.key)}
                  onKeyDown={(e) => e.key === 'Enter' && toggleAvailable(field.key)}
                  className={`mb-0.5 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                    selectedAvailable.has(field.key) ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50'
                  }`}
                >
                  <SelectCheckbox
                    checked={selectedAvailable.has(field.key)}
                    onChange={() => toggleAvailable(field.key)}
                    aria-label={`Select ${field.label}`}
                  />
                  <Table2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate font-medium">{field.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">@{field.key}</span>
                </div>
              ))}
              {!filteredAvailable.length && (
                <p className="px-2 py-6 text-center text-xs text-slate-400">No more fields available.</p>
              )}
            </div>
            <div className="border-t border-slate-100 p-3">
              <Button variant="secondary" size="sm" onClick={addSelected} disabled={!selectedAvailable.size}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add to output
              </Button>
            </div>
          </div>

          <div className="flex min-h-[320px] flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Output columns</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Remove selected"
                  disabled={!selectedRows.size}
                  onClick={removeSelected}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2">Label</th>
                    <th className="px-2 py-2">Expression</th>
                    <th className="px-2 py-2">Alias</th>
                    <th className="w-16 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {columns.map((col) => (
                    <tr key={col.key} className={selectedRows.has(col.key) ? 'bg-red-50/50' : 'hover:bg-slate-50/80'}>
                      <td className="px-2 py-2">
                        <SelectCheckbox
                          checked={selectedRows.has(col.key)}
                          onChange={() => toggleRow(col.key)}
                          aria-label={`Select ${col.label}`}
                        />
                      </td>
                      <td className="px-2 py-2 font-medium text-slate-800">{col.label}</td>
                      <td className="px-2 py-2 font-mono text-slate-600">{col.expression}</td>
                      <td className="px-2 py-2 font-mono text-slate-500">{col.alias}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveColumn(col.key, -1)}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveColumn(col.key, 1)}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!columns.length && (
                <p className="px-4 py-10 text-center text-xs text-slate-400">
                  No additional columns yet. Select fields on the left and click Add to output.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(draftKeys); onClose(); }}>Apply</Button>
        </div>
      </div>
    </div>
  );
}
