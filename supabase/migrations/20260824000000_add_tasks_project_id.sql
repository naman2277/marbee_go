-- Migration: Add project_id to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_id TEXT DEFAULT 'proj_default';
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks (project_id);
