import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Database,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { DataColumnSpec } from '@/lib/schema-data';
import {
  addFieldsToOutput,
  aliasPlain,
  fieldToAlias,
  formatExpressionDisplay,
  moveColumn,
  normalizeColumnList,
  parseExpressionDisplay,
  removeColumnsById,
  resolveColumnSourceKey,
} from '@/lib/schema-explorer-columns';
import { FUNCTION_CATALOG } from '@/lib/schema-expressions';
import type { SchemaFilterField } from '@/lib/schema-filters';

type AvailableField = { key: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  schemaName: string;
  availableFields: AvailableField[];
  columns: DataColumnSpec[];
  onApply: (columns: DataColumnSpec[]) => void;
  filterFields: SchemaFilterField[];
};

type EditPopup =
  | { type: 'expression'; columnId: string }
  | { type: 'alias'; columnId: string }
  | null;

const iconBtn =
  'inline-flex shrink-0 items-center justify-center rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700';

export function SchemaDataColumnsModal({
  open,
  onClose,
  schemaName,
  availableFields,
  columns,
  onApply,
  filterFields,
}: Props) {
  const [draft, setDraft] = useState<DataColumnSpec[]>(columns);
  const [search, setSearch] = useState('');
  const [pickedFieldKeys, setPickedFieldKeys] = useState<Set<string>>(new Set());
  const [selectedOutputIds, setSelectedOutputIds] = useState<Set<string>>(new Set());
  const [editPopup, setEditPopup] = useState<EditPopup>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(normalizeColumnList(columns.map((c) => ({ ...c }))));
      setSearch('');
      setPickedFieldKeys(new Set());
      setSelectedOutputIds(new Set());
      setEditPopup(null);
    }
    wasOpen.current = open;
  }, [open, columns]);

  const filteredFields = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableFields;
    return availableFields.filter(
      (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
    );
  }, [availableFields, search]);

  const pickedFields = availableFields.filter((f) => pickedFieldKeys.has(f.key));

  const patchColumn = (id: string, patch: Partial<DataColumnSpec>) => {
    setDraft((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const togglePickedField = (key: string) => {
    setPickedFieldKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleOutputSelected = (id: string) => {
    setSelectedOutputIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addPickedToOutput = () => {
    if (!pickedFields.length) return;
    setDraft((prev) => addFieldsToOutput(prev, pickedFields));
    setPickedFieldKeys(new Set());
  };

  const removeSelectedOutput = () => {
    if (!selectedOutputIds.size) return;
    setDraft((prev) => removeColumnsById(prev, selectedOutputIds));
    setSelectedOutputIds(new Set());
  };

  const editColumn = editPopup ? draft.find((c) => c.id === editPopup.columnId) ?? null : null;

  const handleApply = () => {
    const next = normalizeColumnList(draft.map((c) => ({ ...c })));
    onApply(next);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Additional data</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Select the data to keep in the query work table output.
            </p>
          </div>
          <button type="button" onClick={onClose} className={`${iconBtn} p-1`} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(260px,300px)_1fr]">
          <div className="flex min-h-[360px] flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Available fields
              </p>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find:"
                  className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
              <div className="mb-1 flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-700">
                <Database className="h-3 w-3 text-slate-400" />
                <span className="truncate">{schemaName}</span>
              </div>

              <ul>
                {filteredFields.map((field) => {
                  const checked = pickedFieldKeys.has(field.key);
                  return (
                    <li key={field.key}>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-slate-50 ${
                          checked ? 'bg-brand-50/40' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePickedField(field.key)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                        />
                        <Table2 className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate text-slate-800">{field.label}</span>
                        <span className="shrink-0 font-mono text-[10px] text-slate-400">
                          {fieldToAlias(field.key)}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {!filteredFields.length && (
                  <li className="py-8 text-center text-xs text-slate-400">No fields match</li>
                )}
              </ul>
            </div>

            <div className="border-t border-slate-100 px-4 py-2.5">
              <button
                type="button"
                disabled={!pickedFields.length}
                onClick={addPickedToOutput}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                Add to output
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Output columns
              </p>
              <button
                type="button"
                disabled={!selectedOutputIds.size}
                onClick={removeSelectedOutput}
                title="Remove selected"
                className={`${iconBtn} disabled:opacity-30`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2">Column name</th>
                    <th className="px-2 py-2">Expression</th>
                    <th className="px-2 py-2">Alias</th>
                    <th className="w-14 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.map((col) => {
                    const sourceKey = resolveColumnSourceKey(col);
                    const exprDisplay = formatExpressionDisplay(col.transform, col.key, sourceKey);
                    const aliasDisplay = aliasPlain(col.alias);

                    return (
                      <tr key={col.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-2 py-2 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedOutputIds.has(col.id)}
                            onChange={() => toggleOutputSelected(col.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
                          />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <input
                            type="text"
                            value={col.label}
                            onChange={(e) => patchColumn(col.id, { label: e.target.value })}
                            className="w-full border-0 bg-transparent px-0 py-0 text-sm text-slate-800 focus:outline-none focus:ring-0"
                          />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center gap-1">
                            <span
                              className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600"
                              title={exprDisplay}
                            >
                              {exprDisplay}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditPopup({ type: 'expression', columnId: col.id })}
                              title="Edit expression"
                              className={iconBtn}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center gap-1">
                            <span
                              className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600"
                              title={aliasDisplay}
                            >
                              {aliasDisplay}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditPopup({ type: 'alias', columnId: col.id })}
                              title="Edit alias"
                              className={iconBtn}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => setDraft((p) => moveColumn(p, col.id, 'up'))}
                              className={iconBtn}
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDraft((p) => moveColumn(p, col.id, 'down'))}
                              className={iconBtn}
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!draft.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-xs text-slate-400">
                        Select fields on the left and click &quot;Add to output&quot;
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!draft.length} onClick={handleApply}>
            Apply
          </Button>
        </div>
      </div>

      {editPopup && editColumn && (
        <EditFieldPopup
          key={`${editPopup.type}-${editPopup.columnId}`}
          type={editPopup.type}
          column={editColumn}
          filterFields={filterFields}
          onClose={() => setEditPopup(null)}
          onSave={(patch) => {
            patchColumn(editPopup.columnId, patch);
            setEditPopup(null);
          }}
        />
      )}
    </div>
  );
}

function EditFieldPopup({
  type,
  column,
  filterFields,
  onClose,
  onSave,
}: {
  type: 'expression' | 'alias';
  column: DataColumnSpec;
  filterFields: SchemaFilterField[];
  onClose: () => void;
  onSave: (patch: Partial<DataColumnSpec>) => void;
}) {
  const isExpression = type === 'expression';
  const sourceKey = resolveColumnSourceKey(column);
  const [value, setValue] = useState(() =>
    isExpression
      ? formatExpressionDisplay(column.transform, column.key, sourceKey)
      : aliasPlain(column.alias),
  );
  const [error, setError] = useState('');

  const insertFn = (fnName: string) => {
    const fieldRef = fieldToAlias(sourceKey);
    const snippet = fnName === 'GetDate' ? `${fnName}()` : `${fnName}(${fieldRef})`;
    setValue((prev) => (prev.trim() ? `${prev.trim()} ${snippet}` : snippet));
    setError('');
  };

  const insertField = (key: string) => {
    const token = fieldToAlias(key);
    setValue((prev) => (prev.trim() ? `${prev.trim()} ${token}` : token));
    setError('');
  };

  const handleSave = () => {
    if (isExpression) {
      const trimmed = value.trim();
      const plainField = fieldToAlias(sourceKey);
      if (!trimmed || trimmed === plainField) {
        onSave({ transform: null });
        return;
      }
      const parsed = parseExpressionDisplay(trimmed, filterFields);
      if (!parsed) {
        setError('Invalid expression. Try Lower(@email), Year(@created_at), etc.');
        return;
      }
      onSave({ transform: parsed });
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setError('Alias cannot be empty.');
      return;
    }
    onSave({ alias: trimmed.replace(/^@/, '') });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/25 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {isExpression ? 'Edit expression' : 'Edit alias'}
            </h3>
            <p className="text-xs text-slate-500">{column.label}</p>
          </div>
          <button type="button" onClick={onClose} className={iconBtn}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
          {isExpression && (
            <>
              <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Functions</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {FUNCTION_CATALOG.slice(0, 12).map((fn) => (
                  <button
                    key={fn.name}
                    type="button"
                    title={fn.description}
                    onClick={() => insertFn(fn.name)}
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                  >
                    {fn.name}()
                  </button>
                ))}
              </div>
              <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Fields</p>
              <div className="mb-3 flex max-h-16 flex-wrap gap-1 overflow-y-auto">
                {filterFields
                  .filter((f) => f.group !== 'Transformed columns')
                  .slice(0, 16)
                  .map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => insertField(f.key)}
                      className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-50"
                    >
                      {fieldToAlias(f.key)}
                    </button>
                  ))}
              </div>
            </>
          )}

          <label className="mb-1 block text-xs font-medium text-slate-600">
            {isExpression ? 'Expression' : 'Alias'}
          </label>
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
              }
            }}
            rows={isExpression ? 3 : 2}
            spellCheck={false}
            className={`w-full resize-none rounded-md border px-2.5 py-2 font-mono text-sm focus:outline-none focus:ring-1 ${
              error
                ? 'border-red-300 focus:ring-red-100'
                : 'border-slate-200 focus:border-brand-300 focus:ring-brand-100'
            }`}
          />
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
