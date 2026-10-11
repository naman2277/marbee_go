import type { WorkflowExecutionPhase } from '@/components/journeys/useCampaignWorkflow';

export type CampaignLifecycle =
  | 'editing'
  | 'running'
  | 'paused'
  | 'awaiting_delivery'
  | 'finished'
  | 'failed';

export function resolveCampaignLifecycle(input: {
  executionPhase: WorkflowExecutionPhase;
  runStatus?: string;
  hasErrors?: boolean;
}): CampaignLifecycle {
  if (input.hasErrors && input.executionPhase === 'idle') return 'failed';
  if (input.executionPhase === 'finished' || input.runStatus === 'completed') return 'finished';
  if (input.executionPhase === 'awaiting_delivery') return 'awaiting_delivery';
  if (input.executionPhase === 'paused') return 'paused';
  if (input.executionPhase === 'running') return 'running';
  return 'editing';
}

export const LIFECYCLE_LABELS: Record<CampaignLifecycle, string> = {
  editing: 'Editing',
  running: 'Running',
  paused: 'Paused',
  awaiting_delivery: 'Awaiting delivery',
  finished: 'Finished',
  failed: 'Failed',
};

export const LIFECYCLE_COLORS: Record<CampaignLifecycle, string> = {
  editing: 'bg-slate-100 text-slate-600 border-slate-200',
  running: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  awaiting_delivery: 'bg-sky-50 text-sky-700 border-sky-200',
  finished: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};
