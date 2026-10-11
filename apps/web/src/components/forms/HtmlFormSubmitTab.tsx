import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui';
import { updateForm, type FormSettings, type FormSubmitAction, type MarbeeForm } from '@/lib/forms';

type Props = {
  form: MarbeeForm;
  onSaved?: () => void;
  onNext?: () => void;
};

export function HtmlFormSubmitTab({ form, onSaved, onNext }: Props) {
  const [submitAction, setSubmitAction] = useState<FormSubmitAction>(
    form.settings.submit_action ?? (form.settings.redirect_url ? 'redirect' : 'thank_you'),
  );
  const [successMessage, setSuccessMessage] = useState(
    form.settings.success_message ?? 'Thank you — your response was recorded.',
  );
  const [redirectUrl, setRedirectUrl] = useState(form.settings.redirect_url ?? '');
  const [errorMessage, setErrorMessage] = useState(
    form.settings.error_message ?? 'Something went wrong. Please check your entries and try again.',
  );
  const [previewMode, setPreviewMode] = useState<'thank_you' | 'error'>('thank_you');
  const [message, setMessage] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextSettings: FormSettings = {
        ...form.settings,
        submit_action: submitAction,
        success_message: successMessage.trim(),
        error_message: errorMessage.trim(),
        redirect_url: submitAction === 'redirect' ? redirectUrl.trim() || undefined : undefined,
      };
      const result = await updateForm(form.id, { settings: nextSettings });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setMessage('Submit settings saved');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
  });

  const goNext = () => {
    saveMutation.mutate(undefined, { onSuccess: () => onNext?.() });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader title="After submit" subtitle="What happens when someone submits your form" />
          <div className="space-y-4 border-t border-slate-100 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSubmitAction('thank_you')}
                className={`rounded-xl border px-4 py-3 text-left text-sm ${
                  submitAction === 'thank_you' ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : 'border-slate-200'
                }`}
              >
                <p className="font-medium text-slate-900">Thank you page</p>
                <p className="mt-0.5 text-xs text-slate-500">Show a success message on the same page</p>
              </button>
              <button
                type="button"
                onClick={() => setSubmitAction('redirect')}
                className={`rounded-xl border px-4 py-3 text-left text-sm ${
                  submitAction === 'redirect' ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200' : 'border-slate-200'
                }`}
              >
                <p className="font-medium text-slate-900">Redirect to URL</p>
                <p className="mt-0.5 text-xs text-slate-500">Send to a thank-you page or CTA link</p>
              </button>
            </div>

            {submitAction === 'thank_you' ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Thank you message</label>
                <textarea
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Thank you for your submission!"
                />
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Redirect URL</label>
                <input
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="https://yoursite.com/thank-you"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Error message</label>
              <textarea
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Shown when validation fails or submit errors"
              />
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-emerald-600">{message}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" onClick={goNext} disabled={saveMutation.isPending}>
              Next: Publish
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Preview"
          subtitle="See how thank you and error states will look"
          action={
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPreviewMode('thank_you')}
                className={`rounded-md px-2.5 py-1 font-medium ${previewMode === 'thank_you' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                Thank you
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('error')}
                className={`rounded-md px-2.5 py-1 font-medium ${previewMode === 'error' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                Error
              </button>
            </div>
          }
        />
        <div className="border-t border-slate-100 p-6">
          {previewMode === 'thank_you' ? (
            submitAction === 'redirect' ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm text-slate-600">On success, users are redirected to:</p>
                <p className="mt-2 break-all font-mono text-sm text-brand-700">
                  {redirectUrl || 'https://yoursite.com/thank-you'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  ✓
                </div>
                <p className="text-sm font-medium text-emerald-900">Submission successful</p>
                <p className="mt-2 text-sm text-emerald-800">{successMessage || 'Thank you!'}</p>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                !
              </div>
              <p className="text-sm font-medium text-red-900">Submission failed</p>
              <p className="mt-2 text-sm text-red-800">{errorMessage || 'Please try again.'}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
