-- =============================================================================
-- MARBEE — Campaign ↔ Pipeline association
-- Campaigns (journeys rows with settings.journey_type = 'campaign') are the
-- business container; Pipelines (data_jobs) stay the execution layer. A pipeline
-- belongs to at most one campaign.
--
-- Run AFTER 01–81. Safe to re-run.
-- =============================================================================

ALTER TABLE public.data_jobs
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.journeys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_data_jobs_campaign
  ON public.data_jobs (campaign_id)
  WHERE campaign_id IS NOT NULL;

-- Campaign-level engagement lookups (dashboard KPIs, reports)
CREATE INDEX IF NOT EXISTS idx_engagement_campaign
  ON public.engagement_log (campaign_id, timestamp DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_engagement_journey
  ON public.engagement_log (journey_id, timestamp DESC)
  WHERE journey_id IS NOT NULL;
