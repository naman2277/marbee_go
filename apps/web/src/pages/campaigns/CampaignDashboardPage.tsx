import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Copy,
  History,
  LayoutDashboard,
  ListOrdered,
  Megaphone,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Rocket,
  Save,
  Trash2,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { Breadcrumbs, CampaignStatusBadge } from '@/components/campaigns/CampaignUi';
import { DuplicateCampaignModal } from '@/components/campaigns/DuplicateCampaignModal';
import {
  AttachWorkflowModal,
  AudienceTab,
  CreateWorkflowModal,
  LogsTab,
  pipelineHref,
  WorkflowsTab,
} from '@/components/campaigns/CampaignTabs';
import { SettingsTab, type SettingsForm } from '@/components/campaigns/CampaignSettingsForm';
import {
  CampaignDashboardView,
  GeneralView,
  ReportsView,
  ScheduleView,
  StatusBanner,
  type DashboardView,
} from '@/components/campaigns/CampaignDashboardView';
import { useAuth } from '@/contexts/AuthContext';
import { fetchResourceAuditLogs } from '@/lib/audit';
import {
  activateCampaign,
  addCampaignDocument,
  attachPipelines,
  cancelCampaign,
  CampaignLinkMissingError,
  campaignCode,
  createCampaignPipeline,
  deriveCampaignStatus,
  detachPipeline,
  duplicateCampaign,
  EMPTY_EXECUTION,
  emptyEngagement,
  fetchAllPipelines,
  fetchCampaignPipelines,
  fetchEngagement,
  fetchExecution,
  formatDate,
  legacyDeliveries,
  openCampaignDocument,
  removeCampaignDocument,
  setCampaignArchived,
  setCampaignPaused,
  setDeliveryApproval,
  setPipelineScheduleEnabled,
  stopDelivery,
  summarizeEngagement,
  updateCampaign,
  type ApprovalState,
  type CampaignDelivery,
  type CampaignDocument,
  type CampaignStatus,
} from '@/lib/campaigns';
import { parseCampaignGraph } from '@/lib/campaign-graph';
import { deleteJourney, fetchJourneyDetail, resolveJourneyVersion, type JourneyRow } from '@/lib/journeys';

type TabId = 'dashboard' | 'edit' | 'targeting' | 'logs';

const SETTINGS_FORM_ID = 'campaign-settings-form';

/** Older links (?tab=workflows, ?tab=settings…) still land in the right place. */
function resolveTab(raw: string | null): { tab: TabId; view?: DashboardView } {
  switch (raw) {
    case 'edit':
    case 'settings':
      return { tab: 'edit' };
    case 'targeting':
    case 'workflows':
    case 'audience':
      return { tab: 'targeting' };
    case 'logs':
      return { tab: 'logs' };
    case 'reports':
      return { tab: 'dashboard', view: 'reports' };
    default:
      return { tab: 'dashboard' };
  }
}

export function CampaignDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantId, environment, displayName, user } = useAuth();
  const approver = displayName || user?.email || 'User';

  const resolved = resolveTab(params.get('tab'));
  const tab = resolved.tab;
  const viewParam = params.get('view') as DashboardView | null;
  const view: DashboardView = viewParam && ['general', 'schedule', 'reports'].includes(viewParam) ? viewParam : resolved.view ?? 'general';
  const go = (t: TabId, v?: DashboardView) => {
    const next: Record<string, string> = {};
    if (t !== 'dashboard') next.tab = t;
    if (t === 'dashboard' && v && v !== 'general') next.view = v;
    setParams(next, { replace: true });
  };

  const [moreOpen, setMoreOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmStop, setConfirmStop] = useState<CampaignDelivery | null>(null);
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [modalError, setModalError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyPipeline, setBusyPipeline] = useState<string | null>(null);
  const [busyDelivery, setBusyDelivery] = useState<string | null>(null);
  const [settingsMsg, setSettingsMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [formNonce, setFormNonce] = useState(0);

  // ─── Data ────────────────────────────────────────────────────────────
  const { data: journey, isLoading, error } = useQuery({
    queryKey: ['journey', id, tenantId, environment],
    queryFn: () => fetchJourneyDetail(id!, tenantId, environment),
    enabled: Boolean(id && tenantId),
  });

  const pipelinesQuery = useQuery({
    queryKey: ['campaign-pipelines', id],
    queryFn: () => fetchCampaignPipelines(id!),
    enabled: Boolean(id),
    retry: false,
  });
  const linkMissing = pipelinesQuery.error instanceof CampaignLinkMissingError;

  const execQuery = useQuery({
    queryKey: ['campaign-execution', id, pipelinesQuery.data?.map((p) => `${p.id}:${p.updated_at}`)],
    queryFn: () => fetchExecution(pipelinesQuery.data ?? []),
    enabled: Boolean(pipelinesQuery.data),
    refetchInterval: 20_000,
  });
  const pipelineExec = execQuery.data ?? EMPTY_EXECUTION;

  const { data: engagementRows = [] } = useQuery({
    queryKey: ['campaign-engagement', id],
    queryFn: () => fetchEngagement([id!]),
    enabled: Boolean(id),
    refetchInterval: 60_000,
  });

  const { data: audit } = useQuery({
    queryKey: ['campaign-audit', id, tenantId, environment],
    queryFn: () => fetchResourceAuditLogs(tenantId, environment, 'journey', id!, 1, 100),
    enabled: Boolean(id && tenantId && tab === 'logs'),
  });

  const allPipelines = useQuery({
    queryKey: ['campaign-attachable-pipelines', tenantId, environment],
    queryFn: () => fetchAllPipelines(tenantId, environment),
    enabled: attaching,
  });

  const engagement = useMemo(() => summarizeEngagement(engagementRows)[id ?? ''] ?? emptyEngagement(), [engagementRows, id]);
  // Deliveries fill in automatically: pipeline Send activities + send steps on the older campaign canvas.
  const exec = useMemo(() => {
    const legacy = journey ? legacyDeliveries(journey, engagement) : [];
    return legacy.length ? { ...pipelineExec, deliveries: [...pipelineExec.deliveries, ...legacy] } : pipelineExec;
  }, [pipelineExec, journey, engagement]);
  const status: CampaignStatus = journey ? deriveCampaignStatus(journey, exec.workflows) : 'draft';
  const channels = useMemo(() => [...new Set([...exec.deliveries.map((d) => d.channel), ...Object.keys(engagement.byChannel)])], [exec, engagement]);
  const hasLegacyCanvas = useMemo(() => parseCampaignGraph(resolveJourneyVersion(journey)?.canvas_json).nodes.length > 0, [journey]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['journey', id] });
    queryClient.invalidateQueries({ queryKey: ['journeys'] });
    queryClient.invalidateQueries({ queryKey: ['campaign-pipelines', id] });
    queryClient.invalidateQueries({ queryKey: ['campaign-execution', id] });
    queryClient.invalidateQueries({ queryKey: ['campaign-engagement', id] });
    queryClient.invalidateQueries({ queryKey: ['campaign-audit', id] });
    queryClient.invalidateQueries({ queryKey: ['campaign-linked-pipelines'] });
  };
  const fail = (e: Error) => setActionError(e.message);

  // ─── Mutations ───────────────────────────────────────────────────────
  const lifecycle = useMutation({
    mutationFn: async (action: 'activate' | 'pause' | 'resume' | 'archive' | 'restore' | 'cancel') => {
      if (!journey) return;
      if (action === 'activate') return activateCampaign(journey, tenantId, environment);
      if (action === 'cancel') return cancelCampaign(journey, tenantId, environment);
      if (action === 'pause' || action === 'resume') return setCampaignPaused(journey, action === 'pause', tenantId, environment);
      return setCampaignArchived(journey, action === 'archive', tenantId, environment);
    },
    onSuccess: () => {
      setConfirmCancel(false);
      refresh();
    },
    onError: fail,
  });

  const approval = useMutation({
    mutationFn: async ({ d, kind, st }: { d: CampaignDelivery; kind: 'content' | 'targeting' | 'both'; st: ApprovalState['status'] }) => {
      setBusyDelivery(d.key);
      await setDeliveryApproval({ journey: journey!, delivery: d, kind, status: st, by: approver, tenantId, environment });
    },
    onSettled: () => setBusyDelivery(null),
    onSuccess: refresh,
    onError: fail,
  });

  const stop = useMutation({
    mutationFn: async (d: CampaignDelivery) => {
      setBusyDelivery(d.key);
      await stopDelivery({ journey: journey!, delivery: d, tenantId, environment });
    },
    onSettled: () => {
      setBusyDelivery(null);
      setConfirmStop(null);
    },
    onSuccess: refresh,
    onError: fail,
  });

  const documents = useMutation({
    mutationFn: async (a: { kind: 'add'; file: File } | { kind: 'remove'; doc: CampaignDocument }) => {
      if (a.kind === 'add') await addCampaignDocument({ journey: journey!, file: a.file, tenantId, environment });
      else await removeCampaignDocument({ journey: journey!, assetId: a.doc.asset_id, tenantId, environment });
    },
    onSuccess: refresh,
    onError: fail,
  });

  const createWorkflow = useMutation({
    mutationFn: ({ template, name }: { template: Parameters<typeof createCampaignPipeline>[0]['template']; name: string }) =>
      createCampaignPipeline({ campaign: journey!, tenantId, environment, template, name }),
    onSuccess: (pipeline) => {
      setCreatingWorkflow(false);
      refresh();
      navigate(pipelineHref(pipeline.id, id!));
    },
    onError: (e: Error) => setModalError(e.message),
  });

  const attach = useMutation({
    mutationFn: (ids: string[]) => attachPipelines(journey!, ids, tenantId, environment),
    onSuccess: () => {
      setAttaching(false);
      refresh();
    },
    onError: (e: Error) => setModalError(e.message),
  });

  const pipelineAction = useMutation({
    mutationFn: async ({ kind, pipelineId, enabled }: { kind: 'schedule' | 'detach'; pipelineId: string; enabled?: boolean }) => {
      setBusyPipeline(pipelineId);
      const w = exec.workflows.find((x) => x.pipeline.id === pipelineId)!;
      if (kind === 'schedule') await setPipelineScheduleEnabled(w.pipeline, Boolean(enabled));
      else await detachPipeline(journey!, w.pipeline, tenantId, environment);
    },
    onSettled: () => setBusyPipeline(null),
    onSuccess: refresh,
    onError: fail,
  });

  const duplicate = useMutation({
    mutationFn: (opts: { name: string; copyDetails: boolean; copyWorkflows: boolean }) => duplicateCampaign({ source: journey!, tenantId, environment, ...opts }),
    onSuccess: (created) => {
      setDuplicating(false);
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      navigate(`/campaigns/${created.id}`);
    },
    onError: (e: Error) => setModalError(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const r = await deleteJourney(journey!.id, tenantId, environment, journey!.name);
      if (r.error) throw new Error(r.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      navigate('/campaigns');
    },
    onError: (e: Error) => {
      setConfirmDelete(false);
      fail(e);
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (f: SettingsForm) => {
      if (f.startsAt && f.endsAt && f.endsAt < f.startsAt) throw new Error('End date must be on or after the start date');
      return updateCampaign(
        journey!,
        {
          name: f.name,
          code: f.code,
          description: f.description.trim() || null,
          startsAt: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null,
          endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null,
          owner: { name: f.ownerName, id: f.ownerId },
          approvalStatus: f.approvalStatus,
          approvalNotes: f.approvalNotes,
          meta: {
            type: f.type,
            tags: f.tags,
            timezone: f.timezone,
            priority: f.priority,
            objective: f.objective.trim() || undefined,
            primary_channel: f.primaryChannel,
            target_kpi: f.targetKpi.trim() || undefined,
            budget: f.budget.trim() || undefined,
            notes: f.notes.trim() || undefined,
          },
        },
        tenantId,
        environment,
      );
    },
    onSuccess: (_r, f) => {
      // Status is derived from the dates — patch the cached row so it flips immediately, then refetch.
      queryClient.setQueryData<JourneyRow | null>(['journey', id, tenantId, environment], (old) =>
        old
          ? {
              ...old,
              name: f.name.trim() || old.name,
              campaign_code: f.code || old.campaign_code,
              starts_at: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null,
              ends_at: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null,
            }
          : old,
      );
      setDirty(false);
      setSettingsMsg({ tone: 'ok', text: 'Saved' });
      setTimeout(() => setSettingsMsg(null), 2500);
      refresh();
    },
    onError: (e: Error) => setSettingsMsg({ tone: 'error', text: e.message }),
  });

  // ─── Render ──────────────────────────────────────────────────────────
  if (isLoading) return <div className="py-16 text-center text-sm text-slate-500">Loading campaign…</div>;
  if (error || !journey) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold text-slate-900">Campaign not found</p>
        <p className="mt-1 text-sm text-slate-500">{error instanceof Error ? error.message : 'It may have been deleted, or you do not have access.'}</p>
        <Link to="/campaigns" className="mt-4 inline-block text-sm font-semibold text-indigo-600 hover:underline">Back to Campaigns</Link>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'edit', label: 'Edit', icon: Pencil },
    { id: 'targeting', label: 'Targeting & workflows', icon: Workflow },
    { id: 'logs', label: 'Logs', icon: ListOrdered },
  ];
  const crumbTab = tab === 'dashboard' ? null : tabs.find((t) => t.id === tab)!.label;

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <header className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Campaigns', to: '/campaigns' },
            { label: journey.name, to: crumbTab ? `/campaigns/${journey.id}` : undefined },
            ...(crumbTab ? [{ label: crumbTab }] : []),
          ]}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/20">
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">{journey.name}</h1>
                <CampaignStatusBadge status={status} size="sm" />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                <span className="font-mono text-slate-400">{campaignCode(journey)}</span>
                {journey.settings?.campaign_owner && (<><span className="text-slate-300">•</span><span>{journey.settings.campaign_owner}</span></>)}
                {(journey.starts_at || journey.ends_at) && (<><span className="text-slate-300">•</span><span>{formatDate(journey.starts_at)} → {formatDate(journey.ends_at)}</span></>)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {settingsMsg && <span className={`text-xs font-medium ${settingsMsg.tone === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{settingsMsg.text}</span>}
            {dirty && (
              <Button variant="ghost" onClick={() => { setFormNonce((n) => n + 1); setDirty(false); }} className="text-xs">
                Discard
              </Button>
            )}
            <Button
              type={dirty ? 'submit' : 'button'}
              form={dirty ? SETTINGS_FORM_ID : undefined}
              onClick={() => { if (!dirty) go('edit'); }}
              disabled={saveSettings.isPending}
              className="text-xs shadow-sm"
              title={dirty ? 'Save changes' : 'Nothing to save — opens Edit'}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saveSettings.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Save'}
            </Button>
            <div className="relative">
              <Button variant="secondary" onClick={() => setMoreOpen((v) => !v)} className="px-2.5 text-xs" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-11 z-40 w-52 rounded-xl border border-slate-200 bg-white p-1 text-xs font-medium shadow-xl">
                    {['running', 'scheduled', 'failed'].includes(status) && (
                      <MenuButton icon={<Pause className="h-3.5 w-3.5 text-amber-500" />} label="Pause campaign" onClick={() => { setMoreOpen(false); lifecycle.mutate('pause'); }} />
                    )}
                    <MenuButton icon={<Copy className="h-3.5 w-3.5 text-slate-500" />} label="Duplicate" onClick={() => { setMoreOpen(false); setModalError(''); setDuplicating(true); }} />
                    {hasLegacyCanvas && (
                      <Link to={`/campaigns/${journey.id}/legacy`} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-50" onClick={() => setMoreOpen(false)}>
                        <History className="h-3.5 w-3.5 text-slate-500" /> Open legacy canvas
                      </Link>
                    )}
                    <MenuButton
                      icon={status === 'archived' ? <ArchiveRestore className="h-3.5 w-3.5 text-slate-500" /> : <Archive className="h-3.5 w-3.5 text-slate-500" />}
                      label={status === 'archived' ? 'Restore' : 'Archive'}
                      onClick={() => { setMoreOpen(false); lifecycle.mutate(status === 'archived' ? 'restore' : 'archive'); }}
                    />
                    <div className="my-1 border-t border-slate-100" />
                    <MenuButton danger icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete campaign" onClick={() => { setMoreOpen(false); setConfirmDelete(true); }} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Underline tabs — overflow-y hidden so a sideways scroll never shows vertical arrows */}
        <nav className="flex gap-6 overflow-x-auto overflow-y-hidden border-b border-slate-200 [scrollbar-width:none]">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-2.5 pt-1 text-sm font-medium transition-colors ${
                  active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <t.icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                {t.label}
                {t.id === 'targeting' && exec.workflows.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">{exec.workflows.length}</span>
                )}
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-indigo-600" />}
              </button>
            );
          })}
        </nav>
      </header>

      {actionError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
          {actionError}
          <button onClick={() => setActionError('')}>✕</button>
        </div>
      )}
      {linkMissing && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Workflows and deliveries need <code className="font-mono font-semibold">supabase/sql/82_campaign_pipeline_link.sql</code> — run it once in the SQL editor.
        </div>
      )}

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && (
        <CampaignDashboardView
          view={view}
          onViewChange={(v) => go('dashboard', v)}
          banner={<Banner journey={journey} status={status} busy={lifecycle.isPending} onActivate={() => lifecycle.mutate('activate')} onResume={() => lifecycle.mutate('resume')} onRestore={() => lifecycle.mutate('restore')} onCancel={() => setConfirmCancel(true)} onWorkflows={() => go('targeting')} onEdit={() => go('edit')} />}
        >
          {view === 'general' && (
            <GeneralView
              journey={journey}
              status={status}
              exec={exec}
              channels={channels}
              busyKey={busyDelivery}
              docBusy={documents.isPending}
              approver={approver}
              refreshing={execQuery.isFetching}
              onRefresh={refresh}
              onEdit={() => go('edit')}
              onUploadDocument={(file) => documents.mutate({ kind: 'add', file })}
              onRemoveDocument={(doc) => documents.mutate({ kind: 'remove', doc })}
              onOpenDocument={(doc) => openCampaignDocument(doc).catch(fail)}
              onApproval={(d, kind, st) => approval.mutate({ d, kind, st })}
              onStop={(d) => setConfirmStop(d)}
            />
          )}
          {view === 'schedule' && <ScheduleView journey={journey} exec={exec} />}
          {view === 'reports' && <ReportsView journey={journey} exec={exec} engagement={engagement} engagementRows={engagementRows} />}
        </CampaignDashboardView>
      )}

      {/* ── Edit ── */}
      <div hidden={tab !== 'edit'}>
        <SettingsTab
          key={`${journey.updated_at}:${formNonce}`}
          journey={journey}
          tenantId={tenantId}
          status={status}
          formId={SETTINGS_FORM_ID}
          onDirtyChange={setDirty}
          onSave={(f) => saveSettings.mutate(f)}
          onArchive={(archived) => lifecycle.mutate(archived ? 'archive' : 'restore')}
          onDelete={() => setConfirmDelete(true)}
        />
      </div>

      {/* ── Targeting and workflows ── */}
      {tab === 'targeting' && (
        <div className="space-y-6">
          <WorkflowsTab
            campaignId={journey.id}
            exec={exec}
            linkMissing={linkMissing}
            busyId={busyPipeline}
            onCreate={() => { setModalError(''); setCreatingWorkflow(true); }}
            onAttach={() => { setModalError(''); setAttaching(true); }}
            onToggleSchedule={(w, enabled) => pipelineAction.mutate({ kind: 'schedule', pipelineId: w.pipeline.id, enabled })}
            onDetach={(w) => {
              if (window.confirm(`Detach "${w.pipeline.name}" from this campaign? The pipeline and its history are kept.`)) {
                pipelineAction.mutate({ kind: 'detach', pipelineId: w.pipeline.id });
              }
            }}
          />
          {exec.workflows.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Targeting</h3>
              <AudienceTab campaignId={journey.id} exec={exec} linkMissing={linkMissing} />
            </div>
          )}
        </div>
      )}

      {/* ── Logs ── */}
      {tab === 'logs' && <LogsTab exec={exec} audit={audit?.logs ?? []} />}

      {/* ── Modals ── */}
      {creatingWorkflow && (
        <CreateWorkflowModal
          campaignName={journey.name}
          busy={createWorkflow.isPending}
          error={modalError}
          onClose={() => setCreatingWorkflow(false)}
          onCreate={(template, name) => createWorkflow.mutate({ template, name })}
        />
      )}
      {attaching && (
        <AttachWorkflowModal
          pipelines={allPipelines.data ?? []}
          loading={allPipelines.isLoading}
          campaignId={journey.id}
          busy={attach.isPending}
          error={modalError}
          onClose={() => setAttaching(false)}
          onAttach={(ids) => attach.mutate(ids)}
        />
      )}
      {duplicating && (
        <DuplicateCampaignModal source={journey} busy={duplicate.isPending} error={modalError} onClose={() => setDuplicating(false)} onConfirm={(opts) => duplicate.mutate(opts)} />
      )}
      {confirmCancel && (
        <Confirm
          title="Cancel the campaign?"
          body={`"${journey.name}" ends now: running executions are canceled and every workflow schedule is switched off. History is kept; you can re-open it later by changing the end date in Edit.`}
          confirmLabel={lifecycle.isPending ? 'Canceling…' : 'Cancel the campaign'}
          busy={lifecycle.isPending}
          onClose={() => setConfirmCancel(false)}
          onConfirm={() => lifecycle.mutate('cancel')}
        />
      )}
      {confirmStop && (
        <Confirm
          title={`Stop "${confirmStop.name}"?`}
          body={`Cancels the running execution of "${confirmStop.jobName}" and switches its schedule off. Messages already sent are not recalled.`}
          confirmLabel={stop.isPending ? 'Stopping…' : 'Stop delivery'}
          busy={stop.isPending}
          onClose={() => setConfirmStop(null)}
          onConfirm={() => stop.mutate(confirmStop)}
        />
      )}
      {confirmDelete && (
        <Confirm
          title={`Delete "${journey.name}"?`}
          body={`This cannot be undone. ${exec.workflows.length ? `${exec.workflows.length} linked pipeline(s) are kept and become unassigned.` : ''}`}
          confirmLabel={remove.isPending ? 'Deleting…' : 'Delete campaign'}
          busy={remove.isPending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => remove.mutate()}
        />
      )}
    </div>
  );
}

function Banner({
  journey,
  status,
  busy,
  onActivate,
  onResume,
  onRestore,
  onCancel,
  onWorkflows,
  onEdit,
}: {
  journey: JourneyRow;
  status: CampaignStatus;
  busy: boolean;
  onActivate: () => void;
  onResume: () => void;
  onRestore: () => void;
  onCancel: () => void;
  onWorkflows: () => void;
  onEdit: () => void;
}) {
  const cancelBtn = (
    <Button variant="secondary" onClick={onCancel} disabled={busy} className="text-xs">
      Cancel the campaign
    </Button>
  );
  switch (status) {
    case 'draft':
      return (
        <StatusBanner text="Draft — activate it when workflows and deliveries are ready.">
          <Button onClick={onActivate} disabled={busy} className="text-xs"><Rocket className="mr-1.5 h-3.5 w-3.5" />Activate</Button>
        </StatusBanner>
      );
    case 'scheduled':
      return <StatusBanner tone="sky" text={`Scheduled to start on ${formatDate(journey.starts_at)}.`}>{cancelBtn}</StatusBanner>;
    case 'running':
      return (
        <StatusBanner tone="emerald" text={`Live since ${formatDate(journey.starts_at ?? journey.updated_at ?? journey.created_at)}${journey.ends_at ? ` · ends ${formatDate(journey.ends_at)}` : ''}.`}>
          {cancelBtn}
        </StatusBanner>
      );
    case 'paused':
      return (
        <StatusBanner tone="amber" text="Paused — workflow schedules are switched off.">
          <Button onClick={onResume} disabled={busy} className="text-xs"><Play className="mr-1.5 h-3.5 w-3.5" />Resume</Button>
          {cancelBtn}
        </StatusBanner>
      );
    case 'failed':
      return (
        <StatusBanner tone="red" text="A workflow execution failed.">
          <Button variant="secondary" onClick={onWorkflows} className="text-xs">View workflows</Button>
          {cancelBtn}
        </StatusBanner>
      );
    case 'completed':
      return (
        <StatusBanner text={`Ended on ${formatDate(journey.ends_at)}. Move the end date forward to reopen it.`}>
          <Button variant="secondary" onClick={onEdit} className="text-xs">Extend end date</Button>
        </StatusBanner>
      );
    case 'archived':
      return (
        <StatusBanner text="Archived — hidden from active views.">
          <Button variant="secondary" onClick={onRestore} disabled={busy} className="text-xs"><ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />Restore</Button>
        </StatusBanner>
      );
  }
}

function MenuButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${danger ? 'font-semibold text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
      {icon}
      {label}
    </button>
  );
}

function Confirm({ title, body, confirmLabel, busy, onClose, onConfirm }: { title: string; body: string; confirmLabel: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{body}</p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="text-xs">Back</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy} className="text-xs font-semibold">{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
