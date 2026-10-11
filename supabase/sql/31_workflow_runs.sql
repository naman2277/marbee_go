-- =============================================================================
-- MARBEE — Workflow run state (Blast campaigns: step-by-step targeting)
-- Run AFTER 01_marbee_schema.sql (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.journey_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.journey_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'completed', 'failed')),
  current_node_id TEXT,
  node_results JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_journey
  ON public.journey_workflow_runs (journey_id, created_at DESC);

ALTER TABLE public.journey_workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journey_workflow_runs_tenant_access" ON public.journey_workflow_runs;
CREATE POLICY "journey_workflow_runs_tenant_access" ON public.journey_workflow_runs FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.journey_workflow_runs TO authenticated;

CREATE TRIGGER journey_workflow_runs_updated_at
  BEFORE UPDATE ON public.journey_workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
