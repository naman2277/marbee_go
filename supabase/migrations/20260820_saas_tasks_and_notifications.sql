-- Migration: Multi-Tenant SaaS Tasks and Notifications Tables
-- Purpose: Provide enterprise data persistence for Task & Project Management and Notification Centre

-- 1. Tasks & Project Management Table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'production',
  title TEXT NOT NULL,
  description TEXT,
  priority VARCHAR(16) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  status VARCHAR(16) NOT NULL DEFAULT 'todo', -- 'todo', 'in_progress', 'in_review', 'done'
  module VARCHAR(32) NOT NULL DEFAULT 'General', -- 'Web Push', 'Campaigns', 'Audiences', 'Schemas', 'Journeys', 'General'
  assignee TEXT NOT NULL DEFAULT 'Unassigned',
  due_date DATE,
  subtasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_env ON public.tasks (tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks (priority);

-- 2. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  environment VARCHAR(32) NOT NULL DEFAULT 'production',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'system', -- 'web_push', 'campaign', 'system', 'audience', 'security'
  read BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,
  action_label TEXT,
  badge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_env ON public.notifications (tenant_id, environment);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications (read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow anonymous / service access per tenant (or custom RLS policies)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'tasks_tenant_all') THEN
    CREATE POLICY tasks_tenant_all ON public.tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_tenant_all') THEN
    CREATE POLICY notifications_tenant_all ON public.notifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
