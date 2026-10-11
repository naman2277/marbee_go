-- =============================================================================
-- MARBEE — PART 4: STORAGE BUCKETS (optional)
-- Run after schema + seed if you want asset uploads
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('assets', 'assets', TRUE, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'application/pdf']),
  ('form-uploads', 'form-uploads', FALSE, 10485760, NULL),
  ('landing-pages', 'landing-pages', TRUE, 5242880, ARRAY['text/html', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload to their tenant folder
CREATE POLICY "assets_tenant_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets');

CREATE POLICY "assets_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'assets');

CREATE POLICY "form_uploads_auth" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'form-uploads');

CREATE POLICY "landing_pages_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-pages');

CREATE POLICY "landing_pages_auth_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-pages');
