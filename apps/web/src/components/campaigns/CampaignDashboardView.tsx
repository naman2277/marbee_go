import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Square,
  X,
  XCircle,
} from 'lucide-react';
import { ChannelChip, KpiCard, SectionCard, channelIcon } from '@/components/campaigns/CampaignUi';
import { CampaignHealth, PerformanceCard, ReportsTab, pipelineHref } from '@/components/campaigns/CampaignTabs';
import {
  campaignMeta,
  channelLabel,
  compactNumber,
  DELIVERY_DISPLAY_STATUS,
  deliveryApproval,
  deliveryDisplayStatus,
  formatDate,
  type ApprovalState,
  type CampaignDelivery,
  type CampaignDocument,
  type CampaignExecution,
  type CampaignStatus,
  type DeliveryDisplayStatus,
  type EngagementRow,
  type EngagementSummary,
} from '@/lib/campaigns';
import { folderNameFromPath, normalizeFolderPath } from '@/lib/journey-folders';
import type { JourneyRow } from '@/lib/journeys';

export type DashboardView = 'general' | 'schedule' | 'reports';

// ─── Shell: status strip + segmented view switcher ─────────────────────

export function CampaignDashboardView({
  view,
  onViewChange,
  banner,
  children,
}: {
  view: DashboardView;
  onViewChange: (v: DashboardView) => void;
  banner: React.ReactNode;
  children: React.ReactNode;
}) {
  const views: { id: DashboardView; label: string; icon: typeof Info }[] = [
    { id: 'general', label: 'Overview', icon: Info },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">{banner}</div>
        <div className="inline-flex shrink-0 self-start rounded-lg bg-slate-100 p-0.5 md:self-auto" role="tablist">
          {views.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => onViewChange(v.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                view === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <v.icon className="h-3.5 w-3.5" />
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

export function StatusBanner({ text, tone = 'slate', children }: { text: string; tone?: 'slate' | 'amber' | 'red' | 'emerald' | 'sky'; children?: React.ReactNode }) {
  const tones = {
    slate: { box: 'border-slate-200 bg-white', icon: 'bg-slate-100 text-slate-500', Icon: Info },
    sky: { box: 'border-sky-200/70 bg-sky-50/50', icon: 'bg-sky-100 text-sky-600', Icon: CalendarDays },
    amber: { box: 'border-amber-200/70 bg-amber-50/50', icon: 'bg-amber-100 text-amber-600', Icon: AlertTriangle },
    red: { box: 'border-red-200/70 bg-red-50/50', icon: 'bg-red-100 text-red-600', Icon: XCircle },
    emerald: { box: 'border-emerald-200/70 bg-emerald-50/50', icon: 'bg-emerald-100 text-emerald-600', Icon: CheckCircle2 },
  }[tone];
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${tones.box}`}>
      <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-700">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones.icon}`}>
          <tones.Icon className="h-4 w-4" />
        </span>
        {text}
      </span>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

// ─── Overview (general) ────────────────────────────────────────────────

function Card({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-5 pt-4">
          <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
          {action}
        </header>
      )}
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-slate-300">{children}</span>;

function docIcon(doc: CampaignDocument) {
  const m = doc.mime_type ?? '';
  if (m.startsWith('image/')) return FileImage;
  if (m.includes('csv') || m.includes('sheet') || m.includes('excel')) return FileSpreadsheet;
  return FileText;
}

export function GeneralView({
  journey,
  status,
  exec,
  channels,
  busyKey,
  docBusy,
  onEdit,
  onUploadDocument,
  onOpenDocument,
  onRemoveDocument,
  onApproval,
  onStop,
  onRefresh,
  refreshing,
  approver,
}: {
  journey: JourneyRow;
  status: CampaignStatus;
  exec: CampaignExecution;
  channels: string[];
  busyKey: string | null;
  docBusy: boolean;
  onEdit: () => void;
  onUploadDocument: (file: File) => void;
  onOpenDocument: (doc: CampaignDocument) => void;
  onRemoveDocument: (doc: CampaignDocument) => void;
  onApproval: (d: CampaignDelivery, kind: 'content' | 'targeting' | 'both', status: ApprovalState['status']) => void;
  onStop: (d: CampaignDelivery) => void;
  onRefresh: () => void;
  refreshing: boolean;
  approver: string;
}) {
  const meta = campaignMeta(journey);
  const fileRef = useRef<HTMLInputElement>(null);
  const folder = normalizeFolderPath(journey.folder_path ?? '/');
  const owner = journey.settings?.campaign_owner;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
      <div className="space-y-5">
        <Card
          title="Details"
          action={
            <button onClick={onEdit} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
              Edit
            </button>
          }
        >
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Field label="Type">{meta.type || <Muted>Not set</Muted>}</Field>
            <Field label="Priority">{meta.priority || <Muted>Not set</Muted>}</Field>
            <Field label="Start">{journey.starts_at ? formatDate(journey.starts_at) : <Muted>Not set</Muted>}</Field>
            <Field label="End">{journey.ends_at ? formatDate(journey.ends_at) : <Muted>No end date</Muted>}</Field>
            <Field label="Owner">
              <span className="block truncate">{owner || <Muted>Unassigned</Muted>}</span>
            </Field>
            <Field label="Folder">
              <Link to="/campaigns" className="text-indigo-600 hover:underline">
                {folder !== '/' ? folderNameFromPath(folder) : 'All campaigns'}
              </Link>
            </Field>
            <Field label="Channels" wide>
              {channels.length ? (
                <span className="flex flex-wrap gap-1">{channels.map((c) => <ChannelChip key={c} channel={c} label={channelLabel(c)} />)}</span>
              ) : (
                <Muted>From deployed deliveries</Muted>
              )}
            </Field>
            {(meta.objective || meta.target_kpi || meta.budget) && (
              <>
                {meta.objective && <Field label="Objective" wide>{meta.objective}</Field>}
                {meta.target_kpi && <Field label="Target KPI">{meta.target_kpi}</Field>}
                {meta.budget && <Field label="Budget">{meta.budget}</Field>}
              </>
            )}
            {meta.tags?.length ? (
              <Field label="Tags" wide>
                <span className="flex flex-wrap gap-1">
                  {meta.tags.map((t) => <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">#{t}</span>)}
                </span>
              </Field>
            ) : null}
          </dl>
          {meta.timezone && <p className="mt-4 text-[11px] text-slate-400">Timezone · {meta.timezone}</p>}
        </Card>

        <Card
          title="Documents"
          action={
            <button
              onClick={() => fileRef.current?.click()}
              disabled={docBusy}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              {docBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              Attach
            </button>
          }
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadDocument(f);
              e.target.value = '';
            }}
          />
          {meta.documents?.length ? (
            <ul className="space-y-1">
              {meta.documents.map((d) => {
                const Icon = docIcon(d);
                return (
                  <li key={d.asset_id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <button onClick={() => onOpenDocument(d)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-700 hover:text-indigo-600">
                      {d.name}
                    </button>
                    <button
                      onClick={() => onRemoveDocument(d)}
                      className="rounded p-0.5 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                      title="Remove from campaign (file stays in Assets)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Briefs, creatives or datasets for this campaign.</p>
          )}
        </Card>

        <Card title="Health">
          <CampaignHealth journey={journey} status={status} exec={exec} bare />
        </Card>
      </div>

      <DeliveriesPanel
        journey={journey}
        exec={exec}
        busyKey={busyKey}
        onApproval={onApproval}
        onStop={onStop}
        onRefresh={onRefresh}
        refreshing={refreshing}
        approver={approver}
      />
    </div>
  );
}

// ─── Deliveries ────────────────────────────────────────────────────────

type DeliveryFilter = 'all' | DeliveryDisplayStatus;

const DISPLAY_PILL: Record<DeliveryDisplayStatus, string> = {
  to_approve: 'bg-amber-50 text-amber-700 ring-amber-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  ready: 'bg-sky-50 text-sky-700 ring-sky-200',
  in_progress: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  finished: 'bg-slate-100 text-slate-700 ring-slate-200',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};

function ApprovalChip({ label, state }: { label: string; state: ApprovalState }) {
  const cfg =
    state.status === 'approved'
      ? { cls: 'border-emerald-200 bg-emerald-50/60 text-emerald-700', Icon: CheckCircle2, text: 'Approved' }
      : state.status === 'rejected'
      ? { cls: 'border-red-200 bg-red-50/60 text-red-700', Icon: XCircle, text: 'Rejected' }
      : { cls: 'border-slate-200 bg-slate-50 text-slate-500', Icon: Clock, text: 'Pending' };
  return (
    <div className={`flex-1 rounded-xl border px-3 py-2 ${cfg.cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold">
        <cfg.Icon className="h-3.5 w-3.5" />
        {cfg.text}
      </p>
      {state.status !== 'pending' && state.by && (
        <p className="mt-0.5 truncate text-[10px] opacity-70">
          {state.by}
          {state.at ? ` · ${formatDate(state.at)}` : ''}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function DeliveriesPanel({
  journey,
  exec,
  busyKey,
  onApproval,
  onStop,
  onRefresh,
  refreshing,
  approver,
}: {
  journey: JourneyRow;
  exec: CampaignExecution;
  busyKey: string | null;
  onApproval: (d: CampaignDelivery, kind: 'content' | 'targeting' | 'both', status: ApprovalState['status']) => void;
  onStop: (d: CampaignDelivery) => void;
  onRefresh: () => void;
  refreshing: boolean;
  approver: string;
}) {
  const [filter, setFilter] = useState<DeliveryFilter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(exec.deliveries[0]?.key ?? null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      exec.deliveries.map((d) => {
        const approval = deliveryApproval(journey, d.key);
        return { d, approval, display: deliveryDisplayStatus(d, approval) };
      }),
    [exec, journey],
  );
  const visible = rows.filter((r) => (filter === 'all' || r.display === filter) && (!q || `${r.d.name} ${r.d.code}`.toLowerCase().includes(q.toLowerCase())));
  const runById = useMemo(() => new Map(exec.runs.map((r) => [r.id, r])), [exec]);
  const toApprove = rows.filter((r) => r.display === 'to_approve').length;

  return (
    <section className="self-start overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
            Deliveries
            <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">{exec.deliveries.length}</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            {toApprove ? `${toApprove} awaiting approval` : 'Filled automatically from deployed workflows'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {exec.deliveries.length > 4 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" className="w-28 rounded-lg border border-slate-200 py-1 pl-7 pr-2 text-xs focus:border-indigo-400 focus:outline-none" />
            </div>
          )}
          {exec.deliveries.length > 0 && (
            <select value={filter} onChange={(e) => setFilter(e.target.value as DeliveryFilter)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:border-indigo-400 focus:outline-none">
              <option value="all">All statuses</option>
              {(Object.keys(DELIVERY_DISPLAY_STATUS) as DeliveryDisplayStatus[]).map((s) => (
                <option key={s} value={s}>{DELIVERY_DISPLAY_STATUS[s].label}</option>
              ))}
            </select>
          )}
          <button onClick={onRefresh} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {!exec.deliveries.length ? (
        <div className="flex flex-col items-center border-t border-slate-100 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 ring-1 ring-indigo-100">
            <Send className="h-5 w-5 text-indigo-400" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-800">No deliveries yet</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">They appear here automatically once a workflow with a Send activity is deployed.</p>
        </div>
      ) : !visible.length ? (
        <p className="border-t border-slate-100 px-6 py-10 text-center text-xs text-slate-500">No deliveries match this filter.</p>
      ) : (
        <ul className="space-y-2 border-t border-slate-100 p-3">
          {visible.map(({ d, approval, display }) => {
            const expanded = open === d.key;
            const Icon = channelIcon(d.channel);
            const ds = DELIVERY_DISPLAY_STATUS[display];
            const lastNode = d.lastRunId ? exec.nodeRuns.find((n) => n.run_id === d.lastRunId && n.node_id === d.nodeId) : undefined;
            const lastRun = d.lastRunId ? runById.get(d.lastRunId) : undefined;
            const wf = exec.workflows.find((w) => w.pipeline.id === d.jobId);
            const stoppable = d.status === 'running' || Boolean(wf?.pipeline.schedule_cron && wf.pipeline.schedule_enabled !== false);
            const busy = busyKey === d.key;
            const legacy = d.source === 'legacy';
            const population = lastNode ? lastNode.records_in : legacy ? d.targeted : null;
            const sent = lastNode ? lastNode.records_out : legacy ? d.sent : null;
            const failed = lastNode ? lastNode.records_failed : legacy ? d.failed : 0;
            const contact = lastRun
              ? formatDate(lastRun.started_at ?? d.lastRunAt, true)
              : wf?.pipeline.next_run_at && wf.pipeline.schedule_enabled !== false
              ? `Next ${formatDate(wf.pipeline.next_run_at, true)}`
              : null;

            return (
              <li key={d.key} className={`rounded-xl border transition-colors ${expanded ? 'border-indigo-200 bg-white shadow-sm' : 'border-slate-200/80 hover:border-slate-300'}`}>
                <button onClick={() => setOpen(expanded ? null : d.key)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{d.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {d.channelLabel} · {legacy ? 'Campaign canvas' : d.jobName} · <span className="font-mono">{d.code}</span>
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${DISPLAY_PILL[display]}`}>{ds.label}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="space-y-3 border-t border-slate-100 px-3.5 pb-3.5 pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="Population" value={population === null ? '—' : compactNumber(population)} />
                      <Stat label="Sent" value={sent === null ? '—' : compactNumber(sent)} />
                      <Stat label={failed ? 'Failed' : 'Contact date'} value={failed ? compactNumber(failed) : contact ?? 'Not sent yet'} />
                    </div>

                    <div className="flex gap-2">
                      <ApprovalChip label="Content" state={approval.content} />
                      <ApprovalChip label="Targeting" state={approval.targeting} />
                    </div>

                    {display === 'to_approve' && (
                      <p className="text-[11px] text-slate-500">
                        Approve content and targeting to mark it ready{approver ? ` · approving as ${approver}` : ''}.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-3 text-xs">
                        <Link to={deliveryHref(d, journey.id)} className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-indigo-700">
                          <ExternalLink className="h-3.5 w-3.5" /> {legacy ? 'Open canvas' : 'Open in builder'}
                        </Link>
                        {d.lastRunId && (
                          <Link to={`/data/runs/${d.lastRunId}`} className="font-medium text-slate-600 hover:text-indigo-700">
                            Last execution
                          </Link>
                        )}
                        {!legacy && d.runs > 0 && <span className="text-slate-400">{d.runs} run{d.runs === 1 ? '' : 's'} · {compactNumber(d.sent)} sent total</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                        {stoppable && (
                          <button
                            onClick={() => onStop(d)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                            title="Cancel the running execution and switch the workflow schedule off"
                          >
                            <Square className="h-3 w-3 fill-current" /> Stop
                          </button>
                        )}
                        <div className="relative">
                          <button
                            onClick={() => setMenuFor(menuFor === d.key ? null : d.key)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" /> Approval <ChevronDown className="h-3 w-3" />
                          </button>
                          {menuFor === d.key && (
                            <>
                              <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                              <div className="absolute bottom-9 right-0 z-40 w-52 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xl">
                                {approval.content.status !== 'approved' || approval.targeting.status !== 'approved' ? (
                                  <MenuRow
                                    icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                                    label="Approve both"
                                    onClick={() => { setMenuFor(null); onApproval(d, 'both', 'approved'); }}
                                  />
                                ) : null}
                                {(
                                  [
                                    ['content', 'approved', 'Approve content'],
                                    ['targeting', 'approved', 'Approve targeting'],
                                    ['content', 'rejected', 'Reject content'],
                                    ['targeting', 'rejected', 'Reject targeting'],
                                  ] as const
                                ).map(([kind, st, label]) => (
                                  <MenuRow
                                    key={label}
                                    disabled={approval[kind].status === st}
                                    danger={st === 'rejected'}
                                    icon={st === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5" />}
                                    label={label}
                                    onClick={() => { setMenuFor(null); onApproval(d, kind, st); }}
                                  />
                                ))}
                                {(approval.content.status !== 'pending' || approval.targeting.status !== 'pending') && (
                                  <>
                                    <div className="my-1 border-t border-slate-100" />
                                    <MenuRow icon={<Clock className="h-3.5 w-3.5" />} label="Reset approvals" onClick={() => { setMenuFor(null); onApproval(d, 'both', 'pending'); }} />
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MenuRow({ icon, label, onClick, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40 ${danger ? 'text-red-600' : 'text-slate-700'}`}
    >
      {icon}
      {label}
    </button>
  );
}

function deliveryHref(d: CampaignDelivery, campaignId: string) {
  return d.source === 'legacy' ? `/campaigns/${campaignId}/legacy` : pipelineHref(d.jobId, campaignId);
}


// ─── Schedule ──────────────────────────────────────────────────────────

export function ScheduleView({ journey, exec }: { journey: JourneyRow; exec: CampaignExecution }) {
  const meta = campaignMeta(journey);
  const start = journey.starts_at ? new Date(journey.starts_at).getTime() : null;
  const end = journey.ends_at ? new Date(journey.ends_at).getTime() : null;
  const now = Date.now();
  const progress = start && end && end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : null;
  const daysLeft = end && end > now ? Math.ceil((end - now) / 86_400_000) : null;
  const jobName = new Map(exec.workflows.map((w) => [w.pipeline.id, w.pipeline.name]));

  return (
    <div className="space-y-5">
      <SectionCard title="Campaign window">
        <div className="grid gap-4 sm:grid-cols-4">
          <MiniProp label="Start" value={formatDate(journey.starts_at)} />
          <MiniProp label="End" value={formatDate(journey.ends_at)} />
          <MiniProp label="Timezone" value={meta.timezone || 'UTC'} />
          <MiniProp label="Remaining" value={daysLeft !== null ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}` : end && end <= now ? 'Ended' : '—'} />
        </div>
        {progress !== null && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{Math.round(progress)}% of the campaign window elapsed</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Workflow schedules">
        {exec.workflows.length ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-2">Workflow</th>
                <th className="pb-2">Trigger</th>
                <th className="pb-2">Schedule</th>
                <th className="pb-2">Next run</th>
                <th className="pb-2">Last run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exec.workflows.map((w) => {
                const p = w.pipeline;
                const on = Boolean(p.schedule_cron) && p.schedule_enabled !== false;
                return (
                  <tr key={p.id}>
                    <td className="py-2"><Link to={pipelineHref(p.id, journey.id)} className="font-medium text-indigo-600 hover:underline">{p.name}</Link></td>
                    <td className="py-2 font-mono text-slate-600">{p.schedule_cron || 'Manual'}</td>
                    <td className="py-2">{p.schedule_cron ? <span className={on ? 'text-emerald-700' : 'text-amber-700'}>{on ? 'On' : 'Off'}</span> : '—'}</td>
                    <td className="py-2 text-slate-600">{on ? formatDate(p.next_run_at, true) : '—'}</td>
                    <td className="py-2 text-slate-600">{w.lastRun ? `${formatDate(w.lastRun.started_at, true)} · ${w.lastRun.status}` : 'Never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-slate-500">No workflows attached.</p>
        )}
      </SectionCard>

      <SectionCard title="Execution history">
        {exec.runs.length ? (
          <ul className="divide-y divide-slate-100 text-xs">
            {exec.runs.slice(0, 25).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-800">{jobName.get(r.job_id) ?? 'Workflow'}</span>
                  <span className="text-slate-400"> · {r.trigger_source ?? 'manual'}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-slate-500">{formatDate(r.started_at, true)}</span>
                  <Link to={`/data/runs/${r.id}`} className={`font-semibold capitalize hover:underline ${r.status === 'failed' ? 'text-red-700' : r.status === 'running' ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {r.status}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">No executions yet.</p>
        )}
      </SectionCard>
    </div>
  );
}

function MiniProp({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

// ─── Reports ───────────────────────────────────────────────────────────

export function ReportsView({
  journey,
  exec,
  engagement,
  engagementRows,
}: {
  journey: JourneyRow;
  exec: CampaignExecution;
  engagement: EngagementSummary;
  engagementRows: EngagementRow[];
}) {
  const hasEng = engagementRows.length > 0;
  const revenue = engagementRows
    .filter((e) => e.event === 'converted')
    .reduce((s, e) => s + Number((e.metadata as Record<string, unknown> | null)?.revenue ?? 0), 0);
  const budget = campaignMeta(journey).budget;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <KpiCard group="Audience" label="Targeted" value={exec.totals.targeted} />
        <KpiCard group="Delivery" label="Sent" value={exec.totals.sent + engagement.sent} tone="indigo" />
        <KpiCard group="Delivery" label="Delivered" value={hasEng ? engagement.delivered : null} tone="sky" />
        <KpiCard group="Suppression" label="Suppressed" value={exec.totals.suppressed} tone="amber" />
        <KpiCard group="Engagement" label="Opened" value={hasEng ? engagement.opened : null} tone="violet" />
        <KpiCard group="Engagement" label="Clicked" value={hasEng ? engagement.clicked : null} tone="violet" />
        <KpiCard group="Conversion" label="Conversions" value={hasEng ? engagement.converted : null} tone="emerald" />
        <KpiCard group="Business" label="Revenue" value={revenue ? revenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : null} tone="emerald" hint={budget ? `Budget ${budget}` : undefined} />
      </div>
      <PerformanceCard exec={exec} engagementRows={engagementRows} />
      <ReportsTab exec={exec} engagement={engagement} engagementRows={engagementRows} />
    </div>
  );
}
