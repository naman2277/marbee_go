-- =============================================================================
-- MARBEE — Form submission → pipeline trigger
-- When a form_submission is inserted, auto-enqueue a data_job_run for every
-- active pipeline (pipeline_status='started') that has a trigger_form node.
-- The pipeline-run-worker then picks up the queued run.
--
-- Run AFTER 60, 69, 71. Safe to re-run.
-- =============================================================================

-- 1. Widen trigger_source to include 'form' and 'chat'.
--    (The existing CHECK is on data_job_runs.trigger_source, but it may have
--     been set as a default-only or column comment. We drop-and-recreate to
--     be safe.)
DO $$
BEGIN
  ALTER TABLE public.data_job_runs
    DROP CONSTRAINT IF EXISTS data_job_runs_trigger_source_check;
  ALTER TABLE public.data_job_runs
    ADD CONSTRAINT data_job_runs_trigger_source_check
    CHECK (trigger_source IN ('manual','schedule','webhook','api','backfill','form','chat','workflow','event'));
EXCEPTION WHEN undefined_object THEN
  -- constraint didn't exist, just add it
  ALTER TABLE public.data_job_runs
    ADD CONSTRAINT data_job_runs_trigger_source_check
    CHECK (trigger_source IN ('manual','schedule','webhook','api','backfill','form','chat','workflow','event'));
END $$;

-- 2. Function: for a given form submission, find matching pipelines and enqueue runs.
CREATE OR REPLACE FUNCTION public.enqueue_form_trigger_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job       RECORD;
  v_run_id    UUID;
  v_payload   JSONB;
  v_has_match BOOLEAN;
  v_node      JSONB;
  v_form_id_cfg TEXT;
  v_url       TEXT;
  v_key       TEXT;
BEGIN
  -- Build the trigger payload from the new form_submission row
  v_payload := jsonb_build_object(
    'event_type',    'form_submission',
    'form_id',       NEW.form_id,
    'submission_id', NEW.id,
    'data',          COALESCE(NEW.data, '{}'::jsonb),
    'submitted_at',  NEW.created_at
  );

  -- Find all active pipelines in 'started' state with trigger_form nodes
  FOR v_job IN
    SELECT j.id, j.tenant_id, j.environment, j.current_version, j.workflow_json
    FROM public.data_jobs j
    WHERE j.tenant_id = NEW.tenant_id
      AND j.status = 'active'
      AND j.pipeline_status = 'started'
      AND j.workflow_json IS NOT NULL
  LOOP
    -- Check if this pipeline has a trigger_form node
    v_has_match := FALSE;

    IF v_job.workflow_json ? 'nodes' AND jsonb_typeof(v_job.workflow_json->'nodes') = 'array' THEN
      FOR v_node IN SELECT * FROM jsonb_array_elements(v_job.workflow_json->'nodes')
      LOOP
        IF v_node->'data'->>'stepType' = 'trigger_form' THEN
          -- Check if the node has a specific form_id configured
          v_form_id_cfg := COALESCE(v_node->'data'->'config'->>'form_id', '');
          IF v_form_id_cfg = '' OR v_form_id_cfg = NEW.form_id::text THEN
            v_has_match := TRUE;
            EXIT;
          END IF;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_has_match THEN
      CONTINUE;
    END IF;

    -- Don't enqueue if there's already a queued/running run for this pipeline
    IF EXISTS (
      SELECT 1 FROM public.data_job_runs
      WHERE job_id = v_job.id AND status IN ('queued', 'running')
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    -- Enqueue the run
    INSERT INTO public.data_job_runs
      (job_id, tenant_id, environment, version_number, status,
       trigger_source, run_mode, trigger_payload)
    VALUES
      (v_job.id, v_job.tenant_id, v_job.environment,
       NULLIF(v_job.current_version, 0), 'queued',
       'form', 'full', v_payload)
    RETURNING id INTO v_run_id;

    -- Kick the worker via pg_net if available
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_url';
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_key';
      IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || v_key
            ),
            body := jsonb_build_object('run_id', v_run_id)
          );
        EXCEPTION WHEN OTHERS THEN
          -- pg_net not installed or network issue — the cron sweep will pick it up
          NULL;
        END;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Trigger: fire after every form_submission insert.
DROP TRIGGER IF EXISTS trg_form_submission_pipeline ON public.form_submissions;
CREATE TRIGGER trg_form_submission_pipeline
  AFTER INSERT ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_form_trigger_runs();

-- 4. Also broadcast via realtime so open pipeline pages update immediately.
--    (The pipeline page listens on workflow-trigger:<job_id> for live UI updates.)
--    This is handled by the form-submit edge function (server-side broadcast).
