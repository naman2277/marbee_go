import { supabase } from './supabase';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';

export type ProjectItem = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdBy?: string | null;
  createdAt: string;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorUserId?: string | null;
  authorName?: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
};

export type TaskItem = {
  id: string;
  tenantId: string;
  environment: string;
  projectId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  module: 'Web Push' | 'Campaigns' | 'Audiences' | 'Schemas' | 'Journeys' | 'General';
  assignee: string;
  assigneeUserId?: string | null;
  createdBy?: string | null;
  dueDate: string;
  attachmentsCount?: number;
  commentsCount?: number;
  iconEmoji?: string;
  comments?: { id: string; user: string; text: string; time: string }[];
  subtasks: { id: string; title: string; completed: boolean }[];
  createdAt: string;
  updatedAt?: string;
};

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/* ------------------------------------------------------------------ *
 * Projects — database is the single source of truth.
 * ------------------------------------------------------------------ */

function mapProject(d: Record<string, any>): ProjectItem {
  return {
    id: String(d.id),
    name: d.name,
    description: d.description || '',
    color: d.color || 'bg-brand-600',
    createdBy: d.created_by ?? null,
    createdAt: d.created_at,
  };
}

export async function fetchProjects(tenantId: string, environment: string): Promise<ProjectItem[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapProject);
}

export async function saveProject(
  project: Partial<ProjectItem> & { name: string },
  tenantId: string,
  environment: string,
  createdBy?: string | null,
): Promise<ProjectItem> {
  const id = isUuid(project.id) ? (project.id as string) : generateUUID();
  const row = {
    id,
    tenant_id: tenantId,
    environment,
    name: project.name.trim(),
    description: project.description || null,
    color: project.color || 'bg-brand-600',
    created_by: project.createdBy ?? createdBy ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('projects')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return mapProject(data);
}

export async function deleteProject(
  projectId: string,
  tenantId: string,
  _environment: string,
): Promise<void> {
  // cascade tasks first (no FK cascade — project_id is a bare uuid column)
  await supabase.from('tasks').delete().eq('project_id', projectId).eq('tenant_id', tenantId);
  const { error } = await supabase.from('projects').delete().eq('id', projectId).eq('tenant_id', tenantId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 * Tasks
 * ------------------------------------------------------------------ */

function mapTask(d: Record<string, any>): TaskItem {
  return {
    id: String(d.id),
    tenantId: d.tenant_id,
    environment: d.environment,
    projectId: d.project_id || undefined,
    title: d.title,
    description: d.description || '',
    priority: (d.priority || 'medium') as TaskPriority,
    status: (d.status || 'todo') as TaskStatus,
    module: (d.module || 'General') as TaskItem['module'],
    assignee: d.assignee || 'Unassigned',
    assigneeUserId: d.assignee_user_id ?? null,
    createdBy: d.created_by ?? null,
    dueDate: d.due_date || '',
    attachmentsCount: d.attachments_count ?? 0,
    commentsCount: d.comments_count ?? (Array.isArray(d.comments) ? d.comments.length : 0),
    subtasks: Array.isArray(d.subtasks) ? d.subtasks : [],
    comments: Array.isArray(d.comments) ? d.comments : [],
    createdAt: d.created_at || new Date().toISOString(),
    updatedAt: d.updated_at,
  };
}

export async function fetchTasks(tenantId: string, environment: string): Promise<TaskItem[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function saveTask(
  task: Partial<TaskItem> & { title: string },
  tenantId: string,
  environment: string,
  createdBy?: string | null,
): Promise<TaskItem> {
  const taskId = isUuid(task.id) ? (task.id as string) : generateUUID();

  const row = {
    id: taskId,
    tenant_id: task.tenantId || tenantId,
    environment: task.environment || environment,
    project_id: isUuid(task.projectId) ? task.projectId : null,
    title: task.title.trim(),
    description: task.description || null,
    priority: task.priority || 'medium',
    status: task.status || 'todo',
    module: task.module || 'General',
    assignee: task.assignee || 'Unassigned',
    assignee_user_id: task.assigneeUserId ?? null,
    created_by: task.createdBy ?? createdBy ?? null,
    due_date: task.dueDate || null,
    subtasks: task.subtasks || [],
    comments: task.comments || [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('tasks').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return mapTask(data);
}

export async function deleteTask(taskId: string, tenantId: string, _environment: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId).eq('tenant_id', tenantId);
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 * Task comments + @mentions
 * ------------------------------------------------------------------ */

function mapComment(d: Record<string, any>): TaskComment {
  return {
    id: String(d.id),
    taskId: d.task_id,
    authorUserId: d.author_user_id ?? null,
    authorName: d.author_name ?? null,
    body: d.body,
    mentions: Array.isArray(d.mentions) ? d.mentions : [],
    createdAt: d.created_at,
  };
}

export async function fetchTaskComments(taskId: string, tenantId: string): Promise<TaskComment[]> {
  if (!tenantId || !isUuid(taskId)) return [];
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapComment);
}

export async function addTaskComment(
  input: {
    taskId: string;
    body: string;
    mentions?: string[];
    authorUserId?: string | null;
    authorName?: string | null;
  },
  tenantId: string,
  environment: string,
): Promise<TaskComment> {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: input.taskId,
      tenant_id: tenantId,
      environment,
      author_user_id: input.authorUserId ?? null,
      author_name: input.authorName ?? null,
      body: input.body,
      mentions: (input.mentions ?? []).filter(isUuid),
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapComment(data);
}
