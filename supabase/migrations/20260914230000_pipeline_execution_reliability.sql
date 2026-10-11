-- Pipeline execution reliability: leases, heartbeats, bounded recovery and
-- idempotent artifacts. Run after the pipeline execution model migration.

ALTER TABLE public.data_job_runs
  ADD COLUMN IF NOT EXISTS worker_token UUID,
  ADD COLUMN IF NOT EXISTS worker_attempt INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ;

ALTER TABLE public.data_job_node_runs
  ADD COLUMN IF NOT EXISTS worker_token UUID;

CREATE INDEX IF NOT EXISTS idx_data_job_runs_worker_recovery
  ON public.data_job_runs (status, heartbeat_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.data_job_run_artifacts
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_job_run_artifacts_idempotency
  ON public.data_job_run_artifacts (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- A run is recoverable only when its lease has expired. The token prevents a
-- late worker from overwriting the result of a newer recovery attempt.
CREATE OR REPLACE FUNCTION public.claim_pipeline_run(p_run_id UUID, p_lease_seconds INTEGER DEFAULT 900)
RETURNS TABLE (id UUID, job_id UUID, tenant_id UUID, environment TEXT, version_id UUID,
               status TEXT, run_mode TEXT, until_node_id TEXT, from_node_id TEXT,
               worker_token UUID, deadline_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_token UUID := gen_random_uuid();
BEGIN
  RETURN QUERY
  UPDATE public.data_job_runs r
  SET status = 'running',
      worker_token = v_token,
      worker_attempt = r.worker_attempt + 1,
      started_at = CASE WHEN r.started_at IS NULL OR r.status <> 'running' THEN NOW() ELSE r.started_at END,
      heartbeat_at = NOW(),
      last_progress_at = NOW(),
      deadline_at = NOW() + make_interval(secs => GREATEST(60, LEAST(p_lease_seconds, 3600)))
  WHERE r.id = p_run_id
    AND (
      r.status = 'queued'
      OR (r.status = 'running' AND COALESCE(r.heartbeat_at, r.started_at, r.queued_at)
          < NOW() - make_interval(secs => GREATEST(60, LEAST(p_lease_seconds, 3600))))
    )
  RETURNING r.id, r.job_id, r.tenant_id, r.environment, r.version_id, r.status,
            r.run_mode, r.until_node_id, r.from_node_id, r.worker_token, r.deadline_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_pipeline_run(UUID, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.touch_pipeline_run(p_run_id UUID, p_worker_token UUID, p_progress JSONB DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.data_job_runs
  SET heartbeat_at = NOW(), last_progress_at = NOW(),
      stats = CASE WHEN p_progress IS NULL THEN stats ELSE COALESCE(stats, '{}'::jsonb) || p_progress END
  WHERE id = p_run_id AND status = 'running' AND worker_token = p_worker_token;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_pipeline_run(UUID, UUID, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_pipeline_runs(p_timeout_seconds INTEGER DEFAULT 900)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.data_job_runs
  SET status = 'failed',
      completed_at = NOW(),
      error_log = COALESCE(error_log, '[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object('reason', 'timeout', 'message', 'Worker lease expired'))
  WHERE status = 'running'
    AND COALESCE(heartbeat_at, started_at, queued_at)
        < NOW() - make_interval(secs => GREATEST(60, LEAST(p_timeout_seconds, 3600)));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_stale_pipeline_runs(INTEGER) TO service_role;
