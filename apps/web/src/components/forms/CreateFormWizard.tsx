import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Code2, FilePlus, LayoutTemplate, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  AI_FORM_EXAMPLES,
  generateAndUploadBanner,
  generateFormWithAi,
} from '@/lib/form-ai';
import { createForm, type FormBuildMode, type FormField, type MarbeeForm } from '@/lib/forms';
import { DEFAULT_HTML_TEMPLATE, FORM_TEMPLATES } from '@/lib/form-templates';
import { parseHtmlFormFields } from '@/lib/form-html-fields';
import { FormHtmlLivePreview } from '@/components/forms/FormHtmlLivePreview';
import { useTenantScope } from '@/contexts/AuthContext';

type CreateMode = FormBuildMode;

const MODES: Array<{ id: CreateMode; label: string; icon: typeof Sparkles }> = [
  { id: 'ai', label: 'AI Studio', icon: Sparkles },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
  { id: 'builder', label: 'Blank', icon: FilePlus },
  { id: 'html', label: 'HTML', icon: Code2 },
];

type Props = { onClose: () => void };

export function CreateFormWizard({ onClose }: Props) {
  const { tenantId, environment } = useTenantScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [mode, setMode] = useState<CreateMode>('ai');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generateBanner, setGenerateBanner] = useState(true);
  const [templateId, setTemplateId] = useState(FORM_TEMPLATES[0]?.id ?? '');
  const [htmlContent, setHtmlContent] = useState(DEFAULT_HTML_TEMPLATE);
  const [error, setError] = useState('');

  const selectedTemplate = FORM_TEMPLATES.find((t) => t.id === templateId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'ai') {
        if (!prompt.trim()) throw new Error('Describe the form you want to create');

        let draft = await generateFormWithAi(prompt.trim(), {
          generateBanner,
          tenantId,
          environment,
        });

        if (generateBanner && !draft.banner.image_url) {
          const banner = await generateAndUploadBanner(draft, tenantId, environment);
          draft = {
            ...draft,
            banner,
            settings: { ...draft.settings, banner, theme: draft.theme },
          };
        }

        const formName = name.trim() || draft.name;
        return createForm(tenantId, environment, formName, {
          fields: draft.fields,
          settings: draft.settings,
          schema_mapping: draft.schema_mapping,
        });
      }

      const formName =
        name.trim() ||
        (mode === 'template' && selectedTemplate ? selectedTemplate.name : 'Untitled form');

      let fields: FormField[] = [];
      let settings: Record<string, unknown> = { build_mode: mode };
      let schema_mapping = {};

      if (mode === 'template' && selectedTemplate) {
        fields = selectedTemplate.fields.map((f, i) => ({
          ...f,
          id: crypto.randomUUID(),
          sort_order: i,
          width: f.width ?? 'full',
        }));
        settings = { ...settings, ...selectedTemplate.settings, template_id: selectedTemplate.id };
        schema_mapping = selectedTemplate.schema_mapping ?? {};
      } else if (mode === 'html') {
        settings = { ...settings, html_content: htmlContent, description: 'Custom HTML form layout' };
        fields = parseHtmlFormFields(htmlContent);
      } else {
        settings = { ...settings, description: 'Start from scratch and add fields' };
      }

      return createForm(tenantId, environment, formName, { fields, settings, schema_mapping });
    },
    onSuccess: (result) => {
      if (result.error || !result.form) {
        setError(result.error ?? 'Failed to create form');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['forms', tenantId, environment] });
      onClose();
      navigate(`/content/forms/${result.form.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const canCreate =
    mode === 'ai'
      ? prompt.trim().length > 0
      : mode === 'template'
        ? Boolean(selectedTemplate)
        : mode === 'html'
          ? htmlContent.trim().length > 0
          : name.trim().length > 0;

  const htmlPreviewForm = useMemo<MarbeeForm>(
    () => ({
      id: 'preview',
      tenant_id: tenantId,
      environment,
      name: name.trim() || 'Untitled form',
      slug: 'preview',
      fields: parseHtmlFormFields(htmlContent),
      schema_mapping: {},
      settings: {
        build_mode: 'html',
        html_content: htmlContent,
        description: 'Custom HTML form layout',
        submit_label: 'Submit',
      },
      status: 'draft',
      created_at: '',
      updated_at: '',
    }),
    [tenantId, environment, name, htmlContent],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl ${mode === 'html' ? 'max-w-6xl' : 'max-w-xl'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create form</h2>
            <p className="text-sm text-slate-500">Choose how you want to start</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-5 pt-3">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === id
                  ? 'bg-violet-50 text-violet-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {mode === 'ai' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Describe your form in plain language. AI will create the fields, layout, and theme for you.
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="e.g. Webinar signup with name, email, company, and job title"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                {AI_FORM_EXAMPLES.slice(0, 4).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="rounded-full border border-violet-100 bg-violet-50/50 px-3 py-1 text-xs text-violet-700 hover:bg-violet-100"
                  >
                    {ex.length > 55 ? `${ex.slice(0, 55)}…` : ex}
                  </button>
                ))}
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Form name (optional — AI will suggest one)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={generateBanner}
                  onChange={(e) => setGenerateBanner(e.target.checked)}
                  className="rounded border-slate-300 text-violet-600"
                />
                Add a header banner
              </label>
            </div>
          )}

          {mode === 'template' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Pick a ready-made template and customize it after creation.</p>
              <select
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  const tpl = FORM_TEMPLATES.find((t) => t.id === e.target.value);
                  if (tpl && !name) setName(tpl.name);
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              >
                {FORM_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.category}
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {selectedTemplate.description}
                </p>
              )}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Form name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
          )}

          {mode === 'builder' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Start with an empty form. You can add fields on the next screen.
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Form name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                autoFocus
              />
            </div>
          )}

          {mode === 'html' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Paste your full HTML form. Fields are auto-detected from{' '}
                  <code className="rounded bg-slate-100 px-1">&lt;input name=&quot;…&quot;&gt;</code>,{' '}
                  <code className="rounded bg-slate-100 px-1">&lt;textarea&gt;</code>, and{' '}
                  <code className="rounded bg-slate-100 px-1">&lt;select&gt;</code> — nothing extra is added.
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Form name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                />
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={16}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm leading-relaxed"
                  spellCheck={false}
                  placeholder="<!DOCTYPE html>…"
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Live preview</p>
                <FormHtmlLivePreview
                  html={htmlContent}
                  form={htmlPreviewForm}
                  tenantId={tenantId}
                  environment={environment}
                />
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canCreate}
            className={mode === 'ai' ? 'bg-violet-600 hover:bg-violet-700' : undefined}
          >
            {mutation.isPending
              ? mode === 'ai'
                ? 'Creating with AI…'
                : 'Creating…'
              : mode === 'ai'
                ? 'Create with AI'
                : 'Create form'}
          </Button>
        </div>
      </div>
    </div>
  );
}
