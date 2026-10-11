import { supabase } from '../supabase';

/**
 * Configuration options for fan-out execution.
 */
export type FanOutConfig = {
  /** Size of each batch of items to process (default: 1000) */
  batchSize: number;
  /** The ratio of successes required to consider the operation a partial success instead of failure (default: 0.95) */
  successThreshold: number;
  /** Maximum number of batches to process concurrently (default: 5) */
  maxConcurrentBatches: number;
  /** Whether to allow partial success states when the successThreshold is met (default: true) */
  enablePartialSuccess: boolean;
};

/**
 * Progress snapshot of a fan-out operation.
 */
export type FanOutProgress = {
  /** Total number of individual items to be processed */
  totalItems: number;
  /** Total number of batches created from the items */
  totalBatches: number;
  /** Number of batches that have been successfully processed */
  completedBatches: number;
  /** Number of batches that have failed processing */
  failedBatches: number;
  /** Number of batches that were cancelled before processing */
  cancelledBatches: number;
  /** Cumulative count of successfully processed items across all batches */
  successCount: number;
  /** Cumulative count of failed items across all batches */
  failureCount: number;
  /** Current ratio of successfully processed items */
  successRate: number;
  /** Current execution status of the fan-out operation */
  status: 'running' | 'completed' | 'partial_success' | 'failed' | 'cancelled';
};

/**
 * Aggregated result produced after a fan-out operation is completed.
 */
export type FanInResult = {
  /** Total number of successfully processed items */
  totalSent: number;
  /** Total number of failed items */
  totalFailed: number;
  /** Map of error substrings to their occurrence count */
  errorBreakdown: Record<string, number>;
  /** Overall ratio of successfully processed items */
  successRate: number;
  /** Total time taken for the entire fan-out operation in milliseconds */
  durationMs: number;
};

/**
 * Detailed result of a single batch processing operation.
 */
export type BatchResult = {
  /** The 0-based index of this batch within the overall fan-out operation */
  batchIndex: number;
  /** Number of items contained in this batch */
  itemCount: number;
  /** Number of successfully processed items in this batch */
  successCount: number;
  /** Number of failed items in this batch */
  failureCount: number;
  /** Array of specific errors encountered during this batch processing */
  errors: Array<{ itemId: string; error: string }>;
  /** Time taken to process this batch in milliseconds */
  durationMs: number;
};

/**
 * Split an array of items into an array of smaller batches of the specified size.
 * 
 * @param items - The full array of items to split.
 * @param batchSize - The maximum number of items in each batch.
 * @returns An array of item arrays, each up to `batchSize` length.
 */
export function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Fan-out engine for campaign-scale operations.
 * Manages the lifecycle of batch execution including progress tracking,
 * partial failure handling, cancellation, and result aggregation.
 */
export class FanOutEngine {
  private config: FanOutConfig;
  private progress: FanOutProgress;
  private batchResults: BatchResult[] = [];
  private cancelled = false;
  private startTime = 0;

  /**
   * Initializes a new FanOutEngine with the provided or default configuration.
   * 
   * @param config - Optional configuration overrides.
   */
  constructor(config?: Partial<FanOutConfig>) {
    this.config = {
      batchSize: config?.batchSize ?? 1000,
      successThreshold: config?.successThreshold ?? 0.95,
      maxConcurrentBatches: config?.maxConcurrentBatches ?? 5,
      enablePartialSuccess: config?.enablePartialSuccess ?? true,
    };
    this.progress = this.createInitialProgress(0, 0);
  }

  /**
   * Constructs the initial progress object.
   */
  private createInitialProgress(totalItems: number, totalBatches: number): FanOutProgress {
    return {
      totalItems,
      totalBatches,
      completedBatches: 0,
      failedBatches: 0,
      cancelledBatches: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      status: 'running',
    };
  }

  /**
   * Execute a fan-out operation.
   * Splits items into batches and processes them with concurrency control.
   * 
   * @param items - The full list of items to process.
   * @param processBatch - Callback function to process a single batch.
   * @param onProgress - Optional callback function for progress updates.
   * @returns A promise resolving to the final aggregated fan-in result.
   */
  async execute<T>(
    items: T[],
    processBatch: (batch: T[], batchIndex: number) => Promise<BatchResult>,
    onProgress?: (progress: FanOutProgress) => void,
  ): Promise<FanInResult> {
    this.startTime = Date.now();
    const batches = createBatches(items, this.config.batchSize);
    this.progress = this.createInitialProgress(items.length, batches.length);
    this.batchResults = [];
    this.cancelled = false;

    // Process batches with concurrency control
    const concurrencyLimit = this.config.maxConcurrentBatches;
    let batchIndex = 0;

    const processConcurrent = async (): Promise<void> => {
      while (batchIndex < batches.length && !this.cancelled) {
        const currentIndex = batchIndex++;
        const batch = batches[currentIndex];
        try {
          const result = await processBatch(batch, currentIndex);
          this.batchResults.push(result);
          this.progress.completedBatches++;
          this.progress.successCount += result.successCount;
          this.progress.failureCount += result.failureCount;
        } catch (err) {
          this.progress.failedBatches++;
          this.progress.failureCount += batch.length;
          this.batchResults.push({
            batchIndex: currentIndex,
            itemCount: batch.length,
            successCount: 0,
            failureCount: batch.length,
            errors: [{ itemId: 'batch', error: err instanceof Error ? err.message : String(err) }],
            durationMs: 0,
          });
        }
        this.progress.successRate =
          this.progress.successCount / Math.max(1, this.progress.successCount + this.progress.failureCount);
        onProgress?.(this.getProgress());
      }
    };

    // Launch concurrent workers
    const workers = Array.from({ length: Math.min(concurrencyLimit, batches.length) }, () => processConcurrent());
    await Promise.all(workers);

    // Mark remaining batches as cancelled if cancellation was requested
    if (this.cancelled) {
      const remaining = batches.length - (this.progress.completedBatches + this.progress.failedBatches);
      this.progress.cancelledBatches = remaining;
    }

    // Determine final status
    this.progress.status = this.determineFinalStatus();
    onProgress?.(this.getProgress());

    return this.buildFanInResult();
  }

  /** Request cancellation of remaining batches */
  cancel(): void {
    this.cancelled = true;
  }

  /** 
   * Get current progress snapshot.
   * @returns A shallow copy of the current progress state.
   */
  getProgress(): FanOutProgress {
    return { ...this.progress };
  }

  /**
   * Determines the final execution status based on progress and configuration.
   */
  private determineFinalStatus(): FanOutProgress['status'] {
    if (this.cancelled) return 'cancelled';
    if (this.progress.failedBatches === this.progress.totalBatches) return 'failed';
    if (this.progress.failureCount === 0) return 'completed';
    if (this.config.enablePartialSuccess && this.progress.successRate >= this.config.successThreshold) {
      return 'partial_success';
    }
    return 'failed';
  }

  /**
   * Builds the aggregated result from all processed batches.
   */
  private buildFanInResult(): FanInResult {
    const errorBreakdown: Record<string, number> = {};
    for (const batch of this.batchResults) {
      for (const err of batch.errors) {
        const key = err.error.substring(0, 100); // Truncate long errors
        errorBreakdown[key] = (errorBreakdown[key] ?? 0) + 1;
      }
    }
    return {
      totalSent: this.progress.successCount,
      totalFailed: this.progress.failureCount,
      errorBreakdown,
      successRate: this.progress.successRate,
      durationMs: Date.now() - this.startTime,
    };
  }
}

/**
 * Persist fan-out progress to the database for visibility in the execution inspector.
 * 
 * @param tenantId - The unique identifier of the tenant.
 * @param workflowRunId - The unique identifier of the overall workflow run.
 * @param nodeExecutionId - The unique identifier of the specific node execution.
 * @param progress - The progress state to persist.
 * @returns A promise that resolves when the progress has been inserted into the database.
 */
export async function persistFanOutProgress(
  tenantId: string,
  workflowRunId: string,
  nodeExecutionId: string,
  progress: FanOutProgress,
): Promise<void> {
  await supabase.from('wf_execution_events').insert({
    tenant_id: tenantId,
    workflow_run_id: workflowRunId,
    node_execution_id: nodeExecutionId,
    event_type: 'fanout.progress',
    payload: progress,
  });
}
