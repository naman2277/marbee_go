-- =============================================================================
-- MARBEE — 84: PLATFORM CONSOLE + CREDITS LEDGER   (D-015, D-016)
-- Spec: docs/cpo/specs/2026-11-10-platform-console-v1.md
--
-- Purely ADDITIVE: creates new tables/functions only. Does not alter or delete
-- any existing table or data. Safe to re-run (idempotent).
--
-- Security model
--   * Every object here is reachable ONLY by the service role (edge function
--     `platform-admin`). RLS is enabled with NO policies, and table/function
--     privileges are revoked from anon + authenticated.
--   * platform_audit_log and credit_ledger are append-only (triggers block
--     UPDATE / DELETE, even for the service role).
--
-- Run order: after 01–83 (and v2/ if applied). Staging first.
--
-- After running, add yourself as a platform admin (replace the email):
--
--   INSERT INTO public.platform_admins (user_id, email, role)
--   SELECT id, email, 'owner' FROM auth.users WHERE email = 'you@example.com'
--   ON CONFLICT (user_id) DO UPDATE SET status = 'active', role = 'owner';
--
-- Rollback block at the bottom of this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Platform admins (CEO / CTO). Never writable from the app.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('owner', 'operator')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Platform audit log — append-only
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id    UUID,
  actor_email TEXT,
  action      TEXT NOT NULL,
  tenant_id   UUID,
  target      TEXT,
  details     JSONB NOT NULL DEFAULT '{}',
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS platform_audit_log_created_idx ON public.platform_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_log_tenant_idx  ON public.platform_audit_log (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_block_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS platform_audit_log_immutable ON public.platform_audit_log;
CREATE TRIGGER platform_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_mutation();

-- -----------------------------------------------------------------------------
-- 3. Commercial account per tenant (plan fee, billing contact, region)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_tenant_accounts (
  tenant_id        UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  region           TEXT NOT NULL DEFAULT 'in' CHECK (region IN ('in', 'mena', 'apac', 'emea', 'na')),
  monthly_fee_inr  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (monthly_fee_inr >= 0),
  billing_email    TEXT,
  legal_name       TEXT,
  gstin            TEXT,
  billing_address  TEXT,
  notes            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. Credits: rate card, wallets, immutable ledger   (1 credit = ₹1)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_rate_card (
  service          TEXT PRIMARY KEY,           -- 'email', 'ai_generation', ...
  unit             TEXT NOT NULL,              -- 'message', 'generation'
  unit_size        INTEGER NOT NULL DEFAULT 1 CHECK (unit_size > 0),
  credits_per_unit NUMERIC(14,4) NOT NULL CHECK (credits_per_unit >= 0),
  description      TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Placeholder rates — the CEO sets final pricing (D-015). Never overwrites edits.
INSERT INTO public.credit_rate_card (service, unit, unit_size, credits_per_unit, description) VALUES
  ('email',         'message',    1000, 18, 'Marbee-managed email (SES), per 1,000 messages — placeholder'),
  ('ai_generation', 'generation', 1,    2,  'One AI generation (audience, journey, content) — placeholder'),
  ('ai_chat',       'message',    1,    0.5,'One AI chatbot reply — placeholder')
ON CONFLICT (service) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.credit_wallets (
  tenant_id          UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  allowance_balance  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allowance_balance >= 0),
  topup_balance      NUMERIC(14,2) NOT NULL DEFAULT 0,   -- may go negative down to -overdraft_limit
  monthly_allowance  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (monthly_allowance >= 0),
  overdraft_limit    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (overdraft_limit >= 0),
  allowance_reset_at TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_wallets_overdraft_floor CHECK (topup_balance >= -overdraft_limit)
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('grant', 'adjustment', 'allowance_reset', 'debit', 'expiry')),
  bucket          TEXT NOT NULL CHECK (bucket IN ('allowance', 'topup', 'mixed')),
  amount          NUMERIC(14,2) NOT NULL,      -- signed: + adds credits, - removes
  allowance_after NUMERIC(14,2) NOT NULL,
  topup_after     NUMERIC(14,2) NOT NULL,
  service         TEXT,                        -- for debits: rate-card service
  quantity        NUMERIC(18,4),
  transactional   BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT UNIQUE,
  reason          TEXT,
  actor_id        UUID,
  expires_at      TIMESTAMPTZ,                 -- top-ups: valid 12 months (sweep: Feb)
  metadata        JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS credit_ledger_tenant_idx ON public.credit_ledger (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_debit_month_idx
  ON public.credit_ledger (tenant_id, service, created_at) WHERE entry_type = 'debit';

DROP TRIGGER IF EXISTS credit_ledger_immutable ON public.credit_ledger;
CREATE TRIGGER credit_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_mutation();

-- Manual grant (+) or correction (-). Corrections can't take a bucket below zero.
CREATE OR REPLACE FUNCTION public.credit_adjust(
  p_tenant_id       UUID,
  p_amount          NUMERIC,
  p_bucket          TEXT,
  p_reason          TEXT,
  p_actor_id        UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  w        public.credit_wallets%ROWTYPE;
  existing public.credit_ledger%ROWTYPE;
  v_entry  public.credit_ledger%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 OR abs(p_amount) > 10000000 THEN
    RAISE EXCEPTION 'amount must be non-zero and at most 10,000,000';
  END IF;
  IF p_bucket NOT IN ('allowance', 'topup') THEN
    RAISE EXCEPTION 'bucket must be allowance or topup';
  END IF;
  IF coalesce(length(trim(p_reason)), 0) < 3 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  SELECT * INTO existing FROM public.credit_ledger WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'entry_id', existing.id,
      'allowance_balance', existing.allowance_after, 'topup_balance', existing.topup_after);
  END IF;

  INSERT INTO public.credit_wallets (tenant_id) VALUES (p_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO w FROM public.credit_wallets WHERE tenant_id = p_tenant_id FOR UPDATE;

  IF p_bucket = 'allowance' THEN
    IF w.allowance_balance + p_amount < 0 THEN RAISE EXCEPTION 'correction exceeds allowance balance'; END IF;
    w.allowance_balance := w.allowance_balance + p_amount;
  ELSE
    IF p_amount < 0 AND w.topup_balance + p_amount < 0 THEN RAISE EXCEPTION 'correction exceeds top-up balance'; END IF;
    w.topup_balance := w.topup_balance + p_amount;
  END IF;

  UPDATE public.credit_wallets
     SET allowance_balance = w.allowance_balance, topup_balance = w.topup_balance, updated_at = NOW()
   WHERE tenant_id = p_tenant_id;

  INSERT INTO public.credit_ledger (tenant_id, entry_type, bucket, amount, allowance_after, topup_after,
                                    idempotency_key, reason, actor_id, expires_at)
  VALUES (p_tenant_id, CASE WHEN p_amount > 0 THEN 'grant' ELSE 'adjustment' END, p_bucket, p_amount,
          w.allowance_balance, w.topup_balance, p_idempotency_key, trim(p_reason), p_actor_id,
          CASE WHEN p_amount > 0 AND p_bucket = 'topup' THEN NOW() + INTERVAL '12 months' END)
  RETURNING * INTO v_entry;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'entry_id', v_entry.id,
    'allowance_balance', w.allowance_balance, 'topup_balance', w.topup_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_set_plan(
  p_tenant_id         UUID,
  p_monthly_allowance NUMERIC,
  p_overdraft_limit   NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE w public.credit_wallets%ROWTYPE;
BEGIN
  IF p_monthly_allowance < 0 OR p_monthly_allowance > 10000000 THEN RAISE EXCEPTION 'invalid monthly allowance'; END IF;
  IF p_overdraft_limit < 0 OR p_overdraft_limit > 1000000 THEN RAISE EXCEPTION 'invalid overdraft limit'; END IF;
  INSERT INTO public.credit_wallets (tenant_id) VALUES (p_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.credit_wallets
     SET monthly_allowance = p_monthly_allowance, overdraft_limit = p_overdraft_limit, updated_at = NOW()
   WHERE tenant_id = p_tenant_id
  RETURNING * INTO w;
  RETURN to_jsonb(w);
END;
$$;

-- Reset a tenant's allowance bucket to its monthly allowance (unused allowance lapses).
CREATE OR REPLACE FUNCTION public.credit_reset_allowance(p_tenant_id UUID, p_period TEXT)
RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  w     public.credit_wallets%ROWTYPE;
  v_key TEXT := 'allowance_reset:' || p_tenant_id || ':' || p_period;
BEGIN
  IF EXISTS (SELECT 1 FROM public.credit_ledger WHERE idempotency_key = v_key) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  SELECT * INTO w FROM public.credit_wallets WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_wallet'); END IF;

  INSERT INTO public.credit_ledger (tenant_id, entry_type, bucket, amount, allowance_after, topup_after,
                                    idempotency_key, reason)
  VALUES (p_tenant_id, 'allowance_reset', 'allowance', w.monthly_allowance - w.allowance_balance,
          w.monthly_allowance, w.topup_balance, v_key, 'Monthly allowance reset ' || p_period);

  UPDATE public.credit_wallets
     SET allowance_balance = monthly_allowance, allowance_reset_at = NOW(), updated_at = NOW()
   WHERE tenant_id = p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'allowance_balance', w.monthly_allowance);
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_reset_all_allowances()
RETURNS INTEGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r RECORD; n INTEGER := 0; v_period TEXT := to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
BEGIN
  FOR r IN SELECT tenant_id FROM public.credit_wallets LOOP
    PERFORM public.credit_reset_allowance(r.tenant_id, v_period);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Atomic debit at send / AI-call time. Allowance first, then top-up.
-- Non-transactional (marketing) sends never go below zero; transactional sends
-- (OTP, order updates) may use the overdraft buffer so end-customers aren't hurt.
CREATE OR REPLACE FUNCTION public.credit_debit(
  p_tenant_id       UUID,
  p_service         TEXT,
  p_credits         NUMERIC,
  p_quantity        NUMERIC,
  p_transactional   BOOLEAN,
  p_idempotency_key TEXT,
  p_metadata        JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  w          public.credit_wallets%ROWTYPE;
  existing   public.credit_ledger%ROWTYPE;
  v_from_all NUMERIC;
  v_rest     NUMERIC;
  v_floor    NUMERIC;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN RAISE EXCEPTION 'credits must be positive'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;

  SELECT * INTO existing FROM public.credit_ledger WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true,
      'allowance_balance', existing.allowance_after, 'topup_balance', existing.topup_after);
  END IF;

  SELECT * INTO w FROM public.credit_wallets WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_wallet'); END IF;

  v_from_all := LEAST(w.allowance_balance, p_credits);
  v_rest     := p_credits - v_from_all;
  v_floor    := CASE WHEN p_transactional THEN -w.overdraft_limit ELSE 0 END;

  IF v_rest > 0 AND w.topup_balance - v_rest < v_floor THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credits',
      'allowance_balance', w.allowance_balance, 'topup_balance', w.topup_balance);
  END IF;

  w.allowance_balance := w.allowance_balance - v_from_all;
  w.topup_balance     := w.topup_balance - v_rest;

  UPDATE public.credit_wallets
     SET allowance_balance = w.allowance_balance, topup_balance = w.topup_balance, updated_at = NOW()
   WHERE tenant_id = p_tenant_id;

  INSERT INTO public.credit_ledger (tenant_id, entry_type, bucket, amount, allowance_after, topup_after,
                                    service, quantity, transactional, idempotency_key, metadata)
  VALUES (p_tenant_id, 'debit',
          CASE WHEN v_rest = 0 THEN 'allowance' WHEN v_from_all = 0 THEN 'topup' ELSE 'mixed' END,
          -p_credits, w.allowance_balance, w.topup_balance,
          p_service, p_quantity, coalesce(p_transactional, false), p_idempotency_key, coalesce(p_metadata, '{}'));

  RETURN jsonb_build_object('ok', true, 'duplicate', false,
    'allowance_balance', w.allowance_balance, 'topup_balance', w.topup_balance);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Per-tenant stats snapshot (counts only — never end-customer PII)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_tenant_stats (
  tenant_id       UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  users_total     INTEGER NOT NULL DEFAULT 0,
  users_active    INTEGER NOT NULL DEFAULT 0,
  profiles_total  BIGINT  NOT NULL DEFAULT 0,
  events_30d      BIGINT  NOT NULL DEFAULT 0,
  deliveries_30d  BIGINT  NOT NULL DEFAULT 0,
  table_rows      JSONB   NOT NULL DEFAULT '{}',
  est_bytes       BIGINT  NOT NULL DEFAULT 0,
  refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Total on-disk bytes of a table including partitions, indexes and TOAST.
CREATE OR REPLACE FUNCTION public._platform_rel_bytes(p_rel REGCLASS)
RETURNS BIGINT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(sum(pg_total_relation_size(relid)), 0)::bigint
  FROM pg_partition_tree(p_rel) WHERE isleaf;
$$;

-- Refresh one tenant (p_tenant_id) or all tenants (NULL).
-- Estimated bytes = Σ over tenant-scoped tables of (tenant rows × average row size).
CREATE OR REPLACE FUNCTION public.platform_refresh_tenant_stats(p_tenant_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tables TEXT[] := ARRAY['customers', 'events', 'customer_delivery_log', 'web_analytics_events',
                           'journey_instances', 'journey_instance_events', 'form_submissions',
                           'rtm_messages', 'mb_chatbot_messages', 'web_push_subscribers',
                           'cohort_members', 'data_job_run_logs', 'audit_logs', 'assets'];
  t       TEXT;
  r       RECORD;
  v_total BIGINT;
  v_bytes BIGINT;
  v_avg   NUMERIC;
  n       INTEGER := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pts (tenant_id UUID, tbl TEXT, cnt BIGINT, est BIGINT) ON COMMIT DROP;
  TRUNCATE _pts;

  FOREACH t IN ARRAY v_tables LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id');
    EXECUTE format(
      'INSERT INTO _pts (tenant_id, tbl, cnt) SELECT tenant_id, %L, count(*) FROM public.%I %s GROUP BY tenant_id',
      t, t, CASE WHEN p_tenant_id IS NULL THEN '' ELSE format('WHERE tenant_id = %L', p_tenant_id) END);
    -- Average row size across all tenants. Row total from planner statistics
    -- (cheap at tens of millions of rows); exact count only for never-analysed tables.
    SELECT coalesce(sum(c.reltuples) FILTER (WHERE c.reltuples > 0), 0)::bigint INTO v_total
    FROM pg_partition_tree(('public.' || t)::regclass) pt JOIN pg_class c ON c.oid = pt.relid
    WHERE pt.isleaf;
    IF v_total = 0 THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_total;
    END IF;
    v_bytes := public._platform_rel_bytes(('public.' || t)::regclass);
    v_avg   := CASE WHEN v_total > 0 THEN v_bytes::numeric / v_total ELSE 0 END;
    UPDATE _pts SET est = (cnt * v_avg)::bigint WHERE tbl = t;
  END LOOP;

  FOR r IN
    SELECT tn.id AS tenant_id FROM public.tenants tn
    WHERE p_tenant_id IS NULL OR tn.id = p_tenant_id
  LOOP
    INSERT INTO public.platform_tenant_stats AS s (
      tenant_id, users_total, users_active, profiles_total, events_30d, deliveries_30d, table_rows, est_bytes, refreshed_at)
    SELECT
      r.tenant_id,
      (SELECT count(*) FROM public.tenant_users tu WHERE tu.tenant_id = r.tenant_id),
      (SELECT count(*) FROM public.tenant_users tu WHERE tu.tenant_id = r.tenant_id AND tu.status = 'active'),
      coalesce((SELECT cnt FROM _pts WHERE tenant_id = r.tenant_id AND tbl = 'customers'), 0),
      CASE WHEN to_regclass('public.events') IS NULL THEN 0 ELSE
        (SELECT count(*) FROM public.events e WHERE e.tenant_id = r.tenant_id AND e."timestamp" >= NOW() - INTERVAL '30 days') END,
      CASE WHEN to_regclass('public.customer_delivery_log') IS NULL THEN 0 ELSE
        (SELECT count(*) FROM public.customer_delivery_log d WHERE d.tenant_id = r.tenant_id AND d."timestamp" >= NOW() - INTERVAL '30 days') END,
      coalesce((SELECT jsonb_object_agg(tbl, cnt) FROM _pts WHERE tenant_id = r.tenant_id), '{}'),
      coalesce((SELECT sum(est) FROM _pts WHERE tenant_id = r.tenant_id), 0),
      NOW()
    ON CONFLICT (tenant_id) DO UPDATE SET
      users_total = EXCLUDED.users_total, users_active = EXCLUDED.users_active,
      profiles_total = EXCLUDED.profiles_total, events_30d = EXCLUDED.events_30d,
      deliveries_30d = EXCLUDED.deliveries_30d, table_rows = EXCLUDED.table_rows,
      est_bytes = EXCLUDED.est_bytes, refreshed_at = EXCLUDED.refreshed_at;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Monthly usage for one tenant: deliveries by channel/status, RTM counters, credit debits by service.
-- p_month = any date inside the month.
CREATE OR REPLACE FUNCTION public.platform_tenant_usage(p_tenant_id UUID, p_month DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_from TIMESTAMPTZ := date_trunc('month', p_month::timestamp) AT TIME ZONE 'Asia/Kolkata';
  v_to   TIMESTAMPTZ := (date_trunc('month', p_month::timestamp) + INTERVAL '1 month') AT TIME ZONE 'Asia/Kolkata';
  v_deliveries JSONB := '[]';
  v_rtm        JSONB := '[]';
  v_credits    JSONB := '[]';
  v_granted    JSONB := '{}';
BEGIN
  IF to_regclass('public.customer_delivery_log') IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(x), '[]') INTO v_deliveries FROM (
      SELECT channel, status, count(*) AS count
      FROM public.customer_delivery_log
      WHERE tenant_id = p_tenant_id AND "timestamp" >= v_from AND "timestamp" < v_to
      GROUP BY channel, status ORDER BY channel, status) x;
  END IF;

  IF to_regclass('public.rtm_usage_daily') IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(x), '[]') INTO v_rtm FROM (
      SELECT channel, sum(sent) AS sent, sum(delivered) AS delivered, sum(failed) AS failed,
             sum(suppressed) AS suppressed
      FROM public.rtm_usage_daily
      WHERE tenant_id = p_tenant_id
        AND day >= date_trunc('month', p_month::timestamp)::date
        AND day <  (date_trunc('month', p_month::timestamp) + INTERVAL '1 month')::date
      GROUP BY channel ORDER BY channel) x;
  END IF;

  SELECT coalesce(jsonb_agg(x), '[]') INTO v_credits FROM (
    SELECT service, sum(-amount) AS credits, sum(quantity) AS quantity, count(*) AS entries
    FROM public.credit_ledger
    WHERE tenant_id = p_tenant_id AND entry_type = 'debit' AND created_at >= v_from AND created_at < v_to
    GROUP BY service ORDER BY service) x;

  SELECT jsonb_build_object(
      'topup_granted',     coalesce(sum(amount) FILTER (WHERE entry_type = 'grant' AND bucket = 'topup'), 0),
      'allowance_granted', coalesce(sum(amount) FILTER (WHERE entry_type IN ('grant', 'allowance_reset') AND bucket = 'allowance'), 0),
      'adjustments',       coalesce(sum(amount) FILTER (WHERE entry_type = 'adjustment'), 0))
    INTO v_granted
  FROM public.credit_ledger
  WHERE tenant_id = p_tenant_id AND created_at >= v_from AND created_at < v_to;

  RETURN jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'deliveries', v_deliveries,
    'realtime', v_rtm,
    'credit_debits', v_credits,
    'credit_movements', v_granted);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Lock everything down: service role only
-- -----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_admins', 'platform_audit_log', 'platform_tenant_accounts',
                           'credit_rate_card', 'credit_wallets', 'credit_ledger', 'platform_tenant_stats'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;
-- RLS on + no policies + privileges revoked = invisible to the public API.
-- service_role (edge functions) bypasses RLS; postgres (SQL editor) owns the tables.

REVOKE EXECUTE ON FUNCTION
  public.tg_block_mutation(),
  public.credit_adjust(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT),
  public.credit_set_plan(UUID, NUMERIC, NUMERIC),
  public.credit_reset_allowance(UUID, TEXT),
  public.credit_reset_all_allowances(),
  public.credit_debit(UUID, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, JSONB),
  public._platform_rel_bytes(REGCLASS),
  public.platform_refresh_tenant_stats(UUID),
  public.platform_tenant_usage(UUID, DATE)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.credit_adjust(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT),
  public.credit_set_plan(UUID, NUMERIC, NUMERIC),
  public.credit_reset_allowance(UUID, TEXT),
  public.credit_reset_all_allowances(),
  public.credit_debit(UUID, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, JSONB),
  public.platform_refresh_tenant_stats(UUID),
  public.platform_tenant_usage(UUID, DATE)
TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Optional schedules (only if pg_cron is installed)
--    Stats nightly 02:00 IST (20:30 UTC); allowance reset 1st of month 00:05 IST (18:35 UTC, last day).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('platform_tenant_stats_nightly', 'credit_allowance_reset');
    PERFORM cron.schedule('platform_tenant_stats_nightly', '30 20 * * *',
      'SELECT public.platform_refresh_tenant_stats(NULL)');
    -- Runs at 18:35 UTC daily but only acts when it is the 1st of the month in IST.
    PERFORM cron.schedule('credit_allowance_reset', '35 18 * * *',
      $job$SELECT public.credit_reset_all_allowances()
           WHERE extract(day FROM NOW() AT TIME ZONE 'Asia/Kolkata') = 1$job$);
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK (run manually only if you need to remove this feature entirely).
-- WARNING: drops the credits ledger and audit history. Export them first.
-- =============================================================================
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--     PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('platform_tenant_stats_nightly', 'credit_allowance_reset');
--   END IF;
-- END $$;
-- DROP FUNCTION IF EXISTS public.platform_tenant_usage(UUID, DATE);
-- DROP FUNCTION IF EXISTS public.platform_refresh_tenant_stats(UUID);
-- DROP FUNCTION IF EXISTS public._platform_rel_bytes(REGCLASS);
-- DROP FUNCTION IF EXISTS public.credit_debit(UUID, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, JSONB);
-- DROP FUNCTION IF EXISTS public.credit_reset_all_allowances();
-- DROP FUNCTION IF EXISTS public.credit_reset_allowance(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.credit_set_plan(UUID, NUMERIC, NUMERIC);
-- DROP FUNCTION IF EXISTS public.credit_adjust(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT);
-- DROP TABLE IF EXISTS public.platform_tenant_stats, public.credit_ledger, public.credit_wallets,
--   public.credit_rate_card, public.platform_tenant_accounts, public.platform_audit_log, public.platform_admins;
-- DROP FUNCTION IF EXISTS public.tg_block_mutation();
