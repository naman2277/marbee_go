import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Bell,
  Check,
  Database,
  Fingerprint,
  Info,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Save,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Table2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { fetchGlobalVariables, listEncryptionKeys } from '@/lib/global-variables';
import {
  CAPTCHA_PROVIDERS,
  DIFFICULTY_SPEC,
  type BotProtectionConfig,
  type CaptchaConfig,
  type CaptchaDifficulty,
  type CaptchaTrigger,
  type InjectionAction,
  type InputHardeningConfig,
} from '@/lib/form-security';
import { NON_INPUT_FIELD_TYPES, type FormSettings, type MarbeeForm } from '@/lib/forms';

type SectionId =
  | 'general'
  | 'submission'
  | 'availability'
  | 'notifications'
  | 'security'
  | 'encryption'
  | 'data'
  | 'mapping'
  | 'embed'
  | 'responses';

const SECTIONS: Array<{ id: SectionId; label: string; icon: typeof Settings2; group: string }> = [
  { id: 'general', label: 'General', icon: Settings2, group: 'Form' },
  { id: 'submission', label: 'Submission', icon: Check, group: 'Form' },
  { id: 'availability', label: 'Availability', icon: AlarmClock, group: 'Form' },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'Form' },
  { id: 'security', label: 'Security & anti-spam', icon: ShieldCheck, group: 'Protection' },
  { id: 'encryption', label: 'Encryption', icon: Lock, group: 'Protection' },
  { id: 'data', label: 'Data & retention', icon: Database, group: 'Protection' },
  { id: 'mapping', label: 'Schema mapping', icon: Table2, group: 'Integrations' },
  { id: 'embed', label: 'Embed & share', icon: Share2, group: 'Integrations' },
  { id: 'responses', label: 'Responses', icon: Link2, group: 'Integrations' },
];

const input =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 transition';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  icon?: typeof ShieldCheck;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition">
      <span className="flex min-w-0 gap-3">
        {Icon && (
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              checked ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
            }`}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">{label}</span>
          {hint && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{hint}</span>}
        </span>
      </span>
      <span className="relative inline-flex shrink-0 items-center pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-slate-200 transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
      </span>
    </label>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 border-b border-slate-200 pb-4">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

/** Comma/newline separated text ⇄ string[] */
function useListField(value: string[] | undefined, onChange: (next: string[]) => void) {
  const [text, setText] = useState((value ?? []).join(', '));
  useEffect(() => setText((value ?? []).join(', ')), [value?.join(',')]);
  return {
    text,
    setText,
    commit: () =>
      onChange(
        text
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  form: MarbeeForm;
  tenantId: string;
  environment: string;
  onSave: (settings: FormSettings) => void;
  saving?: boolean;
  /** Existing panels rendered inside the integration sections. */
  mappingContent?: ReactNode;
  embedContent?: ReactNode;
  responsesContent?: ReactNode;
};

export function FormSettingsPage({
  open,
  onClose,
  form,
  tenantId,
  environment,
  onSave,
  saving,
  mappingContent,
  embedContent,
  responsesContent,
}: Props) {
  const [section, setSection] = useState<SectionId>('general');
  const [draft, setDraft] = useState<FormSettings>(form.settings);
  const [saved, setSaved] = useState(false);

  // Re-seed whenever the drawer opens or the underlying form changes
  useEffect(() => {
    if (open) {
      setDraft(form.settings);
      setSaved(false);
    }
  }, [open, form.id, form.updated_at]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(form.settings),
    [draft, form.settings],
  );

  const { data: encryptionKeys = [] } = useQuery({
    queryKey: ['encryption-keys', tenantId, environment],
    queryFn: () => listEncryptionKeys(tenantId, environment),
    enabled: open,
  });

  const inputFields = form.fields.filter((f) => !NON_INPUT_FIELD_TYPES.includes(f.field_type));
  const emailFields = inputFields.filter((f) => f.field_type === 'email');

  const set = <K extends keyof FormSettings>(key: K, value: FormSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const notifyList = useListField(draft.notify_emails, (v) => set('notify_emails', v));
  const domainList = useListField(draft.allowed_domains, (v) => set('allowed_domains', v));

  // --- Security config, split into its three groups for editing ---
  const securityCfg = draft.security ?? {};
  const captchaCfg = securityCfg.captcha ?? {};
  const botCfg = securityCfg.bot ?? {};
  const inputCfg = securityCfg.input ?? {};

  const setCaptcha = (patch: Partial<CaptchaConfig>) =>
    set('security', { ...securityCfg, captcha: { ...captchaCfg, ...patch } });
  const setBot = (patch: Partial<BotProtectionConfig>) =>
    set('security', { ...securityCfg, bot: { ...botCfg, ...patch } });
  const setInput = (patch: Partial<InputHardeningConfig>) =>
    set('security', { ...securityCfg, input: { ...inputCfg, ...patch } });

  const blockedIpList = useListField(botCfg.blocked_ips, (v) => setBot({ blocked_ips: v }));

  const provider = captchaCfg.provider ?? 'none';
  const isSelfHostedCaptcha = provider === 'smart_math' || provider === 'proof_of_work';
  const isHostedCaptcha =
    provider === 'turnstile' || provider === 'hcaptcha' || provider === 'recaptcha_v3';

  const { data: allVariables = [] } = useQuery({
    queryKey: ['global-variables', tenantId, environment],
    queryFn: () => fetchGlobalVariables(tenantId, environment),
    enabled: open,
  });
  const secretVariables = allVariables.filter((v) => v.kind === 'secret');

  // Esc closes, but only when there is nothing to lose
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dirty && !confirm('Discard unsaved settings changes?')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dirty]);

  if (!open) return null;

  const encryption = draft.encryption ?? {};
  const setEncryption = (patch: Partial<NonNullable<FormSettings['encryption']>>) =>
    set('encryption', { ...encryption, ...patch });

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClose = () => {
    if (dirty && !confirm('Discard unsaved settings changes?')) return;
    onClose();
  };

  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  const isWideSection = SECTIONS.find((s) => s.id === section)?.group === 'Integrations';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-900">Form settings</h1>
          <p className="truncate text-xs text-slate-500">{form.name}</p>
        </div>

        {saved && !dirty && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {dirty && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Unsaved changes
          </span>
        )}

        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save changes
        </Button>

        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          title="Close settings (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left nav */}
        <nav className="w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          {groups.map((group) => (
            <div key={group} className="mb-5">
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group}</p>
              <div className="space-y-0.5">
                {SECTIONS.filter((s) => s.group === group).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      section === id
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${section === id ? 'text-brand-600' : 'text-slate-400'}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Integration panels carry tables and grids — give them the full width
              instead of the reading-width column the settings fields use. */}
          <div className={`mx-auto p-8 ${isWideSection ? 'max-w-7xl' : 'max-w-3xl'}`}>
            {section === 'general' && (
              <>
                <SectionHeader
                  title="General"
                  description="Basic identity and the copy respondents see at the top of the form."
                />
                <div className="space-y-5">
                  <Field label="Public URL" hint="Where the published form is served from.">
                    <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600">
                      /forms/<span className="font-bold text-slate-900">{form.slug}</span>
                    </div>
                  </Field>

                  <Field
                    label="Description"
                    hint="Shown under the form title as helper text for respondents."
                  >
                    <textarea
                      rows={3}
                      value={draft.description ?? ''}
                      onChange={(e) => set('description', e.target.value)}
                      className={input}
                      placeholder="Tell respondents what this form is for…"
                    />
                  </Field>
                </div>
              </>
            )}

            {section === 'submission' && (
              <>
                <SectionHeader
                  title="Submission"
                  description="What the submit button says and what happens once a response lands."
                />
                <div className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Submit button text">
                      <input
                        value={draft.submit_label ?? ''}
                        onChange={(e) => set('submit_label', e.target.value)}
                        className={input}
                        placeholder="Submit"
                      />
                    </Field>
                    <Field label="Redirect URL" hint="Leave empty to show the thank-you message instead.">
                      <input
                        type="url"
                        value={draft.redirect_url ?? ''}
                        onChange={(e) => set('redirect_url', e.target.value)}
                        className={input}
                        placeholder="https://example.com/thank-you"
                      />
                    </Field>
                  </div>

                  <Field label="Thank-you message">
                    <input
                      value={draft.success_message ?? ''}
                      onChange={(e) => set('success_message', e.target.value)}
                      className={input}
                      placeholder="Thank you — your response was recorded."
                    />
                  </Field>

                  <Field label="Validation error message">
                    <input
                      value={draft.error_message ?? ''}
                      onChange={(e) => set('error_message', e.target.value)}
                      className={input}
                      placeholder="Please check your inputs and try again."
                    />
                  </Field>

                  <div className="space-y-2.5">
                    <Toggle
                      checked={draft.show_progress_bar ?? false}
                      onChange={(v) => set('show_progress_bar', v)}
                      label="Show progress bar"
                      hint="Displays completion progress as the respondent moves through the form."
                    />
                    <Toggle
                      checked={draft.save_and_resume ?? false}
                      onChange={(v) => set('save_and_resume', v)}
                      label="Save and resume"
                      hint="Keeps partial answers in the respondent's browser so they can finish later."
                    />
                    <Toggle
                      checked={draft.confirm_before_leaving ?? false}
                      onChange={(v) => set('confirm_before_leaving', v)}
                      label="Warn before leaving"
                      hint="Prompts the respondent if they navigate away with answers unsaved."
                    />
                  </div>
                </div>
              </>
            )}

            {section === 'availability' && (
              <>
                <SectionHeader
                  title="Availability"
                  description="Control the window in which this form accepts responses."
                />
                <div className="space-y-5">
                  <Toggle
                    checked={draft.accepting_responses ?? true}
                    onChange={(v) => set('accepting_responses', v)}
                    label="Accepting responses"
                    hint="Turn off to close the form without unpublishing it."
                    icon={AlarmClock}
                  />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Opens at" hint="Leave empty to open immediately.">
                      <input
                        type="datetime-local"
                        value={draft.opens_at?.slice(0, 16) ?? ''}
                        onChange={(e) =>
                          set('opens_at', e.target.value ? new Date(e.target.value).toISOString() : undefined)
                        }
                        className={input}
                      />
                    </Field>
                    <Field label="Closes at" hint="Leave empty to stay open indefinitely.">
                      <input
                        type="datetime-local"
                        value={draft.closes_at?.slice(0, 16) ?? ''}
                        onChange={(e) =>
                          set('closes_at', e.target.value ? new Date(e.target.value).toISOString() : undefined)
                        }
                        className={input}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Response limit"
                    hint="Stop accepting responses after this many submissions. Leave empty for unlimited."
                  >
                    <input
                      type="number"
                      min={1}
                      value={draft.max_submissions ?? ''}
                      onChange={(e) =>
                        set('max_submissions', e.target.value ? Number(e.target.value) : undefined)
                      }
                      className={input}
                      placeholder="Unlimited"
                    />
                  </Field>

                  <Field label="Closed message" hint="Shown when the form is closed or the limit is reached.">
                    <input
                      value={draft.closed_message ?? ''}
                      onChange={(e) => set('closed_message', e.target.value)}
                      className={input}
                      placeholder="This form is no longer accepting responses."
                    />
                  </Field>

                  <Toggle
                    checked={draft.allow_multiple_submissions ?? true}
                    onChange={(v) => set('allow_multiple_submissions', v)}
                    label="Allow multiple submissions"
                    hint="When off, a respondent who already submitted from this browser is blocked."
                  />
                </div>
              </>
            )}

            {section === 'notifications' && (
              <>
                <SectionHeader
                  title="Notifications"
                  description="Alert your team when a response arrives, and confirm receipt to the respondent."
                />
                <div className="space-y-5">
                  <Toggle
                    checked={draft.notify_on_submission ?? false}
                    onChange={(v) => set('notify_on_submission', v)}
                    label="Notify on every submission"
                    hint="Send an email to your team as soon as a response is recorded."
                    icon={Bell}
                  />

                  {draft.notify_on_submission && (
                    <Field
                      label="Notification recipients"
                      hint="Comma separated. These addresses receive the submitted answers."
                    >
                      <input
                        value={notifyList.text}
                        onChange={(e) => notifyList.setText(e.target.value)}
                        onBlur={notifyList.commit}
                        className={input}
                        placeholder="ops@example.com, sales@example.com"
                      />
                    </Field>
                  )}

                  <Toggle
                    checked={draft.autoresponder_enabled ?? false}
                    onChange={(v) => set('autoresponder_enabled', v)}
                    label="Send a confirmation to the respondent"
                    hint="Emails the person who filled in the form a copy or a thank-you note."
                    icon={Sparkles}
                  />

                  {draft.autoresponder_enabled && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                      <Field
                        label="Email field"
                        hint={
                          emailFields.length === 0
                            ? 'This form has no email field yet — add one so replies have somewhere to go.'
                            : 'Which answer holds the respondent’s address.'
                        }
                      >
                        <select
                          value={draft.autoresponder_to_field ?? ''}
                          onChange={(e) => set('autoresponder_to_field', e.target.value || undefined)}
                          className={input}
                        >
                          <option value="">Select a field…</option>
                          {emailFields.map((f) => (
                            <option key={f.id} value={f.name}>
                              {f.label} ({f.name})
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Subject">
                        <input
                          value={draft.autoresponder_subject ?? ''}
                          onChange={(e) => set('autoresponder_subject', e.target.value)}
                          className={input}
                          placeholder="We received your response"
                        />
                      </Field>

                      <Field label="Message">
                        <textarea
                          rows={4}
                          value={draft.autoresponder_body ?? ''}
                          onChange={(e) => set('autoresponder_body', e.target.value)}
                          className={input}
                          placeholder="Thanks for getting in touch — we'll be back to you shortly."
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </>
            )}

            {section === 'security' && (
              <>
                <SectionHeader
                  title="Security & anti-spam"
                  description="Every control here is enforced in the submit endpoint, not just in the browser."
                />

                {/* ---------------- CAPTCHA ---------------- */}
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
                  CAPTCHA
                </h3>
                <div className="space-y-4">
                  <Field label="Provider">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CAPTCHA_PROVIDERS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setCaptcha({ provider: p.value })}
                          className={`rounded-xl border p-3 text-left transition ${
                            captchaCfg.provider === p.value
                              ? 'border-brand-500 bg-brand-50/50 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900">{p.label}</span>
                            {p.hosted && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                                3rd party
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block text-xs leading-snug text-slate-500">{p.hint}</span>
                        </button>
                      ))}
                    </div>
                  </Field>

                  {captchaCfg.provider && captchaCfg.provider !== 'none' && (
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Show challenge">
                          <select
                            value={captchaCfg.trigger ?? 'always'}
                            onChange={(e) => setCaptcha({ trigger: e.target.value as CaptchaTrigger })}
                            className={input}
                          >
                            <option value="always">Always</option>
                            <option value="suspicious">Only for suspicious traffic</option>
                          </select>
                        </Field>
                        <Field label="Challenge validity">
                          <select
                            value={captchaCfg.ttl_seconds ?? 600}
                            onChange={(e) => setCaptcha({ ttl_seconds: Number(e.target.value) })}
                            className={input}
                          >
                            <option value={300}>5 minutes</option>
                            <option value={600}>10 minutes</option>
                            <option value={1800}>30 minutes</option>
                            <option value={3600}>1 hour</option>
                          </select>
                        </Field>
                      </div>

                      {isSelfHostedCaptcha && (
                        <Field
                          label="Difficulty"
                          hint={DIFFICULTY_SPEC[captchaCfg.difficulty ?? 'medium'].label}
                        >
                          <div className="grid grid-cols-3 gap-2">
                            {(['easy', 'medium', 'hard'] as CaptchaDifficulty[]).map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setCaptcha({ difficulty: d })}
                                className={`rounded-lg border py-2 text-sm font-semibold capitalize transition ${
                                  (captchaCfg.difficulty ?? 'medium') === d
                                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </Field>
                      )}

                      {isHostedCaptcha && (
                        <>
                          <Field label="Site key" hint="Public key, safe to include in the page.">
                            <input
                              value={captchaCfg.site_key ?? ''}
                              onChange={(e) => setCaptcha({ site_key: e.target.value })}
                              className={`${input} font-mono text-xs`}
                              placeholder="0x4AAAAAAA…"
                            />
                          </Field>

                          <Field
                            label="Secret key"
                            hint="Held as a secret global variable so it never lands in form settings and rotates centrally."
                          >
                            {secretVariables.length === 0 ? (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                                  <KeyRound className="h-4 w-4" /> No secrets defined yet
                                </p>
                                <p className="mt-1 text-xs text-amber-700">
                                  Add one under Settings → API → Encryption &amp; variables, then select it here.
                                </p>
                              </div>
                            ) : (
                              <select
                                value={captchaCfg.secret_variable ?? ''}
                                onChange={(e) => setCaptcha({ secret_variable: e.target.value || undefined })}
                                className={input}
                              >
                                <option value="">Select a secret…</option>
                                {secretVariables.map((v) => (
                                  <option key={v.id} value={v.name}>
                                    {`{{vars.${v.name}}}`}
                                    {v.description ? ` — ${v.description}` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </Field>

                          {captchaCfg.provider === 'recaptcha_v3' && (
                            <Field
                              label={`Score threshold — ${(captchaCfg.score_threshold ?? 0.5).toFixed(2)}`}
                              hint="Higher is stricter. 0.5 is a balanced starting point; raise it if spam gets through."
                            >
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={captchaCfg.score_threshold ?? 0.5}
                                onChange={(e) => setCaptcha({ score_threshold: Number(e.target.value) })}
                                className="w-full accent-brand-600"
                              />
                            </Field>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* ---------------- Bot protection ---------------- */}
                <h3 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-slate-500">
                  Bot protection
                </h3>
                <div className="space-y-2.5">
                  <Toggle
                    checked={botCfg.honeypot_enabled ?? false}
                    onChange={(v) => setBot({ honeypot_enabled: v })}
                    label="Honeypot trap"
                    hint="A hidden field real people never fill. Bots that fill it get a success response and nothing is stored, so they never learn they were caught."
                    icon={ShieldCheck}
                  />
                  <Toggle
                    checked={botCfg.require_nonce ?? false}
                    onChange={(v) => setBot({ require_nonce: v })}
                    label="Single-use submission token"
                    hint="Each rendered form carries a signed one-time token, so a captured request cannot be replayed."
                    icon={Fingerprint}
                  />
                  <Toggle
                    checked={botCfg.block_disposable_email ?? false}
                    onChange={(v) => setBot({ block_disposable_email: v })}
                    label="Block disposable email"
                    hint="Rejects known throwaway mailbox domains such as mailinator.com."
                  />
                  <Toggle
                    checked={botCfg.enforce_origin ?? false}
                    onChange={(v) => setBot({ enforce_origin: v })}
                    label="Enforce embed origin"
                    hint="Only accept submissions whose Origin matches the allowed domains below."
                  />
                  <Toggle
                    checked={draft.require_auth ?? false}
                    onChange={(v) => set('require_auth', v)}
                    label="Require sign-in"
                    hint="Only authenticated users can submit this form."
                  />
                </div>

                <div className="mt-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Minimum fill time"
                      hint="Seconds. Submissions faster than this are almost certainly scripted."
                    >
                      <input
                        type="number"
                        min={0}
                        value={botCfg.min_fill_seconds ?? ''}
                        onChange={(e) =>
                          setBot({ min_fill_seconds: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={input}
                        placeholder="2"
                      />
                    </Field>
                    <Field label="Session expiry" hint="Seconds a rendered form stays submittable.">
                      <input
                        type="number"
                        min={60}
                        value={botCfg.max_fill_seconds ?? ''}
                        onChange={(e) =>
                          setBot({ max_fill_seconds: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={input}
                        placeholder="3600"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Rate limit — per hour" hint="Per IP address. Empty means no throttle.">
                      <input
                        type="number"
                        min={1}
                        value={botCfg.rate_limit_per_hour ?? ''}
                        onChange={(e) =>
                          setBot({ rate_limit_per_hour: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={input}
                        placeholder="No limit"
                      />
                    </Field>
                    <Field label="Rate limit — per day" hint="Per IP address. Empty means no throttle.">
                      <input
                        type="number"
                        min={1}
                        value={botCfg.rate_limit_per_day ?? ''}
                        onChange={(e) =>
                          setBot({ rate_limit_per_day: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={input}
                        placeholder="No limit"
                      />
                    </Field>
                  </div>

                  <Field
                    label="Duplicate window"
                    hint="Minutes. An identical payload seen again inside this window is rejected. 0 disables."
                  >
                    <input
                      type="number"
                      min={0}
                      value={botCfg.duplicate_window_minutes ?? ''}
                      onChange={(e) =>
                        setBot({
                          duplicate_window_minutes: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className={input}
                      placeholder="5"
                    />
                  </Field>

                  <Field
                    label="Allowed embed domains"
                    hint="Comma separated. Supports wildcards such as *.example.com."
                  >
                    <input
                      value={domainList.text}
                      onChange={(e) => domainList.setText(e.target.value)}
                      onBlur={domainList.commit}
                      className={input}
                      placeholder="example.com, *.example.com"
                    />
                  </Field>

                  <Field label="Blocked IP addresses" hint="Comma separated. These are rejected outright.">
                    <input
                      value={blockedIpList.text}
                      onChange={(e) => blockedIpList.setText(e.target.value)}
                      onBlur={blockedIpList.commit}
                      className={`${input} font-mono text-xs`}
                      placeholder="203.0.113.7, 198.51.100.22"
                    />
                  </Field>
                </div>

                {/* ---------------- Input hardening ---------------- */}
                <h3 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-slate-500">
                  Input hardening
                </h3>

                <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-sky-900">
                    <Info className="h-4 w-4" /> About SQL injection
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-sky-800">
                    Answers reach the database through parameterized queries, so SQL injection is not a live
                    vector here and no setting is needed to stop it. The injection risk that does apply is
                    stored XSS — answers rendered later in dashboards, exports and notification emails — which
                    is what HTML sanitization below addresses. Signature scanning is a tripwire for probing
                    attempts, useful for audit, never the primary defence.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <Toggle
                    checked={inputCfg.sanitize_html ?? true}
                    onChange={(v) => setInput({ sanitize_html: v })}
                    label="Strip HTML from answers"
                    hint="Removes tags and angle brackets so submitted markup cannot execute when rendered later."
                    icon={Lock}
                  />
                  <Toggle
                    checked={inputCfg.strict_field_whitelist ?? true}
                    onChange={(v) => setInput({ strict_field_whitelist: v })}
                    label="Drop undeclared fields"
                    hint="Silently discards any key that is not a field on this form, so a crafted POST cannot stuff extra data into storage."
                  />
                  <Toggle
                    checked={inputCfg.reject_control_chars ?? true}
                    onChange={(v) => setInput({ reject_control_chars: v })}
                    label="Strip control characters"
                    hint="Removes NUL and other control bytes that break downstream parsers and exports."
                  />
                </div>

                <div className="mt-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Max field length" hint="Characters per answer. Longer values are truncated.">
                      <input
                        type="number"
                        min={1}
                        value={inputCfg.max_field_length ?? ''}
                        onChange={(e) =>
                          setInput({ max_field_length: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={input}
                        placeholder="5000"
                      />
                    </Field>
                    <Field label="Max payload size" hint="Kilobytes. Larger submissions are rejected.">
                      <input
                        type="number"
                        min={1}
                        value={inputCfg.max_payload_kb ?? ''}
                        onChange={(e) =>
                          setInput({ max_payload_kb: e.target.value ? Number(e.target.value) : undefined })
                        }
                        className={input}
                        placeholder="256"
                      />
                    </Field>
                  </div>

                  <Field
                    label="Attack signature scanning"
                    hint="Matches answers against known probing payloads — SQL fragments, script tags, traversal, command chaining."
                  >
                    <select
                      value={inputCfg.injection_scan ?? 'flag'}
                      onChange={(e) => setInput({ injection_scan: e.target.value as InjectionAction })}
                      className={input}
                    >
                      <option value="off">Off — do not scan</option>
                      <option value="flag">Flag — store the match and accept the submission</option>
                      <option value="block">Block — reject submissions that match</option>
                    </select>
                  </Field>

                  {inputCfg.injection_scan === 'block' && (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Blocking can reject genuine answers — a developer pasting a code snippet, or prose
                      containing <code className="font-mono">{'{{'}</code>. Flag mode is the safer default
                      unless you are seeing active abuse.
                    </p>
                  )}
                </div>
              </>
            )}

            {section === 'encryption' && (
              <>
                <SectionHeader
                  title="Encryption"
                  description="Encrypt sensitive answers with AES-256-GCM before they are written to storage."
                />

                <div className="space-y-5">
                  <Toggle
                    checked={encryption.enabled ?? false}
                    onChange={(v) => setEncryption({ enabled: v })}
                    label="Encrypt submissions at rest"
                    hint="Selected answers are sealed in the browser and stored as ciphertext. Only holders of the key can read them back."
                    icon={Lock}
                  />

                  {encryption.enabled && (
                    <>
                      <Field
                        label="Encryption key"
                        hint="Managed under Settings → API → Encryption & variables. Referenced by name so a rotation applies everywhere at once."
                      >
                        {encryptionKeys.length === 0 ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                              <KeyRound className="h-4 w-4" /> No AES-256 keys defined yet
                            </p>
                            <p className="mt-1 text-xs text-amber-700">
                              Create one under Settings → API → Encryption &amp; variables, then select it here.
                            </p>
                          </div>
                        ) : (
                          <select
                            value={encryption.key_variable ?? ''}
                            onChange={(e) => setEncryption({ key_variable: e.target.value || undefined })}
                            className={input}
                          >
                            <option value="">Select a key…</option>
                            {encryptionKeys.map((k) => (
                              <option key={k.id} value={k.name}>
                                {`{{vars.${k.name}}}`}
                                {k.description ? ` — ${k.description}` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>

                      <Toggle
                        checked={encryption.encrypt_all ?? false}
                        onChange={(v) => setEncryption({ encrypt_all: v })}
                        label="Encrypt every field"
                        hint="Seals all input answers. Turn off to pick individual fields below."
                      />

                      {!encryption.encrypt_all && (
                        <Field
                          label="Fields to encrypt"
                          hint="Pick the answers holding personal or sensitive data."
                        >
                          <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3">
                            {inputFields.length === 0 && (
                              <p className="p-2 text-xs text-slate-400">This form has no input fields yet.</p>
                            )}
                            {inputFields.map((f) => {
                              const selected = (encryption.fields ?? []).includes(f.name);
                              return (
                                <label
                                  key={f.id}
                                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => {
                                      const current = encryption.fields ?? [];
                                      setEncryption({
                                        fields: selected
                                          ? current.filter((n) => n !== f.name)
                                          : [...current, f.name],
                                      });
                                    }}
                                    className="rounded text-brand-600 focus:ring-brand-500"
                                  />
                                  <span className="text-sm font-medium text-slate-700">{f.label}</span>
                                  <code className="ml-auto font-mono text-[11px] text-slate-400">{f.name}</code>
                                </label>
                              );
                            })}
                          </div>
                        </Field>
                      )}

                      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                        <p className="flex items-center gap-2 text-sm font-bold text-violet-900">
                          <Lock className="h-4 w-4" /> AES-256-GCM
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-violet-800">
                          Each value gets a fresh random IV and an authentication tag, so tampering is detectable.
                          Encrypted answers appear as ciphertext in exports and the submissions table until they are
                          decrypted with the selected key. Rotating the key does not re-encrypt existing data — decrypt
                          and re-encrypt it before you rotate.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {section === 'data' && (
              <>
                <SectionHeader
                  title="Data & retention"
                  description="How long responses are kept and how much metadata is stored alongside them."
                />
                <div className="space-y-5">
                  <Field
                    label="Retention period"
                    hint="Submissions older than this are deleted automatically. Leave empty to keep them indefinitely."
                  >
                    <input
                      type="number"
                      min={1}
                      value={draft.retention_days ?? ''}
                      onChange={(e) =>
                        set('retention_days', e.target.value ? Number(e.target.value) : undefined)
                      }
                      className={input}
                      placeholder="Keep forever"
                    />
                  </Field>

                  <Toggle
                    checked={draft.anonymize_metadata ?? false}
                    onChange={(v) => set('anonymize_metadata', v)}
                    label="Anonymize metadata"
                    hint="Strips IP address and user agent from stored submissions."
                    icon={Database}
                  />
                </div>
              </>
            )}

            {section === 'mapping' && (
              <>
                <SectionHeader
                  title="Schema mapping"
                  description="Route answers into your customer schema so responses become profile data."
                />
                {mappingContent ?? <p className="text-sm text-slate-400">Mapping is unavailable here.</p>}
              </>
            )}

            {section === 'embed' && (
              <>
                <SectionHeader
                  title="Embed & share"
                  description="Publish this form on your site or share a direct link."
                />
                {embedContent ?? <p className="text-sm text-slate-400">Embedding is unavailable here.</p>}
              </>
            )}

            {section === 'responses' && (
              <>
                <SectionHeader title="Responses" description="Submissions recorded against this form." />
                {responsesContent ?? <p className="text-sm text-slate-400">Responses are unavailable here.</p>}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
