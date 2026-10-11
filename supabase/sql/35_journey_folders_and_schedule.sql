-- Folders and schedule dates for campaigns & journeys
-- Run in Supabase SQL Editor (safe to re-run)

CREATE TABLE IF NOT EXISTS public.journey_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_path TEXT NOT NULL DEFAULT '/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, path)
);

CREATE INDEX IF NOT EXISTS idx_journey_folders_parent
  ON public.journey_folders (tenant_id, environment, parent_path);

ALTER TABLE public.journey_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journey_folders_tenant" ON public.journey_folders;
CREATE POLICY "journey_folders_tenant" ON public.journey_folders FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

ALTER TABLE public.journeys
  ADD COLUMN IF NOT EXISTS folder_path TEXT NOT NULL DEFAULT '/';

ALTER TABLE public.journeys
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;

ALTER TABLE public.journeys
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_journeys_folder
  ON public.journeys (tenant_id, environment, folder_path);
