-- =============================================================================
-- MARBEE — PART 74: FILE MANAGER (folders + file entries)
-- Server-side file management for the Files module
-- =============================================================================

-- 1. Folders table
CREATE TABLE IF NOT EXISTS public.file_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_path TEXT NOT NULL DEFAULT '/',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, path)
);

CREATE INDEX IF NOT EXISTS idx_file_folders_parent
  ON public.file_folders (tenant_id, environment, parent_path);

ALTER TABLE public.file_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "file_folders_tenant" ON public.file_folders;
CREATE POLICY "file_folders_tenant" ON public.file_folders FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

-- 2. File entries table (metadata for uploaded files)
CREATE TABLE IF NOT EXISTS public.file_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  folder TEXT NOT NULL DEFAULT '/',
  storage_path TEXT NOT NULL,
  public_url TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_file_entries_folder
  ON public.file_entries (tenant_id, environment, folder);

ALTER TABLE public.file_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "file_entries_tenant" ON public.file_entries;
CREATE POLICY "file_entries_tenant" ON public.file_entries FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

-- 3. Storage bucket for user files (the Files module)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('files', 'files', FALSE, 104857600)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "files_tenant_all" ON storage.objects;
CREATE POLICY "files_tenant_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'files')
  WITH CHECK (bucket_id = 'files');

-- 4. Seed system folders per tenant
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.file_folders (tenant_id, path, name, parent_path, is_system)
    VALUES
      (t.id, '/Documents',   'Documents',   '/', FALSE),
      (t.id, '/Images',      'Images',      '/', FALSE),
      (t.id, '/Videos',      'Videos',      '/', FALSE),
      (t.id, '/Archives',    'Archives',    '/', FALSE),
      (t.id, '/Workflows',   'Workflows',   '/', TRUE),
      (t.id, '/Workflows/File Arrival Sample Files', 'File Arrival Sample Files', '/Workflows', TRUE)
    ON CONFLICT (tenant_id, environment, path) DO NOTHING;
  END LOOP;
END $$;
