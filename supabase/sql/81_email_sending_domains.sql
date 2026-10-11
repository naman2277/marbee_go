-- =============================================================================
-- 81 · Marbee Mail — customer sending domains + sender addresses
--
-- Tenants verify their own domain against Marbee's Amazon SES account.
-- Rows in email_sending_domains are written ONLY by the `email-domains`
-- edge function (service role) — tenants can read their own rows via RLS.
-- email_senders are managed directly by tenant users (RLS + permission check),
-- but a trigger guarantees the from-address sits on a domain the tenant owns.
--
-- Run once after 01-80. Then (optional, for background re-checks):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/email-domains',
--                              'email_domains_url');
--   select vault.create_secret('<service-role-key>', 'email_domains_key');
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_sending_domains (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain             TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'partially_verified', 'verified', 'failed', 'degraded', 'suspended')),
  ses_region         TEXT NOT NULL,
  dkim_tokens        TEXT[] NOT NULL DEFAULT '{}',
  dkim_status        TEXT NOT NULL DEFAULT 'PENDING',
  mail_from_domain   TEXT,
  mail_from_status   TEXT NOT NULL DEFAULT 'PENDING',
  dmarc_found        BOOLEAN NOT NULL DEFAULT FALSE,
  dns_provider       TEXT,
  -- Last per-record DNS check: [{key, type, host, expected, found[], ok, hint}]
  records            JSONB NOT NULL DEFAULT '[]',
  last_checked_at    TIMESTAMPTZ,
  verified_at        TIMESTAMPTZ,
  warmup_started_at  TIMESTAMPTZ,
  failure_reason     TEXT,
  suspended_reason   TEXT,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A domain can belong to exactly one tenant platform-wide.
CREATE UNIQUE INDEX IF NOT EXISTS email_sending_domains_domain_uq
  ON public.email_sending_domains (lower(domain));
CREATE INDEX IF NOT EXISTS email_sending_domains_tenant_idx
  ON public.email_sending_domains (tenant_id);
CREATE INDEX IF NOT EXISTS email_sending_domains_recheck_idx
  ON public.email_sending_domains (status, last_checked_at);

DROP TRIGGER IF EXISTS email_sending_domains_updated_at ON public.email_sending_domains;
CREATE TRIGGER email_sending_domains_updated_at BEFORE UPDATE ON public.email_sending_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_sending_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_sending_domains_tenant_read" ON public.email_sending_domains;
CREATE POLICY "email_sending_domains_tenant_read" ON public.email_sending_domains FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT SELECT ON public.email_sending_domains TO authenticated;

-- -----------------------------------------------------------------------------
-- Sender addresses (From / Reply-To) on a verified domain
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_senders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain_id   UUID NOT NULL REFERENCES public.email_sending_domains(id) ON DELETE CASCADE,
  from_email  TEXT NOT NULL,
  from_name   TEXT NOT NULL DEFAULT '',
  reply_to    TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_senders_tenant_email_uq
  ON public.email_senders (tenant_id, lower(from_email));
CREATE UNIQUE INDEX IF NOT EXISTS email_senders_one_default_uq
  ON public.email_senders (tenant_id) WHERE is_default;

DROP TRIGGER IF EXISTS email_senders_updated_at ON public.email_senders;
CREATE TRIGGER email_senders_updated_at BEFORE UPDATE ON public.email_senders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.email_senders_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_domain public.email_sending_domains%ROWTYPE;
BEGIN
  NEW.from_email := lower(trim(NEW.from_email));
  NEW.from_name  := trim(coalesce(NEW.from_name, ''));
  NEW.reply_to   := nullif(lower(trim(coalesce(NEW.reply_to, ''))), '');

  IF NEW.from_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid from address: %', NEW.from_email;
  END IF;
  IF NEW.reply_to IS NOT NULL AND NEW.reply_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid reply-to address: %', NEW.reply_to;
  END IF;

  SELECT * INTO v_domain FROM public.email_sending_domains WHERE id = NEW.domain_id;
  IF NOT FOUND OR v_domain.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Sending domain not found for this workspace';
  END IF;
  IF split_part(NEW.from_email, '@', 2) <> lower(v_domain.domain) THEN
    RAISE EXCEPTION 'From address must end with @%', v_domain.domain;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_senders_validate ON public.email_senders;
CREATE TRIGGER email_senders_validate BEFORE INSERT OR UPDATE ON public.email_senders
  FOR EACH ROW EXECUTE FUNCTION public.email_senders_validate();

ALTER TABLE public.email_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_senders_tenant_read" ON public.email_senders;
CREATE POLICY "email_senders_tenant_read" ON public.email_senders FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

DROP POLICY IF EXISTS "email_senders_tenant_write" ON public.email_senders;
CREATE POLICY "email_senders_tenant_write" ON public.email_senders FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    AND (public.user_has_permission(tenant_id, 'settings.channels.manage')
         OR public.user_has_permission(tenant_id, 'settings.manage'))
  )
  WITH CHECK (
    tenant_id IN (SELECT public.user_tenant_ids())
    AND (public.user_has_permission(tenant_id, 'settings.channels.manage')
         OR public.user_has_permission(tenant_id, 'settings.manage'))
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_senders TO authenticated;

-- -----------------------------------------------------------------------------
-- Send-time helpers (used by the email send worker)
-- -----------------------------------------------------------------------------

-- New-domain warm-up: 2,000/day on day 0, doubling daily, uncapped after 14 days.
CREATE OR REPLACE FUNCTION public.email_domain_daily_cap(p_domain_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN d.warmup_started_at IS NULL THEN 0
    WHEN now() - d.warmup_started_at >= interval '14 days' THEN NULL
    ELSE LEAST(2000 * power(2, floor(extract(epoch FROM now() - d.warmup_started_at) / 86400))::int, 2000000)
  END
  FROM public.email_sending_domains d
  WHERE d.id = p_domain_id;
$$;

-- Returns the domain row a tenant may send `p_from_email` through, or nothing.
CREATE OR REPLACE FUNCTION public.email_sendable_domain(p_tenant_id UUID, p_from_email TEXT)
RETURNS SETOF public.email_sending_domains
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.*
  FROM public.email_sending_domains d
  WHERE d.tenant_id = p_tenant_id
    AND lower(d.domain) = lower(split_part(p_from_email, '@', 2))
    AND d.status IN ('verified', 'partially_verified')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.email_domain_daily_cap(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_sendable_domain(UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- Background re-check: pending domains every 10 min, verified ones daily.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_domains_recheck_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, vault
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'vault not available — skipping email domain re-check';
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'email_domains_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'email_domains_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'email_domains_url / email_domains_key not set in Vault, skipping';
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.email_sending_domains
    WHERE (status IN ('pending', 'partially_verified')
           AND (last_checked_at IS NULL OR last_checked_at < now() - interval '10 minutes'))
       OR (status IN ('verified', 'degraded')
           AND (last_checked_at IS NULL OR last_checked_at < now() - interval '24 hours'))
  ) THEN
    RETURN 0;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object('action', 'cron_recheck')
  );
  RETURN 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_domains_recheck_tick() TO service_role;

DO $do$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron not installed — schedule email_domains_recheck_tick() manually';
    RETURN;
  END IF;
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'marbee_email_domains_recheck';
  PERFORM cron.schedule('marbee_email_domains_recheck', '*/10 * * * *',
    $job$SELECT public.email_domains_recheck_tick();$job$);
END
$do$;
