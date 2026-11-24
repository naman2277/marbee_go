import { supabase } from '../supabase';
import { WorkflowError } from './workflow-error';
import { nodeRegistry } from './universal-node-registry';
import { calculateRetryDelay } from './retry-engine';
import { enqueueToDLQ } from './dead-letter-queue';
import { checkTenantConcurrency, type TenantLimits } from './flow-control';
import type { RetryPolicy } from './retry-engine';

// TD-11: the engine called helpers with missing arguments and compared statuses /
// fields the node contract doesn't use. Defaults below make those calls correct.
// NOTE: this module is not wired into the app and its wf_* tables are not in the live
// schema — it must move server-side before use (charter: server is the runtime).
const DEFAULT_TENANT_LIMITS: TenantLimits = {
  maxConcurrentNodeExecutions: 50,
  maxWorkflowRunsPerMinute: 120,
  maxFanOutBatchSize: 500,
  maxSubWorkflowDepth: 5,
};
const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 60_000, backoffMultiplier: 2 };

/** Resolve {{...}} templates in every string value of a node's config (recursively). */
function resolveConfigTemplates(value: unknown, context: Parameters<typeof resolveTemplate>[1]): unknown {
  if (typeof value === 'string') return resolveTemplate(value, context);
  if (Array.isArray(value)) return value.map((v) => resolveConfigTemplates(v, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveConfigTemplates(v, context)]));
  }
  return value;
}
import { resolveTemplate, evaluateCondition } from './sandboxed-expression-engine';
import { cancelChildWorkflows } from './sub-workflow-engine';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type WorkflowRunStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLING' | 'CANCELLED' | 'PAUSED' | 'WAITING';
export type NodeExecutionStatus = 'PENDING' | 'READY' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'WAITING' | 'SKIPPED' | 'CANCELLED' | 'RETRY_WAIT';

export interface NodeExecutionRecord {
  id: string;
  tenant_id: string;
  workflow_run_id: string;
  node_id: string;
  node_type: string;
  status: NodeExecutionStatus;
  config: Record<string, unknown>;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error_details: Record<string, unknown> | null;
  retry_count: number;
  worker_id: string | null;
  worker_token: string | null;
}

/** Valid workflow state transitions */
const VALID_WORKFLOW_TRANSITIONS: Record<WorkflowRunStatus, WorkflowRunStatus[]> = {
  CREATED: ['RUNNING'],
  RUNNING: ['COMPLETED', 'FAILED', 'CANCELLING', 'PAUSED', 'WAITING'],
  COMPLETED: [],
  FAILED: [],
  CANCELLING: ['CANCELLED'],
  CANCELLED: [],
  PAUSED: ['RUNNING'],
  WAITING: ['RUNNING'],
};

/** Valid node state transitions */
const VALID_NODE_TRANSITIONS: Record<NodeExecutionStatus, NodeExecutionStatus[]> = {
  PENDING: ['READY', 'SKIPPED'],
  READY: ['QUEUED', 'SKIPPED'],
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'WAITING', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: ['RETRY_WAIT'],
  WAITING: ['READY'],
  SKIPPED: [],
  CANCELLED: [],
  RETRY_WAIT: ['QUEUED'],
};

// ═══════════════════════════════════════════════════════════════════════════
// State Machine Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Validate and perform a workflow state transition */
export function transitionWorkflowState(current: WorkflowRunStatus, target: WorkflowRunStatus): void {
  const allowed = VALID_WORKFLOW_TRANSITIONS[current];
  if (!allowed?.includes(target)) {
    throw WorkflowError.validation(
      'INVALID_WORKFLOW_TRANSITION',
      `Cannot transition workflow from ${current} to ${target}`,
    );
  }
}

/** Validate and perform a node state transition */
export function transitionNodeState(current: NodeExecutionStatus, target: NodeExecutionStatus): void {
  const allowed = VALID_NODE_TRANSITIONS[current];
  if (!allowed?.includes(target)) {
    throw WorkflowError.validation(
      'INVALID_NODE_TRANSITION',
      `Cannot transition node from ${current} to ${target}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Execution Event Logger
// ═══════════════════════════════════════════════════════════════════════════

/** Emit an execution event to the immutable event log */
export async function emitExecutionEvent(
  tenantId: string,
  workflowRunId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  nodeExecutionId?: string,
  traceId?: string,
  spanId?: string,
): Promise<void> {
  await supabase.from('wf_execution_events').insert({
    tenant_id: tenantId,
    workflow_run_id: workflowRunId,
    node_execution_id: nodeExecutionId ?? null,
    event_type: eventType,
    payload,
    trace_id: traceId ?? null,
    span_id: spanId ?? null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Core Execution Engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new workflow run.
 * Initializes the run in CREATED state, creates initial node executions
 * for all nodes in the workflow DAG, and activates root nodes.
 */
export async function createWorkflowRun(params: {
  tenantId: string;
  environment: string;
  workflowId: string;
  versionId: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  variables?: Record<string, unknown>;
  parentRunId?: string;
  depth?: number;
}): Promise<{ runId: string; traceId: string }> {
  const traceId = crypto.randomUUID();
  const { data, error } = await supabase
    .from('wf_workflow_runs')
    .insert({
      tenant_id: params.tenantId,
      environment: params.environment,
      workflow_id: params.workflowId,
      version_id: params.versionId,
      status: 'CREATED',
      trigger_type: params.triggerType,
      trigger_payload: params.triggerPayload,
      variables: params.variables ?? {},
      parent_run_id: params.parentRunId ?? null,
      depth: params.depth ?? 0,
      trace_id: traceId,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw WorkflowError.system('CREATE_RUN_FAILED', 'Failed to create workflow run: ' + (error?.message || 'Unknown error'));
  }

  await emitExecutionEvent(params.tenantId, data.id, 'WORKFLOW_CREATED', { trigger: params.triggerType }, undefined, traceId);

  return { runId: data.id, traceId };
}

/**
 * Initialize node executions for a workflow run.
 * Creates a node_execution record for each node in the workflow graph.
 * Root nodes (no incoming edges) are set to READY.
 * All other nodes are set to PENDING.
 */
export async function initializeNodeExecutions(params: {
  tenantId: string;
  workflowRunId: string;
  nodes: Array<{ nodeId: string; nodeType: string; config: Record<string, unknown> }>;
  edges: Array<{ sourceNodeId: string; targetNodeId: string; condition?: string }>;
}): Promise<void> {
  const { tenantId, workflowRunId, nodes, edges } = params;
  
  const inDegree: Record<string, number> = {};
  nodes.forEach(n => inDegree[n.nodeId] = 0);
  edges.forEach(e => {
    if (inDegree[e.targetNodeId] !== undefined) {
      inDegree[e.targetNodeId]++;
    }
  });

  const executions = nodes.map(node => ({
    tenant_id: tenantId,
    workflow_run_id: workflowRunId,
    node_id: node.nodeId,
    node_type: node.nodeType,
    status: (inDegree[node.nodeId] === 0 ? 'READY' : 'PENDING') as NodeExecutionStatus,
    config: node.config,
    inputs: {},
    outputs: {},
    retry_count: 0,
    worker_id: null,
    worker_token: null
  }));

  const { error } = await supabase.from('wf_node_executions').insert(executions);
  if (error) {
    throw WorkflowError.system('INIT_NODES_FAILED', 'Failed to initialize node executions: ' + error.message);
  }
}

/**
 * The main execution loop.
 * Finds READY nodes, claims them atomically, executes them,
 * persists results, and activates downstream nodes.
 */
export async function executeWorkflowCycle(params: {
  tenantId: string;
  workflowRunId: string;
  workerId: string;
}): Promise<{ 
  nodeProcessed: string | null;
  status: 'processed' | 'no_ready_nodes' | 'concurrency_limit' | 'completed' | 'failed';
  error?: string;
}> {
  const { tenantId, workflowRunId, workerId } = params;

  // Check run status
  const { data: run, error: runErr } = await supabase
    .from('wf_workflow_runs')
    .select('status, trace_id')
    .eq('id', workflowRunId)
    .single();

  if (runErr || !run) {
    return { nodeProcessed: null, status: 'failed', error: 'Workflow run not found' };
  }

  if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
    return { nodeProcessed: null, status: 'completed' };
  }

  if (run.status === 'CREATED') {
    await supabase.from('wf_workflow_runs').update({ status: 'RUNNING' }).eq('id', workflowRunId);
    await emitExecutionEvent(tenantId, workflowRunId, 'WORKFLOW_STARTED', {}, undefined, run.trace_id);
  }

  // Check concurrency limit
  const limitCheck = await checkTenantConcurrency(tenantId, DEFAULT_TENANT_LIMITS);
  if (!limitCheck.allowed) {
    return { nodeProcessed: null, status: 'concurrency_limit' };
  }

  const workerToken = crypto.randomUUID();

  // Atomically claim a READY node
  const { data: claimData, error: claimErr } = await supabase.rpc('claim_workflow_node', {
    p_workflow_run_id: workflowRunId,
    p_worker_id: workerId,
    p_worker_token: workerToken
  });

  if (claimErr) {
    return { nodeProcessed: null, status: 'failed', error: 'Failed to claim node: ' + claimErr.message };
  }

  if (!claimData || claimData.length === 0) {
    const isComplete = await checkWorkflowCompletion({ tenantId, workflowRunId });
    if (isComplete.isComplete) {
      await supabase.from('wf_workflow_runs').update({ status: isComplete.finalStatus }).eq('id', workflowRunId);
      await emitExecutionEvent(tenantId, workflowRunId, 'WORKFLOW_COMPLETED', { finalStatus: isComplete.finalStatus }, undefined, run.trace_id);
      return { nodeProcessed: null, status: 'completed' };
    }
    return { nodeProcessed: null, status: 'no_ready_nodes' };
  }

  const nodeExecution = claimData[0] as NodeExecutionRecord;

  try {
    await executeNode({
      tenantId,
      workflowRunId,
      nodeExecution,
      workerId,
      workerToken,
      traceId: run.trace_id
    });
    return { nodeProcessed: nodeExecution.id, status: 'processed' };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { nodeProcessed: nodeExecution.id, status: 'failed', error: errorMsg };
  }
}

/**
 * Execute a single node.
 * Resolves inputs via expression engine, runs the node's execute(),
 * and handles the result (success, failure, waiting).
 */
async function executeNode(params: {
  tenantId: string;
  workflowRunId: string;
  nodeExecution: NodeExecutionRecord;
  workerId: string;
  workerToken: string;
  traceId: string;
}): Promise<void> {
  const { tenantId, workflowRunId, nodeExecution, workerId, traceId } = params;

  await emitExecutionEvent(tenantId, workflowRunId, 'NODE_STARTED', { nodeId: nodeExecution.node_id }, nodeExecution.id, traceId);

  // Load workflow context
  const { data: runData } = await supabase.from('wf_workflow_runs').select('variables, trigger_payload').eq('id', workflowRunId).single();
  const { data: pastNodes } = await supabase.from('wf_node_executions').select('node_id, outputs').eq('workflow_run_id', workflowRunId).eq('status', 'SUCCEEDED');
  
  const context: Record<string, unknown> = {
    trigger: runData?.trigger_payload ?? {},
    variables: runData?.variables ?? {},
    nodes: (pastNodes ?? []).reduce((acc, curr) => ({ ...acc, [curr.node_id]: curr.outputs }), {})
  };

  try {
    // Resolve inputs
    const resolvedInputs = resolveConfigTemplates(nodeExecution.config, context) as Record<string, unknown>;

    // Create attempt record
    const { data: attempt } = await supabase.from('wf_node_attempts').insert({
      node_execution_id: nodeExecution.id,
      attempt_number: nodeExecution.retry_count + 1,
      worker_id: workerId,
      started_at: new Date().toISOString()
    }).select('id').single();

    // Get node implementation
    const nodeImpl = nodeRegistry.getNode(nodeExecution.node_type);
    if (!nodeImpl) {
      throw WorkflowError.configuration('NODE_TYPE_NOT_FOUND', `Node type ${nodeExecution.node_type} not found`);
    }

    // Execute node
    // Node contract: execute(input, context).
    const result = await nodeImpl.execute(resolvedInputs, {
      ...(context as Record<string, unknown>),
      executionId: nodeExecution.id,
      tenantId,
    });

    if (attempt) {
      await supabase.from('wf_node_attempts').update({ completed_at: new Date().toISOString(), result_status: 'SUCCEEDED' }).eq('id', attempt.id);
    }

    if (result.status === 'waiting') {
      await supabase.from('wf_node_executions').update({ status: 'WAITING', inputs: resolvedInputs }).eq('id', nodeExecution.id);
      await emitExecutionEvent(tenantId, workflowRunId, 'NODE_WAITING', { nodeId: nodeExecution.node_id }, nodeExecution.id, traceId);
    } else {
      await supabase.from('wf_node_executions').update({ status: 'SUCCEEDED', outputs: result.output ?? {}, inputs: resolvedInputs }).eq('id', nodeExecution.id);
      await emitExecutionEvent(tenantId, workflowRunId, 'NODE_SUCCEEDED', { nodeId: nodeExecution.node_id, outputs: result.output }, nodeExecution.id, traceId);
      
      // Load edges
      const { data: edgeData } = await supabase.from('wf_workflow_definitions')
        .select('edges')
        .eq('id', (await supabase.from('wf_workflow_runs').select('workflow_id').eq('id', workflowRunId).single()).data?.workflow_id)
        .single();
        
      if (edgeData?.edges) {
        await activateDownstreamNodes({
          tenantId,
          workflowRunId,
          completedNodeId: nodeExecution.node_id,
          edges: edgeData.edges as any,
          nodeOutputs: result.output ?? {}
        });
      }
    }
  } catch (error) {
    const errorDetails = WorkflowError.fromUnknown(error).toJSON();
    
    // Check retry
    const maxRetries = 3;
    if (nodeExecution.retry_count < maxRetries) {
      const delay = calculateRetryDelay(DEFAULT_RETRY_POLICY, nodeExecution.retry_count + 1);
      await supabase.from('wf_node_executions').update({ 
        status: 'RETRY_WAIT', 
        error_details: errorDetails,
        retry_count: nodeExecution.retry_count + 1,
        retry_at: new Date(Date.now() + delay).toISOString()
      }).eq('id', nodeExecution.id);
      await emitExecutionEvent(tenantId, workflowRunId, 'NODE_RETRY_SCHEDULED', { nodeId: nodeExecution.node_id, error: errorDetails }, nodeExecution.id, traceId);
    } else {
      await supabase.from('wf_node_executions').update({ status: 'FAILED', error_details: errorDetails }).eq('id', nodeExecution.id);
      await emitExecutionEvent(tenantId, workflowRunId, 'NODE_FAILED', { nodeId: nodeExecution.node_id, error: errorDetails }, nodeExecution.id, traceId);
      
      await enqueueToDLQ({
        tenantId,
        workflowRunId,
        nodeExecutionId: nodeExecution.id,
        nodeType: nodeExecution.node_type,
        error: errorDetails,
        executionContext: { nodeId: nodeExecution.node_id, retryCount: nodeExecution.retry_count },
        attemptHistory: [],
      });
    }
  }
}

/**
 * Evaluate outgoing edges from a completed node and activate downstream nodes.
 */
async function activateDownstreamNodes(params: {
  tenantId: string;
  workflowRunId: string;
  completedNodeId: string;
  edges: Array<{ sourceNodeId: string; targetNodeId: string; condition?: string }>;
  nodeOutputs: Record<string, unknown>;
}): Promise<void> {
  const { workflowRunId, completedNodeId, edges, nodeOutputs } = params;
  
  const outgoing = edges.filter(e => e.sourceNodeId === completedNodeId);
  const contextForEval = { outputs: { [completedNodeId]: nodeOutputs } };

  for (const edge of outgoing) {
    let activate = true;
    if (edge.condition) {
      try {
        activate = evaluateCondition(edge.condition, contextForEval);
      } catch (e) {
        activate = false;
      }
    }

    if (activate) {
      // Check if all incoming to target are done
      const incomingToTarget = edges.filter(e => e.targetNodeId === edge.targetNodeId);
      const incomingIds = incomingToTarget.map(e => e.sourceNodeId);
      
      const { data: statuses } = await supabase.from('wf_node_executions')
        .select('node_id, status')
        .eq('workflow_run_id', workflowRunId)
        .in('node_id', incomingIds);
        
      const allCompleted = statuses?.every(s => s.status === 'SUCCEEDED' || s.status === 'SKIPPED') ?? false;
      if (allCompleted) {
        await supabase.from('wf_node_executions')
          .update({ status: 'READY' })
          .eq('workflow_run_id', workflowRunId)
          .eq('node_id', edge.targetNodeId)
          .eq('status', 'PENDING'); // only update if PENDING
      }
    } else {
      await supabase.from('wf_node_executions')
        .update({ status: 'SKIPPED' })
        .eq('workflow_run_id', workflowRunId)
        .eq('node_id', edge.targetNodeId)
        .eq('status', 'PENDING');
    }
  }
}

/**
 * Check if the workflow run is complete.
 */
export async function checkWorkflowCompletion(params: {
  tenantId: string;
  workflowRunId: string;
}): Promise<{ isComplete: boolean; finalStatus: WorkflowRunStatus }> {
  const { workflowRunId } = params;
  const { data: activeNodes } = await supabase.from('wf_node_executions')
    .select('id, status')
    .eq('workflow_run_id', workflowRunId)
    .in('status', ['PENDING', 'READY', 'QUEUED', 'RUNNING', 'WAITING', 'RETRY_WAIT']);
    
  if (!activeNodes || activeNodes.length === 0) {
    const { data: failedNodes } = await supabase.from('wf_node_executions')
      .select('id')
      .eq('workflow_run_id', workflowRunId)
      .eq('status', 'FAILED');
      
    return {
      isComplete: true,
      finalStatus: failedNodes && failedNodes.length > 0 ? 'FAILED' : 'COMPLETED'
    };
  }
  
  return { isComplete: false, finalStatus: 'RUNNING' };
}

/**
 * Cancel a workflow run and all its active nodes.
 */
export async function cancelWorkflowRun(
  workflowRunId: string,
  tenantId: string,
  reason?: string,
): Promise<void> {
  await supabase.from('wf_workflow_runs').update({ status: 'CANCELLING' }).eq('id', workflowRunId).eq('tenant_id', tenantId);
  await supabase.from('wf_node_executions')
    .update({ status: 'CANCELLED' })
    .eq('workflow_run_id', workflowRunId)
    .in('status', ['PENDING', 'READY', 'QUEUED', 'RUNNING', 'WAITING', 'RETRY_WAIT']);
    
  await cancelChildWorkflows(tenantId, workflowRunId);
  await supabase.from('wf_workflow_runs').update({ status: 'CANCELLED' }).eq('id', workflowRunId);
  await emitExecutionEvent(tenantId, workflowRunId, 'WORKFLOW_CANCELLED', { reason });
}

/**
 * Send a heartbeat for a running node execution.
 */
export async function sendHeartbeat(
  nodeExecutionId: string,
  workerToken: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('wf_node_executions')
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq('id', nodeExecutionId)
    .eq('worker_token', workerToken)
    .select('id');
    
  return !error && data && data.length > 0;
}

/**
 * Run a complete workflow from start to finish.
 */
export async function runWorkflowToCompletion(params: {
  tenantId: string;
  environment: string;
  workflowId: string;
  versionId: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  nodes: Array<{ nodeId: string; nodeType: string; config: Record<string, unknown> }>;
  edges: Array<{ sourceNodeId: string; targetNodeId: string; condition?: string }>;
  variables?: Record<string, unknown>;
  maxCycles?: number;
  onProgress?: (event: { cycle: number; nodeId: string; status: string }) => void;
}): Promise<{
  runId: string;
  status: WorkflowRunStatus;
  nodeResults: Record<string, unknown>;
  events: Array<{ eventType: string; timestamp: string }>;
}> {
  const { runId } = await createWorkflowRun(params);
  await initializeNodeExecutions({
    tenantId: params.tenantId,
    workflowRunId: runId,
    nodes: params.nodes,
    edges: params.edges
  });
  
  const workerId = 'sync-worker-' + crypto.randomUUID();
  let cycles = 0;
  const max = params.maxCycles ?? 1000;
  
  while (cycles < max) {
    const res = await executeWorkflowCycle({
      tenantId: params.tenantId,
      workflowRunId: runId,
      workerId
    });
    
    if (res.nodeProcessed && params.onProgress) {
      params.onProgress({ cycle: cycles, nodeId: res.nodeProcessed, status: res.status });
    }
    
    if (res.status === 'completed' || res.status === 'no_ready_nodes') {
      break;
    }
    cycles++;
  }
  
  const { data: finalRun } = await supabase.from('wf_workflow_runs').select('status').eq('id', runId).single();
  const { data: nodes } = await supabase.from('wf_node_executions').select('node_id, outputs').eq('workflow_run_id', runId).eq('status', 'SUCCEEDED');
  const { data: events } = await supabase.from('wf_execution_events').select('event_type, created_at').eq('workflow_run_id', runId).order('created_at', { ascending: true });
  
  return {
    runId,
    status: (finalRun?.status ?? 'FAILED') as WorkflowRunStatus,
    nodeResults: (nodes ?? []).reduce((acc, curr) => ({ ...acc, [curr.node_id]: curr.outputs }), {}),
    events: (events ?? []).map(e => ({ eventType: e.event_type, timestamp: e.created_at }))
  };
}
