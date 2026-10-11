/**
 * Shared input primitives for the cohort rule builder.
 *
 * Every picker is backed by the semantic catalog, so nothing selectable here
 * can fail validation — the same `matchScore` the AI agent uses for grounding
 * ranks the suggestions, which keeps manual and AI-built cohorts consistent.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Sparkles, X } from 'lucide-react';
import {
  COUNT_OPERATOR_LABELS,
  PROPERTY_OPERATOR_LABELS,
  TIME_WINDOW_PRESETS,
  describeWindow,
  isListOperator,
  isNullaryOperator,
  isRangeOperator,
  type CountOperator,
  type PropertyOperator,
  type TimeUnit,
  type TimeWindow,
} from '@/lib/cohorts/ir';
import {
  popularEvents,
  popularProperties,
  suggestEvents,
  suggestMetrics,
  suggestProperties,
  type CatalogEvent,
  type CatalogMetric,
  type CatalogProperty,
  type SemanticCatalog,
} from '@/lib/cohorts/catalog';
import type { FieldType } from '@/lib/schema-filters';

/* ------------------------------------------------------------------ *
 * Low-level chrome
 * ------------------------------------------------------------------ */

export const inputClass =
  'h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-800 outline-hidden transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400';

export const selectClass = `${inputClass} cursor-pointer pr-7 appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E")] bg-[length:14px] bg-[right_0.4rem_center] bg-no-repeat`;

/** Popover anchored to a trigger, closing on outside click and Escape. */
function Popover({
  open,
  onClose,
  children,
  align = 'left',
  width = 'w-80',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute top-full z-50 mt-1 ${width} ${
        align === 'right' ? 'right-0' : 'left-0'
      } overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl`}
    >
      {children}
    </div>
  );
}

function TriggerButton({
  label,
  placeholder,
  onClick,
  tone = 'default',
  title,
}: {
  label?: string;
  placeholder: string;
  onClick: () => void;
  tone?: 'default' | 'event' | 'metric';
  title?: string;
}) {
  const toneClass =
    tone === 'event'
      ? 'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300'
      : tone === 'metric'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300'
        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label ?? placeholder}
      className={`flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium outline-hidden transition focus:ring-2 focus:ring-indigo-100 ${toneClass}`}
    >
      <span className={`truncate ${label ? '' : 'text-slate-400'}`}>{label || placeholder}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </button>
  );
}

function SearchHeader({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] text-slate-800 outline-hidden placeholder:text-slate-400"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-slate-400 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function OptionRow({
  title,
  subtitle,
  meta,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-slate-50 ${
        selected ? 'bg-indigo-50/60' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-slate-800">{title}</div>
        {subtitle && <div className="truncate text-[11px] text-slate-500">{subtitle}</div>}
      </div>
      {meta && <span className="shrink-0 text-[10px] font-medium text-slate-400">{meta}</span>}
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-50/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Property picker
 * ------------------------------------------------------------------ */

export function PropertyPicker({
  catalog,
  value,
  onChange,
  placeholder = 'Select attribute',
}: {
  catalog: SemanticCatalog;
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = catalog.properties.find((p) => p.key === value);

  const groups = useMemo(() => {
    if (query.trim()) {
      return [{ label: 'Matches', items: suggestProperties(catalog, query, 30).map((s) => s.item) }];
    }
    const popular = popularProperties(catalog, 8);
    const byGroup = new Map<string, CatalogProperty[]>();
    for (const p of catalog.properties) {
      const list = byGroup.get(p.group) ?? [];
      list.push(p);
      byGroup.set(p.group, list);
    }
    return [
      { label: 'Frequently used', items: popular },
      ...[...byGroup.entries()].map(([label, items]) => ({ label, items })),
    ];
  }, [catalog, query]);

  return (
    <div className="relative">
      <TriggerButton
        label={selected?.label}
        placeholder={placeholder}
        onClick={() => setOpen((o) => !o)}
      />
      <Popover open={open} onClose={() => setOpen(false)} width="w-72">
        <SearchHeader value={query} onChange={setQuery} placeholder="Search attributes…" />
        <div className="max-h-72 overflow-y-auto py-1">
          {groups.map((group) =>
            group.items.length ? (
              <div key={group.label}>
                <SectionLabel>{group.label}</SectionLabel>
                {group.items.map((p) => (
                  <OptionRow
                    key={`${group.label}-${p.key}`}
                    title={p.label}
                    subtitle={p.sampleValues?.slice(0, 3).join(' · ')}
                    meta={p.coverage !== undefined ? `${Math.round(p.coverage * 100)}%` : undefined}
                    selected={p.key === value}
                    onClick={() => {
                      onChange(p.key);
                      setOpen(false);
                      setQuery('');
                    }}
                  />
                ))}
              </div>
            ) : null,
          )}
          {!groups.some((g) => g.items.length) && (
            <div className="px-3 py-6 text-center text-[12px] text-slate-400">
              No attribute matches “{query}”.
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Event picker
 * ------------------------------------------------------------------ */

export function EventPicker({
  catalog,
  value,
  onChange,
  placeholder = 'Select event',
}: {
  catalog: SemanticCatalog;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = catalog.events.find((e) => e.name === value);

  const sections = useMemo((): { label: string; items: CatalogEvent[] }[] => {
    if (query.trim()) {
      return [{ label: 'Matches', items: suggestEvents(catalog, query, 30).map((s) => s.item) }];
    }
    const popular = popularEvents(catalog, 6);
    const popularNames = new Set(popular.map((e) => e.name));
    return [
      { label: 'Most active', items: popular },
      { label: 'All events', items: catalog.events.filter((e) => !popularNames.has(e.name)) },
    ];
  }, [catalog, query]);

  return (
    <div className="relative">
      <TriggerButton
        label={selected?.label}
        placeholder={placeholder}
        tone="event"
        onClick={() => setOpen((o) => !o)}
      />
      <Popover open={open} onClose={() => setOpen(false)} width="w-80">
        <SearchHeader value={query} onChange={setQuery} placeholder="Search events…" />
        <div className="max-h-72 overflow-y-auto py-1">
          {sections.map((section) =>
            section.items.length ? (
              <div key={section.label}>
                <SectionLabel>{section.label}</SectionLabel>
                {section.items.map((e) => (
                  <OptionRow
                    key={`${section.label}-${e.name}`}
                    title={e.label}
                    subtitle={`${e.name}${e.properties.length ? ` · ${e.properties.length} properties` : ''}`}
                    meta={`${e.uniqueUsers.toLocaleString()} people`}
                    selected={e.name === value}
                    onClick={() => {
                      onChange(e.name);
                      setOpen(false);
                      setQuery('');
                    }}
                  />
                ))}
              </div>
            ) : null,
          )}
          {!catalog.events.length && (
            <div className="px-3 py-6 text-center text-[12px] text-slate-400">
              No events have been tracked yet.
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Metric picker
 * ------------------------------------------------------------------ */

export function MetricPicker({
  catalog,
  value,
  onChange,
}: {
  catalog: SemanticCatalog;
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = catalog.metrics.find((m) => m.key === value);

  const items: CatalogMetric[] = query.trim()
    ? suggestMetrics(catalog, query, 20).map((s) => s.item)
    : catalog.metrics;

  return (
    <div className="relative">
      <TriggerButton
        label={selected?.label}
        placeholder="Select metric"
        tone="metric"
        onClick={() => setOpen((o) => !o)}
      />
      <Popover open={open} onClose={() => setOpen(false)} width="w-80">
        <SearchHeader value={query} onChange={setQuery} placeholder="Search metrics…" />
        <div className="max-h-72 overflow-y-auto py-1">
          {items.map((m) => (
            <OptionRow
              key={m.key}
              title={m.label}
              subtitle={m.description}
              selected={m.key === value}
              onClick={() => {
                onChange(m.key);
                setOpen(false);
                setQuery('');
              }}
            />
          ))}
        </div>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Operator selects
 * ------------------------------------------------------------------ */

const STRING_OPS: PropertyOperator[] = [
  'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with',
  'in', 'not_in', 'is_set', 'is_not_set',
];
const NUMBER_OPS: PropertyOperator[] = [
  'equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'between', 'is_set', 'is_not_set',
];
const ENUM_OPS: PropertyOperator[] = ['equals', 'not_equals', 'in', 'not_in', 'is_set', 'is_not_set'];
const DATE_OPS: PropertyOperator[] = ['gt', 'gte', 'lt', 'lte', 'between', 'is_set', 'is_not_set'];

export function operatorsForFieldType(type: FieldType): PropertyOperator[] {
  switch (type) {
    case 'number':
      return NUMBER_OPS;
    case 'boolean':
    case 'enum':
      return ENUM_OPS;
    case 'date':
    case 'timestamp':
      return DATE_OPS;
    default:
      return STRING_OPS;
  }
}

export function OperatorSelect({
  value,
  onChange,
  options,
}: {
  value: PropertyOperator;
  onChange: (op: PropertyOperator) => void;
  options: PropertyOperator[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PropertyOperator)}
      className={selectClass}
    >
      {options.map((op) => (
        <option key={op} value={op}>
          {PROPERTY_OPERATOR_LABELS[op]}
        </option>
      ))}
    </select>
  );
}

export function CountOperatorSelect({
  value,
  onChange,
}: {
  value: CountOperator;
  onChange: (op: CountOperator) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CountOperator)}
      className={selectClass}
    >
      {(Object.keys(COUNT_OPERATOR_LABELS) as CountOperator[]).map((op) => (
        <option key={op} value={op}>
          {COUNT_OPERATOR_LABELS[op]}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ *
 * Value input — shape follows the property type and operator
 * ------------------------------------------------------------------ */

export function ValueInput({
  property,
  operator,
  value,
  value2,
  values,
  onChange,
}: {
  property?: CatalogProperty;
  operator: PropertyOperator;
  value: string | number | boolean | null | undefined;
  value2?: string | number | null;
  values?: (string | number)[];
  onChange: (patch: { value?: unknown; value2?: unknown; values?: (string | number)[] }) => void;
}) {
  const [listDraft, setListDraft] = useState('');

  if (isNullaryOperator(operator)) return null;

  const type = property?.type ?? 'string';

  if (isListOperator(operator)) {
    const current = values ?? [];
    return (
      <div className="flex flex-wrap items-center gap-1">
        {current.map((v) => (
          <span
            key={String(v)}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] text-slate-700"
          >
            {String(v)}
            <button
              type="button"
              onClick={() => onChange({ values: current.filter((x) => x !== v) })}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          list={property ? `vals-${property.key}` : undefined}
          value={listDraft}
          onChange={(e) => setListDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && listDraft.trim()) {
              e.preventDefault();
              onChange({ values: [...current, listDraft.trim()] });
              setListDraft('');
            }
          }}
          onBlur={() => {
            if (listDraft.trim()) {
              onChange({ values: [...current, listDraft.trim()] });
              setListDraft('');
            }
          }}
          placeholder="Add value…"
          className={`${inputClass} w-32`}
        />
        {property?.sampleValues && (
          <datalist id={`vals-${property.key}`}>
            {property.sampleValues.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        )}
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <select
        value={String(value ?? 'true')}
        onChange={(e) => onChange({ value: e.target.value })}
        className={selectClass}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  const inputType = type === 'number' ? 'number' : type === 'date' || type === 'timestamp' ? 'date' : 'text';

  return (
    <div className="flex items-center gap-1.5">
      <input
        type={inputType}
        list={property?.sampleValues?.length ? `vals-${property.key}` : undefined}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="Value"
        className={`${inputClass} w-36`}
      />
      {property?.sampleValues?.length ? (
        <datalist id={`vals-${property.key}`}>
          {property.sampleValues.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ) : null}
      {isRangeOperator(operator) && (
        <>
          <span className="text-[12px] text-slate-400">and</span>
          <input
            type={inputType}
            value={value2 == null ? '' : String(value2)}
            onChange={(e) => onChange({ value2: e.target.value })}
            placeholder="Upper"
            className={`${inputClass} w-28`}
          />
        </>
      )}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  width = 'w-16',
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  width?: string;
}) {
  return (
    <input
      type="number"
      min={min}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${inputClass} ${width} tabular-nums`}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Time window picker
 * ------------------------------------------------------------------ */

const UNITS: TimeUnit[] = ['minute', 'hour', 'day', 'week', 'month'];

export function TimeWindowPicker({
  value,
  onChange,
}: {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'preset' | 'relative' | 'absolute'>('preset');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white"
      >
        <span className="truncate">{describeWindow(value)}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} width="w-72">
        <div className="flex border-b border-slate-100 text-[12px]">
          {(['preset', 'relative', 'absolute'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 px-3 py-2 font-medium capitalize transition ${
                mode === m ? 'border-b-2 border-indigo-500 text-indigo-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'preset' && (
          <div className="max-h-64 overflow-y-auto py-1">
            {TIME_WINDOW_PRESETS.map((p) => (
              <OptionRow
                key={p.label}
                title={p.label}
                selected={describeWindow(p.window) === describeWindow(value)}
                onClick={() => {
                  onChange(p.window);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        )}

        {mode === 'relative' && (
          <div className="flex items-center gap-2 p-3">
            <span className="text-[13px] text-slate-500">Last</span>
            <input
              type="number"
              min={1}
              value={value.kind === 'last' ? value.value : 30}
              onChange={(e) =>
                onChange({
                  kind: 'last',
                  value: Math.max(1, Number(e.target.value)),
                  unit: value.kind === 'last' ? value.unit : 'day',
                })
              }
              className={`${inputClass} w-20 tabular-nums`}
            />
            <select
              value={value.kind === 'last' ? value.unit : 'day'}
              onChange={(e) =>
                onChange({
                  kind: 'last',
                  value: value.kind === 'last' ? value.value : 30,
                  unit: e.target.value as TimeUnit,
                })
              }
              className={selectClass}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}s
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'absolute' && (
          <div className="space-y-2 p-3">
            <label className="block text-[11px] font-medium text-slate-500">
              From
              <input
                type="date"
                value={value.kind === 'between' ? value.start.slice(0, 10) : ''}
                onChange={(e) =>
                  onChange({
                    kind: 'between',
                    start: e.target.value,
                    end: value.kind === 'between' ? value.end : new Date().toISOString().slice(0, 10),
                  })
                }
                className={`${inputClass} mt-1 w-full`}
              />
            </label>
            <label className="block text-[11px] font-medium text-slate-500">
              To
              <input
                type="date"
                value={value.kind === 'between' ? value.end.slice(0, 10) : ''}
                onChange={(e) =>
                  onChange({
                    kind: 'between',
                    start: value.kind === 'between' ? value.start : new Date().toISOString().slice(0, 10),
                    end: e.target.value,
                  })
                }
                className={`${inputClass} mt-1 w-full`}
              />
            </label>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800"
            >
              Apply
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Suggestion chips — the "did you mean …?" affordance
 * ------------------------------------------------------------------ */

export function SuggestionChips({
  suggestions,
  onPick,
  label = 'Did you mean',
}: {
  suggestions: { label: string; value: string }[];
  onPick: (value: string) => void;
  label?: string;
}) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-slate-500">{label}</span>
      {suggestions.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onPick(s.value)}
          className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100"
        >
          <Sparkles className="h-2.5 w-2.5" />
          {s.label}
        </button>
      ))}
    </div>
  );
}
