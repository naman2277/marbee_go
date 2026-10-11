-- =============================================================================
-- MARBEE — Content templates (email, SMS, web push)
-- Run AFTER 01_marbee_schema.sql (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.content_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'web_push', 'whatsapp', 'rcs')),
  content JSONB NOT NULL DEFAULT '{}'::JSONB,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  library_template_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment, slug)
);

CREATE INDEX IF NOT EXISTS idx_content_templates_tenant
  ON public.content_templates (tenant_id, environment, updated_at DESC);

ALTER TABLE public.content_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_templates_tenant_access" ON public.content_templates;
CREATE POLICY "content_templates_tenant_access" ON public.content_templates FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.content_templates TO authenticated;

DROP TRIGGER IF EXISTS content_templates_updated_at ON public.content_templates;
CREATE TRIGGER content_templates_updated_at
  BEFORE UPDATE ON public.content_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
