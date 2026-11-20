-- =============================================================================
-- MARBEE — 87: ALIGN WEB ANALYTICS TABLES WITH THE CODE   (TD-19, found 2026-11-20)
--
-- The web-analytics-ingest edge function and the app's analytics screens were built
-- against the richer table design in the stale supabase/migrations/ folder, but the
-- live scripts (sql/50) create an older, smaller design. Result: every analytics
-- insert failed ("column region does not exist" + 14 missing session columns + NULLs
-- in NOT NULL columns) and the function swallowed the error — so web analytics has
-- never stored data in any environment.
--
-- Purely ADDITIVE: adds the missing columns (types/defaults copied from
-- migrations/20260824000001_web_analytics_sessions.sql) and relaxes NOT NULL on
-- columns geolocation can't always fill. No data changed or removed. Safe to re-run.
-- Run after 50 (and 86). Rollback at the bottom.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.web_analytics_events') IS NULL OR to_regclass('public.web_analytics_sessions') IS NULL THEN
    RAISE NOTICE '87: web analytics tables not found — run 50 first, then re-run 87';
    RETURN;
  END IF;

  -- ── Events ──────────────────────────────────────────────────────────────────
  ALTER TABLE public.web_analytics_events ADD COLUMN IF NOT EXISTS region TEXT;
  ALTER TABLE public.web_analytics_events ALTER COLUMN ip_hash      DROP NOT NULL;  -- no IP behind some proxies
  ALTER TABLE public.web_analytics_events ALTER COLUMN country_code DROP NOT NULL;  -- geo lookup can fail
  ALTER TABLE public.web_analytics_events ALTER COLUMN country_name DROP NOT NULL;

  -- ── Sessions ────────────────────────────────────────────────────────────────
  ALTER TABLE public.web_analytics_sessions
    ADD COLUMN IF NOT EXISTS duration_sec      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS active_time_sec   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS page_count        INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS pages_visited     TEXT[]  DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS max_scroll_depth  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS click_count       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rage_click_count  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS form_submit_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS js_error_count    INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS converted         BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS country_name      TEXT,
    ADD COLUMN IF NOT EXISTS city              TEXT,
    ADD COLUMN IF NOT EXISTS region            TEXT,
    ADD COLUMN IF NOT EXISTS landing_page      TEXT,
    ADD COLUMN IF NOT EXISTS is_bot            BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE public.web_analytics_sessions ALTER COLUMN country_code DROP NOT NULL;
END $$;

-- =============================================================================
-- ROLLBACK (manual; drops the added columns and any data stored in them)
-- =============================================================================
-- ALTER TABLE public.web_analytics_events DROP COLUMN IF EXISTS region;
-- ALTER TABLE public.web_analytics_sessions
--   DROP COLUMN IF EXISTS duration_sec, DROP COLUMN IF EXISTS active_time_sec, DROP COLUMN IF EXISTS page_count,
--   DROP COLUMN IF EXISTS pages_visited, DROP COLUMN IF EXISTS max_scroll_depth, DROP COLUMN IF EXISTS click_count,
--   DROP COLUMN IF EXISTS rage_click_count, DROP COLUMN IF EXISTS form_submit_count, DROP COLUMN IF EXISTS js_error_count,
--   DROP COLUMN IF EXISTS converted, DROP COLUMN IF EXISTS country_name, DROP COLUMN IF EXISTS city,
--   DROP COLUMN IF EXISTS region, DROP COLUMN IF EXISTS landing_page, DROP COLUMN IF EXISTS is_bot;
