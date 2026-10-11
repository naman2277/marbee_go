import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Fingerprint,
  Loader2,
  RotateCcw,
  Shuffle,
  Target,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { UserAssignField } from '@/components/journeys/campaign/UserAssignField';
import { CampaignStatusBadge, channelIcon } from '@/components/campaigns/CampaignUi';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_PRIORITIES,
  CAMPAIGN_TYPES,
  campaignCode,
  campaignCodeError,
  campaignMeta,
  campaignStatusReason,
  checkCampaignCodeAvailable,
  defaultCampaignCode,
  deriveCampaignStatus,
  localDateInput,
  normalizeCampaignCode,
  suggestCampaignCode,
  type CampaignStatus,
  type CodeAvailability,
} from '@/lib/campaigns';
import type { JourneyRow } from '@/lib/journeys';

export type SettingsForm = {
  name: string;
  code: string;
  description: string;
  type: string;
  tags: string[];
  ownerName: string;
  ownerId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  priority: string;
  objective: string;
  primaryChannel: string;
  targetKpi: string;
  budget: string;
  notes: string;
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';
  approvalNotes: string;
};

export function settingsFormFrom(j: JourneyRow): SettingsForm {
  const m = campaignMeta(j);
  return {
    name: j.name,
    code: campaignCode(j),
    description: j.description ?? '',
    type: m.type ?? 'Promotional',
    tags: m.tags ?? [],
    ownerName: j.settings?.campaign_owner ?? '',
    ownerId: j.settings?.campaign_owner_id ?? '',
    startsAt: localDateInput(j.starts_at),
    endsAt: localDateInput(j.ends_at),
    timezone: m.timezone ?? 'UTC',
    priority: m.priority ?? 'Medium',
    objective: m.objective ?? '',
    primaryChannel: m.primary_channel ?? 'email',
    targetKpi: m.target_kpi ?? '',
    budget: m.budget ?? '',
    notes: m.notes ?? '',
    approvalStatus: j.settings?.approval_status ?? 'none',
    approvalNotes: j.settings?.approval_notes ?? '',
  };
}

const FALLBACK_TIMEZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney'];
function timezones(current: string): string[] {
  let list = FALLBACK_TIMEZONES;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    list = intl.supportedValuesOf?.('timeZone') ?? FALLBACK_TIMEZONES;
  } catch {}
  return list.includes(current) ? list : [current, ...list];
}

const input =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_1px_rgba(15,23,42,0.03)] placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10';

const SECTIONS = [
  { id: 'identity', label: 'Identity', icon: Fingerprint },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'planning', label: 'Planning', icon: Target },
  { id: 'ownership', label: 'Ownership', icon: User },
  { id: 'approval', label: 'Approval', icon: ClipboardCheck },
  { id: 'danger', label: 'Danger zone', icon: Trash2 },
] as const;

// ─── Layout primitives ────────────────────────────────────────────────

function Section({ id, title, description, children, tone }: { id: string; title: string; description: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <section
      id={`cs-${id}`}
      className={`scroll-mt-24 rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${tone === 'danger' ? 'border-red-200/80' : 'border-slate-200/80'}`}
    >
      <div className="grid gap-5 p-6 md:grid-cols-[220px_1fr] md:gap-8">
        <div>
          <h3 className={`text-sm font-semibold ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </section>
  );
}

function Field({ label, hint, error, children, optional }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs font-medium text-slate-700">
        {label}
        {optional && <span className="text-[11px] font-normal text-slate-400">Optional</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1.5 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim().replace(/,$/, '');
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          #{t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="text-slate-400 hover:text-slate-700">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? 'Add tag…' : 'festive, q4, vip'}
        className="min-w-[100px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none"
      />
    </div>
  );
}

// ─── Campaign ID field ─────────────────────────────────────────────────

type CodeState = { kind: 'unchanged' } | { kind: 'invalid'; message: string } | { kind: 'checking' } | { kind: CodeAvailability };

function useCodeState(code: string, original: string, journeyId: string): CodeState {
  const [state, setState] = useState<CodeState>({ kind: 'unchanged' });
  useEffect(() => {
    if (code === original) return setState({ kind: 'unchanged' });
    const err = campaignCodeError(code);
    if (err) return setState({ kind: 'invalid', message: err });
    setState({ kind: 'checking' });
    let alive = true;
    const t = setTimeout(async () => {
      const result = await checkCampaignCodeAvailable(code, journeyId);
      if (alive) setState({ kind: result });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [code, original, journeyId]);
  return state;
}

function CampaignIdField({
  journey,
  value,
  onChange,
  state,
  inputRef,
}: {
  journey: JourneyRow;
  value: string;
  onChange: (v: string) => void;
  state: CodeState;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const original = campaignCode(journey);
  const auto = defaultCampaignCode(journey);
  const badge =
    state.kind === 'checking' ? (
      <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking…</span>
    ) : state.kind === 'available' ? (
      <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Available</span>
    ) : state.kind === 'taken' ? (
      <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-3.5 w-3.5" />In use</span>
    ) : state.kind === 'invalid' ? (
      <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-3.5 w-3.5" />Invalid</span>
    ) : state.kind === 'unknown' ? (
      <span className="text-amber-600">Verified on save</span>
    ) : (
      <span className="text-slate-400">Current</span>
    );
  const error = state.kind === 'invalid' ? state.message : state.kind === 'taken' ? 'Another campaign on this Marbee instance already uses this ID.' : null;

  return (
    <Field
      label="Campaign ID"
      error={error}
      hint={
        <>
          Unique across every workspace on this instance. Used in UTM tags, exports and API references — links already sent keep the old ID.
        </>
      }
    >
      <div className={`flex items-center rounded-lg border bg-white shadow-[0_1px_1px_rgba(15,23,42,0.03)] focus-within:ring-4 ${error ? 'border-red-300 focus-within:border-red-400 focus-within:ring-red-500/10' : 'border-slate-200 focus-within:border-indigo-500 focus-within:ring-indigo-500/10'}`}>
        <Fingerprint className="ml-3 h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(normalizeCampaignCode(e.target.value))}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2 font-mono text-sm font-semibold tracking-wide text-slate-900 focus:outline-none"
        />
        <span className="shrink-0 pr-3 text-xs font-medium">{badge}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <button type="button" onClick={() => onChange(suggestCampaignCode())} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-indigo-600">
          <Shuffle className="h-3.5 w-3.5" /> Generate new
        </button>
        {value !== auto && (
          <button type="button" onClick={() => onChange(auto)} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-indigo-600">
            <RotateCcw className="h-3.5 w-3.5" /> Use default ({auto})
          </button>
        )}
        {value !== original && (
          <button type="button" onClick={() => onChange(original)} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-indigo-600">
            <X className="h-3.5 w-3.5" /> Revert to {original}
          </button>
        )}
      </div>
    </Field>
  );
}

// ─── The form ──────────────────────────────────────────────────────────

/**
 * Campaign settings. Submitted from the page header's Save button via `formId`;
 * reports unsaved changes through `onDirtyChange`.
 */
export function SettingsTab({
  journey,
  tenantId,
  status,
  formId,
  onDirtyChange,
  onSave,
  onArchive,
  onDelete,
}: {
  journey: JourneyRow;
  tenantId: string;
  status: CampaignStatus;
  formId: string;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (form: SettingsForm) => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
}) {
  const initial = useMemo(() => settingsFormFrom(journey), [journey]);
  const [form, setForm] = useState<SettingsForm>(initial);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => {
    setSubmitError(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const codeState = useCodeState(form.code, initial.code, journey.id);
  const dateError = form.startsAt && form.endsAt && form.endsAt < form.startsAt ? 'End date must be on or after the start date' : null;

  // What the status will be once these dates are saved.
  const preview = useMemo(() => {
    const next = {
      ...journey,
      starts_at: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
      ends_at: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
    };
    const s = deriveCampaignStatus(next, []);
    return { status: s, reason: campaignStatusReason(next, s) };
  }, [journey, form.startsAt, form.endsAt]);
  const datesChanged = form.startsAt !== initial.startsAt || form.endsAt !== initial.endsAt;

  const duration = useMemo(() => {
    if (!form.startsAt || !form.endsAt || dateError) return null;
    const days = Math.round((new Date(form.endsAt).getTime() - new Date(form.startsAt).getTime()) / 86_400_000) + 1;
    return `${days} day${days === 1 ? '' : 's'}`;
  }, [form.startsAt, form.endsAt, dateError]);

  const scrollTo = (id: string) => document.getElementById(`cs-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <form
      id={formId}
      className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim()) {
          setSubmitError('Campaign name is required');
          return scrollTo('identity');
        }
        if (codeState.kind === 'invalid' || codeState.kind === 'taken' || codeState.kind === 'checking') {
          setSubmitError(codeState.kind === 'checking' ? 'Still checking the campaign ID — try again in a moment' : 'Fix the campaign ID before saving');
          scrollTo('identity');
          codeRef.current?.focus();
          return;
        }
        if (dateError) {
          setSubmitError(dateError);
          return scrollTo('schedule');
        }
        onSave(form);
      }}
    >
      {/* Section nav */}
      <nav className="hidden lg:block">
        <div className="sticky top-4 space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-white hover:shadow-sm ${
                s.id === 'danger' ? 'text-red-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <s.icon className="h-4 w-4 opacity-70" />
              {s.label}
            </button>
          ))}
          {dirty && <p className="px-3 pt-3 text-[11px] font-medium text-amber-600">Unsaved changes</p>}
        </div>
      </nav>

      <div className="min-w-0 space-y-5">
        {submitError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <XCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}

        <Section id="identity" title="Identity" description="How this campaign is named and referenced across Marbee.">
          <Field label="Campaign name">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={input} placeholder="Diwali Customer Promotion 2026" />
          </Field>
          <CampaignIdField journey={journey} value={form.code} onChange={(v) => set('code', v)} state={codeState} inputRef={codeRef} />
          <Field label="Description" optional>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={input} placeholder="What is this campaign about?" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Campaign type">
              <select value={form.type} onChange={(e) => set('type', e.target.value)} className={input}>
                {CAMPAIGN_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Primary channel">
              <div className="flex flex-wrap gap-1.5">
                {CAMPAIGN_CHANNELS.map((c) => {
                  const Icon = channelIcon(c.id);
                  const active = form.primaryChannel === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => set('primaryChannel', c.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <Field label="Tags" optional hint="Press Enter or comma to add.">
            <TagInput value={form.tags} onChange={(t) => set('tags', t)} />
          </Field>
        </Section>

        <Section id="schedule" title="Schedule" description="The campaign window. Status is derived from these dates — it becomes Completed once the end date passes.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start date">
              <input type="date" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} className={input} />
            </Field>
            <Field label="End date" error={dateError}>
              <input type="date" value={form.endsAt} min={form.startsAt || undefined} onChange={(e) => set('endsAt', e.target.value)} className={input} />
            </Field>
            <Field label="Timezone">
              <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className={input}>
                {timezones(form.timezone).map((tz) => <option key={tz}>{tz}</option>)}
              </select>
            </Field>
          </div>
          <div className={`flex flex-wrap items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs ${datesChanged ? 'bg-indigo-50/70 text-indigo-900' : 'bg-slate-50 text-slate-600'}`}>
            <span className="font-medium">{datesChanged ? 'After saving' : 'Current status'}</span>
            <CampaignStatusBadge status={datesChanged ? preview.status : status} size="sm" />
            <span className="text-slate-500">{datesChanged ? preview.reason : null}</span>
            {duration && <span className="ml-auto text-slate-400">{duration}</span>}
          </div>
          {(form.startsAt || form.endsAt) && (
            <button type="button" onClick={() => { set('startsAt', ''); set('endsAt', ''); }} className="text-xs font-medium text-slate-500 hover:text-indigo-600">
              Clear dates
            </button>
          )}
        </Section>

        <Section id="planning" title="Planning" description="Business context shown on the dashboard — the plan of record for this campaign.">
          <Field label="Priority">
            <Segmented value={form.priority} options={CAMPAIGN_PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={(v) => set('priority', v)} />
          </Field>
          <Field label="Business objective" optional>
            <textarea
              value={form.objective}
              onChange={(e) => set('objective', e.target.value)}
              rows={2}
              className={input}
              placeholder="Increase repeat bookings among customers who travelled in the last 90 days."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target KPI" optional>
              <input value={form.targetKpi} onChange={(e) => set('targetKpi', e.target.value)} className={input} placeholder="Conversion" />
            </Field>
            <Field label="Budget" optional>
              <input value={form.budget} onChange={(e) => set('budget', e.target.value)} className={input} placeholder="₹5,00,000" />
            </Field>
          </div>
          <Field label="Notes" optional>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={input} />
          </Field>
        </Section>

        <Section id="ownership" title="Ownership" description="The business owner accountable for this campaign. Access follows your workspace roles.">
          <UserAssignField
            tenantId={tenantId}
            label="Campaign owner"
            icon={User}
            value={form.ownerName}
            assignedUserId={form.ownerId || undefined}
            onAssign={(email, id) => setForm((f) => ({ ...f, ownerName: email, ownerId: id ?? '' }))}
            onClear={() => setForm((f) => ({ ...f, ownerName: '', ownerId: '' }))}
          />
        </Section>

        <Section id="approval" title="Approval" description="Campaign-level sign-off. Individual deliveries are approved from the Dashboard.">
          <Field label="Status">
            <Segmented
              value={form.approvalStatus}
              options={[
                { value: 'none', label: 'Not required' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ]}
              onChange={(v) => set('approvalStatus', v)}
            />
          </Field>
          <Field label="Notes" optional>
            <textarea value={form.approvalNotes} onChange={(e) => set('approvalNotes', e.target.value)} rows={2} className={input} />
          </Field>
        </Section>

        <Section id="danger" tone="danger" title="Danger zone" description="These actions affect the whole campaign.">
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{status === 'archived' ? 'Restore campaign' : 'Archive campaign'}</p>
                <p className="text-xs text-slate-500">
                  {status === 'archived' ? 'Make it editable and runnable again.' : 'Hide it from active views and switch off workflow schedules. History is kept.'}
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => onArchive(status !== 'archived')} className="text-xs">
                {status === 'archived' ? <><ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />Restore</> : <><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</>}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Delete campaign</p>
                <p className="text-xs text-slate-500">Permanently delete. Linked pipelines are kept and become unassigned.</p>
              </div>
              <Button type="button" variant="danger" onClick={onDelete} className="text-xs">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </form>
  );
}
