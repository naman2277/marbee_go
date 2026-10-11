-- =============================================================================
-- MARBEE v2 REVAMP — PART 55: INCREMENTAL ROLLUPS (replaces the full-recompute MV)
-- Run AFTER 53. Re-runnable.
--
-- Problem: mv_command_center_today does a full scan+GROUP of engagement_log with
-- no CONCURRENTLY and no schedule. At 1000 tenants it locks and goes stale.
--
-- Fix: narrow daily rollup tables maintained incrementally by refresh_rollups(),
-- which only re-aggregates the last N days. Command Center reads O(days), not
-- O(events). The old view name is preserved (now a plain VIEW over the rollup)
-- so the app keeps working unchanged.
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_command_center_today CASCADE;

-- ---------------------------------------------------------------------------
-- Rollup tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rollup_engagement_daily (
  tenant_id    uuid NOT NULL,
  environment  text NOT NULL,
  day          date NOT NULL,
  channel      text NOT NULL DEFAULT 'all',
  sent         bigint NOT NULL DEFAULT 0,
  delivered    bigint NOT NULL DEFAULT 0,
  opened       bigint NOT NULL DEFAULT 0,
  clicked      bigint NOT NULL DEFAULT 0,
  failed       bigint NOT NULL DEFAULT 0,
  unsubscribed bigint NOT NULL DEFAULT 0,
  converted    bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, environment, day, channel)
);
CREATE INDEX IF NOT EXISTS idx_rollup_eng_day ON public.rollup_engagement_daily (tenant_id, environment, day DESC);

CREATE TABLE IF NOT EXISTS public.rollup_events_daily (
  tenant_id   uuid NOT NULL,
  environment text NOT NULL,
  day         date NOT NULL,
  event_type  text NOT NULL,
  event_count bigint NOT NULL DEFAULT 0,
  actor_count bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, environment, day, event_type)
);
CREATE INDEX IF NOT EXISTS idx_rollup_evt_day ON public.rollup_events_daily (tenant_id, environment, day DESC);

CREATE TABLE IF NOT EXISTS public.rollup_journey_daily (
  tenant_id   uuid NOT NULL,
  environment text NOT NULL,
  day         date NOT NULL,
  journey_id  uuid NOT NULL,
  entered     bigint NOT NULL DEFAULT 0,
  completed   bigint NOT NULL DEFAULT 0,
  exited      bigint NOT NULL DEFAULT 0,
  failed      bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, environment, day, journey_id)
);
CREATE INDEX IF NOT EXISTS idx_rollup_jny_day ON public.rollup_journey_daily (tenant_id, environment, day DESC);

-- ---------------------------------------------------------------------------
-- Incremental refresh — re-aggregates only [p_since::date , today]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_rollups(p_since timestamptz DEFAULT now() - interval '2 days')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := p_since::date;
BEGIN
  -- engagement (per channel + an 'all' bucket)
  INSERT INTO public.rollup_engagement_daily AS r
    (tenant_id, environment, day, channel, sent, delivered, opened, clicked, failed, unsubscribed, converted, refreshed_at)
  SELECT tenant_id, environment, "timestamp"::date AS day,
         coalesce(channel, 'unknown') AS channel,
         count(*) FILTER (WHERE event = 'sent'),
         count(*) FILTER (WHERE event = 'delivered'),
         count(*) FILTER (WHERE event = 'opened'),
         count(*) FILTER (WHERE event = 'clicked'),
         count(*) FILTER (WHERE event = 'failed'),
         count(*) FILTER (WHERE event = 'unsubscribed'),
         count(*) FILTER (WHERE event = 'converted'),
         now()
  FROM public.engagement_log
  WHERE "timestamp" >= v_from
  GROUP BY 1,2,3,4
  ON CONFLICT (tenant_id, environment, day, channel) DO UPDATE SET
    sent = excluded.sent, delivered = excluded.delivered, opened = excluded.opened,
    clicked = excluded.clicked, failed = excluded.failed, unsubscribed = excluded.unsubscribed,
    converted = excluded.converted, refreshed_at = now();

  INSERT INTO public.rollup_engagement_daily AS r
    (tenant_id, environment, day, channel, sent, delivered, opened, clicked, failed, unsubscribed, converted, refreshed_at)
  SELECT tenant_id, environment, "timestamp"::date, 'all',
         count(*) FILTER (WHERE event = 'sent'),
         count(*) FILTER (WHERE event = 'delivered'),
         count(*) FILTER (WHERE event = 'opened'),
         count(*) FILTER (WHERE event = 'clicked'),
         count(*) FILTER (WHERE event = 'failed'),
         count(*) FILTER (WHERE event = 'unsubscribed'),
         count(*) FILTER (WHERE event = 'converted'),
         now()
  FROM public.engagement_log
  WHERE "timestamp" >= v_from
  GROUP BY 1,2,3
  ON CONFLICT (tenant_id, environment, day, channel) DO UPDATE SET
    sent = excluded.sent, delivered = excluded.delivered, opened = excluded.opened,
    clicked = excluded.clicked, failed = excluded.failed, unsubscribed = excluded.unsubscribed,
    converted = excluded.converted, refreshed_at = now();

  -- events
  INSERT INTO public.rollup_events_daily AS r
    (tenant_id, environment, day, event_type, event_count, actor_count, refreshed_at)
  SELECT tenant_id, environment, "timestamp"::date, event_type,
         count(*), count(DISTINCT coalesce(customer_id::text, ecid, anonymous_id)), now()
  FROM public.events
  WHERE "timestamp" >= v_from
  GROUP BY 1,2,3,4
  ON CONFLICT (tenant_id, environment, day, event_type) DO UPDATE SET
    event_count = excluded.event_count, actor_count = excluded.actor_count, refreshed_at = now();

  -- journeys (entered from entered_at; terminal states from completed_at day)
  INSERT INTO public.rollup_journey_daily AS r
    (tenant_id, environment, day, journey_id, entered, completed, exited, failed, refreshed_at)
  SELECT tenant_id, environment, entered_at::date, journey_id,
         count(*),
         count(*) FILTER (WHERE status = 'completed'),
         count(*) FILTER (WHERE status = 'exited'),
         count(*) FILTER (WHERE status = 'failed'),
         now()
  FROM public.journey_instances
  WHERE entered_at >= v_from
  GROUP BY 1,2,3,4
  ON CONFLICT (tenant_id, environment, day, journey_id) DO UPDATE SET
    entered = excluded.entered, completed = excluded.completed,
    exited = excluded.exited, failed = excluded.failed, refreshed_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_rollups(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- Backward-compatible view — same name & columns the dashboard already reads
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.mv_command_center_today
WITH (security_invoker = true) AS   -- run under the caller so rollup RLS applies
SELECT tenant_id,
       environment,
       sent                       AS messages_sent,
       delivered                  AS messages_delivered,
       (opened + clicked)         AS messages_engaged,
       converted                  AS conversions
FROM public.rollup_engagement_daily
WHERE channel = 'all' AND day = CURRENT_DATE;

-- ---------------------------------------------------------------------------
-- RLS on rollups
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rollup_engagement_daily','rollup_events_daily','rollup_journey_daily'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id IN (SELECT public.user_tenant_ids()))',
      t || '_read', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

GRANT SELECT ON public.mv_command_center_today TO authenticated;

-- prime it once over a wide window so multi-month dashboards work from day one
-- (one-time aggregate; cheap while engagement_log is small).
SELECT public.refresh_rollups(now() - interval '400 days');

DO $$ BEGIN RAISE NOTICE 'v2/55 complete: rollup tables + refresh_rollups(); mv_command_center_today is now a live view.'; END $$;
