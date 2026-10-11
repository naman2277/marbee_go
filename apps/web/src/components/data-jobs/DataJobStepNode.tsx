import { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from 'reactflow';
import { AlertCircle, CheckCircle2, Power } from 'lucide-react';
import {
  NODE_ICONS,
  NODE_SCALE_DEFAULT,
  NODE_SCALE_MAX,
  NODE_SCALE_MIN,
  NODE_SCALE_STEP,
  categoryAccent,
  configSummary,
  paletteItem,
  type WorkflowNodeData,
} from '@/lib/data-jobs';

export const DataJobStepNode = memo(function DataJobStepNode({ id, data, selected }: NodeProps<WorkflowNodeData>) {
  const { setNodes } = useReactFlow();
  const meta = paletteItem(data.stepType);
  const Icon = NODE_ICONS[meta?.icon ?? 'database'];
  const summary = configSummary(data.stepType, data.config ?? {});
  const outputs = meta?.outputs;
  const accentColor = meta ? categoryAccent(meta.category) : '#64748b';
  const scale = data.scale ?? NODE_SCALE_DEFAULT;

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const current = n.data.scale ?? NODE_SCALE_DEFAULT;
          const next = Math.round(Math.min(NODE_SCALE_MAX, Math.max(NODE_SCALE_MIN, current + direction * NODE_SCALE_STEP)) * 100) / 100;
          if (next === current) return n;
          return { ...n, data: { ...n.data, scale: next } };
        }),
      );
    },
    [id, setNodes],
  );

  const toggleDisabled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, disabled: !n.data.disabled } } : n)));
    },
    [id, setNodes],
  );

  const disabled = Boolean(data.disabled);

  return (
    <div
      onWheel={handleWheel}
      style={{ zoom: scale }}
      className={`group relative min-w-[240px] max-w-[280px] overflow-hidden rounded-2xl border bg-white shadow-lg transition-all duration-200 ${
        disabled ? 'opacity-60 grayscale' : ''
      } ${
        selected
          ? 'border-indigo-500 shadow-indigo-300/40 ring-2 ring-indigo-400/40'
          : 'border-slate-200/80 hover:border-slate-300 hover:shadow-xl'
      }`}
    >
      <div
        className="h-1 w-full"
        style={{ background: disabled ? '#94a3b8' : `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }}
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!-left-1 !h-3.5 !w-3.5 !border-2 !border-white !bg-slate-400 !shadow-md"
      />

      <button
        type="button"
        onClick={toggleDisabled}
        title={disabled ? 'Enable node' : 'Disable node'}
        className={`absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-lg opacity-0 shadow-sm transition-opacity group-hover:opacity-100 ${
          disabled ? '!opacity-100 bg-slate-200 text-slate-500' : 'bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        <Power className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 p-3.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
          style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 pr-5">
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
            >
              {meta?.category ?? 'Step'}
            </span>
            {disabled && (
              <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Disabled
              </span>
            )}
            {data.status === 'ok' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
            {data.status === 'error' && <AlertCircle className="h-3 w-3 text-red-500" />}
          </div>
          <p className="mt-1 truncate text-sm font-bold text-slate-900">{data.label}</p>
          <p className="text-[11px] font-medium text-slate-400">{meta?.label ?? data.stepType}</p>
        </div>
      </div>

      {summary && (
        <div className="border-t border-slate-100 bg-gradient-to-r from-slate-50 to-white px-3.5 py-2">
          <p className="truncate font-mono text-[11px] text-slate-600" title={summary}>
            {summary}
          </p>
        </div>
      )}

      {data.runState && <RunOverlay state={data.runState} counts={data.runCounts} />}

      {outputs?.length ? (
        outputs.map((out, idx) => (
          <Handle
            key={out.id}
            type="source"
            position={Position.Right}
            id={out.id}
            style={{ top: `${((idx + 1) / (outputs.length + 1)) * 100}%`, background: accentColor }}
            className="!-right-1 !h-3 !w-3 !border-2 !border-white !shadow-md"
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!-right-1 !h-3.5 !w-3.5 !border-2 !border-white !shadow-md"
          style={{ background: accentColor }}
        />
      )}
    </div>
  );
});

export const dataJobNodeTypes = { dataJobStep: DataJobStepNode };

const RUN_STATE_STYLE: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  idle: { label: 'Idle', dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50' },
  queued: { label: 'Queued', dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50' },
  running: { label: 'Running', dot: 'bg-blue-500 animate-pulse', text: 'text-blue-700', bg: 'bg-blue-50' },
  retrying: { label: 'Retrying', dot: 'bg-amber-500 animate-pulse', text: 'text-amber-700', bg: 'bg-amber-50' },
  succeeded: { label: 'Succeeded', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  failed: { label: 'Failed', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  skipped: { label: 'Skipped', dot: 'bg-slate-300', text: 'text-slate-400', bg: 'bg-slate-50' },
  canceled: { label: 'Canceled', dot: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-50' },
};

function RunOverlay({
  state,
  counts,
}: {
  state: string;
  counts?: { in: number; out: number; failed: number };
}) {
  const s = RUN_STATE_STYLE[state] ?? RUN_STATE_STYLE.idle;
  return (
    <div className={`flex items-center justify-between gap-2 border-t border-slate-100 px-3.5 py-2 ${s.bg}`}>
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${s.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
      {counts && (
        <span className="font-mono text-[10px] tabular-nums text-slate-500">
          {counts.in.toLocaleString()} → {counts.out.toLocaleString()}
          {counts.failed > 0 && <span className="text-red-600"> · {counts.failed.toLocaleString()}✕</span>}
        </span>
      )}
    </div>
  );
}
