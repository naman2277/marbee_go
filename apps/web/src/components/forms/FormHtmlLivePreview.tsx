import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { FormSchemaMapping, MarbeeForm } from '@/lib/forms';
import { buildHtmlFormDocument, countDetectedHtmlFields } from '@/lib/form-html-fields';
import { syncFieldsFromHtml } from '@/lib/form-html-fields';

type Props = {
  html: string;
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  mappingMode?: boolean;
  mapping?: FormSchemaMapping;
};

export function FormHtmlLivePreview({
  html,
  form,
  mappingMode,
  mapping,
}: Props) {
  const detectedFields = useMemo(() => syncFieldsFromHtml(html, form.fields), [html, form.fields]);

  const iframeDoc = useMemo(
    () =>
      buildHtmlFormDocument(html, {
        formTitle: form.name,
        formDescription: form.settings.description ?? '',
        canvasMode: mappingMode,
        mapping,
        selectedFieldName: undefined,
      }),
    [html, form.name, form.settings.description, mappingMode, mapping],
  );

  const detectedCount = countDetectedHtmlFields(html);

  return (
    <div className="space-y-3">
      {detectedCount === 0 && html.trim().length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No fields detected. Use <code className="rounded bg-amber-100 px-1">name</code> on{' '}
            <code className="rounded bg-amber-100 px-1">&lt;input&gt;</code>,{' '}
            <code className="rounded bg-amber-100 px-1">&lt;textarea&gt;</code>, or{' '}
            <code className="rounded bg-amber-100 px-1">&lt;select&gt;</code> elements in your HTML.
          </span>
        </div>
      )}

      {detectedCount > 0 && (
        <p className="text-xs text-slate-500">
          {detectedCount} field{detectedCount === 1 ? '' : 's'} detected:{' '}
          {detectedFields.map((f) => f.name).join(', ')}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <iframe
          title="Form HTML preview"
          srcDoc={iframeDoc}
          className="block h-[min(560px,70vh)] w-full border-0 bg-white"
          sandbox={mappingMode ? 'allow-same-origin allow-scripts' : 'allow-same-origin'}
        />
      </div>

      <p className="text-center text-[10px] text-slate-400">Your HTML is shown exactly as pasted — no extra fields added</p>
    </div>
  );
}
