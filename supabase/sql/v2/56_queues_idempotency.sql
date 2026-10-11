-- =============================================================================
-- MARBEE v2 REVAMP — PART 56: WORK QUEUES + UNIFIED IDEMPOTENCY LEDGER
-- Run AFTER 52. Re-runnable.
--
-- - Creates the pgmq queues the blueprint (§13.3) calls for. If pgmq is not
--   available, a Postgres-table fallback queue (public.job_queue) is created with
--   the same enqueue/read/delete surface via public.mq_* wrappers, so callers
--   (edge functions) code against ONE api regardless.
-- - Replaces the ad-hoc rtm_idempotency with a single idempotency_keys table
--   used by rtm-ingest, connector webhooks, and event workers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Queues
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_has_pgmq boolean := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq');
  q text;
  v_queues text[] := ARRAY[
    'q_events_process',   -- events-ingest -> worker: evaluate RTM triggers, fan out
    'q_rtm_send',         -- rtm-ingest    -> worker: render + dispatch
    'q_journey_step',     -- journey runner: advance instance to next node
    'q_channel_send',     -- provider dispatch (FCM / SMS / email / whatsapp)
    'q_connector_sync',   -- connector ETL runs
    'q_webhook_retry'     -- outbound webhook retry with backoff
  ];
BEGIN
  IF v_has_pgmq THEN
    FOREACH q IN ARRAY v_queues LOOP
      BEGIN
        EXECUTE format('SELECT pgmq.create(%L)', q);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pgmq.create(%) -> %', q, SQLERRM;   -- already exists
      END;
    END LOOP;
    RAISE NOTICE 'pgmq queues ready: %', array_to_string(v_queues, ', ');
  ELSE
    CREATE TABLE IF NOT EXISTS public.job_queue (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      queue       text NOT NULL,
      payload     jsonb NOT NULL,
      vt          timestamptz NOT NULL DEFAULT now(),   -- visible-at (for backoff)
      read_ct     int NOT NULL DEFAULT 0,
      enqueued_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_job_queue_poll ON public.job_queue (queue, vt, id);
    RAISE NOTICE 'pgmq absent -> using public.job_queue fallback';
  END IF;
END$$;

-- Uniform wrappers: callers use these and never care which backend is live.
CREATE OR REPLACE FUNCTION public.mq_send(p_queue text, p_msg jsonb, p_delay_seconds int DEFAULT 0)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    EXECUTE format('SELECT pgmq.send(%L, $1, $2)', p_queue) INTO v_id USING p_msg, p_delay_seconds;
    RETURN v_id;
  ELSE
    INSERT INTO public.job_queue(queue, payload, vt)
    VALUES (p_queue, p_msg, now() + make_interval(secs => p_delay_seconds))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mq_send_batch(p_queue text, p_msgs jsonb)
RETURNS setof bigint
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE m jsonb;
BEGIN
  IF jsonb_typeof(p_msgs) <> 'array' THEN
    RAISE EXCEPTION 'mq_send_batch expects a JSON array';
  END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(p_msgs) LOOP
    RETURN NEXT public.mq_send(p_queue, m, 0);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mq_read(p_queue text, p_vt_seconds int DEFAULT 30, p_qty int DEFAULT 20)
RETURNS TABLE (msg_id bigint, read_ct int, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    RETURN QUERY EXECUTE
      format('SELECT msg_id, read_ct, message FROM pgmq.read(%L, $1, $2)', p_queue)
      USING p_vt_seconds, p_qty;
  ELSE
    RETURN QUERY
    WITH claimable AS (
      SELECT id FROM public.job_queue
      WHERE queue = p_queue AND vt <= now()
      ORDER BY id
      LIMIT p_qty
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.job_queue j
       SET vt = now() + make_interval(secs => p_vt_seconds),
           read_ct = j.read_ct + 1
      FROM claimable
     WHERE j.id = claimable.id
    RETURNING j.id, j.read_ct, j.payload;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mq_delete(p_queue text, p_msg_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq') THEN
    EXECUTE format('SELECT pgmq.delete(%L, $1)', p_queue) INTO v_ok USING p_msg_id;
    RETURN coalesce(v_ok, false);
  ELSE
    DELETE FROM public.job_queue WHERE queue = p_queue AND id = p_msg_id;
    RETURN FOUND;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.mq_send(text, jsonb, int),
  public.mq_send_batch(text, jsonb),
  public.mq_read(text, int, int),
  public.mq_delete(text, bigint)
TO service_role;

-- ---------------------------------------------------------------------------
-- Unified idempotency ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  tenant_id   uuid NOT NULL,
  scope       text NOT NULL,                 -- 'rtm' | 'webhook' | 'connector' | ...
  key         text NOT NULL,
  result_ref  text,                          -- e.g. message_id produced
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (tenant_id, scope, key)
);
CREATE INDEX IF NOT EXISTS idx_idem_expiry ON public.idempotency_keys (expires_at);
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;  -- service-role only, no policy

-- claim: returns TRUE if this is the first time we've seen (tenant, scope, key)
CREATE OR REPLACE FUNCTION public.idempotency_claim(
  p_tenant uuid, p_scope text, p_key text,
  p_result_ref text DEFAULT NULL, p_ttl interval DEFAULT interval '24 hours'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows bigint;
BEGIN
  INSERT INTO public.idempotency_keys(tenant_id, scope, key, result_ref, expires_at)
  VALUES (p_tenant, p_scope, p_key, p_result_ref, now() + p_ttl)
  ON CONFLICT (tenant_id, scope, key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.idempotency_sweep()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n bigint;
BEGIN
  DELETE FROM public.idempotency_keys WHERE expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF to_regclass('public.rtm_idempotency') IS NOT NULL THEN
    DELETE FROM public.rtm_idempotency WHERE expires_at < now();
  END IF;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.idempotency_claim(uuid, text, text, text, interval),
                          public.idempotency_sweep() TO service_role;

DO $$ BEGIN RAISE NOTICE 'v2/56 complete: queues (pgmq or fallback) + idempotency_keys ledger.'; END $$;
