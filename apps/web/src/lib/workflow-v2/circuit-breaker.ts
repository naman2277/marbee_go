import { supabase } from '../supabase';

export interface CircuitBreakerRow {
  id: string;
  tenant_id: string;
  provider_key: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures_count: number;
  total_count: number;
  last_failure_at: string | null;
  updated_at: string;
}

/**
 * Circuit Breaker per-provider to prevent cascading failures.
 * State is managed in the `wf_circuit_breaker_state` database table.
 */
export class CircuitBreaker {
  private tenantId: string;
  private providerKey: string;

  constructor(tenantId: string, providerKey: string) {
    this.tenantId = tenantId;
    this.providerKey = providerKey;
  }

  /**
   * Check if execution is allowed.
   * Closed = allowed. Open = denied (unless 30s elapsed -> Half-Open).
   */
  async canExecute(): Promise<boolean> {
    const state = await this.getState();
    if (!state) return true; // Default to closed if no state

    if (state.state === 'OPEN') {
      const lastFailure = state.last_failure_at ? new Date(state.last_failure_at).getTime() : 0;
      const now = Date.now();
      
      // Probe after 30 seconds
      if (now - lastFailure > 30000) {
        await supabase
          .from('wf_circuit_breaker_state')
          .update({ state: 'HALF_OPEN', updated_at: new Date().toISOString() })
          .eq('tenant_id', this.tenantId)
          .eq('provider_key', this.providerKey);
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Record a successful call. Resets failures if HALF_OPEN.
   */
  async recordSuccess(): Promise<void> {
    const state = await this.getState();
    if (state && state.state === 'HALF_OPEN') {
      await this.reset();
    } else {
      await supabase.rpc('wf_increment_circuit_success', {
        p_tenant_id: this.tenantId,
        p_provider_key: this.providerKey,
      });
    }
  }

  /**
   * Record a failure. If failure rate > 50% in window, trip breaker.
   */
  async recordFailure(): Promise<void> {
    await supabase.rpc('wf_record_circuit_failure', {
      p_tenant_id: this.tenantId,
      p_provider_key: this.providerKey,
    });
  }

  /**
   * Get the current state of the circuit breaker.
   */
  async getState(): Promise<CircuitBreakerRow | null> {
    const { data, error } = await supabase
      .from('wf_circuit_breaker_state')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .eq('provider_key', this.providerKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to get circuit breaker state', error);
      return null;
    }
    return data as CircuitBreakerRow | null;
  }

  /**
   * Manually reset the circuit to CLOSED.
   */
  async reset(): Promise<void> {
    await supabase
      .from('wf_circuit_breaker_state')
      .update({
        state: 'CLOSED',
        failures_count: 0,
        total_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', this.tenantId)
      .eq('provider_key', this.providerKey);
  }
}
