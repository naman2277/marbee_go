import { useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  Clock,
  FileText,
  Shield,
  ShieldCheck,
  Tag,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { IconField } from '@/components/ui/IconField';
import { JourneyStatusBadge } from '@/components/journeys/JourneyStatusBadge';
import { UserAssignField } from '@/components/journeys/campaign/UserAssignField';
import { QueryActivitySection } from '@/components/journeys/query/QueryActivitySection';
import type { CampaignSettings } from '@/lib/journeys';
import {
  JOURNEY_DISPLAY_STATUS_LABELS,
  resolveJourneyDisplayStatus,
  type JourneyDisplayStatus,
} from '@/lib/journeys';

export type CampaignGeneralForm = {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  campaignOwner: string;
  campaignOwnerId: string;
  campaignDeveloper: string;
  campaignDeveloperId: string;
  approvalStatus: CampaignSettings['approval_status'];
  approvalNotes: string;
};

type Props = {
  tenantId: string;
  form: CampaignGeneralForm;
  onChange: (patch: Partial<CampaignGeneralForm>) => void;
  onSave: () => void;
  saving?: boolean;
  saveMessage?: string;
  error?: string;
  journeyStatus?: string;
  versionNumber?: number;
};

type Tab = 'general' | 'approvals';

const APPROVAL_LABELS: Record<NonNullable<CampaignSettings['approval_status']>, string> = {
  none: 'Not submitted',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const APPROVAL_DESCRIPTIONS: Record<NonNullable<CampaignSettings['approval_status']>, string> = {
  none: 'Campaign has not been submitted for approval yet.',
  pending: 'Waiting for a reviewer to approve or reject this campaign.',
  approved: 'Approved — ready to launch within the scheduled window.',
  rejected: 'Rejected — update the campaign and resubmit when ready.',
};

const APPROVAL_OPTIONS: {
  value: NonNullable<CampaignSettings['approval_status']>;
  label: string;
  description: string;
  icon: typeof Clock;
}[] = [
  {
    value: 'none',
    label: 'Not submitted',
    description: 'Work in progress — no review requested.',
    icon: Clock,
  },
  {
    value: 'pending',
    label: 'Submit for review',
    description: 'Notify reviewers that this campaign is ready.',
    icon: Clock,
  },
  {
    value: 'approved',
    label: 'Mark approved',
    description: 'Confirm the campaign meets launch criteria.',
    icon: CheckCircle2,
  },
  {
    value: 'rejected',
    label: 'Mark rejected',
    description: 'Send back for changes before launch.',
    icon: XCircle,
  },
];

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600';
const hintCls = 'mt-1 text-[11px] leading-relaxed text-slate-500';

function formatDateLabel(value: string): string {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildScheduleSummary(startsAt: string, endsAt: string): string {
  if (!startsAt && !endsAt) return 'No schedule defined — campaign is always eligible to run.';
  if (startsAt && endsAt) {
    return `${formatDateLabel(startsAt)} through ${formatDateLabel(endsAt)}`;
  }
  if (startsAt) return `Starts ${formatDateLabel(startsAt)} — no end date.`;
  return `Runs until ${formatDateLabel(endsAt)}`;
}

function scheduleDurationDays(startsAt: string, endsAt: string): string | null {
  if (!startsAt || !endsAt) return null;
  const start = new Date(`${startsAt}T00:00:00`).getTime();
  const end = new Date(`${endsAt}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function CampaignGeneralPanel({
  tenantId,
  form,
  onChange,
  onSave,
  saving,
  saveMessage,
  error,
  journeyStatus = 'draft',
  versionNumber,
}: Props) {
  const [tab, setTab] = useState<Tab>('general');

  const displayStatus = useMemo(
    (): JourneyDisplayStatus =>
      resolveJourneyDisplayStatus({
        status: journeyStatus,
        starts_at: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
        ends_at: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
        settings: { journey_type: 'campaign' },
      }),
    [journeyStatus, form.startsAt, form.endsAt],
  );

  const scheduleSummary = buildScheduleSummary(form.startsAt, form.endsAt);
  const duration = scheduleDurationDays(form.startsAt, form.endsAt);
  const approvalStatus = form.approvalStatus ?? 'none';

  const tabBtn = (id: Tab, label: string, Icon: typeof FileText) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        tab === id
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className={`h-4 w-4 ${tab === id ? 'text-orange-500' : ''}`} />
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {tabBtn('general', 'General', FileText)}
            {tabBtn('approvals', 'Approvals', Shield)}
          </div>
          {versionNumber != null && (
            <span className="hidden text-xs text-slate-400 sm:inline">v{versionNumber}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          {saveMessage && <span className="text-sm text-emerald-600">{saveMessage}</span>}
          <Button onClick={onSave} disabled={saving || !form.name.trim()} size="sm">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <JourneyStatusBadge status={displayStatus} />
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-medium text-slate-600">
              {JOURNEY_DISPLAY_STATUS_LABELS[displayStatus]}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              {APPROVAL_LABELS[approvalStatus]}
            </span>
          </div>

          {tab === 'general' ? (
            <>
              <label className="block">
                <span className={labelCls}>Label</span>
                <IconField icon={Tag}>
                  <input
                    value={form.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    placeholder="Campaign name"
                    className={inputCls}
                  />
                </IconField>
                <p className={hintCls}>Displayed in the journeys list and campaign header.</p>
              </label>

              <QueryActivitySection title="General information">
                <label className="block">
                  <span className={labelCls}>Description</span>
                  <IconField icon={FileText}>
                    <textarea
                      value={form.description}
                      onChange={(e) => onChange({ description: e.target.value })}
                      rows={3}
                      placeholder="What is this campaign for?"
                      className={`${inputCls} resize-y`}
                    />
                  </IconField>
                </label>
              </QueryActivitySection>

              <QueryActivitySection title="Schedule">
                <div className="mb-3 min-h-[56px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Validity:{' '}
                  </span>
                  <span className="font-medium">{scheduleSummary}</span>
                  {duration && (
                    <span className="mt-1 block text-xs text-slate-500">Duration: {duration}</span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelCls}>Start date</span>
                    <IconField icon={CalendarRange}>
                      <input
                        type="date"
                        value={form.startsAt}
                        onChange={(e) => onChange({ startsAt: e.target.value })}
                        className={inputCls}
                      />
                    </IconField>
                  </label>
                  <label className="block">
                    <span className={labelCls}>End date</span>
                    <IconField icon={CalendarRange}>
                      <input
                        type="date"
                        value={form.endsAt}
                        min={form.startsAt || undefined}
                        onChange={(e) => onChange({ endsAt: e.target.value })}
                        className={inputCls}
                      />
                    </IconField>
                  </label>
                </div>
                <p className={`mt-3 ${hintCls}`}>
                  Status becomes Started when the start date passes and Finished after the end date.
                </p>
              </QueryActivitySection>

              <QueryActivitySection title="Responsibilities">
                <div className="space-y-5">
                  <UserAssignField
                    tenantId={tenantId}
                    label="Campaign owner"
                    hint="Business owner accountable for this campaign."
                    icon={User}
                    value={form.campaignOwner}
                    assignedUserId={form.campaignOwnerId || undefined}
                    onAssign={(email, userId) =>
                      onChange({ campaignOwner: email, campaignOwnerId: userId ?? '' })
                    }
                    onClear={() => onChange({ campaignOwner: '', campaignOwnerId: '' })}
                  />
                  <UserAssignField
                    tenantId={tenantId}
                    label="Campaign developer"
                    hint="Technical owner who builds the workflow and deliveries."
                    icon={Wrench}
                    value={form.campaignDeveloper}
                    assignedUserId={form.campaignDeveloperId || undefined}
                    onAssign={(email, userId) =>
                      onChange({ campaignDeveloper: email, campaignDeveloperId: userId ?? '' })
                    }
                    onClear={() => onChange({ campaignDeveloper: '', campaignDeveloperId: '' })}
                  />
                </div>
              </QueryActivitySection>
            </>
          ) : (
            <>
              <QueryActivitySection title="Approval status">
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      approvalStatus === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : approvalStatus === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : approvalStatus === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-white text-slate-500 shadow-sm'
                    }`}
                  >
                    {approvalStatus === 'approved' ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : approvalStatus === 'rejected' ? (
                      <XCircle className="h-5 w-5" />
                    ) : (
                      <Shield className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{APPROVAL_LABELS[approvalStatus]}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {APPROVAL_DESCRIPTIONS[approvalStatus]}
                    </p>
                  </div>
                </div>

                <p className={`mb-3 ${labelCls}`}>Set approval state</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {APPROVAL_OPTIONS.map(({ value, label, description, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onChange({ approvalStatus: value })}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition ${
                        approvalStatus === value
                          ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          approvalStatus === value ? 'text-orange-600' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </QueryActivitySection>

              <QueryActivitySection title="Approval notes">
                <label className="block">
                  <span className={labelCls}>Reviewer comments</span>
                  <IconField icon={FileText}>
                    <textarea
                      value={form.approvalNotes}
                      onChange={(e) => onChange({ approvalNotes: e.target.value })}
                      rows={4}
                      placeholder="Submission notes, reviewer feedback, or conditions for launch…"
                      className={`${inputCls} resize-y`}
                    />
                  </IconField>
                  <p className={hintCls}>
                    Visible to the campaign team — include context when submitting for review.
                  </p>
                </label>
              </QueryActivitySection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function campaignFormFromJourney(journey: {
  name: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  settings?: CampaignSettings | null;
}): CampaignGeneralForm {
  const toDateInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  };

  return {
    name: journey.name,
    description: journey.description ?? '',
    startsAt: toDateInput(journey.starts_at),
    endsAt: toDateInput(journey.ends_at),
    campaignOwner: journey.settings?.campaign_owner ?? '',
    campaignOwnerId: journey.settings?.campaign_owner_id ?? '',
    campaignDeveloper: journey.settings?.campaign_developer ?? '',
    campaignDeveloperId: journey.settings?.campaign_developer_id ?? '',
    approvalStatus: journey.settings?.approval_status ?? 'none',
    approvalNotes: journey.settings?.approval_notes ?? '',
  };
}

export function isoFromDateInput(value: string, endOfDay = false): string | null {
  if (!value) return null;
  return endOfDay
    ? new Date(`${value}T23:59:59`).toISOString()
    : new Date(`${value}T00:00:00`).toISOString();
}
