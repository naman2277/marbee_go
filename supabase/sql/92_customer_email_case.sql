-- =============================================================================
-- 92 — Customer emails are case-insensitive   (Phase 0 · TD-17)
--
-- Problem: the unique key is (tenant_id, environment, email) and compares emails
-- exactly, so "Priya@Shop.in" and "priya@shop.in" became two customers. Imports,
-- forms, the API and the engine all write customers, each with its own code.
--
-- Fix, in the database so every write path is covered at once:
--   1. A BEFORE INSERT/UPDATE trigger stores every customer email as lower(trim(email));
--      an empty email becomes NULL. Runs before ON CONFLICT, so upserts match too.
--   2. Existing emails are normalised the same way — but only if that creates no
--      duplicates. If it would, the script stops and names the dev tool to resolve
--      them (production data must be merged deliberately, never automatically).
--   3. A CHECK constraint guarantees no mixed-case email can ever be stored, even if
--      the trigger were disabled.
-- The unique index stays on the plain `email` column on purpose: PostgREST upserts
-- (onConflict: tenant_id,environment,email) can only target a plain-column index.
--
-- Order: run after 01–91. Safe to re-run. Rollback: bottom of file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Refuse to run while normalising would merge two customers
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_groups INT; v_example TEXT;
BEGIN
  SELECT count(*), min(e) INTO v_groups, v_example
  FROM (SELECT tenant_id, environment, lower(btrim(email)) AS e
        FROM public.customers
        WHERE nullif(btrim(email), '') IS NOT NULL
        GROUP BY 1, 2, 3 HAVING count(*) > 1) d;
  IF v_groups > 0 THEN
    RAISE EXCEPTION '% customer email(s) differ only by upper/lower case within a workspace (e.g. %). Resolve them first — on dev, run supabase/sql/tools/dev_dedupe_customer_emails.sql — then re-run 92. Nothing was changed.',
      v_groups, v_example;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Normalise on every write
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_customers_normalize_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := nullif(lower(btrim(NEW.email)), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_normalize_email ON public.customers;
CREATE TRIGGER customers_normalize_email
  BEFORE INSERT OR UPDATE OF email ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_customers_normalize_email();

-- -----------------------------------------------------------------------------
-- 3. Normalise existing rows (only rows that actually change are touched)
-- -----------------------------------------------------------------------------
UPDATE public.customers
SET email = nullif(lower(btrim(email)), '')
WHERE email IS NOT NULL AND email IS DISTINCT FROM nullif(lower(btrim(email)), '');

-- -----------------------------------------------------------------------------
-- 4. Guarantee: no mixed-case or padded email can be stored
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_email_normalized;
ALTER TABLE public.customers ADD CONSTRAINT customers_email_normalized
  CHECK (email IS NULL OR (email = lower(btrim(email)) AND email <> ''));

-- =============================================================================
-- Verify (expected: 0, then 0):
--   SELECT count(*) FROM public.customers WHERE email IS NOT NULL AND email <> lower(btrim(email));
--   SELECT count(*) FROM (SELECT tenant_id, environment, email FROM public.customers
--     WHERE email IS NOT NULL GROUP BY 1,2,3 HAVING count(*) > 1) d;
--
-- Rollback (emails stay lower-case — that is harmless; this only removes the rules):
--   ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_email_normalized;
--   DROP TRIGGER IF EXISTS customers_normalize_email ON public.customers;
--   DROP FUNCTION IF EXISTS public.tg_customers_normalize_email();
-- =============================================================================
