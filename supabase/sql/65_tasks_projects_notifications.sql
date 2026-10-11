-- =============================================================================
-- MARBEE — Task & Project management + per-user Notification Centre
-- Run AFTER 01_marbee_schema.sql and 37_access_management_rbac.sql
-- Safe to re-run (idempotent). This REPLACES the stale
-- supabase/migrations/20260820_saas_tasks_and_notifications.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- if a projects table was hand-created earlier, make sure it has the columns
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_projects_tenant_env
  ON public.projects (tenant_id, environment, created_at);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_tenant_access" ON public.projects;
CREATE POLICY "projects_tenant_access" ON public.projects FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.projects TO authenticated;

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. tasks  (create if missing, then patch columns / RLS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'todo',
  module TEXT NOT NULL DEFAULT 'General',
  assignee TEXT NOT NULL DEFAULT 'Unassigned',
  due_date DATE,
  subtasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assignee_user_id UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_env ON public.tasks (tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user ON public.tasks (assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks (project_id);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
-- remove the permissive USING(true) policy from the old migration
DROP POLICY IF EXISTS tasks_tenant_all ON public.tasks;
DROP POLICY IF EXISTS "tasks_tenant_access" ON public.tasks;
CREATE POLICY "tasks_tenant_access" ON public.tasks FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.tasks TO authenticated;

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. task_comments  (threaded discussion + @mentions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  author_user_id UUID,
  author_name TEXT,
  body TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_comments_tenant ON public.task_comments (tenant_id, environment);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_comments_tenant_access" ON public.task_comments;
CREATE POLICY "task_comments_tenant_access" ON public.task_comments FOR ALL
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.task_comments TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. notifications  (create if missing, then patch to per-user + realtime)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'system',
  read BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,
  action_label TEXT,
  badge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient_user_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_name TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_env ON public.notifications (tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications (recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications (read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_tenant_all ON public.notifications;
DROP POLICY IF EXISTS "notifications_recipient_access" ON public.notifications;
-- readers see tenant-wide broadcasts (recipient NULL) + their own targeted ones
CREATE POLICY "notifications_recipient_access" ON public.notifications FOR ALL
  USING (
    tenant_id IN (SELECT public.user_tenant_ids())
    AND (recipient_user_id IS NULL OR recipient_user_id = auth.uid())
  )
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.notifications TO authenticated;

-- realtime: emit full rows on change, add to the supabase_realtime publication
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Cleanup — remove all demo / seed data
-- ---------------------------------------------------------------------------

-- 5a. the 14 deterministic seed tasks shipped in apps/web/src/lib/tasks.ts
DELETE FROM public.tasks
WHERE id IN (
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000014'
);

-- 5b. any remaining seed-style rows: never created by a real user, fake assignees
DELETE FROM public.tasks
WHERE created_by IS NULL
  AND created_at < NOW() - INTERVAL '1 minute'
  AND assignee IN (
    'Alex Rivera','Maya Chen','Sarah Kim','David Patel','Marcus Vance',
    'Elena Rostova','Dr. Evelyn Reed','Liam Thorne','DevOps Lead','Naman Sharma'
  );

-- 5c. demo projects (localStorage ids: proj_default / proj_marketing / …)
DELETE FROM public.projects WHERE id::text LIKE 'proj\_%';

-- 5d. pre-existing untargeted / demo notifications (no type, no recipient)
DELETE FROM public.notifications WHERE recipient_user_id IS NULL AND type IS NULL;
