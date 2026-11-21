import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDown,
  Circle,
  Code2,
  EyeOff,
  Hash,
  Heading,
  Link as LinkIcon,
  Mail,
  Minus,
  Phone,
  Type,
  Palette,
  ScrollText,
  Star,
  Check,
  ShieldCheck,
  Split,
  Trash2,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { FormCanvas, type FormCanvasMode } from '@/components/forms/FormCanvas';
import { FormFieldMappingPanel } from '@/components/forms/FormFieldMappingPanel';
import {
  FORM_FIELD_TYPES,
  NON_INPUT_FIELD_TYPES,
  createFormField,
  normalizeFieldName,
  updateForm,
  type FormConditionOperator,
  type FormField,
  type FormFieldType,
  type FormFieldWidth,
  type FormSettings,
  type MarbeeForm,
} from '@/lib/forms';
import {
  DEFAULT_FORM_THEME,
  FORM_THEME_PRESETS,
  type FormThemePreset,
  type FormThemeRadius,
  type FormThemeStyle,
} from '@/lib/form-design';
import { DEFAULT_HTML_TEMPLATE } from '@/lib/form-templates';
import { syncFieldsFromHtml, countDetectedHtmlFields } from '@/lib/form-html-fields';
import { normalizeMapping, type SchemaMappingOption } from '@/lib/form-mapping';

const PALETTE: Array<{ type: FormFieldType; icon: typeof Type; label: string; category: string }> = [
  { type: 'text', icon: Type, label: 'Single Line Text', category: 'Standard Inputs' },
  { type: 'email', icon: Mail, label: 'Email Address', category: 'Standard Inputs' },
  { type: 'phone', icon: Phone, label: 'Phone Number', category: 'Standard Inputs' },
  { type: 'url', icon: LinkIcon, label: 'URL / Link', category: 'Standard Inputs' },
  { type: 'number', icon: Hash, label: 'Number', category: 'Standard Inputs' },
  { type: 'date', icon: Calendar, label: 'Date Picker', category: 'Standard Inputs' },
  { type: 'textarea', icon: AlignLeft, label: 'Multi-line Paragraph', category: 'Standard Inputs' },
  { type: 'select', icon: ChevronDown, label: 'Dropdown Select', category: 'Choice & Selection' },
  { type: 'radio', icon: Circle, label: 'Multiple Choice', category: 'Choice & Selection' },
  { type: 'multiselect', icon: CheckSquare, label: 'Checkbox Group', category: 'Choice & Selection' },
  { type: 'checkbox', icon: CheckSquare, label: 'Single Checkbox', category: 'Choice & Selection' },
  { type: 'rating', icon: Star, label: 'Star Rating', category: 'Choice & Selection' },
  { type: 'heading', icon: Heading, label: 'Section Heading', category: 'Layout' },
  { type: 'divider', icon: Minus, label: 'Divider', category: 'Layout' },
  { type: 'consent', icon: ScrollText, label: 'Consent / Terms', category: 'Advanced' },
  { type: 'hidden', icon: EyeOff, label: 'Hidden Field', category: 'Advanced' },
];

const PALETTE_CATEGORIES = ['Standard Inputs', 'Choice & Selection', 'Layout', 'Advanced'] as const;

const CONDITION_OPERATORS: Array<{ value: FormConditionOperator; label: string }> = [
  { value: 'equals', label: 'is equal to' },
  { value: 'not_equals', label: 'is not equal to' },
  { value: 'contains', label: 'contains' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

/** Collapsible section for the right inspector panel. */
function InspectorSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-slate-50/60 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
      >
        {title}
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-3 p-3">{children}</div>}
    </div>
  );
}

/** Simple reorderable options list editor, shared by dropdown/radio/checkbox-group fields. */
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
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, x) => x !== i))}
            disabled={options.length <= 1}
            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
            title="Remove option"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-bold text-slate-500 hover:border-brand-400 hover:text-brand-700"
      >
        <Plus className="h-3 w-3" /> Add option
      </button>
    </div>
  );
}

type WorkspaceMode = 'edit' | 'mapping';

type Props = {
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  schemas: SchemaMappingOption[];
  workspaceMode: WorkspaceMode;
  previewDevice?: 'desktop' | 'tablet' | 'mobile';
  onSaved?: () => void;
};

export function FormBuilderWorkspace({
  form,
  schemas,
  workspaceMode,
  previewDevice = 'desktop',
  onSaved,
}: Props) {
  const isHtmlMode = form.settings.build_mode === 'html';
  const canvasMode: FormCanvasMode = workspaceMode === 'mapping' ? 'mapping' : 'edit';

  const [fields, setFields] = useState<FormField[]>(() =>
    [...form.fields].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [selectedId, setSelectedId] = useState<string | null>(fields[0]?.id ?? null);
  const [mapping, setMapping] = useState(() => normalizeMapping(form.schema_mapping));
  const [sidebarTab, setSidebarTab] = useState<'properties' | 'mapping' | 'theme'>(
    workspaceMode === 'mapping' ? 'mapping' : 'properties',
  );
  const [message, setMessage] = useState('');

  // Theme & Styling local state
  const [themePreset, setThemePreset] = useState<FormThemePreset>(
    form.settings.theme?.preset ?? DEFAULT_FORM_THEME.preset,
  );
  const [themeRadius, setThemeRadius] = useState<FormThemeRadius>(
    form.settings.theme?.radius ?? DEFAULT_FORM_THEME.radius,
  );
  const [themeStyle, setThemeStyle] = useState<FormThemeStyle>(
    form.settings.theme?.style ?? DEFAULT_FORM_THEME.style,
  );

  // Anti-Spam CAPTCHA state
  const [captchaEnabled, setCaptchaEnabled] = useState(form.settings.captcha_enabled ?? false);
  const [captchaType, setCaptchaType] = useState<'smart_math' | 'turnstile'>(
    form.settings.captcha_type ?? 'smart_math',
  );
  const [captchaAlign, setCaptchaAlign] = useState<'left' | 'center' | 'right' | 'full'>(
    form.settings.captcha_align ?? 'full',
  );
  const [captchaLabel, setCaptchaLabel] = useState(
    form.settings.captcha_label ?? 'Anti-Spam Verification',
  );

  const [html, setHtml] = useState(
    form.settings.html_content ??
      DEFAULT_HTML_TEMPLATE.replace('{{form_title}}', form.name).replace(
        '{{form_description}}',
        form.settings.description ?? '',
      ),
  );
  const [showHtmlEditor, setShowHtmlEditor] = useState(isHtmlMode);

  useEffect(() => {
    setFields([...form.fields].sort((a, b) => a.sort_order - b.sort_order));
    setMapping(normalizeMapping(form.schema_mapping));
    setCaptchaEnabled(form.settings.captcha_enabled ?? false);
    setCaptchaType(form.settings.captcha_type ?? 'smart_math');
    setCaptchaAlign(form.settings.captcha_align ?? 'full');
    setCaptchaLabel(form.settings.captcha_label ?? 'Anti-Spam Verification');
    if (form.settings.theme) {
      setThemePreset(form.settings.theme.preset);
      setThemeRadius(form.settings.theme.radius);
      setThemeStyle(form.settings.theme.style);
    }
    if (isHtmlMode && form.settings.html_content) {
      setFields(syncFieldsFromHtml(form.settings.html_content, form.fields));
    }
  }, [form.fields, form.schema_mapping, form.id, form.settings.html_content, form.settings.theme, form.settings.captcha_enabled, form.settings.captcha_type, form.settings.captcha_align, form.settings.captcha_label, isHtmlMode]);

  const updateCaptchaSettings = async (patch: Partial<FormSettings>) => {
    const nextSettings: FormSettings = {
      ...form.settings,
      captcha_enabled: patch.captcha_enabled !== undefined ? patch.captcha_enabled : captchaEnabled,
      captcha_type: patch.captcha_type || captchaType,
      captcha_align: patch.captcha_align || captchaAlign,
      captcha_label: patch.captcha_label || captchaLabel,
    };
    if (patch.captcha_enabled !== undefined) setCaptchaEnabled(patch.captcha_enabled);
    if (patch.captcha_type) setCaptchaType(patch.captcha_type);
    if (patch.captcha_align) setCaptchaAlign(patch.captcha_align);
    if (patch.captcha_label) setCaptchaLabel(patch.captcha_label);

    const result = await updateForm(form.id, { settings: nextSettings });
    if (result.error) {
      setMessage(result.error);
    } else {
      setMessage('Captcha settings saved');
      onSaved?.();
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const captchaMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const result = await updateForm(form.id, {
        settings: {
          ...form.settings,
          captcha_enabled: enabled,
          captcha_type: captchaType,
          captcha_align: captchaAlign,
          captcha_label: captchaLabel,
        },
      });
      if (result.error) throw new Error(result.error);
      return enabled;
    },
    onSuccess: (enabled) => {
      setCaptchaEnabled(enabled);
      setMessage(enabled ? 'Anti-Spam CAPTCHA enabled' : 'CAPTCHA disabled');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
  });

  useEffect(() => {
    setSidebarTab(workspaceMode === 'mapping' ? 'mapping' : 'properties');
  }, [workspaceMode]);

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  const fieldsMutation = useMutation({
    mutationFn: async (nextFields: FormField[]) => {
      const payload: Parameters<typeof updateForm>[1] = { fields: nextFields.map((f, i) => ({ ...f, sort_order: i })) };
      const result = await updateForm(form.id, payload);
      if (result.error) throw new Error(result.error);
      return nextFields;
    },
    onSuccess: (next) => {
      setFields(next);
      setMessage('Changes saved');
      onSaved?.();
      setTimeout(() => setMessage(''), 2000);
    },
  });

  const themeMutation = useMutation({
    mutationFn: async (newTheme: { preset: FormThemePreset; radius: FormThemeRadius; style: FormThemeStyle }) => {
      const result = await updateForm(form.id, {
        settings: {
          ...form.settings,
          theme: newTheme,
        },
      });
      if (result.error) throw new Error(result.error);
      return newTheme;
    },
    onSuccess: () => {
      setMessage('Theme updated');
      onSaved?.();
      setTimeout(() => setMessage(''), 2000);
    },
  });

  const htmlMutation = useMutation({
    mutationFn: async () => {
      const detected = syncFieldsFromHtml(html, fields);
      const result = await updateForm(form.id, {
        settings: { ...form.settings, html_content: html, build_mode: 'html' },
        fields: detected,
      });
      if (result.error) throw new Error(result.error);
      return detected;
    },
    onSuccess: (detected) => {
      setFields(detected);
      setMessage(`${detected.length} field${detected.length === 1 ? '' : 's'} detected in HTML`);
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
  });

  const mappingMutation = useMutation({
    mutationFn: async (next: typeof mapping) => {
      const normalized = normalizeMapping(next);
      const result = await updateForm(form.id, { schema_mapping: normalized });
      if (result.error) throw new Error(result.error);
      return normalized;
    },
    onSuccess: (normalized) => {
      setMapping(normalized);
      setMessage('Mapping saved');
      onSaved?.();
      setTimeout(() => setMessage(''), 2000);
    },
  });

  const persistFields = (next: FormField[]) => {
    setFields(next);
    fieldsMutation.mutate(next);
  };

  const addField = (type: FormFieldType) => {
    const label = PALETTE.find((p) => p.type === type)?.label ?? 'New field';
    const f = { ...createFormField(label, fields.length, type), width: 'full' as const };
    const next = [...fields, f];
    setSelectedId(f.id);
    persistFields(next);
  };

  const reorderField = (sourceId: string, targetId: string) => {
    const sourceIdx = fields.findIndex((f) => f.id === sourceId);
    const targetIdx = fields.findIndex((f) => f.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;
    const next = [...fields];
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved);
    persistFields(next.map((f, i) => ({ ...f, sort_order: i })));
  };

  const updateField = (id: string, patch: Partial<FormField>) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const saveFieldEdits = () => persistFields(fields);

  const removeField = (id: string) => {
    const next = fields.filter((f) => f.id !== id).map((f, i) => ({ ...f, sort_order: i }));
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    persistFields(next);
  };

  const moveField = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    persistFields(next.map((f, i) => ({ ...f, sort_order: i })));
  };

  const duplicateField = (id: string) => {
    const source = fields.find((f) => f.id === id);
    if (!source) return;
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name}_copy`,
      label: `${source.label} (copy)`,
      sort_order: fields.length,
    };
    const next = [...fields, copy];
    setSelectedId(copy.id);
    persistFields(next);
  };

  const selectFieldByName = useCallback(
    (name: string) => {
      const field = fields.find((f) => f.name === name);
      if (field) {
        setSelectedId(field.id);
        setSidebarTab('mapping');
      }
    },
    [fields],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'marbee-select-field' && event.data.field) {
        selectFieldByName(event.data.field as string);
      }
      if (event.data?.type === 'marbee-map-field' && event.data.field) {
        selectFieldByName(event.data.field as string);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [selectFieldByName]);

  const detectedCount = countDetectedHtmlFields(html);
  const canvasFields = isHtmlMode ? syncFieldsFromHtml(html, fields) : fields;

  const deviceWidthClass =
    previewDevice === 'mobile'
      ? 'max-w-[375px]'
      : previewDevice === 'tablet'
      ? 'max-w-[768px]'
      : 'max-w-full';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
      {isHtmlMode && workspaceMode === 'edit' && (
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setShowHtmlEditor((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <Code2 className="h-4 w-4" />
            {showHtmlEditor ? 'Hide HTML editor' : 'Show HTML editor'}
          </button>
          {showHtmlEditor && (
            <span className="text-xs text-slate-500">
              {detectedCount} field{detectedCount === 1 ? '' : 's'} detected in HTML
            </span>
          )}
          {showHtmlEditor && (
            <Button size="sm" onClick={() => htmlMutation.mutate()} disabled={htmlMutation.isPending}>
              {htmlMutation.isPending ? 'Detecting…' : 'Save & Sync Fields'}
            </Button>
          )}
        </div>
      )}

      {isHtmlMode && showHtmlEditor && workspaceMode === 'edit' && (
        <div className="border-b border-slate-100 p-4">
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={8}
            className="w-full rounded-xl border border-slate-200 p-3 font-mono text-xs focus:border-brand-500 focus:outline-none"
            spellCheck={false}
            placeholder="<!DOCTYPE html>… with <input name='…'> fields"
          />
        </div>
      )}

      <div className="flex min-h-[680px]">
        {/* LEFT PALETTE (When in edit mode) */}
        {workspaceMode === 'edit' && !isHtmlMode && (
          <div className="w-60 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/60 p-4 space-y-4">
            {PALETTE_CATEGORIES.map((category) => (
              <div key={category}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {category}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PALETTE.filter((p) => p.category === category).map(({ type, icon: Icon, label }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addField(type)}
                      title={`Add ${label}`}
                      className="flex flex-col items-start gap-1.5 rounded-xl border border-transparent bg-white/70 px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:border-brand-200 hover:bg-white hover:text-brand-700 hover:shadow-2xs transition"
                    >
                      <Icon className="h-4 w-4 text-slate-400" />
                      <span className="leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Quick Theme & Security Triggers */}
            <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
              <button
                type="button"
                onClick={() => setSidebarTab('theme')}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                  sidebarTab === 'theme'
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Palette className="h-4 w-4 text-brand-600" />
                <span>Form Styling & Theme</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!captchaEnabled) {
                    updateCaptchaSettings({ captcha_enabled: true });
                  }
                  setSelectedId('__captcha__');
                  setSidebarTab('properties');
                }}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                  selectedId === '__captcha__'
                    ? 'border-brand-500 bg-brand-50/60 text-brand-800 ring-2 ring-brand-500/20'
                    : captchaEnabled
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`h-4 w-4 ${captchaEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Anti-Spam CAPTCHA</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${captchaEnabled ? 'bg-emerald-200/60 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                  {captchaEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* CENTER INTERACTIVE CANVAS (WITH RESPONSIVE DEVICE FRAME) */}
        <div className="flex-1 overflow-x-auto bg-slate-100/50 p-6 flex items-start justify-center">
          <div className={`w-full ${deviceWidthClass} transition-all duration-200`}>
            <FormCanvas
              form={{
                ...form,
                fields: canvasFields,
                settings: {
                  ...form.settings,
                  captcha_enabled: captchaEnabled,
                  captcha_type: captchaType,
                  captcha_align: captchaAlign,
                  captcha_label: captchaLabel,
                },
              }}
              mode={canvasMode}
              selectedFieldId={selectedId}
              onSelectField={setSelectedId}
              onRemoveField={workspaceMode === 'edit' ? removeField : undefined}
              onMoveField={workspaceMode === 'edit' ? moveField : undefined}
              onDuplicateField={workspaceMode === 'edit' ? duplicateField : undefined}
              onReorderField={workspaceMode === 'edit' && !isHtmlMode ? reorderField : undefined}
              mapping={mapping}
              htmlOverride={isHtmlMode ? html : undefined}
            />
          </div>
        </div>

        {/* RIGHT PROPERTY INSPECTOR / MAPPING DRAWER */}
        <div className="flex w-84 shrink-0 flex-col border-l border-slate-100 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 bg-slate-50/50 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-900">
                {selectedId === '__captcha__'
                  ? 'Anti-Spam CAPTCHA'
                  : sidebarTab === 'theme'
                  ? 'Form Theme & Style'
                  : selected
                  ? selected.label
                  : 'Form Inspector'}
              </p>
              {selectedId === '__captcha__' ? (
                <p className="text-[11px] text-slate-400 font-mono">
                  security · bot_protection
                </p>
              ) : sidebarTab !== 'theme' && selected ? (
                <p className="text-[11px] text-slate-400 font-mono">
                  {selected.field_type} · {selected.name}
                </p>
              ) : null}
            </div>
          </div>

          {/* Sub-tab switcher */}
          {workspaceMode === 'edit' && !isHtmlMode && (
            <div className="flex border-b border-slate-100 bg-white">
              <button
                type="button"
                onClick={() => setSidebarTab('properties')}
                className={`flex-1 py-2 text-xs font-bold transition text-center ${
                  sidebarTab === 'properties'
                    ? 'border-b-2 border-brand-600 text-brand-700 bg-brand-50/30'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Field Properties
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('theme')}
                className={`flex-1 py-2 text-xs font-bold transition text-center ${
                  sidebarTab === 'theme'
                    ? 'border-b-2 border-brand-600 text-brand-700 bg-brand-50/30'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Theme & Style
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {/* 1. THEME STYLING PANEL */}
            {sidebarTab === 'theme' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Color Theme Preset</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(FORM_THEME_PRESETS) as FormThemePreset[]).map((key) => {
                      const p = FORM_THEME_PRESETS[key];
                      const isSel = themePreset === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setThemePreset(key);
                            themeMutation.mutate({ preset: key, radius: themeRadius, style: themeStyle });
                          }}
                          className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition ${
                            isSel ? 'border-brand-600 bg-brand-50 text-brand-800 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.accent }} />
                          <span className="truncate">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Corner Radius</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['md', 'lg', 'xl'] as FormThemeRadius[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setThemeRadius(r);
                          themeMutation.mutate({ preset: themePreset, radius: r, style: themeStyle });
                        }}
                        className={`py-1.5 text-center text-xs font-semibold rounded-xl border transition ${
                          themeRadius === r ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'
                        }`}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Container Surface Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['minimal', 'card', 'glass'] as FormThemeStyle[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          setThemeStyle(st);
                          themeMutation.mutate({ preset: themePreset, radius: themeRadius, style: st });
                        }}
                        className={`py-1.5 text-center text-xs font-semibold rounded-xl border capitalize transition ${
                          themeStyle === st ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Anti-Spam CAPTCHA Settings */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Anti-Spam CAPTCHA
                    </span>
                    <input
                      type="checkbox"
                      checked={captchaEnabled}
                      onChange={(e) => captchaMutation.mutate(e.target.checked)}
                      className="rounded text-brand-600 focus:ring-brand-500"
                    />
                  </div>

                  {captchaEnabled && (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-600">Challenge Mode</label>
                      <select
                        value={captchaType}
                        onChange={(e) => {
                          const nextType = e.target.value as 'smart_math' | 'turnstile';
                          setCaptchaType(nextType);
                          updateForm(form.id, {
                            settings: { ...form.settings, captcha_enabled: true, captcha_type: nextType },
                          }).then(() => onSaved?.());
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
                      >
                        <option value="smart_math">Interactive Math Challenge (e.g. 7 + 4 = 11)</option>
                        <option value="turnstile">Smart Human Verification Checkbox</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ) : selectedId === '__captcha__' && sidebarTab === 'properties' ? (
              /* CAPTCHA ELEMENT INSPECTOR */
              <div className="space-y-4 text-xs">
                <div>
                  <label className="mb-1 block font-bold text-slate-700">Display Label / Title</label>
                  <input
                    value={captchaLabel}
                    onChange={(e) => updateCaptchaSettings({ captcha_label: e.target.value })}
                    placeholder="e.g. Anti-Spam Verification"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block font-bold text-slate-700">Challenge Mode</label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => updateCaptchaSettings({ captcha_type: 'smart_math' })}
                      className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                        captchaType === 'smart_math'
                          ? 'border-brand-500 bg-brand-50/40 text-brand-900 ring-1 ring-brand-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-3.5 w-3.5 rounded-full border flex items-center justify-center ${
                          captchaType === 'smart_math' ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                        }`}
                      >
                        {captchaType === 'smart_math' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="font-bold text-xs">Interactive Math Challenge</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Random arithmetic problem (e.g. 7 + 4 = 11).
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateCaptchaSettings({ captcha_type: 'turnstile' })}
                      className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                        captchaType === 'turnstile'
                          ? 'border-brand-500 bg-brand-50/40 text-brand-900 ring-1 ring-brand-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div
                        className={`mt-0.5 h-3.5 w-3.5 rounded-full border flex items-center justify-center ${
                          captchaType === 'turnstile' ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                        }`}
                      >
                        {captchaType === 'turnstile' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="font-bold text-xs">Smart Human Checkbox</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          One-click verification checkbox.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block font-bold text-slate-700">Form Alignment & Layout</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'full', label: 'Full Width', icon: '🔲' },
                      { id: 'left', label: 'Left', icon: '⬅️' },
                      { id: 'center', label: 'Center', icon: '↔️' },
                      { id: 'right', label: 'Right', icon: '➡️' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateCaptchaSettings({ captcha_align: opt.id as any })}
                        className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-center transition ${
                          captchaAlign === opt.id
                            ? 'border-brand-600 bg-brand-50 text-brand-800 font-bold shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-sm mb-0.5">{opt.icon}</span>
                        <span className="text-[10px] leading-tight">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Auto-adjusts width across responsive viewports (Desktop, Tablet 768px, Mobile 375px).
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      updateCaptchaSettings({ captcha_enabled: false });
                      setSelectedId(fields[0]?.id ?? null);
                    }}
                    className="w-full text-xs"
                  >
                    Remove CAPTCHA from Form
                  </Button>
                </div>
              </div>
            ) : !selected ? (
              <p className="text-xs text-slate-500 text-center py-8">
                Click any field on the canvas to inspect and edit its properties.
              </p>
            ) : sidebarTab === 'mapping' || workspaceMode === 'mapping' || isHtmlMode ? (
              <FormFieldMappingPanel
                field={selected}
                mapping={mapping}
                schemas={schemas}
                formFields={canvasFields}
                onSave={(next) => mappingMutation.mutate(next)}
                saving={mappingMutation.isPending}
                compact
              />
            ) : (
              /* 2. FIELD PROPERTIES FORM — grouped, collapsible sections */
              (() => {
                const isLayoutOnly = NON_INPUT_FIELD_TYPES.includes(selected.field_type);
                const hasChoices =
                  selected.field_type === 'select' ||
                  selected.field_type === 'radio' ||
                  selected.field_type === 'multiselect';
                const isTextLike =
                  selected.field_type === 'text' ||
                  selected.field_type === 'textarea' ||
                  selected.field_type === 'url';
                const isNumberLike = selected.field_type === 'number' || selected.field_type === 'rating';
                const otherFields = fields.filter((f) => f.id !== selected.id && f.field_type !== 'heading' && f.field_type !== 'divider');

                return (
                  <div className="space-y-3 text-xs">
                    <InspectorSection title="Content">
                      <div>
                        <label className="mb-1 block font-bold text-slate-700">
                          {selected.field_type === 'heading' ? 'Heading Text' : 'Display Label'}
                        </label>
                        <input
                          value={selected.label}
                          onChange={(e) =>
                            updateField(selected.id, {
                              label: e.target.value,
                              name: normalizeFieldName(e.target.value) || selected.name,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none"
                        />
                      </div>

                      {selected.field_type === 'heading' && (
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Subtext (optional)</label>
                          <input
                            value={selected.content ?? ''}
                            onChange={(e) => updateField(selected.id, { content: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none"
                            placeholder="Short description shown under the heading…"
                          />
                        </div>
                      )}

                      {!isLayoutOnly && (
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Field Key (JSON API name)</label>
                          <input
                            value={selected.name}
                            onChange={(e) =>
                              updateField(selected.id, { name: normalizeFieldName(e.target.value) })
                            }
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-slate-800 focus:border-brand-500 focus:outline-none"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Field Type</label>
                          <select
                            value={selected.field_type}
                            onChange={(e) =>
                              updateField(selected.id, { field_type: e.target.value as FormFieldType })
                            }
                            className="w-full rounded-xl border border-slate-200 px-2.5 py-2 font-semibold text-slate-700 focus:outline-none"
                          >
                            {FORM_FIELD_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Canvas Width</label>
                          <select
                            value={selected.width ?? 'full'}
                            disabled={isLayoutOnly}
                            onChange={(e) =>
                              updateField(selected.id, { width: e.target.value as FormFieldWidth })
                            }
                            className="w-full rounded-xl border border-slate-200 px-2.5 py-2 font-semibold text-slate-700 focus:outline-none disabled:opacity-40"
                          >
                            <option value="full">Full width (100%)</option>
                            <option value="half">Half width (50%)</option>
                          </select>
                        </div>
                      </div>

                      {!isLayoutOnly && selected.field_type !== 'consent' && (
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Placeholder Text</label>
                          <input
                            value={selected.placeholder ?? ''}
                            onChange={(e) => updateField(selected.id, { placeholder: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none"
                            placeholder="e.g. Enter your corporate email…"
                          />
                        </div>
                      )}

                      {selected.field_type === 'consent' && (
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Consent Text</label>
                          <input
                            value={selected.placeholder ?? ''}
                            onChange={(e) => updateField(selected.id, { placeholder: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none"
                            placeholder="I agree to the Terms of Service and Privacy Policy"
                          />
                        </div>
                      )}

                      {selected.field_type === 'hidden' && (
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Default Value</label>
                          <input
                            value={selected.default_value ?? ''}
                            onChange={(e) => updateField(selected.id, { default_value: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono focus:border-brand-500 focus:outline-none"
                            placeholder="Static value, or leave blank to auto-capture ?utm_source=…"
                          />
                          <p className="mt-1 text-[10px] text-slate-400">
                            If empty, captures a URL query parameter matching the field key (e.g. <code>?{selected.name}=…</code>).
                          </p>
                        </div>
                      )}

                      {selected.field_type === 'rating' && (
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Number of Stars</label>
                          <select
                            value={selected.max_value ?? 5}
                            onChange={(e) => updateField(selected.id, { max_value: Number(e.target.value) })}
                            className="w-full rounded-xl border border-slate-200 px-2.5 py-2 font-semibold text-slate-700 focus:outline-none"
                          >
                            {[3, 5, 10].map((n) => (
                              <option key={n} value={n}>
                                {n} stars
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {!isLayoutOnly && selected.field_type !== 'hidden' && (
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">Helper Subtext</label>
                          <input
                            value={selected.help_text ?? ''}
                            onChange={(e) => updateField(selected.id, { help_text: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none"
                            placeholder="Optional helper text below the input…"
                          />
                        </div>
                      )}
                    </InspectorSection>

                    {hasChoices && (
                      <InspectorSection title="Choices">
                        <OptionsEditor
                          options={selected.options ?? []}
                          onChange={(next) => updateField(selected.id, { options: next })}
                        />
                      </InspectorSection>
                    )}

                    {!isLayoutOnly && selected.field_type !== 'hidden' && (
                      <InspectorSection title="Validation" defaultOpen={false}>
                        <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.required ?? false}
                            onChange={(e) => updateField(selected.id, { required: e.target.checked })}
                            className="rounded text-brand-600 focus:ring-brand-500"
                          />
                          <span>Required Field (Mandatory)</span>
                        </label>

                        {isTextLike && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label className="mb-1 block font-bold text-slate-700">Min Length</label>
                              <input
                                type="number"
                                min={0}
                                value={selected.min_length ?? ''}
                                onChange={(e) =>
                                  updateField(selected.id, {
                                    min_length: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 focus:border-brand-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block font-bold text-slate-700">Max Length</label>
                              <input
                                type="number"
                                min={0}
                                value={selected.max_length ?? ''}
                                onChange={(e) =>
                                  updateField(selected.id, {
                                    max_length: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 focus:border-brand-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {isNumberLike && selected.field_type !== 'rating' && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label className="mb-1 block font-bold text-slate-700">Min Value</label>
                              <input
                                type="number"
                                value={selected.min_value ?? ''}
                                onChange={(e) =>
                                  updateField(selected.id, {
                                    min_value: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 focus:border-brand-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block font-bold text-slate-700">Max Value</label>
                              <input
                                type="number"
                                value={selected.max_value ?? ''}
                                onChange={(e) =>
                                  updateField(selected.id, {
                                    max_value: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 focus:border-brand-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {isTextLike && (
                          <div className="pt-1">
                            <label className="mb-1 block font-bold text-slate-700">Pattern (Regex, advanced)</label>
                            <input
                              value={selected.pattern ?? ''}
                              onChange={(e) => updateField(selected.id, { pattern: e.target.value })}
                              className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 font-mono text-[11px] focus:border-brand-500 focus:outline-none"
                              placeholder="e.g. ^[A-Z]{2}\d{4}$"
                            />
                            {selected.pattern && (
                              <input
                                value={selected.pattern_error ?? ''}
                                onChange={(e) => updateField(selected.id, { pattern_error: e.target.value })}
                                className="mt-1.5 w-full rounded-xl border border-slate-200 px-2.5 py-1.5 focus:border-brand-500 focus:outline-none"
                                placeholder="Custom error message shown when it doesn't match"
                              />
                            )}
                          </div>
                        )}
                      </InspectorSection>
                    )}

                    {!isLayoutOnly && (
                      <InspectorSection title="Conditional logic" defaultOpen={Boolean(selected.condition?.field)}>
                        <p className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Split className="h-3 w-3 text-violet-500" />
                          Only show this field when another field's answer matches a rule.
                        </p>
                        <div className="space-y-1.5">
                          <select
                            value={selected.condition?.field ?? ''}
                            onChange={(e) =>
                              updateField(selected.id, {
                                condition: e.target.value
                                  ? { field: e.target.value, operator: selected.condition?.operator ?? 'equals', value: selected.condition?.value ?? '' }
                                  : null,
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 focus:outline-none"
                          >
                            <option value="">No condition — always show</option>
                            {otherFields.map((f) => (
                              <option key={f.id} value={f.name}>
                                {f.label} ({f.name})
                              </option>
                            ))}
                          </select>

                          {selected.condition?.field && (
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={selected.condition.operator}
                                onChange={(e) =>
                                  updateField(selected.id, {
                                    condition: { ...selected.condition!, operator: e.target.value as FormConditionOperator },
                                  })
                                }
                                className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 focus:outline-none"
                              >
                                {CONDITION_OPERATORS.map((op) => (
                                  <option key={op.value} value={op.value}>
                                    {op.label}
                                  </option>
                                ))}
                              </select>
                              {selected.condition.operator !== 'is_empty' && selected.condition.operator !== 'is_not_empty' && (
                                <input
                                  value={selected.condition.value ?? ''}
                                  onChange={(e) =>
                                    updateField(selected.id, {
                                      condition: { ...selected.condition!, value: e.target.value },
                                    })
                                  }
                                  placeholder="Value…"
                                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5 focus:border-brand-500 focus:outline-none"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </InspectorSection>
                    )}

                    <div className="pt-1">
                      <Button
                        size="sm"
                        onClick={saveFieldEdits}
                        disabled={fieldsMutation.isPending}
                        className="w-full shadow-xs"
                      >
                        {fieldsMutation.isPending ? 'Saving…' : 'Save Field Changes'}
                      </Button>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          {message && (
            <div className="border-t border-slate-100 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              <span>{message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
