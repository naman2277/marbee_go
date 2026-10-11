-- =============================================================================
-- MARBEE — Fix ai_engine_providers to match the app's actual provider/status
-- vocabulary. Settings → AI Engine and the Chat Bot LLM Configuration tab both
-- read/write this table; the original CHECK constraints (from
-- 49_coupons_and_ai_engine.sql) only allowed a subset of what the UI offers,
-- so saving "groq"/"jev" providers or "error"/"unverified" statuses failed
-- silently. Additive; safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.ai_engine_providers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%provider%openai%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_engine_providers DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.ai_engine_providers
    ADD CONSTRAINT ai_engine_providers_provider_check
    CHECK (provider IN ('openai', 'gemini', 'claude', 'grok', 'deepseek', 'groq', 'openrouter', 'jev', 'custom_llm'));
END $$;

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.ai_engine_providers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%connected%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_engine_providers DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.ai_engine_providers
    ADD CONSTRAINT ai_engine_providers_status_check
    CHECK (status IN ('connected', 'unconfigured', 'testing', 'error', 'unverified'));
END $$;

-- The table had no RLS/grants at all in 49_coupons_and_ai_engine.sql — lock it
-- down to tenant members like every other tenant-scoped table in this schema.
ALTER TABLE public.ai_engine_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_engine_providers_tenant_access" ON public.ai_engine_providers;
CREATE POLICY "ai_engine_providers_tenant_access" ON public.ai_engine_providers FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.ai_engine_providers TO authenticated;
