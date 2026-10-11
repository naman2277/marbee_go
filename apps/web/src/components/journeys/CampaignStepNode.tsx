import { Handle, Position, type NodeProps } from 'reactflow';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Play,
  Settings,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { useCampaignCanvas } from '@/components/journeys/CampaignCanvasContext';
import {
  CAMPAIGN_ICONS,
  categoryAccent,
  configSummary,
  paletteItem,
  type CampaignNodeCategory,
} from '@/lib/campaign-nodes';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import { useCampaignRuntime } from '@/lib/campaign-runtime-store';
import { spectrumCategoryAccent } from '@/lib/spectrum-canvas-tokens';

export function CampaignStepNode({ id, data, selected }: NodeProps<CampaignNodeData>) {
  const { spectrumTheme, onSelectNode, onDuplicateNode, onDeleteNode, onRunNode } = useCampaignCanvas() as any;
  const runtime = useCampaignRuntime();
  const meta = paletteItem(data.stepType);
  const Icon = CAMPAIGN_ICONS[meta?.icon ?? 'mail'] ?? Sparkles;
  const summary = configSummary(data.stepType, data.config ?? {});
  const accent = meta?.accent ?? '#64748b';
  const category = meta?.category;
  const categoryColor = category
    ? spectrumTheme
      ? spectrumCategoryAccent(category)
      : categoryAccent(category)
    : accent;
  const outputs = meta?.outputs;
  const isEntry = meta?.entryOnly;
  const isTerminal = meta?.terminal;
  const isSource = ['query', 'read_list', 'incremental_query'].includes(data.stepType);

  let runStatus: CampaignNodeData['runStatus'] = 'idle';
  if (runtime.workflowEnabled) {
    if (runtime.deliveryPendingNodeId === id) runStatus = 'delivery_pending';
    else if (runtime.runningNodeId === id) runStatus = 'running';
    else if (runtime.runStatusByNode[id]) runStatus = runtime.runStatusByNode[id];
  }
  const liveCount =
    (runtime.workflowEnabled
      ? runtime.countsByNode[id] ?? runtime.nodeLiveCounts?.[id]
      : runtime.nodeLiveCounts?.[id]) ?? data.liveCount;

  const statusIcon =
    runStatus === 'running' ? (
      <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
    ) : runStatus === 'delivery_pending' ? (
      <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
    ) : runStatus === 'done' ? (
      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
    ) : runStatus === 'error' ? (
      <AlertCircle className="h-3 w-3 text-red-500" />
    ) : null;

  const borderClass =
    runStatus === 'delivery_pending'
      ? 'border-sky-400 shadow-sky-100 ring-2 ring-sky-300'
      : runStatus === 'running'
      ? 'border-emerald-500 shadow-emerald-100 ring-2 ring-emerald-300'
      : runStatus === 'error'
      ? 'border-rose-500 shadow-rose-100 ring-2 ring-rose-300'
      : runStatus === 'done'
      ? 'border-emerald-500 shadow-sm'
      : selected
      ? 'border-brand-600 shadow-xl ring-3 ring-brand-500/30'
      : 'border-slate-200/90 hover:border-slate-300 hover:shadow-xl';

  return (
    <div
      className={`group relative min-w-[260px] max-w-[290px] rounded-3xl border-2 bg-white shadow-md transition-all duration-200 ${borderClass}`}
    >
      {/* Animated Rings for running / pending state */}
      {runStatus === 'delivery_pending' && (
        <span className="pointer-events-none absolute -inset-1 rounded-3xl bg-sky-400/20 blur-xs animate-pulse" />
      )}
      {runStatus === 'running' && (
        <span className="pointer-events-none absolute -inset-1 rounded-3xl bg-emerald-400/20 blur-xs animate-pulse" />
      )}

      {/* Top Category Accent Line */}
      <div
        className="h-1.5 w-full rounded-t-2.5xl transition-all"
        style={{
          background: `linear-gradient(90deg, ${categoryColor}, ${categoryColor}99)`,
        }}
      />

      {/* Floating Hover Action Toolbar */}
      <div className="absolute -top-9 right-2 z-30 hidden items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur-xs group-hover:flex animate-in fade-in zoom-in-95">
        {onRunNode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRunNode(id);
            }}
            className="rounded-lg p-1 text-slate-500 hover:bg-brand-50 hover:text-brand-700"
            title="Execute / Test Step"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}
        {onDuplicateNode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicateNode(id);
            }}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Duplicate Step"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        {onDeleteNode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNode(id);
            }}
            className="rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
            title="Delete Step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Live Record Count Pill Badge */}
      {liveCount != null && liveCount > 0 && (
        <div className="absolute -right-2.5 -top-2.5 z-20 flex items-center gap-1 rounded-full border-2 border-white bg-slate-900 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md">
          <Users className="h-2.5 w-2.5 text-brand-300" />
          <span>{liveCount.toLocaleString()}</span>
        </div>
      )}

      {/* Inbound Target Handle */}
      {!isEntry && !isSource && (
        <Handle
          type="target"
          position={Position.Left}
          className="campaign-connect-handle !-left-3 !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !bg-slate-800 !shadow-md hover:!scale-125 transition-transform"
          title="Inbound data connection"
        />
      )}

      {/* Node Main Body */}
      <div className="flex items-start gap-3 p-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-2xs transition-transform group-hover:scale-105"
          style={{
            backgroundColor: meta?.accentBg || `${accent}15`,
            color: accent,
          }}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span
              className="rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
              style={{ backgroundColor: `${categoryColor}15`, color: categoryColor }}
            >
              {category ?? 'Step'}
            </span>
            {statusIcon}
          </div>

          <h4 className="mt-1 truncate text-xs font-black text-slate-900" title={data.label}>
            {data.label}
          </h4>
          <p className="truncate text-[10px] font-medium text-slate-400">
            {meta?.label ?? data.stepType}
          </p>
        </div>
      </div>

      {/* Config Summary Preview Bar */}
      {summary && (
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2 rounded-b-3xl">
          <p className="truncate font-mono text-[10px] font-semibold text-slate-600" title={summary}>
            {summary}
          </p>
        </div>
      )}

      {/* Outbound Branching Handles */}
      {outputs?.length ? (
        outputs.map((out, idx) => (
          <Handle
            key={out.id}
            type="source"
            position={Position.Right}
            id={out.id}
            style={{
              top: `${((idx + 1) / (outputs.length + 1)) * 100}%`,
              background: out.color ?? accent,
            }}
            className="campaign-connect-handle !-right-3 !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !shadow-md hover:!scale-125 transition-transform"
            title={`Branch: ${out.label || out.id}`}
          />
        ))
      ) : !isTerminal ? (
        <Handle
          type="source"
          position={Position.Right}
          className="campaign-connect-handle !-right-3 !h-5 !w-5 !cursor-crosshair !border-[3px] !border-white !shadow-md hover:!scale-125 transition-transform"
          style={{ background: accent }}
          title="Outbound flow"
        />
      ) : null}
    </div>
  );
}

export const campaignNodeTypes = {
  campaignStep: CampaignStepNode,
};
