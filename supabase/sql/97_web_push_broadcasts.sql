-- =============================================================================
-- 97 — Web Push broadcasts (D-026). Run after 95 and 96.
-- =============================================================================
-- Lets a marketer send one push to all subscribers, a filtered group, or a Marbee audience,
-- now or at a scheduled time, from the app. Reuses the outbox + push-worker path
-- (web_push_enqueue_targets in 95), so the daily cap, exclusions, idempotency, retries and
-- pruning all apply unchanged.
--
-- Audience = filter over this workspace's ACTIVE devices:
--   { "browsers": [..], "os": [..], "devices": [..], "subscribed_within_days": n,
--     "active_within_days": n, "linked": "any" | "linked" | "anonymous" }
-- optionally restricted to a list of customer ids (a Marbee audience resolved by the app).
-- A scheduled send captures its audience when it is scheduled.
--
-- Websites: web_push_subscribers.site_id = the web_analytics_sites.site_id the browser
-- subscribed on (set by push-subscribe from the verified site key, never from the request).
-- Filter key "sites": [site_id, ..] sends to one or more websites of the workspace.
-- Folders: campaigns sit in a folder path ("/", "/sale 2026", "/sale 2026/diwali").
--
-- Re-runnable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.web_push_broadcasts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment   TEXT NOT NULL,
  client_key    UUID NOT NULL,          -- one per compose session: clicking Send twice never sends twice
  name          TEXT NOT NULL,
  content       JSONB NOT NULL,
  audience      JSONB NOT NULL DEFAULT '{}',   -- what the marketer chose (for display)
  scheduled_at  TIMESTAMPTZ,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at  TIMESTAMPTZ,
  result        JSONB NOT NULL DEFAULT '{}',   -- enqueue result: queued / devices / excluded / capped
  UNIQUE (tenant_id, client_key)
);
CREATE INDEX IF NOT EXISTS idx_web_push_broadcasts_tenant
  ON public.web_push_broadcasts (tenant_id, environment, created_at DESC);

ALTER TABLE public.web_push_broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_push_broadcasts_member_read ON public.web_push_broadcasts;
CREATE POLICY web_push_broadcasts_member_read ON public.web_push_broadcasts FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
REVOKE ALL ON public.web_push_broadcasts FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON public.web_push_broadcasts FROM anon, authenticated';
  EXECUTE 'GRANT SELECT ON public.web_push_broadcasts TO authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT ALL ON public.web_push_broadcasts TO service_role;

-- Which website a browser subscribed on (filled by push-subscribe on each visit).
ALTER TABLE public.web_push_subscribers ADD COLUMN IF NOT EXISTS site_id TEXT;
CREATE INDEX IF NOT EXISTS idx_web_push_subscribers_site
  ON public.web_push_subscribers (tenant_id, environment, site_id) WHERE subscription_status = 'active';
-- Workspaces with exactly one website: every existing subscriber came from it.
UPDATE public.web_push_subscribers s SET site_id = one.site_id
FROM (SELECT tenant_id, environment, min(site_id) AS site_id FROM public.web_analytics_sites
      WHERE status <> 'archived' GROUP BY 1, 2 HAVING count(*) = 1) one
WHERE s.site_id IS NULL AND s.tenant_id = one.tenant_id AND s.environment = one.environment;

-- Folders for campaigns.
ALTER TABLE public.web_push_broadcasts ADD COLUMN IF NOT EXISTS folder_path TEXT NOT NULL DEFAULT '/';
CREATE TABLE IF NOT EXISTS public.web_push_campaign_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  path        TEXT NOT NULL,
  name        TEXT NOT NULL,
  parent_path TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, path)
);
ALTER TABLE public.web_push_campaign_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_push_campaign_folders_member_read ON public.web_push_campaign_folders;
CREATE POLICY web_push_campaign_folders_member_read ON public.web_push_campaign_folders FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
REVOKE ALL ON public.web_push_campaign_folders FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON public.web_push_campaign_folders FROM anon, authenticated';
  EXECUTE 'GRANT SELECT ON public.web_push_campaign_folders TO authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT ALL ON public.web_push_campaign_folders TO service_role;

-- "/a/b" form: trimmed segments, no empty parts. Raises on bad names.
CREATE OR REPLACE FUNCTION public.web_push_folder_norm(p_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE parts TEXT[]; seg TEXT; v_out TEXT := '';
BEGIN
  IF p_path IS NULL OR btrim(p_path) IN ('', '/') THEN RETURN '/'; END IF;
  SELECT array_agg(btrim(x)) INTO parts FROM unnest(string_to_array(p_path, '/')) x WHERE btrim(x) <> '';
  IF parts IS NULL THEN RETURN '/'; END IF;
  IF cardinality(parts) > 6 THEN RAISE EXCEPTION 'folders can be at most 6 levels deep' USING ERRCODE = 'check_violation'; END IF;
  FOREACH seg IN ARRAY parts LOOP
    IF length(seg) > 60 THEN RAISE EXCEPTION 'folder names can be at most 60 characters' USING ERRCODE = 'check_violation'; END IF;
    v_out := v_out || '/' || seg;
  END LOOP;
  RETURN v_out;
END;
$$;

-- Click counts per broadcast look up engagement rows by message id.
CREATE INDEX IF NOT EXISTS idx_engagement_clicked_message
  ON public.engagement_log (tenant_id, message_id) WHERE event = 'clicked';

-- ---- Audience → pg_temp._wp_targets ---------------------------------------------
CREATE OR REPLACE FUNCTION public.web_push_fill_broadcast_targets(
  p_tenant_id UUID, p_environment TEXT, p_filter JSONB, p_customer_ids UUID[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f          JSONB := coalesce(p_filter, '{}'::jsonb);
  v_browsers TEXT[];
  v_os       TEXT[];
  v_devices  TEXT[];
  v_sites    TEXT[];
  v_sub_days INT;
  v_act_days INT;
  v_linked   TEXT := coalesce(f->>'linked', 'any');
  v_by_customer BOOLEAN := p_customer_ids IS NOT NULL;
  n INT;
BEGIN
  IF jsonb_typeof(f) <> 'object' THEN RAISE EXCEPTION 'audience filter must be an object' USING ERRCODE = 'check_violation'; END IF;
  IF v_linked NOT IN ('any', 'linked', 'anonymous') THEN RAISE EXCEPTION 'linked must be any, linked or anonymous' USING ERRCODE = 'check_violation'; END IF;
  IF jsonb_typeof(f->'browsers') = 'array' THEN SELECT array_agg(x) INTO v_browsers FROM jsonb_array_elements_text(f->'browsers') x; END IF;
  IF jsonb_typeof(f->'os') = 'array' THEN SELECT array_agg(x) INTO v_os FROM jsonb_array_elements_text(f->'os') x; END IF;
  IF jsonb_typeof(f->'devices') = 'array' THEN SELECT array_agg(x) INTO v_devices FROM jsonb_array_elements_text(f->'devices') x; END IF;
  IF jsonb_typeof(f->'sites') = 'array' THEN SELECT array_agg(x) INTO v_sites FROM jsonb_array_elements_text(f->'sites') x; END IF;
  IF (f->>'subscribed_within_days') ~ '^\d{1,4}$' THEN v_sub_days := (f->>'subscribed_within_days')::int; END IF;
  IF (f->>'active_within_days') ~ '^\d{1,4}$' THEN v_act_days := (f->>'active_within_days')::int; END IF;
  IF v_by_customer AND cardinality(p_customer_ids) > 500000 THEN
    RAISE EXCEPTION 'audience too large (max 500,000 customers)' USING ERRCODE = 'check_violation';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp._wp_targets (subscriber_id UUID PRIMARY KEY, customer_id UUID, excluded BOOLEAN, fresh BOOLEAN) ON COMMIT DROP;
  TRUNCATE pg_temp._wp_targets;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp._wp_bc_customers (id UUID PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp._wp_bc_customers;
  IF v_by_customer THEN
    INSERT INTO pg_temp._wp_bc_customers (id) SELECT DISTINCT c FROM unnest(p_customer_ids) c WHERE c IS NOT NULL;
  END IF;

  INSERT INTO pg_temp._wp_targets (subscriber_id, customer_id, excluded, fresh)
  SELECT DISTINCT ON (s.id) s.id, coalesce(s.customer_id, ci.customer_id), FALSE, TRUE
  FROM public.web_push_subscribers s
  LEFT JOIN public.customer_identities ci
    ON ci.tenant_id = s.tenant_id AND ci.environment = s.environment AND s.customer_id IS NULL
   AND s.ecid IS NOT NULL AND (ci.ecid = s.ecid OR ci.anonymous_id = s.ecid) AND ci.customer_id IS NOT NULL
  WHERE s.tenant_id = p_tenant_id
    AND s.environment = p_environment
    AND s.subscription_status = 'active'
    AND coalesce(s.permission_status, 'granted') = 'granted'
    AND (v_browsers IS NULL OR s.browser = ANY (v_browsers))
    AND (v_os IS NULL OR s.os = ANY (v_os))
    AND (v_devices IS NULL OR s.device = ANY (v_devices))
    AND (v_sites IS NULL OR s.site_id = ANY (v_sites))
    AND (v_sub_days IS NULL OR s.created_at >= NOW() - make_interval(days => v_sub_days))
    AND (v_act_days IS NULL OR coalesce(s.last_seen, s.created_at) >= NOW() - make_interval(days => v_act_days))
  ORDER BY s.id, ci.customer_id NULLS LAST;

  IF v_by_customer THEN
    DELETE FROM pg_temp._wp_targets t
    WHERE t.customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM pg_temp._wp_bc_customers c WHERE c.id = t.customer_id);
  END IF;
  IF v_linked = 'linked' THEN DELETE FROM pg_temp._wp_targets WHERE customer_id IS NULL; END IF;
  IF v_linked = 'anonymous' THEN DELETE FROM pg_temp._wp_targets WHERE customer_id IS NOT NULL; END IF;

  SELECT count(*) INTO n FROM pg_temp._wp_targets;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_fill_broadcast_targets(UUID, TEXT, JSONB, UUID[]) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_fill_broadcast_targets(UUID, TEXT, JSONB, UUID[]) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_fill_broadcast_targets(UUID, TEXT, JSONB, UUID[]) TO service_role;

-- ---- Preview: how many devices would this reach? (any member of the workspace) ------
DROP FUNCTION IF EXISTS public.web_push_audience_count(UUID, TEXT, JSONB, UUID[]);
CREATE OR REPLACE FUNCTION public.web_push_audience_count(
  p_tenant_id UUID, p_environment TEXT, p_filter JSONB DEFAULT '{}', p_customer_ids UUID[] DEFAULT NULL,
  p_send_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_day DATE := (timezone('utc', greatest(coalesce(p_send_at, NOW()), NOW())))::date;
  n_devices INT; n_linked INT; n_excluded INT; v_cap INT; v_used INT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'You do not have access to this workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  n_devices := public.web_push_fill_broadcast_targets(p_tenant_id, p_environment, p_filter, p_customer_ids);
  SELECT count(*) FILTER (WHERE customer_id IS NOT NULL),
         count(*) FILTER (WHERE customer_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.exclusions e
           WHERE e.tenant_id = p_tenant_id AND e.customer_id = t.customer_id
             AND (e.channel IS NULL OR e.channel = 'web_push')
             AND e.start_date <= v_today AND (e.end_date IS NULL OR e.end_date >= v_today)))
  INTO n_linked, n_excluded
  FROM pg_temp._wp_targets t;
  v_cap := coalesce(public.web_push_daily_cap(p_tenant_id), 100000);
  SELECT count(*) INTO v_used FROM public.web_push_outbox
  WHERE tenant_id = p_tenant_id AND send_on = v_day AND status <> 'skipped';
  RETURN jsonb_build_object(
    'devices', n_devices, 'linked', n_linked, 'anonymous', n_devices - n_linked,
    'excluded', n_excluded, 'daily_cap', v_cap, 'cap_remaining', greatest(v_cap - v_used, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_audience_count(UUID, TEXT, JSONB, UUID[], TIMESTAMPTZ) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_audience_count(UUID, TEXT, JSONB, UUID[], TIMESTAMPTZ) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_audience_count(UUID, TEXT, JSONB, UUID[], TIMESTAMPTZ) TO authenticated, service_role;

-- ---- Send (now or scheduled) — needs journeys.publish -------------------------------
DROP FUNCTION IF EXISTS public.web_push_broadcast_send(UUID, TEXT, UUID, TEXT, JSONB, JSONB, JSONB, UUID[], TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.web_push_broadcast_send(
  p_tenant_id    UUID,
  p_environment  TEXT,
  p_client_key   UUID,
  p_name         TEXT,
  p_content      JSONB,
  p_audience     JSONB,
  p_filter       JSONB DEFAULT '{}',
  p_customer_ids UUID[] DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_folder_path  TEXT DEFAULT '/'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_existing public.web_push_broadcasts%ROWTYPE;
  v_result JSONB;
  v_name TEXT := left(btrim(coalesce(p_name, '')), 120);
  v_folder TEXT := public.web_push_folder_norm(p_folder_path);
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_permission(p_tenant_id, 'journeys.publish') THEN
    RAISE EXCEPTION 'You do not have permission to send in this workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_client_key IS NULL THEN RAISE EXCEPTION 'client key is required' USING ERRCODE = 'check_violation'; END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('production', 'staging', 'development') THEN
    RAISE EXCEPTION 'invalid environment' USING ERRCODE = 'check_violation';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'broadcast name is required' USING ERRCODE = 'check_violation'; END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' OR coalesce(btrim(p_content->>'title'), '') = '' THEN
    RAISE EXCEPTION 'push title is required' USING ERRCODE = 'check_violation';
  END IF;
  -- Broadcast content is the same for every device (many are anonymous): no {{personalisation}}.
  IF p_content::text ~ '\{\{' THEN   -- title, body, button labels and every URL
    RAISE EXCEPTION 'personalisation tokens like {{first_name}} are not supported in web push campaigns' USING ERRCODE = 'check_violation';
  END IF;
  IF length(p_content::text) > 8000 THEN
    RAISE EXCEPTION 'push content is too large (max 8 KB)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_scheduled_at IS NOT NULL AND p_scheduled_at > NOW() + interval '90 days' THEN
    RAISE EXCEPTION 'schedule at most 90 days ahead' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.tenant_is_active(p_tenant_id) THEN
    RAISE EXCEPTION 'This workspace is suspended' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Same compose session sent twice (double click, retry): return the first result.
  SELECT * INTO v_existing FROM public.web_push_broadcasts WHERE tenant_id = p_tenant_id AND client_key = p_client_key;
  IF FOUND THEN
    RETURN v_existing.result || jsonb_build_object('broadcast_id', v_existing.id, 'already_sent', true);
  END IF;

  INSERT INTO public.web_push_broadcasts (tenant_id, environment, client_key, name, content, audience, scheduled_at, created_by, folder_path)
  VALUES (p_tenant_id, p_environment, p_client_key, v_name, p_content, coalesce(p_audience, '{}'),
          CASE WHEN p_scheduled_at > NOW() THEN p_scheduled_at END, auth.uid(), v_folder)
  RETURNING id INTO v_id;

  PERFORM public.web_push_fill_broadcast_targets(p_tenant_id, p_environment, p_filter, p_customer_ids);
  v_result := public.web_push_enqueue_targets(p_tenant_id, p_environment, p_content, 'broadcast:' || v_id,
    NULL, v_id::text, v_name, NULL, p_scheduled_at);

  UPDATE public.web_push_broadcasts SET result = v_result WHERE id = v_id;
  RETURN v_result || jsonb_build_object('broadcast_id', v_id, 'already_sent', false);
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_broadcast_send(UUID, TEXT, UUID, TEXT, JSONB, JSONB, JSONB, UUID[], TIMESTAMPTZ, TEXT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_broadcast_send(UUID, TEXT, UUID, TEXT, JSONB, JSONB, JSONB, UUID[], TIMESTAMPTZ, TEXT) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_broadcast_send(UUID, TEXT, UUID, TEXT, JSONB, JSONB, JSONB, UUID[], TIMESTAMPTZ, TEXT) TO authenticated, service_role;

-- ---- Cancel what hasn't gone out yet — needs journeys.publish -----------------------
CREATE OR REPLACE FUNCTION public.web_push_broadcast_cancel(p_broadcast_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE b public.web_push_broadcasts%ROWTYPE; n INT;
BEGIN
  SELECT * INTO b FROM public.web_push_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.user_has_permission(b.tenant_id, 'journeys.publish') THEN
    RAISE EXCEPTION 'Broadcast not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.web_push_outbox SET status = 'skipped', last_error = 'broadcast cancelled', locked_until = NULL, updated_at = NOW()
  WHERE tenant_id = b.tenant_id AND environment = b.environment AND delivery_id = b.id::text AND status = 'queued';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.web_push_broadcasts SET cancelled_at = coalesce(cancelled_at, NOW()) WHERE id = b.id;
  RETURN jsonb_build_object('cancelled', n);
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_broadcast_cancel(UUID) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_broadcast_cancel(UUID) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_broadcast_cancel(UUID) TO authenticated, service_role;

-- ---- Delete a campaign — needs journeys.publish --------------------------------------
-- Stops anything not yet sent, then removes the campaign. Delivery/click history in
-- engagement_log is kept (customer timelines); outbox rows age out with the normal prune.
CREATE OR REPLACE FUNCTION public.web_push_broadcast_delete(p_broadcast_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE b public.web_push_broadcasts%ROWTYPE; n INT;
BEGIN
  SELECT * INTO b FROM public.web_push_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.user_has_permission(b.tenant_id, 'journeys.publish') THEN
    RAISE EXCEPTION 'Broadcast not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.web_push_outbox SET status = 'skipped', last_error = 'campaign deleted', locked_until = NULL, updated_at = NOW()
  WHERE tenant_id = b.tenant_id AND environment = b.environment AND delivery_id = b.id::text AND status = 'queued';
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.web_push_broadcasts WHERE id = b.id;
  RETURN jsonb_build_object('deleted', true, 'stopped', n);
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_broadcast_delete(UUID) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_broadcast_delete(UUID) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_broadcast_delete(UUID) TO authenticated, service_role;

-- ---- List with live results (any member) ------------------------------------------
DROP FUNCTION IF EXISTS public.web_push_broadcast_list(UUID, TEXT, INT);
CREATE OR REPLACE FUNCTION public.web_push_broadcast_list(p_tenant_id UUID, p_environment TEXT, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID, name TEXT, content JSONB, audience JSONB, scheduled_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ, result JSONB, status TEXT, folder_path TEXT, created_by UUID,
  queued INT, delivered INT, failed INT, skipped INT, clicked INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'You do not have access to this workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH b AS (
    SELECT * FROM public.web_push_broadcasts wb
    WHERE wb.tenant_id = p_tenant_id AND wb.environment = p_environment
    ORDER BY wb.created_at DESC LIMIT greatest(least(coalesce(p_limit, 50), 10000), 1)
  ), o AS (
    SELECT ob.delivery_id,
      count(*) FILTER (WHERE ob.status IN ('queued', 'sending'))::int AS q,
      count(*) FILTER (WHERE ob.status = 'delivered')::int AS d,
      count(*) FILTER (WHERE ob.status = 'failed')::int AS f,
      count(*) FILTER (WHERE ob.status = 'skipped')::int AS s
    FROM public.web_push_outbox ob
    WHERE ob.tenant_id = p_tenant_id AND ob.delivery_id IN (SELECT b.id::text FROM b)
    GROUP BY ob.delivery_id
  ), c AS (
    SELECT ob.delivery_id, count(DISTINCT e.message_id)::int AS k
    FROM public.web_push_outbox ob
    JOIN public.engagement_log e ON e.tenant_id = ob.tenant_id AND e.message_id = ob.message_id::text AND e.event = 'clicked'
    WHERE ob.tenant_id = p_tenant_id AND ob.delivery_id IN (SELECT b.id::text FROM b)
    GROUP BY ob.delivery_id
  )
  SELECT b.id, b.name, b.content, b.audience, b.scheduled_at, b.created_at, b.cancelled_at, b.result,
    CASE
      WHEN b.cancelled_at IS NOT NULL THEN 'cancelled'
      WHEN b.scheduled_at IS NOT NULL AND b.scheduled_at > NOW() THEN 'scheduled'
      WHEN coalesce(o.q, 0) > 0 THEN 'sending'
      ELSE 'sent'
    END,
    b.folder_path, b.created_by,
    coalesce(o.q, 0), coalesce(o.d, 0), coalesce(o.f, 0), coalesce(o.s, 0), coalesce(c.k, 0)
  FROM b
  LEFT JOIN o ON o.delivery_id = b.id::text
  LEFT JOIN c ON c.delivery_id = b.id::text
  ORDER BY b.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_broadcast_list(UUID, TEXT, INT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_broadcast_list(UUID, TEXT, INT) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_broadcast_list(UUID, TEXT, INT) TO authenticated, service_role;

-- ---- Websites with push subscribers (any member) ------------------------------------
CREATE OR REPLACE FUNCTION public.web_push_site_counts(p_tenant_id UUID, p_environment TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'You do not have access to this workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  WITH ws AS (
    SELECT site_id, name, domain FROM public.web_analytics_sites
    WHERE tenant_id = p_tenant_id AND environment = p_environment AND status <> 'archived'
  ), subs AS (
    SELECT site_id, count(*) AS n FROM public.web_push_subscribers
    WHERE tenant_id = p_tenant_id AND environment = p_environment AND subscription_status = 'active'
    GROUP BY site_id
  ), x AS (
    SELECT ws.site_id, ws.name, ws.domain, coalesce(subs.n, 0) AS n
    FROM ws LEFT JOIN subs ON subs.site_id = ws.site_id
    UNION ALL
    -- subscribers whose website is not known yet (subscribed before sites were recorded)
    SELECT NULL, NULL, NULL, subs.n FROM subs
    WHERE subs.site_id IS NULL OR NOT EXISTS (SELECT 1 FROM ws WHERE ws.site_id = subs.site_id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('site_id', site_id, 'name', name, 'domain', domain, 'devices', n)
           ORDER BY site_id IS NULL, n DESC, name), '[]')
  INTO r FROM (SELECT site_id, name, domain, sum(n)::int AS n FROM x GROUP BY 1, 2, 3) y;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_site_counts(UUID, TEXT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_site_counts(UUID, TEXT) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_site_counts(UUID, TEXT) TO authenticated, service_role;

-- ---- Folders: create / rename / delete — needs journeys.publish ---------------------
CREATE OR REPLACE FUNCTION public.web_push_folder_save(
  p_tenant_id UUID, p_environment TEXT, p_op TEXT, p_path TEXT, p_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path TEXT := public.web_push_folder_norm(p_path);
  v_parent TEXT; v_new TEXT; v_name TEXT := btrim(coalesce(p_name, ''));
  parts TEXT[]; i INT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_permission(p_tenant_id, 'journeys.publish') THEN
    RAISE EXCEPTION 'You do not have permission to manage campaigns in this workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('production', 'staging', 'development') THEN
    RAISE EXCEPTION 'invalid environment' USING ERRCODE = 'check_violation';
  END IF;
  IF p_op IN ('create', 'rename') AND (v_name = '' OR position('/' IN v_name) > 0 OR length(v_name) > 60) THEN
    RAISE EXCEPTION 'folder name is required (max 60 characters, no "/")' USING ERRCODE = 'check_violation';
  END IF;

  IF p_op = 'create' THEN
    -- p_path is the parent folder; every ancestor is made to exist too.
    v_new := public.web_push_folder_norm(v_path || '/' || v_name);
    parts := string_to_array(substr(v_new, 2), '/');
    FOR i IN 1 .. cardinality(parts) LOOP
      INSERT INTO public.web_push_campaign_folders (tenant_id, environment, path, name, parent_path)
      VALUES (p_tenant_id, p_environment, '/' || array_to_string(parts[1:i], '/'), parts[i],
              public.web_push_folder_norm(array_to_string(parts[1:i-1], '/')))
      ON CONFLICT (tenant_id, environment, path) DO NOTHING;
    END LOOP;
    RETURN jsonb_build_object('path', v_new);
  END IF;

  IF v_path = '/' THEN RAISE EXCEPTION 'the root folder cannot be changed' USING ERRCODE = 'check_violation'; END IF;
  v_parent := public.web_push_folder_norm(regexp_replace(v_path, '/[^/]*$', ''));

  IF p_op = 'rename' THEN
    v_new := public.web_push_folder_norm(v_parent || '/' || v_name);
    IF v_new = v_path THEN RETURN jsonb_build_object('path', v_new); END IF;
    IF EXISTS (SELECT 1 FROM public.web_push_campaign_folders WHERE tenant_id = p_tenant_id AND environment = p_environment AND path = v_new) THEN
      RAISE EXCEPTION 'a folder with that name already exists here' USING ERRCODE = 'unique_violation';
    END IF;
    UPDATE public.web_push_campaign_folders SET
      parent_path = CASE WHEN path = v_path THEN v_parent ELSE v_new || substr(parent_path, length(v_path) + 1) END,
      name = CASE WHEN path = v_path THEN v_name ELSE name END,
      path = v_new || substr(path, length(v_path) + 1)
    WHERE tenant_id = p_tenant_id AND environment = p_environment AND (path = v_path OR left(path, length(v_path) + 1) = v_path || '/');
    UPDATE public.web_push_broadcasts SET folder_path = v_new || substr(folder_path, length(v_path) + 1)
    WHERE tenant_id = p_tenant_id AND environment = p_environment AND (folder_path = v_path OR left(folder_path, length(v_path) + 1) = v_path || '/');
    RETURN jsonb_build_object('path', v_new);
  END IF;

  IF p_op = 'delete' THEN
    -- Campaigns are never deleted with a folder: they move up to the parent.
    UPDATE public.web_push_broadcasts SET folder_path = v_parent
    WHERE tenant_id = p_tenant_id AND environment = p_environment AND (folder_path = v_path OR left(folder_path, length(v_path) + 1) = v_path || '/');
    DELETE FROM public.web_push_campaign_folders
    WHERE tenant_id = p_tenant_id AND environment = p_environment AND (path = v_path OR left(path, length(v_path) + 1) = v_path || '/');
    RETURN jsonb_build_object('path', v_parent);
  END IF;

  RAISE EXCEPTION 'unknown folder operation' USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_folder_save(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_folder_save(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_folder_save(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.web_push_broadcast_move(p_broadcast_id UUID, p_folder_path TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE b public.web_push_broadcasts%ROWTYPE; v_folder TEXT := public.web_push_folder_norm(p_folder_path);
BEGIN
  SELECT * INTO b FROM public.web_push_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.user_has_permission(b.tenant_id, 'journeys.publish') THEN
    RAISE EXCEPTION 'Broadcast not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_folder <> '/' AND NOT EXISTS (SELECT 1 FROM public.web_push_campaign_folders
      WHERE tenant_id = b.tenant_id AND environment = b.environment AND path = v_folder) THEN
    RAISE EXCEPTION 'folder not found' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE public.web_push_broadcasts SET folder_path = v_folder WHERE id = b.id;
  RETURN jsonb_build_object('folder_path', v_folder);
END;
$$;
REVOKE ALL ON FUNCTION public.web_push_broadcast_move(UUID, TEXT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.web_push_broadcast_move(UUID, TEXT) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.web_push_broadcast_move(UUID, TEXT) TO authenticated, service_role;
