-- Public read + submit for published forms (iframe embed)
-- Run in Supabase SQL Editor (safe to re-run)

DROP POLICY IF EXISTS "forms_public_read" ON public.forms;
CREATE POLICY "forms_public_read" ON public.forms
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "form_submissions_public_insert" ON public.form_submissions;
CREATE POLICY "form_submissions_public_insert" ON public.form_submissions
  FOR INSERT
  WITH CHECK (
    form_id IN (SELECT id FROM public.forms WHERE status = 'published')
  );

GRANT SELECT ON public.forms TO anon;
GRANT INSERT ON public.form_submissions TO anon;
