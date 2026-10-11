import { createContext, useContext, type ReactNode } from 'react';
import type { Node } from 'reactflow';
import type { CampaignNodeData } from '@/lib/campaign-graph';
import type { NodePopulationResult } from '@/lib/workflow-engine';
import type { ActivityExecutionStatus } from '@/lib/campaign-acc-stages';
import type { WorkflowLogEntry } from '@/lib/campaign-workflow-log';
import type { PopulationFieldDef } from '@/lib/template-personalization';
import type { useCampaignWorkflow } from '@/components/journeys/useCampaignWorkflow';

export type CampaignWorkflowApi = ReturnType<typeof useCampaignWorkflow>;

export type CampaignActivityRow = {
  nodeId: string;
  label: string;
  stepType: string;
  status: ActivityExecutionStatus;
  count?: number;
};

export type CampaignEditorBridgeState = {
  workflow: CampaignWorkflowApi | null;
  workflowLog: WorkflowLogEntry[];
  activityRows: CampaignActivityRow[];
  selectedNode: Node<CampaignNodeData> | null;
  previewResult: NodePopulationResult | null;
  personalizationFields?: PopulationFieldDef[];
  personalizationSample?: Record<string, unknown> | null;
  previewLabel?: string;
  threadPreviewLabel?: string;
  nodeCount: number;
  edgeCount: number;
  validationMessages: string[];
  savePending?: boolean;
  onSave: () => void;
  onValidate: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onRunActivity?: () => void;
  onUpdateNode: (nodeId: string, patch: Partial<CampaignNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onLoadTemplate?: () => void;
  templatePending?: boolean;
};

/** Serializable snapshot used to avoid redundant bridge parent updates. */
export function bridgeDataSignature(state: CampaignEditorBridgeState): string {
  const wf = state.workflow;
  return JSON.stringify({
    executionPhase: wf?.executionPhase ?? null,
    workflowLogLen: state.workflowLog.length,
    activityRowsKey: state.activityRows.map((r) => `${r.nodeId}:${r.status}:${r.count ?? 0}`).join('|'),
    isFinished: wf?.isFinished ?? false,
    pendingDeliveryId: wf?.pendingDelivery?.deliveryId ?? null,
    confirmingDelivery: wf?.confirmingDelivery ?? false,
    selectedId: state.selectedNode?.id ?? null,
    selectedConfigKey: state.selectedNode
      ? JSON.stringify(state.selectedNode.data.config)
      : null,
    previewCount: state.previewResult?.count ?? null,
    personalizationFieldCount: state.personalizationFields?.length ?? 0,
    hasPersonalizationSample: Boolean(state.personalizationSample),
    nodeCount: state.nodeCount,
    edgeCount: state.edgeCount,
    validationKey: state.validationMessages.join('\u0001'),
    savePending: state.savePending ?? false,
    templatePending: state.templatePending ?? false,
    populationTotal: wf?.populationTotal ?? 0,
    deployedCount: wf?.deployedDeliveries?.length ?? 0,
    runningNodeId: wf?.runningNodeId ?? null,
    isLoopActive: wf?.isLoopActive ?? false,
    runLoading: wf?.runLoading ?? false,
    errorCount: wf?.errorNodeIds?.size ?? 0,
    pauseRequested: wf?.pauseRequested ?? false,
    stopRequested: wf?.stopRequested ?? false,
    remainingCount: wf?.remainingCount ?? 0,
    runStatus: wf?.runState?.status ?? null,
  });
}

const CampaignEditorBridgeContext = createContext<CampaignEditorBridgeState | null>(null);

export function CampaignEditorBridgeProvider({
  value,
  children,
}: {
  value: CampaignEditorBridgeState;
  children: ReactNode;
}) {
  return (
    <CampaignEditorBridgeContext.Provider value={value}>{children}</CampaignEditorBridgeContext.Provider>
  );
}

export function useCampaignEditorBridge() {
  const ctx = useContext(CampaignEditorBridgeContext);
  if (!ctx) throw new Error('useCampaignEditorBridge must be used within CampaignEditorBridgeProvider');
  return ctx;
}

export function useOptionalCampaignEditorBridge() {
  return useContext(CampaignEditorBridgeContext);
}
