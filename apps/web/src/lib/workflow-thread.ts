import type { Edge } from 'reactflow';
import type { NodePopulationResult } from '@/lib/workflow-engine';

export type ThreadStatus = 'idle' | 'flowing' | 'done' | 'error';

function resultKey(nodeId: string, handle?: string | null) {
  return handle ? `${nodeId}:${handle}` : nodeId;
}

export function getPopulationForSource(
  sourceId: string,
  sourceHandle: string | null | undefined,
  nodeResults: Record<string, NodePopulationResult>,
): NodePopulationResult | null {
  const key = resultKey(sourceId, sourceHandle);
  if (nodeResults[key]) return nodeResults[key];
  if (nodeResults[sourceId]) return nodeResults[sourceId];
  return (
    Object.values(nodeResults).find((r) => r.nodeId === sourceId && (!sourceHandle || r.handle === sourceHandle)) ??
    Object.values(nodeResults).find((r) => r.nodeId === sourceId && !r.handle) ??
    null
  );
}

export function getEdgeThreadStatus(
  edge: Edge,
  nodeResults: Record<string, NodePopulationResult>,
  runningNodeId: string | null,
  errorNodeIds: Set<string>,
): ThreadStatus {
  const { source, target, sourceHandle } = edge;

  if (errorNodeIds.has(source) || errorNodeIds.has(target)) return 'error';

  const sourcePop = getPopulationForSource(source, sourceHandle ?? null, nodeResults);
  const targetHasResult = Object.values(nodeResults).some((r) => r.nodeId === target);

  if (runningNodeId) {
    if (runningNodeId === target || runningNodeId === source) return 'flowing';
    if (sourcePop && !targetHasResult) return 'flowing';
  }

  if (sourcePop) return 'done';
  return 'idle';
}

export function getEdgePopulation(
  edge: Edge,
  nodeResults: Record<string, NodePopulationResult>,
): NodePopulationResult | null {
  return getPopulationForSource(edge.source, edge.sourceHandle ?? null, nodeResults);
}
