import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Braces,
  Database,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  DEFAULT_POPULATION_FIELDS,
  mergeTag,
  type PopulationFieldDef,
} from '@/lib/template-personalization';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { useTenantScope } from '@/contexts/AuthContext';

type Ctx = {
  fields: PopulationFieldDef[];
  sampleRow?: Record<string, unknown> | null;
  dark?: boolean;
};

const TemplatePersonalizationContext = createContext<Ctx>({
  fields: DEFAULT_POPULATION_FIELDS,
});

export function TemplatePersonalizationProvider({
  fields = DEFAULT_POPULATION_FIELDS,
  sampleRow,
  dark,
  children,
}: {
  fields?: PopulationFieldDef[];
  sampleRow?: Record<string, unknown> | null;
  dark?: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ fields, sampleRow, dark }), [fields, sampleRow, dark]);
  return (
    <TemplatePersonalizationContext.Provider value={value}>
      {children}
    </TemplatePersonalizationContext.Provider>
  );
}

export function useTemplatePersonalization() {
  return useContext(TemplatePersonalizationContext);
}

export function insertTagAtCursor(
  current: string,
  fieldKey: string,
  element?: HTMLInputElement | HTMLTextAreaElement | null,
): { value: string; cursor: number } {
  const token = mergeTag(fieldKey);
  const cur = current ?? '';
  if (!element) {
    const value = cur ? `${cur}${cur.endsWith(' ') ? '' : ' '}${token}` : token;
    return { value, cursor: value.length };
  }
  const start = typeof element.selectionStart === 'number' ? element.selectionStart : cur.length;
  const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : cur.length;
  const value = cur.slice(0, start) + token + cur.slice(end);
  return { value, cursor: start + token.length };
}

function focusCursor(element: HTMLInputElement | HTMLTextAreaElement, cursor: number) {
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(cursor, cursor);
  });
}

type PickerProps = {
  onSelect: (fieldKey: string) => void;
  className?: string;
  variant?: 'compact' | 'badge';
};

export function PersonalizationPickerButton({
  onSelect,
  className,
  variant = 'compact',
}: PickerProps) {
  const { tenantId, environment } = useTenantScope();
  const { fields: ctxFields } = useTemplatePersonalization();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280,
  });

  // Fetch dynamic custom schemas
  const { data: schemas } = useQuery({
    queryKey: ['schemas-with-fields', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const allFields = useMemo(() => {
    const base = [...ctxFields];
    if (!schemas) return base;

    for (const s of schemas) {
      for (const f of s.schema_fields) {
        const fieldName = String(f.name ?? '');
        if (fieldName && !base.some((d) => d.key === fieldName)) {
          base.push({
            key: fieldName,
            label: String(f.label ?? fieldName),
            group: 'query',
            sample: String(f.default_value ?? ''),
          });
        }
      }
    }
    return base;
  }, [ctxFields, schemas]);

  const filteredFields = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allFields;
    return allFields.filter(
      (f) =>
        f.key.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        (f.sample ?? '').toLowerCase().includes(q),
    );
  }, [allFields, search]);

  const profileFields = filteredFields.filter((f) => f.group !== 'query');
  const customFields = filteredFields.filter((f) => f.group === 'query');

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(290, window.innerWidth - 24);

    let left = rect.right - width;
    if (left < 12) left = 12;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }

    let top = rect.bottom + 6;
    if (top + 290 > window.innerHeight && rect.top > 300) {
      top = rect.top - 296;
    }

    setPosition({ top, left, width });
  };

  const handleToggle = () => {
    if (!open) {
      updatePosition();
      setOpen(true);
    } else {
      setOpen(false);
      setSearch('');
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onDoc = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };

    const onScrollOrResize = () => updatePosition();

    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Insert Customer Personalization Token {{token}}"
        onMouseDown={(e) => {
          // Prevent losing input selection
          e.preventDefault();
        }}
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-xs font-bold transition shadow-2xs ${
          open
            ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
            : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700'
        } ${className ?? ''}`}
      >
        <Braces className="h-3.5 w-3.5 text-brand-600" />
        {variant === 'badge' && (
          <span className="text-[10px] font-mono font-extrabold text-brand-700">Token</span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
              zIndex: 99999,
            }}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                <span className="text-xs font-extrabold text-slate-800">Customer Tokens</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSearch('');
                }}
                className="rounded-lg p-0.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-2 border-b border-slate-100 bg-white">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search token (e.g. first_name)…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-8 pr-3 py-1 text-xs focus:bg-white focus:border-brand-500 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Tokens Scrollable List */}
            <div className="max-h-60 overflow-y-auto p-1.5 space-y-2">
              {profileFields.length > 0 && (
                <div>
                  <p className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <User className="h-3 w-3" /> Profile Attributes
                  </p>
                  <div className="space-y-0.5">
                    {profileFields.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()} // Keeps cursor focus on target input
                        onClick={() => {
                          onSelect(f.key);
                          setOpen(false);
                          setSearch('');
                        }}
                        className="group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left hover:bg-brand-50 transition"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-800 group-hover:text-brand-800">
                            {f.label}
                          </p>
                          <p className="font-mono text-[10px] text-brand-600 font-bold">
                            {mergeTag(f.key)}
                          </p>
                        </div>
                        {f.sample && (
                          <span className="shrink-0 text-[10px] text-slate-400 italic">
                            {f.sample}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {customFields.length > 0 && (
                <div>
                  <p className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Database className="h-3 w-3" /> Custom Schemas
                  </p>
                  <div className="space-y-0.5">
                    {customFields.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onSelect(f.key);
                          setOpen(false);
                          setSearch('');
                        }}
                        className="group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left hover:bg-brand-50 transition"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-800 group-hover:text-brand-800">
                            {f.label}
                          </p>
                          <p className="font-mono text-[10px] text-brand-600 font-bold">
                            {mergeTag(f.key)}
                          </p>
                        </div>
                        {f.sample && (
                          <span className="shrink-0 text-[10px] text-slate-400 italic">
                            {f.sample}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!profileFields.length && !customFields.length && (
                <p className="p-4 text-center text-xs text-slate-400 italic">
                  No tokens match &ldquo;{search}&rdquo;
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  labelClassName?: string;
  inputClassName?: string;
};

export function PersonalizedInput({
  label,
  value,
  onChange,
  labelClassName = 'mb-1 block font-bold text-slate-700 text-xs',
  inputClassName = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none pr-9 font-medium',
  className = 'space-y-1',
  ...props
}: InputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const insertField = (fieldKey: string) => {
    const { value: next, cursor } = insertTagAtCursor(value ?? '', fieldKey, inputRef.current);
    onChange(next);
    if (inputRef.current) focusCursor(inputRef.current, cursor);
  };

  return (
    <div className={className}>
      {label && <label className={labelClassName}>{label}</label>}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputClassName}
          {...props}
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <PersonalizationPickerButton onSelect={insertField} />
        </div>
      </div>
    </div>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  labelClassName?: string;
  inputClassName?: string;
};

export function PersonalizedTextarea({
  label,
  value,
  onChange,
  labelClassName = 'mb-1 block font-bold text-slate-700 text-xs',
  inputClassName = 'w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-brand-500 focus:outline-none font-medium',
  className = 'space-y-1',
  rows = 3,
  ...props
}: TextareaProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const insertField = (fieldKey: string) => {
    const { value: next, cursor } = insertTagAtCursor(value ?? '', fieldKey, inputRef.current);
    onChange(next);
    if (inputRef.current) focusCursor(inputRef.current, cursor);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        {label && <label className={labelClassName}>{label}</label>}
        <div className="mb-1">
          <PersonalizationPickerButton onSelect={insertField} variant="badge" />
        </div>
      </div>
      <textarea
        ref={inputRef}
        rows={rows}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
        {...props}
      />
    </div>
  );
}
