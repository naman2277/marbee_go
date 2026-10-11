-- =============================================================================
-- MARBEE — Audience auto-refresh + scheduler + refresh logs
-- Run AFTER 25_audiences.sql (safe to re-run)
-- =============================================================================

ALTER TABLE public.audiences
  ADD COLUMN IF NOT EXISTS auto_refresh BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refresh_cron TEXT,
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.audience_refresh_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id UUID NOT NULL REFERENCES public.audiences(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 0,
  previous_count INTEGER,
  status TEXT NOT NULL DEFAULT 'completed',
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audience_refresh_logs ON public.audience_refresh_logs (audience_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audiences_auto_refresh ON public.audiences (auto_refresh, refresh_cron)
  WHERE auto_refresh = TRUE;

ALTER TABLE public.audience_refresh_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audience_refresh_logs_tenant_access" ON public.audience_refresh_logs;
CREATE POLICY "audience_refresh_logs_tenant_access" ON public.audience_refresh_logs FOR ALL
  USING (audience_id IN (
    SELECT id FROM public.audiences WHERE tenant_id IN (SELECT public.user_tenant_ids())
  ));

GRANT ALL ON public.audience_refresh_logs TO authenticated;

-- Enable hourly refresh on demo active-customers cohort
UPDATE public.audiences
SET auto_refresh = TRUE, refresh_cron = '0 * * * *'
WHERE slug = 'active-customers'
  AND tenant_id = '00000000-0000-0000-0000-000000000001';
