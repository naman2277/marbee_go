/**
 * Shared presentational primitives for the channel studios. Deliberately tiny
 * and unopinionated so every channel composer looks like one product.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Plus, Sparkles } from 'lucide-react';
import { COMMON_VARIABLE_GROUPS, spliceToken } from './channel-studio-utils';

/* ----------------------------- layout ----------------------------- */

export function StudioSection({
  title,
  description,
  children,
  right,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] text-slate-400">{description}</p>}
        </div>
        {right}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1">
      <span className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-700">{label}</span>
        {hint && <span className="text-[10px] font-medium text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ----------------------------- inputs ----------------------------- */

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-hidden transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-[96px] resize-y leading-relaxed ${props.className ?? ''}`} />;
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} cursor-pointer appearance-none pr-8`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
    </div>
  );
}

export function SegRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ComponentType<{ className?: string }> }>;
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
              active ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300"
    >
      <span>
        <span className="block text-[11px] font-bold text-slate-700">{label}</span>
        {description && <span className="block text-[10px] text-slate-400">{description}</span>}
      </span>
      <span
        className={`relative h-4.5 w-8 shrink-0 rounded-full transition ${checked ? 'bg-violet-600' : 'bg-slate-200'}`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

/* ------------------- variable-aware text control ------------------- */

export function VariableTextArea({
  value,
  onChange,
  placeholder,
  rows,
  maxLength,
  extraGroups,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  extraGroups?: Array<{ group: string; tags: Array<{ label: string; token: string }> }>;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const id = useId();
  const groups = [...(extraGroups ?? []), ...COMMON_VARIABLE_GROUPS];

  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = spliceToken(value, start, end, token);
    onChange(next.value);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      try {
        el?.setSelectionRange(next.caret, next.caret);
      } catch {
        /* noop */
      }
    });
  };

  const wrap = (before: string, after = before) => {
    const el = ref.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    if (start === end) return;
    const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => el?.focus());
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <FormatBtn onClick={() => wrap('*')} title="Bold">
          <span className="font-black">B</span>
        </FormatBtn>
        <FormatBtn onClick={() => wrap('_')} title="Italic">
          <span className="italic">I</span>
        </FormatBtn>
        <FormatBtn onClick={() => wrap('~')} title="Strikethrough">
          <span className="line-through">S</span>
        </FormatBtn>
        <FormatBtn onClick={() => wrap('```')} title="Monospace">
          <span className="font-mono">{'</>'}</span>
        </FormatBtn>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
              menuOpen ? 'border-violet-400 bg-violet-600 text-white' : 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400'
            }`}
          >
            <Sparkles className="h-3 w-3" /> Variable
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-8 z-50 max-h-64 w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl [scrollbar-width:thin]">
                {groups.map((g) => (
                  <div key={g.group} className="mb-1.5 last:mb-0">
                    <div className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{g.group}</div>
                    {g.tags.map((t) => (
                      <button
                        key={t.token}
                        type="button"
                        onClick={() => insert(t.token)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-violet-50"
                      >
                        <span className="text-[11px] font-medium text-slate-700">{t.label}</span>
                        <span className="shrink-0 font-mono text-[9px] text-slate-400">{t.token}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows ?? 5}
        maxLength={maxLength}
        className={`${inputCls} resize-y leading-relaxed`}
      />
    </div>
  );
}

function FormatBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
    >
      {children}
    </button>
  );
}

/* --------------------------- misc bits --------------------------- */

export function CharMeter({ value, max, warnAt }: { value: number; max: number; warnAt?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const warn = value >= (warnAt ?? max);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${warn ? 'bg-amber-500' : 'bg-violet-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`shrink-0 font-mono text-[10px] tabular-nums ${warn ? 'text-amber-600' : 'text-slate-400'}`}>
        {value}/{max}
      </span>
    </div>
  );
}

export function AddButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-300 py-2 text-[11px] font-bold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/** Small toast used by the studio shell. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { msg, show };
}
