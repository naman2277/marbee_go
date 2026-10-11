import { useState } from 'react';
import { Code, Layers } from 'lucide-react';
import {
  FUNCTION_CATALOG,
  FUNCTION_MAP,
  createDefaultArgs,
  fieldExpr,
  formatExpr,
  funcExpr,
  literalExpr,
  parseExpression,
  wrapWithFunction,
  type ExprNode,
  type FunctionCategory,
} from '@/lib/schema-expressions';
import type { SchemaFilterField } from '@/lib/schema-filters';

type Props = {
  value: ExprNode;
  onChange: (value: ExprNode) => void;
  fields: SchemaFilterField[];
  placeholder?: string;
};

const CATEGORY_LABELS: Record<FunctionCategory, string> = {
  string: 'String',
  date: 'Date & Time',
  number: 'Number',
  other: 'Other',
};

export function ExpressionEditor({ value, onChange, fields, placeholder }: Props) {
  const [mode, setMode] = useState<'visual' | 'text'>('visual');
  const [textDraft, setTextDraft] = useState('');
  const [parseError, setParseError] = useState('');

  const switchToText = () => {
    setTextDraft(formatExpr(value, fields));
    setParseError('');
    setMode('text');
  };

  const applyText = () => {
    const parsed = parseExpression(textDraft, fields);
    if (!parsed) {
      setParseError('Could not parse expression. Try: Year(created_at) or Lower(fcm_token)');
      return;
    }
    setParseError('');
    onChange(parsed);
    setMode('visual');
  };

  return (
    <div className="min-w-[200px] flex-1 space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <code className="truncate text-xs text-brand-700">{formatExpr(value, fields) || '—'}</code>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => (mode === 'text' ? setMode('visual') : switchToText())}
            className={`rounded p-1 ${mode === 'text' ? 'bg-brand-100 text-brand-700' : 'text-slate-400 hover:text-slate-600'}`}
            title="Expression text"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {mode === 'text' ? (
        <div className="space-y-1">
          <input
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder={placeholder ?? 'Year(created_at), Lower(fcm_token), 2026'}
            className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
          />
          {parseError && <p className="text-xs text-red-600">{parseError}</p>}
          <button type="button" onClick={applyText} className="text-xs font-medium text-brand-600 hover:underline">
            Apply expression
          </button>
        </div>
      ) : (
        <VisualExprEditor value={value} onChange={onChange} fields={fields} />
      )}
    </div>
  );
}

function VisualExprEditor({
  value,
  onChange,
  fields,
}: {
  value: ExprNode;
  onChange: (v: ExprNode) => void;
  fields: SchemaFilterField[];
}) {
  if (value.kind === 'field') {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <select
          value={value.field}
          onChange={(e) => onChange(fieldExpr(e.target.value))}
          className="rounded border border-slate-200 px-2 py-1 text-xs"
        >
          {fields.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <FunctionPicker onSelect={(fn) => onChange(wrapWithFunction(value, fn))} />
        <button type="button" onClick={() => onChange(literalExpr(''))} className="text-xs text-slate-500 hover:text-slate-700">
          → Value
        </button>
      </div>
    );
  }

  if (value.kind === 'literal') {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <input
          value={value.value}
          onChange={(e) => onChange(literalExpr(e.target.value))}
          placeholder="Value…"
          className="min-w-[100px] rounded border border-slate-200 px-2 py-1 text-xs"
        />
        <button type="button" onClick={() => onChange(fieldExpr(fields[0]?.key ?? ''))} className="text-xs text-slate-500 hover:text-slate-700">
          → Field
        </button>
        <FunctionPicker onSelect={(fn) => onChange(funcExpr(fn, createDefaultArgs(fn, fields)))} />
      </div>
    );
  }

  const def = FUNCTION_MAP.get(value.name);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
          <Layers className="h-3 w-3" />
          {value.name}
        </span>
        <FunctionPicker
          label="Wrap"
          onSelect={(fn) => onChange(wrapWithFunction(value, fn))}
        />
        <button type="button" onClick={() => onChange(fieldExpr(fields[0]?.key ?? ''))} className="text-xs text-slate-500 hover:text-slate-700">
          Reset
        </button>
      </div>
      {def && (
        <div className="space-y-1 pl-2 border-l-2 border-brand-200">
          {value.args.map((arg, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="mt-1.5 w-16 shrink-0 text-[10px] text-slate-400">
                {def.argLabels?.[i] ?? `Arg ${i + 1}`}
              </span>
              <VisualExprEditor
                value={arg}
                onChange={(next) => {
                  const args = [...value.args];
                  args[i] = next;
                  onChange(funcExpr(value.name, args));
                }}
                fields={fields}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FunctionPicker({ onSelect, label = 'fx' }: { onSelect: (fn: string) => void; label?: string }) {
  const categories = ['string', 'date', 'number', 'other'] as FunctionCategory[];

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) {
          onSelect(e.target.value);
          e.target.value = '';
        }
      }}
      className="rounded border border-dashed border-slate-300 px-1.5 py-1 text-xs text-slate-600"
    >
      <option value="">{label}</option>
      {categories.map((cat) => (
        <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
          {FUNCTION_CATALOG.filter((f) => f.category === cat).map((f) => (
            <option key={f.name} value={f.name} title={f.description}>
              {f.label}()
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
