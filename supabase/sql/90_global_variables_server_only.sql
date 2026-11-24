-- =============================================================================
-- MARBEE — 90: GLOBAL VARIABLE VALUES ARE SERVER-ONLY   (Phase 0 · SEC-05, D-019)
--
-- Before: secret / encryption-key values were sealed IN THE BROWSER with a master key
-- kept in one admin's localStorage (lost if cleared; useless to the server), and any
-- tenant member could read the value column.
--
-- After: the global-variables edge function seals values with MARBEE_SECRETS_KEY and
-- generates encryption keys server-side. App users can't read or write the `value`
-- column at all; they list variables through the function (plain values returned,
-- secrets never). Metadata (name, kind, scopes, fingerprint…) stays readable by members
-- so existing screens and RLS policies keep working.
--
-- Safe to re-run. Run after 62. Rollback at the bottom.
-- =============================================================================

DO $$
DECLARE
  v_cols TEXT;
BEGIN
  IF to_regclass('public.global_variables') IS NULL THEN
    RAISE NOTICE '90: global_variables not found (script 62 not applied) — skipped';
    RETURN;
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'global_variables' AND column_name <> 'value';

  EXECUTE 'REVOKE ALL ON public.global_variables FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.global_variables TO authenticated', v_cols);
  -- Writes go through the edge function only (it validates, seals and audits).
  EXECUTE 'GRANT ALL ON public.global_variables TO service_role';
END $$;

-- =============================================================================
-- ROLLBACK (manual — re-exposes values to the browser; emergencies only)
-- =============================================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_variables TO authenticated;
