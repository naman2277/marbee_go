-- =============================================================================
-- MARBEE — AI-native Segment & Cohort builder
-- Additive layer over 25_audiences.sql / 26_audience_refresh.sql.
-- Run AFTER 26 (safe to re-run). Nothing here is destructive: existing
-- audiences keep working, and `filter_json` is still dual-written by the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cohort columns on the existing audiences table
-- ---------------------------------------------------------------------------

ALTER TABLE public.audiences
  -- The cohort intermediate representation. `filter_json` remains the legacy
  -- projection so campaigns/journeys that read it are unaffected.
  ADD COLUMN IF NOT EXISTS ir_json JSONB,
  ADD COLUMN IF NOT EXISTS cohort_type TEXT NOT NULL DEFAULT 'dynamic',
  ADD COLUMN IF NOT EXISTS entity TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS folder TEXT,
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS owner_id UUID,
  ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audiences_cohort_type_check'
  ) THEN
    ALTER TABLE public.audiences
      ADD CONSTRAINT audiences_cohort_type_check
      CHECK (cohort_type IN ('dynamic', 'static'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audiences_entity_check'
  ) THEN
    ALTER TABLE public.audiences
      ADD CONSTRAINT audiences_entity_check
      CHECK (entity IN ('user', 'account'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audiences_visibility_check'
  ) THEN
    ALTER TABLE public.audiences
      ADD CONSTRAINT audiences_visibility_check
      CHECK (visibility IN ('private', 'team'));
  END IF;
END $$;

-- `creation_mode` gains 'agent' for cohorts the AI agent authored end-to-end.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.audiences'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%creation_mode%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.audiences DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.audiences
    ADD CONSTRAINT audiences_creation_mode_check
    CHECK (creation_mode IN ('diy', 'ai', 'template', 'agent'));
END $$;

CREATE INDEX IF NOT EXISTS idx_audiences_folder
  ON public.audiences (tenant_id, environment, folder)
  WHERE folder IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audiences_favorite
  ON public.audiences (tenant_id, environment)
  WHERE is_favorite = TRUE;

CREATE INDEX IF NOT EXISTS idx_audiences_tags
  ON public.audiences USING GIN (tags);

-- Backfill: existing cohorts get IR derived from their filter tree at read
-- time by the app, so nothing needs rewriting here. We only stamp the entity.
UPDATE public.audiences SET entity = 'user' WHERE entity IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Version history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohort_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.audiences(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  ir_json JSONB NOT NULL,
  name TEXT NOT NULL,
  summary TEXT,
  changed_by UUID,
  changed_by_name TEXT,
  member_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_versions_cohort
  ON public.cohort_versions (cohort_id, version_number DESC);

ALTER TABLE public.cohort_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cohort_versions_tenant_access" ON public.cohort_versions;
CREATE POLICY "cohort_versions_tenant_access" ON public.cohort_versions FOR ALL
  USING (cohort_id IN (
    SELECT id FROM public.audiences WHERE tenant_id IN (SELECT public.user_tenant_ids())
  ));

GRANT ALL ON public.cohort_versions TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Static cohort snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohort_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.audiences(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  member_ids UUID[] NOT NULL DEFAULT '{}',
  member_count INTEGER NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_snapshots_cohort
  ON public.cohort_snapshots (cohort_id, captured_at DESC);

ALTER TABLE public.cohort_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cohort_snapshots_tenant_access" ON public.cohort_snapshots;
CREATE POLICY "cohort_snapshots_tenant_access" ON public.cohort_snapshots FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.cohort_snapshots TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Collaboration — comments & mentions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohort_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.audiences(id) ON DELETE CASCADE,
  author_id UUID,
  author_name TEXT,
  body TEXT NOT NULL,
  mentions TEXT[] NOT NULL DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_comments_cohort
  ON public.cohort_comments (cohort_id, created_at);

ALTER TABLE public.cohort_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cohort_comments_tenant_access" ON public.cohort_comments;
CREATE POLICY "cohort_comments_tenant_access" ON public.cohort_comments FOR ALL
  USING (cohort_id IN (
    SELECT id FROM public.audiences WHERE tenant_id IN (SELECT public.user_tenant_ids())
  ));

GRANT ALL ON public.cohort_comments TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Materialised membership (optional fast path for activation)
--
-- The studio previews client-side against a sample. A scheduled refresh can
-- populate this table so campaigns resolve membership without re-evaluating.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cohort_members (
  cohort_id UUID NOT NULL REFERENCES public.audiences(id) ON DELETE CASCADE,
  cohort_slug TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cohort_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_slug
  ON public.cohort_members (tenant_id, environment, cohort_slug);

CREATE INDEX IF NOT EXISTS idx_cohort_members_customer
  ON public.cohort_members (customer_id);

ALTER TABLE public.cohort_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cohort_members_tenant_access" ON public.cohort_members;
CREATE POLICY "cohort_members_tenant_access" ON public.cohort_members FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.cohort_members TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Refresh-log detail for async / partial execution
-- ---------------------------------------------------------------------------

ALTER TABLE public.audience_refresh_logs
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS sampled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ir_version INTEGER;

-- ---------------------------------------------------------------------------
-- 7. Demo cohorts using the new IR
-- ---------------------------------------------------------------------------

UPDATE public.audiences
SET ir_json = jsonb_build_object(
  'version', 1,
  'entity', 'user',
  'schemaSlug', 'customer',
  'root', jsonb_build_object(
    'kind', 'group',
    'id', 'root-active',
    'operator', 'and',
    'children', jsonb_build_array(
      jsonb_build_object(
        'kind', 'property',
        'id', 'c1',
        'property', 'status',
        'operator', 'equals',
        'value', 'active'
      )
    )
  )
)
WHERE slug = 'active-customers'
  AND tenant_id = '00000000-0000-0000-0000-000000000001'
  AND ir_json IS NULL;

INSERT INTO public.audiences (
  id, tenant_id, environment, name, slug, description, schema_slug,
  filter_json, ir_json, creation_mode, member_count, status, tags, entity, cohort_type
) VALUES (
  '80000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'production',
  'Dormant customers',
  'dormant-customers',
  'No tracked activity for 30+ days',
  'customer',
  '{"type":"group","id":"g3","logic":"and","children":[]}'::jsonb,
  jsonb_build_object(
    'version', 1,
    'entity', 'user',
    'schemaSlug', 'customer',
    'root', jsonb_build_object(
      'kind', 'group',
      'id', 'root-dormant',
      'operator', 'and',
      'children', jsonb_build_array(
        jsonb_build_object(
          'kind', 'retention',
          'id', 'r1',
          'pattern', 'became_inactive',
          'gapDays', 30,
          'periodUnit', 'day',
          'window', jsonb_build_object('kind', 'all_time')
        )
      )
    )
  ),
  'template',
  0,
  'active',
  ARRAY['lifecycle', 'retention'],
  'user',
  'dynamic'
)
ON CONFLICT (tenant_id, environment, slug) DO NOTHING;
