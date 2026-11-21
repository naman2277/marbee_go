import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Split,
  Star,
  X,
  ShieldCheck,
} from 'lucide-react';
import type { FormField, FormSchemaMapping, FormSettings, MarbeeForm } from '@/lib/forms';
import { DEFAULT_FORM_THEME, FORM_THEME_PRESETS, radiusClass } from '@/lib/form-design';
import { FormBanner } from '@/components/forms/FormBanner';
import { getFieldMappingLabel, isFieldMapped } from '@/lib/form-mapping';
import {
  buildHtmlFormDocument,
} from '@/lib/form-html-fields';

export type FormCanvasMode = 'edit' | 'mapping' | 'preview';

type Props = {
  form: MarbeeForm;
  mode: FormCanvasMode;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  onRemoveField?: (fieldId: string) => void;
  onMoveField?: (fieldId: string, direction: -1 | 1) => void;
  onDuplicateField?: (fieldId: string) => void;
  onOpenMapping?: (fieldId: string) => void;
  onReorderField?: (sourceId: string, targetId: string) => void;
  mapping?: FormSchemaMapping;
  htmlOverride?: string;
};

function fieldInputPreview(field: FormField) {
  const base =
    'w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 pointer-events-none';

  switch (field.field_type) {
    case 'textarea':
      return <textarea disabled rows={3} placeholder={field.placeholder ?? 'Enter text…'} className={base} />;
    case 'select':
      return (
        <select disabled className={base}>
          <option>Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case 'radio':
      return (
        <div className="space-y-1 pointer-events-none">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-slate-500">
              <input type="radio" disabled />
              {o}
            </label>
          ))}
        </div>
      );
    case 'multiselect':
      return (
        <div className="space-y-1 pointer-events-none">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-slate-500">
              <input type="checkbox" disabled />
              {o}
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" disabled className="pointer-events-none" />
          {field.placeholder || field.label}
        </label>
      );
    case 'consent':
      return (
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" disabled className="pointer-events-none mt-0.5" />
          <span>{field.placeholder || field.label}</span>
        </label>
      );
    case 'rating':
      return (
        <div className="flex items-center gap-1 pointer-events-none">
          {Array.from({ length: field.max_value ?? 5 }).map((_, i) => (
            <Star key={i} className="h-5 w-5 text-slate-300" />
          ))}
        </div>
      );
    case 'hidden':
      return (
        <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-400">
          Hidden — not shown to visitors{field.default_value ? ` · default "${field.default_value}"` : ''}
        </div>
      );
    case 'heading':
      return (
        <div className="pointer-events-none">
          <p className="text-base font-bold text-slate-800">{field.label}</p>
          {field.content && <p className="mt-0.5 text-xs text-slate-400">{field.content}</p>}
        </div>
      );
    case 'divider':
      return <hr className="border-slate-200" />;
    default:
      return (
        <input
          type={
            field.field_type === 'email'
              ? 'email'
              : field.field_type === 'phone'
                ? 'tel'
                : field.field_type === 'url'
                  ? 'url'
                  : field.field_type === 'number'
                    ? 'number'
                    : field.field_type === 'date'
                      ? 'date'
                      : 'text'
          }
          disabled
          placeholder={field.placeholder ?? 'Enter value…'}
          className={base}
        />
      );
  }
}

const LAYOUT_ONLY_TYPES: FormField['field_type'][] = ['heading', 'divider'];
const NO_LABEL_TYPES: FormField['field_type'][] = ['checkbox', 'consent', 'heading', 'divider', 'hidden'];

function CanvasField({
  field,
  selected,
  mode,
  mapping,
  draggable,
  isDropTarget,
  onSelect,
  onRemove,
  onMove,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  field: FormField;
  selected: boolean;
  mode: FormCanvasMode;
  mapping?: FormSchemaMapping;
  draggable?: boolean;
  isDropTarget?: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
  onDuplicate?: () => void;
  onOpenMapping?: () => void;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}) {
  const mapped = mapping ? isFieldMapped(mapping, field.name) : false;
  const mappingLabel = mapping ? getFieldMappingLabel(mapping, field.name) : null;
  const interactive = mode !== 'preview';
  const isLayoutOnly = LAYOUT_ONLY_TYPES.includes(field.field_type);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDragOver?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      onDrop={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDrop?.();
      }}
      className={`relative ${isLayoutOnly ? 'sm:col-span-2' : field.width === 'half' ? 'sm:col-span-1' : 'sm:col-span-2'} ${
        isDropTarget ? 'rounded-lg outline-2 outline-dashed outline-brand-400 outline-offset-2' : ''
      }`}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect();
      }}
    >
      {selected && interactive && (
        <div className="absolute -top-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-700 px-1 py-1 shadow-lg">
          {draggable && (
            <span
              title="Drag to reorder"
              className="flex cursor-grab items-center rounded p-1.5 text-white/60 active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              title="Delete field"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {onMove && (
            <>
              <button
                type="button"
                title="Move up"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(-1);
                }}
                className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Move down"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(1);
                }}
                className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {onDuplicate && mode === 'edit' && (
            <button
              type="button"
              title="Duplicate"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div
        className={`rounded-lg p-3 transition-all ${
          selected && interactive
            ? 'border-2 border-blue-500 bg-blue-50/30 shadow-sm'
            : interactive
              ? 'border border-transparent hover:border-slate-200 hover:bg-slate-50/50'
              : 'border border-transparent'
        } ${mapped && mode === 'mapping' ? 'ring-1 ring-emerald-200' : ''} ${
          field.field_type === 'hidden' ? 'opacity-70' : ''
        }`}
      >
        {!NO_LABEL_TYPES.includes(field.field_type) && (
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {field.label}
            {field.required && <span className="text-red-500"> *</span>}
          </label>
        )}
        {fieldInputPreview(field)}
        {field.condition?.field && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-violet-600">
            <Split className="h-3 w-3" />
            Shown when <span className="font-mono">{field.condition.field}</span> {field.condition.operator.replace(/_/g, ' ')}
            {field.condition.value ? ` "${field.condition.value}"` : ''}
          </p>
        )}
        {mappingLabel && (mode === 'mapping' || mapped) && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-emerald-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {mappingLabel}
          </p>
        )}
        {field.help_text && <p className="mt-1 text-xs text-slate-400">{field.help_text}</p>}
      </div>
    </div>
  );
}

export function FormCanvas({
  form,
  mode,
  selectedFieldId,
  onSelectField,
  onRemoveField,
  onMoveField,
  onDuplicateField,
  onOpenMapping,
  onReorderField,
  mapping,
  htmlOverride,
}: Props) {
  const settings = form.settings as FormSettings;
  const fields = [...form.fields].sort((a, b) => a.sort_order - b.sort_order);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const theme = settings.theme ?? DEFAULT_FORM_THEME;
  const radius = radiusClass(theme.radius);
  const isHtmlMode = (settings.build_mode === 'html' || Boolean(htmlOverride)) && (htmlOverride ?? settings.html_content);

  const htmlContent = htmlOverride ?? settings.html_content ?? '';

  if (isHtmlMode) {
    const iframeDoc = buildHtmlFormDocument(htmlContent, {
      formTitle: form.name,
      formDescription: settings.description ?? '',
      canvasMode: mode !== 'preview',
      selectedFieldName: fields.find((f) => f.id === selectedFieldId)?.name,
      mapping,
    });

    return (
      <div
        className="flex min-h-[520px] flex-1 items-start justify-center overflow-auto bg-slate-100 p-6"
        onClick={() => mode !== 'preview' && onSelectField(null)}
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {fields.length === 0 && mode !== 'preview' && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              No fields detected. Add <code className="rounded bg-amber-100 px-1">name</code> attributes to your HTML inputs, then save.
            </div>
          )}
          <iframe
            title="Form canvas"
            srcDoc={iframeDoc}
            className="block min-h-[560px] w-full border-0"
            sandbox={mode !== 'preview' ? 'allow-same-origin allow-scripts' : 'allow-same-origin allow-scripts'}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[520px] flex-1 items-start justify-center overflow-auto bg-slate-100 p-6"
      onClick={() => mode !== 'preview' && onSelectField(null)}
    >
      <div
        className={`w-full max-w-lg overflow-hidden border border-slate-200 bg-white shadow-sm ${radius}`}
        onClick={(e) => e.stopPropagation()}
      >
        <FormBanner banner={settings.banner} formName={form.name} preset={theme.preset} />
        <div className="p-6">
          {!settings.banner?.enabled && (
            <>
              <h2 className="text-xl font-semibold text-slate-900">{form.name}</h2>
              {settings.description && (
                <p className="mt-1 text-sm text-slate-500">{settings.description}</p>
              )}
            </>
          )}

          {fields.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-center text-sm text-slate-500">
              No fields yet — add inputs from the left panel
            </div>
          ) : (
            <div className={`grid gap-3 sm:grid-cols-2 ${!settings.banner?.enabled ? 'mt-6' : ''}`}>
              {fields.map((field) => (
                <CanvasField
                  key={field.id}
                  field={field}
                  selected={selectedFieldId === field.id}
                  mode={mode}
                  mapping={mapping}
                  onSelect={() => onSelectField(field.id)}
                  onRemove={mode === 'edit' && onRemoveField ? () => onRemoveField(field.id) : undefined}
                  onMove={
                    mode === 'edit' && onMoveField
                      ? (dir) => onMoveField(field.id, dir)
                      : undefined
                  }
                  onDuplicate={
                    mode === 'edit' && onDuplicateField
                      ? () => onDuplicateField(field.id)
                      : undefined
                  }
                  onOpenMapping={
                    onOpenMapping ? () => onOpenMapping(field.id) : undefined
                  }
                  draggable={mode === 'edit' && Boolean(onReorderField)}
                  isDropTarget={overId === field.id && draggingId !== field.id}
                  onDragStart={() => setDraggingId(field.id)}
                  onDragOver={() => draggingId && draggingId !== field.id && setOverId(field.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverId(null);
                  }}
                  onDrop={() => {
                    if (draggingId && draggingId !== field.id) onReorderField?.(draggingId, field.id);
                    setDraggingId(null);
                    setOverId(null);
                  }}
                />
              ))}
            </div>
          )}

          {settings.captcha_enabled && fields.length > 0 && (
            <div
              className={`mt-4 ${
                settings.captcha_align === 'left'
                  ? 'w-full sm:max-w-sm mr-auto'
                  : settings.captcha_align === 'center'
                    ? 'w-full sm:max-w-sm mx-auto'
                    : settings.captcha_align === 'right'
                      ? 'w-full sm:max-w-sm ml-auto'
                      : 'w-full'
              }`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectField('__captcha__')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectField('__captcha__');
                }}
                className={`relative rounded-xl border p-3.5 transition cursor-pointer text-left ${
                  selectedFieldId === '__captcha__'
                    ? 'border-brand-500 bg-brand-50/20 ring-2 ring-brand-500/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    {settings.captcha_label || 'Anti-Spam Verification'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full capitalize">
                    {settings.captcha_type === 'turnstile' ? 'Smart Checkbox' : 'Math Challenge'}
                  </span>
                </div>

                {settings.captcha_type === 'turnstile' ? (
                  <div className="flex items-center gap-2.5 bg-white p-2 rounded-lg border border-slate-200 text-xs text-slate-700">
                    <div className="h-4 w-4 rounded border border-slate-300 bg-white" />
                    <span className="font-medium">I am a human (verify)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800">
                      What is 7 + 4 = ?
                    </div>
                    <div className="w-24 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-400 font-medium">
                      Answer
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    Alignment: <strong className="text-slate-600 uppercase">{settings.captcha_align || 'full'}</strong>
                  </span>
                  <span className="text-brand-600 font-semibold">Click to configure</span>
                </div>
              </div>
            </div>
          )}

          {fields.length > 0 && (
            <button
              type="button"
              disabled
              className={`mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white ${FORM_THEME_PRESETS[theme.preset].button}`}
            >
              {settings.submit_label ?? 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
