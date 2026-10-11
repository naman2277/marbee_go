import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from 'reactflow';
import { Plus } from 'lucide-react';
import type { JourneyEdgeData } from '@/lib/journey-builder';
import { useJourneyCanvas } from './JourneyBuilderCanvasContext';
import { InsertActivityMenu } from './InsertActivityMenu';

export function JourneyInsertEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps<JourneyEdgeData>) {
  const { onInsertBetween } = useJourneyCanvas();
  const [menuOpen, setMenuOpen] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  const branchLabel = data?.branchLabel;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: selected ? '#6366f1' : '#94a3b8', strokeWidth: 2 }}
      />
      <EdgeLabelRenderer>
        {menuOpen && (
          <div
            className="nodrag nopan fixed inset-0 z-0"
            style={{ pointerEvents: 'all' }}
            onClick={() => setMenuOpen(false)}
          />
        )}
        <div
          className="nodrag nopan absolute z-10 flex flex-col items-center"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          {branchLabel && !menuOpen && (
            <span className="mb-1 rounded bg-white px-1 text-[9px] font-bold text-slate-500 shadow-sm">
              {branchLabel}
            </span>
          )}
          {menuOpen ? (
            <InsertActivityMenu
              onPick={(stepType) => {
                onInsertBetween(id, stepType);
                setMenuOpen(false);
              }}
              onClose={() => setMenuOpen(false)}
            />
          ) : (
            <button
              type="button"
              title="Insert activity between"
              onClick={() => setMenuOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 shadow-sm transition hover:scale-110 hover:border-brand-400 hover:text-brand-600"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
