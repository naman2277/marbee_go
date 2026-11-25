-- =============================================================================
-- 95 — Web Push, production-ready (D-022)
-- =============================================================================
-- 1. The Firebase service-account private key moves out of channel_providers (which
--    every workspace member can read through RLS) into channel_provider_secrets, a
--    table only the service role (edge functions) can touch. A trigger keeps it that
--    way: whenever a member's browser saves a service account into
--    channel_providers.credentials_encrypted, the trigger moves it to the secrets
--    table and stores only non-secret facts (project id, client email) in `config`.
--    Edge functions re-seal the plaintext with MARBEE_SECRETS_KEY on first use.
-- 2. A server-side outbox (web_push_outbox) replaces the browser send loop. Campaigns
--    and journeys call enqueue_web_push(); the push-worker edge function claims
--    batches (SKIP LOCKED), sends through FCM and records each outcome with
--    complete_web_push(): logs + retries with backoff + pruning of dead tokens.
--    Idempotency: one row per (workspace, environment, idempotency key, device).
-- 3. A per-workspace daily fair-use cap (D-015: Web Push is included, fair-use).
--    Default 100,000 per day; override with tenants.settings.web_push_daily_cap.
-- 4. pg_cron runs push_worker_tick() every minute. It needs the Vault secrets
--    push_worker_url + push_worker_key. Without them it does nothing (no error).
--
-- Consent model: a device is reachable only while its browser permission is granted
-- and its subscription is 'active' (the browser permission prompt is the opt-in).
-- Unsubscribe / token expiry make it inactive or invalid. Active `exclusions` rows
-- (channel web_push or all channels) always win.
--
-- Re-runnable. Run after 94.
-- =============================================================================

-- ---- 1. Server-only provider secrets ----------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_provider_secrets (
  provider_id UUID PRIMARY KEY REFERENCES public.channel_providers(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  secret      TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.channel_provider_secrets ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: app users get nothing, the service role bypasses RLS.
REVOKE ALL ON public.channel_provider_secrets FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON public.channel_provider_secrets FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT ALL ON public.channel_provider_secrets TO service_role;

-- Returns NULL when the text is not a Firebase service account.
CREATE OR REPLACE FUNCTION public.firebase_sa_facts(p_raw TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE v JSONB;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN RETURN NULL; END IF;
  BEGIN
    v := p_raw::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF jsonb_typeof(v) <> 'object' OR v->>'type' IS DISTINCT FROM 'service_account' THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'service_account_configured', true,
    'service_account_project_id', v->>'project_id',
    'service_account_client_email', v->>'client_email'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.channel_providers_keep_secrets_server_side()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_facts JSONB;
BEGIN
  IF NEW.channel <> 'web_push' OR NEW.provider_type <> 'firebase' THEN RETURN NEW; END IF;
  v_facts := public.firebase_sa_facts(NEW.credentials_encrypted);
  IF v_facts IS NOT NULL THEN
    INSERT INTO public.channel_provider_secrets (provider_id, tenant_id, secret, updated_at)
    VALUES (NEW.id, NEW.tenant_id, btrim(NEW.credentials_encrypted), NOW())
    ON CONFLICT (provider_id) DO UPDATE SET secret = EXCLUDED.secret, tenant_id = EXCLUDED.tenant_id, updated_at = NOW();
    NEW.config := coalesce(NEW.config, '{}'::jsonb) || v_facts;
  END IF;
  -- Never keep anything secret-looking in the member-readable column.
  NEW.credentials_encrypted := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.channel_providers_keep_secrets_server_side() FROM PUBLIC;

DROP TRIGGER IF EXISTS channel_providers_keep_secrets_server_side ON public.channel_providers;
CREATE TRIGGER channel_providers_keep_secrets_server_side
  BEFORE INSERT OR UPDATE OF credentials_encrypted ON public.channel_providers
  FOR EACH ROW EXECUTE FUNCTION public.channel_providers_keep_secrets_server_side();

-- Move keys already saved (the trigger does the work on this no-op update).
UPDATE public.channel_providers
SET credentials_encrypted = credentials_encrypted
WHERE channel = 'web_push' AND provider_type = 'firebase' AND credentials_encrypted IS NOT NULL;

-- ---- 2. Outbox --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_push_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  subscriber_id   UUID NOT NULL REFERENCES public.web_push_subscribers(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  message_id      UUID NOT NULL DEFAULT gen_random_uuid(),
  content         JSONB NOT NULL,
  journey_id      UUID,
  delivery_id     TEXT,
  delivery_name   TEXT,
  provider_id     UUID,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'sending', 'delivered', 'failed', 'skipped')),
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, idempotency_key, subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_due
  ON public.web_push_outbox (next_attempt_at) WHERE status IN ('queued', 'sending');
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_tenant
  ON public.web_push_outbox (tenant_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_push_outbox_delivery
  ON public.web_push_outbox (tenant_id, delivery_id) WHERE delivery_id IS NOT NULL;

ALTER TABLE public.web_push_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS web_push_outbox_member_read ON public.web_push_outbox;
CREATE POLICY web_push_outbox_member_read ON public.web_push_outbox FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
REVOKE ALL ON public.web_push_outbox FROM PUBLIC;
DO $$ BEGIN
  EXECUTE 'REVOKE ALL ON public.web_push_outbox FROM anon, authenticated';
  EXECUTE 'GRANT SELECT ON public.web_push_outbox TO authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT ALL ON public.web_push_outbox TO service_role;

-- Subscriber lookups used by enqueue.
CREATE INDEX IF NOT EXISTS idx_web_push_subscribers_customer
  ON public.web_push_subscribers (tenant_id, environment, customer_id) WHERE subscription_status = 'active';
CREATE INDEX IF NOT EXISTS idx_web_push_subscribers_ecid
  ON public.web_push_subscribers (tenant_id, environment, ecid) WHERE subscription_status = 'active' AND ecid IS NOT NULL;

-- ---- 3. Worker kick (Vault + pg_net; silently skipped when not configured) -----
CREATE OR REPLACE FUNCTION public.push_worker_kick()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RETURN FALSE;
  END IF;
  EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_worker_url'$q$ INTO v_url;
  EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_worker_key'$q$ INTO v_key;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN FALSE; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
    USING v_url, '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key);
  RETURN TRUE;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'push_worker_kick skipped: %', SQLERRM;
  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.push_worker_kick() FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.push_worker_kick() FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.push_worker_kick() TO service_role;

-- ---- 4. Enqueue -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_push_daily_cap(p_tenant_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    CASE WHEN (t.settings->>'web_push_daily_cap') ~ '^\d{1,9}$' THEN (t.settings->>'web_push_daily_cap')::int END,
    100000)
  FROM public.tenants t WHERE t.id = p_tenant_id;
$$;
REVOKE ALL ON FUNCTION public.web_push_daily_cap(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.web_push_daily_cap(UUID) TO service_role;

-- Service-role entry point (push-subscribe welcome push, server workers).
-- Targets = every ACTIVE device of the given customers (linked directly, or through an
-- ecid in customer_identities) plus the given subscriber ids, inside this workspace only.
CREATE OR REPLACE FUNCTION public.enqueue_web_push_internal(
  p_tenant_id       UUID,
  p_environment     TEXT,
  p_customer_ids    UUID[],
  p_subscriber_ids  UUID[],
  p_content         JSONB,
  p_idempotency_key TEXT,
  p_journey_id      UUID DEFAULT NULL,
  p_delivery_id     TEXT DEFAULT NULL,
  p_delivery_name   TEXT DEFAULT NULL,
  p_provider_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today     DATE := CURRENT_DATE;
  v_customers UUID[] := coalesce(p_customer_ids, '{}');
  v_subs      UUID[] := coalesce(p_subscriber_ids, '{}');
  v_cap INT; v_used INT; v_room INT;
  n_targets INT; n_excluded INT; n_fresh INT; n_reached INT; n_inserted INT := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant is required' USING ERRCODE = 'check_violation'; END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('production', 'staging', 'development') THEN
    RAISE EXCEPTION 'invalid environment' USING ERRCODE = 'check_violation';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'idempotency key must be 1–200 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object'
     OR coalesce(btrim(p_content->>'title'), '') = '' THEN
    RAISE EXCEPTION 'push title is required' USING ERRCODE = 'check_violation';
  END IF;
  IF length(p_content::text) > 8000 THEN
    RAISE EXCEPTION 'push content is too large (max 8 KB)' USING ERRCODE = 'check_violation';
  END IF;
  IF cardinality(v_customers) > 50000 OR cardinality(v_subs) > 1000 THEN
    RAISE EXCEPTION 'too many recipients in one call (max 50,000 customers)' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.tenant_is_active(p_tenant_id) THEN
    RAISE EXCEPTION 'This workspace is suspended' USING ERRCODE = 'insufficient_privilege';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp._wp_targets (subscriber_id UUID PRIMARY KEY, customer_id UUID, excluded BOOLEAN, fresh BOOLEAN) ON COMMIT DROP;
  TRUNCATE pg_temp._wp_targets;

  INSERT INTO pg_temp._wp_targets (subscriber_id, customer_id, excluded, fresh)
  SELECT DISTINCT ON (s.id) s.id, coalesce(s.customer_id, ci.customer_id), FALSE, TRUE
  FROM public.web_push_subscribers s
  LEFT JOIN public.customer_identities ci
    ON ci.tenant_id = s.tenant_id AND ci.environment = s.environment
   AND s.ecid IS NOT NULL AND ci.ecid = s.ecid AND ci.customer_id = ANY (v_customers)
  WHERE s.tenant_id = p_tenant_id
    AND s.environment = p_environment
    AND s.subscription_status = 'active'
    AND coalesce(s.permission_status, 'granted') = 'granted'
    AND (s.customer_id = ANY (v_customers) OR s.id = ANY (v_subs) OR ci.customer_id IS NOT NULL)
  ORDER BY s.id, ci.customer_id NULLS LAST;

  UPDATE pg_temp._wp_targets t SET excluded = TRUE
  WHERE t.customer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.exclusions e
    WHERE e.tenant_id = p_tenant_id AND e.customer_id = t.customer_id
      AND (e.channel IS NULL OR e.channel = 'web_push')
      AND e.start_date <= v_today AND (e.end_date IS NULL OR e.end_date >= v_today));

  UPDATE pg_temp._wp_targets t SET fresh = FALSE
  WHERE EXISTS (SELECT 1 FROM public.web_push_outbox o
    WHERE o.tenant_id = p_tenant_id AND o.environment = p_environment
      AND o.idempotency_key = p_idempotency_key AND o.subscriber_id = t.subscriber_id);

  SELECT count(*), count(*) FILTER (WHERE excluded), count(*) FILTER (WHERE fresh AND NOT excluded),
         count(DISTINCT customer_id) FILTER (WHERE customer_id = ANY (v_customers))
  INTO n_targets, n_excluded, n_fresh, n_reached
  FROM pg_temp._wp_targets;

  v_cap := coalesce(public.web_push_daily_cap(p_tenant_id), 100000);
  SELECT count(*) INTO v_used FROM public.web_push_outbox
  WHERE tenant_id = p_tenant_id AND created_at >= date_trunc('day', NOW()) AND status <> 'skipped';
  v_room := greatest(v_cap - v_used, 0);

  IF n_fresh > 0 AND v_room > 0 THEN
    INSERT INTO public.web_push_outbox (tenant_id, environment, idempotency_key, subscriber_id, customer_id,
      content, journey_id, delivery_id, delivery_name, provider_id)
    SELECT p_tenant_id, p_environment, p_idempotency_key, t.subscriber_id, t.customer_id,
      p_content, p_journey_id, left(p_delivery_id, 200), left(p_delivery_name, 200), p_provider_id
    FROM pg_temp._wp_targets t
    WHERE t.fresh AND NOT t.excluded
    ORDER BY t.subscriber_id
    LIMIT v_room
    ON CONFLICT (tenant_id, environment, idempotency_key, subscriber_id) DO NOTHING;
    GET DIAGNOSTICS n_inserted = ROW_COUNT;
  END IF;

  IF n_inserted > 0 THEN PERFORM public.push_worker_kick(); END IF;

  RETURN jsonb_build_object(
    'queued', n_inserted,
    'devices', n_targets,
    'excluded', n_excluded,
    'duplicate', n_targets - n_excluded - n_fresh,
    'capped', greatest(n_fresh - n_inserted, 0),
    'no_subscription', greatest((SELECT count(DISTINCT c) FROM unnest(v_customers) c) - n_reached, 0),
    'daily_cap', v_cap
  );
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_web_push_internal(UUID, TEXT, UUID[], UUID[], JSONB, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.enqueue_web_push_internal(UUID, TEXT, UUID[], UUID[], JSONB, TEXT, UUID, TEXT, TEXT, UUID) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.enqueue_web_push_internal(UUID, TEXT, UUID[], UUID[], JSONB, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;

-- App entry point (campaign / journey send nodes). Needs journeys.publish in that workspace.
CREATE OR REPLACE FUNCTION public.enqueue_web_push(
  p_tenant_id       UUID,
  p_environment     TEXT,
  p_customer_ids    UUID[],
  p_content         JSONB,
  p_idempotency_key TEXT,
  p_journey_id      UUID DEFAULT NULL,
  p_delivery_id     TEXT DEFAULT NULL,
  p_delivery_name   TEXT DEFAULT NULL,
  p_subscriber_ids  UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_permission(p_tenant_id, 'journeys.publish') THEN
    RAISE EXCEPTION 'You do not have permission to send in this workspace' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.enqueue_web_push_internal(p_tenant_id, p_environment, p_customer_ids, p_subscriber_ids,
    p_content, p_idempotency_key, p_journey_id, p_delivery_id, p_delivery_name, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_web_push(UUID, TEXT, UUID[], JSONB, TEXT, UUID, TEXT, TEXT, UUID[]) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.enqueue_web_push(UUID, TEXT, UUID[], JSONB, TEXT, UUID, TEXT, TEXT, UUID[]) FROM anon';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.enqueue_web_push(UUID, TEXT, UUID[], JSONB, TEXT, UUID, TEXT, TEXT, UUID[]) TO authenticated, service_role;

-- ---- 5. Claim + complete (push-worker only) -----------------------------------
CREATE OR REPLACE FUNCTION public.claim_web_push_batch(p_limit INT DEFAULT 200)
RETURNS TABLE (
  id UUID, tenant_id UUID, environment TEXT, message_id UUID, content JSONB,
  journey_id UUID, delivery_id TEXT, delivery_name TEXT, provider_id UUID,
  customer_id UUID, subscriber_id UUID, fcm_token TEXT, attempts INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  -- Devices that stopped being reachable since enqueue: skip, don't send.
  UPDATE public.web_push_outbox o SET status = 'skipped', last_error = 'subscription no longer active',
    locked_until = NULL, updated_at = NOW()
  FROM public.web_push_subscribers s
  WHERE s.id = o.subscriber_id AND o.status = 'queued' AND s.subscription_status <> 'active';

  RETURN QUERY
  WITH c AS (
    SELECT o.id FROM public.web_push_outbox o
    WHERE ((o.status = 'queued' AND o.next_attempt_at <= NOW())
        OR (o.status = 'sending' AND o.locked_until < NOW()))
      AND public.tenant_is_active(o.tenant_id)   -- suspended workspaces are held (D-020)
    ORDER BY o.next_attempt_at
    LIMIT greatest(least(coalesce(p_limit, 200), 1000), 1)
    FOR UPDATE OF o SKIP LOCKED
  )
  UPDATE public.web_push_outbox o
  SET status = 'sending', locked_until = NOW() + interval '2 minutes',
      attempts = o.attempts + 1, updated_at = NOW()
  FROM c, public.web_push_subscribers s
  WHERE o.id = c.id AND s.id = o.subscriber_id
  RETURNING o.id, o.tenant_id, o.environment, o.message_id, o.content, o.journey_id, o.delivery_id,
            o.delivery_name, o.provider_id, o.customer_id, o.subscriber_id, s.fcm_token, o.attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_web_push_batch(INT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.claim_web_push_batch(INT) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.claim_web_push_batch(INT) TO service_role;

-- p_outcome: delivered | retry | invalid_token | failed
CREATE OR REPLACE FUNCTION public.complete_web_push(
  p_id UUID, p_outcome TEXT, p_error TEXT DEFAULT NULL, p_retry_after_seconds INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  o public.web_push_outbox%ROWTYPE;
  v_max_attempts CONSTANT INT := 5;
  v_final TEXT;
  v_delay INT;
  v_err TEXT := left(p_error, 500);
BEGIN
  IF p_outcome NOT IN ('delivered', 'retry', 'invalid_token', 'failed') THEN
    RAISE EXCEPTION 'unknown outcome %', p_outcome USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO o FROM public.web_push_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'sending' THEN RETURN 'ignored'; END IF;

  IF p_outcome = 'retry' AND o.attempts < v_max_attempts THEN
    -- 30s, 2m, 8m, 32m (capped at 1h); provider Retry-After wins when larger.
    v_delay := least(greatest(30 * (4 ^ (o.attempts - 1))::int, coalesce(p_retry_after_seconds, 0)), 3600);
    UPDATE public.web_push_outbox SET status = 'queued', locked_until = NULL, last_error = v_err,
      next_attempt_at = NOW() + make_interval(secs => v_delay), updated_at = NOW()
    WHERE id = o.id;
    RETURN 'queued';
  END IF;

  v_final := CASE WHEN p_outcome = 'delivered' THEN 'delivered' ELSE 'failed' END;
  UPDATE public.web_push_outbox SET status = v_final, locked_until = NULL,
    last_error = CASE WHEN v_final = 'failed' THEN coalesce(v_err, 'failed') END,
    sent_at = CASE WHEN v_final = 'delivered' THEN NOW() END, updated_at = NOW()
  WHERE id = o.id;

  IF p_outcome = 'invalid_token' THEN
    UPDATE public.web_push_subscribers SET subscription_status = 'invalid', token_invalidated_at = NOW()
    WHERE id = o.subscriber_id AND tenant_id = o.tenant_id;
    UPDATE public.channel_endpoints SET status = 'invalid'
    WHERE subscriber_id = o.subscriber_id AND tenant_id = o.tenant_id;
  END IF;

  INSERT INTO public.engagement_log (tenant_id, environment, customer_id, channel, message_id, event, journey_id, metadata)
  VALUES (o.tenant_id, o.environment, o.customer_id, 'web_push', o.message_id::text,
    CASE WHEN v_final = 'delivered' THEN 'delivered' ELSE 'failed' END, o.journey_id,
    jsonb_strip_nulls(jsonb_build_object(
      'title', o.content->>'title', 'body', o.content->>'body',
      'click_url', o.content->>'click_url', 'click_action', o.content->>'click_url',
      'delivery_id', o.delivery_id, 'delivery_name', o.delivery_name,
      'subscriber_id', o.subscriber_id, 'outbox_id', o.id, 'attempts', o.attempts,
      'error', CASE WHEN v_final = 'failed' THEN coalesce(v_err, p_outcome) END,
      'source', 'push-worker')));

  INSERT INTO public.customer_delivery_log (tenant_id, environment, customer_id, journey_id, channel, provider, message_id, status, error_code)
  VALUES (o.tenant_id, o.environment, o.customer_id, o.journey_id, 'web_push', 'firebase', o.message_id::text,
    v_final, CASE WHEN p_outcome = 'invalid_token' THEN 'token_invalid' WHEN v_final = 'failed' THEN left(coalesce(v_err, p_outcome), 200) END);

  RETURN v_final;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_web_push(UUID, TEXT, TEXT, INT) FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.complete_web_push(UUID, TEXT, TEXT, INT) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.complete_web_push(UUID, TEXT, TEXT, INT) TO service_role;

-- ---- 6. Cron tick: kick the worker when work is due; prune old outbox rows ----
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
  IF EXISTS (SELECT 1 FROM public.web_push_outbox
             WHERE (status = 'queued' AND next_attempt_at <= NOW()) OR (status = 'sending' AND locked_until < NOW())) THEN
    RETURN public.push_worker_kick();
  END IF;
  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.push_worker_tick() FROM PUBLIC;
DO $$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.push_worker_tick() FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL; END $$;
GRANT EXECUTE ON FUNCTION public.push_worker_tick() TO service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — schedule public.push_worker_tick() yourself. Skipping.';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'marbee_push_worker_tick';
  PERFORM cron.schedule('marbee_push_worker_tick', '* * * * *', $job$SELECT public.push_worker_tick();$job$);
END
$do$;
