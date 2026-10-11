-- =============================================================================
-- MARBEE — Pipeline worker cron fallback (OPTIONAL)
-- Re-kicks any data_job_run stuck in 'queued' and recovers expired running
-- leases. The app invokes pipeline-run-worker directly on "Run now"; this is
-- only the safety net. Run AFTER 60_pipeline_execution_model.sql.
-- No-ops cleanly if pg_cron / pg_net are not installed.
--
-- Setup: store the function URL + a service key in Vault first:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/pipeline-run-worker',
--                              'pipeline_worker_url');
--   select vault.create_secret('<service-role-key>', 'pipeline_worker_key');
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sweep_queued_pipeline_runs()
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
  IF to_regprocedure('public.recover_stale_pipeline_runs(integer)') IS NOT NULL THEN
    PERFORM public.recover_stale_pipeline_runs(900);
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'vault not available — configure the worker URL/key, skipping';
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'pipeline_worker_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'pipeline_worker_url / pipeline_worker_key not set in Vault, skipping';
    RETURN 0;
  END IF;

  FOR v_run IN
    SELECT id FROM public.data_job_runs
    WHERE status = 'queued' AND queued_at < now() - interval '2 minutes'
    ORDER BY queued_at
    LIMIT 25
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('run_id', v_run.id)
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_queued_pipeline_runs() TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — schedule public.sweep_queued_pipeline_runs() yourself. Skipping.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net not installed — the sweep cannot call the function. Skipping schedule.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'marbee_pipeline_run_sweep';
  PERFORM cron.schedule('marbee_pipeline_run_sweep', '* * * * *',
    $job$SELECT public.sweep_queued_pipeline_runs();$job$);

  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'marbee_pipeline_schedule_tick';
  PERFORM cron.schedule('marbee_pipeline_schedule_tick', '* * * * *',
    $job$SELECT public.enqueue_due_pipeline_runs();$job$);
END
$do$;

-- =============================================================================
-- Scheduled runs: enqueue a run for every published pipeline whose next_run_at
-- has passed. The app computes next_run_at from the cron expression (SQL has no
-- cron parser); this function clears it after enqueueing and the SchedulesPage
-- recomputes it on next load. sweep_queued_pipeline_runs() then kicks the worker.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_due_pipeline_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job record;
  v_version_id uuid;
  v_n integer := 0;
BEGIN
  FOR v_job IN
    SELECT id, tenant_id, environment, current_version
    FROM public.data_jobs
    WHERE schedule_cron IS NOT NULL
      AND schedule_enabled
      AND next_run_at IS NOT NULL
      AND next_run_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.data_job_runs r
        WHERE r.job_id = data_jobs.id AND r.status IN ('queued','running')
      )
    LIMIT 100
  LOOP
    SELECT id INTO v_version_id
    FROM public.data_job_versions
    WHERE job_id = v_job.id AND version_number = v_job.current_version;

    INSERT INTO public.data_job_runs
      (job_id, tenant_id, environment, version_id, version_number, status, trigger_source, run_mode)
    VALUES
      (v_job.id, v_job.tenant_id, v_job.environment, v_version_id, NULLIF(v_job.current_version, 0),
       'queued', 'schedule', 'full');

    UPDATE public.data_jobs
    SET last_run_at = now(), next_run_at = NULL
    WHERE id = v_job.id;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_due_pipeline_runs() TO service_role;
