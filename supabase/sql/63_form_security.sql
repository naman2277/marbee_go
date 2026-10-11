-- -----------------------------------------------------------------------------
-- 63_form_security.sql
-- Server-side anti-abuse state for form submissions: rate-limit / duplicate
-- attempt log, and single-use challenge nonces for replay protection.
--
-- Run after 62_global_variables.sql
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Attempt log — powers rate limiting and duplicate suppression
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.form_submission_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',

  -- Best-effort client address from the proxy headers
  ip TEXT NOT NULL DEFAULT 'unknown',

  -- SHA-256 of the canonicalized payload, for duplicate detection
  fingerprint TEXT NOT NULL,

  -- Injection signatures matched on this payload, when scanning is set to flag
  flagged JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rate-limit lookups: form + ip within a time window
CREATE INDEX IF NOT EXISTS idx_form_attempts_rate
  ON public.form_submission_attempts (form_id, ip, created_at DESC);

-- Duplicate lookups: form + fingerprint within a time window
CREATE INDEX IF NOT EXISTS idx_form_attempts_dupe
  ON public.form_submission_attempts (form_id, fingerprint, created_at DESC);

-- Surfacing flagged traffic in the dashboard
CREATE INDEX IF NOT EXISTS idx_form_attempts_flagged
  ON public.form_submission_attempts (tenant_id, environment, created_at DESC)
  WHERE flagged IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Challenge nonces — each issued challenge may be redeemed exactly once
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.form_challenge_nonces (
  nonce TEXT PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The PRIMARY KEY is what makes redemption single-use: the edge function
-- INSERTs the nonce and treats a unique violation as "already used".

CREATE INDEX IF NOT EXISTS idx_form_nonces_expiry
  ON public.form_challenge_nonces (expires_at);

-- -----------------------------------------------------------------------------
-- Row level security
--
-- Both tables are written only by the edge function via the service role, which
-- bypasses RLS. Tenant members get read access so the product can show abuse
-- analytics; nobody gets client-side write access.
-- -----------------------------------------------------------------------------

ALTER TABLE public.form_submission_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_attempts_member_read ON public.form_submission_attempts;
CREATE POLICY form_attempts_member_read ON public.form_submission_attempts
  FOR SELECT
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

ALTER TABLE public.form_challenge_nonces ENABLE ROW LEVEL SECURITY;
-- No policies: the service role is the only writer and reader.

-- -----------------------------------------------------------------------------
-- Housekeeping — these tables are append-only and grow with traffic
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_form_security_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Attempts are only consulted inside a 24h window; keep 7 days for analytics.
  DELETE FROM public.form_submission_attempts
  WHERE created_at < NOW() - INTERVAL '7 days';

  -- A nonce past its expiry can no longer be redeemed, so the row is dead weight.
  DELETE FROM public.form_challenge_nonces
  WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- Schedule hourly if pg_cron is available (it is in the v2 layer).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('prune-form-security')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-form-security');

    PERFORM cron.schedule(
      'prune-form-security',
      '17 * * * *',
      $cron$SELECT public.prune_form_security_state();$cron$
    );
  END IF;
END;
$$;
