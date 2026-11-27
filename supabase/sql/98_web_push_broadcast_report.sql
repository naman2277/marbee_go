-- =============================================================================
-- 98 — Web Push campaign report (D-026 add-on). Run after 97.
-- =============================================================================
-- One read-only function: web_push_broadcast_report(broadcast_id) → JSONB with
--   summary     targeted / delivered / failed / skipped / clicked / CTR / time-to-click
--   by_action   which part of the notification was clicked (body, button 1, button 2)
--   by_browser / by_os / by_device   reach and clicks per segment
--   timeline    delivered + clicked per time bucket (5 min / 1 h / 1 day, auto)
--   issues      why pushes failed or were skipped
--   recent_clicks  last 50 clicks with device and (if known) customer
-- Workspace members only (same rule as the list). Built from the outbox, so the detail
-- is available while outbox rows are kept (30 days, see push_worker_tick in 95).
--
-- Re-runnable.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.web_push_broadcast_report(p_broadcast_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.web_push_broadcasts;
  v_from TIMESTAMPTZ; v_to TIMESTAMPTZ; v_bucket INTERVAL;
  v_summary JSONB; v_by_action JSONB; v_browser JSONB; v_os JSONB; v_device JSONB;
  v_timeline JSONB; v_issues JSONB; v_recent JSONB; v_status TEXT;
BEGIN
  SELECT * INTO b FROM public.web_push_broadcasts WHERE id = p_broadcast_id;
  -- Same error for "missing" and "not yours": no probing other workspaces' ids.
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.user_has_tenant_access(b.tenant_id) THEN
    RAISE EXCEPTION 'Broadcast not found' USING ERRCODE = 'no_data_found';
  END IF;

  DROP TABLE IF EXISTS pg_temp._wp_rep;
  CREATE TEMP TABLE _wp_rep ON COMMIT DROP AS
  SELECT ob.id, ob.status, ob.last_error, ob.sent_at, ob.customer_id,
    coalesce(nullif(s.browser, ''), 'Unknown') AS browser,
    coalesce(nullif(s.os, ''), 'Unknown') AS os,
    coalesce(nullif(s.device, ''), 'Unknown') AS device,
    c.clicked_at, c.clicked_action
  FROM public.web_push_outbox ob
  LEFT JOIN public.web_push_subscribers s ON s.id = ob.subscriber_id
  LEFT JOIN LATERAL (
    SELECT e."timestamp" AS clicked_at, coalesce(nullif(e.metadata->>'clicked_action', ''), 'body') AS clicked_action
    FROM public.engagement_log e
    WHERE e.tenant_id = ob.tenant_id AND e.message_id = ob.message_id::text AND e.event = 'clicked'
    ORDER BY e."timestamp" LIMIT 1
  ) c ON TRUE
  WHERE ob.tenant_id = b.tenant_id AND ob.delivery_id = b.id::text;

  SELECT CASE
      WHEN b.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN b.scheduled_at IS NOT NULL AND b.scheduled_at > NOW() THEN 'scheduled'
      WHEN EXISTS (SELECT 1 FROM _wp_rep WHERE status IN ('queued', 'sending')) THEN 'sending'
      ELSE 'sent' END INTO v_status;

  SELECT jsonb_build_object(
      'targeted', count(*),
      'queued', count(*) FILTER (WHERE status IN ('queued', 'sending')),
      'delivered', count(*) FILTER (WHERE status = 'delivered'),
      'failed', count(*) FILTER (WHERE status = 'failed'),
      'skipped', count(*) FILTER (WHERE status = 'skipped'),
      'clicked', count(*) FILTER (WHERE clicked_at IS NOT NULL),
      'clicked_known', count(DISTINCT customer_id) FILTER (WHERE clicked_at IS NOT NULL),
      'clicked_anonymous', count(*) FILTER (WHERE clicked_at IS NOT NULL AND customer_id IS NULL),
      'excluded_at_send', coalesce((b.result->>'excluded')::int, 0),
      'capped_at_send', coalesce((b.result->>'capped')::int, 0),
      'first_sent_at', min(sent_at),
      'last_sent_at', max(sent_at),
      'first_click_at', min(clicked_at),
      'last_click_at', max(clicked_at),
      'median_seconds_to_click', round(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM clicked_at - sent_at)) FILTER (WHERE clicked_at IS NOT NULL AND sent_at IS NOT NULL)),
      'p90_seconds_to_click', round(percentile_cont(0.9) WITHIN GROUP (
          ORDER BY extract(epoch FROM clicked_at - sent_at)) FILTER (WHERE clicked_at IS NOT NULL AND sent_at IS NOT NULL))
    ) INTO v_summary
  FROM _wp_rep;

  SELECT coalesce(jsonb_agg(jsonb_build_object('action', clicked_action, 'clicks', n) ORDER BY n DESC, clicked_action), '[]')
    INTO v_by_action
  FROM (SELECT clicked_action, count(*) AS n FROM _wp_rep WHERE clicked_at IS NOT NULL GROUP BY 1) x;

  SELECT coalesce(jsonb_agg(jsonb_build_object('name', k, 'targeted', t, 'delivered', d, 'clicked', c) ORDER BY t DESC, k), '[]')
    INTO v_browser
  FROM (SELECT browser AS k, count(*) AS t, count(*) FILTER (WHERE status = 'delivered') AS d,
          count(*) FILTER (WHERE clicked_at IS NOT NULL) AS c FROM _wp_rep GROUP BY 1) x;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', k, 'targeted', t, 'delivered', d, 'clicked', c) ORDER BY t DESC, k), '[]')
    INTO v_os
  FROM (SELECT os AS k, count(*) AS t, count(*) FILTER (WHERE status = 'delivered') AS d,
          count(*) FILTER (WHERE clicked_at IS NOT NULL) AS c FROM _wp_rep GROUP BY 1) x;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', k, 'targeted', t, 'delivered', d, 'clicked', c) ORDER BY t DESC, k), '[]')
    INTO v_device
  FROM (SELECT device AS k, count(*) AS t, count(*) FILTER (WHERE status = 'delivered') AS d,
          count(*) FILTER (WHERE clicked_at IS NOT NULL) AS c FROM _wp_rep GROUP BY 1) x;

  -- Timeline: bucket size follows the activity span; at most ~200 buckets.
  SELECT least(min(sent_at), min(clicked_at)), greatest(max(sent_at), max(clicked_at)) INTO v_from, v_to FROM _wp_rep;
  IF v_from IS NULL THEN
    v_timeline := '[]';
  ELSE
    v_bucket := CASE
      WHEN v_to - v_from <= interval '6 hours' THEN interval '5 minutes'
      WHEN v_to - v_from <= interval '7 days' THEN interval '1 hour'
      ELSE interval '1 day' END;
    v_from := date_bin(v_bucket, v_from, TIMESTAMPTZ '2000-01-01');
    v_to := least(v_to, v_from + v_bucket * 199);
    SELECT coalesce(jsonb_agg(jsonb_build_object('t', g.t, 'delivered', coalesce(d.n, 0), 'clicked', coalesce(k.n, 0)) ORDER BY g.t), '[]')
      INTO v_timeline
    FROM generate_series(v_from, v_to, v_bucket) AS g(t)
    LEFT JOIN (SELECT date_bin(v_bucket, sent_at, TIMESTAMPTZ '2000-01-01') AS t, count(*) AS n
               FROM _wp_rep WHERE status = 'delivered' AND sent_at IS NOT NULL GROUP BY 1) d ON d.t = g.t
    LEFT JOIN (SELECT date_bin(v_bucket, clicked_at, TIMESTAMPTZ '2000-01-01') AS t, count(*) AS n
               FROM _wp_rep WHERE clicked_at IS NOT NULL GROUP BY 1) k ON k.t = g.t;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('status', status, 'reason', reason, 'count', n) ORDER BY n DESC), '[]')
    INTO v_issues
  FROM (SELECT status, left(coalesce(nullif(last_error, ''), 'unknown'), 160) AS reason, count(*) AS n
        FROM _wp_rep WHERE status IN ('failed', 'skipped') GROUP BY 1, 2 ORDER BY n DESC LIMIT 10) x;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'clicked_at', r.clicked_at, 'action', r.clicked_action, 'browser', r.browser, 'os', r.os, 'device', r.device,
      'seconds_to_click', CASE WHEN r.sent_at IS NOT NULL THEN round(extract(epoch FROM r.clicked_at - r.sent_at)) END,
      'customer_id', r.customer_id,
      'customer', CASE WHEN cu.id IS NOT NULL THEN coalesce(
          nullif(trim(coalesce(cu.first_name, '') || ' ' || coalesce(cu.last_name, '')), ''), cu.email, cu.mobile) END
    ) ORDER BY r.clicked_at DESC), '[]')
    INTO v_recent
  FROM (SELECT * FROM _wp_rep WHERE clicked_at IS NOT NULL ORDER BY clicked_at DESC LIMIT 50) r
  LEFT JOIN public.customers cu ON cu.id = r.customer_id AND cu.tenant_id = b.tenant_id;

  RETURN jsonb_build_object(
    'broadcast', jsonb_build_object('id', b.id, 'name', b.name, 'content', b.content, 'audience', b.audience,
      'scheduled_at', b.scheduled_at, 'created_at', b.created_at, 'cancelled_at', b.cancelled_at,
      'result', b.result, 'status', v_status),
    'summary', v_summary, 'by_action', v_by_action,
    'by_browser', v_browser, 'by_os', v_os, 'by_device', v_device,
    'timeline', v_timeline, 'bucket', CASE WHEN v_bucket IS NULL THEN NULL ELSE extract(epoch FROM v_bucket)::int END,
    'issues', v_issues, 'recent_clicks', v_recent);
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_broadcast_report(UUID) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_broadcast_report(UUID) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_broadcast_report(UUID) TO authenticated, service_role;
