/**
 * Workflow Engine V2 — Barrel Export
 *
 * Re-exports all workflow engine v2 modules for convenient consumption.
 * This is the single entry point for importing workflow-v2 functionality.
 *
 * Architecture: Three-Plane Separation
 * - Design Plane: workflow builder, node configs, validation, publish
 * - Execution Plane: this engine — scheduler, queue, workers, state machines, retries
 * - Data Plane: customer data, external integrations, accessed via controlled services
 */

// ─── Structured Error Model ────────────────────────────────────────────────
export { WorkflowError } from './workflow-error';
export type { ErrorCategory, WorkflowErrorData } from './workflow-error';

// ─── Sandboxed Expression Engine ────────────────────────────────────────────
export {
  resolveTemplate,
  evaluateCondition,
  resolveValue,
  validateExpression,
} from './sandboxed-expression-engine';
export type { ExpressionContext } from './sandboxed-expression-engine';

// ─── Circuit Breaker ────────────────────────────────────────────────────────
export { CircuitBreaker } from './circuit-breaker';

// ─── Retry Engine ───────────────────────────────────────────────────────────
export {
  calculateRetryDelay,
  shouldRetry,
  generateIdempotencyKey,
} from './retry-engine';

// ─── Dead Letter Queue ──────────────────────────────────────────────────────
export {
  enqueueToDLQ,
  fetchDLQEntries,
  replayDLQEntry,
  discardDLQEntry,
  quarantineDLQEntry,
  getDLQDepth,
} from './dead-letter-queue';

// ─── Flow Control & Rate Limiting ───────────────────────────────────────────
export {
  checkTenantConcurrency,
  TokenBucketRateLimiter,
  ProviderRateLimiterRegistry,
  providerRateLimiters,
  getDefaultLimits,
} from './flow-control';
export type { TenantLimits } from './flow-control';

// ─── Fan-Out / Fan-In Engine ────────────────────────────────────────────────
export {
  FanOutEngine,
  createBatches,
  persistFanOutProgress,
} from './fan-out-engine';
export type {
  FanOutConfig,
  FanOutProgress,
  FanInResult,
  BatchResult,
} from './fan-out-engine';

// ─── Sub-Workflow Composition ───────────────────────────────────────────────
export {
  startSubWorkflow,
  checkSubWorkflowCompletion,
  cancelChildWorkflows,
  getSubWorkflowTree,
  MAX_SUB_WORKFLOW_DEPTH,
} from './sub-workflow-engine';

// ─── Universal Node Registry ────────────────────────────────────────────────
export { nodeRegistry } from './universal-node-registry';
export type { RegisteredNode } from './universal-node-registry';

// ─── Core Execution Engine ──────────────────────────────────────────────────
export {
  createWorkflowRun,
  initializeNodeExecutions,
  executeWorkflowCycle,
  checkWorkflowCompletion,
  cancelWorkflowRun,
  sendHeartbeat,
  runWorkflowToCompletion,
  emitExecutionEvent,
  transitionWorkflowState,
  transitionNodeState,
} from './workflow-engine-v2';
