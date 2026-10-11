import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardHeader, Button } from '@/components/ui';
import { FormMappingPreview } from '@/components/forms/FormMappingPreview';
import { FormFieldsEditor } from '@/components/forms/FormFieldsEditor';
import { updateForm, type MarbeeForm } from '@/lib/forms';
import { DEFAULT_HTML_TEMPLATE } from '@/lib/form-templates';
import { MARBBEE_FIELDS_PLACEHOLDER } from '@/lib/form-html-preview';
import type { SchemaMappingOption } from '@/lib/form-mapping';

type Props = {
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  schemas: SchemaMappingOption[];
  onSaved?: () => void;
};

export function FormHtmlEditorPanel({ form, tenantId, environment, schemas, onSaved }: Props) {
  const [html, setHtml] = useState(
    form.settings.html_content ??
      DEFAULT_HTML_TEMPLATE.replace('{{form_title}}', form.name).replace(
        '{{form_description}}',
        form.settings.description ?? '',
      ),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sideTab, setSideTab] = useState<'preview' | 'fields'>('preview');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const result = await updateForm(form.id, {
        settings: { ...form.settings, html_content: html, build_mode: 'html' },
      });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setMessage('HTML saved');
      setError('');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  const insertPlaceholder = () => {
    setHtml((prev) => (prev.includes(MARBBEE_FIELDS_PLACEHOLDER) ? prev : `${prev}\n${MARBBEE_FIELDS_PLACEHOLDER}\n`));
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="HTML designer"
          subtitle={`Paste your layout and place ${MARBBEE_FIELDS_PLACEHOLDER} where fields should render`}
        />
        <div className="space-y-3 px-6 pb-6">
          <p className="text-xs text-slate-500">
            Supports full HTML documents (<code className="rounded bg-slate-100 px-1">&lt;html&gt;</code>) or
            fragments. Use <code className="rounded bg-slate-100 px-1">{'{{form_title}}'}</code> and{' '}
            <code className="rounded bg-slate-100 px-1">{'{{form_description}}'}</code> for dynamic text.
          </p>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={22}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm leading-relaxed focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
            spellCheck={false}
            placeholder="<!DOCTYPE html>… or <div>…</div>"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save HTML'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={insertPlaceholder}>
              Insert {MARBBEE_FIELDS_PLACEHOLDER}
            </Button>
            {message && <span className="text-sm text-emerald-600">{message}</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={sideTab === 'preview' ? 'Preview & mapping' : 'Form fields'}
          subtitle={
            sideTab === 'preview'
              ? 'Live preview with per-field table mapping'
              : 'Configure inputs injected at the placeholder'
          }
          action={
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSideTab('preview')}
                className={`rounded-md px-2.5 py-1 font-medium ${sideTab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setSideTab('fields')}
                className={`rounded-md px-2.5 py-1 font-medium ${sideTab === 'fields' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Fields
              </button>
            </div>
          }
        />
        <div className="p-4">
          {sideTab === 'preview' ? (
            <FormMappingPreview
              form={form}
              tenantId={tenantId}
              environment={environment}
              schemas={schemas}
              htmlOverride={html}
              onSaved={onSaved}
            />
          ) : (
            <FormFieldsEditor formId={form.id} fields={form.fields} onSaved={onSaved} />
          )}
        </div>
      </Card>
    </div>
  );
}
