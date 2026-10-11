import { supabase } from './supabase';
import { logAudit } from './audit';
import { defaultConfigForType, getWorkflowGraph } from './data-jobs';
import {
  createJourney,
  resolveJourneyDisplayStatus,
  type CampaignSettings,
  type JourneyRow,
} from './journeys';

/* ================================================================
   Campaign module — a business-level management layer over Pipelines.

     CAMPAIGN (journeys row, journey_type = 'campaign')
       └─ PIPELINE (data_jobs.campaign_id)           ← execution logic
            └─ DELIVERY (action_email/sms/… node)   ← communication sent
                 └─ node runs / engagement_log       ← outcomes

   Nothing here builds or executes workflows — that stays in Pipelines.
   Execution history is only ever read, never copied or rewritten.
   ================================================================ */

// ─── Campaign metadata (stored in journeys.settings.campaign) ──────────

export const CAMPAIGN_TYPES = [
  'Promotional',
  'Lifecycle',
  'Retention',
  'Acquisition',
  'Loyalty',
  'Transactional',
  'Event',
  'Custom',
] as const;

export const CAMPAIGN_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

export const CAMPAIGN_CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'push', label: 'Push' },
  { id: 'multi', label: 'Multi-channel' },
] as const;

export type CampaignMeta = {
  type?: string;
  tags?: string[];
  timezone?: string;
  priority?: string;
  objective?: string;
  primary_channel?: string;
  budget?: string;
  target_kpi?: string;
  notes?: string;
  /** Files attached to the campaign — stored in the Asset Library (assets bucket). */
  documents?: CampaignDocument[];
  /** Per-delivery approvals, keyed by CampaignDelivery.key (`jobId:nodeId`). */
  approvals?: Record<string, DeliveryApproval>;
};

export type CampaignDocument = { asset_id: string; name: string; file_path: string; mime_type?: string | null; added_at: string };

export type ApprovalState = { status: 'pending' | 'approved' | 'rejected'; by?: string; at?: string };
export type DeliveryApproval = { content?: ApprovalState; targeting?: ApprovalState };

export type CampaignSettingsV2 = CampaignSettings & { campaign?: CampaignMeta };

export function campaignMeta(j: Pick<JourneyRow, 'settings'>): CampaignMeta {
  return ((j.settings as CampaignSettingsV2 | null)?.campaign ?? {}) as CampaignMeta;
}

/** Auto-generated campaign ID, e.g. CMP-2026-4ED036 — mirrors assign_campaign_code() in SQL 83. */
export function defaultCampaignCode(j: Pick<JourneyRow, 'id' | 'created_at'>): string {
  const year = j.created_at ? new Date(j.created_at).getFullYear() : new Date().getFullYear();
  return `CMP-${year}-${j.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** The campaign's ID: the stored (editable) code, else the auto-generated one. */
export function campaignCode(j: Pick<JourneyRow, 'id' | 'created_at'> & { campaign_code?: string | null }): string {
  return j.campaign_code || defaultCampaignCode(j);
}

export const CAMPAIGN_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

/** Normalise user input: uppercase, spaces → dashes, drop anything outside [A-Z0-9_-]. */
export function normalizeCampaignCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

export function campaignCodeError(code: string): string | null {
  if (!code) return 'Campaign ID is required';
  if (code.length < 3) return 'Use at least 3 characters';
  if (!/^[A-Z0-9]/.test(code)) return 'Must start with a letter or number';
  if (!CAMPAIGN_CODE_PATTERN.test(code)) return 'Letters, numbers, - and _ only';
  return null;
}

/** A fresh suggestion in the default style, with a random suffix. */
export function suggestCampaignCode(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `CMP-${new Date().getFullYear()}-${hex.toUpperCase()}`;
}

export type CodeAvailability = 'available' | 'taken' | 'unknown';

/**
 * Instance-wide availability (all tenants) via the SECURITY DEFINER RPC from SQL 83.
 * Returns 'unknown' when the RPC isn't installed — the unique index still guards the save.
 */
export async function checkCampaignCodeAvailable(code: string, excludeId?: string): Promise<CodeAvailability> {
  const { data, error } = await supabase.rpc('is_campaign_code_available', { p_code: code, p_exclude_id: excludeId ?? null });
  if (error) return 'unknown';
  return data ? 'available' : 'taken';
}

export function deliveryCode(jobId: string, nodeId: string): string {
  const raw = `${jobId}${nodeId}`.replace(/[^a-z0-9]/gi, '');
  return `DEL-${raw.slice(0, 4).toUpperCase()}${raw.slice(-4).toUpperCase()}`;
}

// ─── Campaign status model ─────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'archived';

export const CAMPAIGN_STATUS_CONFIG: Record<CampaignStatus, { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: 'Draft', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  scheduled: { label: 'Scheduled', bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-500' },
  running: { label: 'Running', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  paused: { label: 'Paused', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  completed: { label: 'Completed', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  failed: { label: 'Failed', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  archived: { label: 'Archived', bg: 'bg-zinc-100', text: 'text-zinc-500', dot: 'bg-zinc-400' },
};

/**
 * Derived from the campaign row + the latest run of each linked pipeline:
 * archived/paused are explicit; a failed latest run or an executing run wins next;
 * otherwise the date window decides.
 */
export function deriveCampaignStatus(
  journey: Pick<JourneyRow, 'status' | 'starts_at' | 'ends_at' | 'settings'>,
  workflows: CampaignWorkflow[] = [],
): CampaignStatus {
  if (journey.status === 'archived') return 'archived';
  if (journey.status === 'paused') return 'paused';
  if (workflows.some((w) => w.lastRun?.status === 'failed')) return 'failed';
  if (workflows.some((w) => w.lastRun && ['queued', 'running'].includes(w.lastRun.status))) return 'running';

  const display = resolveJourneyDisplayStatus(journey);
  if (display === 'finished') return 'completed';
  if (display === 'scheduled') return 'scheduled';
  if (display === 'started' || display === 'published') return 'running';
  return 'draft';
}

/** One line explaining *why* the campaign has its status — shown under the title. */
export function campaignStatusReason(
  journey: Pick<JourneyRow, 'status' | 'starts_at' | 'ends_at' | 'updated_at' | 'created_at'>,
  status: CampaignStatus,
  workflows: CampaignWorkflow[] = [],
): string {
  const start = journey.starts_at ? formatDate(journey.starts_at) : null;
  const end = journey.ends_at ? formatDate(journey.ends_at) : null;
  switch (status) {
    case 'archived':
      return 'Archived — hidden from active views, history kept';
    case 'paused':
      return 'Paused — workflow schedules are off';
    case 'failed': {
      const w = workflows.find((x) => x.lastRun?.status === 'failed');
      return `Last run of "${w?.pipeline.name ?? 'a workflow'}" failed`;
    }
    case 'completed':
      return `Ended ${end}${start ? ` · ran from ${start}` : ''} — move the end date forward to reopen`;
    case 'scheduled':
      return `Starts ${start}${end ? ` · ends ${end}` : ''}`;
    case 'running':
      if (workflows.some((w) => w.lastRun && ['queued', 'running'].includes(w.lastRun.status))) return 'A workflow is executing now';
      return start ? `Live since ${start}${end ? ` · ends ${end}` : ' · no end date'}` : end ? `Live · ends ${end}` : 'Live · no schedule';
    default:
      return start || end ? `Draft · planned ${start ?? '—'} → ${end ?? '—'}` : 'Draft — activate when workflows are ready';
  }
}

/** `YYYY-MM-DD` in the viewer's local calendar (not UTC) — for <input type="date">. */
export function localDateInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Pipelines as campaign workflows ───────────────────────────────────

export const DELIVERY_NODE_TYPES: Record<string, { channel: string; label: string }> = {
  action_email: { channel: 'email', label: 'Email' },
  action_sms: { channel: 'sms', label: 'SMS' },
  action_whatsapp: { channel: 'whatsapp', label: 'WhatsApp' },
  action_push: { channel: 'push', label: 'Push' },
};

/** Nodes whose (in − out) counts as suppressed audience. */
const SUPPRESSION_NODE_TYPES = new Set(['decision_suppression', 'decision_freq_cap', 'transform_dedupe', 'decision_eligibility']);
const SOURCE_NODE_TYPES = new Set(['source', 'source_query', 'source_connector', 'source_file', 'source_db_query']);

export type PipelineRow = {
  id: string;
  name: string;
  job_type: string;
  workflow_json: unknown;
  schedule_cron: string | null;
  schedule_enabled?: boolean | null;
  schedule_tz?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  pipeline_status?: string | null;
  campaign_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type RunRow = {
  id: string;
  job_id: string;
  status: string;
  trigger_source?: string | null;
  records_processed?: number | null;
  started_at: string | null;
  completed_at: string | null;
  queued_at?: string | null;
};

export type NodeRunRow = {
  run_id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  state: string;
  records_in: number;
  records_out: number;
  records_failed: number;
  completed_at: string | null;
};

export type CampaignDelivery = {
  key: string;
  code: string;
  jobId: string;
  jobName: string;
  nodeId: string;
  name: string;
  nodeType: string;
  channel: string;
  channelLabel: string;
  config: Record<string, unknown>;
  status: 'not_run' | 'running' | 'completed' | 'failed' | 'partial';
  targeted: number;
  sent: number;
  failed: number;
  lastRunAt: string | null;
  lastRunId: string | null;
  runs: number;
  /** 'legacy' = a send step on the older campaign canvas (journey_versions), metrics from engagement_log. */
  source?: 'pipeline' | 'legacy';
};

export type CampaignWorkflow = {
  pipeline: PipelineRow;
  runs: RunRow[];
  lastRun: RunRow | null;
  runsCount: number;
  processed: number;
  qualified: number;
  suppressed: number;
  deliveries: CampaignDelivery[];
  nodeCount: number;
};

export type CampaignExecution = {
  workflows: CampaignWorkflow[];
  deliveries: CampaignDelivery[];
  runs: RunRow[];
  nodeRuns: NodeRunRow[];
  totals: { targeted: number; sent: number; failed: number; suppressed: number; qualified: number };
};

export const EMPTY_EXECUTION: CampaignExecution = {
  workflows: [],
  deliveries: [],
  runs: [],
  nodeRuns: [],
  totals: { targeted: 0, sent: 0, failed: 0, suppressed: 0, qualified: 0 },
};

// '*' on purpose: optional columns (last_run_at, next_run_at, schedule_enabled, pipeline_status…)
// come from later scripts (60/69) that a database may not have run yet.
const PIPELINE_COLUMNS = '*';

/** Column name from a PostgREST/Postgres "missing column" error, if that's what it is. */
function missingColumn(error: { message?: string } | null): string | null {
  const msg = error?.message ?? '';
  const m = msg.match(/column "?(?:\w+\.)?(\w+)"? does not exist/) ?? msg.match(/Could not find the '(\w+)' column/);
  return m ? m[1] : null;
}

/**
 * Update data_jobs rows, dropping any patch column the database doesn't have
 * (e.g. schedule_enabled / pipeline_status before scripts 60/69 are run).
 */
async function updateDataJobs(
  patch: Record<string, unknown>,
  scope: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<void> {
  let row = { ...patch };
  for (let i = 0; i < 5 && Object.keys(row).length; i++) {
    const { error } = await scope(supabase.from('data_jobs').update(row));
    if (!error) return;
    const col = missingColumn(error);
    if (!col || !(col in row)) throw wrapLinkError(error);
    const { [col]: _dropped, ...rest } = row;
    row = rest;
  }
}

export class CampaignLinkMissingError extends Error {
  constructor() {
    super('Campaign ↔ Pipeline link is not installed. Run supabase/sql/82_campaign_pipeline_link.sql once.');
  }
}

function wrapLinkError(error: { message?: string; code?: string }) {
  if (error.message?.includes('campaign_id')) return new CampaignLinkMissingError();
  return new Error(error.message ?? 'Request failed');
}

/** All pipelines in the tenant that are linked to any campaign. */
export async function fetchLinkedPipelines(tenantId: string, environment: string): Promise<PipelineRow[]> {
  const { data, error } = await supabase
    .from('data_jobs')
    .select(PIPELINE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .not('campaign_id', 'is', null);
  if (error) throw wrapLinkError(error);
  return (data ?? []) as PipelineRow[];
}

/** Every pipeline in the tenant — for the "attach existing workflow" picker. */
export async function fetchAllPipelines(tenantId: string, environment: string): Promise<PipelineRow[]> {
  const { data, error } = await supabase
    .from('data_jobs')
    .select(PIPELINE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });
  if (error) throw wrapLinkError(error);
  return (data ?? []) as PipelineRow[];
}

export async function fetchCampaignPipelines(campaignId: string): Promise<PipelineRow[]> {
  const { data, error } = await supabase
    .from('data_jobs')
    .select(PIPELINE_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (error) throw wrapLinkError(error);
  return (data ?? []) as PipelineRow[];
}

/**
 * Read-only execution rollup for a set of pipelines: runs (newest first) + node runs,
 * folded into workflows and deliveries.
 */
export async function fetchExecution(pipelines: PipelineRow[], runLimit = 500): Promise<CampaignExecution> {
  if (!pipelines.length) return EMPTY_EXECUTION;
  const jobIds = pipelines.map((p) => p.id);

  const { data: runData, error: runError } = await supabase
    .from('data_job_runs')
    .select('*')
    .in('job_id', jobIds)
    .order('started_at', { ascending: false })
    .limit(runLimit);
  if (runError) throw runError;
  const runs = (runData ?? []) as RunRow[];

  let nodeRuns: NodeRunRow[] = [];
  if (runs.length) {
    const { data: nodeData, error: nodeError } = await supabase
      .from('data_job_node_runs')
      .select('run_id, node_id, node_type, node_label, state, records_in, records_out, records_failed, completed_at')
      .in('run_id', runs.map((r) => r.id));
    // data_job_node_runs comes from script 60 — without it, runs still show but per-activity counts are zero.
    if (nodeError && !/data_job_node_runs|does not exist|schema cache/i.test(nodeError.message ?? '')) throw nodeError;
    nodeRuns = (nodeData ?? []) as NodeRunRow[];
  }

  return foldExecution(pipelines, runs, nodeRuns);
}

export function foldExecution(pipelines: PipelineRow[], runs: RunRow[], nodeRuns: NodeRunRow[]): CampaignExecution {
  const runsByJob = new Map<string, RunRow[]>();
  for (const r of runs) {
    const list = runsByJob.get(r.job_id) ?? [];
    list.push(r);
    runsByJob.set(r.job_id, list);
  }
  const runById = new Map(runs.map((r) => [r.id, r]));
  const nodeRunsByRun = new Map<string, NodeRunRow[]>();
  for (const nr of nodeRuns) {
    const list = nodeRunsByRun.get(nr.run_id) ?? [];
    list.push(nr);
    nodeRunsByRun.set(nr.run_id, list);
  }

  const workflows: CampaignWorkflow[] = pipelines.map((pipeline) => {
    const graph = getWorkflowGraph({ id: pipeline.id, workflow_json: pipeline.workflow_json });
    const jobRuns = runsByJob.get(pipeline.id) ?? [];
    const lastRun = jobRuns[0] ?? null;
    const lastNodeRuns = lastRun ? nodeRunsByRun.get(lastRun.id) ?? [] : [];

    const qualified = lastNodeRuns
      .filter((n) => SOURCE_NODE_TYPES.has(n.node_type))
      .reduce((s, n) => s + Number(n.records_out || 0), 0);
    const suppressed = lastNodeRuns
      .filter((n) => SUPPRESSION_NODE_TYPES.has(n.node_type))
      .reduce((s, n) => s + Math.max(0, Number(n.records_in || 0) - Number(n.records_out || 0)), 0);

    const deliveries: CampaignDelivery[] = graph.nodes
      .filter((node) => DELIVERY_NODE_TYPES[String(node.data?.stepType)])
      .map((node) => {
        const nodeType = String(node.data?.stepType);
        const meta = DELIVERY_NODE_TYPES[nodeType];
        const history = jobRuns
          .map((r) => (nodeRunsByRun.get(r.id) ?? []).find((n) => n.node_id === node.id))
          .filter(Boolean) as NodeRunRow[];
        const latest = history[0];
        const latestRun = latest ? runById.get(latest.run_id) : undefined;
        const targeted = history.reduce((s, n) => s + Number(n.records_in || 0), 0);
        const sent = history.reduce((s, n) => s + Number(n.records_out || 0), 0);
        const failed = history.reduce((s, n) => s + Number(n.records_failed || 0), 0);
        const status: CampaignDelivery['status'] = !latest
          ? 'not_run'
          : ['running', 'queued', 'retrying'].includes(latest.state)
          ? 'running'
          : latest.state === 'failed'
          ? 'failed'
          : latest.records_failed > 0
          ? 'partial'
          : 'completed';
        return {
          key: `${pipeline.id}:${node.id}`,
          code: deliveryCode(pipeline.id, node.id),
          jobId: pipeline.id,
          jobName: pipeline.name,
          nodeId: node.id,
          name: String(node.data?.label || meta.label),
          nodeType,
          channel: meta.channel,
          channelLabel: meta.label,
          config: (node.data?.config ?? {}) as Record<string, unknown>,
          status,
          targeted,
          sent,
          failed,
          lastRunAt: latestRun?.completed_at ?? latestRun?.started_at ?? latest?.completed_at ?? null,
          lastRunId: latest?.run_id ?? null,
          runs: history.length,
        };
      });

    return {
      pipeline,
      runs: jobRuns,
      lastRun,
      runsCount: jobRuns.length,
      processed: Number(lastRun?.records_processed ?? 0),
      qualified,
      suppressed,
      deliveries,
      nodeCount: graph.nodes.length,
    };
  });

  const deliveries = workflows.flatMap((w) => w.deliveries);
  return {
    workflows,
    deliveries,
    runs,
    nodeRuns,
    totals: {
      targeted: deliveries.reduce((s, d) => s + d.targeted, 0),
      sent: deliveries.reduce((s, d) => s + d.sent, 0),
      failed: deliveries.reduce((s, d) => s + d.failed, 0),
      suppressed: workflows.reduce((s, w) => s + w.suppressed, 0),
      qualified: workflows.reduce((s, w) => s + w.qualified, 0),
    },
  };
}

// ─── Legacy campaign-canvas deliveries ───────────────────────────────

const CHANNEL_LABELS: Record<string, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push', web_push: 'Web Push', rcs: 'RCS', in_app: 'In-app' };

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel.replace(/_/g, ' ');
}

/**
 * Send steps on the older campaign canvas (send_email, send_web_push, …) surface as deliveries
 * automatically; their numbers come from engagement_log for that channel.
 */
export function legacyDeliveries(
  journey: Pick<JourneyRow, 'id' | 'journey_versions' | 'current_version_id'>,
  engagement: { byChannel: Record<string, Partial<Record<string, number>>> },
): CampaignDelivery[] {
  const version =
    journey.journey_versions?.find((v) => v.id === journey.current_version_id) ?? journey.journey_versions?.[0];
  const nodes = ((version?.canvas_json as { nodes?: Array<{ id: string; data?: Record<string, unknown> }> } | null)?.nodes ?? []);
  return nodes
    .filter((n) => String(n.data?.stepType ?? '').startsWith('send_'))
    .map((n) => {
      const stepType = String(n.data?.stepType);
      const channel = stepType.replace(/^send_/, '');
      const cfg = (n.data?.config ?? {}) as Record<string, unknown>;
      const e = engagement.byChannel[channel] ?? {};
      const sent = Number(e.sent ?? 0);
      const failed = Number(e.failed ?? 0);
      return {
        key: `legacy:${n.id}`,
        code: deliveryCode(journey.id, n.id),
        jobId: 'legacy',
        jobName: 'Campaign canvas',
        nodeId: n.id,
        name: String(cfg.delivery_name || n.data?.label || channelLabel(channel)),
        nodeType: stepType,
        channel,
        channelLabel: channelLabel(channel),
        config: cfg,
        status: sent ? (failed ? 'partial' : 'completed') : 'not_run',
        targeted: sent + failed,
        sent,
        failed,
        lastRunAt: null,
        lastRunId: null,
        runs: 0,
        source: 'legacy' as const,
      };
    });
}

// ─── Engagement (engagement_log) ───────────────────────────────────────

export type EngagementEvent = 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'unsubscribed' | 'converted';

export type EngagementRow = {
  journey_id: string | null;
  campaign_id: string | null;
  channel: string;
  event: EngagementEvent;
  timestamp: string;
  metadata: Record<string, unknown> | null;
};

export type EngagementSummary = Record<EngagementEvent, number> & { byChannel: Record<string, Partial<Record<EngagementEvent, number>>> };

export function emptyEngagement(): EngagementSummary {
  return { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, unsubscribed: 0, converted: 0, byChannel: {} };
}

export async function fetchEngagement(campaignIds: string[], sinceIso?: string): Promise<EngagementRow[]> {
  if (!campaignIds.length) return [];
  const list = campaignIds.join(',');
  let q = supabase
    .from('engagement_log')
    .select('journey_id, campaign_id, channel, event, timestamp, metadata')
    .or(`journey_id.in.(${list}),campaign_id.in.(${list})`)
    .order('timestamp', { ascending: false })
    .limit(20000);
  if (sinceIso) q = q.gte('timestamp', sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as EngagementRow[];
}

export function summarizeEngagement(rows: EngagementRow[]): Record<string, EngagementSummary> {
  const out: Record<string, EngagementSummary> = {};
  for (const r of rows) {
    const id = r.campaign_id ?? r.journey_id;
    if (!id) continue;
    const s = (out[id] ??= emptyEngagement());
    s[r.event] = (s[r.event] ?? 0) + 1;
    const ch = (s.byChannel[r.channel] ??= {});
    ch[r.event] = (ch[r.event] ?? 0) + 1;
  }
  return out;
}

// ─── Mutations ─────────────────────────────────────────────────────────

export async function createCampaign(input: {
  tenantId: string;
  environment: string;
  name: string;
  description?: string;
  folderPath?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  owner?: { name?: string; id?: string };
  meta: CampaignMeta;
}): Promise<JourneyRow> {
  const created = await createJourney({
    tenantId: input.tenantId,
    environment: input.environment,
    name: input.name,
    description: input.description,
    type: 'campaign',
    folderPath: input.folderPath,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
  });

  const settings: CampaignSettingsV2 = {
    ...(created.settings ?? {}),
    journey_type: 'campaign',
    campaign_owner: input.owner?.name || undefined,
    campaign_owner_id: input.owner?.id || undefined,
    campaign: input.meta,
  };
  const { error } = await supabase.from('journeys').update({ settings }).eq('id', created.id);
  if (error) throw error;
  return { ...created, settings };
}

export async function updateCampaign(
  journey: JourneyRow,
  patch: {
    name?: string;
    description?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    folderPath?: string;
    code?: string;
    owner?: { name?: string; id?: string };
    approvalStatus?: CampaignSettings['approval_status'];
    approvalNotes?: string;
    meta?: CampaignMeta;
  },
  tenantId: string,
  environment: string,
): Promise<void> {
  const current = (journey.settings ?? {}) as CampaignSettingsV2;
  const settings: CampaignSettingsV2 = { ...current };
  if (patch.owner) {
    settings.campaign_owner = patch.owner.name || undefined;
    settings.campaign_owner_id = patch.owner.id || undefined;
  }
  if (patch.approvalStatus !== undefined) settings.approval_status = patch.approvalStatus;
  if (patch.approvalNotes !== undefined) settings.approval_notes = patch.approvalNotes || undefined;
  if (patch.meta) settings.campaign = { ...(current.campaign ?? {}), ...patch.meta };

  const row: Record<string, unknown> = { settings };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('Campaign name is required');
    row.name = patch.name.trim();
  }
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) row.ends_at = patch.endsAt;
  if (patch.folderPath !== undefined) row.folder_path = patch.folderPath;
  if (patch.code !== undefined && patch.code !== campaignCode(journey)) {
    const code = normalizeCampaignCode(patch.code);
    const err = campaignCodeError(code);
    if (err) throw new Error(err);
    row.campaign_code = code;
  }

  const { error } = await supabase
    .from('journeys')
    .update(row)
    .eq('id', journey.id)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) {
    // 23505 = unique_violation on journeys_campaign_code_unique (another campaign, possibly another tenant, owns it).
    if (error.code === '23505' || error.message?.includes('campaign_code_unique')) {
      throw new Error(`Campaign ID "${row.campaign_code}" is already in use. Choose another.`);
    }
    if (error.message?.includes('campaign_code')) {
      throw new Error('Editable campaign IDs need supabase/sql/83_campaign_code.sql — run it once in the SQL editor.');
    }
    throw error;
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: journey.id,
    resourceName: patch.name ?? journey.name,
    summary: row.campaign_code ? `Updated campaign settings · ID changed to ${row.campaign_code}` : 'Updated campaign settings',
  });
}

/** Pause/resume the campaign and the schedules of its pipelines (the scheduler honours schedule_enabled). */
export async function setCampaignPaused(
  journey: JourneyRow,
  paused: boolean,
  tenantId: string,
  environment: string,
): Promise<void> {
  const { error } = await supabase
    .from('journeys')
    .update({ status: paused ? 'paused' : 'published' })
    .eq('id', journey.id)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;

  try {
    // Schedules: the scheduler skips schedule_enabled = false.
    await updateDataJobs({ schedule_enabled: !paused }, (q) => q.eq('campaign_id', journey.id).not('schedule_cron', 'is', null));
    // Live status: only running ↔ paused pipelines flip; drafts stay drafts.
    await updateDataJobs({ pipeline_status: paused ? 'paused' : 'started' }, (q) =>
      q.eq('campaign_id', journey.id).eq('pipeline_status', paused ? 'started' : 'paused'),
    );
  } catch (e) {
    if (!(e instanceof CampaignLinkMissingError)) throw e;
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: journey.id,
    resourceName: journey.name,
    summary: `${paused ? 'Paused' : 'Resumed'} campaign "${journey.name}" and its pipeline schedules`,
  });
}

export async function setCampaignArchived(
  journey: JourneyRow,
  archived: boolean,
  tenantId: string,
  environment: string,
): Promise<void> {
  const { error } = await supabase
    .from('journeys')
    .update({ status: archived ? 'archived' : 'draft' })
    .eq('id', journey.id)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;
  if (archived) {
    await updateDataJobs({ schedule_enabled: false }, (q) => q.eq('campaign_id', journey.id)).catch(() => undefined);
  }
  void logAudit({
    tenantId,
    environment,
    action: archived ? 'archive' : 'restore',
    resourceType: 'journey',
    resourceId: journey.id,
    resourceName: journey.name,
    summary: `${archived ? 'Archived' : 'Restored'} campaign "${journey.name}"`,
  });
}

/** Mark a draft campaign ready: published → scheduled / running by its date window. */
export async function activateCampaign(journey: JourneyRow, tenantId: string, environment: string) {
  const { error } = await supabase
    .from('journeys')
    .update({ status: 'published' })
    .eq('id', journey.id)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;
  void logAudit({
    tenantId,
    environment,
    action: 'publish',
    resourceType: 'journey',
    resourceId: journey.id,
    resourceName: journey.name,
    summary: `Activated campaign "${journey.name}"`,
  });
}

export async function attachPipelines(campaign: JourneyRow, jobIds: string[], tenantId: string, environment: string) {
  if (!jobIds.length) return;
  const { error } = await supabase.from('data_jobs').update({ campaign_id: campaign.id }).in('id', jobIds);
  if (error) throw wrapLinkError(error);
  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: campaign.id,
    resourceName: campaign.name,
    summary: `Attached ${jobIds.length} workflow${jobIds.length === 1 ? '' : 's'}`,
    metadata: { job_ids: jobIds },
  });
}

export async function detachPipeline(campaign: JourneyRow, pipeline: PipelineRow, tenantId: string, environment: string) {
  const { error } = await supabase.from('data_jobs').update({ campaign_id: null }).eq('id', pipeline.id);
  if (error) throw wrapLinkError(error);
  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: campaign.id,
    resourceName: campaign.name,
    summary: `Detached workflow "${pipeline.name}"`,
  });
}

export async function setPipelineScheduleEnabled(pipeline: PipelineRow, enabled: boolean) {
  await updateDataJobs({ schedule_enabled: enabled, pipeline_status: enabled ? 'started' : 'paused' }, (q) => q.eq('id', pipeline.id));
}

// ─── Delivery lifecycle (Adobe-style: approve content & targeting, then send) ──

export type DeliveryDisplayStatus = 'to_approve' | 'rejected' | 'ready' | 'in_progress' | 'finished' | 'partial' | 'failed';

export const DELIVERY_DISPLAY_STATUS: Record<DeliveryDisplayStatus, { label: string; cls: string }> = {
  to_approve: { label: 'To approve', cls: 'text-amber-700' },
  rejected: { label: 'Rejected', cls: 'text-red-700' },
  ready: { label: 'Ready', cls: 'text-sky-700' },
  in_progress: { label: 'In progress', cls: 'text-emerald-700' },
  finished: { label: 'Finished', cls: 'text-blue-700' },
  partial: { label: 'Partially failed', cls: 'text-amber-700' },
  failed: { label: 'Failed', cls: 'text-red-700' },
};

export function deliveryApproval(journey: Pick<JourneyRow, 'settings'>, key: string): Required<DeliveryApproval> {
  const a = campaignMeta(journey).approvals?.[key] ?? {};
  return { content: a.content ?? { status: 'pending' }, targeting: a.targeting ?? { status: 'pending' } };
}

export function deliveryDisplayStatus(d: CampaignDelivery, approval: Required<DeliveryApproval>): DeliveryDisplayStatus {
  if (d.status === 'running') return 'in_progress';
  if (d.status === 'failed') return 'failed';
  if (d.status === 'partial') return 'partial';
  if (d.status === 'completed') return 'finished';
  if (approval.content.status === 'rejected' || approval.targeting.status === 'rejected') return 'rejected';
  if (approval.content.status !== 'approved' || approval.targeting.status !== 'approved') return 'to_approve';
  return 'ready';
}

/** Read-modify-write of settings.campaign against the latest row, so concurrent edits don't clobber each other. */
async function patchCampaignMeta(
  journeyId: string,
  tenantId: string,
  environment: string,
  mutate: (meta: CampaignMeta) => CampaignMeta,
): Promise<void> {
  const { data, error } = await supabase
    .from('journeys')
    .select('settings')
    .eq('id', journeyId)
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .single();
  if (error) throw error;
  const settings = (data?.settings ?? {}) as CampaignSettingsV2;
  const next: CampaignSettingsV2 = { ...settings, campaign: mutate({ ...(settings.campaign ?? {}) }) };
  const { error: upError } = await supabase.from('journeys').update({ settings: next }).eq('id', journeyId);
  if (upError) throw upError;
}

export async function setDeliveryApproval(input: {
  journey: JourneyRow;
  delivery: CampaignDelivery;
  kind: 'content' | 'targeting' | 'both';
  status: ApprovalState['status'];
  by: string;
  tenantId: string;
  environment: string;
}): Promise<void> {
  const state: ApprovalState = { status: input.status, by: input.by, at: new Date().toISOString() };
  const kinds = input.kind === 'both' ? (['content', 'targeting'] as const) : ([input.kind] as const);
  await patchCampaignMeta(input.journey.id, input.tenantId, input.environment, (meta) => {
    const current = { ...(meta.approvals?.[input.delivery.key] ?? {}) };
    kinds.forEach((k) => (current[k] = state));
    return { ...meta, approvals: { ...(meta.approvals ?? {}), [input.delivery.key]: current } };
  });
  const verb = { approved: 'Approved', rejected: 'Rejected', pending: 'Reset approval of' }[input.status];
  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: input.journey.id,
    resourceName: input.journey.name,
    summary: `${verb} ${input.kind === 'both' ? 'content & targeting' : input.kind} for delivery "${input.delivery.name}"`,
  });
}

/** Cancel queued/running runs of a pipeline (same semantics as the Pipeline run cancel). */
async function cancelActiveRuns(jobIds: string[]): Promise<number> {
  if (!jobIds.length) return 0;
  const { data, error } = await supabase
    .from('data_job_runs')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .in('job_id', jobIds)
    .in('status', ['queued', 'running'])
    .select('id');
  if (error) {
    // canceled_at arrives with script 60 — fall back to status only.
    if (missingColumn(error) !== 'canceled_at') throw error;
    const retry = await supabase
      .from('data_job_runs')
      .update({ status: 'canceled' })
      .in('job_id', jobIds)
      .in('status', ['queued', 'running'])
      .select('id');
    if (retry.error) throw retry.error;
    return retry.data?.length ?? 0;
  }
  return data?.length ?? 0;
}

/** Stop a delivery: cancel its workflow's active run and switch the workflow schedule off. */
export async function stopDelivery(input: { journey: JourneyRow; delivery: CampaignDelivery; tenantId: string; environment: string }) {
  const canceled = await cancelActiveRuns([input.delivery.jobId]);
  await updateDataJobs({ schedule_enabled: false, pipeline_status: 'paused' }, (q) => q.eq('id', input.delivery.jobId));
  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: input.journey.id,
    resourceName: input.journey.name,
    summary: `Stopped delivery "${input.delivery.name}"${canceled ? ` (${canceled} run canceled)` : ''}`,
  });
}

/** Cancel the campaign: end it now, stop every workflow schedule, cancel in-flight runs. */
export async function cancelCampaign(journey: JourneyRow, tenantId: string, environment: string) {
  const { error } = await supabase
    .from('journeys')
    .update({ status: 'published', ends_at: new Date().toISOString() })
    .eq('id', journey.id)
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;
  const pipelines = await fetchCampaignPipelines(journey.id).catch(() => [] as PipelineRow[]);
  await cancelActiveRuns(pipelines.map((p) => p.id));
  if (pipelines.length) {
    await updateDataJobs({ schedule_enabled: false, pipeline_status: 'finished' }, (q) => q.eq('campaign_id', journey.id));
  }
  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'journey',
    resourceId: journey.id,
    resourceName: journey.name,
    summary: `Canceled campaign "${journey.name}"`,
  });
}

export async function addCampaignDocument(input: { journey: JourneyRow; file: File; tenantId: string; environment: string }) {
  const { uploadAsset } = await import('./assets');
  const folder = `/Campaigns/${campaignCode(input.journey)}`;
  const { asset, error } = await uploadAsset(input.tenantId, input.environment, input.file, folder);
  if (error || !asset) throw new Error(error ?? 'Upload failed');
  await patchCampaignMeta(input.journey.id, input.tenantId, input.environment, (meta) => ({
    ...meta,
    documents: [
      ...(meta.documents ?? []),
      { asset_id: asset.id, name: asset.name, file_path: asset.file_path, mime_type: asset.mime_type, added_at: new Date().toISOString() },
    ],
  }));
}

/** Detach a document from the campaign (the file stays in the Asset Library). */
export async function removeCampaignDocument(input: { journey: JourneyRow; assetId: string; tenantId: string; environment: string }) {
  await patchCampaignMeta(input.journey.id, input.tenantId, input.environment, (meta) => ({
    ...meta,
    documents: (meta.documents ?? []).filter((d) => d.asset_id !== input.assetId),
  }));
}

export async function openCampaignDocument(doc: CampaignDocument) {
  const { getAssetPreviewUrl } = await import('./assets');
  const url = await getAssetPreviewUrl(doc.file_path);
  if (!url) throw new Error('Could not open document');
  window.open(url, '_blank', 'noopener');
}

// ─── Campaign pipeline templates (seeded into the existing Pipeline builder) ──

export type CampaignWorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  channels: string[];
  steps: (ctx: { campaignName: string; campaignCode: string }) => { type: string; label: string; config?: Record<string, unknown> }[];
};

const utm = (ctx: { campaignName: string }) =>
  ctx.campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const CAMPAIGN_WORKFLOW_TEMPLATES: CampaignWorkflowTemplate[] = [
  {
    id: 'blank',
    name: 'Blank workflow',
    description: 'Empty canvas — build targeting and deliveries yourself in the Pipeline builder.',
    channels: [],
    steps: () => [],
  },
  {
    id: 'email_blast',
    name: 'Targeting → Suppression → Email',
    description: 'Read customers, remove suppressed and duplicate contacts, send one email delivery.',
    channels: ['email'],
    steps: (ctx) => [
      { type: 'trigger_manual', label: 'Manual start' },
      { type: 'source', label: 'Target customers', config: { schema: 'customer' } },
      { type: 'decision_suppression', label: 'Suppression list', config: { match_field: 'email' } },
      { type: 'transform_dedupe', label: 'Dedupe by email', config: { keys: 'email', keep: 'first' } },
      {
        type: 'action_email',
        label: `${ctx.campaignName} — Email`,
        config: { subject: ctx.campaignName, communication_type: 'promotional', utm_source: 'marbee', utm_campaign: utm(ctx) },
      },
    ],
  },
  {
    id: 'sms_blast',
    name: 'Targeting → Frequency cap → SMS',
    description: 'Read customers, apply frequency capping, send an SMS delivery.',
    channels: ['sms'],
    steps: (ctx) => [
      { type: 'trigger_manual', label: 'Manual start' },
      { type: 'source', label: 'Target customers', config: { schema: 'customer' } },
      { type: 'decision_freq_cap', label: 'Frequency cap' },
      { type: 'action_sms', label: `${ctx.campaignName} — SMS`, config: { message: `${ctx.campaignName}: ` } },
    ],
  },
  {
    id: 'whatsapp_blast',
    name: 'Targeting → Suppression → WhatsApp',
    description: 'Read customers, remove suppressed contacts, send a WhatsApp template.',
    channels: ['whatsapp'],
    steps: (ctx) => [
      { type: 'trigger_manual', label: 'Manual start' },
      { type: 'source', label: 'Target customers', config: { schema: 'customer' } },
      { type: 'decision_suppression', label: 'Suppression list', config: { match_field: 'mobile' } },
      { type: 'action_whatsapp', label: `${ctx.campaignName} — WhatsApp` },
    ],
  },
  {
    id: 'scheduled_push',
    name: 'Daily schedule → Push',
    description: 'Every morning, target opted-in devices and send a push notification.',
    channels: ['push'],
    steps: (ctx) => [
      { type: 'trigger_schedule', label: 'Every morning', config: { frequency: 'daily', run_time: '09:00' } },
      { type: 'source', label: 'Target devices', config: { schema: 'customer' } },
      { type: 'action_push', label: `${ctx.campaignName} — Push`, config: { title: ctx.campaignName } },
    ],
  },
];

export function templateWorkflowJsonFor(t: CampaignWorkflowTemplate, ctx: { campaignName: string; campaignCode: string }) {
  return {
    nodes: [],
    edges: [],
    steps: t.steps(ctx).map((s, i) => ({
      id: `s${i + 1}`,
      type: s.type,
      label: s.label,
      config: { ...defaultConfigForType(s.type), ...(s.config ?? {}) },
    })),
    campaign_context: ctx,
  };
}

/** Create a new pipeline owned by this campaign — the Pipeline builder takes it from here. */
export async function createCampaignPipeline(input: {
  campaign: JourneyRow;
  tenantId: string;
  environment: string;
  template: CampaignWorkflowTemplate;
  name?: string;
}): Promise<PipelineRow> {
  const ctx = { campaignName: input.campaign.name, campaignCode: campaignCode(input.campaign) };
  const json = templateWorkflowJsonFor(input.template, ctx);
  const { data, error } = await supabase
    .from('data_jobs')
    .insert({
      tenant_id: input.tenantId,
      environment: input.environment,
      name: input.name?.trim() || `${input.campaign.name} — ${input.template.id === 'blank' ? 'Workflow' : input.template.name}`,
      job_type: 'journey_workflow',
      workflow_json: input.template.id === 'blank' ? { nodes: [], edges: [], steps: [], campaign_context: ctx } : json,
      status: 'active',
      campaign_id: input.campaign.id,
    })
    .select(PIPELINE_COLUMNS)
    .single();
  if (error) throw wrapLinkError(error);

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'create',
    resourceType: 'journey',
    resourceId: input.campaign.id,
    resourceName: input.campaign.name,
    summary: `Created workflow "${(data as PipelineRow).name}" from template "${input.template.name}"`,
  });
  return data as PipelineRow;
}

/**
 * Duplicate a campaign. Configuration only — execution history (runs, node runs,
 * engagement) is never copied.
 */
export async function duplicateCampaign(input: {
  source: JourneyRow;
  tenantId: string;
  environment: string;
  name: string;
  copyDetails: boolean;
  copyWorkflows: boolean;
}): Promise<JourneyRow> {
  const src = input.source;
  const created = await createCampaign({
    tenantId: input.tenantId,
    environment: input.environment,
    name: input.name,
    description: input.copyDetails ? src.description ?? undefined : undefined,
    folderPath: src.folder_path ?? '/',
    startsAt: input.copyDetails ? src.starts_at ?? null : null,
    endsAt: input.copyDetails ? src.ends_at ?? null : null,
    owner: input.copyDetails
      ? { name: src.settings?.campaign_owner, id: src.settings?.campaign_owner_id }
      : undefined,
    meta: input.copyDetails ? campaignMeta(src) : {},
  });

  if (input.copyWorkflows) {
    const pipelines = await fetchCampaignPipelines(src.id);
    if (pipelines.length) {
      const { error } = await supabase.from('data_jobs').insert(
        pipelines.map((p) => ({
          tenant_id: input.tenantId,
          environment: input.environment,
          name: p.name.replace(src.name, input.name),
          job_type: p.job_type,
          workflow_json: p.workflow_json,
          schedule_cron: p.schedule_cron,
          ...(p.schedule_tz ? { schedule_tz: p.schedule_tz } : {}),
          status: 'active',
          campaign_id: created.id,
        })),
      );
      if (error) throw wrapLinkError(error);
    }
  }

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'create',
    resourceType: 'journey',
    resourceId: created.id,
    resourceName: input.name,
    summary: `Duplicated from "${src.name}"${input.copyWorkflows ? ' with workflows' : ''}`,
  });
  return created;
}

// ─── Campaign templates (create-from-template presets) ────────────────

export type CampaignPreset = {
  id: string;
  name: string;
  description: string;
  meta: CampaignMeta;
  workflowTemplateId: string;
};

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    id: 'festive_promo',
    name: 'Festive promotion',
    description: 'Seasonal email promotion to all reachable customers.',
    meta: { type: 'Promotional', priority: 'High', primary_channel: 'email', target_kpi: 'Conversion', objective: 'Drive festive-season purchases.' },
    workflowTemplateId: 'email_blast',
  },
  {
    id: 'winback',
    name: 'Win-back',
    description: 'Re-engage lapsed customers over SMS with frequency capping.',
    meta: { type: 'Retention', priority: 'Medium', primary_channel: 'sms', target_kpi: 'Reactivation rate', objective: 'Bring back customers inactive for 90+ days.' },
    workflowTemplateId: 'sms_blast',
  },
  {
    id: 'loyalty_whatsapp',
    name: 'Loyalty update',
    description: 'Tier and points update on WhatsApp.',
    meta: { type: 'Loyalty', priority: 'Medium', primary_channel: 'whatsapp', target_kpi: 'Repeat purchase', objective: 'Increase repeat purchases from loyalty members.' },
    workflowTemplateId: 'whatsapp_blast',
  },
  {
    id: 'daily_push',
    name: 'Daily engagement push',
    description: 'Scheduled push notification to opted-in devices.',
    meta: { type: 'Lifecycle', priority: 'Low', primary_channel: 'push', target_kpi: 'Click-through rate', objective: 'Keep app users engaged daily.' },
    workflowTemplateId: 'scheduled_push',
  },
];

// ─── Formatting ────────────────────────────────────────────────────────

export function compactNumber(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return v.toLocaleString();
}

export function formatDate(iso?: string | null, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(1).replace(/\.0$/, '')}%`;
}
