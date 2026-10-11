-- =============================================================================
-- MARBEE — Pipeline (data_jobs) execution model
-- Phase A of the Data Platform consolidation: make "a run" a real, well-modelled
-- thing and separate DEFINITION from RUN.
--
--   DEFINITION : data_jobs  ->  data_job_versions   (immutable graph snapshots)
--   RUN        : data_job_runs  ->  data_job_node_runs
--                               ->  data_job_run_logs
--                               ->  data_job_run_artifacts
--
-- Run AFTER 01–51. Independent of the v2/ scale layer. Safe to re-run.
-- =============================================================================

-- 1. data_jobs — versioning + scheduling columns (mirrors schema_definitions in 08_*)
ALTER TABLE public.data_jobs
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS schedule_tz TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alert_config JSONB NOT NULL DEFAULT '{}';  -- { on: ['failed','partial'], webhook, email }

CREATE INDEX IF NOT EXISTS idx_data_jobs_due
  ON public.data_jobs (next_run_at)
  WHERE schedule_cron IS NOT NULL AND schedule_enabled;

-- 2. data_job_versions — immutable snapshot of the graph (mirrors schema_versions)
CREATE TABLE IF NOT EXISTS public.data_job_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES public.data_jobs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot       JSONB NOT NULL,          -- { job: {...}, graph: <workflow_json> }
  change_notes   TEXT,
  published_by   UUID REFERENCES auth.users(id),
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, version_number)
);

-- 3. data_job_runs — promote to a first-class run record
--    (table already exists from 08_custom_schema_platform.sql)
ALTER TABLE public.data_job_runs
  ADD COLUMN IF NOT EXISTS tenant_id      UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment    TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS version_id     UUID REFERENCES public.data_job_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_number INTEGER,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual','schedule','webhook','api','backfill')),
  ADD COLUMN IF NOT EXISTS run_mode       TEXT NOT NULL DEFAULT 'full'
    CHECK (run_mode IN ('full','dry_run','preview','resume','partial')),
  ADD COLUMN IF NOT EXISTS triggered_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS queued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS plan           JSONB,   -- validated DAG plan (topo order, typed edges)
  ADD COLUMN IF NOT EXISTS stats          JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS canceled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resumed_from   UUID REFERENCES public.data_job_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_node_id   TEXT,    -- run-from-node: only act from this node onward
  ADD COLUMN IF NOT EXISTS until_node_id  TEXT;    -- run-until-node: stop after this node

-- New rows start life queued (a Phase-B worker moves them forward).
-- Canonical status vocabulary (kept as free TEXT, no destructive CHECK):
--   queued | running | succeeded | partial | failed | canceled
ALTER TABLE public.data_job_runs ALTER COLUMN status SET DEFAULT 'queued';

-- Backfill tenant/env on existing rows from the parent job.
UPDATE public.data_job_runs r
SET    tenant_id = j.tenant_id,
       environment = COALESCE(r.environment, j.environment)
FROM   public.data_jobs j
WHERE  r.job_id = j.id AND r.tenant_id IS NULL;

-- 4. data_job_node_runs — one row per node per run
CREATE TABLE IF NOT EXISTS public.data_job_node_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES public.data_job_runs(id) ON DELETE CASCADE,
  node_id        TEXT NOT NULL,               -- graph node id from workflow_json
  node_type      TEXT NOT NULL,
  node_label     TEXT,
  state          TEXT NOT NULL DEFAULT 'idle'
    CHECK (state IN ('idle','queued','running','succeeded','failed','skipped','canceled','retrying')),
  attempt        INTEGER NOT NULL DEFAULT 0,
  records_in     BIGINT NOT NULL DEFAULT 0,
  records_out    BIGINT NOT NULL DEFAULT 0,
  records_failed BIGINT NOT NULL DEFAULT 0,
  error          JSONB,
  checkpoint     JSONB,                        -- opaque resume token written by the executor
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  UNIQUE (run_id, node_id)
);

-- 5. data_job_run_logs — structured log lines
CREATE TABLE IF NOT EXISTS public.data_job_run_logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id     UUID NOT NULL REFERENCES public.data_job_runs(id) ON DELETE CASCADE,
  node_id    TEXT,
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error')),
  message    TEXT NOT NULL,
  context    JSONB,
  logged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. data_job_run_artifacts — previews, exports, error reports, checkpoints, profiles
CREATE TABLE IF NOT EXISTS public.data_job_run_artifacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES public.data_job_runs(id) ON DELETE CASCADE,
  node_id        TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('preview','export','error_report','checkpoint','profile')),
  storage_bucket TEXT NOT NULL DEFAULT 'data-artifacts',
  storage_path   TEXT NOT NULL,
  content_type   TEXT,
  byte_size      BIGINT,
  row_count      BIGINT,
  meta           JSONB,   -- column profile for 'preview' / 'profile' artifacts
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_data_job_versions_job       ON public.data_job_versions (job_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_data_job_runs_tenant        ON public.data_job_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_job_runs_pending       ON public.data_job_runs (status) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_data_job_node_runs_run      ON public.data_job_node_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_data_job_run_logs_run       ON public.data_job_run_logs (run_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_data_job_run_artifacts_run  ON public.data_job_run_artifacts (run_id);

-- RLS — children scope through run_id -> data_job_runs -> data_jobs (tenant)
ALTER TABLE public.data_job_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_job_node_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_job_run_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_job_run_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_job_versions_tenant_access" ON public.data_job_versions;
CREATE POLICY "data_job_versions_tenant_access" ON public.data_job_versions FOR ALL
  USING (job_id IN (SELECT id FROM public.data_jobs WHERE tenant_id IN (SELECT public.user_tenant_ids())));

DROP POLICY IF EXISTS "data_job_node_runs_tenant_access" ON public.data_job_node_runs;
CREATE POLICY "data_job_node_runs_tenant_access" ON public.data_job_node_runs FOR ALL
  USING (run_id IN (SELECT id FROM public.data_job_runs WHERE tenant_id IN (SELECT public.user_tenant_ids())));

DROP POLICY IF EXISTS "data_job_run_logs_tenant_access" ON public.data_job_run_logs;
CREATE POLICY "data_job_run_logs_tenant_access" ON public.data_job_run_logs FOR ALL
  USING (run_id IN (SELECT id FROM public.data_job_runs WHERE tenant_id IN (SELECT public.user_tenant_ids())));

DROP POLICY IF EXISTS "data_job_run_artifacts_tenant_access" ON public.data_job_run_artifacts;
CREATE POLICY "data_job_run_artifacts_tenant_access" ON public.data_job_run_artifacts FOR ALL
  USING (run_id IN (SELECT id FROM public.data_job_runs WHERE tenant_id IN (SELECT public.user_tenant_ids())));

GRANT ALL ON public.data_job_versions      TO authenticated;
GRANT ALL ON public.data_job_node_runs     TO authenticated;
GRANT ALL ON public.data_job_run_logs      TO authenticated;
GRANT ALL ON public.data_job_run_artifacts TO authenticated;

-- 7. publish_data_job_version — snapshot workflow_json, bump current_version
--    (mirrors publish_custom_schema in 08_custom_schema_platform.sql)
CREATE OR REPLACE FUNCTION public.publish_data_job_version(
  p_job_id      UUID,
  p_change_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job         public.data_jobs%ROWTYPE;
  v_new_version INT;
BEGIN
  SELECT * INTO v_job FROM public.data_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'data job % not found', p_job_id;
  END IF;
  IF NOT public.user_has_tenant_access(v_job.tenant_id) THEN
    RAISE EXCEPTION 'not authorised for this data job';
  END IF;

  v_new_version := v_job.current_version + 1;

  INSERT INTO public.data_job_versions (job_id, version_number, snapshot, change_notes, published_by)
  VALUES (
    p_job_id,
    v_new_version,
    jsonb_build_object('job', to_jsonb(v_job) - 'workflow_json', 'graph', v_job.workflow_json),
    p_change_notes,
    auth.uid()
  );

  UPDATE public.data_jobs
  SET    current_version = v_new_version,
         status          = 'published',
         published_at    = NOW(),
         updated_at      = NOW()
  WHERE  id = p_job_id;

  RETURN jsonb_build_object('success', TRUE, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION public.publish_data_job_version(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_data_job_version(UUID, TEXT) TO authenticated;

-- 8. Realtime — stream run + node-run + log changes to the canvas / monitor
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.data_job_runs;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.data_job_node_runs;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.data_job_run_logs;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- 9. Storage bucket for run artifacts (private; served via signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('data-artifacts', 'data-artifacts', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "data_artifacts_tenant_read" ON storage.objects;
CREATE POLICY "data_artifacts_tenant_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'data-artifacts' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "data_artifacts_tenant_insert" ON storage.objects;
CREATE POLICY "data_artifacts_tenant_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'data-artifacts');

DROP POLICY IF EXISTS "data_artifacts_tenant_update" ON storage.objects;
CREATE POLICY "data_artifacts_tenant_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'data-artifacts');
