import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { updateForm, type FormSettings } from '@/lib/forms';
import { DEFAULT_HTML_TEMPLATE } from '@/lib/form-templates';

type Props = {
  formId: string;
  settings: FormSettings;
  formName: string;
  onSaved?: () => void;
};

export function FormHtmlEditor({ formId, settings, formName, onSaved }: Props) {
  const [html, setHtml] = useState(
    settings.html_content ??
      DEFAULT_HTML_TEMPLATE.replace('{{form_title}}', formName).replace(
        '{{form_description}}',
        settings.description ?? '',
      ),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const result = await updateForm(formId, {
        settings: { ...settings, html_content: html, build_mode: 'html' },
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

  return (
    <div className="space-y-4 p-6">
      <p className="text-sm text-slate-500">
        Custom HTML wrapper for your form. Use{' '}
        <code className="rounded bg-slate-100 px-1">{`{MARBBEE_FIELDS}`}</code> to inject fields.
      </p>
      <textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={16}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
        spellCheck={false}
      />
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving…' : 'Save HTML'}
      </Button>
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
