-- ==============================================================================
-- Migration: Workflow Engine V2 Schema
-- Description: Core tables, types, and functions for the Marbee Workflow Engine
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Custom Types (ENUMs)
-- ------------------------------------------------------------------------------

CREATE TYPE workflow_run_status AS ENUM (
    'CREATED', 
    'RUNNING', 
    'COMPLETED', 
    'FAILED', 
    'CANCELLING', 
    'CANCELLED', 
    'PAUSED', 
    'WAITING'
);

CREATE TYPE node_execution_status AS ENUM (
    'PENDING', 
    'READY', 
    'QUEUED', 
    'RUNNING', 
    'SUCCEEDED', 
    'FAILED', 
    'WAITING', 
    'SKIPPED', 
    'CANCELLED', 
    'RETRY_WAIT'
);

CREATE TYPE error_category AS ENUM (
    'VALIDATION', 
    'CONFIGURATION', 
    'AUTHENTICATION', 
    'AUTHORISATION', 
    'TIMEOUT', 
    'RATE_LIMIT', 
    'TRANSIENT', 
    'EXTERNAL_SERVICE', 
    'DATA', 
    'SYSTEM', 
    'USER_ACTION_REQUIRED'
);

CREATE TYPE circuit_breaker_status AS ENUM (
    'CLOSED', 
    'OPEN', 
    'HALF_OPEN'
);

CREATE TYPE approval_status AS ENUM (
    'PENDING', 
    'APPROVED', 
    'REJECTED', 
    'EXPIRED'
);

-- ------------------------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------------------------

-- Table: wf_workflow_runs
CREATE TABLE IF NOT EXISTS wf_workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    workflow_id UUID NOT NULL,
    version_id UUID,
    status workflow_run_status NOT NULL DEFAULT 'CREATED',
    trigger_type TEXT,
    trigger_payload JSONB DEFAULT '{}',
    variables JSONB DEFAULT '{}',
    trace_id UUID DEFAULT gen_random_uuid(),
    parent_run_id UUID,
    depth INTEGER NOT NULL DEFAULT 0,
    worker_id TEXT,
    lease_expires_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: wf_node_executions
CREATE TABLE IF NOT EXISTS wf_node_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workflow_run_id UUID NOT NULL REFERENCES wf_workflow_runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    status node_execution_status NOT NULL DEFAULT 'PENDING',
    config JSONB DEFAULT '{}',
    resolved_inputs JSONB,
    output JSONB,
    error JSONB,
    worker_id TEXT,
    worker_token UUID,
    lease_expires_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    retry_at TIMESTAMPTZ,
    idempotency_key TEXT,
    span_id UUID DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: wf_node_attempts
CREATE TABLE IF NOT EXISTS wf_node_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    node_execution_id UUID NOT NULL REFERENCES wf_node_executions(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    idempotency_key TEXT NOT NULL,
    input_snapshot JSONB,
    output JSONB,
    error JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER
);

-- Table: wf_execution_events
CREATE TABLE IF NOT EXISTS wf_execution_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workflow_run_id UUID NOT NULL,
    node_execution_id UUID,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    trace_id UUID,
    span_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: wf_dead_letter_queue
CREATE TABLE IF NOT EXISTS wf_dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workflow_run_id UUID NOT NULL,
    node_execution_id UUID NOT NULL,
    node_type TEXT NOT NULL,
    error JSONB NOT NULL,
    execution_context JSONB NOT NULL,
    attempt_history JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    replayed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: wf_circuit_breaker_state
CREATE TABLE IF NOT EXISTS wf_circuit_breaker_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    provider_key TEXT NOT NULL,
    status circuit_breaker_status NOT NULL DEFAULT 'CLOSED',
    failure_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    half_open_at TIMESTAMPTZ,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, provider_key)
);

-- Table: wf_approvals
CREATE TABLE IF NOT EXISTS wf_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workflow_run_id UUID NOT NULL REFERENCES wf_workflow_runs(id) ON DELETE CASCADE,
    node_execution_id UUID NOT NULL REFERENCES wf_node_executions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    requested_by TEXT,
    assigned_to TEXT[],
    status approval_status NOT NULL DEFAULT 'PENDING',
    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. Row-Level Security (RLS)
-- ------------------------------------------------------------------------------

-- Enable RLS
ALTER TABLE wf_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_node_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_node_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_execution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_circuit_breaker_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE wf_approvals ENABLE ROW LEVEL SECURITY;

-- Create policies for tenant isolation (assuming auth.uid() stores the tenant_id in this context)
-- Adjust the `auth.uid()::uuid` mapping depending on how tenant IDs are actually mapped in the application.

CREATE POLICY tenant_isolation_workflow_runs ON wf_workflow_runs
    FOR ALL USING (tenant_id = auth.uid()::uuid);

CREATE POLICY tenant_isolation_node_executions ON wf_node_executions
    FOR ALL USING (tenant_id = auth.uid()::uuid);

CREATE POLICY tenant_isolation_node_attempts ON wf_node_attempts
    FOR ALL USING (tenant_id = auth.uid()::uuid);

CREATE POLICY tenant_isolation_execution_events ON wf_execution_events
    FOR ALL USING (tenant_id = auth.uid()::uuid);

CREATE POLICY tenant_isolation_dlq ON wf_dead_letter_queue
    FOR ALL USING (tenant_id = auth.uid()::uuid);

CREATE POLICY tenant_isolation_circuit_breaker ON wf_circuit_breaker_state
    FOR ALL USING (tenant_id = auth.uid()::uuid);

CREATE POLICY tenant_isolation_approvals ON wf_approvals
    FOR ALL USING (tenant_id = auth.uid()::uuid);

-- Grant service_role access (which overrides RLS automatically, but we explicitly grant privileges)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Indexes
-- ------------------------------------------------------------------------------

-- Composite and partial indexes for optimized querying
CREATE INDEX idx_wf_node_executions_status ON wf_node_executions (tenant_id, workflow_run_id, status);
CREATE INDEX idx_wf_node_executions_ready ON wf_node_executions (id) WHERE status = 'READY';
CREATE INDEX idx_wf_node_executions_waiting ON wf_node_executions (id) WHERE status = 'WAITING';

CREATE INDEX idx_wf_execution_events_run ON wf_execution_events (workflow_run_id, created_at);
CREATE INDEX idx_wf_execution_events_tenant ON wf_execution_events (tenant_id, created_at);

CREATE INDEX idx_wf_dlq_status ON wf_dead_letter_queue (tenant_id, status);

CREATE INDEX idx_wf_runs_status ON wf_workflow_runs (tenant_id, status);
CREATE INDEX idx_wf_runs_workflow ON wf_workflow_runs (tenant_id, workflow_id);

CREATE INDEX idx_wf_approvals_status ON wf_approvals (tenant_id, status);

-- ------------------------------------------------------------------------------
-- 5. RPC Functions
-- ------------------------------------------------------------------------------

-- claim_workflow_node
CREATE OR REPLACE FUNCTION claim_workflow_node(
    p_node_execution_id UUID,
    p_worker_id TEXT,
    p_lease_seconds INTEGER DEFAULT 300
)
RETURNS SETOF wf_node_executions AS $$
DECLARE
    v_worker_token UUID;
BEGIN
    v_worker_token := gen_random_uuid();
    
    RETURN QUERY
    UPDATE wf_node_executions
    SET 
        status = 'RUNNING',
        worker_id = p_worker_id,
        worker_token = v_worker_token,
        lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        heartbeat_at = NOW(),
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE 
        id = p_node_execution_id 
        AND status = 'READY'
    RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- heartbeat_workflow_node
CREATE OR REPLACE FUNCTION heartbeat_workflow_node(
    p_node_execution_id UUID,
    p_worker_token UUID,
    p_lease_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
DECLARE
    v_found BOOLEAN;
BEGIN
    UPDATE wf_node_executions
    SET 
        heartbeat_at = NOW(),
        lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE 
        id = p_node_execution_id 
        AND worker_token = p_worker_token 
        AND status = 'RUNNING'
    RETURNING TRUE INTO v_found;
    
    RETURN COALESCE(v_found, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- recover_expired_workflow_nodes
CREATE OR REPLACE FUNCTION recover_expired_workflow_nodes(
    p_timeout_seconds INTEGER DEFAULT 300
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE wf_node_executions
    SET 
        status = 'READY',
        worker_id = NULL,
        worker_token = NULL,
        updated_at = NOW()
    WHERE 
        status = 'RUNNING' 
        AND lease_expires_at < NOW()
        AND heartbeat_at < NOW() - (p_timeout_seconds || ' seconds')::INTERVAL;
        
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION claim_workflow_node(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION heartbeat_workflow_node(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION recover_expired_workflow_nodes(INTEGER) TO service_role;
