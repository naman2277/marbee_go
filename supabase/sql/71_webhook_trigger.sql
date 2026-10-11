-- =============================================================================
-- MARBEE — Webhook trigger infrastructure
-- Adds trigger_payload to runs + index for webhook path lookup on data_jobs.
-- Run AFTER 60_pipeline_execution_model.sql. Safe to re-run.
-- =============================================================================

-- 1. Store the inbound payload that triggered a webhook/api run.
ALTER TABLE public.data_job_runs
  ADD COLUMN IF NOT EXISTS trigger_payload JSONB;

-- 2. GIN index on workflow_json so the webhook-trigger function can look up
--    which job owns a given webhook path without a full table scan.
--    The query is: workflow_json->'nodes' @> '[{"data":{"config":{"path":"<uuid>"}}}]'
CREATE INDEX IF NOT EXISTS idx_data_jobs_workflow_gin
  ON public.data_jobs USING gin (workflow_json);

-- 3. Partial index for active webhook jobs to speed up the lookup further.
CREATE INDEX IF NOT EXISTS idx_data_jobs_active_status
  ON public.data_jobs (status) WHERE status = 'active';
