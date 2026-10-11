import { useSyncExternalStore } from 'react';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import type { NodePopulationResult } from '@/lib/workflow-engine';

export type CampaignRuntimeState = {
  workflowEnabled: boolean;
  runningNodeId: string | null;
  deliveryPendingNodeId: string | null;
  runStatusByNode: Record<string, CampaignNodeData['runStatus']>;
  countsByNode: Record<string, number>;
  nodeResults: Record<string, NodePopulationResult>;
  errorNodeIds: Set<string>;
  selectedEdgeId: string | null;
  nodeLiveCounts?: Record<string, number>;
};

const DEFAULT: CampaignRuntimeState = {
  workflowEnabled: false,
  runningNodeId: null,
  deliveryPendingNodeId: null,
  runStatusByNode: {},
  countsByNode: {},
  nodeResults: {},
  errorNodeIds: new Set(),
  selectedEdgeId: null,
};

let runtime: CampaignRuntimeState = DEFAULT;
const listeners = new Set<() => void>();
let lastSignature = '';

function runtimeSignature(state: CampaignRuntimeState): string {
  return [
    state.workflowEnabled,
    state.runningNodeId,
    state.deliveryPendingNodeId,
    state.selectedEdgeId,
    JSON.stringify(state.runStatusByNode),
    JSON.stringify(state.countsByNode),
    JSON.stringify(state.nodeResults),
    [...state.errorNodeIds].sort().join(','),
    JSON.stringify(state.nodeLiveCounts ?? {}),
  ].join('::');
}

export function getCampaignRuntime(): CampaignRuntimeState {
  return runtime;
}

export function setCampaignRuntime(next: CampaignRuntimeState) {
  const sig = runtimeSignature(next);
  if (sig === lastSignature) return;
  lastSignature = sig;
  runtime = next;
  listeners.forEach((l) => l());
}

export function subscribeCampaignRuntime(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCampaignRuntime() {
  return useSyncExternalStore(subscribeCampaignRuntime, getCampaignRuntime, getCampaignRuntime);
}
