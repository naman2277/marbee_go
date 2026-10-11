-- =============================================================================
-- MARBEE — Extend content_templates channels (WhatsApp, RCS)
-- Run AFTER 33_content_templates.sql (safe to re-run)
-- =============================================================================

ALTER TABLE public.content_templates DROP CONSTRAINT IF EXISTS content_templates_channel_check;
ALTER TABLE public.content_templates ADD CONSTRAINT content_templates_channel_check
  CHECK (channel IN ('email', 'sms', 'web_push', 'whatsapp', 'rcs'));
