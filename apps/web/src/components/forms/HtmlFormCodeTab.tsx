import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Code2 } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';
import { updateForm, type MarbeeForm } from '@/lib/forms';
import { DEFAULT_HTML_TEMPLATE } from '@/lib/form-templates';
import { syncFieldsFromHtml } from '@/lib/form-html-fields';

type Props = {
  form: MarbeeForm;
  html: string;
  onHtmlChange: (html: string) => void;
  onSaved?: () => void;
  onNext?: () => void;
};

export function HtmlFormCodeTab({ form, html, onHtmlChange, onSaved, onNext }: Props) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const detected = syncFieldsFromHtml(html, form.fields);
      const result = await updateForm(form.id, {
        settings: { ...form.settings, html_content: html, build_mode: 'html' },
        fields: detected,
      });
      if (result.error) throw new Error(result.error);
      return detected.length;
    },
    onSuccess: (count) => {
      setMessage(`Saved · ${count} input${count === 1 ? '' : 's'} detected in HTML`);
      setError('');
      onSaved?.();
      setTimeout(() => setMessage(''), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const goNext = () => {
    saveMutation.mutate(undefined, {
      onSuccess: () => onNext?.(),
    });
  };

  const loadTemplate = () => {
    onHtmlChange(
      DEFAULT_HTML_TEMPLATE.replace('{{form_title}}', form.name).replace(
        '{{form_description}}',
        form.settings.description ?? '',
      ),
    );
  };

  return (
    <Card>
      <CardHeader
        title="HTML form code"
        subtitle="Write your form markup — inputs are detected automatically from name attributes"
        action={
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={loadTemplate}>
              Load starter template
            </Button>
            <Button size="sm" variant="secondary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" onClick={goNext} disabled={saveMutation.isPending || !html.trim()}>
              Next: Preview
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        }
      />
      <div className="border-t border-slate-100 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
          <Code2 className="h-4 w-4" />
          Use <code className="rounded bg-slate-100 px-1">name</code> on each{' '}
          <code className="rounded bg-slate-100 px-1">&lt;input&gt;</code>,{' '}
          <code className="rounded bg-slate-100 px-1">&lt;textarea&gt;</code>, or{' '}
          <code className="rounded bg-slate-100 px-1">&lt;select&gt;</code>
        </div>
        <textarea
          value={html}
          onChange={(e) => onHtmlChange(e.target.value)}
          spellCheck={false}
          className="min-h-[min(70vh,640px)] w-full resize-y rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          placeholder="<!DOCTYPE html>…"
        />
        {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </Card>
  );
}
