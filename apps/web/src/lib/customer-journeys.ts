import type { CustomerJourneyInstance } from '@/lib/customers';

export const ACTIVE_JOURNEY_STATUSES = ['entered', 'active', 'waiting'] as const;

export function isActiveJourneyStatus(status: string): boolean {
  return ACTIVE_JOURNEY_STATUSES.includes(status as (typeof ACTIVE_JOURNEY_STATUSES)[number]);
}

export function formatJourneyStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function journeyStatusVariant(
  status: string,
): 'success' | 'warning' | 'default' | 'error' {
  if (isActiveJourneyStatus(status)) return 'success';
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'error';
  if (status === 'exited') return 'warning';
  return 'default';
}

export function getJourneyName(instance: CustomerJourneyInstance): string {
  return instance.journeys?.name ?? 'Unknown journey';
}

export function formatJourneyTimelineTitle(instance: CustomerJourneyInstance): string {
  return `Journey · ${getJourneyName(instance)}`;
}

export function formatJourneyTimelineSubtitle(instance: CustomerJourneyInstance): string {
  return `${formatJourneyStatus(instance.status)}${instance.current_node_id ? ` · Node ${instance.current_node_id}` : ''}`;
}

export function groupJourneyInstances(instances: CustomerJourneyInstance[]) {
  const active = instances.filter((j) => isActiveJourneyStatus(j.status));
  const completed = instances.filter((j) => j.status === 'completed');
  const other = instances.filter(
    (j) => !isActiveJourneyStatus(j.status) && j.status !== 'completed',
  );
  return { active, completed, other, all: instances };
}

export function journeySummaryText(instances: CustomerJourneyInstance[]): string {
  const { active, all } = groupJourneyInstances(instances);
  if (!all.length) return 'Not enrolled in any journeys';
  if (active.length === all.length) {
    return `Enrolled in ${all.length} active journey${all.length === 1 ? '' : 's'}`;
  }
  if (active.length === 0) {
    return `Completed or exited ${all.length} journey${all.length === 1 ? '' : 's'}`;
  }
  return `${active.length} active · ${all.length} total journey${all.length === 1 ? '' : 's'}`;
}
