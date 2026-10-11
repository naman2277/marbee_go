import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleSlash,
  ExternalLink,
  Filter,
  GitBranch,
  Link2,
  Pause,
  Play,
  Plus,
  Search,
  Unlink,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { ChannelChip, DailyBars, FunnelBars, SectionCard, channelIcon } from '@/components/campaigns/CampaignUi';
import {
  CAMPAIGN_WORKFLOW_TEMPLATES,
  compactNumber,
  formatDate,
  pct,
  type CampaignDelivery,
  type CampaignExecution,
  type CampaignStatus,
  type CampaignWorkflow,
  type CampaignWorkflowTemplate,
  type EngagementRow,
  type EngagementSummary,
  type NodeRunRow,
  type PipelineRow,
} from '@/lib/campaigns';
import { auditActorLabel, auditEntrySubtitle, auditEntryTitle, type AuditLog } from '@/lib/audit';
import type { JourneyRow } from '@/lib/journeys';

// ─── Shared bits ───────────────────────────────────────────────────────

const PIPELINE_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  started: { label: 'Running', cls: 'bg-emerald-100 text-emerald-700' },
  paused: { label: 'Paused', cls: 'bg-amber-100 text-amber-700' },
  finished: { label: 'Finished', cls: 'bg-blue-100 text-blue-700' },
};

const RUN_STATUS: Record<string, string> = {
  succeeded: 'text-emerald-700',
  success: 'text-emerald-700',
  partial: 'text-amber-700',
  failed: 'text-red-700',
  running: 'text-indigo-700',
  queued: 'text-slate-600',
  canceled: 'text-slate-500',
};

const DELIVERY_STATUS: Record<CampaignDelivery['status'], { label: string; cls: string }> = {
  not_run: { label: 'Not run', cls: 'bg-slate-100 text-slate-600' },
  running: { label: 'Running', cls: 'bg-emerald-100 text-emerald-700' },
  completed: { label: 'Completed', cls: 'bg-blue-100 text-blue-700' },
  partial: { label: 'Partially failed', cls: 'bg-amber-100 text-amber-700' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
};

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>;
}

export function pipelineHref(pipelineId: string, campaignId: string) {
  return `/data/jobs/${pipelineId}?campaign=${campaignId}`;
}

function deliveryOpenHref(d: CampaignDelivery, campaignId: string) {
  return d.lastRunId ? `/data/runs/${d.lastRunId}` : pipelineHref(d.jobId, campaignId);
}

function EmptyNote({ icon: Icon = GitBranch, title, hint, action }: { icon?: typeof GitBranch; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Icon className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{hint}</p>
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────

export type RangeId = 'today' | '7d' | '30d' | 'all' | 'custom';

export function rangeStart(range: RangeId, customFrom?: string): Date | null {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === '7d') return new Date(now.getTime() - 7 * 86_400_000);
  if (range === '30d') return new Date(now.getTime() - 30 * 86_400_000);
  if (range === 'custom' && customFrom) return new Date(`${customFrom}T00:00:00`);
  return null;
}

function inRange(iso: string | null | undefined, from: Date | null, to: Date | null) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return (!from || t >= from.getTime()) && (!to || t <= to.getTime());
}

/** Daily "sent" series from delivery node runs + engagement sends. */
function dailySent(exec: CampaignExecution, engagement: EngagementRow[], from: Date | null, to: Date | null) {
  const deliveryNodes = new Set(exec.deliveries.map((d) => `${d.jobId}:${d.nodeId}`));
  const runJob = new Map(exec.runs.map((r) => [r.id, r]));
  const byDay = new Map<string, number>();
  const add = (iso: string | null | undefined, n: number) => {
    if (!iso || !inRange(iso, from, to)) return;
    const day = iso.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + n);
  };
  exec.nodeRuns.forEach((nr: NodeRunRow) => {
    const run = runJob.get(nr.run_id);
    if (run && deliveryNodes.has(`${run.job_id}:${nr.node_id}`)) add(nr.completed_at ?? run.completed_at ?? run.started_at, Number(nr.records_out || 0));
  });
  engagement.filter((e) => e.event === 'sent').forEach((e) => add(e.timestamp, 1));

  const days = [...byDay.keys()].sort();
  if (!days.length) return [];
  const start = new Date(from ?? `${days[0]}T00:00:00`);
  const end = to ?? new Date();
  const out: { date: string; value: number }[] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end && out.length < 120; d = new Date(d.getTime() + 86_400_000)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, value: byDay.get(key) ?? 0 });
  }
  return out;
}

export function PerformanceCard({ exec, engagementRows }: { exec: CampaignExecution; engagementRows: EngagementRow[] }) {
  const [range, setRange] = useState<RangeId>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const from = rangeStart(range, customFrom);
  const to = range === 'custom' && customTo ? new Date(`${customTo}T23:59:59`) : null;

  const scoped = useMemo(() => {
    const runsInRange = new Set(exec.runs.filter((r) => range === 'all' || inRange(r.started_at ?? r.queued_at, from, to)).map((r) => r.id));
    const deliveryKeys = new Set(exec.deliveries.map((d) => `${d.jobId}:${d.nodeId}`));
    const runJob = new Map(exec.runs.map((r) => [r.id, r.job_id]));
    let targeted = 0;
    let sent = 0;
    exec.nodeRuns.forEach((nr) => {
      if (!runsInRange.has(nr.run_id) || !deliveryKeys.has(`${runJob.get(nr.run_id)}:${nr.node_id}`)) return;
      targeted += Number(nr.records_in || 0);
      sent += Number(nr.records_out || 0);
    });
    const eng = engagementRows.filter((e) => range === 'all' || inRange(e.timestamp, from, to));
    const count = (ev: string) => eng.filter((e) => e.event === ev).length;
    return {
      targeted,
      sent: sent + count('sent'),
      delivered: count('delivered'),
      opened: count('opened'),
      clicked: count('clicked'),
      converted: count('converted'),
      hasEngagement: eng.length > 0,
    };
  }, [exec, engagementRows, range, customFrom, customTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => dailySent(exec, engagementRows, range === 'all' ? null : from, to), [exec, engagementRows, range, customFrom, customTo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SectionCard
      title="Campaign performance"
      action={
        <div className="flex flex-wrap items-center gap-1">
          {(['today', '7d', '30d', 'all', 'custom'] as RangeId[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold ${range === r ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {{ today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All time', custom: 'Custom' }[r]}
            </button>
          ))}
          {range === 'custom' && (
            <span className="flex items-center gap-1">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px]" />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px]" />
            </span>
          )}
        </div>
      }
    >
      <FunnelBars
        rows={[
          { label: 'Targeted', value: scoped.targeted, color: 'bg-slate-400' },
          { label: 'Sent', value: scoped.sent, color: 'bg-indigo-500' },
          { label: 'Delivered', value: scoped.hasEngagement ? scoped.delivered : null, color: 'bg-sky-500' },
          { label: 'Opened', value: scoped.hasEngagement ? scoped.opened : null, color: 'bg-violet-500' },
          { label: 'Clicked', value: scoped.hasEngagement ? scoped.clicked : null, color: 'bg-fuchsia-500' },
          { label: 'Converted', value: scoped.hasEngagement ? scoped.converted : null, color: 'bg-emerald-500' },
        ]}
      />
      <div className="mt-6">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sent per day</p>
        <DailyBars days={series} />
      </div>
      {!scoped.hasEngagement && (
        <p className="mt-3 text-[11px] text-slate-400">Delivered / opened / clicked appear once your delivery provider reports tracking events.</p>
      )}
    </SectionCard>
  );
}

export function CampaignHealth({ journey, status, exec, bare }: { journey: JourneyRow; status: CampaignStatus; exec: CampaignExecution; bare?: boolean }) {
  type Check = { tone: 'ok' | 'warn' | 'fail' | 'idle'; label: string };
  const checks: Check[] = [];
  const missing = [!journey.settings?.campaign_owner && 'an owner', !journey.starts_at && !journey.ends_at && 'schedule dates'].filter(Boolean) as string[];
  checks.push(missing.length ? { tone: 'warn', label: `Add ${missing.join(' and ')} in Edit` } : { tone: 'ok', label: 'Campaign configured' });
  const legacyCount = exec.deliveries.filter((d) => d.source === 'legacy').length;
  if (!exec.workflows.length) {
    if (!legacyCount) checks.push({ tone: 'warn', label: 'No workflow attached' });
  } else {
    const noDelivery = exec.workflows.filter((w) => !w.deliveries.length);
    if (noDelivery.length) noDelivery.forEach((w) => checks.push({ tone: 'warn', label: `Workflow "${w.pipeline.name}" has no Send activity yet` }));
    else checks.push({ tone: 'ok', label: 'Workflow ready' });
    const ran = exec.workflows.filter((w) => w.lastRun);
    const failedRuns = exec.workflows.filter((w) => w.lastRun?.status === 'failed');
    if (failedRuns.length) checks.push({ tone: 'fail', label: `Workflow failed: ${failedRuns.map((w) => w.pipeline.name).join(', ')}` });
    else if (ran.length) checks.push({ tone: 'ok', label: `Audience processed (${compactNumber(exec.totals.qualified)} qualified)` });
    else checks.push({ tone: 'idle', label: 'Workflow not run yet' });
  }
  exec.deliveries.forEach((d) => {
    const map: Record<CampaignDelivery['status'], Check> = {
      completed: { tone: 'ok', label: `${d.channelLabel} delivery "${d.name}" completed` },
      running: { tone: 'idle', label: `${d.channelLabel} delivery "${d.name}" running` },
      partial: { tone: 'warn', label: `${d.channelLabel} delivery "${d.name}" partially failed (${compactNumber(d.failed)})` },
      failed: { tone: 'fail', label: `${d.channelLabel} delivery "${d.name}" failed` },
      not_run: { tone: 'idle', label: `${d.channelLabel} delivery "${d.name}" not sent yet` },
    };
    checks.push(map[d.status]);
  });
  if (status === 'paused') checks.push({ tone: 'warn', label: 'Campaign paused — pipeline schedules are off' });

  const icon = (t: Check['tone']) =>
    t === 'ok' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : t === 'warn' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : t === 'fail' ? <XCircle className="h-4 w-4 text-red-600" /> : <Circle className="h-4 w-4 text-slate-300" />;

  const list = (
    <ul className="space-y-2">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
          <span className="mt-px shrink-0">{icon(c.tone)}</span>
          {c.label}
        </li>
      ))}
    </ul>
  );
  if (bare) return list;
  return <SectionCard title="Campaign health">{list}</SectionCard>;
}

// ─── Workflows ─────────────────────────────────────────────────────────

export function WorkflowsTab({
  campaignId,
  exec,
  linkMissing,
  busyId,
  onCreate,
  onAttach,
  onToggleSchedule,
  onDetach,
}: {
  campaignId: string;
  exec: CampaignExecution;
  linkMissing: boolean;
  busyId: string | null;
  onCreate: () => void;
  onAttach: () => void;
  onToggleSchedule: (w: CampaignWorkflow, enabled: boolean) => void;
  onDetach: (w: CampaignWorkflow) => void;
}) {
  if (linkMissing) return <LinkMissingNote />;
  const actions = (
    <>
      <Button variant="secondary" onClick={onAttach} className="text-xs">
        <Link2 className="mr-1.5 h-3.5 w-3.5" /> Attach existing
      </Button>
      <Button onClick={onCreate} className="text-xs">
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Create workflow
      </Button>
    </>
  );
  if (!exec.workflows.length) {
    return <EmptyNote title="No workflows yet" hint="Workflows are Pipelines. Create one from a campaign template, or attach pipelines you already built." action={actions} />;
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">{actions}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {exec.workflows.map((w) => {
          const p = w.pipeline;
          const ps = PIPELINE_STATUS[p.pipeline_status ?? 'draft'] ?? PIPELINE_STATUS.draft;
          const scheduled = Boolean(p.schedule_cron);
          const scheduleOn = scheduled && p.schedule_enabled !== false;
          return (
            <div key={p.id} className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
              <div className="h-1 rounded-t-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 opacity-80" />
              <div className="space-y-3.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={pipelineHref(p.id, campaignId)} className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-700">
                      {p.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Pill cls={ps.cls}>{ps.label}</Pill>
                      <span className="font-mono text-[10px] text-slate-400">#{p.id.slice(0, 8)}</span>
                      {w.deliveries.map((d) => (
                        <ChannelChip key={d.key} channel={d.channel} label={d.channelLabel} />
                      ))}
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50/80 p-3 text-xs sm:grid-cols-3">
                  <Metric label="Last run" value={w.lastRun ? formatDate(w.lastRun.started_at ?? w.lastRun.queued_at, true) : 'Never'} valueCls={w.lastRun ? RUN_STATUS[w.lastRun.status] : undefined} sub={w.lastRun?.status} />
                  <Metric label="Next run" value={scheduleOn ? formatDate(p.next_run_at, true) : scheduled ? 'Schedule off' : 'Manual'} />
                  <Metric label="Runs" value={String(w.runsCount)} />
                  <Metric label="Records processed" value={compactNumber(w.processed)} />
                  <Metric label="Qualified" value={compactNumber(w.qualified)} />
                  <Metric label="Deliveries" value={String(w.deliveries.length)} />
                </dl>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs">
                <div className="flex items-center gap-3">
                  <Link to={pipelineHref(p.id, campaignId)} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800">
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Link>
                  {w.lastRun && (
                    <Link to={`/data/runs/${w.lastRun.id}`} className="font-semibold text-slate-600 hover:text-slate-900">
                      View execution
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {scheduled && (
                    <button
                      disabled={busyId === p.id}
                      onClick={() => onToggleSchedule(w, !scheduleOn)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-slate-600 hover:bg-white disabled:opacity-50"
                    >
                      {scheduleOn ? <Pause className="h-3.5 w-3.5 text-amber-500" /> : <Play className="h-3.5 w-3.5 text-emerald-600" />}
                      {scheduleOn ? 'Pause' : 'Resume'}
                    </button>
                  )}
                  <button
                    disabled={busyId === p.id}
                    onClick={() => onDetach(w)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-slate-500 hover:bg-white hover:text-red-600 disabled:opacity-50"
                    title="Remove from campaign (the pipeline is kept)"
                  >
                    <Unlink className="h-3.5 w-3.5" /> Detach
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, valueCls }: { label: string; value: string; sub?: string; valueCls?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`truncate font-semibold text-slate-800 ${valueCls ?? ''}`}>{value}</dd>
      {sub && <dd className={`text-[10px] capitalize ${valueCls ?? 'text-slate-500'}`}>{sub}</dd>}
    </div>
  );
}

function LinkMissingNote() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Linking pipelines to campaigns needs <code className="font-mono font-semibold">supabase/sql/82_campaign_pipeline_link.sql</code>. Run it once in the SQL editor, then reload.
      </span>
    </div>
  );
}

export function CreateWorkflowModal({
  campaignName,
  busy,
  error,
  onClose,
  onCreate,
}: {
  campaignName: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onCreate: (template: CampaignWorkflowTemplate, name: string) => void;
}) {
  const [templateId, setTemplateId] = useState('email_blast');
  const template = CAMPAIGN_WORKFLOW_TEMPLATES.find((t) => t.id === templateId)!;
  const [name, setName] = useState('');
  return (
    <ModalShell title="Create workflow" subtitle="Creates a Pipeline linked to this campaign, then opens it in the Pipeline builder." onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Workflow name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${campaignName} — ${template.id === 'blank' ? 'Workflow' : template.name}`}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAMPAIGN_WORKFLOW_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={`rounded-xl border-2 p-3 text-left ${templateId === t.id ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-xs font-bold text-slate-800">{t.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{t.description}</p>
            </button>
          ))}
        </div>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" onClick={onClose} className="text-xs">Cancel</Button>
          <Button onClick={() => onCreate(template, name)} disabled={busy} className="text-xs font-semibold">
            {busy ? 'Creating…' : 'Create & open builder →'}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

export function AttachWorkflowModal({
  pipelines,
  loading,
  campaignId,
  busy,
  error,
  onClose,
  onAttach,
}: {
  pipelines: PipelineRow[];
  loading: boolean;
  campaignId: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onAttach: (ids: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const list = pipelines.filter((p) => p.campaign_id !== campaignId && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <ModalShell title="Attach existing workflow" subtitle="Pick pipelines to manage under this campaign." onClose={onClose}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pipelines…" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        </div>
        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {loading && <p className="p-4 text-center text-xs text-slate-500">Loading…</p>}
          {!loading && !list.length && <p className="p-4 text-center text-xs text-slate-500">No other pipelines.</p>}
          {list.map((p) => {
            const taken = Boolean(p.campaign_id);
            return (
              <label key={p.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${taken ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                <input
                  type="checkbox"
                  disabled={taken}
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {PIPELINE_STATUS[p.pipeline_status ?? 'draft']?.label ?? p.pipeline_status} · Last run {formatDate(p.last_run_at, true)}
                    {taken && ' · in another campaign'}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">{selected.length} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="text-xs">Cancel</Button>
            <Button onClick={() => onAttach(selected)} disabled={busy || !selected.length} className="text-xs font-semibold">
              {busy ? 'Attaching…' : 'Attach workflow'}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Deliveries ────────────────────────────────────────────────────────

export function DeliveriesTab({
  campaignId,
  exec,
  engagement,
  linkMissing,
}: {
  campaignId: string;
  exec: CampaignExecution;
  engagement: EngagementSummary;
  linkMissing: boolean;
}) {
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('all');
  if (linkMissing) return <LinkMissingNote />;
  if (!exec.deliveries.length) {
    return <EmptyNote icon={CircleSlash} title="No deliveries" hint="Deliveries are the Send Email / SMS / WhatsApp / Push activities inside this campaign's workflows. Add one in the Pipeline builder." />;
  }
  const channels = [...new Set(exec.deliveries.map((d) => d.channel))];
  const rows = exec.deliveries.filter((d) => (channel === 'all' || d.channel === channel) && (!q || `${d.name} ${d.jobName} ${d.code}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deliveries…" className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        </div>
        <Filter className="h-3.5 w-3.5 text-slate-400" />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
          <option value="all">All channels</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5">Delivery</th>
              <th className="px-3 py-2.5">Channel</th>
              <th className="px-3 py-2.5">Workflow</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Targeted</th>
              <th className="px-3 py-2.5 text-right">Sent</th>
              <th className="px-3 py-2.5 text-right">Delivered</th>
              <th className="px-3 py-2.5 text-right">Failed</th>
              <th className="px-3 py-2.5 text-right">Suppressed</th>
              <th className="px-3 py-2.5 text-right">Clicked</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((d) => {
              const Icon = channelIcon(d.channel);
              const ch = engagement.byChannel[d.channel] ?? {};
              // Engagement is logged per channel, not per delivery node — attribute only when one delivery owns the channel.
              const soleOnChannel = exec.deliveries.filter((x) => x.channel === d.channel).length === 1;
              const wf = exec.workflows.find((w) => w.pipeline.id === d.jobId);
              const ds = DELIVERY_STATUS[d.status];
              return (
                <tr key={d.key} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-900">{d.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{d.code} · Last {formatDate(d.lastRunAt, true)}</p>
                  </td>
                  <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs text-slate-700"><Icon className="h-3.5 w-3.5 text-slate-500" />{d.channelLabel}</span></td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-xs text-slate-600">{d.jobName}</td>
                  <td className="px-3 py-2.5"><Pill cls={ds.cls}>{ds.label}</Pill></td>
                  <Num v={d.targeted} />
                  <Num v={d.sent} />
                  <Num v={soleOnChannel ? ch.delivered ?? null : null} />
                  <Num v={d.failed} tone={d.failed ? 'text-red-700' : undefined} />
                  <Num v={soleOnChannel ? wf?.suppressed ?? null : null} />
                  <Num v={soleOnChannel ? ch.clicked ?? null : null} />
                  <td className="px-4 py-2.5 text-right">
                    <Link to={deliveryOpenHref(d, campaignId)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800" title={d.lastRunId ? 'Open last execution' : 'Open in Pipeline builder'}>
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Num({ v, tone }: { v: number | null; tone?: string }) {
  return <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${tone ?? 'text-slate-700'}`}>{v === null ? '—' : compactNumber(v)}</td>;
}

// ─── Audience ──────────────────────────────────────────────────────────

const AUDIENCE_STEP_LABELS: Record<string, string> = {
  source: 'Read schema',
  source_query: 'SQL query',
  source_connector: 'Connector',
  source_file: 'File',
  source_db_query: 'Database query',
  decision_suppression: 'Suppression list',
  decision_freq_cap: 'Frequency cap',
  transform_dedupe: 'Deduplicate',
  decision_eligibility: 'Eligibility',
  filter: 'Filter',
  decision_audience: 'Audience split',
};

export function AudienceTab({ campaignId, exec, linkMissing }: { campaignId: string; exec: CampaignExecution; linkMissing: boolean }) {
  if (linkMissing) return <LinkMissingNote />;
  if (!exec.workflows.length) return <EmptyNote icon={User} title="No audience yet" hint="Audience comes from the targeting activities in this campaign's workflows." />;
  return (
    <div className="space-y-4">
      {exec.workflows.map((w) => {
        const lastNodes = w.lastRun ? exec.nodeRuns.filter((n) => n.run_id === w.lastRun!.id) : [];
        const steps = lastNodes.length
          ? lastNodes.filter((n) => AUDIENCE_STEP_LABELS[n.node_type])
          : [];
        return (
          <SectionCard
            key={w.pipeline.id}
            title={w.pipeline.name}
            action={
              <Link to={pipelineHref(w.pipeline.id, campaignId)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                Edit targeting →
              </Link>
            }
          >
            <div className="mb-4 grid grid-cols-3 gap-3">
              <MiniStat label="Qualified" value={w.qualified} />
              <MiniStat label="Suppressed" value={w.suppressed} tone="text-amber-700" />
              <MiniStat label="Sent to deliveries" value={w.deliveries.reduce((s, d) => s + (d.status === 'not_run' ? 0 : d.targeted), 0)} />
            </div>
            {steps.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="pb-2">Activity</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2 text-right">In</th>
                    <th className="pb-2 text-right">Out</th>
                    <th className="pb-2 text-right">Removed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {steps.map((n) => (
                    <tr key={n.node_id}>
                      <td className="py-2 font-medium text-slate-800">{n.node_label || n.node_id}</td>
                      <td className="py-2 text-slate-500">{AUDIENCE_STEP_LABELS[n.node_type]}</td>
                      <td className="py-2 text-right font-mono">{compactNumber(n.records_in)}</td>
                      <td className="py-2 text-right font-mono">{compactNumber(n.records_out)}</td>
                      <td className="py-2 text-right font-mono text-amber-700">{n.node_type.startsWith('source') ? '—' : compactNumber(Math.max(0, n.records_in - n.records_out))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-500">{w.lastRun ? 'The last run recorded no targeting activities.' : 'Run the workflow to see audience counts per activity.'}</p>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? 'text-slate-900'}`}>{compactNumber(value)}</p>
    </div>
  );
}

// ─── Reports ───────────────────────────────────────────────────────────

export function ReportsTab({ exec, engagement, engagementRows }: { exec: CampaignExecution; engagement: EngagementSummary; engagementRows: EngagementRow[] }) {
  const byChannel = useMemo(() => {
    const map = new Map<string, { targeted: number; sent: number; failed: number }>();
    exec.deliveries.forEach((d) => {
      const m = map.get(d.channel) ?? { targeted: 0, sent: 0, failed: 0 };
      m.targeted += d.targeted;
      m.sent += d.sent;
      m.failed += d.failed;
      map.set(d.channel, m);
    });
    Object.keys(engagement.byChannel).forEach((c) => map.has(c) || map.set(c, { targeted: 0, sent: 0, failed: 0 }));
    return [...map.entries()];
  }, [exec, engagement]);

  const series = useMemo(() => dailySent(exec, engagementRows, new Date(Date.now() - 30 * 86_400_000), null), [exec, engagementRows]);
  const hasEng = engagementRows.length > 0;
  const sentTotal = exec.totals.sent + engagement.sent;

  const totals: { label: string; value: number | null }[] = [
    { label: 'Total audience', value: exec.totals.qualified },
    { label: 'Total sent', value: sentTotal },
    { label: 'Total delivered', value: hasEng ? engagement.delivered : null },
    { label: 'Total failed', value: exec.totals.failed + engagement.failed },
    { label: 'Total suppressed', value: exec.totals.suppressed },
    { label: 'Total opens', value: hasEng ? engagement.opened : null },
    { label: 'Total clicks', value: hasEng ? engagement.clicked : null },
    { label: 'Total conversions', value: hasEng ? engagement.converted : null },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {totals.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs">
            <p className="text-[11px] font-medium text-slate-500">{t.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{t.value === null ? '—' : compactNumber(t.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="By channel">
          {byChannel.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="pb-2">Channel</th>
                  <th className="pb-2 text-right">Sent</th>
                  <th className="pb-2 text-right">Failed</th>
                  <th className="pb-2 text-right">Delivered</th>
                  <th className="pb-2 text-right">Open rate</th>
                  <th className="pb-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byChannel.map(([c, m]) => {
                  const e = engagement.byChannel[c] ?? {};
                  const sent = m.sent + (e.sent ?? 0);
                  const Icon = channelIcon(c);
                  return (
                    <tr key={c}>
                      <td className="py-2 font-medium capitalize text-slate-800"><span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-slate-500" />{c}</span></td>
                      <td className="py-2 text-right font-mono">{compactNumber(sent)}</td>
                      <td className="py-2 text-right font-mono text-red-700">{compactNumber(m.failed + (e.failed ?? 0))}</td>
                      <td className="py-2 text-right font-mono">{e.delivered ? compactNumber(e.delivered) : '—'}</td>
                      <td className="py-2 text-right font-mono">{e.opened ? pct(e.opened, e.delivered || sent) : '—'}</td>
                      <td className="py-2 text-right font-mono">{e.clicked ? pct(e.clicked, e.delivered || sent) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500">No channel activity yet.</p>
          )}
        </SectionCard>

        <SectionCard title="By date (last 30 days, sent)">
          <DailyBars days={series} />
        </SectionCard>
      </div>

      <SectionCard title="By delivery">
        {exec.deliveries.length ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-2">Delivery</th>
                <th className="pb-2">Workflow</th>
                <th className="pb-2 text-right">Runs</th>
                <th className="pb-2 text-right">Targeted</th>
                <th className="pb-2 text-right">Sent</th>
                <th className="pb-2 text-right">Failed</th>
                <th className="pb-2 text-right">Send rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exec.deliveries.map((d) => (
                <tr key={d.key}>
                  <td className="py-2 font-medium text-slate-800">{d.name}</td>
                  <td className="py-2 text-slate-500">{d.jobName}</td>
                  <td className="py-2 text-right font-mono">{d.runs}</td>
                  <td className="py-2 text-right font-mono">{compactNumber(d.targeted)}</td>
                  <td className="py-2 text-right font-mono">{compactNumber(d.sent)}</td>
                  <td className="py-2 text-right font-mono text-red-700">{compactNumber(d.failed)}</td>
                  <td className="py-2 text-right font-mono">{pct(d.sent, d.targeted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-slate-500">No deliveries yet.</p>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Logs ──────────────────────────────────────────────────────────────

type LogEvent = { at: string; actor: string; action: string; object: string; status: 'ok' | 'warn' | 'fail' | 'info' };

export function LogsTab({ exec, audit }: { exec: CampaignExecution; audit: AuditLog[] }) {
  const events = useMemo(() => {
    const out: LogEvent[] = audit.map((a) => ({
      at: a.created_at,
      actor: auditActorLabel(a),
      action: (a.metadata?.summary as string) || auditEntryTitle(a),
      object: auditEntrySubtitle(a) && auditEntrySubtitle(a) !== a.metadata?.summary ? auditEntrySubtitle(a) : 'Campaign',
      status: 'info',
    }));
    const jobName = new Map(exec.workflows.map((w) => [w.pipeline.id, w.pipeline.name]));
    const deliveryName = new Map(exec.deliveries.map((d) => [`${d.jobId}:${d.nodeId}`, d]));
    const runById = new Map(exec.runs.map((r) => [r.id, r]));
    exec.runs.forEach((r) => {
      const name = jobName.get(r.job_id) ?? 'Workflow';
      const actor = r.trigger_source === 'schedule' ? 'Scheduler' : r.trigger_source ? `System (${r.trigger_source})` : 'System';
      if (r.started_at) out.push({ at: r.started_at, actor, action: 'Workflow started', object: name, status: 'info' });
      if (r.completed_at)
        out.push({
          at: r.completed_at,
          actor: 'System',
          action: `Workflow ${r.status}`,
          object: name,
          status: r.status === 'failed' ? 'fail' : r.status === 'partial' ? 'warn' : 'ok',
        });
    });
    exec.nodeRuns.forEach((nr) => {
      const run = runById.get(nr.run_id);
      const d = run && deliveryName.get(`${run.job_id}:${nr.node_id}`);
      if (!d || !nr.completed_at) return;
      out.push({
        at: nr.completed_at,
        actor: 'System',
        action: `${d.channelLabel} delivery ${nr.state === 'failed' ? 'failed' : 'completed'} — ${compactNumber(nr.records_out)} sent${nr.records_failed ? `, ${compactNumber(nr.records_failed)} failed` : ''}`,
        object: d.name,
        status: nr.state === 'failed' ? 'fail' : nr.records_failed ? 'warn' : 'ok',
      });
    });
    return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 300);
  }, [exec, audit]);

  if (!events.length) return <EmptyNote title="No activity yet" hint="Campaign changes and workflow executions will appear here." />;
  const dot: Record<LogEvent['status'], string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', fail: 'bg-red-500', info: 'bg-slate-300' };
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2.5">Timestamp</th>
            <th className="px-3 py-2.5">User / System</th>
            <th className="px-3 py-2.5">Action</th>
            <th className="px-3 py-2.5">Object</th>
            <th className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((e, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-slate-500">{formatDate(e.at, true)}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{e.actor}</td>
              <td className="px-3 py-2 text-xs font-medium text-slate-800">{e.action}</td>
              <td className="max-w-[260px] truncate px-3 py-2 text-xs text-slate-500">{e.object}</td>
              <td className="px-4 py-2"><span className={`inline-block h-2 w-2 rounded-full ${dot[e.status]}`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">Campaign edits come from the audit log (kept per your retention policy); executions come from pipeline run history.</p>
    </div>
  );
}
