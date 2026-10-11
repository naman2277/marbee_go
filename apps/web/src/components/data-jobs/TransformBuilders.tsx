import { Plus, Trash2 } from 'lucide-react';

/* Structured editors for the two most-used transform configs. They read/write
   the same newline-delimited text the worker parses (`conditions_text`,
   `mapping_text`) so no engine change is needed. */

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

const FILTER_OPS = ['equals', 'not_equals', 'contains', 'not_contains', 'gt', 'lt', 'is_empty', 'not_empty', 'in'];

type Condition = { field: string; op: string; value: string };

function parseConditions(text: string): Condition[] {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [field, op, ...rest] = l.split(/\s+/);
      return { field: field ?? '', op: op ?? 'equals', value: rest.join(' ') };
    });
}

const serializeConditions = (rows: Condition[]) =>
  rows
    .filter((r) => r.field)
    .map((r) => `${r.field} ${r.op}${r.value ? ` ${r.value}` : ''}`)
    .join('\n');

export function FilterConditionsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const rows = parseConditions(value);
  const set = (next: Condition[]) => onChange(serializeConditions(next));

  return (
    <div className="space-y-1.5">
      {rows.length === 0 && <p className="text-[11px] text-slate-400">No conditions — all rows pass.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={r.field}
            placeholder="field"
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
            className={`${inputCls} w-28`}
          />
          <select
            value={r.op}
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}
            className={`${inputCls} w-28`}
          >
            {FILTER_OPS.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          {!['is_empty', 'not_empty'].includes(r.op) && (
            <input
              value={r.value}
              placeholder="value"
              onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              className={`${inputCls} flex-1`}
            />
          )}
          <button
            type="button"
            onClick={() => set(rows.filter((_, j) => j !== i))}
            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set([...rows, { field: '', op: 'equals', value: '' }])}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
      >
        <Plus className="h-3 w-3" />
        Add condition
      </button>
    </div>
  );
}

type Mapping = { source: string; target: string };

function parseMappings(text: string): Mapping[] {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [source, target] = l.split(/\s*(?:->|→|=>)\s*/);
      return { source: (source ?? '').trim(), target: (target ?? source ?? '').trim() };
    });
}

const serializeMappings = (rows: Mapping[]) =>
  rows.filter((r) => r.source && r.target).map((r) => `${r.source} → ${r.target}`).join('\n');

export function FieldMappingEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const rows = parseMappings(value);
  const set = (next: Mapping[]) => onChange(serializeMappings(next));

  return (
    <div className="space-y-1.5">
      {rows.length === 0 && <p className="text-[11px] text-slate-400">No mappings — no fields carried through.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={r.source}
            placeholder="source field"
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}
            className={`${inputCls} flex-1`}
          />
          <span className="text-slate-400">→</span>
          <input
            value={r.target}
            placeholder="target field"
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => set(rows.filter((_, j) => j !== i))}
            className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set([...rows, { source: '', target: '' }])}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
      >
        <Plus className="h-3 w-3" />
        Add mapping
      </button>
    </div>
  );
}
