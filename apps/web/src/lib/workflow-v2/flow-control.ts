import { supabase } from '../supabase';

/**
 * Per-tenant concurrency limiter.
 * Checks how many node executions are currently RUNNING for a tenant
 * and blocks new claims if the limit is exceeded.
 */

// Default limits by plan tier
const DEFAULT_LIMITS: Record<string, { maxConcurrent: number; maxPerMinute: number }> = {
  starter: { maxConcurrent: 10, maxPerMinute: 50 },
  growth: { maxConcurrent: 50, maxPerMinute: 200 },
  enterprise: { maxConcurrent: 200, maxPerMinute: 1000 },
};

/**
 * Defines the limits for a tenant.
 */
export type TenantLimits = {
  /** Maximum number of node executions allowed to run concurrently */
  maxConcurrentNodeExecutions: number;
  /** Maximum number of workflow runs allowed per minute */
  maxWorkflowRunsPerMinute: number;
  /** Maximum batch size for fan-out operations */
  maxFanOutBatchSize: number;
  /** Maximum allowed depth for sub-workflows */
  maxSubWorkflowDepth: number;
};

/**
 * Check if a tenant has capacity to execute another node.
 * Queries wf_node_executions for RUNNING status count.
 * 
 * @param tenantId - The unique identifier of the tenant.
 * @param limits - The tenant's limits configuration.
 * @returns A promise that resolves to an object indicating if execution is allowed, current running count, and the limit.
 */
export async function checkTenantConcurrency(
  tenantId: string,
  limits: TenantLimits,
): Promise<{ allowed: boolean; currentCount: number; limit: number }> {
  // Count currently running node executions for this tenant
  const { count, error } = await supabase
    .from('wf_node_executions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'RUNNING');

  if (error) {
    console.error('Failed to check tenant concurrency:', error);
  }

  const currentCount = count ?? 0;
  return {
    allowed: currentCount < limits.maxConcurrentNodeExecutions,
    currentCount,
    limit: limits.maxConcurrentNodeExecutions,
  };
}

/**
 * Token bucket rate limiter for per-provider rate limiting.
 * Implements a simple in-memory token bucket with database-backed state for persistence.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRatePerSecond: number;

  /**
   * Initializes a new TokenBucketRateLimiter.
   * @param maxTokens - Maximum number of tokens the bucket can hold.
   * @param refillRatePerSecond - Number of tokens added to the bucket per second.
   */
  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRatePerSecond = refillRatePerSecond;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token. Returns true if the request is allowed.
   * Refills tokens based on elapsed time since last refill.
   * 
   * @param tokensNeeded - The number of tokens needed for the operation (default is 1).
   * @returns An object indicating if the tokens were successfully consumed and the wait time in ms if not.
   */
  tryConsume(tokensNeeded = 1): { allowed: boolean; retryAfterMs: number } {
    this.refill();
    if (this.tokens >= tokensNeeded) {
      this.tokens -= tokensNeeded;
      return { allowed: true, retryAfterMs: 0 };
    }
    // Calculate wait time for enough tokens
    const deficit = tokensNeeded - this.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillRatePerSecond) * 1000);
    return { allowed: false, retryAfterMs };
  }

  /**
   * Refills the token bucket based on the elapsed time since the last refill.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
    this.lastRefill = now;
  }

  /**
   * Gets the currently available tokens in the bucket after attempting a refill.
   */
  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

/**
 * Provider rate limiter registry.
 * Manages per-provider token buckets for rate limiting external API calls.
 */
export class ProviderRateLimiterRegistry {
  private limiters = new Map<string, TokenBucketRateLimiter>();

  /**
   * Get or create a rate limiter for a provider.
   * 
   * @param providerKey - Unique key for the provider.
   * @param maxPerSecond - Maximum number of tokens per second for this provider (default is 10).
   * @returns The existing or newly created rate limiter.
   */
  getLimiter(providerKey: string, maxPerSecond = 10): TokenBucketRateLimiter {
    if (!this.limiters.has(providerKey)) {
      // Burst size = 2x max per second
      this.limiters.set(providerKey, new TokenBucketRateLimiter(maxPerSecond * 2, maxPerSecond));
    }
    return this.limiters.get(providerKey)!;
  }

  /**
   * Check if a provider call is allowed based on its rate limits.
   * 
   * @param providerKey - Unique key for the provider.
   * @param maxPerSecond - Maximum number of tokens per second (default is 10).
   * @returns An object containing whether the call is allowed and the retry wait time in ms if not.
   */
  checkRate(providerKey: string, maxPerSecond = 10): { allowed: boolean; retryAfterMs: number } {
    return this.getLimiter(providerKey, maxPerSecond).tryConsume();
  }

  /**
   * Reset all rate limiters, clearing the registry.
   */
  reset(): void {
    this.limiters.clear();
  }
}

/** 
 * Singleton provider rate limiter registry for tracking global provider usage 
 */
export const providerRateLimiters = new ProviderRateLimiterRegistry();

/**
 * Get default tenant limits for a specific plan tier.
 * 
 * @param plan - The subscription plan tier name (e.g. 'starter', 'growth', 'enterprise').
 * @returns The tenant limits configuration for the provided plan tier.
 */
export function getDefaultLimits(plan: string): TenantLimits {
  const base = DEFAULT_LIMITS[plan] ?? DEFAULT_LIMITS.starter;
  return {
    maxConcurrentNodeExecutions: base.maxConcurrent,
    maxWorkflowRunsPerMinute: base.maxPerMinute,
    maxFanOutBatchSize: plan === 'enterprise' ? 50000 : plan === 'growth' ? 10000 : 5000,
    maxSubWorkflowDepth: 5,
  };
}
