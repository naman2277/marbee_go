-- =============================================================================
-- DEV ONLY — resolve duplicate customer emails so script 46's unique index (and script 92's
-- case-insensitive emails, TD-17) can be applied. Duplicates are matched IGNORING case and
-- surrounding spaces ("A@x.com" = "a@x.com ").
--
-- NEVER run on production. Production data must be merged deliberately (identity
-- resolution), not by this tool.
--
-- What it does (reversible — nothing is deleted):
--   • For each (tenant, environment, lower(trim(email))) with more than one customer, KEEP the
--     oldest profile (earliest created_at, then lowest id).
--   • On every other copy, back up the email into public._dev_dedupe_backup_20261120,
--     then set that copy's email to NULL.
--
-- Step 1 below is a read-only preview. Step 2 makes the change in one transaction.
-- Undo block at the bottom restores every email from the backup table.
-- =============================================================================

-- ── Step 1 · Preview (read-only) ─────────────────────────────────────────────
SELECT tenant_id, environment, lower(btrim(email)) AS email, count(*) AS copies
FROM public.customers
WHERE nullif(btrim(email), '') IS NOT NULL
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY copies DESC, email
LIMIT 50;

-- ── Step 2 · Resolve (one transaction) ───────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS public._dev_dedupe_backup_20261120 (
  customer_id UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  environment TEXT NOT NULL,
  email       TEXT NOT NULL,
  kept_id     UUID NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public._dev_dedupe_backup_20261120 ENABLE ROW LEVEL SECURITY;  -- no policies: invisible to the API
REVOKE ALL ON public._dev_dedupe_backup_20261120 FROM PUBLIC, anon, authenticated;

WITH ranked AS (
  SELECT id, tenant_id, environment, email,
         first_value(id) OVER w AS kept_id,
         row_number()    OVER w AS rn
  FROM public.customers
  WHERE nullif(btrim(email), '') IS NOT NULL
  WINDOW w AS (PARTITION BY tenant_id, environment, lower(btrim(email)) ORDER BY created_at, id)
)
INSERT INTO public._dev_dedupe_backup_20261120 (customer_id, tenant_id, environment, email, kept_id)
SELECT id, tenant_id, environment, email, kept_id FROM ranked WHERE rn > 1
ON CONFLICT (customer_id) DO NOTHING;

UPDATE public.customers c
SET email = NULL
FROM public._dev_dedupe_backup_20261120 b
WHERE c.id = b.customer_id AND c.email = b.email;

-- Report
SELECT count(*) AS copies_resolved FROM public._dev_dedupe_backup_20261120;

COMMIT;

-- ── Undo (run only if you need the duplicates back; drop script 46's index and 92's rules first) ──
-- DROP INDEX IF EXISTS public.idx_customers_tenant_env_email_unique;
-- UPDATE public.customers c SET email = b.email
--   FROM public._dev_dedupe_backup_20261120 b WHERE c.id = b.customer_id AND c.email IS NULL;
-- DROP TABLE public._dev_dedupe_backup_20261120;
