-- =============================================================================
-- MARBEE v2 REVAMP — PART 57: SCHEDULED MAINTENANCE (pg_cron)
-- Run AFTER 52..56. Re-runnable. No-ops cleanly if pg_cron is not enabled.
--
-- Jobs:
--   marbee_partition_maintenance   hourly   create ahead partitions, drop aged
--   marbee_refresh_rollups         */2 min  incremental analytics rollups
--   marbee_idempotency_sweep       */15 min purge expired idempotency keys
--   marbee_analyze_hot             */30 min ANALYZE the churn tables
--   marbee_partman_maintenance     hourly   (only if pg_partman is installed too)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_partition_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT parent, months_ahead, retain_months FROM public._partition_policy LOOP
    BEGIN
      PERFORM public._ensure_time_partitions(r.parent::regclass, r.months_ahead, r.retain_months);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'partition maintenance for % failed: %', r.parent, SQLERRM;
    END;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.run_partition_maintenance() TO service_role;

CREATE OR REPLACE FUNCTION public.analyze_hot_tables()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.events','public.engagement_log','public.customer_delivery_log',
    'public.journey_instances','public.journey_instance_events','public.rtm_messages',
    'public.rollup_engagement_daily','public.rollup_events_daily','public.web_push_subscribers'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN EXECUTE 'ANALYZE ' || t; END IF;
  END LOOP;
END;
$$;

DO $do$
DECLARE
  v_has_cron boolean := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');
  v_has_partman boolean := EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'partman');
BEGIN
  IF NOT v_has_cron THEN
    RAISE NOTICE 'pg_cron not installed -> schedule these yourself (see file header). Skipping.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('marbee_partition_maintenance','marbee_refresh_rollups',
                     'marbee_idempotency_sweep','marbee_analyze_hot','marbee_partman_maintenance');

  PERFORM cron.schedule('marbee_partition_maintenance', '7 * * * *',
    $job$SELECT public.run_partition_maintenance();$job$);

  PERFORM cron.schedule('marbee_refresh_rollups', '*/2 * * * *',
    $job$SELECT public.refresh_rollups(now() - interval '2 days');$job$);

  PERFORM cron.schedule('marbee_idempotency_sweep', '*/15 * * * *',
    $job$SELECT public.idempotency_sweep();$job$);

  PERFORM cron.schedule('marbee_analyze_hot', '*/30 * * * *',
    $job$SELECT public.analyze_hot_tables();$job$);

  IF v_has_partman THEN
    PERFORM cron.schedule('marbee_partman_maintenance', '17 * * * *',
      $job$CALL partman.run_maintenance_proc();$job$);
  END IF;

  RAISE NOTICE 'pg_cron jobs scheduled (see: SELECT jobname, schedule FROM cron.job).';
END
$do$;

DO $$ BEGIN RAISE NOTICE 'v2/57 complete: maintenance schedule installed.'; END $$;
