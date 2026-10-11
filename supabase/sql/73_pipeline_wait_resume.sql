-- =============================================================================
-- MARBEE — Pipeline wait/delay resume infrastructure
-- Adds 'waiting' state to node runs, and a sweep function that re-queues
-- waiting runs whose resume_at has passed.
-- Run AFTER 60, 61, 72.
-- =============================================================================

-- 1. Widen node_runs state CHECK to include 'waiting'
ALTER TABLE public.data_job_node_runs DROP CONSTRAINT IF EXISTS data_job_node_runs_state_check;
ALTER TABLE public.data_job_node_runs ADD CONSTRAINT data_job_node_runs_state_check
  CHECK (state IN ('idle','queued','running','succeeded','failed','skipped','canceled','retrying','waiting'));

-- 2. Add resume_at to data_job_runs (set by scheduleResume in the worker)
ALTER TABLE public.data_job_runs
  ADD COLUMN IF NOT EXISTS resume_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_data_job_runs_resume
  ON public.data_job_runs (resume_at)
  WHERE status = 'waiting' AND resume_at IS NOT NULL;

-- 3. Widen trigger_source CHECK to include form/chat/workflow/event
ALTER TABLE public.data_job_runs DROP CONSTRAINT IF EXISTS data_job_runs_trigger_source_check;
ALTER TABLE public.data_job_runs ADD CONSTRAINT data_job_runs_trigger_source_check
  CHECK (trigger_source IN ('manual','schedule','webhook','api','backfill','form','chat','workflow','event'));

-- 4. Function: resume waiting pipeline runs whose resume_at has passed
CREATE OR REPLACE FUNCTION public.resume_waiting_pipeline_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, vault
AS $$
DECLARE
  v_url  text;
  v_key  text;
  v_run  record;
  v_n    integer := 0;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_run IN
    SELECT id FROM public.data_job_runs
    WHERE status = 'waiting'
      AND resume_at IS NOT NULL
      AND resume_at <= now()
    ORDER BY resume_at
    LIMIT 25
  LOOP
    UPDATE public.data_job_runs
    SET status = 'queued', queued_at = now()
    WHERE id = v_run.id AND status = 'waiting';

    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('run_id', v_run.id, 'resume', true)
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resume_waiting_pipeline_runs() TO service_role;

-- 5. Schedule the resume sweep (every minute, alongside the existing sweeps)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — schedule resume_waiting_pipeline_runs() yourself.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net not installed — the resume sweep cannot call the function.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'marbee_pipeline_resume_sweep';
  PERFORM cron.schedule('marbee_pipeline_resume_sweep', '* * * * *',
    $job$SELECT public.resume_waiting_pipeline_runs();$job$);
END
$do$;
