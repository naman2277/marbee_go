-- =============================================================================
-- MARBEE — 89: AI PROVIDER KEYS ARE SERVER-ONLY   (Phase 0 · SEC-07, D-018)
--
-- Before: Settings → AI Engine saved provider API keys in PLAIN TEXT in
-- ai_engine_providers.api_key_encrypted (name notwithstanding), every member of the
-- tenant could read them, and the browser called AI providers directly with them.
--
-- After:
--   • keys are sealed by the ai-gateway edge function (AES-256-GCM, MARBEE_SECRETS_KEY)
--   • app users can neither READ nor WRITE the api_key_encrypted column (column-level
--     privileges) — only the service role (edge functions) can
--   • api_key_last4 holds the last 4 characters for display ("…abcd")
--
-- Legacy plaintext keys keep working: the gateway / chatbot re-seal them on first use.
-- Safe to re-run. Run after 01–88. Rollback at the bottom.
-- =============================================================================

DO $$
DECLARE
  v_cols TEXT;
BEGIN
  IF to_regclass('public.ai_engine_providers') IS NULL THEN
    RAISE NOTICE '89: ai_engine_providers not found (script 49 not applied) — skipped';
    RETURN;
  END IF;

  ALTER TABLE public.ai_engine_providers ADD COLUMN IF NOT EXISTS api_key_last4 TEXT;

  -- Display hint for existing plaintext keys (sealed values are left alone).
  UPDATE public.ai_engine_providers
  SET api_key_last4 = right(trim(api_key_encrypted), 4)
  WHERE api_key_encrypted IS NOT NULL
    AND api_key_encrypted NOT LIKE 'mbs1.%'
    AND length(trim(api_key_encrypted)) > 8
    AND api_key_last4 IS NULL;

  -- Every column except the key, so future columns are covered automatically.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ai_engine_providers' AND column_name <> 'api_key_encrypted';

  -- Table-level grants would cover every column, so drop them and grant per column.
  EXECUTE 'REVOKE ALL ON public.ai_engine_providers FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.ai_engine_providers TO authenticated', v_cols);
  EXECUTE format('GRANT INSERT (%s) ON public.ai_engine_providers TO authenticated', v_cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.ai_engine_providers TO authenticated', v_cols);
  EXECUTE 'GRANT DELETE ON public.ai_engine_providers TO authenticated';
  EXECUTE 'GRANT ALL ON public.ai_engine_providers TO service_role';
END $$;

-- =============================================================================
-- ROLLBACK (manual — re-exposes keys to the browser; emergencies only)
-- =============================================================================
-- GRANT ALL ON public.ai_engine_providers TO authenticated;
