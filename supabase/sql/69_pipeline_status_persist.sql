-- =============================================================================
-- Pipeline live status persistence
-- Adds pipeline_status column so running/paused state survives page reloads.
-- Run AFTER 60_pipeline_execution_model.sql. Safe to re-run.
-- =============================================================================

ALTER TABLE public.data_jobs
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (pipeline_status IN ('draft','started','paused','finished'));
