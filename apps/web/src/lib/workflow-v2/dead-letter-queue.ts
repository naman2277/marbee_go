import { supabase } from '../supabase';
import type { WorkflowErrorData } from './workflow-error';

export interface DeadLetterQueueRow {
  id: string;
  tenant_id: string;
  workflow_run_id: string;
  node_execution_id: string;
  node_type: string;
  error_data: WorkflowErrorData;
  execution_context: Record<string, unknown>;
  attempt_history: Record<string, unknown>[];
  status: 'PENDING' | 'REPLAYED' | 'DISCARDED' | 'QUARANTINED';
  created_at: string;
  updated_at: string;
}

interface EnqueueDLQParams {
  tenantId: string;
  workflowRunId: string;
  nodeExecutionId: string;
  nodeType: string;
  error: WorkflowErrorData;
  executionContext: Record<string, unknown>;
  attemptHistory: Record<string, unknown>[];
}

/**
 * Enqueue a failed node execution to the Dead Letter Queue.
 */
export async function enqueueToDLQ(params: EnqueueDLQParams): Promise<string> {
  const { data, error } = await supabase
    .from('wf_dead_letter_queue')
    .insert({
      tenant_id: params.tenantId,
      workflow_run_id: params.workflowRunId,
      node_execution_id: params.nodeExecutionId,
      node_type: params.nodeType,
      error_data: params.error,
      execution_context: params.executionContext,
      attempt_history: params.attemptHistory,
      status: 'PENDING',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to enqueue to DLQ: ${error.message}`);
  }

  return data.id;
}

/**
 * Fetch DLQ entries for a tenant.
 */
export async function fetchDLQEntries(
  tenantId: string,
  options?: { status?: string; limit?: number; offset?: number }
): Promise<DeadLetterQueueRow[]> {
  let query = supabase
    .from('wf_dead_letter_queue')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch DLQ entries: ${error.message}`);
  }
  return data as DeadLetterQueueRow[];
}

/**
 * Mark a DLQ entry as REPLAYED.
 */
export async function replayDLQEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('wf_dead_letter_queue')
    .update({ status: 'REPLAYED', updated_at: new Date().toISOString() })
    .eq('id', entryId);

  if (error) throw new Error(`Failed to replay DLQ entry: ${error.message}`);
}

/**
 * Mark a DLQ entry as DISCARDED.
 */
export async function discardDLQEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('wf_dead_letter_queue')
    .update({ status: 'DISCARDED', updated_at: new Date().toISOString() })
    .eq('id', entryId);

  if (error) throw new Error(`Failed to discard DLQ entry: ${error.message}`);
}

/**
 * Mark a DLQ entry as QUARANTINED (poison message).
 */
export async function quarantineDLQEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('wf_dead_letter_queue')
    .update({ status: 'QUARANTINED', updated_at: new Date().toISOString() })
    .eq('id', entryId);

  if (error) throw new Error(`Failed to quarantine DLQ entry: ${error.message}`);
}

/**
 * Get the total depth (count) of PENDING DLQ entries for a tenant.
 */
export async function getDLQDepth(tenantId: string): Promise<number> {
  const { count, error } = await supabase
    .from('wf_dead_letter_queue')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'PENDING');

  if (error) {
    throw new Error(`Failed to get DLQ depth: ${error.message}`);
  }

  return count || 0;
}
