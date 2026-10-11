// ═══════════════════════════════════════════════════════════════════════════
// State Machine Enums
// ═══════════════════════════════════════════════════════════════════════════

/** Workflow run lifecycle states */
export type WorkflowRunStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLING' | 'CANCELLED' | 'PAUSED' | 'WAITING';

/** Node execution lifecycle states */
export type NodeExecutionStatus = 'PENDING' | 'READY' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'WAITING' | 'SKIPPED' | 'CANCELLED' | 'RETRY_WAIT';

/** Structured error categories */
export type ErrorCategory =
  | 'VALIDATION' | 'CONFIGURATION' | 'AUTHENTICATION' | 'AUTHORISATION'
  | 'TIMEOUT' | 'RATE_LIMIT' | 'TRANSIENT' | 'EXTERNAL_SERVICE'
  | 'DATA' | 'SYSTEM' | 'USER_ACTION_REQUIRED';

/** Circuit breaker states */
export type CircuitBreakerStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Human approval states */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

// ═══════════════════════════════════════════════════════════════════════════
// Structured Error Model
// ═══════════════════════════════════════════════════════════════════════════

/** Every failure in the workflow engine produces this structured error */
export type WorkflowErrorData = {
  code: string;          // Machine-readable, e.g., EMAIL_PROVIDER_TIMEOUT
  category: ErrorCategory;
  message: string;       // Technical detail for logs
  userMessage: string;   // Human-readable for the UI
  retryable: boolean;
  details?: Record<string, unknown>;
};

// ═══════════════════════════════════════════════════════════════════════════
// Retry Configuration
// ═══════════════════════════════════════════════════════════════════════════

/** Supported strategies for retrying failed nodes */
export type RetryStrategy = 'fixed' | 'linear' | 'exponential' | 'exponential_with_jitter';

/** Configuration for how failures should be retried */
export type RetryPolicy = {
  maxAttempts: number;
  strategy: RetryStrategy;
  initialDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: ErrorCategory[];
};

// ═══════════════════════════════════════════════════════════════════════════
// Universal Node Contract
// ═══════════════════════════════════════════════════════════════════════════

/** Schema definition for a node's input, output, or configuration */
export type NodeSchema = {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    enum?: unknown[];
  }>;
  required?: string[];
};

/** Metadata and capabilities returned by getDefinition() */
export type NodeDefinition = {
  type: string;           // e.g., 'email.send', 'segment.create'
  version: string;        // Semantic version of this node implementation
  displayName: string;
  description: string;
  category: 'trigger' | 'source' | 'transform' | 'action' | 'flow' | 'output';
  icon?: string;
  color?: string;
  retryPolicy: RetryPolicy;
  capabilities: {
    canPreview: boolean;
    canEstimateCost: boolean;
    hasCompensation: boolean;
    hasSideEffects: boolean;
    isAsync: boolean;
  };
};

/** Execution context passed to every node */
export type ExecutionContext = {
  tenantId: string;
  environment: string;
  workflowRunId: string;
  nodeExecutionId: string;
  attemptNumber: number;
  idempotencyKey: string;
  traceId: string;
  spanId: string;
  triggerPayload: Record<string, unknown>;
  workflowVariables: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;   // Previous node outputs keyed by nodeId
  secrets: SecretProvider;
  httpClient: HttpClient;
  logger: ExecutionLogger;
};

/** Secret provider interface — resolves secrets at runtime without logging values */
export type SecretProvider = {
  get(key: string): Promise<string | null>;
};

/** Options for making a controlled HTTP request */
export type HttpRequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
};

/** Response from a controlled HTTP request */
export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
};

/** Controlled HTTP client enforcing SSRF protection, timeouts, circuit breaking */
export type HttpClient = {
  request(options: HttpRequestOptions): Promise<HttpResponse>;
};

/** Logger for execution events */
export type ExecutionLogger = {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
};

/** Result returned by a node's execute() method */
export type NodeResult = {
  status: 'succeeded' | 'failed' | 'waiting';
  output?: Record<string, unknown>;
  error?: WorkflowErrorData;
  /** For waiting nodes: the condition that must be met to resume */
  waitCondition?: {
    type: 'duration' | 'datetime' | 'approval' | 'webhook' | 'sub_workflow';
    config: Record<string, unknown>;
  };
};

/** The universal contract that every node type implements */
export interface UniversalNodeContract {
  readonly type: string;
  readonly version: string;
  getDefinition(): NodeDefinition;
  validate(config: Record<string, unknown>, context: ExecutionContext): Promise<WorkflowErrorData[]>;
  resolveInputs(config: Record<string, unknown>, context: ExecutionContext): Promise<Record<string, unknown>>;
  execute(input: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult>;
  getInputSchema(): NodeSchema;
  getOutputSchema(): NodeSchema;
  getConfigurationSchema(): NodeSchema;
  // Optional lifecycle hooks
  onCancel?(context: ExecutionContext): Promise<void>;
  onTimeout?(context: ExecutionContext): Promise<void>;
  compensate?(context: ExecutionContext): Promise<void>;
  preview?(config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult>;
  estimateCost?(config: Record<string, unknown>, context: ExecutionContext): Promise<{ units: number; currency: string; breakdown?: Record<string, number> }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Row Types (matching Supabase tables)
// ═══════════════════════════════════════════════════════════════════════════

/** Database row for a workflow run */
export type WorkflowRunRow = {
  id: string;
  tenant_id: string;
  environment: string;
  workflow_id: string;
  version_id: string | null;
  status: WorkflowRunStatus;
  trigger_type: string | null;
  trigger_payload: Record<string, unknown>;
  variables: Record<string, unknown>;
  trace_id: string;
  parent_run_id: string | null;
  depth: number;
  worker_id: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: WorkflowErrorData | null;
  created_at: string;
  updated_at: string;
};

/** Database row for a node execution */
export type NodeExecutionRow = {
  id: string;
  tenant_id: string;
  workflow_run_id: string;
  node_id: string;
  node_type: string;
  status: NodeExecutionStatus;
  config: Record<string, unknown>;
  resolved_inputs: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: WorkflowErrorData | null;
  worker_id: string | null;
  worker_token: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  attempt_count: number;
  max_attempts: number;
  retry_at: string | null;
  idempotency_key: string | null;
  span_id: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Database row for a node attempt */
export type NodeAttemptRow = {
  id: string;
  tenant_id: string;
  node_execution_id: string;
  attempt_number: number;
  status: string;
  idempotency_key: string;
  input_snapshot: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: WorkflowErrorData | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
};

/** Database row for an execution event */
export type ExecutionEventRow = {
  id: string;
  tenant_id: string;
  workflow_run_id: string;
  node_execution_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  trace_id: string | null;
  span_id: string | null;
  created_at: string;
};

/** Database row for the dead letter queue */
export type DeadLetterQueueRow = {
  id: string;
  tenant_id: string;
  workflow_run_id: string;
  node_execution_id: string;
  node_type: string;
  error: WorkflowErrorData;
  execution_context: Record<string, unknown>;
  attempt_history: Record<string, unknown>[];
  status: 'pending' | 'replayed' | 'discarded' | 'quarantined';
  replayed_at: string | null;
  created_at: string;
};

/** Database row for circuit breaker state */
export type CircuitBreakerRow = {
  id: string;
  tenant_id: string;
  provider_key: string;
  status: CircuitBreakerStatus;
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  opened_at: string | null;
  half_open_at: string | null;
  window_start: string;
  updated_at: string;
};

/** Database row for human approvals */
export type ApprovalRow = {
  id: string;
  tenant_id: string;
  workflow_run_id: string;
  node_execution_id: string;
  title: string;
  description: string | null;
  requested_by: string | null;
  assigned_to: string[] | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  expires_at: string | null;
  created_at: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// Fan-Out / Fan-In Types
// ═══════════════════════════════════════════════════════════════════════════

/** Configuration for fan-out batch execution */
export type FanOutConfig = {
  batchSize: number;                 // Default 1000
  successThreshold: number;          // Default 0.95 (95%)
  maxConcurrentBatches: number;      // Default 5
  enablePartialSuccess: boolean;     // Default true
};

/** Progress tracking for fan-out operations */
export type FanOutProgress = {
  totalItems: number;
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  cancelledBatches: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  status: 'running' | 'completed' | 'partial_success' | 'failed' | 'cancelled';
};

/** Fan-in aggregation result */
export type FanInResult = {
  totalSent: number;
  totalFailed: number;
  errorBreakdown: Record<string, number>;
  successRate: number;
  duration_ms: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// Flow Control Types
// ═══════════════════════════════════════════════════════════════════════════

/** Tenant-level execution limits */
export type TenantExecutionLimits = {
  maxConcurrentNodeExecutions: number;   // Default 50
  maxWorkflowRunsPerMinute: number;      // Default 100
  maxFanOutBatchSize: number;            // Default 10000
  maxSubWorkflowDepth: number;           // Default 5
};

/** Per-provider rate limit configuration */
export type ProviderRateLimit = {
  provider: string;
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  burstSize: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// State Machine Transitions
// ═══════════════════════════════════════════════════════════════════════════

/** Valid workflow run state transitions */
export const VALID_WORKFLOW_TRANSITIONS: Record<WorkflowRunStatus, WorkflowRunStatus[]> = {
  CREATED: ['RUNNING'],
  RUNNING: ['COMPLETED', 'FAILED', 'CANCELLING', 'PAUSED', 'WAITING'],
  COMPLETED: [],
  FAILED: [],
  CANCELLING: ['CANCELLED'],
  CANCELLED: [],
  PAUSED: ['RUNNING'],
  WAITING: ['RUNNING'],
};

/** Valid node execution state transitions */
export const VALID_NODE_TRANSITIONS: Record<NodeExecutionStatus, NodeExecutionStatus[]> = {
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

/** Non-retryable error categories — retrying these would be harmful */
export const NON_RETRYABLE_CATEGORIES: ErrorCategory[] = [
  'VALIDATION', 'CONFIGURATION', 'AUTHENTICATION', 'AUTHORISATION',
];
