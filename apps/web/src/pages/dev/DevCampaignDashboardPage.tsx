import { useMemo, useState } from 'react';
import {
  CampaignDashboardView,
  GeneralView,
  ReportsView,
  ScheduleView,
  StatusBanner,
  type DashboardView,
} from '@/components/campaigns/CampaignDashboardView';
import { Megaphone, Save } from 'lucide-react';
import { Button } from '@/components/ui';
import { CampaignStatusBadge } from '@/components/campaigns/CampaignUi';
import { SettingsTab } from '@/components/campaigns/CampaignSettingsForm';
import {
  CAMPAIGN_WORKFLOW_TEMPLATES,
  campaignCode,
  campaignStatusReason,
  formatDate,
  type CampaignStatus,
  emptyEngagement,
  foldExecution,
  templateWorkflowJsonFor,
  type ApprovalState,
  type CampaignDelivery,
  type NodeRunRow,
  type PipelineRow,
  type RunRow,
} from '@/lib/campaigns';
import type { JourneyRow } from '@/lib/journeys';

/* Dev harness — campaign Dashboard with sample data, no auth / DB. */

const day = (offset: number, h = 10) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10) + `T${String(h).padStart(2, '0')}:00:00Z`;

function sample() {
  const ctx = { campaignName: 'New collection SUMMER', campaignCode: 'CMP-2026-4ED036' };
  const tpl = (id: string) => CAMPAIGN_WORKFLOW_TEMPLATES.find((t) => t.id === id)!;
  const pipelines: PipelineRow[] = [
    { id: 'job-email', name: 'Customer targeting — Email', job_type: 'journey_workflow', workflow_json: templateWorkflowJsonFor(tpl('email_blast'), ctx), schedule_cron: null, campaign_id: 'c1', pipeline_status: 'finished', created_at: day(-10), updated_at: day(-1) },
    { id: 'job-sms', name: 'Win-back — SMS', job_type: 'journey_workflow', workflow_json: templateWorkflowJsonFor(tpl('sms_blast'), ctx), schedule_cron: '0 9 * * *', schedule_enabled: true, next_run_at: day(1, 9), campaign_id: 'c1', pipeline_status: 'started', created_at: day(-8), updated_at: day(0) },
    { id: 'job-push', name: 'Daily push', job_type: 'journey_workflow', workflow_json: templateWorkflowJsonFor(tpl('scheduled_push'), ctx), schedule_cron: '0 9 * * *', schedule_enabled: true, next_run_at: day(1, 9), campaign_id: 'c1', pipeline_status: 'draft', created_at: day(-2), updated_at: day(-2) },
  ];
  const runs: RunRow[] = [
    { id: 'r-sms-2', job_id: 'job-sms', status: 'running', trigger_source: 'schedule', started_at: day(0, 9), completed_at: null },
    { id: 'r-email-1', job_id: 'job-email', status: 'succeeded', trigger_source: 'manual', started_at: day(-1, 11), completed_at: day(-1, 12), records_processed: 125000 },
    { id: 'r-sms-1', job_id: 'job-sms', status: 'partial', trigger_source: 'schedule', started_at: day(-1, 9), completed_at: day(-1, 9) },
  ];
  const nr = (run: string, node: string, type: string, i: number, o: number, f = 0, state = 'succeeded'): NodeRunRow => ({ run_id: run, node_id: node, node_type: type, node_label: node, state, records_in: i, records_out: o, records_failed: f, completed_at: day(-1, 12) });
  const nodeRuns: NodeRunRow[] = [
    nr('r-email-1', 's2', 'source', 0, 125000), nr('r-email-1', 's3', 'decision_suppression', 125000, 118000), nr('r-email-1', 's4', 'transform_dedupe', 118000, 117400), nr('r-email-1', 's5', 'action_email', 117400, 116900, 500),
    nr('r-sms-1', 's2', 'source', 0, 40000), nr('r-sms-1', 's3', 'decision_freq_cap', 40000, 36000), nr('r-sms-1', 's4', 'action_sms', 36000, 35100, 900),
    nr('r-sms-2', 's4', 'action_sms', 12000, 4000, 0, 'running'),
  ];
  return foldExecution(pipelines, runs, nodeRuns);
}

export function DevCampaignDashboardPage() {
  // ?empty=1 mirrors a fresh campaign: sparse details, no deliveries yet.
  const params = new URLSearchParams(window.location.search);
  const empty = params.has('empty');
  const editTab = params.get('tab') === 'edit';
  const exec = useMemo(() => (empty ? foldExecution([], [], []) : sample()), [empty]);
  const status: CampaignStatus = empty ? 'completed' : 'running';
  const [view, setView] = useState<DashboardView>('general');
  const [journey, setJourney] = useState<JourneyRow>(() => empty ? ({
    id: '4ed036e1-0000-4000-8000-000000000002', tenant_id: 't', environment: 'production', name: 'New hero Sale motors', description: null, status: 'published', folder_path: '/', starts_at: '2026-08-11T00:00:00Z', ends_at: '2026-09-16T18:29:59Z', current_version_id: null, entry_trigger_config: {}, created_at: day(0), updated_at: day(0),
    settings: { journey_type: 'campaign', campaign_owner: 'nmn227nmn@gmail.com', campaign: { type: 'Promotional', priority: 'Medium', timezone: 'UTC' } } as JourneyRow['settings'],
  } as JourneyRow) : ({
    id: '4ed036e1-0000-4000-8000-000000000001',
    tenant_id: 't',
    environment: 'production',
    name: 'New collection <SUMMER> (OP1)',
    description: 'Summer collection launch across email, SMS and push.',
    status: 'published',
    folder_path: '/Seasonal',
    starts_at: day(-5),
    ends_at: day(25),
    current_version_id: null,
    entry_trigger_config: {},
    created_at: day(-12),
    updated_at: day(0),
    settings: {
      journey_type: 'campaign',
      campaign_owner: 'Administrator (admin)',
      campaign: {
        type: 'Promotional',
        priority: 'High',
        timezone: 'Asia/Kolkata',
        objective: 'Drive first purchases from the summer collection.',
        target_kpi: 'Conversion',
        budget: "Marketing '26",
        tags: ['summer', 'launch'],
        documents: [
          { asset_id: 'a1', name: 'notification.png', file_path: 'x', mime_type: 'image/png', added_at: day(-3) },
          { asset_id: 'a2', name: 'dataset.csv', file_path: 'x', mime_type: 'text/csv', added_at: day(-3) },
          { asset_id: 'a3', name: 'whitepaper.pdf', file_path: 'x', mime_type: 'application/pdf', added_at: day(-3) },
        ],
        approvals: { 'job-email:s5': { content: { status: 'approved', by: 'Naman', at: day(-2) }, targeting: { status: 'approved', by: 'Naman', at: day(-2) } } },
      },
    } as JourneyRow['settings'],
  }));

  const approve = (d: CampaignDelivery, kind: 'content' | 'targeting' | 'both', st: ApprovalState['status']) =>
    setJourney((j) => {
      const s = j.settings as unknown as { campaign: { approvals?: Record<string, Record<string, ApprovalState>> } };
      const current = { ...(s.campaign.approvals?.[d.key] ?? {}) };
      (kind === 'both' ? ['content', 'targeting'] : [kind]).forEach((k) => (current[k] = { status: st, by: 'Dev user', at: new Date().toISOString() }));
      return { ...j, settings: { ...j.settings, campaign: { ...s.campaign, approvals: { ...(s.campaign.approvals ?? {}), [d.key]: current } } } as JourneyRow['settings'] };
    });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Mirrors the real page header (CampaignDashboardPage) for visual review. */}
      <header className="mb-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm"><Megaphone className="h-5 w-5" /></div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">{journey.name}</h1>
                <CampaignStatusBadge status={status} size="sm" />
              </div>
              <p className="mt-1 text-xs text-slate-500"><span className="font-mono text-slate-400">{campaignCode(journey)}</span> • {journey.settings?.campaign_owner} • {formatDate(journey.starts_at)} → {formatDate(journey.ends_at)}</p>
            </div>
          </div>
          <Button className="text-xs"><Save className="mr-1.5 h-3.5 w-3.5" />Save</Button>
        </div>
        <nav className="flex gap-6 border-b border-slate-200">
          {['Dashboard', 'Edit', 'Targeting & workflows', 'Logs'].map((t, i) => (
            <span key={t} className={`relative pb-2.5 pt-1 text-sm font-medium ${i === 0 ? 'text-slate-900' : 'text-slate-500'}`}>
              {t}
              {i === 0 && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-indigo-600" />}
            </span>
          ))}
        </nav>
      </header>
      {editTab ? (
        <SettingsTab
          journey={journey}
          tenantId="dev"
          status={status}
          formId="dev-settings"
          onDirtyChange={() => undefined}
          onSave={(f) => alert(`Would save: ${f.code} · ${f.startsAt} → ${f.endsAt}`)}
          onArchive={() => undefined}
          onDelete={() => undefined}
        />
      ) : (
      <CampaignDashboardView
        view={view}
        onViewChange={setView}
        banner={
          <StatusBanner tone={empty ? 'slate' : 'emerald'} text={campaignStatusReason(journey, status, exec.workflows)}>
            <Button variant="secondary" className="text-xs">{empty ? 'Extend end date' : 'Cancel the campaign'}</Button>
          </StatusBanner>
        }
      >
        {view === 'general' && (
          <GeneralView
            journey={journey}
            status={status}
            exec={exec}
            channels={empty ? ['web_push'] : ['email', 'sms', 'push']}
            busyKey={null}
            docBusy={false}
            approver="Dev user"
            refreshing={false}
            onRefresh={() => undefined}
            onEdit={() => undefined}
            onUploadDocument={() => undefined}
            onOpenDocument={() => undefined}
            onRemoveDocument={() => undefined}
            onApproval={approve}
            onStop={() => undefined}
          />
        )}
        {view === 'schedule' && <ScheduleView journey={journey} exec={exec} />}
        {view === 'reports' && <ReportsView journey={journey} exec={exec} engagement={emptyEngagement()} engagementRows={[]} />}
      </CampaignDashboardView>
      )}
    </div>
  );
}
