-- =============================================================================
-- MARBEE — Offers: widen channel / placement surfaces
-- Run AFTER 47_loyalty_offers.sql. Safe to re-run.
--
-- Adds website / landing page / PWA / form surfaces so an offer can be placed
-- anywhere Marbee renders content, alongside the existing messaging channels.
--
-- Existing rows are normalised FIRST (legacy values such as channel='all' were
-- written by an old UI default and violate even the original constraint), then
-- the widened CHECKs are applied.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop the old constraints so we can clean the data underneath them
-- ---------------------------------------------------------------------------
ALTER TABLE public.loyalty_offers DROP CONSTRAINT IF EXISTS loyalty_offers_channel_check;
ALTER TABLE public.loyalty_offers DROP CONSTRAINT IF EXISTS loyalty_offers_placement_check;

-- ---------------------------------------------------------------------------
-- 1. Report + normalise legacy values
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad_channels   TEXT;
  bad_placements TEXT;
BEGIN
  SELECT string_agg(DISTINCT COALESCE(channel, '<null>'), ', ')
    INTO bad_channels
    FROM public.loyalty_offers
   WHERE channel IS NULL OR channel NOT IN (
     'any','web','app','email','sms','whatsapp','pos','journey',
     'website','landing_page','pwa','form','push','rcs','in_app');

  SELECT string_agg(DISTINCT COALESCE(placement, '<null>'), ', ')
    INTO bad_placements
    FROM public.loyalty_offers
   WHERE placement IS NULL OR placement NOT IN (
     'any','homepage','checkout','cart','email','journey','push','in_app',
     'website_banner','product_page','category_page','popup','exit_intent',
     'landing_page_hero','landing_page_inline','pwa_home','pwa_inbox',
     'form_thankyou','form_inline','sms','whatsapp','rcs');

  IF bad_channels IS NOT NULL THEN
    RAISE NOTICE 'Normalising unsupported channel values: %', bad_channels;
  END IF;
  IF bad_placements IS NOT NULL THEN
    RAISE NOTICE 'Normalising unsupported placement values: %', bad_placements;
  END IF;
END $$;

-- Known legacy aliases → supported values
UPDATE public.loyalty_offers SET channel = 'any'          WHERE channel IN ('all', 'omni', 'omnichannel');
UPDATE public.loyalty_offers SET channel = 'website'      WHERE channel IN ('site', 'web_site');
UPDATE public.loyalty_offers SET channel = 'pwa'          WHERE channel IN ('mobile', 'mobile_app');
UPDATE public.loyalty_offers SET channel = 'push'         WHERE channel IN ('web_push', 'webpush');

UPDATE public.loyalty_offers SET placement = 'any'        WHERE placement IN ('all', 'anywhere');
UPDATE public.loyalty_offers SET placement = 'homepage'   WHERE placement IN ('home', 'home_page');
UPDATE public.loyalty_offers SET placement = 'in_app'     WHERE placement IN ('app', 'inapp');
UPDATE public.loyalty_offers SET placement = 'website_banner' WHERE placement IN ('banner');

-- Anything still unrecognised (incl. NULL) falls back to the permissive 'any'
UPDATE public.loyalty_offers
   SET channel = 'any'
 WHERE channel IS NULL OR channel NOT IN (
   'any','web','app','email','sms','whatsapp','pos','journey',
   'website','landing_page','pwa','form','push','rcs','in_app');

UPDATE public.loyalty_offers
   SET placement = 'any'
 WHERE placement IS NULL OR placement NOT IN (
   'any','homepage','checkout','cart','email','journey','push','in_app',
   'website_banner','product_page','category_page','popup','exit_intent',
   'landing_page_hero','landing_page_inline','pwa_home','pwa_inbox',
   'form_thankyou','form_inline','sms','whatsapp','rcs');

-- ---------------------------------------------------------------------------
-- 2. Apply the widened constraints (data is now guaranteed compliant)
-- ---------------------------------------------------------------------------
ALTER TABLE public.loyalty_offers ADD CONSTRAINT loyalty_offers_channel_check
  CHECK (channel IN (
    -- existing
    'any', 'web', 'app', 'email', 'sms', 'whatsapp', 'pos', 'journey',
    -- owned surfaces
    'website', 'landing_page', 'pwa', 'form',
    -- additional messaging channels
    'push', 'rcs', 'in_app'
  ));

ALTER TABLE public.loyalty_offers ADD CONSTRAINT loyalty_offers_placement_check
  CHECK (placement IN (
    -- existing
    'any', 'homepage', 'checkout', 'cart', 'email', 'journey', 'push', 'in_app',
    -- website / landing / PWA / form surfaces
    'website_banner', 'product_page', 'category_page', 'popup', 'exit_intent',
    'landing_page_hero', 'landing_page_inline', 'pwa_home', 'pwa_inbox',
    'form_thankyou', 'form_inline',
    -- messaging surfaces
    'sms', 'whatsapp', 'rcs'
  ));

-- ---------------------------------------------------------------------------
-- 3. Index for surface-scoped offer lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_loyalty_offers_surface
  ON public.loyalty_offers (tenant_id, environment, channel, placement);

COMMENT ON COLUMN public.loyalty_offers.channel IS
  'Delivery channel: any|web|app|email|sms|whatsapp|pos|journey|website|landing_page|pwa|form|push|rcs|in_app';
COMMENT ON COLUMN public.loyalty_offers.placement IS
  'Render slot within the channel (homepage, checkout, landing_page_hero, pwa_home, form_thankyou, …)';
