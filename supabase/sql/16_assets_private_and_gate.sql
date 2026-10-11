-- Published assets copy to cdn-public bucket (no edge function required)
-- Run in Supabase SQL Editor (safe to re-run)

-- Public CDN bucket for form banners & other always-public media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cdn-public',
  'cdn-public',
  TRUE,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cdn_public_read" ON storage.objects;
CREATE POLICY "cdn_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'cdn-public');

DROP POLICY IF EXISTS "cdn_public_auth_upload" ON storage.objects;
CREATE POLICY "cdn_public_auth_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cdn-public');

DROP POLICY IF EXISTS "cdn_public_auth_delete" ON storage.objects;
CREATE POLICY "cdn_public_auth_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cdn-public');

-- Asset library bucket: private (drafts not world-readable)
UPDATE storage.buckets SET public = FALSE WHERE id = 'assets';

DROP POLICY IF EXISTS "assets_public_read" ON storage.objects;

DROP POLICY IF EXISTS "assets_auth_read" ON storage.objects;
CREATE POLICY "assets_auth_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assets');

-- Clear broken asset-gate URLs — re-publish in app to get cdn-public URL
UPDATE public.assets
SET public_url = NULL
WHERE archived_at IS NULL
  AND public_url LIKE '%/functions/v1/asset-gate%';
