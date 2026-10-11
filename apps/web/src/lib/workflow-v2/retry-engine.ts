import { supabase } from '../supabase';
import type { WorkflowErrorData } from './workflow-error';
import { WorkflowError } from './workflow-error';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface NodeResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: WorkflowErrorData;
}

/**
 * Calculates delay in milliseconds using exponential backoff with jitter.
 */
export function calculateRetryDelay(policy: RetryPolicy, attemptNumber: number): number {
  const baseDelay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attemptNumber - 1);
  const maxCappedDelay = Math.min(baseDelay, policy.maxDelayMs);
  // Add jitter +/- 20%
  const jitter = maxCappedDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.floor(maxCappedDelay + jitter);
}

/**
 * Determines if an error should trigger a retry.
 */
export function shouldRetry(error: WorkflowErrorData, attemptNumber: number, maxAttempts: number): boolean {
  if (attemptNumber >= maxAttempts) return false;
  return error.retryable;
}

/**
 * Generates a unique idempotency key for retry attempts.
 */
export function generateIdempotencyKey(workflowRunId: string, nodeExecutionId: string, attemptNumber: number): string {
  return `${workflowRunId}::${nodeExecutionId}::attempt_${attemptNumber}`;
}

/**
 * Schedules a node execution to be retried by updating its `retry_at` timestamp.
 */
export async function scheduleRetry(nodeExecutionId: string, delayMs: number): Promise<void> {
  const retryAt = new Date(Date.now() + delayMs).toISOString();
  await supabase
    .from('wf_node_executions')
    .update({ retry_at: retryAt, status: 'PENDING_RETRY' })
    .eq('id', nodeExecutionId);
}

/**
 * Engine for wrapping node execution with retry and idempotency logic.
 */
export class RetryEngine {
  /**
   * Executes a function with the specified retry policy.
   * This is for inline execution, though for long delays, deferred scheduling is better.
   */
  async executeWithRetry(
    fn: (attempt: number) => Promise<NodeResult>,
    _context: { workflowRunId: string; nodeExecutionId: string },
    policy: RetryPolicy
  ): Promise<NodeResult> {
    let attempt = 1;
    while (true) {
      try {
        const result = await fn(attempt);
        if (result.success || !result.error) {
          return result;
        }

        if (!shouldRetry(result.error, attempt, policy.maxAttempts)) {
          return result;
        }

      } catch (err) {
        const error = WorkflowError.fromUnknown(err).toJSON();
        if (!shouldRetry(error, attempt, policy.maxAttempts)) {
          return { success: false, error };
        }
      }

      const delayMs = calculateRetryDelay(policy, attempt);
      
      // For short delays we sleep, for long delays we should ideally defer.
      // We implement a sleep here as part of the inline execution engine.
      await new Promise(resolve => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
}
