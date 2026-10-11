import {
  Plus,
  Split,
  Trash2,
  Type,
  Mail,
  Phone,
  Hash,
  Calendar,
  AlignLeft,
  ChevronDown,
  Circle,
  CheckSquare,
  Star,
  Heading,
  Minus,
  EyeOff,
  ScrollText,
  Link as LinkIcon,
  MousePointer2,
} from 'lucide-react';
import { PanelSection } from '@/components/landing-pages/studio/StudioFields';
import {
  FORM_FIELD_TYPES,
  NON_INPUT_FIELD_TYPES,
  normalizeFieldName,
  type FormConditionOperator,
  type FormField,
  type FormFieldType,
  type FormFieldWidth,
} from '@/lib/forms';

const FIELD_ICONS: Record<FormFieldType, typeof Type> = {
  text: Type,
  email: Mail,
  phone: Phone,
  url: LinkIcon,
  number: Hash,
  date: Calendar,
  textarea: AlignLeft,
  select: ChevronDown,
  radio: Circle,
  multiselect: CheckSquare,
  checkbox: CheckSquare,
  rating: Star,
  heading: Heading,
  divider: Minus,
  hidden: EyeOff,
  consent: ScrollText,
};

const CONDITION_OPERATORS: Array<{ value: FormConditionOperator; label: string }> = [
  { value: 'equals', label: 'is equal to' },
  { value: 'not_equals', label: 'is not equal to' },
  { value: 'contains', label: 'contains' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, x) => x !== i))}
            disabled={options.length <= 1}
            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-bold text-slate-500 hover:border-brand-400 hover:text-brand-700 transition"
      >
        <Plus className="h-3 w-3" /> Add option
      </button>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 transition';

type Props = {
  field: FormField | null;
  allFields: FormField[];
  onUpdate: (id: string, patch: Partial<FormField>) => void;
};

export function StudioInspector({ field, allFields, onUpdate }: Props) {
  if (!field) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
          <MousePointer2 className="h-5 w-5 text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-500">No field selected</p>
          <p className="mt-1 text-[11px] text-slate-400">Click a field on the canvas to edit its properties</p>
        </div>
      </div>
    );
  }

  const Icon = FIELD_ICONS[field.field_type] ?? Type;
  const isLayoutOnly = NON_INPUT_FIELD_TYPES.includes(field.field_type);
  const hasChoices = field.field_type === 'select' || field.field_type === 'radio' || field.field_type === 'multiselect';
  const isTextLike = field.field_type === 'text' || field.field_type === 'textarea' || field.field_type === 'url';
  const isNumberLike = field.field_type === 'number' || field.field_type === 'rating';
  const otherFields = allFields.filter((f) => f.id !== field.id && f.field_type !== 'heading' && f.field_type !== 'divider');

  const update = (patch: Partial<FormField>) => onUpdate(field.id, patch);

  return (
    <div className="flex flex-col">
      {/* Styled header */}
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{field.label || 'Untitled Field'}</p>
            <p className="text-[11px] text-slate-400 font-mono">{field.field_type} · {field.name}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <PanelSection title="Content">
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {field.field_type === 'heading' ? 'Heading Text' : 'Display Label'}
              </label>
              <input
                value={field.label}
                onChange={(e) =>
                  update({ label: e.target.value, name: normalizeFieldName(e.target.value) || field.name })
                }
                className={inputCls}
              />
            </div>

            {field.field_type === 'heading' && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Subtext</label>
                <input
                  value={field.content ?? ''}
                  onChange={(e) => update({ content: e.target.value })}
                  className={inputCls}
                  placeholder="Short description under the heading…"
                />
              </div>
            )}

            {!isLayoutOnly && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Field Key</label>
                <input
                  value={field.name}
                  onChange={(e) => update({ name: normalizeFieldName(e.target.value) })}
                  className={`${inputCls} font-mono text-slate-600`}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Type</label>
                <select
                  value={field.field_type}
                  onChange={(e) => update({ field_type: e.target.value as FormFieldType })}
                  className={inputCls}
                >
                  {FORM_FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Width</label>
                <select
                  value={field.width ?? 'full'}
                  disabled={isLayoutOnly}
                  onChange={(e) => update({ width: e.target.value as FormFieldWidth })}
                  className={`${inputCls} disabled:opacity-40`}
                >
                  <option value="full">Full (100%)</option>
                  <option value="half">Half (50%)</option>
                </select>
              </div>
            </div>

            {!isLayoutOnly && field.field_type !== 'consent' && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Placeholder</label>
                <input
                  value={field.placeholder ?? ''}
                  onChange={(e) => update({ placeholder: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Enter your email…"
                />
              </div>
            )}

            {field.field_type === 'consent' && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Consent Text</label>
                <input
                  value={field.placeholder ?? ''}
                  onChange={(e) => update({ placeholder: e.target.value })}
                  className={inputCls}
                  placeholder="I agree to the Terms of Service"
                />
              </div>
            )}

            {field.field_type === 'hidden' && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Default Value</label>
                <input
                  value={field.default_value ?? ''}
                  onChange={(e) => update({ default_value: e.target.value })}
                  className={`${inputCls} font-mono text-slate-600`}
                  placeholder="Static value or auto-captured query param"
                />
              </div>
            )}

            {field.field_type === 'rating' && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Stars</label>
                <select
                  value={field.max_value ?? 5}
                  onChange={(e) => update({ max_value: Number(e.target.value) })}
                  className={inputCls}
                >
                  {[3, 5, 10].map((n) => <option key={n} value={n}>{n} stars</option>)}
                </select>
              </div>
            )}

            {!isLayoutOnly && field.field_type !== 'hidden' && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Helper Text</label>
                <input
                  value={field.help_text ?? ''}
                  onChange={(e) => update({ help_text: e.target.value })}
                  className={inputCls}
                  placeholder="Optional helper text below the input…"
                />
              </div>
            )}
          </div>
        </PanelSection>

        {hasChoices && (
          <PanelSection title="Choices">
            <OptionsEditor
              options={field.options ?? []}
              onChange={(next) => update({ options: next })}
            />
          </PanelSection>
        )}

        {!isLayoutOnly && field.field_type !== 'hidden' && (
          <PanelSection title="Validation" defaultOpen={false}>
            <div className="space-y-3">
              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  checked={field.required ?? false}
                  onChange={(e) => update({ required: e.target.checked })}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-semibold text-slate-700">Required field</span>
              </label>

              {isTextLike && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Min Length</label>
                    <input
                      type="number"
                      min={0}
                      value={field.min_length ?? ''}
                      onChange={(e) => update({ min_length: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Max Length</label>
                    <input
                      type="number"
                      min={0}
                      value={field.max_length ?? ''}
                      onChange={(e) => update({ max_length: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              {isNumberLike && field.field_type !== 'rating' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Min Value</label>
                    <input
                      type="number"
                      value={field.min_value ?? ''}
                      onChange={(e) => update({ min_value: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Max Value</label>
                    <input
                      type="number"
                      value={field.max_value ?? ''}
                      onChange={(e) => update({ max_value: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              {isTextLike && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pattern (Regex)</label>
                  <input
                    value={field.pattern ?? ''}
                    onChange={(e) => update({ pattern: e.target.value })}
                    className={`${inputCls} font-mono text-[11px]`}
                    placeholder="e.g. ^[A-Z]{2}\d{4}$"
                  />
                  {field.pattern && (
                    <input
                      value={field.pattern_error ?? ''}
                      onChange={(e) => update({ pattern_error: e.target.value })}
                      className={`${inputCls} mt-2`}
                      placeholder="Custom error message"
                    />
                  )}
                </div>
              )}
            </div>
          </PanelSection>
        )}

        {!isLayoutOnly && (
          <PanelSection title="Conditional logic" defaultOpen={Boolean(field.condition?.field)}>
            <div className="space-y-2.5">
              <p className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-[11px] text-violet-700">
                <Split className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                Only show when another field matches a rule.
              </p>
              <select
                value={field.condition?.field ?? ''}
                onChange={(e) =>
                  update({
                    condition: e.target.value
                      ? { field: e.target.value, operator: field.condition?.operator ?? 'equals', value: field.condition?.value ?? '' }
                      : null,
                  })
                }
                className={inputCls}
              >
                <option value="">No condition — always show</option>
                {otherFields.map((f) => (
                  <option key={f.id} value={f.name}>{f.label} ({f.name})</option>
                ))}
              </select>

              {field.condition?.field && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={field.condition.operator}
                    onChange={(e) =>
                      update({ condition: { ...field.condition!, operator: e.target.value as FormConditionOperator } })
                    }
                    className={inputCls}
                  >
                    {CONDITION_OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  {field.condition.operator !== 'is_empty' && field.condition.operator !== 'is_not_empty' && (
                    <input
                      value={field.condition.value ?? ''}
                      onChange={(e) =>
                        update({ condition: { ...field.condition!, value: e.target.value } })
                      }
                      placeholder="Value…"
                      className={inputCls}
                    />
                  )}
                </div>
              )}
            </div>
          </PanelSection>
        )}
      </div>
    </div>
  );
}
