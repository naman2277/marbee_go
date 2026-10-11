import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { FormPreview } from '@/components/forms/FormPreview';
import { countDetectedHtmlFields, syncFieldsFromHtml } from '@/lib/form-html-fields';
import type { MarbeeForm } from '@/lib/forms';

type Props = {
  form: MarbeeForm;
  html: string;
  tenantId: string;
  environment: string;
  onNext?: () => void;
};

export function HtmlFormPreviewTab({ form, html, tenantId, environment, onNext }: Props) {
  const detected = useMemo(() => syncFieldsFromHtml(html, form.fields), [html, form.fields]);
  const count = countDetectedHtmlFields(html);

  const previewForm: MarbeeForm = useMemo(
    () => ({
      ...form,
      fields: detected,
      settings: { ...form.settings, html_content: html, build_mode: 'html' },
    }),
    [form, html, detected],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader
          title="Form preview"
          subtitle="This is exactly how your HTML will render — no extra fields added"
          action={
            <Button size="sm" onClick={onNext} disabled={count === 0}>
              Next: Mapping
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          }
        />
        <div className="border-t border-slate-100 p-2 sm:p-4">
          {count === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
              No input fields detected. Go back to <strong>My Form</strong>, add{' '}
              <code className="rounded bg-amber-100 px-1">name</code> attributes to your inputs, and save.
            </div>
          ) : (
            <FormPreview form={previewForm} tenantId={tenantId} environment={environment} preview embedded />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Detected fields"
          subtitle={`${count} input${count === 1 ? '' : 's'} found in your HTML`}
        />
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {count === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nothing detected yet.</p>
          ) : (
            detected.map((field) => (
              <div key={field.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{field.label}</p>
                  <p className="font-mono text-xs text-slate-400">{field.name}</p>
                </div>
                <Badge variant="default">{field.field_type}</Badge>
              </div>
            ))
          )}
        </div>
        {count > 0 && (
          <div className="border-t border-slate-100 p-4">
            <p className="text-xs text-slate-500">
              These fields were parsed from your HTML. Configure where each response is stored on the{' '}
              <strong>Mapping</strong> tab.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
