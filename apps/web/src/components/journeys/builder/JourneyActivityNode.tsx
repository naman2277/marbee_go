import { useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Copy, Settings2, Sparkles, Trash2, Users } from 'lucide-react';
import {
  CAMPAIGN_ICONS,
  configSummary,
  paletteItem,
} from '@/lib/campaign-nodes';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import { journeyActivityDef } from '@/lib/journey-builder';
import { useJourneyCanvas } from './JourneyBuilderCanvasContext';

const BRANCH_COLORS: Record<string, string> = {
  yes: '#10b981',
  no: '#f97316',
  a: '#3b82f6',
  b: '#8b5cf6',
};

export function JourneyActivityNode({ id, data, selected }: NodeProps<CampaignNodeData>) {
  const { liveCounts, onSelectNode, onUpdateNodeLabel, onDeleteNode, onDuplicateNode } =
    useJourneyCanvas();

  const meta = paletteItem(data.stepType);
  const def = journeyActivityDef(data.stepType);
  const Icon = CAMPAIGN_ICONS[meta?.icon ?? 'zap'] ?? Sparkles;
  const accent = def?.accent ?? meta?.accent ?? '#6366f1';
  const accentBg = meta?.accentBg ?? `${accent}1a`;
  const summary = configSummary(data.stepType, data.config ?? {});
  const outputs = meta?.outputs;
  const isEntry = Boolean(meta?.entryOnly);
  const isTerminal = Boolean(meta?.terminal);
  const liveCount = liveCounts?.[id];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(data.label);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, data.label]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== data.label) onUpdateNodeLabel(id, next);
    setEditing(false);
  };

  return (
    <div
      className={`group relative min-w-[240px] max-w-[280px] rounded-xl border bg-white shadow-sm transition ${
        selected
          ? 'border-brand-500 ring-2 ring-brand-500/25'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <div className="h-1 w-full rounded-t-xl" style={{ background: accent }} />

      {/* hover toolbar */}
      <div className="absolute -top-8 right-1 z-20 hidden items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-md group-hover:flex">
        <button
          type="button"
          title="Configure"
          onClick={(e) => {
            e.stopPropagation();
            onSelectNode(id);
          }}
          className="rounded p-1 text-slate-500 hover:bg-brand-50 hover:text-brand-700"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicateNode(id);
          }}
          className="rounded p-1 text-slate-500 hover:bg-slate-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {!isEntry && (
          <button
            type="button"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNode(id);
            }}
            className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {liveCount != null && liveCount > 0 && (
        <div className="absolute -right-2 -top-2 z-10 flex items-center gap-1 rounded-full border-2 border-white bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white shadow">
          <Users className="h-2.5 w-2.5 text-brand-300" />
          {liveCount.toLocaleString()}
        </div>
      )}

      {!isEntry && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-white !bg-slate-400"
        />
      )}

      <div className="flex items-start gap-2.5 p-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: accentBg, color: accent }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {def?.kind ?? meta?.category ?? 'Step'}
          </p>
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="mt-0.5 w-full rounded border border-brand-300 px-1 py-0.5 text-xs font-semibold text-slate-900 focus:outline-none"
            />
          ) : (
            <h4
              className="mt-0.5 truncate text-xs font-semibold text-slate-900"
              title={data.label}
              onDoubleClick={() => setEditing(true)}
            >
              {data.label}
            </h4>
          )}
          {summary && (
            <p className="mt-0.5 truncate text-[10px] text-slate-400" title={summary}>
              {summary}
            </p>
          )}
        </div>
      </div>

      {/* source handles */}
      {outputs?.length ? (
        outputs.map((out, idx) => (
          <div key={out.id}>
            <Handle
              type="source"
              id={out.id}
              position={Position.Right}
              style={{
                top: `${((idx + 1) / (outputs.length + 1)) * 100}%`,
                background: out.color ?? BRANCH_COLORS[out.id] ?? accent,
              }}
              className="!h-3 !w-3 !border-2 !border-white"
            />
            <span
              className="pointer-events-none absolute right-1 text-[9px] font-bold text-slate-400"
              style={{ top: `calc(${((idx + 1) / (outputs.length + 1)) * 100}% - 16px)` }}
            >
              {out.label}
            </span>
          </div>
        ))
      ) : !isTerminal ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-white"
          style={{ background: accent }}
        />
      ) : null}
    </div>
  );
}
