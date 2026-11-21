import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Play, Pause, Square, Save, Plus, Trash2, X, Zap,
  CheckCircle2, XCircle, Loader2,
  Maximize2, Minimize2, Search,
  Rocket, FlaskConical,
  ChevronDown, History, GitBranch, UploadCloud,
  AlertTriangle, RotateCcw, Clock, Table2, Filter as FilterIcon,
  Circle, Activity, Copy, FileSpreadsheet, Pause as PauseIcon,
  Sliders, Terminal, Info, Folder, FolderOpen, ChevronRight,
} from 'lucide-react';
import type { Node, Edge } from 'reactflow';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  NODE_PALETTE, NODE_ICONS, NODE_CATEGORIES, NODE_CONFIG_FIELDS,
  defaultConfigForType, configSummary, paletteItem, categoryAccent, validateNodeConfig,
} from '@/lib/data-job-nodes';
import type { NodePaletteItem, NodeCategory } from '@/lib/data-job-nodes';
import {
  parseWorkflowGraph, serializeWorkflowGraph, JOB_TYPES,
} from '@/lib/data-jobs';
import type { WorkflowNodeData } from '@/lib/data-jobs';
import { useStartPipelineRun, usePublishPipelineVersion, usePipelineVersions } from '@/lib/pipeline-runs';
import type { PipelineRunMode } from '@/lib/pipeline-runs';
import { diffPipelineSnapshots, useRestorePipelineVersion } from '@/lib/pipeline-versions';
import { PipelineDiffView } from '@/components/data/PipelineDiffView';
import { fetchForms, getFormPublicUrl } from '@/lib/forms';
import type { MarbeeForm } from '@/lib/forms';
import { validatePipeline, summarizeIssues } from '@/lib/pipeline-validation';
import type { PipelineIssue } from '@/lib/pipeline-validation';
import { cronNext } from '@/lib/cron';
import { CronEditor } from '@/components/data/CronEditor';
import { cn } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';
import { executeNode, resetSeed } from '@/lib/pipeline-engine';
import type { DataRow, PipelineContext } from '@/lib/pipeline-engine';
import { ReadSchemaInspector } from '@/components/data/ReadSchemaInspector';
import { SendEmailActivityConfigurator } from '@/components/channels/SendEmailActivityConfigurator';

// ─── Canvas node / edge types ─────────────────────────────────────────────

type CanvasNode = {
  id: string;
  stepType: string;
  label: string;
  config: Record<string, unknown>;
  x: number;
  y: number;
  disabled?: boolean;
  outputColumns?: string[];
  lastStatus?: 'success' | 'failed';
  lastExecutionTimeMs?: number;
  lastOutput?: unknown;
};

type CanvasEdge = {
  id: string;
  fromId: string;
  toId: string;
  fromHandle?: string;
  label?: string;
};

// ─── Conversions between canvas <-> ReactFlow persistence format ──────────

function rfToCanvas(rfNodes: Node<WorkflowNodeData>[], rfEdges: Edge[]): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = rfNodes.map((n) => ({
    id: n.id,
    stepType: n.data.stepType,
    label: n.data.label,
    config: n.data.config ?? {},
    x: n.position?.x ?? 0,
    y: n.position?.y ?? 0,
    disabled: n.data.disabled,
    outputColumns: (n.data as Record<string, unknown>).outputColumns as string[] | undefined,
  }));
  const edges: CanvasEdge[] = rfEdges.map((e, idx) => ({
    id: e.id ? (rfEdges.findIndex((x) => x.id === e.id) === idx ? e.id : `${e.id}-${idx}`) : `e-${idx}-${Date.now().toString(36)}`,
    fromId: e.source,
    toId: e.target,
    fromHandle: e.sourceHandle ?? undefined,
    label: e.sourceHandle ?? undefined,
  }));
  return { nodes, edges };
}

function canvasToRf(nodes: CanvasNode[], edges: CanvasEdge[]): { rfNodes: Node<WorkflowNodeData>[]; rfEdges: Edge[] } {
  const rfNodes: Node<WorkflowNodeData>[] = nodes.map((n) => ({
    id: n.id,
    type: 'dataJobStep',
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      stepType: n.stepType,
      config: n.config,
      disabled: n.disabled,
      ...(n.outputColumns ? { outputColumns: n.outputColumns } : {}),
    } as WorkflowNodeData,
  }));
  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.fromId,
    target: e.toId,
    sourceHandle: e.fromHandle ?? null,
    targetHandle: null,
  }));
  return { rfNodes, rfEdges };
}

// ─── Canvas geometry ──────────────────────────────────────────────────────

const NODE_W = 240;
const NODE_H = 80;

function getOutputPos(node: CanvasNode, handle?: string): { x: number; y: number } {
  const item = paletteItem(node.stepType);
  if (item?.outputs && handle) {
    const idx = item.outputs.findIndex((o) => o.id === handle);
    const count = item.outputs.length;
    const frac = (idx + 1) / (count + 1);
    return { x: node.x + NODE_W, y: node.y + NODE_H * frac };
  }
  return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
}

function getInputPos(node: CanvasNode): { x: number; y: number } {
  return { x: node.x, y: node.y + NODE_H / 2 };
}

function buildBezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.abs(to.x - from.x) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}


// ─── Blink CSS (shared with automations) ──────────────────────────────────

const BLINK_STYLE_ID = 'pipeline-blink-styles';
function ensureBlinkStyles() {
  if (document.getElementById(BLINK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BLINK_STYLE_ID;
  style.textContent = `
    @keyframes blink-green { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0)} 50%{box-shadow:0 0 12px 4px rgba(34,197,94,0.5)} }
    @keyframes blink-red { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} 50%{box-shadow:0 0 12px 4px rgba(239,68,68,0.5)} }
    .pipe-blink-green { animation: blink-green 0.6s ease-in-out 3; }
    .pipe-blink-red { animation: blink-red 0.6s ease-in-out 3; }
    @keyframes blink-running { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} 50%{box-shadow:0 0 14px 5px rgba(99,102,241,0.45)} }
    .pipe-blink-running { animation: blink-running 0.8s ease-in-out infinite; }
    @keyframes blink-green-loop { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.2)} 50%{box-shadow:0 0 16px 6px rgba(16,185,129,0.75)} }
    .pipe-blink-green-loop { animation: blink-green-loop 1.2s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
}

// (execution engine imported from @/lib/pipeline-engine)

// ─── Color helpers ────────────────────────────────────────────────────────



function catFill(cat: NodeCategory): string {
  return categoryAccent(cat);
}

// ─── Scheduler Next Execution & Countdown Helpers ───────────────────────

const RECURRING_FREQUENCIES = new Set(['every_n_minutes', 'hourly', 'daily', 'weekly', 'monthly', 'weekdays', 'custom_cron']);

function calculateNextRunTime(config: Record<string, unknown>, fromDate: Date = new Date()): Date {
  const freq = (config.frequency as string) || 'daily';
  const runTime = (config.run_time as string) || '02:00';
  const [hours = 2, minutes = 0] = runTime.split(':').map(Number);

  // 1. Custom Cron
  if (freq === 'custom_cron') {
    const expr = (config.cron as string) || (config.schedule_cron as string) || '0 2 * * *';
    const next = cronNext(expr, fromDate);
    if (next && next.getTime() > fromDate.getTime()) return next;
    // Invalid cron — fall back to daily rather than silently misbehaving
    const fb = new Date(fromDate.getTime());
    fb.setHours(hours, minutes, 0, 0);
    if (fb.getTime() <= fromDate.getTime()) fb.setDate(fb.getDate() + 1);
    return fb;
  }

  // 2. Every N Minutes — align to next interval boundary from midnight
  if (freq === 'every_n_minutes') {
    const interval = Math.max(1, Number(config.interval_minutes) || 15);
    const midnight = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const minutesSinceMidnight = Math.floor((fromDate.getTime() - midnight.getTime()) / 60000);
    const nextSlot = (Math.floor(minutesSinceMidnight / interval) + 1) * interval;
    const next = new Date(midnight.getTime() + nextSlot * 60000);
    return next;
  }

  // 3. Hourly
  if (freq === 'hourly') {
    const next = new Date(fromDate.getTime());
    next.setMinutes(minutes, 0, 0);
    if (next.getTime() <= fromDate.getTime()) {
      next.setHours(next.getHours() + 1);
    }
    return next;
  }

  // 4. Weekdays (Mon–Fri)
  if (freq === 'weekdays') {
    const next = new Date(fromDate.getTime());
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= fromDate.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // 5. Weekly
  if (freq === 'weekly') {
    const daysVal = config.days_of_week ?? config.day_of_week;
    const targetDow = Array.isArray(daysVal) ? Number(daysVal[0] ?? 1) : Number(daysVal ?? 1);
    const next = new Date(fromDate.getTime());
    next.setHours(hours, minutes, 0, 0);
    let diffDays = (targetDow - next.getDay() + 7) % 7;
    if (diffDays === 0 && next.getTime() <= fromDate.getTime()) {
      diffDays = 7;
    }
    next.setDate(next.getDate() + diffDays);
    return next;
  }

  // 6. Monthly (handles day overflow — e.g. day 31 in February)
  if (freq === 'monthly') {
    const targetDom = Math.max(1, Math.min(31, Number(config.day_of_month ?? 1)));
    const next = new Date(fromDate.getTime());
    next.setHours(hours, minutes, 0, 0);
    const tryMonth = (m: number) => {
      next.setFullYear(fromDate.getFullYear(), m, 1);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(targetDom, lastDay));
      next.setHours(hours, minutes, 0, 0);
    };
    tryMonth(fromDate.getMonth());
    if (next.getTime() <= fromDate.getTime()) {
      tryMonth(fromDate.getMonth() + 1);
    }
    return next;
  }

  // 7. Once — use start_date if provided, otherwise next occurrence of run_time
  if (freq === 'once') {
    if (config.start_date) {
      const sd = new Date(config.start_date as string);
      if (!isNaN(sd.getTime())) {
        sd.setHours(hours, minutes, 0, 0);
        if (sd.getTime() > fromDate.getTime()) return sd;
      }
    }
    const next = new Date(fromDate.getTime());
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= fromDate.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // 8. Daily (default)
  const next = new Date(fromDate.getTime());
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= fromDate.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getPendingBreakdown(diffMs: number) {
  if (diffMs <= 0) {
    return {
      years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0,
      formatted: 'Executing now...',
      fullFormatted: '0y 0m 0d 0h 0m 0s',
    };
  }
  let totalSec = Math.floor(diffMs / 1000);
  const seconds = totalSec % 60;
  let totalMin = Math.floor(totalSec / 60);
  const minutes = totalMin % 60;
  let totalHours = Math.floor(totalMin / 60);
  const hours = totalHours % 24;
  let totalDays = Math.floor(totalHours / 24);
  const years = Math.floor(totalDays / 365);
  const remDays = totalDays % 365;
  const months = Math.floor(remDays / 30);
  const days = remDays % 30;

  const fullFormatted = `${years}y ${months}m ${days}d ${hours}h ${minutes}m ${seconds}s`;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0 || years > 0) parts.push(`${months}m`);
  if (days > 0 || months > 0 || years > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0 || months > 0 || years > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0 || months > 0 || years > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return {
    years,
    months,
    days,
    hours,
    minutes,
    seconds,
    formatted: parts.join(' '),
    fullFormatted,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

type PageTab = 'workflow' | 'schedule' | 'versions';

type LiveStatus = 'draft' | 'started' | 'start_requested' | 'stop_requested' | 'paused' | 'finished';

const STATUS_CONFIG: Record<LiveStatus, { bg: string; text: string; label: string; iconClass?: string; spin?: boolean }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' },
  start_requested: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Start Requested', iconClass: 'loader', spin: true },
  started: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Started', iconClass: 'loader', spin: true },
  stop_requested: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Stop Requested', iconClass: 'loader', spin: true },
  paused: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Paused', iconClass: 'pause' },
  finished: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Finished', iconClass: 'check' },
};

function StatusBadge({ liveStatus }: { liveStatus: LiveStatus }) {
  const s = STATUS_CONFIG[liveStatus];
  const icon = s.iconClass === 'loader' ? <Loader2 className={cn('w-3 h-3', s.spin && 'animate-spin')} />
    : s.iconClass === 'pause' ? <Pause className="w-3 h-3" />
    : s.iconClass === 'check' ? <CheckCircle2 className="w-3 h-3" />
    : null;
  return (
    <span className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium', s.bg, s.text)}>
      {icon} {s.label}
    </span>
  );
}

// ─── Log Purge (7-Day Retention Policy) & Run Persistence ─────────────────

async function purge7DayLogs(jobId?: string) {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('data_job_run_logs').delete().lt('logged_at', sevenDaysAgo);
    if (jobId) {
      await supabase.from('data_job_runs').delete().eq('job_id', jobId).lt('queued_at', sevenDaysAgo);
    } else {
      await supabase.from('data_job_runs').delete().lt('queued_at', sevenDaysAgo);
    }
  } catch (err) {
    console.warn('[AutoPurge] 7-day log purge note:', err);
  }
}

async function persistExecutionRunAndPurgeLogs(
  jobId: string,
  tenantId: string | null,
  environment: string,
  versionNumber: number,
  status: 'succeeded' | 'failed' | 'partial',
  logs: { nodeId: string; title: string; status: string; ms: number; output: unknown }[],
  triggeredBy: string = 'Naman',
  triggerSource: 'manual' | 'schedule' | 'webhook' = 'manual'
) {
  try {
    await purge7DayLogs(jobId);

    const { data: run } = await supabase
      .from('data_job_runs')
      .insert({
        job_id: jobId,
        tenant_id: tenantId ?? undefined,
        environment: environment || 'production',
        version_number: versionNumber || 1,
        status,
        trigger_source: triggerSource,
        triggered_by: triggeredBy,
        run_mode: 'full',
        records_processed: logs.reduce((acc, l) => acc + Number((l.output as Record<string, unknown>)?.rows_out ?? 0), 0),
        records_failed: logs.reduce((acc, l) => acc + Number((l.output as Record<string, unknown>)?.rows_error ?? 0), 0),
        queued_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (run?.id && logs.length > 0) {
      const logEntries = logs.map((l) => ({
        run_id: run.id,
        node_id: l.nodeId,
        level: l.status === 'success' ? ('info' as const) : ('error' as const),
        message: `[${triggeredBy}] Node "${l.title}" executed (${l.status}) in ${l.ms}ms`,
        context: l.output,
        logged_at: new Date().toISOString(),
      }));
      await supabase.from('data_job_run_logs').insert(logEntries);
    }
  } catch (err) {
    console.warn('[ExecutionLog] Persist / Purge note:', err);
  }
}

export function DataJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId, environment, displayName, user } = useAuth();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Page-level state ───────────────────────────────────────────────
  const [pageTab, setPageTab] = useState<PageTab>('workflow');

  // ─── Canvas state ───────────────────────────────────────────────────
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const selectedNodesRef = useRef<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'params' | 'output'>('params');
  const [isEmailStudioOpen, setIsEmailStudioOpen] = useState(false);
  const clipboardRef = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null);
  const multiDragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const isSelectingBoxRef = useRef(false);

  // Keep ref in sync for use in event handlers (avoids stale closures)
  selectedNodesRef.current = selectedNodes;

  // Pan/zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Node drag
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

  // Edge draw & reconnect
  const [drawingEdge, setDrawingEdge] = useState<{ fromId: string; fromHandle?: string; x: number; y: number } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [reconnectingEdge, setReconnectingEdge] = useState<{ edgeId: string; fromId: string; fromHandle?: string; toId: string; label?: string } | null>(null);

  // Edge data preview (right-click)
  const [edgeDataPreview, setEdgeDataPreview] = useState<{ edgeId: string; screenX: number; screenY: number } | null>(null);
  const [edgeDataModal, setEdgeDataModal] = useState<{ fromNodeId: string; toNodeId: string; fromHandle?: string } | null>(null);
  const [dataModalPage, setDataModalPage] = useState(0);
  const [dataModalSort, setDataModalSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [dataModalFilter, setDataModalFilter] = useState('');
  const [dataFilterRules, setDataFilterRules] = useState<{ id: number; col: string; op: string; val: string }[]>([]);
  const [dataFilterLogic, setDataFilterLogic] = useState<'and' | 'or'>('and');
  const [dataFilterOpen, setDataFilterOpen] = useState(false);
  const [logPage, setLogPage] = useState(0);
  const [logSort, setLogSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [logFilter, setLogFilter] = useState('');
  const nodeDataRef = useRef<Map<string, DataRow[]>>(new Map());
  const reconnectHandledRef = useRef(false);

  // Execution
  const [executing, setExecuting] = useState(false);
  const executingRef = useRef(false);
  const [executedNodes, setExecutedNodes] = useState<Set<string>>(new Set());
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<{ nodeId: string; title: string; status: string; ms: number; output: unknown }[]>([]);
  const [runHistory, setRunHistory] = useState<{
    id: string;
    runNumber?: number;
    triggeredBy?: string;
    triggerSource?: string;
    startedAtFormatted?: string;
    timestamp: string;
    date: string;
    status: string;
    version: number;
    logs: { nodeId: string; title: string; status: string; ms: number; output: unknown }[];
  }[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('latest');
  const [logOpen, setLogOpen] = useState(false);
  const [blinkingNodes, setBlinkingNodes] = useState<Record<string, 'green' | 'red'>>({});

  // Title edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Test mode
  const [testMode, setTestMode] = useState(true);
  const [liveStatus, setLiveStatusRaw] = useState<LiveStatus>(() => {
    if (!id) return 'draft';
    try {
      const saved = localStorage.getItem(`pipeline_live_status_${id}`);
      if (saved === 'started' || saved === 'paused') return saved;
    } catch {}
    return 'draft';
  });
  const setLiveStatus = useCallback((s: LiveStatus | ((prev: LiveStatus) => LiveStatus)) => {
    setLiveStatusRaw(prev => {
      const next = typeof s === 'function' ? s(prev) : s;
      try { localStorage.setItem(`pipeline_live_status_${id}`, next); } catch {}
      if (id) {
        supabase.from('data_jobs').update({ pipeline_status: next }).eq('id', id).then(() => {});
      }
      return next;
    });
  }, [id]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [, setLastSavedAt] = useState<string | null>(null);
  const [scheduleTriggered, setScheduleTriggered] = useState(false);

  // Canvas is read-only while pipeline is running or paused
  const isRunning = liveStatus === 'started' || liveStatus === 'start_requested' || liveStatus === 'paused' || liveStatus === 'stop_requested';

  // Live ticker for schedule countdown (ticks every second)
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const schedNode = useMemo(() => nodes.find((n) => n.stepType === 'trigger_schedule'), [nodes]);

  const scheduledNextRun = useMemo(() => {
    if (!schedNode) return null;
    return calculateNextRunTime(schedNode.config as Record<string, unknown>);
  }, [schedNode?.config, scheduleTriggered]);

  const pendingDiffMs = scheduledNextRun ? Math.max(0, scheduledNextRun.getTime() - currentTime) : 0;
  const pendingBreakdown = getPendingBreakdown(pendingDiffMs);

  // Save / run messages
  const [saveMsg, setSaveMsg] = useState('');
  const [runMsg, setRunMsg] = useState('');

  // Schedule
  const [scheduleCron, setScheduleCron] = useState('');
  const [scheduleTz, setScheduleTz] = useState('UTC');
  const [alertWebhook, setAlertWebhook] = useState('');
  const [alertOn, setAlertOn] = useState<string[]>(['failed']);

  // Validation
  const [issues, setIssues] = useState<PipelineIssue[]>([]);

  useEffect(() => { ensureBlinkStyles(); }, []);

  // ─── Load job from Supabase ─────────────────────────────────────────

  const { data: job, isLoading } = useQuery({
    queryKey: ['data-job', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('data_jobs').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });

  // Campaign context: a pipeline owned by a campaign navigates back to it (Campaigns → Campaign → Workflow).
  const [searchParams] = useSearchParams();
  const parentCampaignId = ((job as Record<string, unknown> | null | undefined)?.campaign_id as string | null) ?? searchParams.get('campaign');
  const { data: parentCampaign } = useQuery({
    queryKey: ['pipeline-parent-campaign', parentCampaignId],
    queryFn: async () => {
      const { data } = await supabase.from('journeys').select('id, name').eq('id', parentCampaignId!).maybeSingle();
      return data as { id: string; name: string } | null;
    },
    enabled: Boolean(parentCampaignId),
  });
  const backHref = parentCampaign ? `/campaigns/${parentCampaign.id}?tab=workflows` : '/data/jobs';

  useEffect(() => {
    if (!job) {
      // Try loading from localStorage draft
      if (id) {
        try {
          const draft = localStorage.getItem(`data_job_draft_${id}`);
          if (draft) {
            const parsed = JSON.parse(draft);
            if (parsed.workflow_json) {
              const graph = parseWorkflowGraph(parsed.workflow_json);
              const { nodes: cn, edges: ce } = rfToCanvas(graph.nodes, graph.edges);
              if (cn.length > 0) { const nids = new Set(cn.map((n) => n.id)); setNodes(cn); setEdges(ce.filter((e) => nids.has(e.fromId) && nids.has(e.toId))); }
            }
          }
        } catch {}
      }
      return;
    }
    // Prefer localStorage draft if newer than DB
    let useDb = true;
    if (id) {
      try {
        const draft = localStorage.getItem(`data_job_draft_${id}`);
        if (draft) {
          const parsed = JSON.parse(draft);
          if (parsed.updated_at && job.updated_at && new Date(parsed.updated_at) > new Date(job.updated_at as string)) {
            const graph = parseWorkflowGraph(parsed.workflow_json);
            const { nodes: cn, edges: ce } = rfToCanvas(graph.nodes, graph.edges);
            if (cn.length > 0) { const nids = new Set(cn.map((n) => n.id)); setNodes(cn); setEdges(ce.filter((e) => nids.has(e.fromId) && nids.has(e.toId))); useDb = false; }
          }
        }
      } catch {}
    }
    if (useDb) {
      const graph = parseWorkflowGraph(job.workflow_json);
      const { nodes: cn, edges: ce } = rfToCanvas(graph.nodes, graph.edges);
      const nodeIds = new Set(cn.map((n) => n.id));
      setNodes(cn);
      setEdges(ce.filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId)));
    }
    setScheduleCron(job.schedule_cron ?? '');
    setScheduleTz(job.schedule_tz ?? 'UTC');
    const ac = (job.alert_config ?? {}) as { on?: string[]; webhook?: string };
    setAlertWebhook(ac.webhook ?? '');
    setAlertOn(Array.isArray(ac.on) ? ac.on : ['failed']);
    setTestMode(job.status !== 'active');
    // Initialize pipeline status from DB (authoritative source)
    const dbStatus = (job as Record<string, unknown>).pipeline_status as LiveStatus | undefined;
    if (dbStatus && ['draft', 'started', 'paused', 'finished'].includes(dbStatus)) {
      setLiveStatusRaw(dbStatus);
      try { localStorage.setItem(`pipeline_live_status_${id}`, dbStatus); } catch {}
    }
  }, [job]);

  // Restore execution logs & run history from localStorage
  useEffect(() => {
    if (!id) return;
    try {
      // Check if workflow was actively running (started/paused) — don't override with 'finished'
      const persistedStatus = localStorage.getItem(`pipeline_live_status_${id}`);
      const wasActive = persistedStatus === 'started' || persistedStatus === 'paused';

      const savedHistory = localStorage.getItem(`data_job_run_history_${id}`);
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory) && parsedHistory.length > 0) {
          setRunHistory(parsedHistory);
          setSelectedRunId(parsedHistory[0].id);
          setExecutionLog(parsedHistory[0].logs ?? []);
          setExecutedNodes(new Set((parsedHistory[0].logs ?? []).map((l: { nodeId: string }) => l.nodeId)));
          if (!wasActive) setLiveStatus('finished');
          return;
        }
      }
      const savedLogs = localStorage.getItem(`data_job_exec_log_${id}`);
      if (savedLogs) {
        const parsed = JSON.parse(savedLogs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setExecutionLog(parsed);
          setExecutedNodes(new Set(parsed.map((l: { nodeId: string }) => l.nodeId)));
          if (!wasActive) setLiveStatus('finished');
        }
      }
    } catch {}
  }, [id]);

  // Sync execution status onto node cards whenever execution log updates or restores
  useEffect(() => {
    if (!executionLog || executionLog.length === 0) return;
    const statusMap = new Map<string, { status: 'success' | 'failed'; ms: number; output: unknown }>();
    const executed = new Set<string>();
    executionLog.forEach((l) => {
      executed.add(l.nodeId);
      statusMap.set(l.nodeId, {
        status: l.status === 'failed' ? 'failed' : 'success',
        ms: l.ms ?? 0,
        output: l.output,
      });
    });

    setExecutedNodes(executed);

    setNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        const info = statusMap.get(n.id);
        if (info && (n.lastStatus !== info.status || n.lastExecutionTimeMs !== info.ms)) {
          changed = true;
          return { ...n, lastStatus: info.status, lastExecutionTimeMs: info.ms, lastOutput: info.output };
        }
        return n;
      });
      return changed ? next : prev;
    });
  }, [executionLog, nodes.length]);

  // Run validation whenever graph changes + mark unsaved
  useEffect(() => {
    const { rfNodes, rfEdges } = canvasToRf(nodes, edges);
    setIssues(validatePipeline(rfNodes, rfEdges));
    if (job) setHasUnsavedChanges(true);
  }, [nodes, edges]);

  const { errors, warnings } = summarizeIssues(issues);

  // Fullscreen listeners
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // ─── Supabase mutations ─────────────────────────────────────────────

  const saveWorkflow = useMutation({
    mutationFn: async () => {
      const { rfNodes, rfEdges } = canvasToRf(nodes, edges);
      const payload = {
        name: titleDraft || job?.name || 'Untitled',
        workflow_json: serializeWorkflowGraph(rfNodes, rfEdges),
        schedule_cron: scheduleCron || null,
        schedule_tz: scheduleTz,
        alert_config: { on: alertOn, webhook: alertWebhook },
        pipeline_status: liveStatus,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('data_jobs')
        .update(payload)
        .eq('id', id!);
      if (error) {
        // Fallback: persist to localStorage so work isn't lost
        try { localStorage.setItem(`data_job_draft_${id}`, JSON.stringify(payload)); } catch {}
        throw error;
      }
      // Also keep localStorage draft in sync
      try { localStorage.setItem(`data_job_draft_${id}`, JSON.stringify(payload)); } catch {}
    },
    onSuccess: () => {
      const allWarnings = nodes.flatMap((n) => validateNodeConfig(n.stepType, n.config).map((msg) => `${n.label}: ${msg}`));
      setSaveMsg(allWarnings.length ? `Saved (${allWarnings.length} warning${allWarnings.length > 1 ? 's' : ''})` : 'Saved');
      setHasUnsavedChanges(false);
      setLastSavedAt(new Date().toISOString());
      setTimeout(() => setSaveMsg(''), allWarnings.length ? 4000 : 2500);
      queryClient.invalidateQueries({ queryKey: ['data-job', id] });
      queryClient.invalidateQueries({ queryKey: ['data-jobs'] });
    },
    onError: (err) => {
      // Still saved to localStorage — show success with caveat
      setSaveMsg('Saved locally');
      setTimeout(() => setSaveMsg(''), 3000);
      console.warn('[SaveWorkflow] DB save failed, persisted to localStorage:', err);
    },
  });

  const startRun = useStartPipelineRun();
  const publishVersion = usePublishPipelineVersion(id);

  const runJob = useMutation({
    mutationFn: async (opts: { mode: PipelineRunMode; untilNodeId?: string | null }) => {
      await saveWorkflow.mutateAsync();
      if (!tenantId || !id) throw new Error('Missing tenant or job');
      return startRun.mutateAsync({
        jobId: id,
        tenantId,
        environment,
        currentVersion: (job?.current_version as number | undefined) ?? 0,
        mode: opts.mode,
        untilNodeId: opts.untilNodeId ?? null,
      });
    },
    onSuccess: (run) => {
      setRunMsg('Run queued');
      queryClient.invalidateQueries({ queryKey: ['data-job-runs', id] });
      navigate(`/data/runs/${run.id}`);
    },
  });


  // ─── Canvas pan ─────────────────────────────────────────────────────

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.group') || target.closest('button') || target.closest('input') || target.closest('select')) return;
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.preventDefault();
    } else if (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      // Shift/Ctrl+click: selection box
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        setSelectionBox({ startX: cx, startY: cy, currentX: cx, currentY: cy });
        isSelectingBoxRef.current = true;
      }
    } else if (e.button === 0) {
      // Left-click on empty canvas: pan (grab & move)
      if (document.body.getAttribute('data-email-studio-active') === 'true') return;
      setSelectedNode(null);
      setSelectedNodes(new Set());
      selectedNodesRef.current = new Set();
      setInspectorOpen(false);
      setIsPanning(true);
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }
    if (isSelectingBoxRef.current && selectionBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        const curBox = { ...selectionBox, currentX: cx, currentY: cy };
        setSelectionBox(curBox);

        const x1 = Math.min(curBox.startX, curBox.currentX);
        const x2 = Math.max(curBox.startX, curBox.currentX);
        const y1 = Math.min(curBox.startY, curBox.currentY);
        const y2 = Math.max(curBox.startY, curBox.currentY);

        if (Math.abs(curBox.currentX - curBox.startX) > 2 || Math.abs(curBox.currentY - curBox.startY) > 2) {
          const selected = new Set<string>();
          nodes.forEach((n) => {
            const nX1 = n.x;
            const nX2 = n.x + NODE_W;
            const nY1 = n.y;
            const nY2 = n.y + NODE_H;
            if (nX1 < x2 && nX2 > x1 && nY1 < y2 && nY2 > y1) {
              selected.add(n.id);
            }
          });
          setSelectedNodes(selected);
          selectedNodesRef.current = selected;
          if (selected.size === 1) {
            setSelectedNode(Array.from(selected)[0]);
          } else if (selected.size === 0) {
            setSelectedNode(null);
          }
        }
      }
      return;
    }
    if (draggingNode) {
      const dx = (e.clientX - dragStartRef.current.x) / zoom;
      const dy = (e.clientY - dragStartRef.current.y) / zoom;
      const starts = multiDragStartRef.current;
      if (starts.size > 1) {
        // Group drag — move all selected nodes freely
        setNodes((prev) => prev.map((n) => {
          const s = starts.get(n.id);
          if (s) return { ...n, x: Math.round(s.x + dx), y: Math.round(s.y + dy) };
          return n;
        }));
      } else {
        setNodes((prev) => prev.map((n) => n.id === draggingNode ? { ...n, x: Math.round(dragStartRef.current.nodeX + dx), y: Math.round(dragStartRef.current.nodeY + dy) } : n));
      }
      return;
    }
    if (drawingEdge || reconnectingEdge) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        if (drawingEdge) setDrawingEdge((prev) => prev ? { ...prev, x: cx, y: cy } : null);
        if (reconnectingEdge) setDrawingEdge({ fromId: reconnectingEdge.fromId, fromHandle: reconnectingEdge.fromHandle, x: cx, y: cy });
      }
    }
  }, [selectionBox, nodes, draggingNode, drawingEdge, reconnectingEdge, zoom, pan]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    isPanningRef.current = false;
    setDraggingNode(null);
    if (reconnectingEdge && !reconnectHandledRef.current) {
      // User released in empty space — disconnect (delete the edge)
    }
    reconnectHandledRef.current = false;
    setReconnectingEdge(null);
    setDrawingEdge(null);
    if (isSelectingBoxRef.current) {
      isSelectingBoxRef.current = false;
      setSelectionBox(null);
    }
  }, [reconnectingEdge]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Touchpad pinch zoom or Ctrl+wheel
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom((z) => Math.min(2, Math.max(0.25, z + delta)));
    } else {
      // Touchpad 2-finger scroll or wheel panning
      setPan((p) => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY,
      }));
    }
  }, []);

  // ─── Node interactions ──────────────────────────────────────────────

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    canvasRef.current?.focus();
    const cur = selectedNodesRef.current;
    let nextSel: Set<string>;
    if (e.ctrlKey || e.metaKey) {
      nextSel = new Set(cur);
      if (nextSel.has(nodeId)) nextSel.delete(nodeId);
      else nextSel.add(nodeId);
      setSelectedNodes(nextSel);
      if (!cur.has(nodeId)) { setSelectedNode(nodeId); }
    } else {
      if (!cur.has(nodeId)) {
        nextSel = new Set([nodeId]);
        setSelectedNodes(nextSel);
      } else {
        nextSel = cur;
      }
      setSelectedNode(nodeId);
    }
    selectedNodesRef.current = nextSel;
    setDraggingNode(nodeId);
    const node = nodes.find((n) => n.id === nodeId)!;
    dragStartRef.current = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y };
    const starts = new Map<string, { x: number; y: number }>();
    nodes.forEach((n) => { if (nextSel.has(n.id)) starts.set(n.id, { x: n.x, y: n.y }); });
    multiDragStartRef.current = starts;
  };

  const handleInputMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (isRunning) return;
    const incomingEdges = edges.filter((ed) => ed.toId === nodeId);
    if (incomingEdges.length > 0) {
      const edge = incomingEdges[incomingEdges.length - 1];
      handleEdgeGrab(e, edge);
    }
  };

  const handleOutputMouseDown = (e: React.MouseEvent, nodeId: string, handle?: string) => {
    e.stopPropagation();
    if (isRunning) return;
    const outgoing = edges.filter((ed) => ed.fromId === nodeId && ed.fromHandle === handle);
    if (outgoing.length > 0) {
      const edge = outgoing[outgoing.length - 1];
      handleEdgeGrab(e, edge);
      return;
    }
    const node = nodes.find((n) => n.id === nodeId)!;
    const pos = getOutputPos(node, handle);
    setDrawingEdge({ fromId: nodeId, fromHandle: handle, x: pos.x, y: pos.y });
  };

  const handleNodeMouseUp = useCallback((nodeId: string) => {
    if (drawingEdge && drawingEdge.fromId !== nodeId) {
      setEdges((prev) => {
        const exists = prev.some((e) => e.fromId === drawingEdge.fromId && e.toId === nodeId && e.fromHandle === drawingEdge.fromHandle);
        if (exists) return prev;
        const newEdge: CanvasEdge = {
          id: `e-${Date.now().toString(36)}`,
          fromId: drawingEdge.fromId,
          toId: nodeId,
          fromHandle: drawingEdge.fromHandle,
          label: drawingEdge.fromHandle,
        };
        return [...prev, newEdge];
      });
      reconnectHandledRef.current = true;
      setReconnectingEdge(null);
    }
    setDrawingEdge(null);
  }, [drawingEdge]);

  const handleEdgeGrab = (e: React.MouseEvent, edge: CanvasEdge) => {
    e.stopPropagation();
    setEdges((prev) => prev.filter((ed) => ed.id !== edge.id));
    setReconnectingEdge({ edgeId: edge.id, fromId: edge.fromId, fromHandle: edge.fromHandle, toId: edge.toId, label: edge.label });
    const fromNode = nodes.find((n) => n.id === edge.fromId);
    if (fromNode) {
      const pos = getOutputPos(fromNode, edge.fromHandle);
      setDrawingEdge({ fromId: edge.fromId, fromHandle: edge.fromHandle, x: pos.x, y: pos.y });
    }
  };

  // ─── Add / delete node ──────────────────────────────────────────────

  const addNode = (item: NodePaletteItem) => {
    if (isRunning) return;
    const cx = canvasRef.current ? canvasRef.current.clientWidth / 2 : 400;
    const cy = canvasRef.current ? canvasRef.current.clientHeight / 2 : 300;
    const node: CanvasNode = {
      id: `n-${Date.now().toString(36)}`,
      stepType: item.type,
      label: item.label,
      config: defaultConfigForType(item.type),
      x: Math.round((cx - pan.x) / zoom - NODE_W / 2),
      y: Math.round((cy - pan.y) / zoom - NODE_H / 2),
    };
    setNodes((prev) => [...prev, node]);
    setSelectedNode(node.id);
    setInspectorOpen(true);
    setPaletteOpen(false);
    setPaletteSearch('');
  };

  const deleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.fromId !== nodeId && e.toId !== nodeId));
    setSelectedNodes((prev) => { const next = new Set(prev); next.delete(nodeId); return next; });
    if (selectedNode === nodeId) { setSelectedNode(null); setInspectorOpen(false); }
    if (drawingEdge?.fromId === nodeId) setDrawingEdge(null);
    if (reconnectingEdge?.fromId === nodeId) setReconnectingEdge(null);
    setHoveredEdge(null);
  };

  const getActiveSelection = (): Set<string> => {
    const sel = selectedNodesRef.current;
    if (sel.size > 0) return sel;
    if (selectedNode) return new Set([selectedNode]);
    return new Set();
  };

  const deleteSelectedNodes = () => {
    const ids = getActiveSelection();
    if (ids.size === 0) return;
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    setEdges((prev) => prev.filter((e) => !ids.has(e.fromId) && !ids.has(e.toId)));
    setSelectedNodes(new Set());
    selectedNodesRef.current = new Set();
    setSelectedNode(null);
    setInspectorOpen(false);
  };

  const copySelectedNodes = () => {
    const ids = getActiveSelection();
    if (ids.size === 0) return;
    const copiedNodes = nodes.filter((n) => ids.has(n.id));
    const copiedEdges = edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));
    clipboardRef.current = { nodes: copiedNodes, edges: copiedEdges };
  };

  const pasteNodes = () => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    const idMap = new Map<string, string>();
    const newNodes = clip.nodes.map((n) => {
      const newId = `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      idMap.set(n.id, newId);
      return { ...n, id: newId, x: n.x + 40, y: n.y + 40 };
    });
    const newEdges = clip.edges.map((e) => ({
      ...e,
      id: `e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      fromId: idMap.get(e.fromId) ?? e.fromId,
      toId: idMap.get(e.toId) ?? e.toId,
    })).filter((e) => idMap.has(e.fromId) || clip.nodes.some((n) => n.id === e.fromId));
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    const newIds = new Set(newNodes.map((n) => n.id));
    setSelectedNodes(newIds);
    selectedNodesRef.current = newIds;
    setSelectedNode(newNodes[0]?.id ?? null);
  };

  // ─── Global Keyboard Shortcuts (Ctrl+A, Ctrl+X, Ctrl+C, Ctrl+V, Delete) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.body.getAttribute('data-email-studio-active') === 'true' || isEmailStudioOpen) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (isRunning) return;

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl + A -> Select All
      if (isMod && key === 'a') {
        e.preventDefault();
        if (nodes.length > 0) {
          const allIds = new Set(nodes.map((n) => n.id));
          setSelectedNodes(allIds);
          selectedNodesRef.current = allIds;
          setSelectedNode(nodes[0].id);
        }
        return;
      }

      // Ctrl + X -> Cut
      if (isMod && key === 'x') {
        e.preventDefault();
        const sel = getActiveSelection();
        if (sel.size > 0) {
          copySelectedNodes();
          deleteSelectedNodes();
        }
        return;
      }

      // Ctrl + C -> Copy
      if (isMod && key === 'c') {
        e.preventDefault();
        copySelectedNodes();
        return;
      }

      // Ctrl + V -> Paste
      if (isMod && key === 'v') {
        e.preventDefault();
        pasteNodes();
        return;
      }

      // Delete / Backspace -> Delete Selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedNodes();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, isRunning, selectedNode]);

  // ─── Execution with blink ──────────────────────────────────────────

  const runTest = async () => {
    if (nodes.length === 0 || executingRef.current) return;
    executingRef.current = true;
    setExecuting(true);
    setExecutedNodes(new Set());
    setExecutionLog([]);
    setBlinkingNodes({});
    setLogOpen(true);
    setNodes((prev) => prev.map((n) => ({ ...n, lastOutput: undefined, lastStatus: undefined, lastExecutionTimeMs: undefined })));

    // Reset PRNG seed so every test run produces identical data
    resetSeed(42);

    // Build pipeline context for real DB queries — include trigger payload if available
    const pipelineCtx: PipelineContext | undefined = tenantId
      ? { supabase, tenantId, environment, triggerPayload: triggerPayloadRef.current ?? undefined }
      : undefined;

    // Accumulated logs buffer for persistent state and DB storing
    const accumulatedLogs: { nodeId: string; title: string; status: string; ms: number; output: unknown }[] = [];

    // Data buffer: each node's output rows keyed by node id
    nodeDataRef.current.clear();
    const nodeData = nodeDataRef.current;

    try {
    // Topological BFS — start from triggers/sources
    const triggers = nodes.filter((n) => n.stepType.startsWith('trigger') || n.stepType.startsWith('source'));
    const starts = triggers.length > 0 ? triggers : [nodes[0]];
    const visited = new Set<string>();
    const queue = [...starts.map((n) => n.id)];

    // Track inbound edges per node for merging multiple inputs
    const inboundEdges = new Map<string, string[]>();
    edges.forEach((e) => {
      if (!inboundEdges.has(e.toId)) inboundEdges.set(e.toId, []);
      inboundEdges.get(e.toId)!.push(e.fromId);
    });

    const requeueCount = new Map<string, number>();
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;

      // Check all inbound parents have been visited (except for start nodes)
      const parents = inboundEdges.get(cur) ?? [];
      if (parents.length > 0 && !parents.every((p) => visited.has(p))) {
        const count = (requeueCount.get(cur) ?? 0) + 1;
        requeueCount.set(cur, count);
        if (count < nodes.length * 2) {
          queue.push(cur);
        }
        continue;
      }

      visited.add(cur);
      const node = nodes.find((n) => n.id === cur);
      if (!node || node.disabled) continue;

      // Collect input data from inbound edges (deduplicate by data key to prevent double-counting)
      let inputRows: DataRow[] = [];
      const allInputs: Record<string, DataRow[]> = {};
      const inboundEdgesList = edges.filter((e) => e.toId === cur);
      const seenDataKeys = new Set<string>();
      for (const edge of inboundEdgesList) {
        const dataKey = edge.fromHandle ? `${edge.fromId}:${edge.fromHandle}` : edge.fromId;
        if (seenDataKeys.has(dataKey)) continue;
        seenDataKeys.add(dataKey);
        const parentRows = nodeData.get(dataKey) ?? nodeData.get(edge.fromId) ?? [];
        allInputs[edge.fromId] = parentRows;
        inputRows = inputRows.concat(parentRows);
      }

      setExecutingNodeId(cur);
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));

      const result = await executeNode(node.stepType, node.config, inputRows, node.label, pipelineCtx, allInputs);

      // Store output data for downstream nodes
      const outputData = (result.output.data as DataRow[]) ?? [];
      nodeData.set(cur, outputData);

      // Store branch-specific data if node has branches
      if (result.branches) {
        Object.entries(result.branches).forEach(([handle, rows]) => {
          nodeData.set(`${cur}:${handle}`, rows as DataRow[]);
        });
      }

      // Update node state (strip data array from lastOutput to keep UI lean)
      const branchCounts: Record<string, number> = {};
      if (result.branches) {
        Object.entries(result.branches).forEach(([handle, rows]) => {
          branchCounts[handle] = (rows as DataRow[]).length;
        });
      }
      const outCols = outputData.length > 0 ? Object.keys(outputData[0]).filter((k) => !k.startsWith('_')) : undefined;
      const outputForUI = { ...result.output, data: undefined, error_rows: undefined, branch_counts: Object.keys(branchCounts).length > 0 ? branchCounts : undefined, columns: outCols };
      const logEntry = { nodeId: cur, title: node.label, status: result.status, ms: result.executionTimeMs, output: outputForUI };
      accumulatedLogs.push(logEntry);

      setNodes((prev) => prev.map((n) => n.id === cur ? { ...n, outputColumns: outCols ?? n.outputColumns, lastOutput: outputForUI, lastStatus: result.status, lastExecutionTimeMs: result.executionTimeMs } : n));
      setExecutedNodes((prev) => new Set([...prev, cur]));
      setExecutionLog((prev) => [...prev, logEntry]);
      setBlinkingNodes((prev) => ({ ...prev, [cur]: result.status === 'success' ? 'green' : 'red' }));
      setTimeout(() => { setBlinkingNodes((prev) => { const next = { ...prev }; delete next[cur]; return next; }); }, 2000);

      if (result.status === 'success') {
        const downstream = edges.filter((e) => e.fromId === cur).map((e) => e.toId);
        downstream.forEach((id) => { if (!visited.has(id)) queue.push(id); });
      }
    }
    } finally {
    setExecutingNodeId(null);
    setExecuting(false);
    executingRef.current = false;
    }

    const hasError = accumulatedLogs.some((l) => l.status === 'failed');
    const runStatus = hasError ? 'failed' : 'succeeded';
    const userTriggeredBy = displayName || (user?.email ? user.email.split('@')[0] : 'Naman');
    const currentRunNum = (runHistory.length || 0) + 1;
    const nowFormatted = new Date().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Save run history entry for multi-run log inspection
    const newRunEntry = {
      id: `run-${Date.now()}`,
      runNumber: currentRunNum,
      triggeredBy: userTriggeredBy,
      triggerSource: schedFiringRef.current ? 'schedule' : triggerPayloadRef.current ? 'trigger' : 'manual',
      startedAtFormatted: nowFormatted,
      timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      status: runStatus,
      version: job?.current_version ?? 1,
      logs: accumulatedLogs,
    };

    setRunHistory((prev) => [newRunEntry, ...prev]);
    setSelectedRunId(newRunEntry.id);

    // Save execution log & run history to localStorage
    if (id) {
      try {
        const savedHistoryStr = localStorage.getItem(`data_job_run_history_${id}`);
        const existingHistory = savedHistoryStr ? JSON.parse(savedHistoryStr) : [];
        const updatedHistory = [newRunEntry, ...existingHistory].slice(0, 25);
        localStorage.setItem(`data_job_run_history_${id}`, JSON.stringify(updatedHistory));
        localStorage.setItem(`data_job_exec_log_${id}`, JSON.stringify(accumulatedLogs));
      } catch {}
    }

    // Persist past execution run into data_job_runs & log tables in DB
    void persistExecutionRunAndPurgeLogs(
      id!,
      tenantId,
      environment,
      job?.current_version ?? 1,
      runStatus,
      accumulatedLogs,
      userTriggeredBy,
      schedFiringRef.current ? 'schedule' : triggerPayloadRef.current ? 'trigger' : 'manual'
    );
  };

  // ─── Scheduler auto-trigger: check every 1s if target schedule time reached ────
  const schedFiringRef = useRef(false);
  useEffect(() => {
    if (liveStatus !== 'started' || scheduleTriggered || !schedNode || !scheduledNextRun) return;

    const cfg = schedNode.config as Record<string, string>;
    const freq = cfg.frequency || 'daily';
    const isRecurring = RECURRING_FREQUENCIES.has(freq);

    // Honour end_date: if the next run falls after it, finish the pipeline
    if (cfg.end_date) {
      const endDate = new Date(cfg.end_date);
      if (!isNaN(endDate.getTime()) && scheduledNextRun.getTime() > endDate.getTime()) {
        setLiveStatus('finished');
        return;
      }
    }

    schedFiringRef.current = false;

    const checkSchedule = () => {
      if (executingRef.current || schedFiringRef.current) return;
      const now = Date.now();
      if (now >= scheduledNextRun.getTime()) {
        schedFiringRef.current = true;
        setScheduleTriggered(true);
        runTest()
          .then(() => {
            if (isRecurring) {
              setScheduleTriggered(false);
            } else {
              setLiveStatus('finished');
            }
          })
          .catch(() => {})
          .finally(() => { schedFiringRef.current = false; });
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 1000);
    return () => clearInterval(interval);
  }, [liveStatus, schedNode, scheduledNextRun, scheduleTriggered]);

  // Reset schedule triggered state when workflow stops
  useEffect(() => {
    if (liveStatus === 'draft' || liveStatus === 'finished') {
      setScheduleTriggered(false);
    }
  }, [liveStatus]);

  // ─── Trigger fire handler (form, webhook, chat, workflow triggers) ───
  const triggerPayloadRef = useRef<Record<string, unknown> | null>(null);

  const executeTrigger = useCallback((triggerData?: Record<string, unknown>) => {
    if (executingRef.current || liveStatus !== 'started') return;
    triggerPayloadRef.current = triggerData ?? null;
    runTest()
      .catch(() => {})
      .finally(() => { triggerPayloadRef.current = null; });
  }, [liveStatus]);

  // ─── Realtime: listen for external trigger events (chat, webhook, form, workflow) ───
  useEffect(() => {
    const hasTrigger = nodes.some(n => n.stepType.startsWith('trigger_') && n.stepType !== 'trigger_schedule');
    if (liveStatus !== 'started' || !hasTrigger || !id) return;

    const channel = supabase.channel(`workflow-trigger:${id}`);
    channel
      .on('broadcast', { event: 'trigger_fire' }, (msg) => {
        const payload = msg.payload as Record<string, unknown> | undefined;
        executeTrigger(payload);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [liveStatus, id, nodes.length > 0, executeTrigger]);

  // ─── Polling fallback for form triggers (realtime broadcast can be missed) ───
  const lastFormCheckRef = useRef<string>(new Date().toISOString());
  useEffect(() => {
    const formNode = nodes.find(n => n.stepType === 'trigger_form');
    if (liveStatus !== 'started' || !formNode || !id || !tenantId) return;

    const formId = (formNode.config as Record<string, string>).form_id;

    lastFormCheckRef.current = new Date().toISOString();

    const poll = setInterval(async () => {
      if (executingRef.current) return;
      try {
        let query = supabase
          .from('form_submissions')
          .select('id, form_id, data, created_at')
          .eq('tenant_id', tenantId)
          .gt('created_at', lastFormCheckRef.current)
          .order('created_at', { ascending: true })
          .limit(1);

        if (formId) {
          query = query.eq('form_id', formId);
        }

        const { data: subs } = await query;

        if (subs?.length) {
          lastFormCheckRef.current = subs[0].created_at;
          const formName = (formNode.config as Record<string, string>).form_name || 'Form';
          executeTrigger({
            event_type: 'form_submission',
            form_id: subs[0].form_id ?? formId ?? '',
            form_name: formName,
            submission_id: subs[0].id,
            data: subs[0].data as Record<string, unknown>,
            submitted_at: subs[0].created_at,
          });
        }
      } catch { /* polling best-effort */ }
    }, 3000);

    return () => clearInterval(poll);
  }, [liveStatus, id, tenantId, nodes.length > 0, executeTrigger]);


  // ─── Layout helpers ─────────────────────────────────────────────────


  const fitView = () => {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
    const cw = canvasRef.current?.clientWidth || 800;
    const ch = canvasRef.current?.clientHeight || 600;
    const gw = maxX - minX + 100;
    const gh = maxY - minY + 100;
    const z = Math.min(cw / gw, ch / gh, 1.5);
    setZoom(z);
    setPan({ x: (cw - gw * z) / 2 - minX * z + 50 * z, y: (ch - gh * z) / 2 - minY * z + 50 * z });
  };

  useEffect(() => {
    if (nodes.length > 0 && pan.x === 0 && pan.y === 0) fitView();
  }, [nodes.length > 0]); // eslint-disable-line

  // ─── Filtered palette ───────────────────────────────────────────────

  const filteredPalette = useMemo(() => {
    const grouped = NODE_CATEGORIES.map((cat) => ({
      category: cat,
      items: NODE_PALETTE.filter((n) => n.category === cat),
    }));
    if (!paletteSearch) return grouped;
    const q = paletteSearch.toLowerCase();
    return grouped.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q))),
    })).filter((g) => g.items.length > 0);
  }, [paletteSearch]);

  const selectedNodeData = nodes.find((n) => n.id === selectedNode);
  const runDisabled = runJob.isPending || startRun.isPending || errors > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading pipeline…</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return <p className="p-8 text-center text-sm text-slate-500">Pipeline not found</p>;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  // Pre-compute execution log data (avoids IIFE in JSX)
  const _logLq = logFilter.toLowerCase().trim();
  type _LogEntry = typeof executionLog[number];
  let _filteredLog = _logLq
    ? executionLog.filter((l) => l.title.toLowerCase().includes(_logLq) || l.status.toLowerCase().includes(_logLq) || String((l.output as Record<string, unknown>)?.summary ?? '').toLowerCase().includes(_logLq))
    : executionLog;
  if (logSort) {
    _filteredLog = [..._filteredLog].sort((a, b) => {
      const getVal = (l: _LogEntry): string | number => {
        const o = l.output as Record<string, unknown>;
        switch (logSort!.col) {
          case 'node': return l.title;
          case 'status': return l.status;
          case 'time': return l.ms;
          case 'rows_in': return Number(o?.rows_in ?? 0);
          case 'rows_out': return Number(o?.rows_out ?? 0);
          case 'errors': return Number(o?.rows_error ?? 0);
          default: return '';
        }
      };
      const av = getVal(a), bv = getVal(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return logSort!.dir === 'asc' ? cmp : -cmp;
    });
  }
  const _LOG_PAGE_SIZE = 20;
  const _logTotalPages = Math.max(1, Math.ceil(_filteredLog.length / _LOG_PAGE_SIZE));
  const _logP = Math.min(logPage, _logTotalPages - 1);
  const _pageLog = _filteredLog.slice(_logP * _LOG_PAGE_SIZE, (_logP + 1) * _LOG_PAGE_SIZE);
  const _logColClick = (col: string) => {
    if (logSort?.col === col && logSort.dir === 'asc') setLogSort({ col, dir: 'desc' });
    else if (logSort?.col === col && logSort.dir === 'desc') setLogSort(null);
    else { setLogSort({ col, dir: 'asc' }); setLogPage(0); }
  };
  const _logSortIcon = (col: string) => logSort?.col === col ? (logSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const _logOkCount = executionLog.filter((l) => l.status === 'success').length;
  const _logFailCount = executionLog.length - _logOkCount;
  const _curRun = runHistory.find((r) => r.id === selectedRunId) || runHistory[0] || null;

  if (pageTab === 'workflow') {
    return (
      <div ref={containerRef} className="h-screen flex flex-col bg-gray-100 overflow-hidden">
        {/* ─── Toolbar ────────────────────────────────────────────── */}
        <div className={cn('h-12 border-b flex items-center px-3 gap-2 flex-shrink-0 z-20 overflow-x-auto', isRunning ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200')}>
          <button onClick={() => { if (hasUnsavedChanges) saveWorkflow.mutate(); navigate(backHref); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={parentCampaign ? `Back to ${parentCampaign.name}` : 'Back to Pipelines'}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-gray-200" />
          {parentCampaign && (
            <nav className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
              <Link to="/campaigns" className="hover:text-indigo-600">Campaigns</Link>
              <span className="text-gray-300">/</span>
              <Link to={`/campaigns/${parentCampaign.id}`} className="max-w-[160px] truncate font-medium hover:text-indigo-600">{parentCampaign.name}</Link>
              <span className="text-gray-300">/</span>
            </nav>
          )}

          {/* Title */}
          {editingTitle && !isRunning ? (
            <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingTitle(false); }}
              className="text-sm font-medium text-gray-900 border-b border-indigo-400 outline-none bg-transparent px-1 py-0.5 w-60" />
          ) : (
            <button onClick={() => { if (!isRunning) { setTitleDraft(job.name); setEditingTitle(true); } }} className={cn('text-sm font-medium px-1 py-0.5 truncate max-w-[240px]', isRunning ? 'text-gray-500 cursor-default' : 'text-gray-900 hover:text-indigo-600')}>{job.name}</button>
          )}

          {/* Execution status badge */}
          <StatusBadge liveStatus={liveStatus} />

          {/* Scheduler indicator with hover upcoming countdown */}
          {nodes.some(n => n.stepType.startsWith('trigger_')) && liveStatus === 'started' && !executing && (
            <div className="relative group flex items-center">
              <span className="flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium cursor-help border border-emerald-200/80 shadow-xs">
                <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500 animate-pulse" />
                {nodes.some(n => n.stepType === 'trigger_schedule') ? 'Scheduled' : 'Listening'}
              </span>
              {scheduledNextRun && (
                <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 whitespace-nowrap bg-slate-900/95 text-slate-100 text-xs p-3 rounded-xl shadow-2xl border border-slate-700/80 backdrop-blur-md">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400 mb-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Upcoming Execution</span>
                  </div>
                  <p className="text-slate-300 text-[10px] font-mono mb-1">
                    Target: {scheduledNextRun.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                  <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-3 font-mono text-[10px]">
                    <span className="text-slate-400">Time pending:</span>
                    <span className="text-amber-300 font-bold">{pendingBreakdown.fullFormatted}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 font-sans italic">
                    Compact: {pendingBreakdown.formatted}
                  </p>
                </div>
              )}
            </div>
          )}

          {typeof job.current_version === 'number' && job.current_version > 0 && (
            <span className="text-[10px] font-mono text-gray-400">v{job.current_version}</span>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-0.5 ml-2">
            {([
              { id: 'workflow' as PageTab, label: 'Canvas', icon: GitBranch },
              { id: 'versions' as PageTab, label: 'Versions', icon: History },
            ]).map(({ id: tabId, label, icon: Icon }) => (
              <button key={tabId} onClick={() => setPageTab(tabId)}
                className={cn('flex items-center gap-1 px-2 py-1 text-xs rounded-md', pageTab === tabId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-50')}>
                <Icon className="w-3 h-3" /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {saveMsg && <span className="text-xs text-emerald-600 whitespace-nowrap">{saveMsg}</span>}
          {runMsg && <span className="text-xs text-emerald-600 whitespace-nowrap">{runMsg}</span>}

          {/* Validation badge */}
          {issues.length > 0 && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', errors > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
              {errors > 0 ? `${errors} error${errors > 1 ? 's' : ''}` : `${warnings} warn`}
            </span>
          )}

          {/* Test / Live toggle */}
          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200 shadow-inner">
            <button
              onClick={() => { if (!isRunning) { setTestMode(true); setLiveStatus('draft'); } }}
              disabled={isRunning}
              className={cn('flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200',
                testMode
                  ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60',
                isRunning && 'opacity-50 cursor-not-allowed')}>
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Test</span>
            </button>
            <button
              onClick={() => { if (!isRunning) { setTestMode(false); } }}
              disabled={isRunning}
              className={cn('flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200',
                !testMode
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700/20'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60',
                isRunning && 'opacity-50 cursor-not-allowed')}>
              <Rocket className="w-3.5 h-3.5" />
              <span>Live</span>
            </button>
          </div>

          <div className="w-px h-6 bg-gray-200" />

          {/* ── Execution controls ── */}
          {!isEmailStudioOpen && (!testMode ? (
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl shadow-md border border-slate-800 flex-shrink-0">
              {/* Start / Resume */}
              <button
                onClick={async () => {
                  if (liveStatus === 'paused') {
                    setLiveStatus('started');
                    return;
                  }
                  const hasTrigger = nodes.some(n => n.stepType.startsWith('trigger_'));
                  // Auto-save before starting
                  try { await saveWorkflow.mutateAsync(); } catch {}
                  // Reset execution state from any previous run
                  setExecutedNodes(new Set());
                  setExecutionLog([]);
                  setBlinkingNodes({});
                  setExecutingNodeId(null);
                  setScheduleTriggered(false);
                  setNodes(prev => prev.map(n => ({ ...n, lastOutput: undefined, lastStatus: undefined, lastExecutionTimeMs: undefined })));
                  setLiveStatus('start_requested');
                  if (hasTrigger) {
                    setTimeout(() => setLiveStatus('started'), 600);
                  } else {
                    setTimeout(() => { setLiveStatus('started'); runJob.mutate({ mode: 'full' }); }, 600);
                  }
                }}
                disabled={liveStatus === 'started' || liveStatus === 'start_requested' || (runDisabled && liveStatus !== 'paused')}
                title={liveStatus === 'paused' ? 'Resume pipeline' : nodes.some(n => n.stepType.startsWith('trigger_')) ? 'Start (waits for trigger)' : 'Start execution'}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 shadow-sm',
                  liveStatus === 'started' || liveStatus === 'start_requested'
                    ? 'bg-emerald-500 text-white shadow-emerald-500/30 ring-2 ring-emerald-400 animate-pulse'
                    : liveStatus === 'paused'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-blue-600/30'
                    : runDisabled
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-emerald-600/30')}>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{liveStatus === 'paused' ? 'Resume' : 'Start'}</span>
              </button>

              {/* Pause */}
              <button
                onClick={() => setLiveStatus('paused')}
                disabled={liveStatus !== 'started'}
                title="Pause"
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 shadow-sm',
                  liveStatus === 'paused'
                    ? 'bg-amber-500 text-white shadow-amber-500/30 ring-2 ring-amber-400'
                    : liveStatus !== 'started'
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                    : 'bg-amber-600 hover:bg-amber-500 text-white active:scale-95 shadow-amber-600/30')}>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>

              {/* Stop */}
              <button
                onClick={() => {
                  setLiveStatus('stop_requested');
                  setTimeout(() => setLiveStatus('finished'), 800);
                }}
                disabled={liveStatus !== 'started' && liveStatus !== 'paused'}
                title="Stop"
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 shadow-sm',
                  liveStatus === 'stop_requested'
                    ? 'bg-rose-500 text-white shadow-rose-500/30 ring-2 ring-rose-400'
                    : liveStatus !== 'started' && liveStatus !== 'paused'
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                    : 'bg-rose-600 hover:bg-rose-500 text-white active:scale-95 shadow-rose-600/30')}>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          ) : (
            /* Test mode run button */
            <button onClick={() => runTest().then(() => {
              const hasRecurringSchedule = nodes.some(n => n.stepType === 'trigger_schedule' && RECURRING_FREQUENCIES.has(((n.config as Record<string, string>).frequency) || 'daily'));
              if (!hasRecurringSchedule) setLiveStatus('finished');
            })} disabled={executing || nodes.length === 0}
              className={cn('flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 shadow-md active:scale-95',
                executing
                  ? 'bg-amber-100 text-amber-700 cursor-wait'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-amber-500/25')}>
              {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{executing ? 'Running…' : 'Run Test'}</span>
            </button>
          ))}

          <div className="w-px h-6 bg-gray-200" />

          {/* Zoom / view controls */}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} className="px-1.5 py-0.5 hover:bg-gray-100 rounded">−</button>
            <span className="w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="px-1.5 py-0.5 hover:bg-gray-100 rounded">+</button>
          </div>

          <button
            onClick={fitView}
            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-all active:scale-95"
            title="Locate & Center All Workflow Activities (Fit View)"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            <span>Fit View</span>
          </button>

          <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <div className="w-px h-6 bg-gray-200" />

          {/* Publish version snapshot */}
          <button
            onClick={async () => {
              try {
                await saveWorkflow.mutateAsync();
                const vNum = await publishVersion.mutateAsync('Version snapshot');
                setSaveMsg(`Published v${vNum}`);
                setTimeout(() => setSaveMsg(''), 3000);
              } catch (err) {
                console.warn('Publish version snapshot DB:', err);
                const currentSnap = {
                  id: `v-${Date.now()}`,
                  job_id: id!,
                  version_number: (job?.current_version ?? 0) + 1,
                  snapshot: { graph: serializeWorkflowGraph(canvasToRf(nodes, edges).rfNodes, canvasToRf(nodes, edges).rfEdges) },
                  change_notes: 'Version snapshot',
                  published_at: new Date().toISOString(),
                };
                try {
                  const existing = localStorage.getItem(`data_job_versions_${id}`);
                  const list = existing ? JSON.parse(existing) : [];
                  localStorage.setItem(`data_job_versions_${id}`, JSON.stringify([currentSnap, ...list]));
                } catch {}
                setSaveMsg(`Published v${currentSnap.version_number}`);
                setTimeout(() => setSaveMsg(''), 3000);
              }
              setHasUnsavedChanges(false);
            }}
            disabled={isRunning}
            className={cn('flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              isRunning
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
            <UploadCloud className="w-3 h-3" /> Publish
          </button>

          {/* Save button */}
          <button onClick={() => { saveWorkflow.mutate(); setHasUnsavedChanges(false); setLastSavedAt(new Date().toISOString()); }} disabled={saveWorkflow.isPending || isRunning}
            className={cn('flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              isRunning
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : hasUnsavedChanges
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}>
            <Save className="w-3 h-3" />
            {hasUnsavedChanges ? 'Save *' : 'Saved'}
          </button>
        </div>

        {/* ─── Validation strip ───────────────────────────────────── */}
        {issues.length > 0 && (
          <div className={cn('px-4 py-1.5 text-xs flex items-center gap-2 flex-shrink-0', errors > 0 ? 'bg-red-50 text-red-800 border-b border-red-200' : 'bg-amber-50 text-amber-800 border-b border-amber-200')}>
            <AlertTriangle className="w-3.5 h-3.5" />
            {issues.slice(0, 3).map((iss, i) => (
              <button key={i} onClick={() => iss.nodeId && (() => { setSelectedNode(iss.nodeId!); setInspectorOpen(true); })()}
                className="hover:underline">{iss.message}</button>
            ))}
            {issues.length > 3 && <span className="text-gray-500">+{issues.length - 3} more</span>}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden relative">
          {/* ─── Node palette (left) ──────────────────────────────── */}
          {paletteOpen && (
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-10 shadow-lg">
              <div className="p-3 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-700">Add Node</span>
              </div>
              <div className="px-3 py-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input value={paletteSearch} onChange={(e) => setPaletteSearch(e.target.value)} placeholder="Search 80 nodes…"
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                {filteredPalette.map((cat) => (
                  <div key={cat.category} className="mb-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{cat.category}</p>
                    <div className="space-y-1">
                      {cat.items.map((item) => {
                        const IconC = NODE_ICONS[item.icon];
                        return (
                          <button key={item.type} onClick={() => addNode(item)}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-gray-50 transition-colors group border border-transparent hover:border-gray-200`}>
                            <div className={`w-7 h-7 rounded-md ${item.accentBg} flex items-center justify-center flex-shrink-0`}>
                              <IconC className="w-3.5 h-3.5 text-gray-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{item.label}</p>
                              <p className="text-[10px] text-gray-400 truncate">{item.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Canvas ───────────────────────────────────────────── */}
          <div ref={canvasRef}
            tabIndex={0}
            className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing outline-none"
            onKeyDown={(e) => {
              if (isRunning) return;
              if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodesRef.current.size > 0) { e.preventDefault(); deleteSelectedNodes(); }
                else if (selectedNode) { e.preventDefault(); deleteNode(selectedNode); }
              }
              if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelectedNodes(); }
              if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); pasteNodes(); }
              if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                const all = new Set(nodes.map((n) => n.id));
                setSelectedNodes(all);
                selectedNodesRef.current = all;
              }
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleWheel}
            style={{ backgroundImage: `radial-gradient(circle, #d1d5db 1px, transparent 1px)`, backgroundSize: `${20 * zoom}px ${20 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }}>

            <button onClick={() => { setPaletteOpen(!paletteOpen); if (paletteOpen) setPaletteSearch(''); }}
              className={`absolute top-3 left-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg shadow-sm border transition-all duration-200 ${paletteOpen ? 'bg-indigo-50 border-indigo-300 text-indigo-600 rotate-45' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-300'}`}
              title={paletteOpen ? 'Close node palette' : 'Add node'}>
              <Plus className="w-4 h-4 transition-transform duration-200" />
            </button>

            <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0, width: '3200px', height: '2000px' }}>
              {/* SVG edges */}
              <svg ref={svgRef} className="absolute inset-0 pointer-events-none" style={{ width: '3200px', height: '2000px', overflow: 'visible' }}>
                <defs>
                  <marker id="pa" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M 0 0 L 8 3 L 0 6 Z" fill="#94a3b8" /></marker>
                  <marker id="pa-ok" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M 0 0 L 8 3 L 0 6 Z" fill="#22c55e" /></marker>
                  <marker id="pa-fail" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M 0 0 L 8 3 L 0 6 Z" fill="#ef4444" /></marker>
                </defs>

                {edges.map((edge) => {
                  const fromNode = nodes.find((n) => n.id === edge.fromId);
                  const toNode = nodes.find((n) => n.id === edge.toId);
                  if (!fromNode || !toNode) return null;
                  const from = getOutputPos(fromNode, edge.fromHandle);
                  const to = getInputPos(toNode);
                  const path = buildBezierPath(from, to);
                  const bothExec = executedNodes.has(edge.fromId) && executedNodes.has(edge.toId);
                  const fromFailed = fromNode.lastStatus === 'failed';
                  const isHovered = hoveredEdge === edge.id;

                  let stroke = '#cbd5e1', marker = 'url(#pa)', sw = 2;
                  if (bothExec && !fromFailed) { stroke = '#22c55e'; marker = 'url(#pa-ok)'; sw = 2.5; }
                  else if (bothExec && fromFailed) { stroke = '#ef4444'; marker = 'url(#pa-fail)'; sw = 2.5; }
                  if (isHovered) { stroke = '#f59e0b'; sw = 3; }

                  const midX = (from.x + to.x) / 2;
                  const midY = (from.y + to.y) / 2;

                  return (
                    <g key={edge.id} className="pointer-events-auto">
                      {/* Invisible wide hit area for hover + right-click — no left-click detach */}
                      <path d={path} stroke="transparent" strokeWidth="18" fill="none"
                        onMouseEnter={() => setHoveredEdge(edge.id)} onMouseLeave={() => setHoveredEdge(null)}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setEdgeDataPreview({ edgeId: edge.id, screenX: e.clientX, screenY: e.clientY }); }}
                        style={{ cursor: 'default' }} />
                      {/* Visible edge line */}
                      <path d={path} stroke={stroke} strokeWidth={sw} fill="none" markerEnd={marker}
                        style={{ transition: 'stroke 0.15s, stroke-width 0.15s', pointerEvents: 'none' }} />

                      {/* Row count badge — always visible after execution, tooltip on hover */}
                      {(() => {
                        const out = fromNode.lastOutput as Record<string, unknown> | undefined;
                        let rows = out?.rows_out as number | undefined ?? out?.rows_processed as number | undefined;
                        if (edge.fromHandle && out?.branch_counts) {
                          const bc = out.branch_counts as Record<string, number>;
                          if (bc[edge.fromHandle] != null) rows = bc[edge.fromHandle];
                        }
                        const isMetadataOnly = fromNode.stepType.startsWith('trigger_') || fromNode.stepType === 'flow_wait' || fromNode.stepType === 'flow_end';
                        if (bothExec && rows != null && !(isMetadataOnly && rows <= 1)) {
                          const label = rows >= 1000 ? `${(rows / 1000).toFixed(1)}k` : String(rows);
                          const tw = Math.max(50, label.length * 7 + 26);
                          return (
                            <g className="select-none pointer-events-none">
                              <rect x={midX - tw / 2} y={midY - 12} width={tw} height="18" rx="9" fill={fromFailed ? '#fef2f2' : '#f0fdf4'} stroke={fromFailed ? '#fca5a5' : '#86efac'} strokeWidth="1" />
                              <text x={midX} y={midY + 1} textAnchor="middle" fill={fromFailed ? '#dc2626' : '#16a34a'} fontSize="9" fontWeight="600">{label}</text>
                            </g>
                          );
                        }
                        if (isHovered) {
                          return (
                            <g className="select-none pointer-events-none">
                              <rect x={midX - 45} y={midY - 24} width="90" height="22" rx="5" fill="#1e293b" opacity="0.85" />
                              <text x={midX} y={midY - 10} textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="500">Right-click for data</text>
                            </g>
                          );
                        }
                        return null;
                      })()}

                      {/* Edge label (branch name) when not hovered */}
                      {edge.label && !isHovered && (
                        <text x={midX} y={midY - 8} textAnchor="middle" className="text-[10px] fill-gray-400 select-none pointer-events-none">{edge.label}</text>
                      )}

                      {/* Joint dots at endpoints — hover shows hand, mouseDown to reconnect/disconnect */}
                      {isHovered && (
                        <>
                          {/* Source joint */}
                          <circle cx={from.x} cy={from.y} r="6" fill="white" stroke={stroke} strokeWidth="2"
                            style={{ cursor: 'pointer' }}
                            onMouseDown={(e) => handleEdgeGrab(e as unknown as React.MouseEvent, edge)} />
                          {/* Target joint */}
                          <circle cx={to.x} cy={to.y} r="6" fill="white" stroke={stroke} strokeWidth="2"
                            style={{ cursor: 'pointer' }}
                            onMouseDown={(e) => handleEdgeGrab(e as unknown as React.MouseEvent, edge)} />
                        </>
                      )}
                    </g>
                  );
                })}

                {drawingEdge && (() => {
                  const fromNode = nodes.find((n) => n.id === drawingEdge.fromId);
                  if (!fromNode) return null;
                  const from = getOutputPos(fromNode, drawingEdge.fromHandle);
                  const path = buildBezierPath(from, { x: drawingEdge.x, y: drawingEdge.y });
                  return <path d={path} stroke={reconnectingEdge ? '#f59e0b' : '#6366f1'} strokeWidth="2" fill="none" strokeDasharray="6 4" className="pointer-events-none" />;
                })()}
              </svg>

              {/* Selection Marquee Box */}
              {selectionBox && (() => {
                const x = Math.min(selectionBox.startX, selectionBox.currentX);
                const y = Math.min(selectionBox.startY, selectionBox.currentY);
                const width = Math.abs(selectionBox.currentX - selectionBox.startX);
                const height = Math.abs(selectionBox.currentY - selectionBox.startY);
                if (width < 3 && height < 3) return null;
                return (
                  <div
                    className="absolute border-2 border-blue-500 bg-blue-500/15 rounded-lg pointer-events-none z-30 ring-1 ring-blue-400/40"
                    style={{ left: x, top: y, width, height }}
                  />
                );
              })()}

              {/* Nodes */}
              {nodes.map((node) => {
                const item = paletteItem(node.stepType);
                const cat = item?.category ?? 'Sources';
                const IconC = item ? NODE_ICONS[item.icon] : Zap;
                const isSelected = selectedNode === node.id || selectedNodes.has(node.id);
                const isExecuted = executedNodes.has(node.id) || Boolean(node.lastStatus);
                const isRunning = executingNodeId === node.id;
                const effectiveOutputs = (item?.outputs && item.outputs.length > 1 && node.stepType === 'transform_dedupe' && !node.config.output_duplicates) ? undefined : item?.outputs;
                const hasMultiOutput = effectiveOutputs && effectiveOutputs.length > 1;
                const isScheduler = node.stepType === 'trigger_schedule';
                const isTrigger = node.stepType.startsWith('trigger_');
                const schedCfg = isScheduler ? (node.config as Record<string, string>) : null;
                const schedTime = schedCfg?.run_time || '02:00';
                const schedFreq = schedCfg?.frequency || 'daily';
                const schedIsRecurring = isScheduler && RECURRING_FREQUENCIES.has(schedFreq);
                const schedIsWaiting = isScheduler && (liveStatus === 'started' || liveStatus === 'start_requested') && (!isExecuted || schedIsRecurring);
                const triggerIsWaiting = isTrigger && !isScheduler && (liveStatus === 'started' || liveStatus === 'start_requested') && !isExecuted;
                const blinkClass = isRunning ? 'pipe-blink-running' : (schedIsWaiting || triggerIsWaiting) ? 'pipe-blink-green-loop' : blinkingNodes[node.id] === 'green' ? 'pipe-blink-green' : blinkingNodes[node.id] === 'red' ? 'pipe-blink-red' : '';
                const schedFreqLabel = schedFreq === 'once' ? 'Once' : schedFreq === 'every_n_minutes' ? `Every ${schedCfg?.interval_minutes || '?'}m` : schedFreq === 'hourly' ? 'Hourly' : schedFreq === 'daily' ? 'Daily' : schedFreq === 'weekly' ? 'Weekly' : schedFreq === 'monthly' ? 'Monthly' : schedFreq === 'weekdays' ? 'Weekdays' : 'Custom';
                const schedHourAngle = (() => { const [h, m] = schedTime.split(':').map(Number); return ((h % 12) * 30 + (m || 0) * 0.5 - 90) * Math.PI / 180; })();
                const schedMinAngle = (() => { const [, m] = schedTime.split(':').map(Number); return ((m || 0) * 6 - 90) * Math.PI / 180; })();
                const hasWarning = Boolean(isExecuted && node.lastStatus === 'success' && node.lastExecutionTimeMs && node.lastExecutionTimeMs > 5000 && node.stepType !== 'flow_wait');
                const nodeBorder = isSelected ? 'border-blue-500 ring-2 ring-blue-500 shadow-lg shadow-blue-500/30'
                  : isRunning ? 'border-emerald-400 shadow-md shadow-emerald-100'
                  : isExecuted && node.lastStatus === 'failed' ? 'border-red-400 shadow-md shadow-red-100'
                  : isExecuted && hasWarning ? 'border-orange-400 shadow-md shadow-orange-100'
                  : isExecuted && node.lastStatus === 'success' ? 'border-emerald-500 shadow-md shadow-emerald-500/20'
                  : (schedIsWaiting || triggerIsWaiting) ? 'border-emerald-500 ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-500/30 animate-pulse'
                  : 'border-slate-300 shadow-sm bg-white';

                const nodeTooltip = isExecuted && node.lastOutput && !isRunning
                  ? `${node.label}\nRows in: ${(node.lastOutput as Record<string, unknown>).rows_in ?? 0} · Out: ${(node.lastOutput as Record<string, unknown>).rows_out ?? 0} · Errors: ${(node.lastOutput as Record<string, unknown>).rows_error ?? 0}${node.lastExecutionTimeMs ? `\nExecution: ${node.lastExecutionTimeMs}ms` : ''}`
                  : undefined;

                return (
                  <div key={node.id}
                    className={`absolute select-none group ${node.disabled ? 'opacity-50' : ''}`}
                    style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                    title={nodeTooltip}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onMouseUp={() => handleNodeMouseUp(node.id)}
                    onDoubleClick={(e) => { e.stopPropagation(); setSelectedNode(node.id); setInspectorOpen(true); setInspectorTab('params'); }}>

                    {isScheduler ? (
                      <div className={cn('w-full h-full rounded-xl border-2 transition-all bg-white overflow-hidden cursor-move hover:shadow-md relative group/sched', blinkClass, nodeBorder)}
                        title={schedIsWaiting ? `Upcoming execution: ${scheduledNextRun?.toLocaleString()} (${pendingBreakdown.fullFormatted} pending)` : `${schedFreqLabel} at ${schedTime}`}>

                        {/* Hover floating countdown popover on card */}
                        {scheduledNextRun && schedIsWaiting && (
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover/sched:opacity-100 transition-all duration-200 pointer-events-none z-40 whitespace-nowrap bg-slate-900/95 text-white text-[10px] px-3 py-1.5 rounded-lg shadow-xl border border-slate-700/90 backdrop-blur-sm flex items-center gap-1.5 font-mono">
                            <Clock className="w-3 h-3 text-emerald-400 animate-spin" />
                            <span>Next: <strong className="text-amber-300">{pendingBreakdown.fullFormatted}</strong></span>
                          </div>
                        )}

                        <div className="flex items-center h-full px-2.5 gap-2">
                          {(() => {
                            const clockStroke = isExecuted && node.lastStatus === 'success' ? '#10b981'
                              : isExecuted && node.lastStatus === 'failed' ? '#ef4444'
                              : schedIsWaiting ? '#10b981'
                              : isSelected ? '#3b82f6' : '#64748b';
                            return (
                              <svg viewBox="14 14 72 72" className={cn('flex-shrink-0', schedIsWaiting && 'scheduler-waiting')} style={{ width: '44px', height: '44px' }}>
                                <ellipse cx="33" cy="20" rx="6" ry="4.5" fill="#374151" stroke="#1f2937" strokeWidth="0.8" />
                                <ellipse cx="67" cy="20" rx="6" ry="4.5" fill="#374151" stroke="#1f2937" strokeWidth="0.8" />
                                <rect x="45" y="16" width="10" height="3" rx="1.5" fill="#374151" />
                                <circle cx="50" cy="48" r="24" fill="white" stroke={clockStroke} strokeWidth="2.5"
                                  className={schedIsWaiting ? 'scheduler-clock-pulse' : ''} />
                                <circle cx="50" cy="48" r="20" fill="white" stroke={isExecuted && node.lastStatus === 'success' ? '#d1fae5' : schedIsWaiting ? '#d1fae5' : '#f3f4f6'} strokeWidth="0.8" />
                                {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => {
                                  const a = (i * 30 - 90) * Math.PI / 180;
                                  return <line key={i} x1={50 + 17 * Math.cos(a)} y1={48 + 17 * Math.sin(a)} x2={50 + 19 * Math.cos(a)} y2={48 + 19 * Math.sin(a)} stroke="#9ca3af" strokeWidth={i % 3 === 0 ? 1.5 : 0.75} strokeLinecap="round" />;
                                })}
                                <line x1="50" y1="48" x2={50 + 11 * Math.cos(schedHourAngle)} y2={48 + 11 * Math.sin(schedHourAngle)} stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
                                <line x1="50" y1="48" x2={50 + 15 * Math.cos(schedMinAngle)} y2={48 + 15 * Math.sin(schedMinAngle)} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
                                <circle cx="50" cy="48" r="1.5" fill="#374151" />
                                <line x1="30" y1="68" x2="24" y2="78" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
                                <line x1="70" y1="68" x2="76" y2="78" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            );
                          })()}
                          <div className="flex flex-col justify-center min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-900 truncate">{schedFreqLabel}</p>
                            <p className="text-[10px] text-gray-500 font-mono">{schedTime}</p>
                            {schedIsWaiting ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap animate-pulse w-fit"
                                title={`Pending: ${pendingBreakdown.fullFormatted}`}>
                                In: {pendingBreakdown.formatted}
                              </span>
                            ) : isExecuted && node.lastStatus === 'success' && liveStatus === 'started' && RECURRING_FREQUENCIES.has(((schedNode?.config as Record<string, string>)?.frequency) || 'daily') ? (
                              <span className="mt-0.5 inline-flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-[8px] font-medium">✓ Run completed</span>
                                <span className="inline-flex items-center gap-1 bg-blue-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap w-fit"
                                  title={scheduledNextRun ? `Next: ${scheduledNextRun.toLocaleString()}` : ''}>
                                  Next: {pendingBreakdown.formatted || 'calculating…'}
                                </span>
                              </span>
                            ) : isExecuted && node.lastStatus === 'success' ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-emerald-600 text-[8px] font-medium">
                                ✓ Triggered
                              </span>
                            ) : isExecuted && node.lastStatus === 'failed' ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-red-600 text-[8px] font-medium">
                                ✗ Failed
                              </span>
                            ) : null}
                          </div>
                          {isExecuted && !isRunning && (
                            <div className="flex-shrink-0">
                              {node.lastStatus === 'failed' ? (
                                <XCircle className="w-4 h-4 text-red-500" />
                              ) : node.lastStatus === 'success' && hasWarning ? (
                                <AlertTriangle className="w-4 h-4 text-orange-500" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              )}
                            </div>
                          )}
                          {node.lastExecutionTimeMs != null && !isRunning && (
                            <span className="text-[9px] text-gray-400 flex-shrink-0">{node.lastExecutionTimeMs}ms</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Standard rectangular node */
                      <div className={cn('w-full h-full rounded-xl border-2 transition-all bg-white overflow-hidden cursor-move hover:shadow-md', blinkClass, nodeBorder)}>
                        <div className="flex items-center h-full px-3 gap-2.5">
                          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors', triggerIsWaiting && 'animate-pulse')}
                            style={{ backgroundColor: triggerIsWaiting ? '#10b981' : isExecuted && node.lastStatus !== 'failed' ? (hasWarning ? '#f97316' : '#10b981') : isExecuted && node.lastStatus === 'failed' ? '#ef4444' : isRunning ? '#6366f1' : `${catFill(cat)}18` }}>
                            {isRunning ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <IconC className={cn('w-4 h-4', (isExecuted || triggerIsWaiting) ? 'text-white' : '')} style={!(isExecuted || triggerIsWaiting) ? { color: catFill(cat) } : undefined} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-900 truncate">{node.label}</p>
                            {triggerIsWaiting ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium animate-pulse">
                                <Circle className="w-1.5 h-1.5 fill-emerald-500 text-emerald-500" />
                                {node.stepType === 'trigger_webhook' ? 'Waiting for webhook…'
                                  : node.stepType === 'trigger_event' ? 'Listening for events…'
                                  : node.stepType === 'trigger_api' ? 'Waiting for API call…'
                                  : node.stepType === 'trigger_file' ? 'Watching for file…'
                                  : node.stepType === 'trigger_manual' ? 'Waiting for manual start…'
                                  : node.stepType === 'trigger_form' ? 'Waiting for submission…'
                                  : node.stepType === 'trigger_chat' ? 'Waiting for message…'
                                  : node.stepType === 'trigger_workflow' ? 'Waiting for trigger…'
                                  : 'Waiting…'}
                              </span>
                            ) : isRunning && node.stepType === 'flow_wait' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 font-medium animate-pulse">
                                <Circle className="w-1.5 h-1.5 fill-indigo-500 text-indigo-500" />
                                Waiting {configSummary(node.stepType, node.config)}…
                              </span>
                            ) : (
                              <p className="text-[10px] text-gray-400 truncate">{configSummary(node.stepType, node.config) || item?.description || node.stepType}</p>
                            )}
                            {!triggerIsWaiting && !isExecuted && validateNodeConfig(node.stepType, node.config).length > 0 && (
                              <p className="text-[9px] text-amber-500 truncate" title={validateNodeConfig(node.stepType, node.config).join(', ')}>
                                ⚠ {validateNodeConfig(node.stepType, node.config)[0]}
                              </p>
                            )}
                          </div>
                          {triggerIsWaiting && (
                            <button
                              onClick={(e) => { e.stopPropagation(); executeTrigger(node.id); }}
                              className="flex-shrink-0 text-[8px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200 transition-colors"
                              title="Simulate trigger event">
                              Fire
                            </button>
                          )}
                          {isExecuted && !isRunning && !triggerIsWaiting && (
                            <div className="flex-shrink-0">
                              {node.lastStatus === 'failed' ? (
                                <XCircle className="w-4 h-4 text-red-500" />
                              ) : node.lastStatus === 'success' && hasWarning ? (
                                <AlertTriangle className="w-4 h-4 text-orange-500" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              )}
                            </div>
                          )}
                          {node.lastExecutionTimeMs && !isRunning && !triggerIsWaiting && node.stepType !== 'flow_wait' && (
                            <span className="text-[9px] text-gray-400 flex-shrink-0">{node.lastExecutionTimeMs}ms</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Input handle — mouseDown grabs incoming edge for reconnection */}
                    {!node.stepType.startsWith('trigger') && (() => {
                      const hasIncoming = edges.some((ed) => ed.toId === node.id);
                      return (
                        <div className={`absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-colors z-10 ${hasIncoming ? 'border-indigo-400 bg-indigo-100 hover:border-amber-500 hover:bg-amber-100 cursor-grab' : 'border-gray-300 bg-white hover:border-indigo-500 hover:bg-indigo-50 cursor-crosshair'}`}
                          onMouseDown={(e) => handleInputMouseDown(e, node.id)}
                          onMouseUp={() => handleNodeMouseUp(node.id)} />
                      );
                    })()}

                    {/* Output handle(s) */}
                    {hasMultiOutput ? (
                      effectiveOutputs!.map((out, i) => {
                        const frac = (i + 1) / (effectiveOutputs!.length + 1);
                        const hasConn = edges.some((e) => e.fromId === node.id && e.fromHandle === out.id);
                        const isPositive = out.id === 'true' || out.id === 'match' || out.id === 'unique' || out.id === 'pass' || out.id === 'eligible';
                        return (
                          <div key={out.id} className="absolute right-0 translate-x-1/2 -translate-y-1/2 z-10 flex items-center" style={{ top: `${frac * 100}%` }}>
                            <div
                              onMouseDown={(e) => handleOutputMouseDown(e, node.id, out.id)}
                              className={`w-3 h-3 rounded-full border-2 bg-white hover:bg-indigo-50 transition-colors cursor-crosshair ${isPositive ? 'border-emerald-400' : 'border-red-400'} ${!hasConn ? 'animate-pulse' : ''}`}
                              title={out.label} />
                            {!hasConn && (
                              <button onClick={(e) => { e.stopPropagation(); handleOutputMouseDown(e as unknown as React.MouseEvent, node.id, out.id); }}
                                className="ml-1.5 whitespace-nowrap bg-gray-800/80 text-white text-[8px] px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto hover:bg-indigo-600"
                                title={`Connect ${out.label} output`}>
                                + connect
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (() => {
                      const hasConn = edges.some((e) => e.fromId === node.id && !e.fromHandle);
                      return (
                        <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 z-10 flex items-center">
                          <div onMouseDown={(e) => handleOutputMouseDown(e, node.id)}
                            className={`w-3 h-3 rounded-full border-2 border-gray-300 bg-white hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-crosshair ${!hasConn ? 'animate-pulse' : ''}`} />
                          {!hasConn && (
                            <button onClick={(e) => { e.stopPropagation(); handleOutputMouseDown(e as unknown as React.MouseEvent, node.id); }}
                              className="ml-1.5 whitespace-nowrap bg-gray-800/80 text-white text-[8px] px-1.5 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto hover:bg-indigo-600"
                              title="Connect output">
                              + connect
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Delete */}
                    <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600" title="Delete node">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Minimap */}
            {nodes.length > 0 && (
              <div className="absolute bottom-3 right-3 w-36 h-24 bg-white/90 border border-gray-200 rounded-lg overflow-hidden pointer-events-none z-10 shadow-sm">
                <svg viewBox={`${Math.min(...nodes.map((n) => n.x)) - 20} ${Math.min(...nodes.map((n) => n.y)) - 20} ${Math.max(...nodes.map((n) => n.x + NODE_W)) - Math.min(...nodes.map((n) => n.x)) + 40} ${Math.max(...nodes.map((n) => n.y + NODE_H)) - Math.min(...nodes.map((n) => n.y)) + 40}`} className="w-full h-full">
                  {edges.map((e) => {
                    const f = nodes.find((n) => n.id === e.fromId);
                    const t = nodes.find((n) => n.id === e.toId);
                    if (!f || !t) return null;
                    return <line key={e.id} x1={f.x + NODE_W / 2} y1={f.y + NODE_H / 2} x2={t.x + NODE_W / 2} y2={t.y + NODE_H / 2} stroke="#d1d5db" strokeWidth="3" />;
                  })}
                  {nodes.map((n) => {
                    const it = paletteItem(n.stepType);
                    return <rect key={n.id} x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx="4" fill={it ? catFill(it.category) : '#94a3b8'} opacity={selectedNode === n.id ? 1 : 0.6} />;
                  })}
                </svg>
              </div>
            )}

            {/* Edge right-click context menu */}
            {edgeDataPreview && (() => {
              const edge = edges.find((e) => e.id === edgeDataPreview.edgeId);
              if (!edge) return null;
              const fromNode = nodes.find((n) => n.id === edge.fromId);
              const toNode = nodes.find((n) => n.id === edge.toId);
              const dataKey = edge.fromHandle ? `${edge.fromId}:${edge.fromHandle}` : edge.fromId;
              const rows = nodeDataRef.current.get(dataKey);
              const hasData = rows && rows.length > 0;
              return (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setEdgeDataPreview(null)} onContextMenu={(e) => { e.preventDefault(); setEdgeDataPreview(null); }} />
                  <div className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 py-1 w-56" style={{ left: edgeDataPreview.screenX, top: edgeDataPreview.screenY }}>
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Edge</p>
                      <p className="text-xs font-medium text-gray-800 mt-0.5">{fromNode?.label ?? '?'} → {toNode?.label ?? '?'}</p>
                      {hasData && <p className="text-[10px] text-emerald-600 mt-0.5">{rows.length.toLocaleString()} records flowing</p>}
                    </div>
                    <div className="py-1">
                      <button onClick={() => { setDataModalPage(0); setDataModalSort(null); setEdgeDataModal({ fromNodeId: edge.fromId, toNodeId: edge.toId, fromHandle: edge.fromHandle }); setEdgeDataPreview(null); }}
                        disabled={!hasData}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
                        <Table2 className="w-4 h-4" />
                        <div className="text-left">
                          <p className="font-medium">Show Data</p>
                          <p className="text-[10px] text-gray-400">{hasData ? 'View records flowing through this edge' : 'Run workflow first to see data'}</p>
                        </div>
                      </button>
                      <button onClick={() => { setEdges((prev) => prev.filter((e) => e.id !== edge.id)); setEdgeDataPreview(null); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                        <p className="font-medium">Disconnect</p>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Edge data modal — 250 rows per page with advanced filter */}
            {edgeDataModal && (() => {
              const dataKey = edgeDataModal.fromHandle ? `${edgeDataModal.fromNodeId}:${edgeDataModal.fromHandle}` : edgeDataModal.fromNodeId;
              const allRows = nodeDataRef.current.get(dataKey) ?? [];
              const fromNode = nodes.find((n) => n.id === edgeDataModal.fromNodeId);
              const toNode = nodes.find((n) => n.id === edgeDataModal.toNodeId);

              let columns: string[] = [];
              const colTypes = new Map<string, 'date' | 'number' | 'boolean' | 'string'>();
              if (allRows.length > 0) {
                const allKeys = new Set<string>();
                allRows.slice(0, 100).forEach((r) => Object.keys(r).forEach((k) => allKeys.add(k)));
                columns = Array.from(allKeys);
                for (const col of columns) {
                  const sample = allRows.find((r) => r[col] != null)?.[col];
                  if (sample == null) { colTypes.set(col, 'string'); continue; }
                  if (typeof sample === 'boolean') { colTypes.set(col, 'boolean'); continue; }
                  if (typeof sample === 'number') { colTypes.set(col, 'number'); continue; }
                  const s = String(sample);
                  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { colTypes.set(col, 'date'); continue; }
                  colTypes.set(col, 'string');
                }
              }

              // Quick-search filter
              const q = dataModalFilter.toLowerCase().trim();
              let rows = q ? allRows.filter((r) => columns.some((c) => { const v = r[c]; return v != null && String(v).toLowerCase().includes(q); })) : allRows;

              // Advanced column filter rules
              const activeRules = dataFilterRules.filter((r) => r.col && (r.val || ['empty', 'not_empty'].includes(r.op)));
              if (activeRules.length > 0) {
                const matchRow = (row: Record<string, unknown>) => {
                  const results = activeRules.map((rule) => {
                    const val = row[rule.col];
                    const sv = val != null ? String(val) : '';
                    const svl = sv.toLowerCase();
                    const rv = rule.val;
                    const rvl = rv.toLowerCase();
                    const ct = colTypes.get(rule.col) ?? 'string';
                    const isDate = ct === 'date';
                    const isNum = ct === 'number';

                    switch (rule.op) {
                      case 'eq':
                        if (isDate) return sv.slice(0, 10) === rv;
                        return svl === rvl;
                      case 'neq':
                        if (isDate) return sv.slice(0, 10) !== rv;
                        return svl !== rvl;
                      case 'contains': return svl.includes(rvl);
                      case 'not_contains': return !svl.includes(rvl);
                      case 'starts': return svl.startsWith(rvl);
                      case 'ends': return svl.endsWith(rvl);
                      case 'gt':
                        if (isDate) return sv.slice(0, 10) > rv;
                        if (isNum) return Number(val) > Number(rv);
                        return sv > rv;
                      case 'lt':
                        if (isDate) return sv.slice(0, 10) < rv;
                        if (isNum) return Number(val) < Number(rv);
                        return sv < rv;
                      case 'gte':
                        if (isDate) return sv.slice(0, 10) >= rv;
                        if (isNum) return Number(val) >= Number(rv);
                        return sv >= rv;
                      case 'lte':
                        if (isDate) return sv.slice(0, 10) <= rv;
                        if (isNum) return Number(val) <= Number(rv);
                        return sv <= rv;
                      case 'empty': return sv === '';
                      case 'not_empty': return sv !== '';
                      default: return true;
                    }
                  });
                  return dataFilterLogic === 'and' ? results.every(Boolean) : results.some(Boolean);
                };
                rows = rows.filter(matchRow);
              }

              let sortedRows = rows;
              if (dataModalSort && columns.includes(dataModalSort.col)) {
                sortedRows = [...rows].sort((a, b) => {
                  const av = a[dataModalSort.col], bv = b[dataModalSort.col];
                  const sa = av != null ? String(av) : '', sb = bv != null ? String(bv) : '';
                  const cmp = sa.localeCompare(sb, undefined, { numeric: true });
                  return dataModalSort.dir === 'asc' ? cmp : -cmp;
                });
              }

              const PAGE_SIZE = 250;
              const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
              const page = Math.min(dataModalPage, totalPages - 1);
              const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
              const startRow = page * PAGE_SIZE;
              const isFiltered = q || activeRules.length > 0;

              return (
                <>
                  <div className="fixed inset-0 z-50 bg-black/40" onClick={() => { setEdgeDataModal(null); setDataModalFilter(''); setDataFilterRules([]); setDataFilterOpen(false); }} />
                  <div className="fixed inset-8 z-50 bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <Table2 className="w-4 h-4 text-indigo-500" />
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">Inbound Data</h3>
                          <p className="text-[10px] text-gray-500">{fromNode?.label ?? '?'} → {toNode?.label ?? '?'} · {sortedRows.length.toLocaleString()} records · {columns.length} columns</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                          <input value={dataModalFilter}
                            onChange={(e) => { setDataModalFilter(e.target.value); setDataModalPage(0); }}
                            className="pl-7 pr-7 py-1 text-xs border border-gray-200 rounded-md w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                            placeholder="Quick search…" />
                          {dataModalFilter && (
                            <button onClick={() => { setDataModalFilter(''); setDataModalPage(0); }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100"><X className="w-3 h-3 text-gray-400" /></button>
                          )}
                        </div>
                        <button onClick={() => setDataFilterOpen(!dataFilterOpen)}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${dataFilterOpen || activeRules.length > 0 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <FilterIcon className="w-3 h-3" />
                          Filter
                          {activeRules.length > 0 && <span className="ml-0.5 px-1 py-0.5 text-[9px] bg-indigo-100 text-indigo-700 rounded-full">{activeRules.length}</span>}
                        </button>
                        <button onClick={() => { setEdgeDataModal(null); setDataModalFilter(''); setDataFilterRules([]); setDataFilterOpen(false); }} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Advanced filter panel */}
                    {dataFilterOpen && (
                      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/50 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-medium text-gray-500 uppercase">Match</span>
                          <button onClick={() => setDataFilterLogic(dataFilterLogic === 'and' ? 'or' : 'and')}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${dataFilterLogic === 'and' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}>
                            {dataFilterLogic.toUpperCase()}
                          </button>
                          <span className="text-[10px] text-gray-400">of the following rules</span>
                          <div className="flex-1" />
                          {dataFilterRules.length > 0 && (
                            <button onClick={() => { setDataFilterRules([]); setDataModalPage(0); }}
                              className="text-[10px] text-red-500 hover:text-red-700 font-medium">Clear all</button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {dataFilterRules.map((rule, idx) => (
                            <div key={rule.id} className="flex items-center gap-1.5">
                              {idx > 0 && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full w-8 text-center ${dataFilterLogic === 'and' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                  {dataFilterLogic.toUpperCase()}
                                </span>
                              )}
                              {idx === 0 && <span className="w-8 text-center text-[9px] text-gray-400">Where</span>}
                              <select value={rule.col}
                                onChange={(e) => { const next = [...dataFilterRules]; next[idx] = { ...rule, col: e.target.value }; setDataFilterRules(next); setDataModalPage(0); }}
                                className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white min-w-[120px]">
                                <option value="">Column…</option>
                                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                              {(() => {
                                const ct = colTypes.get(rule.col) ?? 'string';
                                const isDate = ct === 'date';
                                const isNum = ct === 'number';
                                return (
                                  <>
                                    <select value={rule.op}
                                      onChange={(e) => { const next = [...dataFilterRules]; next[idx] = { ...rule, op: e.target.value }; setDataFilterRules(next); setDataModalPage(0); }}
                                      className="px-2 py-1 text-[11px] border border-gray-200 rounded bg-white min-w-[100px]">
                                      {isDate ? (
                                        <>
                                          <option value="eq">on</option>
                                          <option value="neq">not on</option>
                                          <option value="gt">after</option>
                                          <option value="lt">before</option>
                                          <option value="gte">on or after</option>
                                          <option value="lte">on or before</option>
                                          <option value="empty">is empty</option>
                                          <option value="not_empty">is not empty</option>
                                        </>
                                      ) : isNum ? (
                                        <>
                                          <option value="eq">equals</option>
                                          <option value="neq">not equals</option>
                                          <option value="gt">greater than</option>
                                          <option value="lt">less than</option>
                                          <option value="gte">≥</option>
                                          <option value="lte">≤</option>
                                          <option value="empty">is empty</option>
                                          <option value="not_empty">is not empty</option>
                                        </>
                                      ) : (
                                        <>
                                          <option value="contains">contains</option>
                                          <option value="not_contains">not contains</option>
                                          <option value="eq">equals</option>
                                          <option value="neq">not equals</option>
                                          <option value="starts">starts with</option>
                                          <option value="ends">ends with</option>
                                          <option value="gt">greater than</option>
                                          <option value="lt">less than</option>
                                          <option value="empty">is empty</option>
                                          <option value="not_empty">is not empty</option>
                                        </>
                                      )}
                                    </select>
                                    {!['empty', 'not_empty'].includes(rule.op) && (
                                      isDate ? (
                                        <input type="date" value={rule.val}
                                          onChange={(e) => { const next = [...dataFilterRules]; next[idx] = { ...rule, val: e.target.value }; setDataFilterRules(next); setDataModalPage(0); }}
                                          className="px-2 py-1 text-[11px] border border-gray-200 rounded flex-1 min-w-[130px]" />
                                      ) : isNum ? (
                                        <input type="number" value={rule.val}
                                          onChange={(e) => { const next = [...dataFilterRules]; next[idx] = { ...rule, val: e.target.value }; setDataFilterRules(next); setDataModalPage(0); }}
                                          className="px-2 py-1 text-[11px] border border-gray-200 rounded flex-1 min-w-[80px] font-mono"
                                          placeholder="0" />
                                      ) : (
                                        <input value={rule.val}
                                          onChange={(e) => { const next = [...dataFilterRules]; next[idx] = { ...rule, val: e.target.value }; setDataFilterRules(next); setDataModalPage(0); }}
                                          className="px-2 py-1 text-[11px] border border-gray-200 rounded flex-1 min-w-[80px] font-mono"
                                          placeholder="Value…" />
                                      )
                                    )}
                                  </>
                                );
                              })()}
                              <button onClick={() => { setDataFilterRules(dataFilterRules.filter((_, i) => i !== idx)); setDataModalPage(0); }}
                                className="p-0.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => setDataFilterRules([...dataFilterRules, { id: Date.now(), col: '', op: 'contains', val: '' }])}
                          className="mt-2 flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">
                          <Plus className="w-3 h-3" /> Add filter rule
                        </button>
                      </div>
                    )}

                    <div className="flex-1 overflow-auto">
                      {columns.length > 0 ? (
                        <table className="w-full text-xs border-collapse">
                          <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-gray-400 border-b border-gray-200 w-10">#</th>
                              {columns.map((col) => {
                                const isSorted = dataModalSort?.col === col;
                                const dir = isSorted ? dataModalSort.dir : null;
                                return (
                                  <th key={col}
                                    onClick={() => {
                                      if (isSorted && dir === 'asc') setDataModalSort({ col, dir: 'desc' });
                                      else if (isSorted && dir === 'desc') setDataModalSort(null);
                                      else { setDataModalSort({ col, dir: 'asc' }); setDataModalPage(0); }
                                    }}
                                    className="text-left px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none">
                                    <span className="inline-flex items-center gap-1">
                                      {col}
                                      {isSorted && <span className="text-indigo-500 text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>}
                                    </span>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {pageRows.map((row, i) => (
                              <tr key={startRow + i} className="hover:bg-indigo-50/30">
                                <td className="px-3 py-1.5 text-gray-400 font-mono">{startRow + i + 1}</td>
                                {columns.map((col) => {
                                  const v = row[col];
                                  const display = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                                  return (
                                    <td key={col} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[200px] truncate font-mono" title={display}>{display}</td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-16">No data available</p>
                      )}
                    </div>
                    <div className="px-5 py-2.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
                      <p className="text-[10px] text-gray-400">
                        Showing {startRow + 1}–{Math.min(startRow + PAGE_SIZE, sortedRows.length)} of {sortedRows.length.toLocaleString()} rows
                        {isFiltered && ` (filtered from ${allRows.length.toLocaleString()})`}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setDataModalPage(0)} disabled={page === 0}
                          className="px-2 py-1 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">First</button>
                        <button onClick={() => setDataModalPage(page - 1)} disabled={page === 0}
                          className="px-2 py-1 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">Prev</button>
                        <span className="text-[10px] text-gray-500 px-2">Page {page + 1} of {totalPages}</span>
                        <button onClick={() => setDataModalPage(page + 1)} disabled={page >= totalPages - 1}
                          className="px-2 py-1 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">Next</button>
                        <button onClick={() => setDataModalPage(totalPages - 1)} disabled={page >= totalPages - 1}
                          className="px-2 py-1 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">Last</button>
                        <div className="w-px h-4 bg-gray-200 mx-1" />
                        <button onClick={() => { setEdgeDataModal(null); setDataModalFilter(''); setDataFilterRules([]); setDataFilterOpen(false); }} className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50">Close</button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* ─── Inspector (right) ────────────────────────────────── */}
          {inspectorOpen && selectedNodeData && (
            <div className="w-96 md:w-[420px] bg-slate-50/50 border-l border-slate-200 flex flex-col flex-shrink-0 z-10 shadow-lg transition-all duration-200">
              {/* Header */}
              <div className="px-4 py-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 shadow-xs">
                    {(() => { const it = paletteItem(selectedNodeData.stepType); const IC = it ? NODE_ICONS[it.icon] : Zap; return <IC className="w-4.5 h-4.5" />; })()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate tracking-tight">{selectedNodeData.label}</h3>
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      {selectedNodeData.stepType.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setInspectorOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isRunning && (
                <div className="mx-4 mt-3 px-3.5 py-2.5 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs font-medium text-amber-800 flex items-center gap-2 shadow-xs">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                  <span>Pipeline is currently running. Pause or stop execution to edit configuration.</span>
                </div>
              )}

              {/* Segmented Pill Tabs */}
              <div className="px-4 pt-3 pb-1">
                <div className="p-1 bg-slate-200/60 rounded-xl flex gap-1 shadow-inner">
                  {(['params', 'output'] as const).map((t) => {
                    const isActive = inspectorTab === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setInspectorTab(t)}
                        className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all duration-150 ${
                          isActive
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {t === 'params' ? (
                          <>
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Parameters</span>
                          </>
                        ) : (
                          <>
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Output</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Inspector Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {inspectorTab === 'params' ? (
                  <>
                    {/* Trigger specific cards */}
                    {selectedNodeData.stepType !== 'source' && (
                      <>
                        {/* Webhook URL */}
                        {selectedNodeData.stepType === 'trigger_webhook' && (() => {
                          const webhookPath = (selectedNodeData.config as Record<string,string>).path || '';
                          const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
                          const webhookUrl = supabaseUrl
                            ? `${supabaseUrl}/functions/v1/webhook-trigger/${webhookPath}`
                            : `${window.location.origin}/functions/v1/webhook-trigger/${webhookPath}`;
                          return (
                            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Webhook URL</span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isRunning ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {isRunning ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 flex items-start gap-2">
                                <code className="text-[11px] text-slate-800 font-mono break-all flex-1 select-all leading-relaxed">{webhookUrl}</code>
                                <button
                                  type="button"
                                  onClick={() => { navigator.clipboard.writeText(webhookUrl); }}
                                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-600 transition-colors"
                                  title="Copy Webhook URL">
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Send a <strong>{(selectedNodeData.config as Record<string,string>).method || 'POST'}</strong> request to this endpoint to trigger execution.
                              </p>
                            </div>
                          );
                        })()}

                        {/* File Arrival */}
                        {selectedNodeData.stepType === 'trigger_file' && (
                          <TriggerFileUploader
                            node={selectedNodeData}
                            jobId={id!}
                            onTrigger={(nodeId) => executeTrigger(nodeId)}
                            onUpdateConfig={(key, value) => setNodes((prev) => prev.map((n) => n.id === selectedNodeData.id ? { ...n, config: { ...n.config, [key]: value } } : n))}
                          />
                        )}

                        {/* Form Submission */}
                        {selectedNodeData.stepType === 'trigger_form' && (
                          <TriggerFormPicker
                            node={selectedNodeData}
                            tenantId={tenantId}
                            environment={environment}
                            jobId={id!}
                            onChange={(updated) => setNodes(prev => prev.map(n => n.id === updated.id ? updated : n))}
                          />
                        )}

                        {/* Chat Submission */}
                        {selectedNodeData.stepType === 'trigger_chat' && (() => {
                          const chatName = (selectedNodeData.config as Record<string,string>).chat_name || 'Workflow Bot';
                          const chatUrl = (selectedNodeData.config as Record<string,string>).public_url || `${window.location.origin}/chat/${id}/${selectedNodeData.id}`;
                          return (
                            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Public Chat Endpoint</span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isRunning ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {isRunning ? `"${chatName}" Live` : 'Standby'}
                                </span>
                              </div>
                              <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 flex items-start gap-2">
                                <code className="text-[11px] text-slate-800 font-mono break-all flex-1 select-all leading-relaxed">{chatUrl}</code>
                                <button
                                  type="button"
                                  onClick={() => { navigator.clipboard.writeText(chatUrl); }}
                                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-600 transition-colors"
                                  title="Copy Chat URL">
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500">Share this URL. When a user submits a message, this pipeline triggers.</p>
                            </div>
                          );
                        })()}

                        {/* Workflow Trigger */}
                        {selectedNodeData.stepType === 'trigger_workflow' && (
                          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sub-Workflow Listener</span>
                            <div className="bg-purple-50/70 border border-purple-200/70 rounded-xl p-3">
                              <p className="text-[11px] text-purple-900 leading-relaxed">
                                Listens for triggers from parent workflows targeting ID: <code className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-purple-200 select-all font-semibold">{id}</code>
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <fieldset disabled={isRunning} className={isRunning ? 'opacity-60 pointer-events-none' : ''}>
                      {selectedNodeData.stepType === 'source' ? (
                        <ReadSchemaInspector node={selectedNodeData} onChange={(updated) => setNodes((prev) => prev.map((n) => n.id === updated.id ? updated : n))} />
                      ) : (
                        <PipelineInspectorParams
                          node={selectedNodeData}
                          tenantId={tenantId ?? undefined}
                          environment={environment ?? 'production'}
                          onChange={(updated) => {
                            setNodes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
                            if (updated.stepType === 'transform_dedupe' && !updated.config.output_duplicates) {
                              setEdges((prev) => prev.filter((e) => !(e.fromId === updated.id && e.fromHandle === 'duplicates')));
                            }
                          }}
                          onStudioOpenChange={setIsEmailStudioOpen}
                          inboundColumns={(() => {
                            const parentEdges = edges.filter((e) => e.toId === selectedNodeData.id);
                            const cols = new Set<string>();
                            for (const pe of parentEdges) {
                              const dataKey = pe.fromHandle ? `${pe.fromId}:${pe.fromHandle}` : pe.fromId;
                              const rows = nodeDataRef.current.get(dataKey) ?? nodeDataRef.current.get(pe.fromId);
                              if (rows && rows.length > 0) {
                                Object.keys(rows[0]).forEach((k) => cols.add(k));
                              } else {
                                const parentNode = nodes.find((n) => n.id === pe.fromId);
                                if (parentNode?.outputColumns) {
                                  parentNode.outputColumns.forEach((k) => cols.add(k));
                                }
                              }
                            }
                            return cols.size > 0 ? Array.from(cols).filter((c) => !c.startsWith('_')) : undefined;
                          })()}
                        />
                      )}
                    </fieldset>
                  </>
                ) : (
                  <div className="space-y-3">
                    {selectedNodeData.lastOutput ? (() => {
                      const out = selectedNodeData.lastOutput as Record<string, unknown>;
                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 text-center shadow-xs">
                              <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">Rows In</p>
                              <p className="text-xl font-bold text-emerald-800 mt-0.5">{out.rows_in != null ? String(out.rows_in) : '—'}</p>
                            </div>
                            <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3 text-center shadow-xs">
                              <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">Rows Out</p>
                              <p className="text-xl font-bold text-blue-800 mt-0.5">{out.rows_out != null ? String(out.rows_out) : '—'}</p>
                            </div>
                          </div>
                          {(out.rows_error as number) > 0 && (
                            <div className="bg-rose-50/80 border border-rose-200/80 rounded-xl p-3 text-center shadow-xs">
                              <p className="text-[10px] text-rose-700 font-semibold uppercase tracking-wider">Error Rows</p>
                              <p className="text-xl font-bold text-rose-800 mt-0.5">{String(out.rows_error)}</p>
                            </div>
                          )}
                          {out.summary && (
                            <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Summary</p>
                              <p className="text-xs text-slate-700 leading-relaxed">{String(out.summary ?? '')}</p>
                            </div>
                          )}
                          {selectedNodeData.lastExecutionTimeMs && (
                            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-mono py-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Executed in {selectedNodeData.lastExecutionTimeMs}ms</span>
                            </div>
                          )}
                          {out.error && (
                            <div className="bg-rose-50/90 rounded-xl p-3.5 border border-rose-200/80 shadow-xs">
                              <p className="text-[10px] text-rose-700 font-bold uppercase tracking-wider mb-1">Execution Error</p>
                              <p className="text-xs text-rose-800 font-mono break-all">{String(out.error)}</p>
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200/80 rounded-2xl bg-white/50">
                        <Terminal className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-medium text-slate-600">No execution data yet</p>
                        <p className="text-[11px] text-slate-400 mt-1">Run the pipeline to see live node outputs</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 bg-white border-t border-slate-200/80">
                <button
                  onClick={() => deleteNode(selectedNodeData.id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-rose-600 bg-rose-50/70 hover:bg-rose-100/90 border border-rose-200/80 rounded-xl transition-all shadow-xs active:scale-[0.99]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Node</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Execution log (bottom, foldable with pagination/sort/filter) ─── */}
        <div className="bg-white border-t border-gray-200 text-gray-800 flex-shrink-0 z-20 shadow-md">
          {/* Executive Run Header & Summary Bar */}
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setLogOpen(!logOpen)}
                className="flex items-center gap-1.5 font-semibold text-gray-800 hover:text-indigo-600 transition-colors"
              >
                <ChevronDown className={cn("w-3.5 h-3.5 text-gray-500 transition-transform duration-200", !logOpen && "-rotate-90")} />
                <span>Execution Log</span>
                <span className="text-[11px] font-normal text-gray-500">({executionLog.length} steps)</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 font-medium">Preview Mode</span>
              </button>

              {runHistory.length > 0 && (
                <select
                  value={selectedRunId}
                  onChange={(e) => {
                    const runId = e.target.value;
                    setSelectedRunId(runId);
                    const match = runHistory.find((r) => r.id === runId);
                    if (match) {
                      setExecutionLog(match.logs);
                      setExecutedNodes(new Set(match.logs.map((l) => l.nodeId)));
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] font-medium border border-gray-200 rounded-md px-2 py-0.5 bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 shadow-xs cursor-pointer"
                >
                  {runHistory.map((r, idx) => (
                    <option key={r.id} value={r.id}>
                      Run #{runHistory.length - idx} · {r.triggeredBy || 'Naman'} ({r.startedAtFormatted || `${r.date} ${r.timestamp}`}) — {r.status}
                    </option>
                  ))}
                </select>
              )}

              {_curRun && (
                <div className="hidden sm:flex items-center gap-2 text-[11px] text-gray-500 font-mono">
                  <span className="text-gray-300">|</span>
                  <span>
                    Started By: <strong className="text-gray-700 font-semibold">{_curRun.triggeredBy || displayName || 'Naman'}</strong>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>
                    When: <strong className="text-gray-700 font-semibold">{_curRun.startedAtFormatted || `${_curRun.date} ${_curRun.timestamp}`}</strong>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold uppercase">
                    {_curRun.triggerSource || 'manual'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Activity className="w-3 h-3 text-emerald-600" />
                Total Executions: {runHistory.length}
              </span>
              {!logOpen && (
                <span className="text-[11px] text-gray-500 font-mono">
                  <span className="text-emerald-600 font-semibold">{_logOkCount} passed</span>
                  {_logFailCount > 0 && <span className="text-red-600 ml-1.5 font-semibold">{_logFailCount} failed</span>}
                </span>
              )}
              {executing && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />}
            </div>
          </div>

          {logOpen && (
            <div className="border-t border-gray-100">
              <div className="px-4 py-1.5 flex items-center gap-2 bg-gray-50/80 border-b border-gray-100">
                <FilterIcon className="w-3 h-3 text-gray-400" />
                <input value={logFilter} onChange={(e) => { setLogFilter(e.target.value); setLogPage(0); }}
                  className="flex-1 text-[11px] bg-transparent border-none outline-none placeholder:text-gray-400 text-gray-700"
                  placeholder="Filter by node, status, or summary…" />
                {logFilter && <button onClick={() => { setLogFilter(''); setLogPage(0); }} className="p-0.5 rounded hover:bg-gray-200"><X className="w-3 h-3 text-gray-400" /></button>}
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-1.5 font-semibold w-8">#</th>
                      <th onClick={() => _logColClick('node')} className="text-left px-4 py-1.5 font-semibold cursor-pointer hover:text-gray-900 select-none">Node{_logSortIcon('node')}</th>
                      <th onClick={() => _logColClick('status')} className="text-left px-4 py-1.5 font-semibold cursor-pointer hover:text-gray-900 select-none">Status{_logSortIcon('status')}</th>
                      <th onClick={() => _logColClick('time')} className="text-left px-4 py-1.5 font-semibold cursor-pointer hover:text-gray-900 select-none">Time{_logSortIcon('time')}</th>
                      <th onClick={() => _logColClick('rows_in')} className="text-left px-4 py-1.5 font-semibold cursor-pointer hover:text-gray-900 select-none">Rows In{_logSortIcon('rows_in')}</th>
                      <th onClick={() => _logColClick('rows_out')} className="text-left px-4 py-1.5 font-semibold cursor-pointer hover:text-gray-900 select-none">Rows Out{_logSortIcon('rows_out')}</th>
                      <th onClick={() => _logColClick('errors')} className="text-left px-4 py-1.5 font-semibold cursor-pointer hover:text-gray-900 select-none">Errors{_logSortIcon('errors')}</th>
                      <th className="text-left px-4 py-1.5 font-semibold">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {_pageLog.map((log, i) => (
                      <tr key={_logP * _LOG_PAGE_SIZE + i} className="hover:bg-indigo-50/40 cursor-pointer transition-colors" onClick={() => { setSelectedNode(log.nodeId); setSelectedNodes(new Set([log.nodeId])); setInspectorOpen(true); setInspectorTab('output'); }}>
                        <td className="px-4 py-1.5 text-gray-400 font-mono text-[11px]">{_logP * _LOG_PAGE_SIZE + i + 1}</td>
                        <td className="px-4 py-1.5 font-medium text-gray-800">{log.title}</td>
                        <td className="px-4 py-1.5">
                          <span className={`inline-flex items-center gap-1 font-medium text-[11px] ${log.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {log.status === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-gray-500 font-mono text-[11px]">{log.ms}ms</td>
                        <td className="px-4 py-1.5 text-gray-500 font-mono text-[11px]">{(log.output as Record<string, unknown>)?.rows_in ?? '—'}</td>
                        <td className="px-4 py-1.5 text-gray-500 font-mono text-[11px]">{(log.output as Record<string, unknown>)?.rows_out ?? '—'}</td>
                        <td className="px-4 py-1.5 font-mono text-[11px]">{((log.output as Record<string, unknown>)?.rows_error as number) > 0 ? <span className="text-red-600 font-semibold">{String((log.output as Record<string, unknown>).rows_error)}</span> : <span className="text-gray-400">0</span>}</td>
                        <td className="px-4 py-1.5 text-gray-600 truncate max-w-[300px]">
                          {String((log.output as Record<string, unknown>)?.summary ?? '')}
                          {(log.output as Record<string, unknown>)?.error_category && (
                            <span className={cn('ml-1.5 text-[9px] px-1 py-0.5 rounded font-medium',
                              (log.output as Record<string, unknown>).error_category === 'transient' ? 'bg-amber-50 text-amber-600' :
                              (log.output as Record<string, unknown>).error_category === 'configuration' ? 'bg-blue-50 text-blue-600' :
                              'bg-red-50 text-red-600')}>
                              {String((log.output as Record<string, unknown>).error_category)}{(log.output as Record<string, unknown>).retryable ? ' · retryable' : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {_logTotalPages > 1 && (
                <div className="px-4 py-1.5 border-t border-gray-200 flex items-center justify-between bg-gray-50/80">
                  <span className="text-[10px] text-gray-500">{_filteredLog.length} entries{_logLq ? ` (filtered)` : ''}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLogPage(0)} disabled={_logP === 0} className="px-1.5 py-0.5 text-[10px] text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">First</button>
                    <button onClick={() => setLogPage(_logP - 1)} disabled={_logP === 0} className="px-1.5 py-0.5 text-[10px] text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">Prev</button>
                    <span className="text-[10px] text-gray-600 px-1 font-medium">{_logP + 1}/{_logTotalPages}</span>
                    <button onClick={() => setLogPage(_logP + 1)} disabled={_logP >= _logTotalPages - 1} className="px-1.5 py-0.5 text-[10px] text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">Next</button>
                    <button onClick={() => setLogPage(_logTotalPages - 1)} disabled={_logP >= _logTotalPages - 1} className="px-1.5 py-0.5 text-[10px] text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">Last</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Schedule tab ───────────────────────────────────────────────────
  if (pageTab === 'schedule') {
    return (
      <div>
        <div className="mb-4 flex items-center gap-3">
          <Link to={backHref} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{job.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="success">{job.status}</Badge>
              <span className="text-xs text-slate-500">{JOB_TYPES.find((t) => t.value === job.job_type)?.label ?? job.job_type}</span>
            </div>
          </div>
        </div>

        <div className="mb-3 flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {([
            { id: 'workflow' as PageTab, label: 'Canvas', icon: GitBranch },
            { id: 'versions' as PageTab, label: 'Versions', icon: History },
          ]).map(({ id: tabId, label, icon: Icon }) => (
            <button key={tabId} onClick={() => setPageTab(tabId)}
              className={cn('inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium', pageTab === tabId ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">Automated schedule</h3>
          <p className="mt-1 text-sm text-slate-500">Pick a preset or write a cron expression.</p>
          <div className="mt-4">
            <CronEditor value={scheduleCron} onChange={setScheduleCron} tz={scheduleTz} onTzChange={setScheduleTz} />
          </div>
          {scheduleCron.trim() && (
            <button type="button" onClick={() => setScheduleCron('')} className="mt-2 text-xs font-medium text-slate-500 hover:text-red-600">Clear schedule</button>
          )}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">Alerts</h4>
            <p className="mt-0.5 text-xs text-slate-500">POST a JSON summary to a webhook when a run finishes.</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {(['failed', 'partial', 'succeeded'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={alertOn.includes(s)} onChange={(e) => setAlertOn((prev) => e.target.checked ? [...prev, s] : prev.filter((x) => x !== s))} /> {s}
                </label>
              ))}
            </div>
            <input value={alertWebhook} onChange={(e) => setAlertWebhook(e.target.value)} placeholder="https://hooks.example.com/pipeline-alerts"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" onClick={() => saveWorkflow.mutate()}>Save</Button>
            <Link to="/data/schedules" className="text-xs font-medium text-brand-600 hover:text-brand-700">All schedules →</Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Versions tab ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(backHref)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-sm font-bold text-gray-900">{job.name}</h1>
          <StatusBadge liveStatus={liveStatus} />
          {typeof job.current_version === 'number' && job.current_version > 0 && (
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-semibold">
              v{job.current_version}
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
              <Activity className="w-3 h-3" /> Running
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200">
          {([
            { id: 'workflow' as PageTab, label: 'Canvas', icon: GitBranch },
            { id: 'versions' as PageTab, label: 'Versions', icon: History },
          ]).map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setPageTab(tabId)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors',
                pageTab === tabId ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto max-w-7xl w-full mx-auto">
        <VersionsTab jobId={id!} currentVersion={job.current_version ?? 0} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Inspector Params — driven by NODE_CONFIG_FIELDS
// ═══════════════════════════════════════════════════════════════════════════

function TriggerFileUploader({ node, jobId, onTrigger, onUpdateConfig }: {
  node: CanvasNode; jobId: string;
  onTrigger: (nodeId: string, fileInfo: { name: string; size: number; type: string }) => void;
  onUpdateConfig?: (key: string, value: unknown) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'paused' | 'completed' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; type: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const config = node.config as Record<string, string>;
  const expectedFormat = config.format || 'csv';
  const fileNamePattern = config.file_name_pattern || '';

  const fileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['xlsx', 'xls'].includes(ext)) return { bg: 'bg-emerald-600', label: ext.toUpperCase() };
    if (['csv', 'tsv'].includes(ext)) return { bg: 'bg-blue-600', label: ext.toUpperCase() };
    if (['json', 'jsonl'].includes(ext)) return { bg: 'bg-amber-600', label: ext.toUpperCase() };
    if (['xml'].includes(ext)) return { bg: 'bg-orange-600', label: ext.toUpperCase() };
    if (['parquet', 'avro'].includes(ext)) return { bg: 'bg-purple-600', label: ext.toUpperCase() };
    return { bg: 'bg-gray-600', label: ext.toUpperCase() || 'FILE' };
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const startUpload = async (file: File) => {
    setFileInfo({ name: file.name, size: file.size, type: file.type });
    setUploadState('uploading');
    setProgress(0);

    const storagePath = `workflow-samples/${jobId}/${file.name}`;
    try {
      const { error } = await supabase.storage
        .from('form-uploads')
        .upload(storagePath, file, { upsert: true });
      if (error) throw error;

      setProgress(100);
      setUploadState('completed');
      onUpdateConfig?.('sample_file_path', storagePath);
      onUpdateConfig?.('sample_file_bucket', 'form-uploads');

      // Broadcast trigger event
      const channel = supabase.channel(`workflow-trigger:${jobId}`);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'trigger_fire',
            payload: {
              node_id: node.id,
              event_type: 'file_arrival',
              file_name: file.name,
              file_size: file.size,
              submitted_at: new Date().toISOString(),
            },
          }).then(() => supabase.removeChannel(channel));
        }
      });
      onTrigger(node.id, { name: file.name, size: file.size, type: file.type });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as Record<string, unknown>).message) : String(err);
      console.error('Sample file upload failed:', msg, err);
      setUploadError(msg);
      setUploadState('error');
    }
  };

  const togglePause = () => {
    if (uploadState === 'uploading') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setUploadState('paused');
    } else if (uploadState === 'paused') {
      setUploadState('uploading');
      let p = progress;
      intervalRef.current = setInterval(() => {
        p += Math.random() * 8 + 2;
        if (p >= 100) {
          p = 100;
          if (intervalRef.current) clearInterval(intervalRef.current);
          setProgress(100);
          setUploadState('completed');
          if (fileInfo) onTrigger(node.id, fileInfo);
        } else {
          setProgress(p);
        }
      }, 120);
    }
  };

  const cancelUpload = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setUploadState('idle');
    setProgress(0);
    setFileInfo(null);
  };

  const reset = () => {
    setUploadState('idle');
    setProgress(0);
    setFileInfo(null);
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) startUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startUpload(file);
  };

  const fi = fileInfo ? fileIcon(fileInfo.name) : null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sample File Upload</p>
        <div className="group relative">
          <Info className="w-3 h-3 text-gray-400 hover:text-indigo-500 cursor-help" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 p-2 bg-gray-900 text-white text-[10px] leading-relaxed rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
            A sample file is required to match column headers and data types from incoming files. Any change in file format will fail daily imports.
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      </div>
      <p className="text-[9px] text-gray-400">Stored in: workflow-samples › {jobId}</p>

      {uploadState === 'idle' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200',
            dragOver
              ? 'border-indigo-400 bg-indigo-50 scale-[1.02]'
              : 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50'
          )}>
          <input ref={inputRef} type="file" className="hidden" onChange={handleFileSelect}
            accept={expectedFormat === 'csv' ? '.csv' : expectedFormat === 'json' ? '.json' : '*'} />
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2.5">
            <UploadCloud className={cn('w-5 h-5 transition-colors', dragOver ? 'text-indigo-500' : 'text-gray-400')} />
          </div>
          <p className="text-xs font-medium text-gray-700">
            {dragOver ? 'Drop file here' : 'Drop file or click to browse'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            {fileNamePattern ? `Expects: ${fileNamePattern}.${expectedFormat}` : `Accepts ${expectedFormat.toUpperCase()} files`}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          {/* File card */}
          <div className="flex items-center gap-3">
            {/* File type icon */}
            <div className={cn('w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 text-white', fi?.bg || 'bg-gray-600')}>
              <FileSpreadsheet className="w-4 h-4" />
              <span className="text-[7px] font-bold mt-0.5 leading-none">{fi?.label}</span>
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{fileInfo?.name}</p>
              {uploadState === 'completed' ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] font-medium text-emerald-600">Completed · {formatSize(fileInfo?.size || 0)}</span>
                </div>
              ) : uploadState === 'error' ? (
                <span className="text-[10px] text-red-500 font-medium">Upload failed: {uploadError || 'Unknown error'}</span>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn('text-[10px] font-medium', uploadState === 'paused' ? 'text-amber-600' : 'text-blue-600')}>
                    {uploadState === 'paused' ? 'Paused' : `Uploading ${Math.round(progress)}%`}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    · {formatSize(Math.round((fileInfo?.size || 0) * progress / 100))} of {formatSize(fileInfo?.size || 0)}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {(uploadState === 'uploading' || uploadState === 'paused') && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={togglePause}
                  className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  title={uploadState === 'paused' ? 'Resume' : 'Pause'}>
                  {uploadState === 'paused'
                    ? <Play className="w-2.5 h-2.5 text-gray-600 fill-current" />
                    : <PauseIcon className="w-2.5 h-2.5 text-gray-600" />}
                </button>
                <button type="button" onClick={cancelUpload}
                  className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                  title="Cancel">
                  <X className="w-2.5 h-2.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {(uploadState === 'uploading' || uploadState === 'paused') && (
            <div className="mt-2.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300 ease-out',
                  uploadState === 'paused'
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Completed state — success bar */}
          {uploadState === 'completed' && (
            <div className="mt-2.5">
              <div className="h-1.5 bg-emerald-500 rounded-full" />
              <p className="text-[9px] text-emerald-600 mt-1.5 font-medium">
                File received — workflow triggered!
              </p>
              <button type="button" onClick={reset}
                className="text-[9px] text-gray-400 hover:text-gray-600 mt-1 underline">
                Upload another file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TriggerFormPicker({ node, tenantId, environment, onChange }: {
  node: CanvasNode; tenantId: string; environment: string; jobId: string;
  onChange: (n: CanvasNode) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const { data: forms, isLoading } = useQuery({
    queryKey: ['forms-for-trigger', tenantId, environment],
    queryFn: () => fetchForms(tenantId, environment),
    staleTime: 30_000,
  });

  const selectedFormId = (node.config as Record<string, string>).form_id;
  const selectedFormName = (node.config as Record<string, string>).form_name;
  const selectedForm = forms?.find(f => f.id === selectedFormId);

  const filtered = (forms ?? []).filter(f =>
    f.status === 'published' && (!search || f.name.toLowerCase().includes(search.toLowerCase()))
  );

  const selectForm = (f: MarbeeForm) => {
    onChange({ ...node, config: { ...node.config, form_id: f.id, form_name: f.name } });
    setOpen(false);
    setSearch('');
  };

  const publicUrl = selectedForm
    ? getFormPublicUrl(selectedForm.slug, tenantId, environment)
    : selectedFormId
    ? `${window.location.origin}/forms/${selectedFormId}`
    : null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 space-y-2">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Select Form</p>

      {/* Search dropdown */}
      <div className="relative">
        <div
          onClick={() => setOpen(!open)}
          className={cn('w-full px-2.5 py-2 text-xs border rounded-lg cursor-pointer flex items-center justify-between gap-1',
            open ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200 hover:border-gray-300')}>
          <span className={selectedFormName ? 'text-gray-800 font-medium' : 'text-gray-400'}>
            {selectedFormName || 'Search forms…'}
          </span>
          <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', open && 'rotate-180')} />
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="p-1.5 border-b border-gray-100">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search forms…"
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {isLoading ? (
                <div className="p-3 text-center text-[10px] text-gray-400">Loading forms…</div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-gray-400">
                  {search ? 'No forms match' : 'No published forms found'}
                </div>
              ) : (
                filtered.map(f => (
                  <button key={f.id} type="button"
                    onClick={() => selectForm(f)}
                    className={cn('w-full text-left px-2.5 py-2 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0',
                      f.id === selectedFormId && 'bg-indigo-50')}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-800">{f.name}</span>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                        f.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                        {f.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {f.fields.filter(fld => fld.name).slice(0, 6).map(fld => (
                        <span key={fld.id} className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-[9px] text-gray-500 font-mono">
                          {fld.name}
                        </span>
                      ))}
                      {f.fields.length > 6 && (
                        <span className="text-[9px] text-gray-400">+{f.fields.length - 6} more</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected form details + public URL */}
      {selectedFormId && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-medium text-indigo-700">
              {selectedForm ? `"${selectedForm.name}" selected` : selectedFormName || 'Form selected'}
            </span>
          </div>

          {selectedForm && (
            <div className="flex flex-wrap gap-1">
              {selectedForm.fields.filter(f => f.name).map(f => (
                <span key={f.id} className="px-1.5 py-0.5 bg-white border border-indigo-200 rounded text-[9px] text-indigo-600 font-mono">
                  {f.name}
                </span>
              ))}
            </div>
          )}

          {publicUrl && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2">Public Form URL</p>
              <div className="bg-white border border-indigo-200 rounded-md p-2 flex items-start gap-1.5">
                <code className="text-[10px] text-gray-800 font-mono break-all flex-1 select-all">{publicUrl}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(publicUrl)}
                  className="flex-shrink-0 p-1 rounded hover:bg-indigo-100 text-indigo-600 transition-colors"
                  title="Copy URL">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[9px] text-gray-500">When a visitor submits this form, the workflow triggers.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineInspectorParams({
  node,
  tenantId,
  environment,
  onChange,
  onStudioOpenChange,
  inboundColumns,
}: {
  node: CanvasNode;
  tenantId?: string;
  environment?: string;
  onChange: (n: CanvasNode) => void;
  onStudioOpenChange?: (isOpen: boolean) => void;
  inboundColumns?: string[];
}) {
  const [folderPickerState, setFolderPickerState] = useState<{ open: boolean; fieldKey: string; current: string }>({ open: false, fieldKey: '', current: '' });
  const updateConfig = (key: string, value: unknown) => {
    onChange({ ...node, config: { ...node.config, [key]: value } });
  };
  const updateField = (key: keyof CanvasNode, value: unknown) => {
    onChange({ ...node, [key]: value } as CanvasNode);
  };

  const isEmailNode =
    node.stepType === 'send_email' ||
    node.stepType === 'action_email' ||
    node.stepType === 'target_email' ||
    node.stepType === 'email' ||
    node.stepType.includes('email');

  if (isEmailNode) {
    return (
      <SendEmailActivityConfigurator
        activityName={node.label}
        onActivityNameChange={(label) => updateField('label', label)}
        config={(node.config as any) || {}}
        onChange={(updatedConfig) => onChange({ ...node, config: updatedConfig })}
        tenantId={tenantId}
        environment={environment}
        onStudioOpenChange={onStudioOpenChange}
      />
    );
  }

  const fields = NODE_CONFIG_FIELDS[node.stepType] ?? [];

  return (
    <div className="space-y-3">
      <Field label="Label">
        <input value={node.label} onChange={(e) => updateField('label', e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
      </Field>

      {fields.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Configuration</p>
        </div>
      )}

      {fields.map((f) => {
        if (f.visibleWhen && String(node.config[f.visibleWhen.key] ?? '') !== f.visibleWhen.value) return null;
        switch (f.kind) {
          case 'text':
            return (
              <Field key={f.key} label={f.label}>
                <input value={String(node.config[f.key] ?? '')} onChange={(e) => updateConfig(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                {f.hint && <p className="text-[9px] text-gray-400 mt-0.5">{f.hint}</p>}
              </Field>
            );
          case 'number':
            return (
              <Field key={f.key} label={f.label}>
                <input type="number" value={Number(node.config[f.key] ?? 0)} min={f.min} max={f.max}
                  onChange={(e) => updateConfig(f.key, Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
              </Field>
            );
          case 'textarea':
            return (
              <Field key={f.key} label={f.label}>
                <textarea value={String(node.config[f.key] ?? '')} rows={f.rows ?? 3}
                  onChange={(e) => updateConfig(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className={`w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md ${f.mono ? 'font-mono' : ''} focus:outline-none focus:ring-1 focus:ring-indigo-500/40 resize-none`} />
                {f.hint && <p className="text-[9px] text-gray-400 mt-0.5">{f.hint}</p>}
              </Field>
            );
          case 'select':
            return (
              <Field key={f.key} label={f.label}>
                <select value={String(node.config[f.key] ?? '')} onChange={(e) => updateConfig(f.key, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md">
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            );
          case 'toggle':
            return (
              <label key={f.key} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={!!node.config[f.key]} onChange={(e) => updateConfig(f.key, e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                {f.label}
                {f.hint && <span className="text-[9px] text-gray-400">({f.hint})</span>}
              </label>
            );
          case 'schema':
            return (
              <Field key={f.key} label={f.label}>
                <input value={String(node.config[f.key] ?? '')} onChange={(e) => updateConfig(f.key, e.target.value)}
                  placeholder="e.g. customer"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
              </Field>
            );
          case 'connector':
            return (
              <Field key={f.key} label={f.label}>
                <input value={String(node.config[f.key] ?? '')} onChange={(e) => updateConfig(f.key, e.target.value)}
                  placeholder="Connector ID"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
              </Field>
            );
          case 'time':
            return (
              <Field key={f.key} label={f.label}>
                <input type="time" value={String(node.config[f.key] ?? '02:00')} onChange={(e) => updateConfig(f.key, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                {f.hint && <p className="text-[9px] text-gray-400 mt-0.5">{f.hint}</p>}
              </Field>
            );
          case 'date':
            return (
              <Field key={f.key} label={f.label}>
                <input type="date" value={String(node.config[f.key] ?? '')} onChange={(e) => updateConfig(f.key, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                {f.hint && <p className="text-[9px] text-gray-400 mt-0.5">{f.hint}</p>}
              </Field>
            );
          case 'multi_select':
            return (
              <Field key={f.key} label={f.label}>
                <div className="flex flex-wrap gap-1">
                  {f.options.map((o) => {
                    const sel = Array.isArray(node.config[f.key]) ? (node.config[f.key] as string[]) : [];
                    const active = sel.includes(o.value);
                    return (
                      <button key={o.value} type="button"
                        onClick={() => updateConfig(f.key, active ? sel.filter((v) => v !== o.value) : [...sel, o.value])}
                        className={cn('px-2 py-1 text-[10px] rounded-md border transition-colors font-medium',
                          active ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {f.hint && <p className="text-[9px] text-gray-400 mt-0.5">{f.hint}</p>}
              </Field>
            );
          case 'column_picker': {
            const currentVal = String(node.config[f.key] ?? '');
            const selectedCols = currentVal.split(',').map((s) => s.trim()).filter(Boolean);
            const toggleCol = (col: string) => {
              const next = selectedCols.includes(col) ? selectedCols.filter((c) => c !== col) : [...selectedCols, col];
              updateConfig(f.key, next.join(', '));
            };
            return (
              <Field key={f.key} label={f.label}>
                {inboundColumns && inboundColumns.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                      {inboundColumns.map((col) => {
                        const active = selectedCols.includes(col);
                        return (
                          <button key={col} type="button" onClick={() => toggleCol(col)}
                            className={cn('px-2 py-1 text-[10px] rounded-md border transition-colors font-mono',
                              active ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50')}>
                            {col}
                          </button>
                        );
                      })}
                    </div>
                    {selectedCols.length > 0 && (
                      <p className="text-[10px] text-indigo-600 font-medium">{selectedCols.length} field{selectedCols.length > 1 ? 's' : ''} selected</p>
                    )}
                  </div>
                ) : (
                  <input value={currentVal} onChange={(e) => updateConfig(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500/40" />
                )}
                {f.hint && <p className="text-[9px] text-gray-400 mt-0.5">{f.hint}</p>}
              </Field>
            );
          }
          case 'folder_picker': {
            const folderVal = String(node.config[f.key] ?? '');
            return (
              <Field key={f.key} label={f.label}>
                <button type="button"
                  onClick={() => setFolderPickerState({ open: true, fieldKey: f.key, current: folderVal })}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs border border-gray-200 rounded-md hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-left">
                  <Folder className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className={cn('flex-1 truncate', folderVal ? 'text-gray-900 font-mono' : 'text-gray-400')}>
                    {folderVal || f.placeholder || 'Select folder…'}
                  </span>
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                </button>
                {f.hint && <p className="text-[9px] text-gray-400 mt-0.5">{f.hint}</p>}
              </Field>
            );
          }
          default:
            return null;
        }
      })}

      {folderPickerState.open && (
        <FolderPickerModal
          current={folderPickerState.current}
          onSelect={(path) => { updateConfig(folderPickerState.fieldKey, path); setFolderPickerState({ open: false, fieldKey: '', current: '' }); }}
          onClose={() => setFolderPickerState({ open: false, fieldKey: '', current: '' })}
        />
      )}

      <div className="border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={!!node.disabled} onChange={(e) => updateField('disabled', e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          Disabled (skip during execution)
        </label>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// Versions Tab (Revamped with 7-Day Purge Notice & Modern Design System)
// ═══════════════════════════════════════════════════════════════════════════

function VersionsTab({ jobId, currentVersion }: { jobId: string; currentVersion: number }) {
  const { data: dbVersions, isLoading } = usePipelineVersions(jobId);
  const restore = useRestorePipelineVersion(jobId);
  const [fromV, setFromV] = useState<number | null>(null);
  const [toV, setToV] = useState<number | null>(null);

  // Combine DB versions with local fallback version snapshots
  const versions = useMemo(() => {
    let localList: PipelineVersion[] = [];
    try {
      const saved = localStorage.getItem(`data_job_versions_${jobId}`);
      if (saved) localList = JSON.parse(saved);
    } catch {}
    const map = new Map<number, PipelineVersion>();
    [...localList, ...(dbVersions ?? [])].forEach((v) => {
      if (!map.has(v.version_number)) map.set(v.version_number, v);
    });
    return Array.from(map.values()).sort((a, b) => b.version_number - a.version_number);
  }, [dbVersions, jobId]);

  useEffect(() => {
    // Automatically purge execution logs older than 7 days on versions tab visit
    void purge7DayLogs(jobId);
  }, [jobId]);

  useEffect(() => {
    if (!versions || versions.length < 2) return;
    setToV(versions[0].version_number);
    setFromV(versions[1].version_number);
  }, [versions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading versions...
      </div>
    );
  }

  if (!versions?.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mb-3">
          <History className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">No Version Snapshots Yet</h3>
        <p className="mt-1 text-sm text-slate-500">
          Click <strong>Publish</strong> on the workflow canvas toolbar to publish your first version snapshot.
        </p>
      </div>
    );
  }

  const from = versions.find((v) => v.version_number === fromV);
  const to = versions.find((v) => v.version_number === toV);
  const diff = from && to ? diffPipelineSnapshots(from.snapshot, to.snapshot) : [];

  return (
    <div className="space-y-6">
      {/* 7-Day Log Retention & Purge Policy Banner */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 p-4 text-slate-100 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">7-Day Execution Log Retention &amp; Version History Policy</h4>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">Auto-Purge Active</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-300">
              All workflow execution run logs are stored in execution tables and auto-purged after 7 days. Version snapshots created on <strong>Publish</strong> are stored permanently.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Version Timeline Card List (Left) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Version Snapshots</h3>
            <span className="text-xs text-slate-400 font-mono">{versions.length} recorded</span>
          </div>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {versions.map((v, idx) => {
              const isCurrent = v.version_number === currentVersion;
              const snapshotGraph = parseWorkflowGraph(v.snapshot?.graph);
              const nodeCount = snapshotGraph?.nodes?.length ?? 0;
              const edgeCount = snapshotGraph?.edges?.length ?? 0;

              // Compute diff against previous version snapshot
              const prevVersion = versions[idx + 1];
              const versionDiff = prevVersion ? diffPipelineSnapshots(prevVersion.snapshot, v.snapshot) : [];

              const addedNodesCount = versionDiff.filter((d) => d.kind === 'node_added').length;
              const removedNodesCount = versionDiff.filter((d) => d.kind === 'node_removed').length;
              const modifiedNodesCount = versionDiff.filter((d) => d.kind === 'node_reconfigured' || d.kind === 'node_relabeled' || d.kind === 'node_retyped').length;
              const addedEdgesCount = versionDiff.filter((d) => d.kind === 'edge_added').length;
              const removedEdgesCount = versionDiff.filter((d) => d.kind === 'edge_removed').length;

              return (
                <div
                  key={v.id}
                  className={cn(
                    'group relative rounded-xl border p-4 transition-all duration-200 shadow-sm',
                    isCurrent
                      ? 'border-emerald-500/40 bg-slate-900 text-white ring-1 ring-emerald-500/30'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:shadow-md'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-mono font-bold text-base', isCurrent ? 'text-emerald-400' : 'text-slate-900')}>
                        v{v.version_number}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/40 animate-pulse">
                          <Circle className="h-1.5 w-1.5 fill-emerald-400 text-emerald-400" /> CURRENT
                        </span>
                      )}
                    </div>
                    <span className={cn('text-[11px] font-mono', isCurrent ? 'text-slate-400' : 'text-slate-500')}>
                      {new Date(v.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className={cn('mt-2 text-xs font-medium', isCurrent ? 'text-slate-300' : 'text-slate-600')}>
                    {v.change_notes || 'Version snapshot'}
                  </p>

                  {/* Highlighted badges for added/modified/removed changes */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {addedNodesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                        +{addedNodesCount} Node{addedNodesCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {removedNodesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-500">
                        -{removedNodesCount} Node{removedNodesCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {modifiedNodesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                        ~{modifiedNodesCount} Modified
                      </span>
                    )}
                    {addedEdgesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-500">
                        +{addedEdgesCount} Edge{addedEdgesCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {removedEdgesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold text-purple-500">
                        -{removedEdgesCount} Edge{removedEdgesCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {versionDiff.length === 0 && prevVersion && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        No graph diff
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100/10 pt-2.5 text-[11px]">
                    <span className={cn('font-mono', isCurrent ? 'text-slate-400' : 'text-slate-500')}>
                      {nodeCount} nodes · {edgeCount} connections
                    </span>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Restore v${v.version_number}? This will update the canvas graph to match v${v.version_number}.`)) {
                            restore.mutate(v);
                          }
                        }}
                        disabled={restore.isPending}
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" /> Restore
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Visual Diff Comparison View (Right) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Compare Versions</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select two version snapshots to inspect structural differences in workflow nodes and connections.</p>
              </div>

              {versions.length >= 2 && (
                <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    From
                    <select
                      value={fromV ?? ''}
                      onChange={(e) => setFromV(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.version_number}>v{v.version_number}</option>
                      ))}
                    </select>
                  </label>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    To
                    <select
                      value={toV ?? ''}
                      onChange={(e) => setToV(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.version_number}>v{v.version_number}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {versions.length < 2 ? (
              <div className="py-12 text-center text-slate-400">
                <GitBranch className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                <p className="text-sm font-medium">Single version snapshot available</p>
                <p className="text-xs text-slate-500 mt-1">Make changes on canvas and click <strong>Publish</strong> again to create v2 for visual comparison.</p>
              </div>
            ) : from && to ? (
              <PipelineDiffView fromVersion={from.version_number} toVersion={to.version_number} diff={diff} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
// end of DataJobDetailPage component

// ═══════════════════════════════════════════════════════════════════════════
// Folder Picker Modal — browse Files module folders
// ═══════════════════════════════════════════════════════════════════════════

function FolderPickerModal({ current, onSelect, onClose }: {
  current: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const { tenantId, environment } = useAuth();
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('file_folders')
          .select('path')
          .eq('tenant_id', tenantId!)
          .eq('environment', environment || 'production')
          .order('path');
        if (data && data.length > 0) {
          setFolders(data.map((r: { path: string }) => r.path));
        } else {
          setFolders(['/Documents', '/Images', '/Videos', '/Archives', '/Workflows', '/Workflows/File Arrival Sample Files']);
        }
      } catch {
        setFolders(['/Documents', '/Images', '/Videos', '/Archives', '/Workflows', '/Workflows/File Arrival Sample Files']);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId, environment]);
  const [selected, setSelected] = useState(current || '/');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    s.add('/');
    if (current) {
      const parts = current.split('/').filter(Boolean);
      let p = '';
      for (const part of parts) { p += `/${part}`; s.add(p); }
    }
    return s;
  });
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (newFolderParent !== null) newFolderRef.current?.focus(); }, [newFolderParent]);

  type TreeNode = { name: string; path: string; children: TreeNode[] };

  const tree = useMemo(() => {
    const root: TreeNode = { name: 'All Files', path: '/', children: [] };
    const map = new Map<string, TreeNode>();
    map.set('/', root);
    const sorted = [...folders].sort();
    for (const f of sorted) {
      const parts = f.split('/').filter(Boolean);
      let parentPath = '/';
      for (let i = 0; i < parts.length; i++) {
        const nodePath = '/' + parts.slice(0, i + 1).join('/');
        if (!map.has(nodePath)) {
          const node: TreeNode = { name: parts[i], path: nodePath, children: [] };
          map.set(nodePath, node);
          const parent = map.get(parentPath);
          if (parent) parent.children.push(node);
        }
        parentPath = nodePath;
      }
    }
    return root;
  }, [folders]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !newFolderParent || !tenantId) return;
    const name = newFolderName.trim();
    const path = newFolderParent === '/' ? `/${name}` : `${newFolderParent}/${name}`;
    if (!folders.includes(path)) {
      await supabase.from('file_folders').insert({
        tenant_id: tenantId,
        environment: environment || 'production',
        path,
        name,
        parent_path: newFolderParent,
      });
      setFolders((prev) => [...prev, path]);
    }
    setExpanded((prev) => new Set([...prev, newFolderParent]));
    setSelected(path);
    setNewFolderParent(null);
    setNewFolderName('');
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(node.path);
    const isSelected = selected === node.path;
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.path}>
        <button type="button"
          onClick={() => { setSelected(node.path); if (hasChildren) toggleExpand(node.path); }}
          onDoubleClick={() => { setSelected(node.path); onSelect(node.path); }}
          className={cn('w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors',
            isSelected ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50')}
          style={{ paddingLeft: `${8 + depth * 16}px` }}>
          {hasChildren ? (
            <ChevronRight className={cn('w-3 h-3 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
          ) : (
            <span className="w-3" />
          )}
          {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children.map((c) => renderNode(c, depth + 1))}
        {isExpanded && newFolderParent === node.path && (
          <div className="flex items-center gap-1 ml-2" style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}>
            <Folder className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <input ref={newFolderRef} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setNewFolderParent(null); setNewFolderName(''); } }}
              placeholder="New folder name"
              className="flex-1 px-1.5 py-1 text-xs border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <button type="button" onClick={createFolder} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium px-1">✓</button>
            <button type="button" onClick={() => { setNewFolderParent(null); setNewFolderName(''); }} className="text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[380px] max-h-[500px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Select Watch Folder</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              <span className="ml-2 text-xs text-gray-500">Loading folders…</span>
            </div>
          ) : renderNode(tree, 0)}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
          <button type="button" onClick={() => setNewFolderParent(selected || '/')}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
            <Plus className="w-3 h-3" /> New Folder
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
            <button type="button" onClick={() => onSelect(selected)}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium">
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
