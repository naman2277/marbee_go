-- =============================================================================
-- 96 — Web Push throughput for bulk sends (D-024). Run after 95.
-- =============================================================================
-- 1. complete_web_push_batch(): the worker records the outcome of a whole batch in ONE
--    database call instead of one call per push. Each row goes through the same
--    complete_web_push() logic (logs, retries, pruning), so behaviour is unchanged.
-- 2. push_worker_kick_n(n): start up to n workers at once (max 10). The queue already makes
--    parallel workers safe: claim_web_push_batch() uses SKIP LOCKED, so no row is sent twice.
-- 3. push_worker_tick() (cron, every minute) now starts one worker per ~1,000 due pushes,
--    up to 10. Each worker also re-starts itself while work remains (push-worker code), so
--    a large blast drains continuously instead of once a minute.
--
-- Re-runnable.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.complete_web_push_batch(p_results JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r JSONB;
  v_out TEXT;
  n_delivered INT := 0; n_queued INT := 0; n_failed INT := 0; n_ignored INT := 0;
BEGIN
  IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'p_results must be a JSON array' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_array_length(p_results) > 1000 THEN
    RAISE EXCEPTION 'at most 1000 results per call' USING ERRCODE = 'check_violation';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_results) LOOP
    BEGIN
      v_out := public.complete_web_push(
        (r->>'id')::uuid,
        r->>'outcome',
        r->>'error',
        CASE WHEN (r->>'retry_after') ~ '^\d{1,6}$' THEN (r->>'retry_after')::int END
      );
    EXCEPTION WHEN others THEN
      -- One bad entry must not lose the whole batch; that row's lock expires and it retries.
      v_out := 'error';
    END;
    CASE v_out
      WHEN 'delivered' THEN n_delivered := n_delivered + 1;
      WHEN 'queued' THEN n_queued := n_queued + 1;
      WHEN 'failed' THEN n_failed := n_failed + 1;
      ELSE n_ignored := n_ignored + 1;
    END CASE;
  END LOOP;
  RETURN jsonb_build_object('delivered', n_delivered, 'requeued', n_queued, 'failed', n_failed, 'ignored', n_ignored);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_web_push_batch(JSONB) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.complete_web_push_batch(JSONB) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.complete_web_push_batch(JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.push_worker_kick_n(p_workers INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE i INT; n INT := 0;
BEGIN
  FOR i IN 1 .. least(greatest(coalesce(p_workers, 1), 1), 10) LOOP
    IF public.push_worker_kick() THEN n := n + 1; ELSE EXIT; END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.push_worker_kick_n(INT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.push_worker_kick_n(INT) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.push_worker_kick_n(INT) TO service_role;

-- How many pushes are due right now (also used by the worker to decide whether to re-start itself).
CREATE OR REPLACE FUNCTION public.web_push_due_count()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int FROM public.web_push_outbox
  WHERE (status = 'queued' AND next_attempt_at <= NOW()) OR (status = 'sending' AND locked_until < NOW());
$$;
REVOKE ALL ON FUNCTION public.web_push_due_count() FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_due_count() FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_due_count() TO service_role;

-- The one place that decides how many workers to start (used by the cron AND by every send,
-- so overlapping blasts never push past the target — Codex, PR #7).
-- Target: one worker per ~1,000 due pushes, 1..10 (measured 2026-11-27: runs must stay small).
-- Workers re-start themselves while work remains, so only top up: a busy worker holds up to
-- 250 rows locked in 'sending'. Returns the number of workers started.
CREATE OR REPLACE FUNCTION public.push_worker_top_up()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_due INT; v_busy INT; v_want INT;
BEGIN
  v_due := public.web_push_due_count();
  IF v_due = 0 THEN RETURN 0; END IF;
  SELECT ceil(count(*) / 250.0)::int INTO v_busy FROM public.web_push_outbox
  WHERE status = 'sending' AND locked_until >= NOW();
  v_want := least(ceil(v_due / 1000.0)::int, 10) - v_busy;
  IF v_want <= 0 THEN RETURN 0; END IF;
  RETURN public.push_worker_kick_n(v_want);
END;
$$;
REVOKE ALL ON FUNCTION public.push_worker_top_up() FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.push_worker_top_up() FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.push_worker_top_up() TO service_role;

CREATE OR REPLACE FUNCTION public.push_worker_tick()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.web_push_outbox WHERE id IN (
    SELECT id FROM public.web_push_outbox
    WHERE status IN ('delivered', 'failed', 'skipped') AND created_at < NOW() - interval '30 days'
    LIMIT 5000);
  RETURN public.push_worker_top_up() > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.push_worker_tick() FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.push_worker_tick() FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.push_worker_tick() TO service_role;
