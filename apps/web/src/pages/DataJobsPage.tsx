import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  GitBranch,
  Layers,
  Play,
  Pause,
  Square,
  Plus,
  Sparkles,
  Workflow,
  Zap,
  Trash2,
  Copy,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  MoreVertical,
  Calendar,
  Activity,
  Loader2,
  Globe,
  Route,
} from 'lucide-react';
import { PageHeader, Card, Badge, Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  countWorkflowNodes,
  JOB_TYPES,
  NODE_PALETTE,
  parseWorkflowGraph,
  paletteItem,
  getWorkflowGraph,
  getRunHistoryForJob,
} from '@/lib/data-jobs';
import { PIPELINE_TEMPLATES, templateWorkflowJson } from '@/lib/pipeline-templates';

type PipelineLiveStatus = 'draft' | 'started' | 'paused' | 'stopped' | 'finished';

const LIVE_STATUS_CONFIG: Record<PipelineLiveStatus, { bg: string; text: string; label: string; dot: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Draft', dot: 'bg-slate-400' },
  started: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Running', dot: 'bg-emerald-500' },
  paused: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Paused', dot: 'bg-amber-500' },
  stopped: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Stopped', dot: 'bg-rose-500' },
  finished: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Finished', dot: 'bg-blue-500' },
};

function getPipelineLiveStatus(jobId: string): PipelineLiveStatus {
  try {
    const saved = localStorage.getItem(`pipeline_live_status_${jobId}`);
    if (saved === 'started' || saved === 'paused' || saved === 'stopped' || saved === 'finished') return saved;
  } catch {}
  return 'draft';
}

function setPipelineLiveStatus(jobId: string, status: PipelineLiveStatus) {
  try { localStorage.setItem(`pipeline_live_status_${jobId}`, status); } catch {}
}

function getPipelineTypeLabel(jobType: string): { label: string; icon: 'api' | 'journey' | 'default' } {
  if (jobType === 'api_trigger') return { label: 'API Trigger', icon: 'api' };
  if (jobType === 'journey_workflow') return { label: 'Journey / Workflow', icon: 'journey' };
  return { label: '', icon: 'default' };
}

function RunStatsBlock({ history, runsCount, lastRun }: { history: { logs?: { ms?: number }[] }[]; runsCount: number; lastRun: { triggeredBy?: string; triggerSource?: string; startedAtFormatted?: string; date?: string; timestamp?: string } }) {
  const totalDurationAllRuns = history.reduce((accTotal, r) => {
    const rLogs = r.logs || [];
    const rDuration = rLogs.reduce((sum: number, l: any) => sum + (l.ms || 0), 0);
    return accTotal + rDuration;
  }, 0);
  const avgTimeMs = totalDurationAllRuns > 0 && runsCount > 0 ? Math.round(totalDurationAllRuns / runsCount) : 0;

  return (
    <div className="space-y-1.5 text-xs">
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div>
          <span className="text-slate-500">Total Executions:</span>{' '}
          <strong className="text-slate-900 font-bold">{runsCount} run{runsCount > 1 ? 's' : ''}</strong>
        </div>
        <div className="text-right">
          <span className="text-slate-500">Avg Time:</span>{' '}
          <strong className="text-indigo-700 font-bold">{avgTimeMs > 0 ? `${avgTimeMs}ms` : 'Instant'}</strong>
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] border-t border-slate-200/60 pt-1.5">
        <div className="truncate">
          <span className="text-slate-500">Last Executed By:</span>{' '}
          <strong className="text-slate-800 font-semibold">{lastRun.triggeredBy || 'Naman'}</strong>
        </div>
        <span className="uppercase font-bold text-slate-500 text-[9px] bg-slate-200/60 px-1.5 py-0.5 rounded">{lastRun.triggerSource || 'manual'}</span>
      </div>
      <div className="text-[10px] text-slate-400 font-mono">
        <span>When: <strong className="text-slate-600 font-medium">{lastRun.startedAtFormatted || `${lastRun.date} ${lastRun.timestamp}`}</strong></span>
      </div>
    </div>
  );
}

export function DataJobsPage() {
  const { tenantId, environment } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [jobType, setJobType] = useState<string>(JOB_TYPES[0].value);
  const [templateId, setTemplateId] = useState<string>('blank');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'running' | 'api' | 'journey' | 'scheduled' | 'manual'>('all');

  // Deletion modal state
  const [deletingJob, setDeletingJob] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Active menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Pipeline live status per card — DB is authoritative, localStorage is fallback cache
  const [liveStatuses, setLiveStatuses] = useState<Record<string, PipelineLiveStatus>>({});
  const getLiveStatus = useCallback((jobId: string): PipelineLiveStatus => {
    return liveStatuses[jobId] ?? getPipelineLiveStatus(jobId);
  }, [liveStatuses]);
  const updateLiveStatus = useCallback((jobId: string, status: PipelineLiveStatus) => {
    setPipelineLiveStatus(jobId, status);
    setLiveStatuses(prev => ({ ...prev, [jobId]: status }));
  }, []);

  const { data: jobs, refetch } = useQuery({
    queryKey: ['data-jobs', tenantId, environment],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_jobs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  // Populate live statuses from DB pipeline_status on load
  useEffect(() => {
    if (!jobs || jobs.length === 0) return;
    const fromDb: Record<string, PipelineLiveStatus> = {};
    for (const j of jobs) {
      const dbStatus = (j as Record<string, unknown>).pipeline_status as string | undefined;
      if (dbStatus && ['draft', 'started', 'paused', 'finished'].includes(dbStatus)) {
        fromDb[j.id] = dbStatus as PipelineLiveStatus;
        try { localStorage.setItem(`pipeline_live_status_${j.id}`, dbStatus); } catch {}
      }
    }
    setLiveStatuses(prev => ({ ...prev, ...fromDb }));
  }, [jobs]);

  const { data: dbRuns, refetch: refetchRuns } = useQuery({
    queryKey: ['data-job-runs-all', tenantId, environment],
    queryFn: async () => {
      const { data } = await supabase
        .from('data_job_runs')
        .select('*')
        .order('started_at', { ascending: false });
      return data ?? [];
    },
  });

  const handleCreate = async () => {
    setError('');
    const template = PIPELINE_TEMPLATES.find((t) => t.id === templateId) ?? PIPELINE_TEMPLATES[0];
    const { error: err } = await supabase.from('data_jobs').insert({
      tenant_id: tenantId,
      environment,
      name: name.trim(),
      job_type: template.id === 'blank' ? jobType : template.jobType,
      workflow_json: template.id === 'blank' ? { nodes: [], edges: [], steps: [] } : templateWorkflowJson(template),
      status: 'active',
    });
    if (err) {
      setError(err.message);
      return;
    }
    setName('');
    setShowCreate(false);
    refetch();
  };

  const handleDuplicate = async (job: { name: string; job_type: string; workflow_json: unknown; schedule_cron?: string | null; schedule_tz?: string | null }) => {
    try {
      await supabase.from('data_jobs').insert({
        tenant_id: tenantId,
        environment,
        name: `${job.name} (Copy)`,
        job_type: job.job_type,
        workflow_json: job.workflow_json,
        schedule_cron: job.schedule_cron ?? null,
        schedule_tz: job.schedule_tz ?? 'UTC',
        status: 'active',
      });
      refetch();
    } catch (err) {
      console.error('Duplicate error:', err);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deletingJob) return;
    setIsDeleting(true);
    try {
      const jobId = deletingJob.id;

      // Child tables (runs, versions, logs, artifacts) cascade via ON DELETE CASCADE.
      // Just delete the parent row.
      const { error: err } = await supabase.from('data_jobs').delete().eq('id', jobId);
      if (err) throw err;

      // Clear local storage cache
      localStorage.removeItem(`data_job_draft_${jobId}`);
      localStorage.removeItem(`data_job_exec_log_${jobId}`);
      localStorage.removeItem(`data_job_run_history_${jobId}`);
      localStorage.removeItem(`data_job_versions_${jobId}`);

      await refetch();
      await refetchRuns();
    } catch (err) {
      console.error('Failed to delete workflow from DB:', err);
      alert(`Could not delete workflow: ${(err as Error).message || err}`);
    } finally {
      setIsDeleting(false);
      setDeletingJob(null);
    }
  };

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((j) => {
      const matchesSearch = j.name.toLowerCase().includes(searchQuery.toLowerCase()) || j.job_type.toLowerCase().includes(searchQuery.toLowerCase());
      if (filterTab === 'running') {
        const ls = getLiveStatus(j.id);
        return matchesSearch && (ls === 'started' || ls === 'paused');
      }
      if (filterTab === 'api') return matchesSearch && j.job_type === 'api_trigger';
      if (filterTab === 'journey') return matchesSearch && j.job_type === 'journey_workflow';
      if (filterTab === 'scheduled') return matchesSearch && Boolean(j.schedule_cron);
      if (filterTab === 'manual') return matchesSearch && !j.schedule_cron;
      return matchesSearch;
    });
  }, [jobs, searchQuery, filterTab, liveStatuses]);

  const stats = useMemo(() => {
    const total = jobs?.length ?? 0;
    const scheduled = jobs?.filter((j) => Boolean(j.schedule_cron)).length ?? 0;
    const manual = total - scheduled;
    return { total, scheduled, manual };
  }, [jobs]);

  return (
    <div className="space-y-6">
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <span>Pipelines</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              {stats.total} Workflows
            </span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl">
            Visual workflow builder — design import, transform, quality, and export pipelines. Track executions in real time.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-md hover:shadow-indigo-500/20 hover:scale-[1.02] transition-all"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New workflow
        </Button>
      </div>

      {/* ── Feature & Quick Stats Bar ────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Layers, label: '25 Node Types', desc: 'Triggers, ETL, Quality & Export', bg: 'bg-indigo-500/10 text-indigo-600' },
          { icon: Globe, label: 'API Trigger', desc: 'REST API endpoint pipelines', bg: 'bg-violet-500/10 text-violet-600' },
          { icon: Route, label: 'Journey / Workflow', desc: 'Journey & automation driven', bg: 'bg-cyan-500/10 text-cyan-600' },
          { icon: Play, label: 'Pipeline Controls', desc: 'Start · Pause · Stop · Resume', bg: 'bg-emerald-500/10 text-emerald-600' },
        ].map(({ icon: Icon, label, desc, bg }) => (
          <div
            key={label}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold transition-transform group-hover:scale-110 ${bg}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500 truncate">{desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create Modal / Drawer Card ────────────────────────────────────────── */}
      {showCreate && (
        <Card className="overflow-hidden border-indigo-200 shadow-xl transition-all">
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
                <Workflow className="h-5 w-5 text-indigo-100" />
              </div>
              <div>
                <h3 className="font-bold text-base">Create new pipeline workflow</h3>
                <p className="text-xs text-indigo-100">Opens visual canvas editor with {NODE_PALETTE.length} node types</p>
              </div>
            </div>
            <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-white/10 text-indigo-200 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Workflow Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Customer Data ETL Sync"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 font-medium"
                  autoFocus
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Starter Template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white font-medium focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  {PIPELINE_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {templateId === 'blank' && (
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white font-medium focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Pipeline Type Quick-Pick */}
            {templateId === 'blank' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setJobType('api_trigger')}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-left transition-all ${
                    jobType === 'api_trigger'
                      ? 'border-violet-400 bg-violet-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    jobType === 'api_trigger' ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${jobType === 'api_trigger' ? 'text-violet-700' : 'text-slate-700'}`}>API Trigger</p>
                    <p className="text-[10px] text-slate-500">Triggered via REST API</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setJobType('journey_workflow')}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-left transition-all ${
                    jobType === 'journey_workflow'
                      ? 'border-cyan-400 bg-cyan-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    jobType === 'journey_workflow' ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Route className="w-4 h-4" />
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${jobType === 'journey_workflow' ? 'text-cyan-700' : 'text-slate-700'}`}>Journey / Workflow</p>
                    <p className="text-[10px] text-slate-500">Journey or automation driven</p>
                  </div>
                </button>
              </div>
            )}

            {templateId !== 'blank' && (
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>{PIPELINE_TEMPLATES.find((t) => t.id === templateId)?.description}</span>
              </div>
            )}

            {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-xs">
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim()} className="text-xs font-semibold">
                Create & Open Canvas →
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Search & Filter Controls ────────────────────────────────────────── */}
      {jobs && jobs.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows by name or category…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs sm:text-sm focus:bg-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'running', label: 'Running' },
                { id: 'api', label: 'API' },
                { id: 'journey', label: 'Journey' },
                { id: 'scheduled', label: 'Scheduled' },
                { id: 'manual', label: 'Manual' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterTab(t.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  filterTab === t.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Workflows Grid ────────────────────────────────────────── */}
      {filteredJobs.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.map((j) => {
            const graph = getWorkflowGraph(j);
            const nodeCount = graph.nodes.length;
            const jobLabel = JOB_TYPES.find((t) => t.value === j.job_type)?.label ?? j.job_type;
            const history = getRunHistoryForJob(j.id, dbRuns);
            const runsCount = history.length;
            const lastRun = history[0];
            const pipelineStatus = getLiveStatus(j.id);
            const statusConf = LIVE_STATUS_CONFIG[pipelineStatus];
            const typeInfo = getPipelineTypeLabel(j.job_type);

            return (
              <div key={j.id} className="group relative">
                <Card className="h-full overflow-hidden border-slate-200/90 bg-white p-0 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl flex flex-col justify-between">
                  {/* Top Gradient Stripe */}
                  <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 opacity-80 group-hover:opacity-100 transition-opacity" />

                  <div className="p-5 space-y-4">
                    {/* Header Row: Title, Unique ID Badge, Category Badge & Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to={`/data/jobs/${j.id}`} className="block group-hover:text-indigo-600 transition-colors">
                            <h3 className="truncate font-bold text-slate-900 text-base leading-tight">
                              {j.name}
                            </h3>
                          </Link>
                          <span
                            className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80 cursor-pointer select-all hover:bg-slate-200"
                            title={`Unique Workflow ID: ${j.id}`}
                          >
                            #{j.id.length > 8 ? j.id.slice(0, 8) : j.id}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            {jobLabel}
                          </span>
                          {typeInfo.icon !== 'default' && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              typeInfo.icon === 'api' ? 'bg-violet-50 text-violet-700 border-violet-200/60' : 'bg-cyan-50 text-cyan-700 border-cyan-200/60'
                            }`}>
                              {typeInfo.icon === 'api' ? <Globe className="w-3 h-3" /> : <Route className="w-3 h-3" />}
                              {typeInfo.label}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusConf.bg} ${statusConf.text} border-current/20`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot} ${pipelineStatus === 'started' ? 'animate-pulse' : ''}`} />
                            {statusConf.label}
                          </span>
                        </div>
                      </div>

                      {/* Card Menu Button */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === j.id ? null : j.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Workflow actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Dropdown Popup */}
                        {openMenuId === j.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-0 top-8 z-40 w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl text-xs font-medium">
                              <Link
                                to={`/data/jobs/${j.id}`}
                                className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                                Open Canvas
                              </Link>
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleDuplicate(j);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-purple-50 hover:text-purple-600 text-left"
                              >
                                <Copy className="w-3.5 h-3.5 text-purple-500" />
                                Duplicate
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeletingJob({ id: j.id, name: j.name });
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 text-left font-semibold"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                Delete Pipeline
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Real Workflow Execution Status & Performance Panel */}
                    <Link to={`/data/jobs/${j.id}`} className="block">
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 space-y-2.5 transition-colors group-hover:bg-indigo-50/30 group-hover:border-indigo-200">
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="text-xs font-bold text-slate-800">Execution Performance</span>
                          </div>
                          {runsCount > 0 && lastRun ? (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              lastRun.status === 'succeeded' || lastRun.status === 'success'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-red-100 text-red-800 border-red-300'
                            }`}>
                              {lastRun.status === 'succeeded' || lastRun.status === 'success' ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <AlertTriangle className="w-3 h-3 text-red-600" />
                              )}
                              {lastRun.status === 'succeeded' || lastRun.status === 'success' ? 'Succeeded' : 'Failed'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              <Clock className="w-3 h-3 text-slate-400" />
                              Ready (Not run yet)
                            </span>
                          )}
                        </div>

                        {runsCount > 0 && lastRun ? (
                          <RunStatsBlock history={history} runsCount={runsCount} lastRun={lastRun} />
                        ) : (
                          <div className="text-xs text-slate-500 space-y-0.5 py-0.5">
                            <p className="font-semibold text-slate-700 text-[11px]">No execution history recorded yet.</p>
                            <p className="text-[10px] text-slate-400">Click to open canvas and execute pipeline.</p>
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Footer Info Row */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
                        <span>{nodeCount} node{nodeCount === 1 ? '' : 's'}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {j.schedule_cron ? j.schedule_cron : 'Manual Run'}
                      </span>
                    </div>
                  </div>

                  {/* Pipeline Controls Strip */}
                  <div className="bg-slate-50/80 px-5 py-2.5 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {/* Start / Resume */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (pipelineStatus === 'paused') {
                            updateLiveStatus(j.id, 'started');
                          } else {
                            updateLiveStatus(j.id, 'started');
                          }
                        }}
                        disabled={pipelineStatus === 'started'}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                          pipelineStatus === 'started'
                            ? 'bg-emerald-100 text-emerald-500 cursor-not-allowed'
                            : pipelineStatus === 'paused'
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm active:scale-95'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm active:scale-95'
                        }`}
                        title={pipelineStatus === 'paused' ? 'Resume pipeline' : 'Start pipeline'}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{pipelineStatus === 'paused' ? 'Resume' : 'Start'}</span>
                      </button>

                      {/* Pause */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateLiveStatus(j.id, 'paused');
                        }}
                        disabled={pipelineStatus !== 'started'}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                          pipelineStatus !== 'started'
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : pipelineStatus === 'paused'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-amber-500 hover:bg-amber-400 text-white shadow-sm active:scale-95'
                        }`}
                        title="Pause pipeline"
                      >
                        <Pause className="w-3 h-3 fill-current" />
                        <span>Pause</span>
                      </button>

                      {/* Stop */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateLiveStatus(j.id, 'stopped');
                        }}
                        disabled={pipelineStatus !== 'started' && pipelineStatus !== 'paused'}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                          pipelineStatus !== 'started' && pipelineStatus !== 'paused'
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm active:scale-95'
                        }`}
                        title="Stop pipeline"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stop</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <Link
                        to={`/data/jobs/${j.id}`}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                      </Link>
                      <button
                        onClick={() => handleDuplicate(j)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                        title="Duplicate workflow"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingJob({ id: j.id, name: j.name })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete workflow"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <Card className="overflow-hidden p-0 border-indigo-100 shadow-md">
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-8 py-14 text-center text-white">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20 ring-1 ring-indigo-400/30">
              <Sparkles className="h-8 w-8 text-indigo-300" />
            </div>
            <h3 className="mt-6 text-xl font-bold">No workflows found</h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400">
              {searchQuery
                ? `No workflows matched "${searchQuery}". Try clearing your filter or search query.`
                : `Build n8n-style visual workflows with ${NODE_PALETTE.length} node types — triggers, schemas, SQL, transformations, and exports.`}
            </p>
            <div className="mt-8 flex justify-center gap-3">
              {searchQuery && (
                <Button variant="secondary" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              )}
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Create first workflow
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Delete Confirmation Dialog ────────────────────────────────────────── */}
      {deletingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Workflow</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-900 font-semibold">"{deletingJob.name}"</strong>?
              This will erase all canvas nodes, schedule settings, and run logs associated with this pipeline.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setDeletingJob(null)} disabled={isDeleting} className="text-xs">
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirmed} disabled={isDeleting} className="text-xs font-semibold">
                {isDeleting ? 'Deleting…' : 'Delete Pipeline'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Category Pill Colors for Light Theme
function getCategoryPillStyle(category?: string) {
  switch (category) {
    case 'Triggers':
      return { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' };
    case 'Sources':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    case 'Transform':
      return { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' };
    case 'Decisioning':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'AI & Personalization':
      return { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' };
    case 'Actions':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'Control Flow':
      return { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' };
    case 'Monitoring':
      return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  }
}


