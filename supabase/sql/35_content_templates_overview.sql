-- =============================================================================
-- MARBEE — Content templates: reporting indexes + flattened overview view
-- Run AFTER 33_content_templates.sql and 34_content_templates_channels.sql
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Indexes for the list-page filters (channel + status)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_content_templates_channel
  ON public.content_templates (tenant_id, environment, channel);

CREATE INDEX IF NOT EXISTS idx_content_templates_status
  ON public.content_templates (tenant_id, environment, status);

-- ---------------------------------------------------------------------------
-- 2. content_templates_overview — one flat row per template.
--    Pulls the important bits out of the content / settings JSONB so the
--    table is actually browsable and reportable. security_invoker keeps the
--    base table's tenant RLS in force for whoever queries the view.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.content_templates_overview
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.tenant_id,
  t.environment,
  t.name,
  t.slug,
  t.channel,

  -- Unified lifecycle status (legacy 'test_sent' rows fold into 'in_review')
  CASE
    WHEN t.status = 'test_sent'                       THEN 'in_review'
    WHEN t.status IN ('in_review','approved','published') THEN t.status
    ELSE 'draft'
  END                                                          AS status,
  CASE
    WHEN t.status = 'test_sent'                       THEN 'In review'
    WHEN t.status = 'in_review'                       THEN 'In review'
    WHEN t.status = 'approved'                        THEN 'Approved'
    WHEN t.status = 'published'                       THEN 'Published'
    ELSE 'Draft'
  END                                                          AS status_label,
  (t.status = 'published')                                     AS is_published,

  -- Sender / delivery config (from settings JSONB)
  COALESCE(t.settings ->> 'from_name', t.settings ->> 'sender_id')   AS sender,
  t.settings ->> 'sender_id'                                   AS sender_id,
  t.settings ->> 'from_email'                                  AS from_email,
  t.settings ->> 'reply_to'                                    AS reply_to,
  t.settings ->> 'provider_account_id'                         AS provider_account_id,
  t.settings ->> 'tag'                                         AS tag,
  t.settings ->> 'description'                                 AS description,

  -- Human-readable content preview per channel
  CASE t.channel
    WHEN 'email'    THEN NULLIF(t.content ->> 'subject', '')
    WHEN 'sms'      THEN LEFT(COALESCE(t.content ->> 'message', ''), 140)
    WHEN 'whatsapp' THEN LEFT(COALESCE(t.content ->> 'body', ''), 140)
    WHEN 'web_push' THEN NULLIF(t.content ->> 'title', '')
    WHEN 'rcs'      THEN COALESCE(NULLIF(t.content ->> 'title', ''), LEFT(COALESCE(t.content ->> 'description', ''), 140))
    ELSE NULL
  END                                                          AS content_preview,

  -- Rough body size (chars) for the primary text field of the channel
  CASE t.channel
    WHEN 'email'    THEN LENGTH(COALESCE(t.content ->> 'subject', ''))
    WHEN 'sms'      THEN LENGTH(COALESCE(t.content ->> 'message', ''))
    WHEN 'whatsapp' THEN LENGTH(COALESCE(t.content ->> 'body', ''))
    WHEN 'web_push' THEN LENGTH(COALESCE(t.content ->> 'body', ''))
    WHEN 'rcs'      THEN LENGTH(COALESCE(t.content ->> 'description', ''))
    ELSE 0
  END                                                          AS body_length,

  -- Number of {{ merge tags }} referenced anywhere in the content JSON
  (
    SELECT COUNT(*)::int
    FROM regexp_matches(t.content::text, '\{\{[^}]+\}\}', 'g')
  )                                                            AS variable_count,

  -- Email-only: which output versions are enabled
  CASE
    WHEN t.channel <> 'email' THEN NULL
    WHEN jsonb_typeof(t.content -> 'enabled_versions') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(t.content -> 'enabled_versions'))
    ELSE ARRAY['html','amp','text']
  END                                                          AS enabled_versions,

  t.library_template_id,
  (t.settings -> 'provider_approval') IS NOT NULL              AS has_provider_approval,

  -- Registered provider template id (DLT for SMS, Meta for WhatsApp, SP for RCS)
  CASE t.channel
    WHEN 'sms'      THEN t.settings -> 'provider_approval' -> 'sms_dlt'      ->> 'dlt_template_id'
    WHEN 'whatsapp' THEN t.settings -> 'provider_approval' -> 'whatsapp_meta' ->> 'meta_template_id'
    WHEN 'rcs'      THEN t.settings -> 'provider_approval' -> 'rcs_provider'  ->> 'template_id'
    ELSE NULL
  END                                                          AS provider_template_id,
  CASE t.channel
    WHEN 'sms'      THEN t.settings -> 'provider_approval' -> 'sms_dlt'      ->> 'status'
    WHEN 'whatsapp' THEN t.settings -> 'provider_approval' -> 'whatsapp_meta' ->> 'status'
    WHEN 'rcs'      THEN t.settings -> 'provider_approval' -> 'rcs_provider'  ->> 'status'
    ELSE NULL
  END                                                          AS provider_approval_status,
  t.created_at,
  t.updated_at,
  (NOW() - t.updated_at)                                       AS since_updated
FROM public.content_templates t;

GRANT SELECT ON public.content_templates_overview TO authenticated;

COMMENT ON VIEW public.content_templates_overview IS
  'Flattened, tenant-scoped view of content_templates: lifecycle status, sender/BYOP config, per-channel content preview, body size and merge-tag count.';
