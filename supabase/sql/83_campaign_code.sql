-- =============================================================================
-- MARBEE — Editable campaign IDs (journeys.campaign_code)
-- Human-readable campaign ID, e.g. CMP-2026-AD43F2. Auto-generated for new
-- campaigns, editable by users, and UNIQUE ACROSS THE WHOLE INSTANCE
-- (all tenants, all environments, case-insensitive).
--
-- Run AFTER 01–82. Safe to re-run.
-- =============================================================================

ALTER TABLE public.journeys
  ADD COLUMN IF NOT EXISTS campaign_code TEXT;

-- Format: 3–40 chars, letters/digits/dash/underscore, must start with a letter or digit.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journeys_campaign_code_format') THEN
    ALTER TABLE public.journeys
      ADD CONSTRAINT journeys_campaign_code_format
      CHECK (campaign_code IS NULL OR campaign_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$');
  END IF;
END $$;

-- 1. Backfill existing campaigns with the code the UI already showed (CMP-<year>-<6 hex of id>).
--    Rare collisions get a numeric suffix so the unique index can be created.
WITH candidates AS (
  SELECT id,
         'CMP-' || EXTRACT(YEAR FROM created_at)::int || '-' || UPPER(SUBSTR(REPLACE(id::text, '-', ''), 1, 6)) AS base
  FROM public.journeys
  WHERE campaign_code IS NULL
    AND COALESCE(settings->>'journey_type', 'campaign') <> 'flow'
),
ranked AS (
  SELECT id, base, ROW_NUMBER() OVER (PARTITION BY UPPER(base) ORDER BY id) AS rn FROM candidates
)
UPDATE public.journeys j
SET campaign_code = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END
FROM ranked r
WHERE j.id = r.id
  AND NOT EXISTS (
    SELECT 1 FROM public.journeys x
    WHERE UPPER(x.campaign_code) = UPPER(CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END)
  );

-- 2. Instance-wide, case-insensitive uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS journeys_campaign_code_unique
  ON public.journeys (UPPER(campaign_code))
  WHERE campaign_code IS NOT NULL;

-- 3. Auto-assign on insert (and when a code is cleared) for campaigns.
CREATE OR REPLACE FUNCTION public.assign_campaign_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_try  INT := 0;
BEGIN
  IF COALESCE(NEW.settings->>'journey_type', 'campaign') = 'flow' THEN
    RETURN NEW;
  END IF;
  IF NEW.campaign_code IS NOT NULL AND BTRIM(NEW.campaign_code) <> '' THEN
    NEW.campaign_code := UPPER(BTRIM(NEW.campaign_code));
    RETURN NEW;
  END IF;

  v_code := 'CMP-' || EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()))::int || '-' || UPPER(SUBSTR(REPLACE(NEW.id::text, '-', ''), 1, 6));
  WHILE EXISTS (SELECT 1 FROM public.journeys WHERE UPPER(campaign_code) = v_code AND id <> NEW.id) LOOP
    v_try := v_try + 1;
    v_code := 'CMP-' || EXTRACT(YEAR FROM NOW())::int || '-' || UPPER(SUBSTR(MD5(NEW.id::text || v_try::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN v_try > 20;
  END LOOP;
  NEW.campaign_code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journeys_assign_campaign_code ON public.journeys;
CREATE TRIGGER journeys_assign_campaign_code
  BEFORE INSERT OR UPDATE OF campaign_code, settings ON public.journeys
  FOR EACH ROW EXECUTE FUNCTION public.assign_campaign_code();

-- Any campaign the backfill skipped (collision) gets a code from the trigger now.
UPDATE public.journeys
SET campaign_code = NULL
WHERE campaign_code IS NULL
  AND COALESCE(settings->>'journey_type', 'campaign') <> 'flow';

-- 4. Availability check across ALL tenants. SECURITY DEFINER so RLS doesn't hide
--    other workspaces' codes; returns only a boolean, never the owning row.
CREATE OR REPLACE FUNCTION public.is_campaign_code_available(p_code TEXT, p_exclude_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.journeys
    WHERE UPPER(campaign_code) = UPPER(BTRIM(p_code))
      AND (p_exclude_id IS NULL OR id <> p_exclude_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_campaign_code_available(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_campaign_code_available(TEXT, UUID) TO authenticated;
