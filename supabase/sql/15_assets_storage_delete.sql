-- Allow authenticated users to delete objects from the assets bucket
-- Run in Supabase SQL Editor (safe to re-run)

DROP POLICY IF EXISTS "assets_tenant_delete" ON storage.objects;
CREATE POLICY "assets_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'assets');
