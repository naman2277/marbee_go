import { useCallback, useEffect, type ReactNode } from 'react';
import { useState } from 'react';
import { Layers, LayoutGrid, Palette, Sparkles } from 'lucide-react';
import { useHistoryState } from '@/hooks/useHistoryState';
import {
  createFormField,
  type FormField,
  type FormFieldType,
  type FormSchemaMapping,
  type MarbeeForm,
} from '@/lib/forms';
import {
  DEFAULT_FORM_THEME,
  type FormBanner,
  type FormThemePreset,
  type FormThemeRadius,
  type FormThemeStyle,
} from '@/lib/form-design';
import { normalizeMapping, type SchemaMappingOption } from '@/lib/form-mapping';
import type { AiFormDraft } from '@/lib/form-ai';

import { StudioTopBar, type Device } from './StudioTopBar';
import { StudioCanvas } from './StudioCanvas';
import { StudioFieldLibrary } from './StudioFieldLibrary';
import { StudioLayersPanel } from './StudioLayersPanel';
import { StudioInspector } from './StudioInspector';
import { StudioThemePanel } from './StudioThemePanel';
import { StudioAiPanel } from './StudioAiPanel';
import { FormSettingsPage } from './FormSettingsPage';

type LeftTab = 'fields' | 'layers' | 'theme' | 'ai';

const LEFT_TABS: Array<{ key: LeftTab; icon: typeof LayoutGrid; label: string }> = [
  { key: 'fields', icon: LayoutGrid, label: 'Fields' },
  { key: 'layers', icon: Layers, label: 'Layers' },
  { key: 'theme', icon: Palette, label: 'Theme' },
  { key: 'ai', icon: Sparkles, label: 'AI' },
];

const PALETTE_LABELS: Record<FormFieldType, string> = {
  text: 'Single Line Text',
  email: 'Email Address',
  phone: 'Phone Number',
  url: 'URL / Link',
  number: 'Number',
  date: 'Date Picker',
  textarea: 'Paragraph',
  select: 'Dropdown',
  radio: 'Multiple Choice',
  multiselect: 'Checkbox Group',
  checkbox: 'Single Checkbox',
  rating: 'Star Rating',
  heading: 'Section Heading',
  divider: 'Divider',
  consent: 'Consent / Terms',
  hidden: 'Hidden Field',
};

type Props = {
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  schemas?: SchemaMappingOption[];
  onSave?: (fields: FormField[], settings: MarbeeForm['settings']) => void;
  onPublish?: () => void;
  onRename?: (name: string) => void;
  /** Persist settings edited in the full-page settings view. */
  onSettingsSave?: (settings: MarbeeForm['settings']) => void;
  publishing?: boolean;
  saving?: boolean;
  dirty?: boolean;
  fullScreen?: boolean;
  /** Existing panels rendered inside the settings page's integration sections. */
  mappingContent?: ReactNode;
  embedContent?: ReactNode;
  responsesContent?: ReactNode;
  backTo?: string;
};

export function FormStudio({
  form,
  tenantId,
  environment,
  schemas: _schemas = [],
  onSave,
  onPublish,
  onRename,
  onSettingsSave,
  publishing,
  saving,
  dirty: externalDirty,
  fullScreen,
  mappingContent,
  embedContent,
  responsesContent,
  backTo,
}: Props) {
  const initialFields = [...form.fields].sort((a, b) => a.sort_order - b.sort_order);
  const history = useHistoryState<FormField[]>(initialFields);

  const [selectedId, setSelectedId] = useState<string | null>(initialFields[0]?.id ?? null);
  const [device, setDevice] = useState<Device>('desktop');
  const [zoom, setZoom] = useState(100);
  const [previewing, setPreviewing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('fields');

  const [themePreset, setThemePreset] = useState<FormThemePreset>(
    form.settings.theme?.preset ?? DEFAULT_FORM_THEME.preset,
  );
  const [themeRadius, setThemeRadius] = useState<FormThemeRadius>(
    form.settings.theme?.radius ?? DEFAULT_FORM_THEME.radius,
  );
  const [themeStyle, setThemeStyle] = useState<FormThemeStyle>(
    form.settings.theme?.style ?? DEFAULT_FORM_THEME.style,
  );
  const [banner, setBanner] = useState<FormBanner>(form.settings.banner ?? { enabled: false });

  const [captchaEnabled, setCaptchaEnabled] = useState(form.settings.captcha_enabled ?? false);
  const [captchaType, setCaptchaType] = useState<'smart_math' | 'turnstile'>(
    form.settings.captcha_type ?? 'smart_math',
  );
  const captchaAlign = form.settings.captcha_align ?? 'full';
  const captchaLabel = form.settings.captcha_label ?? 'Anti-Spam Verification';

  const [mapping] = useState<FormSchemaMapping>(() => normalizeMapping(form.schema_mapping));
  const [localDirty, setLocalDirty] = useState(false);

  const fields = history.state;
  const selected = fields.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    history.reset([...form.fields].sort((a, b) => a.sort_order - b.sort_order));
    setLocalDirty(false);
  }, [form.id]);

  const markDirty = () => setLocalDirty(true);

  const addField = useCallback((type: FormFieldType) => {
    const label = PALETTE_LABELS[type] ?? 'New field';
    const f = { ...createFormField(label, fields.length, type), width: 'full' as const };
    history.set([...fields, f], { commit: true });
    setSelectedId(f.id);
    markDirty();
  }, [fields, history]);

  const removeField = useCallback((id: string) => {
    const next = fields.filter((f) => f.id !== id).map((f, i) => ({ ...f, sort_order: i }));
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    history.set(next, { commit: true });
    markDirty();
  }, [fields, selectedId, history]);

  const moveField = useCallback((id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[idx], next[target]] = [next[target], next[idx]];
    history.set(next.map((f, i) => ({ ...f, sort_order: i })), { commit: true });
    markDirty();
  }, [fields, history]);

  const duplicateField = useCallback((id: string) => {
    const source = fields.find((f) => f.id === id);
    if (!source) return;
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name}_copy`,
      label: `${source.label} (copy)`,
      sort_order: fields.length,
    };
    history.set([...fields, copy], { commit: true });
    setSelectedId(copy.id);
    markDirty();
  }, [fields, history]);

  const reorderField = useCallback((sourceId: string, targetId: string) => {
    const sourceIdx = fields.findIndex((f) => f.id === sourceId);
    const targetIdx = fields.findIndex((f) => f.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;
    const next = [...fields];
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved);
    history.set(next.map((f, i) => ({ ...f, sort_order: i })), { commit: true });
    markDirty();
  }, [fields, history]);

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    history.set(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    markDirty();
  }, [fields, history]);

  const buildSettings = () => ({
    ...form.settings,
    theme: { preset: themePreset, radius: themeRadius, style: themeStyle },
    banner,
    captcha_enabled: captchaEnabled,
    captcha_type: captchaType,
    captcha_align: captchaAlign,
    captcha_label: captchaLabel,
  });

  const handleSave = () => {
    onSave?.(fields.map((f, i) => ({ ...f, sort_order: i })), buildSettings());
    setLocalDirty(false);
  };

  const handleAiGenerated = (draft: AiFormDraft) => {
    const newFields = (draft.fields ?? []).map((f: any, i: number) => ({
      ...createFormField(f.label ?? f.name, i, f.field_type ?? 'text'),
      ...f,
      sort_order: i,
    }));
    history.set(newFields, { commit: true });
    if (draft.theme) {
      setThemePreset(draft.theme.preset ?? 'indigo');
      setThemeRadius(draft.theme.radius ?? 'xl');
      setThemeStyle(draft.theme.style ?? 'card');
    }
    if (draft.banner) setBanner(draft.banner);
    setSelectedId(newFields[0]?.id ?? null);
    markDirty();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z') { e.preventDefault(); history.undo(); }
      if (mod && e.key === 'y') { e.preventDefault(); history.redo(); }
      if (mod && e.key === 'd' && selectedId) { e.preventDefault(); duplicateField(selectedId); }
      if (e.key === 'Delete' && selectedId) { e.preventDefault(); removeField(selectedId); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, selectedId, duplicateField, removeField]);

  const isDirty = externalDirty ?? localDirty;

  return (
    <div className={`flex flex-col bg-white ${fullScreen ? 'h-full' : 'h-[85vh] rounded-2xl border border-slate-200 shadow-sm'}`}>
      <StudioTopBar
        name={form.name}
        status={form.status as 'draft' | 'published'}
        liveVersion={form.settings.live_version}
        device={device}
        onDeviceChange={setDevice}
        zoom={zoom}
        onZoomChange={setZoom}
        previewing={previewing}
        onPreviewToggle={() => setPreviewing((p) => !p)}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onSettingsOpen={() => setSettingsOpen(true)}
        onPublish={() => onPublish?.()}
        onSave={onSave ? handleSave : undefined}
        onRename={(n) => onRename?.(n)}
        publishing={publishing}
        saving={saving}
        dirty={isDirty}
        backTo={backTo}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left rail icon tabs */}
        {!previewing && (
          <>
            <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-slate-100 bg-slate-50/80 py-2">
              {LEFT_TABS.map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLeftTab(key)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition ${
                    leftTab === key ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[9px] font-semibold leading-none">{label}</span>
                </button>
              ))}
            </div>

            {/* Left panel content */}
            <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/40 p-3">
              {leftTab === 'fields' && <StudioFieldLibrary onAdd={addField} />}
              {leftTab === 'layers' && (
                <StudioLayersPanel
                  fields={fields}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onReorder={reorderField}
                  onDuplicate={duplicateField}
                  onRemove={removeField}
                />
              )}
              {leftTab === 'theme' && (
                <StudioThemePanel
                  preset={themePreset}
                  radius={themeRadius}
                  style={themeStyle}
                  banner={banner}
                  captchaEnabled={captchaEnabled}
                  captchaType={captchaType}
                  onPresetChange={(p) => { setThemePreset(p); markDirty(); }}
                  onRadiusChange={(r) => { setThemeRadius(r); markDirty(); }}
                  onStyleChange={(s) => { setThemeStyle(s); markDirty(); }}
                  onBannerChange={(b) => { setBanner(b); markDirty(); }}
                  onCaptchaToggle={(v) => { setCaptchaEnabled(v); markDirty(); }}
                  onCaptchaTypeChange={(t) => { setCaptchaType(t); markDirty(); }}
                  formName={form.name}
                  description={form.settings.description}
                  tenantId={tenantId}
                  environment={environment}
                />
              )}
              {leftTab === 'ai' && (
                <StudioAiPanel
                  onGenerated={handleAiGenerated}
                  tenantId={tenantId}
                  environment={environment}
                />
              )}
            </div>
          </>
        )}

        {/* Center canvas */}
        <StudioCanvas
          form={form}
          fields={fields}
          selectedFieldId={selectedId}
          onSelectField={setSelectedId}
          onRemoveField={previewing ? undefined : removeField}
          onMoveField={previewing ? undefined : moveField}
          onDuplicateField={previewing ? undefined : duplicateField}
          onReorderField={previewing ? undefined : reorderField}
          mapping={mapping}
          device={device}
          zoom={zoom}
          previewing={previewing}
          captchaEnabled={captchaEnabled}
          captchaType={captchaType}
          captchaAlign={captchaAlign}
          captchaLabel={captchaLabel}
          tenantId={tenantId}
          environment={environment}
        />

        {/* Right inspector */}
        {!previewing && (
          <div className="w-80 shrink-0 overflow-y-auto border-l border-slate-100 bg-white">
            <StudioInspector
              field={selected}
              allFields={fields}
              onUpdate={updateField}
            />
          </div>
        )}
      </div>

      {/* Full-page settings */}
      <FormSettingsPage
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        form={form}
        tenantId={tenantId}
        environment={environment}
        saving={saving}
        onSave={(settings) => onSettingsSave?.(settings)}
        mappingContent={mappingContent}
        embedContent={embedContent}
        responsesContent={responsesContent}
      />
    </div>
  );
}
