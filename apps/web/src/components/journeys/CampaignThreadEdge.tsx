import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import { getEdgePopulation, getEdgeThreadStatus } from '@/lib/workflow-thread';
import { useCampaignRuntime } from '@/lib/campaign-runtime-store';
import { useCampaignCanvas } from '@/components/journeys/CampaignCanvasContext';
import { SPECTRUM_EDGE_STROKE } from '@/lib/spectrum-canvas-tokens';

export type ThreadEdgeData = {
  threadStatus?: 'idle' | 'flowing' | 'done' | 'error';
  count?: number;
  isSelected?: boolean;
};

const STROKE_LEGACY: Record<string, string> = {
  idle: '#64748b',
  flowing: '#22c55e',
  done: '#16a34a',
  error: '#ef4444',
};

export function CampaignThreadEdge({
  id,
  source,
  target,
  sourceHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
}: EdgeProps<ThreadEdgeData>) {
  const runtime = useCampaignRuntime();
  const { spectrumTheme } = useCampaignCanvas();
  const STROKE = spectrumTheme ? SPECTRUM_EDGE_STROKE : STROKE_LEGACY;

  const edge = { id, source, target, sourceHandle: sourceHandleId ?? null };
  const status = runtime.workflowEnabled
    ? getEdgeThreadStatus(edge, runtime.nodeResults, runtime.runningNodeId, runtime.errorNodeIds)
    : 'idle';
  const pop = runtime.workflowEnabled ? getEdgePopulation(edge, runtime.nodeResults) : null;
  const count = pop?.count;
  const edgeSelected = id === runtime.selectedEdgeId || selected;

  const stroke = STROKE[status] ?? STROKE.idle;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const flowGlow = spectrumTheme
    ? 'drop-shadow(0 0 3px color-mix(in srgb, rgb(18, 184, 103) 50%, transparent))'
    : 'drop-shadow(0 0 4px rgba(34,197,94,0.8))';

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="react-flow__edge-interaction"
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: edgeSelected ? 3 : status === 'flowing' ? 2.5 : 2,
          opacity: status === 'idle' ? 0.6 : 1,
          filter: status === 'flowing' ? flowGlow : undefined,
        }}
      />
      {status === 'flowing' && (
        <>
          <path
            d={edgePath}
            fill="none"
            stroke={spectrumTheme ? 'rgb(45, 203, 132)' : '#86efac'}
            strokeWidth={6}
            strokeLinecap="round"
            className="pointer-events-none opacity-25"
          />
          <path
            d={edgePath}
            fill="none"
            stroke={spectrumTheme ? SPECTRUM_EDGE_STROKE.flowing : '#4ade80'}
            strokeWidth={3}
            strokeDasharray="8 8"
            strokeLinecap="round"
            className="campaign-thread-flow pointer-events-none"
          />
        </>
      )}
      {status === 'done' && (
        <path
          d={edgePath}
          fill="none"
          stroke={spectrumTheme ? SPECTRUM_EDGE_STROKE.done : '#4ade80'}
          strokeWidth={2}
          strokeDasharray="6 10"
          strokeLinecap="round"
          className="campaign-thread-done pointer-events-none"
          opacity={0.85}
        />
      )}
      {count != null && count > 0 && (
        <EdgeLabelRenderer>
          <button
            type="button"
            title="Right-click thread to inspect transition data"
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className={`nodrag nopan absolute flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full px-2 py-0.5 tabular-nums shadow-sm transition hover:scale-105 ${
              spectrumTheme
                ? edgeSelected
                  ? 'spectrum-edge-label spectrum-edge-label--selected'
                  : status === 'error'
                    ? 'spectrum-edge-label spectrum-edge-label--error'
                    : status === 'flowing' || status === 'done'
                      ? 'spectrum-edge-label spectrum-edge-label--active'
                      : 'spectrum-edge-label'
                : edgeSelected
                  ? 'border-sky-400 bg-sky-950 text-sky-200'
                  : status === 'error'
                    ? 'border-red-500/50 bg-red-950 text-red-300'
                    : status === 'flowing' || status === 'done'
                      ? 'border-emerald-500/50 bg-emerald-950 text-emerald-300'
                      : 'border-slate-600 bg-slate-900 text-slate-400'
            } ${spectrumTheme ? '' : 'border text-[10px] font-bold'}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          >
            {count.toLocaleString()}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const campaignEdgeTypes = { campaignThread: CampaignThreadEdge };
