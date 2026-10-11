import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Settings, Globe, ArrowRight, ShieldCheck, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { updateForm, type FormSettings, type MarbeeForm } from '@/lib/forms';

type Props = {
  form?: MarbeeForm;
  formId?: string;
  settings?: FormSettings;
  slug?: string;
  tenantId?: string;
  environment?: string;
  isPublished?: boolean;
  onSaved?: () => void;
};

export function FormSettingsPanel({ form, formId: propFormId, settings: propSettings, slug: propSlug, onSaved }: Props) {
  const formId = form?.id ?? propFormId ?? '';
  const settings = form?.settings ?? propSettings ?? {};
  const slug = form?.slug ?? propSlug ?? '';

  const [submitLabel, setSubmitLabel] = useState(settings.submit_label ?? 'Submit');
  const [successMessage, setSuccessMessage] = useState(
    settings.success_message ?? 'Thank you — your response was recorded.',
  );
  const [redirectUrl, setRedirectUrl] = useState(settings.redirect_url ?? '');
  const [description, setDescription] = useState(settings.description ?? '');
  const [errorMessage, setErrorMessage] = useState(
    settings.error_message ?? 'Please check your inputs and try again.',
  );
  const [captchaEnabled, setCaptchaEnabled] = useState(settings.captcha_enabled ?? false);
  const [captchaType, setCaptchaType] = useState<'smart_math' | 'turnstile'>(
    settings.captcha_type ?? 'smart_math',
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleToggleCaptcha = async (enabled: boolean) => {
    setCaptchaEnabled(enabled);
    const next: FormSettings = {
      ...settings,
      submit_label: submitLabel.trim() || 'Submit',
      success_message: successMessage.trim(),
      redirect_url: redirectUrl.trim() || undefined,
      description: description.trim() || undefined,
      error_message: errorMessage.trim() || undefined,
      captcha_enabled: enabled,
      captcha_type: captchaType,
    };
    try {
      const result = await updateForm(formId, { settings: next });
      if (result.error) throw new Error(result.error);
      setMessage(enabled ? 'Anti-Spam CAPTCHA enabled & saved' : 'Anti-Spam CAPTCHA disabled & saved');
      setError('');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleChangeCaptchaType = async (type: 'smart_math' | 'turnstile') => {
    setCaptchaType(type);
    const next: FormSettings = {
      ...settings,
      submit_label: submitLabel.trim() || 'Submit',
      success_message: successMessage.trim(),
      redirect_url: redirectUrl.trim() || undefined,
      description: description.trim() || undefined,
      error_message: errorMessage.trim() || undefined,
      captcha_enabled: true,
      captcha_type: type,
    };
    try {
      const result = await updateForm(formId, { settings: next });
      if (result.error) throw new Error(result.error);
      setMessage('Challenge mode updated & saved');
      setError('');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const next: FormSettings = {
        ...settings,
        submit_label: submitLabel.trim() || 'Submit',
        success_message: successMessage.trim(),
        redirect_url: redirectUrl.trim() || undefined,
        description: description.trim() || undefined,
        error_message: errorMessage.trim() || undefined,
        captcha_enabled: captchaEnabled,
        captcha_type: captchaType,
      };
      const result = await updateForm(formId, { settings: next });
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      setMessage('Settings updated successfully');
      setError('');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="max-w-2xl space-y-5 text-xs">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">Form Behavior & Submission Rules</h3>
        <p className="text-slate-500 text-xs mt-0.5">
          Configure what respondents see after submitting and where leads are redirected.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block font-bold text-slate-700">Form Public Slug / Path</label>
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 font-mono">
            <span>/forms/</span>
            <span className="font-bold text-slate-900">{slug}</span>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block font-bold text-slate-700">Form Description / Header Subtext</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-brand-500 focus:outline-none"
            placeholder="Helpful instructions shown at the top of the form…"
          />
        </div>

        <div>
          <label className="mb-1 block font-bold text-slate-700">Submit Button Text</label>
          <input
            type="text"
            value={submitLabel}
            onChange={(e) => setSubmitLabel(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
            placeholder="e.g. Submit, Register Now, Get Started"
          />
        </div>

        <div>
          <label className="mb-1 block font-bold text-slate-700">Redirect URL on Success (optional)</label>
          <input
            type="url"
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            placeholder="https://yourwebsite.com/thank-you"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block font-bold text-slate-700">Thank You Confirmation Message</label>
          <input
            type="text"
            value={successMessage}
            onChange={(e) => setSuccessMessage(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
            placeholder="Message displayed when submission succeeds"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block font-bold text-slate-700">Validation Error Message</label>
          <input
            type="text"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-none"
            placeholder="Message displayed when validation fails"
          />
        </div>

        {/* SPAM PROTECTION & CAPTCHA */}
        <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <div>
                <h4 className="text-xs font-bold text-slate-900">Anti-Spam & Bot Protection</h4>
                <p className="text-[11px] text-slate-500">
                  Protect your form against automated bot spam and fake lead submissions.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={captchaEnabled}
                onChange={(e) => handleToggleCaptcha(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {captchaEnabled && (
            <div className="pt-2 border-t border-slate-200/60 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 text-[11px]">Challenge Mode</label>
                <select
                  value={captchaType}
                  onChange={(e) => handleChangeCaptchaType(e.target.value as 'smart_math' | 'turnstile')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-none"
                >
                  <option value="smart_math">Interactive Math Challenge (e.g. 7 + 4 = 11)</option>
                  <option value="turnstile">Smart Human Verification Checkbox</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-500 self-end pb-1">
                Respondents will be asked to verify they are human before the submit button is activated.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="shadow-xs"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Form Settings'}
        </Button>

        {message && (
          <span className="flex items-center gap-1 font-bold text-emerald-600">
            <Check className="h-3.5 w-3.5" />
            <span>{message}</span>
          </span>
        )}
        {error && <span className="font-semibold text-red-600">{error}</span>}
      </div>
    </div>
  );
}
