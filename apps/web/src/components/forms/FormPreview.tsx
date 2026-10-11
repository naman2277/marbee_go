import { useState, useEffect, useMemo, useRef } from 'react';
import { Link2, ShieldCheck, RotateCw, Star } from 'lucide-react';
import { Button } from '@/components/ui';
import { FormBanner } from '@/components/forms/FormBanner';
import { HtmlFormIframe } from '@/components/forms/HtmlFormIframe';
import {
  submitFormResponse,
  isFieldVisible,
  validateFormSubmission,
  type FormField,
  type FormSchemaMapping,
  type FormSettings,
  type MarbeeForm,
} from '@/lib/forms';
import { DEFAULT_FORM_THEME, FORM_THEME_PRESETS, radiusClass } from '@/lib/form-design';
import { getFieldMappingLabel, isFieldMapped } from '@/lib/form-mapping';
import { buildHtmlFormDocument, countDetectedHtmlFields } from '@/lib/form-html-fields';

type Props = {
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  preview?: boolean;
  embedded?: boolean;
  mappingMode?: boolean;
  mapping?: FormSchemaMapping;
  onMapField?: (field: FormField, anchor: DOMRect) => void;
};

function renderInput(
  field: FormField,
  value: unknown,
  onChange: (name: string, value: unknown) => void,
) {
  const common =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  switch (field.field_type) {
    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(field.name, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={common}
        />
      );
    case 'select':
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={common}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'radio':
      return (
        <div className="space-y-1.5">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={field.name}
                checked={value === opt}
                onChange={() => onChange(field.name, opt)}
                className="text-brand-600 focus:ring-brand-500"
              />
              {opt}
            </label>
          ))}
        </div>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={arr.includes(opt)}
                onChange={(e) =>
                  onChange(field.name, e.target.checked ? [...arr, opt] : arr.filter((o) => o !== opt))
                }
                className="rounded text-brand-600 focus:ring-brand-500"
              />
              {opt}
            </label>
          ))}
        </div>
      );
    }
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.name, e.target.checked)}
          />
          {field.placeholder || field.label}
        </label>
      );
    case 'consent':
      return (
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.name, e.target.checked)}
            className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
          />
          <span>{field.placeholder || field.label}</span>
        </label>
      );
    case 'rating': {
      const current = Number(value) || 0;
      const max = field.max_value ?? 5;
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(field.name, n)}
              className="p-0.5 transition hover:scale-110"
              title={`${n} star${n === 1 ? '' : 's'}`}
            >
              <Star
                className={`h-6 w-6 ${n <= current ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
              />
            </button>
          ))}
          {current > 0 && <span className="ml-1.5 text-xs font-semibold text-slate-500">{current}/{max}</span>}
        </div>
      );
    }
    default:
      return (
        <input
          type={
            field.field_type === 'number'
              ? 'number'
              : field.field_type === 'date'
                ? 'date'
                : field.field_type === 'email'
                  ? 'email'
                  : field.field_type === 'url'
                    ? 'url'
                    : field.field_type === 'phone'
                      ? 'tel'
                      : 'text'
          }
          value={String(value ?? '')}
          onChange={(e) =>
            onChange(
              field.name,
              field.field_type === 'number' ? Number(e.target.value) : e.target.value,
            )
          }
          placeholder={field.placeholder}
          className={common}
        />
      );
  }
}

function FormFieldsBlock({
  fields,
  values,
  onChange,
  themePreset,
  mappingMode,
  mapping,
  onMapField,
  errorField,
}: {
  fields: FormField[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  themePreset?: keyof typeof FORM_THEME_PRESETS;
  mappingMode?: boolean;
  mapping?: FormSchemaMapping;
  onMapField?: (field: FormField, anchor: DOMRect) => void;
  errorField?: string | null;
}) {
  const ringClass = themePreset ? FORM_THEME_PRESETS[themePreset].ring : 'ring-slate-100';
  const visibleFields = fields.filter(
    (f) => f.field_type === 'hidden' || mappingMode || isFieldVisible(f, values),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visibleFields.map((field) => {
        if (field.field_type === 'hidden') return null;

        if (field.field_type === 'heading') {
          return (
            <div key={field.id} className="relative sm:col-span-2 pt-1 first:pt-0">
              <h3 className="text-base font-bold text-slate-900">{field.label}</h3>
              {field.content && <p className="mt-0.5 text-sm text-slate-500">{field.content}</p>}
            </div>
          );
        }
        if (field.field_type === 'divider') {
          return <hr key={field.id} className="sm:col-span-2 border-slate-200" />;
        }

        const mapped = mappingMode && mapping ? isFieldMapped(mapping, field.name) : false;
        const mappingLabel =
          mappingMode && mapping ? getFieldMappingLabel(mapping, field.name) : null;
        const hasError = errorField === field.name;
        const hideLabel = field.field_type === 'checkbox' || field.field_type === 'consent';

        return (
          <div
            key={field.id}
            className={`relative ${field.width === 'half' ? 'sm:col-span-1' : 'sm:col-span-2'}`}
          >
            {mappingMode && onMapField && (
              <button
                type="button"
                title={mappingLabel ?? 'Map this field to a table column'}
                onClick={(e) => onMapField(field, e.currentTarget.getBoundingClientRect())}
                className={`absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors ${
                  mapped
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-brand-200 hover:text-brand-600'
                }`}
              >
                <Link2 className="h-3 w-3" />
              </button>
            )}
            {!hideLabel && (
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </label>
            )}
            <div className={`rounded-lg ring-1 ${hasError ? 'ring-red-300' : ringClass}`}>
              {renderInput(field, values[field.name], onChange)}
            </div>
            {mappingLabel && (
              <p className="mt-1 text-[10px] font-medium text-emerald-600">{mappingLabel}</p>
            )}
            {field.help_text && !hasError && (
              <p className="mt-1 text-xs text-slate-400">{field.help_text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FormPreview({
  form,
  tenantId,
  environment,
  preview,
  embedded,
  mappingMode,
  mapping,
  onMapField,
}: Props) {
  const settings = form.settings as FormSettings;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');
  const [errorField, setErrorField] = useState<string | null>(null);

  // Seed hidden fields from a fixed default value or a matching URL query param
  // (e.g. a "utm_source" hidden field auto-captures ?utm_source=... on load).
  useEffect(() => {
    const hiddenFields = form.fields.filter((f) => f.field_type === 'hidden');
    if (!hiddenFields.length) return;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    setValues((prev) => {
      const next = { ...prev };
      for (const f of hiddenFields) {
        if (next[f.name] !== undefined) continue;
        next[f.name] = f.default_value ?? params?.get(f.name) ?? '';
      }
      return next;
    });
  }, [form.fields]);

  // Anti-Spam CAPTCHA State
  const captchaEnabled = Boolean(settings.captcha_enabled);
  const [captchaNum1, setCaptchaNum1] = useState(4);
  const [captchaNum2, setCaptchaNum2] = useState(7);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaTurnstileChecked, setCaptchaTurnstileChecked] = useState(false);

  const refreshCaptcha = () => {
    setCaptchaNum1(Math.floor(Math.random() * 8) + 2);
    setCaptchaNum2(Math.floor(Math.random() * 8) + 1);
    setCaptchaAnswer('');
    setCaptchaTurnstileChecked(false);
  };

  useEffect(() => {
    if (captchaEnabled) {
      refreshCaptcha();
    }
  }, [captchaEnabled]);

  const fields = [...form.fields].sort((a, b) => a.sort_order - b.sort_order);
  const isHtmlMode = settings.build_mode === 'html' && settings.html_content;
  const theme = settings.theme ?? DEFAULT_FORM_THEME;
  const themeConfig = FORM_THEME_PRESETS[theme.preset];
  const radius = radiusClass(theme.radius);

  const handleChange = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errorField === name) {
      setErrorField(null);
      setStatus('idle');
      setFeedback('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Field-level validation (required, length/range, pattern, email/URL format) —
    // conditional fields that are currently hidden are skipped.
    const invalid = validateFormSubmission(fields, values);
    if (invalid) {
      setStatus('error');
      setErrorField(invalid.field);
      setFeedback(invalid.message);
      return;
    }
    setErrorField(null);

    // CAPTCHA verification check
    if (captchaEnabled) {
      if (settings.captcha_type === 'turnstile') {
        if (!captchaTurnstileChecked) {
          setStatus('error');
          setFeedback('Please verify you are human by checking the anti-spam box.');
          return;
        }
      } else {
        const expected = captchaNum1 + captchaNum2;
        if (parseInt(captchaAnswer.trim(), 10) !== expected) {
          setStatus('error');
          setFeedback('Incorrect CAPTCHA answer. Please solve the challenge and try again.');
          refreshCaptcha();
          return;
        }
      }
    }

    setStatus('submitting');
    setFeedback('');

    const result = await submitFormResponse({
      form,
      tenantId,
      environment,
      data: values,
      allowDraft: preview,
    });

    if (result.error) {
      setStatus('error');
      setFeedback(result.error || settings.error_message || 'Something went wrong. Please try again.');
      return;
    }

    setStatus('success');
    setFeedback(settings.success_message ?? 'Thank you!');
    setValues({});
    if (captchaEnabled) refreshCaptcha();

    if (settings.redirect_url && !embedded) {
      setTimeout(() => {
        window.location.href = settings.redirect_url!;
      }, 800);
    }
  };

  const canSubmit = preview || form.status === 'published';
  const isHtmlForm = Boolean(isHtmlMode && settings.html_content);

  const htmlDoc = useMemo(
    () =>
      isHtmlForm
        ? buildHtmlFormDocument(settings.html_content!, {
            formTitle: form.name,
            formDescription: settings.description ?? '',
            submitMode: true,
          })
        : '',
    [isHtmlForm, settings.html_content, form.name, settings.description],
  );

  const captchaRef = useRef({
    enabled: captchaEnabled,
    type: settings.captcha_type,
    num1: captchaNum1,
    num2: captchaNum2,
    answer: captchaAnswer,
    checked: captchaTurnstileChecked,
  });
  captchaRef.current = {
    enabled: captchaEnabled,
    type: settings.captcha_type,
    num1: captchaNum1,
    num2: captchaNum2,
    answer: captchaAnswer,
    checked: captchaTurnstileChecked,
  };

  useEffect(() => {
    if (!isHtmlForm) return;
    const onMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'marbee-form-submit') return;

      const cap = captchaRef.current;
      if (cap.enabled) {
        if (cap.type === 'turnstile') {
          if (!cap.checked) {
            setStatus('error');
            setFeedback('Please verify you are human by checking the anti-spam box below the form.');
            return;
          }
        } else {
          const expected = cap.num1 + cap.num2;
          if (parseInt(cap.answer.trim(), 10) !== expected) {
            setStatus('error');
            setFeedback('Incorrect anti-spam CAPTCHA answer. Please solve the challenge below and submit again.');
            refreshCaptcha();
            return;
          }
        }
      }

      setStatus('submitting');
      setFeedback('');
      const result = await submitFormResponse({
        form,
        tenantId,
        environment,
        data: event.data.data as Record<string, unknown>,
        allowDraft: preview,
      });
      if (result.error) {
        setStatus('error');
        setFeedback(result.error || settings.error_message || 'Something went wrong. Please try again.');
        return;
      }
      setStatus('success');
      setFeedback(settings.success_message ?? 'Thank you!');
      if (cap.enabled) refreshCaptcha();
      if (settings.redirect_url && !embedded) {
        setTimeout(() => {
          window.location.href = settings.redirect_url!;
        }, 800);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isHtmlForm, form, tenantId, environment, preview, settings.success_message, settings.redirect_url, embedded]);

  if (isHtmlForm) {
    const detected = countDetectedHtmlFields(settings.html_content!);
    return (
      <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-2xl p-4'}>
        {preview && form.status !== 'published' && !embedded && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Preview mode — publish the form to accept live submissions.
          </div>
        )}
        {status === 'success' ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
            {feedback}
          </div>
        ) : (
          <>
            {detected === 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                No input fields detected. Add <code className="rounded bg-amber-100 px-1">name</code> attributes to your HTML inputs.
              </div>
            )}
            {feedback && status === 'error' && (
              <p className="mb-4 text-sm text-red-600 font-medium">{feedback}</p>
            )}
            <HtmlFormIframe title={form.name} srcDoc={htmlDoc} seamless={embedded} />

            {/* ANTI-SPAM CAPTCHA CHALLENGE FOR HTML FORMS */}
            {captchaEnabled && (
              <div
                className={`mt-4 ${
                  settings.captcha_align === 'left'
                    ? 'w-full sm:max-w-sm mr-auto'
                    : settings.captcha_align === 'center'
                      ? 'w-full sm:max-w-sm mx-auto'
                      : settings.captcha_align === 'right'
                        ? 'w-full sm:max-w-sm ml-auto'
                        : 'w-full'
                }`}
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      {settings.captcha_label || 'Anti-Spam Verification'}
                    </span>
                    <button
                      type="button"
                      onClick={refreshCaptcha}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition"
                      title="Refresh challenge"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {settings.captcha_type === 'turnstile' ? (
                    <label className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:border-slate-300 transition">
                      <input
                        type="checkbox"
                        checked={captchaTurnstileChecked}
                        onChange={(e) => setCaptchaTurnstileChecked(e.target.checked)}
                        className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-xs font-medium text-slate-800">I am a human (verify)</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800">
                        What is {captchaNum1} + {captchaNum2} = ?
                      </div>
                      <input
                        type="number"
                        value={captchaAnswer}
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        placeholder="Answer"
                        className="w-28 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                        required
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const formBody =
    status === 'success' ? (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
        {feedback}
      </div>
    ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <>
          <h2 className="text-xl font-semibold text-slate-900">{form.name}</h2>
          {settings.description && <p className="text-sm text-slate-500">{settings.description}</p>}
          <FormFieldsBlock
            fields={fields}
            values={values}
            onChange={handleChange}
            themePreset={theme.preset}
            mappingMode={mappingMode}
            mapping={mapping}
            onMapField={onMapField}
            errorField={errorField}
          />
        </>

        {fields.length === 0 && (
          <p className="text-sm text-slate-500">Add fields in the builder to preview the form.</p>
        )}

        {/* ANTI-SPAM CAPTCHA CHALLENGE */}
        {captchaEnabled && fields.length > 0 && (
          <div
            className={`${
              settings.captcha_align === 'left'
                ? 'w-full sm:max-w-sm mr-auto'
                : settings.captcha_align === 'center'
                  ? 'w-full sm:max-w-sm mx-auto'
                  : settings.captcha_align === 'right'
                    ? 'w-full sm:max-w-sm ml-auto'
                    : 'w-full'
            }`}
          >
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  {settings.captcha_label || 'Anti-Spam Verification'}
                </span>
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition"
                  title="Refresh challenge"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {settings.captcha_type === 'turnstile' ? (
                <label className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:border-slate-300 transition">
                  <input
                    type="checkbox"
                    checked={captchaTurnstileChecked}
                    onChange={(e) => setCaptchaTurnstileChecked(e.target.checked)}
                    className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs font-medium text-slate-800">I am a human (verify)</span>
                </label>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800">
                    What is {captchaNum1} + {captchaNum2} = ?
                  </div>
                  <input
                    type="number"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="Answer"
                    className="w-28 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                    required
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {feedback && status === 'error' && <p className="text-sm text-red-600 font-medium">{feedback}</p>}

        <Button
          type="submit"
          className={`w-full text-white ${themeConfig.button}`}
          disabled={!canSubmit || status === 'submitting' || fields.length === 0}
        >
          {status === 'submitting' ? 'Submitting…' : settings.submit_label ?? 'Submit'}
        </Button>
      </form>
    );

  return (
    <div className={embedded ? 'p-4' : 'mx-auto max-w-lg p-6'}>
      {preview && form.status !== 'published' && !embedded && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Preview mode — publish the form to accept live submissions.
        </div>
      )}

      <div
        className={`overflow-hidden border border-slate-200 bg-white ${radius} ${
          theme.style === 'glass' ? 'bg-white/80 backdrop-blur' : ''
        } ${embedded ? 'p-0' : 'shadow-sm'}`}
      >
        <FormBanner banner={settings.banner} formName={form.name} preset={theme.preset} />
        <div className={settings.banner?.enabled ? 'p-6' : embedded ? 'p-4' : 'p-6'}>
          {!settings.banner?.enabled && !isHtmlMode && (
            <>
              <h2 className="text-xl font-semibold text-slate-900">{form.name}</h2>
              {settings.description && (
                <p className="mt-2 text-sm text-slate-500">{settings.description}</p>
              )}
            </>
          )}
          {settings.ai_generated && (
            <p className="mb-4 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
              ✨ AI generated
            </p>
          )}
          <div className={!settings.banner?.enabled && !isHtmlMode ? 'mt-6' : ''}>{formBody}</div>
        </div>
      </div>
    </div>
  );
}
