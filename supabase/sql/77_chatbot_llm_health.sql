-- =============================================================================
-- MARBEE — Chat Bot LLM health tracking
-- Lets the runtime record the last LLM error / success per bot so the admin UI
-- can surface provider problems (bad key, expired credits, rate/daily limit,
-- timeouts) in the LLM Configuration tab and as an alert on the bot tile.
-- Additive; safe to re-run. Run after 75_chatbot_module.sql.
-- =============================================================================

ALTER TABLE public.mb_chatbots
  ADD COLUMN IF NOT EXISTS llm_last_error TEXT,
  ADD COLUMN IF NOT EXISTS llm_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS llm_last_success_at TIMESTAMPTZ;
