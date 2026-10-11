import { useMemo, useRef, useState } from 'react';
import { Braces } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EXPRESSION_TOKENS,
  expressionSuggestions,
  validateExpression,
  type ExpressionToken,
} from '@/lib/expressions';

/**
 * Text / textarea input with `{{ … }}` expression autocomplete + inline
 * validation. Drop-in for pipeline config fields that accept templates.
 */
export function ExpressionField({
  value,
  onChange,
  placeholder,
  multiline,
  rows = 4,
  mono,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const trailingFragment = useMemo(() => {
    const m = value.match(/\{\{([^}]*)$/);
    return m ? m[1] : null;
  }, [value]);

  const suggestions = useMemo<ExpressionToken[]>(() => {
    if (showAll) return EXPRESSION_TOKENS;
    if (trailingFragment === null) return [];
    return expressionSuggestions(trailingFragment);
  }, [trailingFragment, showAll]);

  const validation = useMemo(() => validateExpression(value), [value]);

  const insert = (tok: ExpressionToken) => {
    let next: string;
    if (trailingFragment !== null) {
      next = value.replace(/\{\{[^}]*$/, tok.insert);
    } else {
      next = value + tok.insert;
    }
    onChange(next);
    setOpen(false);
    setShowAll(false);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const base =
    'w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 ' +
    (validation.ok
      ? 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
      : 'border-red-300 focus:border-red-400 focus:ring-red-100');

  const commonProps = {
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      setOpen(/\{\{[^}]*$/.test(e.target.value));
    },
    onBlur: () => setTimeout(() => setOpen(false), 150),
    className: cn(base, mono && 'font-mono text-xs', className),
  };

  return (
    <div className="relative">
      <div className="relative">
        {multiline ? (
          <textarea ref={ref as React.Ref<HTMLTextAreaElement>} {...commonProps} rows={rows} />
        ) : (
          <input ref={ref as React.Ref<HTMLInputElement>} {...commonProps} />
        )}
        <button
          type="button"
          onClick={() => {
            setShowAll((s) => !s);
            setOpen((o) => !o || !showAll);
          }}
          className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Insert expression token"
          tabIndex={-1}
        >
          <Braces className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {suggestions.map((t) => (
            <button
              key={t.token}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insert(t);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50"
            >
              <span className="font-mono text-slate-700">{t.insert}</span>
              <span className={cn('shrink-0', t.kind === 'function' ? 'text-violet-500' : 'text-slate-400')}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {!validation.ok && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-red-600">
          {validation.errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
