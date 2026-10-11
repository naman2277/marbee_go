-- Virtual folders for Asset Library (empty folders without assets)
-- Run in Supabase SQL Editor (safe to re-run)

CREATE TABLE IF NOT EXISTS public.asset_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_path TEXT NOT NULL DEFAULT '/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, path)
);

CREATE INDEX IF NOT EXISTS idx_asset_folders_parent
  ON public.asset_folders (tenant_id, environment, parent_path);

ALTER TABLE public.asset_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_folders_tenant" ON public.asset_folders;
CREATE POLICY "asset_folders_tenant" ON public.asset_folders FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));
