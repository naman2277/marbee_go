import { useMemo } from 'react';
import type { ChannelType, ProviderFieldDef } from '@/lib/channel-registry';
import { getFieldGuide } from '@/lib/channel-field-guides';
import { FieldGuideTooltip } from '@/components/channels/FieldGuideTooltip';

type ChannelProviderFormProps = {
  channel: ChannelType;
  providerType: string;
  fields: ProviderFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  focusFieldKey?: string | null;
};

export function ChannelProviderForm({
  channel,
  providerType,
  fields,
  values,
  onChange,
  disabled,
  focusFieldKey,
}: ChannelProviderFormProps) {
  const grouped = useMemo(() => {
    const secrets = fields.filter((f) => f.secret);
    const publicFields = fields.filter((f) => !f.secret);
    return { secrets, publicFields };
  }, [fields]);

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        Fields marked with <span className="text-red-500">*</span> are required. Hover the{' '}
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
          i
        </span>{' '}
        icon on any field for step-by-step guidance.
      </p>

      {grouped.publicFields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {grouped.publicFields.map((field) => (
            <ProviderField
              key={field.key}
              channel={channel}
              providerType={providerType}
              field={field}
              value={values[field.key] ?? ''}
              onChange={(v) => onChange(field.key, v)}
              disabled={disabled}
              highlighted={focusFieldKey === field.key}
            />
          ))}
        </div>
      )}

      {grouped.secrets.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Credentials</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {grouped.secrets.map((field) => (
              <ProviderField
                key={field.key}
                channel={channel}
                providerType={providerType}
                field={field}
                value={values[field.key] ?? ''}
                onChange={(v) => onChange(field.key, v)}
                disabled={disabled}
                highlighted={focusFieldKey === field.key}
                storedOnServer={field.key === 'service_account_json' && values.__sa_configured === '1'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderField({
  channel,
  providerType,
  field,
  value,
  onChange,
  disabled,
  highlighted,
  storedOnServer,
}: {
  channel: ChannelType;
  providerType: string;
  field: ProviderFieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  highlighted?: boolean;
  /** D-022: a key is already stored (encrypted, server-side); leave empty to keep it. */
  storedOnServer?: boolean;
}) {
  const spanClass = field.type === 'json' || field.type === 'textarea' ? 'sm:col-span-2' : '';
  const inputClass =
    'mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500';
  const monoClass = field.type === 'json' || field.type === 'password' ? 'font-mono text-xs' : '';
  const guide = getFieldGuide(channel, providerType, field.key);
  const missing = field.required && !value.trim() && !storedOnServer;
  // Secrets must never reach spellcheckers / writing-assistant extensions (e.g. Grammarly
  // uploads what you type) or the browser's autofill store.
  const secretAttrs = field.secret
    ? {
        spellCheck: false,
        autoComplete: 'off',
        autoCorrect: 'off',
        autoCapitalize: 'off',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        'data-lt-active': 'false',
      }
    : {};

  return (
    <div
      id={`field-${field.key}`}
      className={`${spanClass} rounded-xl transition-colors ${highlighted ? 'ring-2 ring-brand-300 ring-offset-2' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
        <FieldGuideTooltip guide={guide} required={field.required} />
      </div>

      {field.type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${inputClass} ${missing ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}
        >
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' || field.type === 'json' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={field.rows ?? 4}
          {...secretAttrs}
          placeholder={
            storedOnServer
              ? 'Stored securely on the server. Paste a new JSON only to replace it.'
              : field.placeholder ?? guide.example
          }
          className={`${inputClass} ${monoClass} ${missing ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}
        />
      ) : (
        <input
          type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          {...secretAttrs}
          placeholder={field.placeholder ?? guide.example}
          className={`${inputClass} ${monoClass} ${missing ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}
        />
      )}

      {missing && <p className="mt-1 text-xs text-amber-700">Required — hover (i) for where to find this value</p>}
      {storedOnServer && !value.trim() && (
        <p className="mt-1 text-xs text-emerald-700">Stored securely on the server (encrypted) — never shown again.</p>
      )}
    </div>
  );
}
