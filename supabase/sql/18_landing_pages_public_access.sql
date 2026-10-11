-- Public read for published landing pages (embed + direct link)
-- Run in Supabase SQL Editor (safe to re-run)

DROP POLICY IF EXISTS "landing_pages_public_read" ON public.landing_pages;
CREATE POLICY "landing_pages_public_read" ON public.landing_pages
  FOR SELECT
  USING (status = 'published');

GRANT SELECT ON public.landing_pages TO anon;
