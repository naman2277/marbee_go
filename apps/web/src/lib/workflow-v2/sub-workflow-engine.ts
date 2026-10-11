import { supabase } from '../supabase';

/** Maximum sub-workflow recursion depth */
export const MAX_SUB_WORKFLOW_DEPTH = 5;

/**
 * Start a child workflow run as a sub-workflow.
 * Creates an independent WorkflowRun with its own version binding.
 * The parent node enters WAITING state until the child completes.
 *
 * @param params - The parameters for starting a sub-workflow.
 * @param params.parentRunId - The parent workflow run ID.
 * @param params.parentNodeExecutionId - The parent node execution that is invoking the sub-workflow.
 * @param params.childWorkflowId - The workflow ID to invoke as a child.
 * @param params.childVersionId - The specific version to use (null = latest published).
 * @param params.tenantId - Tenant scoping.
 * @param params.environment - Environment scoping.
 * @param params.inputPayload - Data to pass to the child workflow as trigger payload.
 * @param params.currentDepth - Current sub-workflow nesting depth.
 * @returns The created child workflow run ID.
 */
export async function startSubWorkflow(params: {
  parentRunId: string;
  parentNodeExecutionId: string;
  childWorkflowId: string;
  childVersionId: string | null;
  tenantId: string;
  environment: string;
  inputPayload: Record<string, unknown>;
  currentDepth: number;
}): Promise<{ childRunId: string }> {
  // Enforce depth limit
  if (params.currentDepth >= MAX_SUB_WORKFLOW_DEPTH) {
    throw new Error(
      `Sub-workflow depth limit exceeded (max ${MAX_SUB_WORKFLOW_DEPTH}). ` +
      `This prevents infinite recursion in workflow composition.`
    );
  }

  // Create child workflow run
  const { data: childRun, error } = await supabase
    .from('wf_workflow_runs')
    .insert({
      tenant_id: params.tenantId,
      environment: params.environment,
      workflow_id: params.childWorkflowId,
      version_id: params.childVersionId,
      status: 'CREATED',
      trigger_type: 'sub_workflow',
      trigger_payload: {
        ...params.inputPayload,
        _parent_run_id: params.parentRunId,
        _parent_node_execution_id: params.parentNodeExecutionId,
      },
      parent_run_id: params.parentRunId,
      depth: params.currentDepth + 1,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Put parent node into WAITING state
  await supabase
    .from('wf_node_executions')
    .update({
      status: 'WAITING',
      output: { sub_workflow_run_id: childRun.id },
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.parentNodeExecutionId);

  // Log the sub-workflow invocation event
  await supabase.from('wf_execution_events').insert({
    tenant_id: params.tenantId,
    workflow_run_id: params.parentRunId,
    node_execution_id: params.parentNodeExecutionId,
    event_type: 'sub_workflow.started',
    payload: {
      child_run_id: childRun.id,
      child_workflow_id: params.childWorkflowId,
      depth: params.currentDepth + 1,
    },
  });

  return { childRunId: childRun.id };
}

/**
 * Check if a child workflow has completed.
 * If completed, propagate its output back to the parent node.
 * 
 * @param params - Parameters for checking completion.
 * @param params.parentNodeExecutionId - The parent node execution ID.
 * @param params.childRunId - The child workflow run ID.
 * @param params.tenantId - The tenant ID.
 * @returns Result object indicating completion status and output/error.
 */
export async function checkSubWorkflowCompletion(params: {
  parentNodeExecutionId: string;
  childRunId: string;
  tenantId: string;
}): Promise<{ completed: boolean; output?: Record<string, unknown>; error?: Record<string, unknown> }> {
  const { data: childRun } = await supabase
    .from('wf_workflow_runs')
    .select('status, error')
    .eq('id', params.childRunId)
    .single();

  if (!childRun) {
    return { completed: false };
  }

  if (childRun.status === 'COMPLETED') {
    // Get the child's final node outputs
    const { data: childNodes } = await supabase
      .from('wf_node_executions')
      .select('node_id, output')
      .eq('workflow_run_id', params.childRunId)
      .eq('status', 'SUCCEEDED');

    const childOutput: Record<string, unknown> = {};
    for (const node of childNodes ?? []) {
      if (node.output) {
        childOutput[node.node_id] = node.output;
      }
    }

    // Resume parent node with child output
    await supabase
      .from('wf_node_executions')
      .update({
        status: 'SUCCEEDED',
        output: { sub_workflow_output: childOutput },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.parentNodeExecutionId);

    return { completed: true, output: childOutput };
  }

  if (childRun.status === 'FAILED' || childRun.status === 'CANCELLED') {
    // Propagate failure to parent
    await supabase
      .from('wf_node_executions')
      .update({
        status: 'FAILED',
        error: childRun.error ?? { code: 'SUB_WORKFLOW_FAILED', category: 'SYSTEM', message: `Child workflow ${childRun.status.toLowerCase()}`, userMessage: `Sub-workflow ${childRun.status.toLowerCase()}.`, retryable: false },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.parentNodeExecutionId);

    return { completed: true, error: childRun.error };
  }

  return { completed: false };
}

/**
 * Cancel all active child workflow runs for a parent run.
 * Called when the parent workflow is cancelled.
 * 
 * @param parentRunId - The parent workflow run ID.
 * @param tenantId - The tenant ID.
 * @returns The number of child workflows cancelled.
 */
export async function cancelChildWorkflows(parentRunId: string, tenantId: string): Promise<number> {
  const { data: children } = await supabase
    .from('wf_workflow_runs')
    .select('id')
    .eq('parent_run_id', parentRunId)
    .in('status', ['CREATED', 'RUNNING', 'WAITING', 'PAUSED']);

  let cancelledCount = 0;
  for (const child of children ?? []) {
    // Recursively cancel grandchildren first
    await cancelChildWorkflows(child.id, tenantId);

    // Cancel all active node executions in this child
    await supabase
      .from('wf_node_executions')
      .update({ status: 'CANCELLED', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('workflow_run_id', child.id)
      .in('status', ['PENDING', 'READY', 'QUEUED', 'RUNNING', 'WAITING', 'RETRY_WAIT']);

    // Cancel the child run
    await supabase
      .from('wf_workflow_runs')
      .update({ status: 'CANCELLED', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', child.id);

    cancelledCount++;

    // Log cancellation event
    await supabase.from('wf_execution_events').insert({
      tenant_id: tenantId,
      workflow_run_id: child.id,
      event_type: 'workflow.cancelled',
      payload: { reason: 'parent_cancelled', parent_run_id: parentRunId },
    });
  }

  return cancelledCount;
}

/**
 * Get the sub-workflow hierarchy for a workflow run.
 * Returns a tree of parent → children relationships.
 * 
 * @param runId - The workflow run ID.
 * @returns The sub-workflow tree structure.
 */
export interface SubWorkflowNode {
  runId: string;
  workflowId: string;
  status: string;
  depth: number;
  children: SubWorkflowNode[];
}

export async function getSubWorkflowTree(runId: string): Promise<SubWorkflowNode> {
  const { data: run } = await supabase
    .from('wf_workflow_runs')
    .select('id, workflow_id, status, depth')
    .eq('id', runId)
    .single();

  if (!run) {
    return { runId, workflowId: '', status: 'unknown', depth: 0, children: [] };
  }

  const { data: children } = await supabase
    .from('wf_workflow_runs')
    .select('id')
    .eq('parent_run_id', runId);

  const childTrees = await Promise.all(
    (children ?? []).map((c) => getSubWorkflowTree(c.id)),
  );

  return {
    runId: run.id,
    workflowId: run.workflow_id,
    status: run.status,
    depth: run.depth,
    children: childTrees,
  };
}
