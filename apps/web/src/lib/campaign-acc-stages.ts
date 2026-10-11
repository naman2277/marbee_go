import type { CampaignLifecycle } from './campaign-lifecycle';

/** Adobe Campaign Classic approval pipeline (bulk campaign). */
export type AccApprovalStage =
  | 'in_progress'
  | 'targeting_ready'
  | 'awaiting_delivery'
  | 'ready_to_send'
  | 'finished';

export const ACC_STAGE_LABELS: Record<AccApprovalStage, string> = {
  in_progress: 'In progress',
  targeting_ready: 'Targeting ready',
  awaiting_delivery: 'Delivery prep',
  ready_to_send: 'Ready to send',
  finished: 'Finished',
};

export function resolveAccApprovalStage(input: {
  lifecycle: CampaignLifecycle;
  hasPopulation: boolean;
  hasDeliveries: boolean;
}): AccApprovalStage {
  if (input.lifecycle === 'finished') return 'finished';
  if (input.lifecycle === 'awaiting_delivery') return 'awaiting_delivery';
  if (input.hasDeliveries) return 'ready_to_send';
  if (input.hasPopulation || input.lifecycle === 'running' || input.lifecycle === 'paused') {
    return 'targeting_ready';
  }
  return 'in_progress';
}

export type ActivityExecutionStatus = 'idle' | 'running' | 'done' | 'warning' | 'error' | 'delivery_pending';

export function activityStatusLabel(status: ActivityExecutionStatus): string {
  switch (status) {
    case 'idle':
      return 'Not executed';
    case 'running':
      return 'Executing';
    case 'done':
      return 'Completed';
    case 'warning':
      return 'Warning';
    case 'error':
      return 'Failed';
    case 'delivery_pending':
      return 'Awaiting confirm';
  }
}

export const ACTIVITY_STATUS_RING: Record<ActivityExecutionStatus, string> = {
  idle: 'bg-slate-600',
  running: 'bg-sky-500 animate-pulse',
  done: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  delivery_pending: 'bg-sky-400 animate-pulse',
};
