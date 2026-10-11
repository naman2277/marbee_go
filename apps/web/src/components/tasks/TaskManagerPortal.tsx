import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  ArrowUpDown,
  FolderKanban,
  Kanban,
  List,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Paperclip,
  CheckSquare,
  MessageSquare,
  X,
  Trash2,
  Filter,
  Check,
  LayoutGrid,
  Clock,
  Send,
  Maximize2,
  Minimize2,
  FolderPlus,
  UserCheck,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { fetchAccessMembers } from '@/lib/access-management';
import { createNotification, notifyUsers } from '@/lib/notifications';
import {
  fetchTasks,
  saveTask as saveTaskApi,
  deleteTask as deleteTaskApi,
  fetchProjects,
  saveProject,
  deleteProject as deleteProjectApi,
  fetchTaskComments,
  addTaskComment,
  generateUUID,
  type TaskItem,
  type TaskPriority,
  type TaskStatus,
  type ProjectItem,
  type TaskComment,
} from '@/lib/tasks';

// 3D & Colorful Square Icon Badges
const TASK_ICON_MAP: Record<string, { emoji: string; bg: string; border: string }> = {
  'Productivity Task': { emoji: '📓', bg: 'bg-[#FDE2E4]', border: 'border-[#F8B4B9]' },
  'Pre School Education': { emoji: '📖', bg: 'bg-[#E2F0D9]', border: 'border-[#B8DFA9]' },
  'Illustration Design': { emoji: '🎨', bg: 'bg-[#D9E2EC]', border: 'border-[#BCCCDC]' },
  'Healthcare Design': { emoji: '❤️', bg: 'bg-[#FFE3E3]', border: 'border-[#FFBDBD]' },
  'Dribbble Sprint': { emoji: '🏀', bg: 'bg-[#FFD6E8]', border: 'border-[#FFA8D1]' },
  'Social Media Design': { emoji: '📱', bg: 'bg-[#D0EBFF]', border: 'border-[#A5D8FF]' },
  'Camp Mobile Design': { emoji: '🏕️', bg: 'bg-[#FFE8CC]', border: 'border-[#FFD8A8]' },
  'Insurance Dashboard': { emoji: '🛡️', bg: 'bg-[#D3F9D8]', border: 'border-[#B2F2BB]' },
  'Learning App Design': { emoji: '💻', bg: 'bg-[#E7F5FF]', border: 'border-[#C5E4FF]' },
  'Banking App Design': { emoji: '💳', bg: 'bg-[#F3D9FA]', border: 'border-[#EEBEFA]' },
  'SEO Dashboard': { emoji: '📊', bg: 'bg-[#E3FAFC]', border: 'border-[#C5F6FA]' },
  'Communities App': { emoji: '👥', bg: 'bg-[#EBFBEE]', border: 'border-[#D3F9D8]' },
  'Customer Onboarding Flow': { emoji: '🚀', bg: 'bg-[#FFF3BF]', border: 'border-[#FFE066]' },
  'Notification Relay Worker': { emoji: '⚡', bg: 'bg-[#E7F5FF]', border: 'border-[#C5E4FF]' },
};

function getTaskVisual(title: string, module: string, customEmoji?: string) {
  if (customEmoji) {
    return { emoji: customEmoji, bg: 'bg-[#F3D9FA]', border: 'border-[#EEBEFA]' };
  }
  if (TASK_ICON_MAP[title]) return TASK_ICON_MAP[title];
  if (module === 'Web Push') return { emoji: '🔔', bg: 'bg-[#F3D9FA]', border: 'border-[#EEBEFA]' };
  if (module === 'Campaigns') return { emoji: '🚀', bg: 'bg-[#FFE8CC]', border: 'border-[#FFD8A8]' };
  if (module === 'Audiences') return { emoji: '👥', bg: 'bg-[#EBFBEE]', border: 'border-[#D3F9D8]' };
  if (module === 'Schemas') return { emoji: '🗄️', bg: 'bg-[#E3FAFC]', border: 'border-[#C5F6FA]' };
  if (module === 'Journeys') return { emoji: '⚡', bg: 'bg-[#FFF3BF]', border: 'border-[#FFE066]' };
  return { emoji: '📋', bg: 'bg-[#F1F3F5]', border: 'border-[#DEE2E6]' };
}


// Kanban Column Meta
const KANBAN_COLUMNS: {
  id: TaskStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  { id: 'todo', label: 'To-do', badgeBg: 'bg-[#14B8A6]', badgeText: 'text-white' },
  { id: 'in_progress', label: 'Ongoing', badgeBg: 'bg-[#3B82F6]', badgeText: 'text-white' },
  { id: 'in_review', label: 'In review', badgeBg: 'bg-[#F97316]', badgeText: 'text-white' },
  { id: 'done', label: 'Completed', badgeBg: 'bg-[#10B981]', badgeText: 'text-white' },
];

export function TaskManagerPortal({
  isOpen,
  onClose,
  isEmbedded = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  isEmbedded?: boolean;
}) {
  const { tenantId, displayName, environment, user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = user?.id ?? null;
  const currentUserName = displayName || user?.email?.split('@')[0] || 'You';

  // Fullscreen / Windowed View Mode State
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Top-Level Main View Switcher: 'dashboard' | 'projects' | 'tasks'
  const [mainView, setMainView] = useState<'dashboard' | 'projects' | 'tasks'>('tasks');

  // Projects State
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [projectSaveError, setProjectSaveError] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectItem | null>(null);
  const [expandedProjectTrees, setExpandedProjectTrees] = useState<Record<string, boolean>>({});

  // Task Sub-View Mode inside Project
  const [activeTab, setActiveTab] = useState<'board' | 'list' | 'calendar'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedSidebarNav, setSelectedSidebarNav] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Left Sidebar Accordion States
  const [expandedSections, setExpandedSections] = useState({
    myWork: true,
    projects: true,
  });

  // Filter & Sort States
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'priority' | 'title'>('date');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Drag & Drop State
  const [dragOverColId, setDragOverColId] = useState<TaskStatus | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Modals & Details
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);
  const [newCommentInput, setNewCommentInput] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [taskComments, setTaskComments] = useState<{ id: string; user: string; text: string; time: string }[]>([]);
  const [pendingMentions, setPendingMentions] = useState<Record<string, string>>({}); // name -> userId

  // Glassmorphic Task Avatar Modal State
  const [avatarModal, setAvatarModal] = useState<{
    isOpen: boolean;
    task: TaskItem | null;
    type: 'assignee' | 'icon';
  }>({
    isOpen: false,
    task: null,
    type: 'assignee',
  });

  const openAvatarModal = (task: TaskItem, type: 'assignee' | 'icon' = 'assignee') => {
    setAvatarModal({ isOpen: true, task, type });
  };

  // Task Form State
  const [taskForm, setTaskForm] = useState<{
    title: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    module: TaskItem['module'];
    assignee: string;
    assigneeUserId?: string | null;
    dueDate: string;
    projectId?: string;
    iconEmoji?: string;
    attachmentsCount: number;
    commentsCount: number;
    subtasks: { id: string; title: string; completed: boolean }[];
  }>({
    title: '',
    description: '',
    priority: 'high',
    status: 'todo',
    module: 'Web Push',
    assignee: displayName || user?.email?.split('@')[0] || 'You',
    assigneeUserId: user?.id ?? null,
    dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    projectId: undefined,
    iconEmoji: '',
    attachmentsCount: 0,
    commentsCount: 0,
    subtasks: [],
  });
  const [newSubtaskInput, setNewSubtaskInput] = useState('');

  // Fetch Team Members from Access Management (loads real avatars)
  const { data: memberRows = [] } = useQuery({
    queryKey: ['access-members', tenantId],
    queryFn: () => fetchAccessMembers(tenantId),
    enabled: isOpen,
  });

  const teamMembers = useMemo(
    () =>
      memberRows.map((m) => ({
        userId: m.userId,
        name: m.name || m.email.split('@')[0],
        email: m.email,
        roleName: m.roleName,
        avatarUrl: m.avatarUrl,
      })),
    [memberRows],
  );

  const memberByName = (name: string) =>
    teamMembers.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());

  /** Fire a per-user "task assigned" notification when the assignee changed to someone else. */
  const notifyAssignee = (task: { id: string; title: string }, assigneeName: string) => {
    const member = memberByName(assigneeName);
    if (!member || member.userId === currentUserId) return;
    void createNotification(
      {
        title: `New task assigned: ${task.title}`,
        message: `${currentUserName} assigned you the task "${task.title}".`,
        type: 'task_assigned',
        recipientUserId: member.userId,
        entityType: 'task',
        entityId: task.id,
        actorName: currentUserName,
        actionUrl: '/projects',
        actionLabel: 'Open task board',
      },
      tenantId,
      environment,
    ).catch(() => {});
  };

  // Fetch Projects with React Query from Supabase DB
  // NOTE: do NOT default `data` to `[]` here. This component stays mounted inside
  // TopBar on every route with `enabled: false`, so `data` is `undefined` — a
  // `= []` default would allocate a new array each render, making it an unstable
  // useEffect dependency and spinning setProjects in an infinite render loop.
  const { data: dbProjects } = useQuery({
    queryKey: ['projects', tenantId, environment],
    queryFn: () => fetchProjects(tenantId, environment),
    enabled: isOpen,
    refetchInterval: isOpen ? 5000 : false,
  });

  useEffect(() => {
    // react-query hands back a stable cached reference, so this runs once per
    // real data change — including when the list legitimately becomes empty.
    if (dbProjects) setProjects(dbProjects);
  }, [dbProjects]);

  useEffect(() => {
    if (!isCreateProjectOpen) {
      setProjectSaveError('');
      setCreatingProject(false);
    }
  }, [isCreateProjectOpen]);

  // Fetch Tasks with React Query from Supabase DB
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', tenantId, environment],
    queryFn: () => fetchTasks(tenantId, environment),
    enabled: isOpen,
    refetchInterval: isOpen ? 3500 : false,
  });

  const saveMutation = useMutation({
    mutationFn: (task: Partial<TaskItem> & { title: string }) =>
      saveTaskApi(task, tenantId, environment),
    onSuccess: (savedTask) => {
      queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) => {
        const idx = old.findIndex((t) => t.id === savedTask.id);
        if (idx >= 0) {
          const updated = [...old];
          updated[idx] = savedTask;
          return updated;
        }
        return [savedTask, ...old];
      });
      queryClient.invalidateQueries({ queryKey: ['tasks', tenantId, environment] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => deleteTaskApi(taskId, tenantId, environment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Time-based Greeting
  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  // Filtered & Sorted Tasks
  const filteredTasks = useMemo(() => {
    let result = tasks.filter((t) => {
      // Dedicated Project Isolation:
      // When viewing a specific project, only tasks in this exact project appear.
      // The "All" view shows every task, including ones with no project yet.
      if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) {
        return false;
      }

      const matchSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        t.assignee.toLowerCase().includes(searchQuery.toLowerCase());

      const matchPriority = selectedPriority === 'all' || t.priority === selectedPriority;
      const matchModule = selectedModule === 'all' || t.module === selectedModule;
      const matchUser = selectedUserFilter === 'all' || t.assignee.toLowerCase() === selectedUserFilter.toLowerCase();

      let matchNav = true;
      const myName = (displayName || user?.email?.split('@')[0] || 'naman').toLowerCase();

      if (selectedSidebarNav === 'my_tasks') {
        matchNav = t.assignee.toLowerCase().includes(myName) || myName.includes(t.assignee.toLowerCase());
      } else if (selectedSidebarNav === 'my_in_progress') {
        matchNav = t.status === 'in_progress' && (t.assignee.toLowerCase().includes(myName) || myName.includes(t.assignee.toLowerCase()));
      } else if (selectedSidebarNav === 'my_due' || selectedSidebarNav === 'deadline') {
        matchNav = new Date(t.dueDate).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 30 && t.status !== 'done';
      } else if (selectedSidebarNav === 'my_completed') {
        matchNav = t.status === 'done';
      } else if (selectedSidebarNav === 'status_todo') {
        matchNav = t.status === 'todo';
      } else if (selectedSidebarNav === 'status_in_progress') {
        matchNav = t.status === 'in_progress';
      } else if (selectedSidebarNav === 'status_done') {
        matchNav = t.status === 'done';
      } else if (selectedSidebarNav === 'upcoming_overdue') {
        matchNav = new Date(t.dueDate).getTime() < Date.now() && t.status !== 'done';
      }

      return matchSearch && matchPriority && matchModule && matchUser && matchNav;
    });

    if (sortBy === 'priority') {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      result = [...result].sort((a, b) => order[a.priority] - order[b.priority]);
    } else if (sortBy === 'title') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else {
      result = [...result].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }

    return result;
  }, [tasks, projects, selectedProjectId, searchQuery, selectedPriority, selectedModule, selectedUserFilter, selectedSidebarNav, sortBy, displayName, user?.email]);

  // Global ⌘K / Ctrl+K keyboard shortcut for Spotlight Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchDropdownOpen(true);
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsSearchDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Tasks that belong to an existing project (used for per-project stats & search)
  const validTasks = useMemo(() => {
    const validProjectIds = new Set(projects.map((p) => p.id));
    return tasks.filter((t) => t.projectId && validProjectIds.has(t.projectId));
  }, [tasks, projects]);

  // Spotlight Search Results for Dropdown (Tasks + Projects)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        tasks: validTasks.slice(0, 6),
        projects: projects.slice(0, 4),
        isQueryEmpty: true,
      };
    }
    const matchedTasks = validTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.assignee.toLowerCase().includes(q) ||
        t.module.toLowerCase().includes(q)
    );
    const matchedProjects = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
    return {
      tasks: matchedTasks,
      projects: matchedProjects,
      isQueryEmpty: false,
    };
  }, [validTasks, projects, searchQuery]);

  // Project Stats Breakdown - Strictly scoped per project
  const projectStats = useMemo(() => {
    return projects.map((proj) => {
      const projTasks = validTasks.filter((t) => t.projectId === proj.id);
      const total = projTasks.length;
      const done = projTasks.filter((t) => t.status === 'done').length;
      const inProgress = projTasks.filter((t) => t.status === 'in_progress').length;
      const inReview = projTasks.filter((t) => t.status === 'in_review').length;
      const todo = projTasks.filter((t) => t.status === 'todo').length;
      const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        ...proj,
        totalTasks: total,
        doneTasks: done,
        inProgressTasks: inProgress,
        inReviewTasks: inReview,
        todoTasks: todo,
        progressPct,
      };
    });
  }, [projects, validTasks]);

  // Overall Dashboard Metrics
  const dashboardMetrics = useMemo(() => {
    const total = validTasks.length;
    const completed = validTasks.filter((t) => t.status === 'done').length;
    const ongoing = validTasks.filter((t) => t.status === 'in_progress').length;
    const inReview = validTasks.filter((t) => t.status === 'in_review').length;
    const overdue = validTasks.filter((t) => new Date(t.dueDate).getTime() < Date.now() && t.status !== 'done').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      totalProjects: projects.length,
      totalTasks: total,
      completedTasks: completed,
      ongoingTasks: ongoing,
      inReviewTasks: inReview,
      overdueTasks: overdue,
      completionRate,
    };
  }, [validTasks, projects]);

  // Sidebar Counts
  const sidebarCounts = useMemo(() => {
    const total = validTasks.length;
    const myName = (displayName || user?.email?.split('@')[0] || 'naman').toLowerCase();
    const myTasksCount = validTasks.filter(
      (t) => t.assignee.toLowerCase().includes(myName) || myName.includes(t.assignee.toLowerCase())
    ).length;
    const myInProgressCount = validTasks.filter((t) => t.status === 'in_progress').length;
    const myDueCount = validTasks.filter(
      (t) => new Date(t.dueDate).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 30 && t.status !== 'done'
    ).length;
    const myCompletedCount = validTasks.filter((t) => t.status === 'done').length;
    const deadlineCount = validTasks.filter(
      (t) => new Date(t.dueDate).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 30
    ).length;
    const overdueCount = validTasks.filter(
      (t) => new Date(t.dueDate).getTime() < Date.now() && t.status !== 'done'
    ).length;

    return {
      total,
      myTasksCount,
      myInProgressCount,
      myDueCount,
      myCompletedCount,
      deadlineCount: deadlineCount || 0,
      overdueCount: overdueCount || 0,
    };
  }, [validTasks, displayName, user?.email]);

  // Project Deletion Handler
  const handleDeleteProject = async (proj: ProjectItem) => {
    await deleteProjectApi(proj.id, tenantId, environment);
    const updated = projects.filter((p) => p.id !== proj.id);
    setProjects(updated);
    queryClient.setQueryData(['projects', tenantId, environment], updated);
    queryClient.invalidateQueries({ queryKey: ['tasks', tenantId, environment] });
    if (selectedProjectId === proj.id) {
      setSelectedProjectId(updated[0]?.id || 'all');
    }
    setProjectToDelete(null);
    void createNotification(
      {
        title: 'Project deleted',
        message: `Project "${proj.name}" and all its tasks were deleted.`,
        type: 'system',
        recipientUserId: currentUserId,
      },
      tenantId,
      environment,
    ).catch(() => {});
  };

  // Drag and Drop Column Shift
  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'TASK_CARD', taskId }));
  };

  const handleColumnDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColId(null);
    setDraggedTaskId(null);
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      if (data.type === 'TASK_CARD' && data.taskId) {
        const targetTask = tasks.find((t) => t.id === data.taskId);
        if (targetTask && targetTask.status !== targetStatus) {
          queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
            old.map((t) => (t.id === targetTask.id ? { ...t, status: targetStatus } : t))
          );
          saveMutation.mutate({ ...targetTask, status: targetStatus });
        }
      }
    } catch {}
  };

  // Avatar Drag onto Task Card to Reassign
  const handleAvatarDragStart = (e: React.DragEvent, memberName: string) => {
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'ASSIGN_AVATAR', memberName }));
  };

  const handleTaskCardDrop = (e: React.DragEvent, task: TaskItem) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      if (data.type === 'ASSIGN_AVATAR' && data.memberName) {
        const member = memberByName(data.memberName);
        queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
          old.map((t) => (t.id === task.id ? { ...t, assignee: data.memberName, assigneeUserId: member?.userId ?? null } : t))
        );
        saveMutation.mutate({ ...task, assignee: data.memberName, assigneeUserId: member?.userId ?? null });
        notifyAssignee(task, data.memberName);
      }
    } catch {}
  };

  // Open Create Task Modal with dedicated project preset
  const openCreateTaskModal = (initialStatus?: TaskStatus, targetProjectId?: string) => {
    const chosenProjId =
      targetProjectId ||
      (selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id) ||
      undefined;

    setTaskForm({
      title: '',
      description: '',
      priority: 'high',
      status: initialStatus || 'todo',
      module: 'Web Push',
      assignee: currentUserName,
      assigneeUserId: currentUserId,
      dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      projectId: chosenProjId,
      iconEmoji: '',
      attachmentsCount: 0,
      commentsCount: 0,
      subtasks: [],
    });
    setIsCreateTaskOpen(true);
  };

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || creatingProject) return;
    setProjectSaveError('');
    setCreatingProject(true);
    try {
      const created = await saveProject(
        {
          name: newProjectName.trim(),
          description: newProjectDesc.trim(),
        },
        tenantId,
        environment,
        currentUserId,
      );
      const updatedList = await fetchProjects(tenantId, environment);
      setProjects(updatedList);
      queryClient.setQueryData(['projects', tenantId, environment], updatedList);
      queryClient.invalidateQueries({ queryKey: ['projects', tenantId, environment] });
      setSelectedProjectId(created.id);
      setSelectedSidebarNav('overview');
      setNewProjectName('');
      setNewProjectDesc('');
      setIsCreateProjectOpen(false);
      setMainView('tasks');
    } catch (err: any) {
      const raw = err?.message || String(err);
      setProjectSaveError(
        /relation .*projects.* does not exist|schema cache/i.test(raw)
          ? 'The projects table is missing — run supabase/sql/65_tasks_projects_notifications.sql in Supabase, then retry.'
          : /row-level security|violates row-level/i.test(raw)
            ? 'Not allowed for this workspace — your account may not be a member of this tenant.'
            : `Could not create project: ${raw}`,
      );
    } finally {
      setCreatingProject(false);
    }
  };

  // Create Task Form Submit
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;

    const targetProjId =
      taskForm.projectId ||
      (selectedProjectId !== 'all' ? selectedProjectId : projects[0]?.id) ||
      undefined;

    const assigneeName = taskForm.assignee.trim() || currentUserName;
    const assigneeUserId = taskForm.assigneeUserId ?? memberByName(assigneeName)?.userId ?? null;

    const newTaskPayload = {
      id: generateUUID(),
      tenantId,
      environment,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      priority: taskForm.priority,
      status: taskForm.status,
      module: taskForm.module,
      assignee: assigneeName,
      assigneeUserId,
      createdBy: currentUserId,
      dueDate: taskForm.dueDate || new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      attachmentsCount: 0,
      commentsCount: 0,
      iconEmoji: taskForm.iconEmoji || undefined,
      comments: [],
      subtasks: taskForm.subtasks || [],
      projectId: targetProjId,
      createdAt: new Date().toISOString(),
    };

    // 1. Instant optimistic query cache update
    queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) => [
      newTaskPayload,
      ...old.filter((t) => t.id !== newTaskPayload.id),
    ]);

    // 2. Persist to DB
    saveMutation.mutate(newTaskPayload);
    setIsCreateTaskOpen(false);

    // 3. Notify the assignee (if it's someone other than the creator)
    notifyAssignee(newTaskPayload, assigneeName);

    // 4. If viewing a specific project different from the task's project, switch to it
    if (targetProjId && selectedProjectId !== 'all' && selectedProjectId !== targetProjId) {
      setSelectedProjectId(targetProjId);
    }
    setSelectedSidebarNav('overview');
    setMainView('tasks');

    setTaskForm({
      title: '',
      description: '',
      priority: 'high',
      status: 'todo',
      module: 'Web Push',
      assignee: currentUserName,
      assigneeUserId: currentUserId,
      dueDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      projectId: targetProjId,
      iconEmoji: '',
      attachmentsCount: 0,
      commentsCount: 0,
      subtasks: [],
    });
  };

  // Task Detail Modal Actions
  const openDetailModal = (task: TaskItem) => {
    setDetailTask(task);
    setPendingMentions({});
    // legacy JSONB comments render immediately; DB comments replace them once loaded
    setTaskComments(Array.isArray(task.comments) ? task.comments : []);
    void fetchTaskComments(task.id, tenantId)
      .then((rows) => {
        if (rows.length) {
          setTaskComments(
            rows
              .slice()
              .reverse()
              .map((r) => ({
                id: r.id,
                user: r.authorName || 'Someone',
                text: r.body,
                time: new Date(r.createdAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })),
          );
        }
      })
      .catch(() => {});
  };

  const addSubtaskToDetail = (title: string) => {
    if (!title.trim() || !detailTask) return;
    const newSt = { id: `st_${Date.now()}`, title: title.trim(), completed: false };
    const updatedSubtasks = [...(detailTask.subtasks || []), newSt];
    const updated = { ...detailTask, subtasks: updatedSubtasks };
    setDetailTask(updated);
    saveMutation.mutate(updated);
  };

  const toggleDetailSubtask = (stId: string) => {
    if (!detailTask) return;
    const updatedSubtasks = (detailTask.subtasks || []).map((st) =>
      st.id === stId ? { ...st, completed: !st.completed } : st
    );
    const updated = { ...detailTask, subtasks: updatedSubtasks };
    setDetailTask(updated);
    saveMutation.mutate(updated);
  };

  // Comment Input with @ Mention autocomplete
  const handleCommentChange = (text: string) => {
    setNewCommentInput(text);
    const atIndex = text.lastIndexOf('@');
    if (atIndex >= 0 && atIndex === text.length - 1) {
      setMentionQuery('');
      setShowMentionMenu(true);
    } else if (atIndex >= 0 && !text.slice(atIndex).includes(' ')) {
      setMentionQuery(text.slice(atIndex + 1));
      setShowMentionMenu(true);
    } else {
      setShowMentionMenu(false);
    }
  };

  const selectMentionMember = (member: { userId?: string; name: string; email: string; avatarUrl?: string | null }) => {
    if (!detailTask) return;
    const atIndex = newCommentInput.lastIndexOf('@');
    const updatedText = newCommentInput.slice(0, atIndex) + `@${member.name} `;
    setNewCommentInput(updatedText);
    setShowMentionMenu(false);
    const uid = member.userId ?? memberByName(member.name)?.userId;
    if (uid) setPendingMentions((prev) => ({ ...prev, [member.name]: uid }));
  };

  const postComment = async () => {
    const body = newCommentInput.trim();
    if (!body || !detailTask) return;

    // resolve @mentions that still appear in the final text
    const mentionUserIds = Object.entries(pendingMentions)
      .filter(([name]) => body.includes(`@${name}`))
      .map(([, uid]) => uid);

    const optimistic = {
      id: `c_${Date.now()}`,
      user: currentUserName,
      text: body,
      time: 'Just now',
    };
    setTaskComments((prev) => [optimistic, ...(prev || [])]);
    setNewCommentInput('');
    setShowMentionMenu(false);
    setPendingMentions({});

    try {
      await addTaskComment(
        {
          taskId: detailTask.id,
          body,
          mentions: mentionUserIds,
          authorUserId: currentUserId,
          authorName: currentUserName,
        },
        tenantId,
        environment,
      );
    } catch {
      /* optimistic entry stays; DB write can be retried on reopen */
    }

    if (mentionUserIds.length) {
      await notifyUsers(
        mentionUserIds.filter((uid) => uid !== currentUserId),
        {
          title: `You were mentioned in "${detailTask.title}"`,
          message: `${currentUserName}: ${body.slice(0, 140)}`,
          type: 'task_mention',
          entityType: 'task',
          entityId: detailTask.id,
          actorName: currentUserName,
          actionUrl: '/projects',
          actionLabel: 'Open task board',
        },
        tenantId,
        environment,
      );
    }

    queryClient.invalidateQueries({ queryKey: ['task-comments', detailTask.id] });
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const activeProject = useMemo(() => {
    if (selectedProjectId === 'all') return null;
    return projects.find((p) => p.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  if (!isOpen) return null;

  // Main UI Content
  const mainPortalContent = (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'bg-[#F8F9FD] flex flex-col select-none overflow-hidden transition-all duration-200',
        isEmbedded
          ? 'h-full w-full rounded-2xl border border-slate-200'
          : isFullscreen
          ? 'fixed inset-0 h-screen w-screen rounded-none z-10'
          : 'w-full max-w-[1280px] h-[93vh] rounded-[32px] shadow-[0_32px_100px_-20px_rgba(0,0,0,0.5)] border border-slate-200/90 z-10 relative'
      )}
    >
      {/* 1. TOP HEADER BAR WITH CENTERED SEARCH BAR */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 gap-4">
        {/* Left: Project Selector & Window Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 hover:bg-slate-50 transition border border-transparent hover:border-slate-200"
            >
              <span className="text-base font-extrabold tracking-tight text-slate-900">
                {selectedProjectId === 'all'
                  ? 'All Projects'
                  : activeProject?.name || 'My Project'}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {/* Project Selection Dropdown */}
            {isProjectDropdownOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 mt-2 w-64 rounded-2xl bg-white p-2 shadow-2xl border border-slate-200 z-40 space-y-1 text-xs animate-in fade-in"
              >
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Select Scope
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedProjectId('all');
                    setIsProjectDropdownOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-medium transition',
                    selectedProjectId === 'all' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-brand-600" />
                    <span>All Projects (Overview)</span>
                  </div>
                  {selectedProjectId === 'all' && <Check className="h-3.5 w-3.5 text-brand-600" />}
                </button>

                <div className="border-t border-slate-100 my-1" />
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Connected Projects ({projects.length})
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setMainView('tasks');
                        setIsProjectDropdownOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-medium transition',
                        selectedProjectId === proj.id ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <div className="truncate">
                        <span className="font-bold block">{proj.name}</span>
                        {proj.description && <span className="text-[10px] text-slate-400">{proj.description}</span>}
                      </div>
                      {selectedProjectId === proj.id && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                    </button>
                  ))}
                </div>

                <div className="border-t border-slate-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setIsProjectDropdownOpen(false);
                    setMainView('projects');
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <FolderKanban className="h-4 w-4 text-slate-500" />
                  View All Projects Grid
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsProjectDropdownOpen(false);
                    setIsCreateProjectOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-brand-600 hover:bg-brand-50 transition"
                >
                  <Plus className="h-4 w-4" />
                  Create New Project
                </button>
              </div>
            )}
          </div>

          {/* Sidebar Toggle */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          {/* Fullscreen Toggle (only in modal view) */}
          {!isEmbedded && (
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
              title={isFullscreen ? 'Back to Modal View' : 'Open Full Screen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Center: Search Box with Interactive Results Spotlight Dropdown */}
        <div className="relative flex-1 max-w-md mx-auto">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search tasks, projects, modules.."
            value={searchQuery}
            onFocus={() => setIsSearchDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchDropdownOpen(true);
            }}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2 pl-10 pr-12 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 shadow-2xs"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIsSearchDropdownOpen(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 border border-slate-200 shadow-2xs">
              ⌘+K
            </span>
          )}

          {/* Interactive Search Results Spotlight Dropdown */}
          {isSearchDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsSearchDropdownOpen(false)}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 right-0 mt-2 rounded-3xl bg-white p-3.5 shadow-2xl border border-slate-200/90 z-50 max-h-[420px] overflow-y-auto space-y-3.5 text-xs animate-in fade-in zoom-in-95 duration-150"
              >
                {/* Header info */}
                <div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>{searchResults.isQueryEmpty ? 'Suggested & Quick Access' : 'Search Results'}</span>
                  <span>{searchResults.tasks.length} tasks • {searchResults.projects.length} projects</span>
                </div>

                {/* Projects Section */}
                {searchResults.projects.length > 0 && (
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Projects
                    </div>
                    <div className="space-y-1">
                      {searchResults.projects.map((proj) => (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            setMainView('tasks');
                            setIsSearchDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left hover:bg-brand-50/70 hover:text-brand-900 transition group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 text-xs font-bold">
                              📁
                            </span>
                            <div className="truncate">
                              <span className="font-extrabold text-slate-900 group-hover:text-brand-700 block truncate">
                                {proj.name}
                              </span>
                              {proj.description && (
                                <span className="text-[10px] text-slate-400 block truncate">
                                  {proj.description}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-brand-600 shrink-0 flex items-center gap-1">
                            Open <ArrowRight className="h-3 w-3" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasks Section */}
                {searchResults.tasks.length > 0 ? (
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Tasks
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.tasks.map((t) => {
                        const visual = getTaskVisual(t.title, t.module, t.iconEmoji);
                        const assignedMember = teamMembers.find(
                          (m) => m.name.toLowerCase() === t.assignee.toLowerCase()
                        );
                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              openDetailModal(t);
                              setIsSearchDropdownOpen(false);
                            }}
                            className="flex items-center justify-between rounded-2xl p-2.5 hover:bg-slate-50 border border-transparent hover:border-slate-200/80 cursor-pointer transition group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base border shadow-2xs',
                                  visual.bg,
                                  visual.border
                                )}
                              >
                                {visual.emoji}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-slate-900 group-hover:text-brand-600 truncate leading-tight">
                                  {t.title}
                                </h4>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                                  <span>Due: {formatDateDisplay(t.dueDate)}</span>
                                  <span>•</span>
                                  <span className="capitalize">{t.module}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[9px] font-black capitalize',
                                  t.status === 'done'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : t.status === 'in_progress'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : t.status === 'in_review'
                                    ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                )}
                              >
                                {t.status.replace('_', ' ')}
                              </span>

                              <Avatar
                                name={t.assignee}
                                seed={t.assignee}
                                src={assignedMember?.avatarUrl}
                                size="xs"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-xs font-bold text-slate-500">No tasks found matching "{searchQuery}"</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Try searching by title, assignee, or module</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: View Switcher + Team Avatars + Profile + Close */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Top Main Navigation Bar (Dashboard, Projects, Tasks) */}
          <div className="flex items-center rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => setMainView('dashboard')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-extrabold transition',
                mainView === 'dashboard'
                  ? 'bg-white text-slate-950 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              <TrendingUp className="h-3.5 w-3.5 text-brand-600" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setMainView('projects')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-extrabold transition',
                mainView === 'projects'
                  ? 'bg-white text-slate-950 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              <FolderKanban className="h-3.5 w-3.5 text-brand-600" />
              <span className="hidden sm:inline">Projects</span>
            </button>

            <button
              type="button"
              onClick={() => setMainView('tasks')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-extrabold transition',
                mainView === 'tasks'
                  ? 'bg-white text-slate-950 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              <Kanban className="h-3.5 w-3.5 text-brand-600" />
              <span className="hidden sm:inline">Tasks</span>
            </button>
          </div>

          <span className="h-6 w-px bg-slate-200" />

          {/* Draggable Team Member Avatars from Access Management */}
          <div className="flex items-center gap-1">
            <div className="flex -space-x-1.5 overflow-hidden">
              {teamMembers.slice(0, 4).map((member) => (
                <div
                  key={member.userId}
                  draggable={true}
                  onDragStart={(e) => handleAvatarDragStart(e, member.name)}
                  onClick={() => {
                    setSelectedUserFilter(selectedUserFilter === member.name ? 'all' : member.name);
                    setMainView('tasks');
                  }}
                  className={cn(
                    'inline-flex cursor-grab active:cursor-grabbing transition hover:scale-110 rounded-full',
                    selectedUserFilter === member.name && 'ring-2 ring-brand-600 ring-offset-2'
                  )}
                  title={`Drag ${member.name} onto any task card to assign • Click to filter`}
                >
                  <Avatar
                    name={member.name}
                    email={member.email}
                    seed={member.userId}
                    src={member.avatarUrl}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <span className="h-6 w-px bg-slate-200" />

          {/* Logged-in User Profile */}
          <div className="flex items-center gap-2">
            <Avatar
              name={displayName || user?.email || 'You'}
              email={user?.email}
              seed={user?.id || 'current_user'}
              src={user?.user_metadata?.avatar_url}
              size="sm"
            />
            <span className="text-xs font-bold text-slate-800 hidden md:inline">
              {displayName || user?.email?.split('@')[0] || 'Naman'}
            </span>
          </div>

          {!isEmbedded && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Close Portal"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* 2. BODY CONTAINER: SIDEBAR + MAIN VIEW */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {!sidebarCollapsed && (
          <aside className="w-[230px] shrink-0 border-r border-slate-100 bg-white p-4 flex flex-col justify-between overflow-y-auto">
            <div>
              <button
                type="button"
                onClick={() => setIsCreateProjectOpen(true)}
                className="mb-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0F172A] py-3 text-xs font-extrabold text-white shadow-md shadow-slate-900/10 hover:bg-slate-800 active:scale-95 transition"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>

              {/* Navigation Group 1: My Work (Personal Views) */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSections((p) => ({ ...p, myWork: !p.myWork }))
                  }
                  className="flex w-full items-center justify-between px-2 py-1 text-xs font-bold text-slate-700 hover:text-slate-900"
                >
                  <span className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-brand-600" />
                    My Work
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 text-slate-400 transition-transform duration-200',
                      !expandedSections.myWork && '-rotate-90'
                    )}
                  />
                </button>

                {expandedSections.myWork && (
                  <div className="mt-1 space-y-0.5 pl-2 text-xs font-semibold">
                    {/* My Tasks */}
                    <button
                      type="button"
                      onClick={() => {
                        setMainView('tasks');
                        setSelectedSidebarNav('my_tasks');
                        setSelectedProjectId('all');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition',
                        selectedSidebarNav === 'my_tasks' && mainView === 'tasks'
                          ? 'bg-brand-50 text-brand-900 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <CheckSquare className="h-3.5 w-3.5 text-brand-600" />
                        <span>My Tasks</span>
                      </div>
                      <span className="rounded-full bg-brand-100 px-1.5 py-0.2 text-[9px] text-brand-700 font-bold">
                        {sidebarCounts.myTasksCount}
                      </span>
                    </button>

                    {/* My Projects */}
                    <button
                      type="button"
                      onClick={() => {
                        setMainView('projects');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition',
                        mainView === 'projects'
                          ? 'bg-slate-100 text-slate-900 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-3.5 w-3.5 text-purple-600" />
                        <span>My Projects</span>
                      </div>
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[9px] text-slate-700 font-bold">
                        {projects.length}
                      </span>
                    </button>

                    {/* My In Progress */}
                    <button
                      type="button"
                      onClick={() => {
                        setMainView('tasks');
                        setSelectedSidebarNav('my_in_progress');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition',
                        selectedSidebarNav === 'my_in_progress' && mainView === 'tasks'
                          ? 'bg-blue-50 text-blue-900 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                        <span>My In Progress</span>
                      </div>
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[9px] text-blue-700 font-bold">
                        {sidebarCounts.myInProgressCount}
                      </span>
                    </button>

                    {/* Due / Upcoming */}
                    <button
                      type="button"
                      onClick={() => {
                        setMainView('tasks');
                        setSelectedSidebarNav('my_due');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition',
                        selectedSidebarNav === 'my_due' && mainView === 'tasks'
                          ? 'bg-amber-50 text-amber-900 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span>Due / Upcoming</span>
                      </div>
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[9px] text-amber-700 font-bold">
                        {sidebarCounts.myDueCount}
                      </span>
                    </button>

                    {/* Completed */}
                    <button
                      type="button"
                      onClick={() => {
                        setMainView('tasks');
                        setSelectedSidebarNav('my_completed');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition',
                        selectedSidebarNav === 'my_completed' && mainView === 'tasks'
                          ? 'bg-emerald-50 text-emerald-900 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Completed</span>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] text-emerald-700 font-bold">
                        {sidebarCounts.myCompletedCount}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation Group 2: Projects & Tasks Hierarchy */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSections((p) => ({ ...p, projects: !p.projects }))
                  }
                  className="flex w-full items-center justify-between px-2 py-1 text-xs font-bold text-slate-700 hover:text-slate-900"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-slate-400" />
                    Projects ({projects.length})
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 text-slate-400 transition-transform duration-200',
                      !expandedSections.projects && '-rotate-90'
                    )}
                  />
                </button>

                {expandedSections.projects && (
                  <div className="mt-1 space-y-2 pl-1">
                    {projectStats.map((proj) => {
                      const isTreeExpanded = expandedProjectTrees[proj.id] ?? true;
                      const isProjActive = selectedProjectId === proj.id && mainView === 'tasks';

                      return (
                        <div key={proj.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-1.5">
                          {/* Project Header Row */}
                          <div className="flex items-center justify-between group">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjectId(proj.id);
                                setMainView('tasks');
                                setSelectedSidebarNav('overview');
                              }}
                              className={cn(
                                'flex items-center gap-1.5 flex-1 min-w-0 text-left text-xs font-bold truncate rounded-xl px-1.5 py-1 transition',
                                isProjActive
                                  ? 'text-brand-900 font-black'
                                  : 'text-slate-700 hover:text-slate-950'
                              )}
                            >
                              <span className="truncate">{proj.name}</span>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Delete Project Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setProjectToDelete(proj);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded-md transition"
                                title={`Delete ${proj.name} and all tasks`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedProjectTrees((prev) => ({
                                    ...prev,
                                    [proj.id]: !isTreeExpanded,
                                  }))
                                }
                                className="p-0.5 text-slate-400 hover:text-slate-700 rounded-md"
                              >
                                <ChevronDown
                                  className={cn(
                                    'h-3.5 w-3.5 transition-transform duration-200',
                                    !isTreeExpanded && '-rotate-90'
                                  )}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Sub-Tree: To-Do, In Progress, Completed with Green Bar */}
                          {isTreeExpanded && (
                            <div className="mt-1 space-y-1 pl-2 border-l-2 border-slate-200/80 ml-2 py-0.5 text-[11px]">
                              {/* To-Do */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProjectId(proj.id);
                                  setMainView('tasks');
                                  setSelectedSidebarNav('status_todo');
                                }}
                                className={cn(
                                  'flex w-full items-center justify-between px-2 py-1 rounded-lg transition font-medium',
                                  isProjActive && selectedSidebarNav === 'status_todo'
                                    ? 'bg-teal-50 text-teal-800 font-bold'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                )}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#14B8A6]" />
                                  To-do
                                </span>
                                <span className="font-bold text-slate-600">{proj.todoTasks}</span>
                              </button>

                              {/* In Progress */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProjectId(proj.id);
                                  setMainView('tasks');
                                  setSelectedSidebarNav('status_in_progress');
                                }}
                                className={cn(
                                  'flex w-full items-center justify-between px-2 py-1 rounded-lg transition font-medium',
                                  isProjActive && selectedSidebarNav === 'status_in_progress'
                                    ? 'bg-blue-50 text-blue-800 font-bold'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                )}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
                                  In progress
                                </span>
                                <span className="font-bold text-slate-600">{proj.inProgressTasks}</span>
                              </button>

                              {/* Completed with Green Completion Bar and Number */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProjectId(proj.id);
                                  setMainView('tasks');
                                  setSelectedSidebarNav('status_done');
                                }}
                                className={cn(
                                  'flex w-full flex-col gap-1 px-2 py-1.5 rounded-lg transition text-left',
                                  isProjActive && selectedSidebarNav === 'status_done'
                                    ? 'bg-emerald-50 text-emerald-900 font-bold'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                )}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                                    Completed
                                  </span>
                                  <span className="font-extrabold text-emerald-700">
                                    {proj.doneTasks}/{proj.totalTasks} ({proj.progressPct}%)
                                  </span>
                                </div>
                                {/* Green Completion Progress Bar */}
                                <div className="h-1.5 w-full rounded-full bg-slate-200/80 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                    style={{ width: `${proj.progressPct}%` }}
                                  />
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>Active Scope</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <p className="mt-1 text-[10px] text-slate-400 truncate">
                {selectedProjectId === 'all' ? 'All Connected Projects' : activeProject?.name || 'Selected Project'}
              </p>
            </div>
          </aside>
        )}

        {/* 3. DYNAMIC MAIN WORKSPACE: DASHBOARD | PROJECTS GRID | TASK VIEW */}
        <main className="flex-1 overflow-y-auto p-5 sm:p-6 flex flex-col gap-5">
          {/* =========================================================
              VIEW 1: DASHBOARD OVERVIEW VIEW
             ========================================================= */}
          {mainView === 'dashboard' && (
            <div className="space-y-6">
              {/* Dashboard Hero Banner */}
              <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#800F2F] via-[#90133B] to-[#5C0A22] p-6 text-white shadow-sm flex flex-col justify-center min-h-[140px]">
                <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-rose-500/20 blur-3xl" />
                <div className="pointer-events-none absolute right-40 -bottom-10 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />

                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-100">
                        Executive Overview
                      </span>
                    </div>
                    <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl">
                      {timeGreeting}, {displayName || 'Naman'}
                    </h1>
                    <p className="mt-1 text-xs font-medium text-rose-100">
                      You have {dashboardMetrics.totalTasks} tasks across {dashboardMetrics.totalProjects} active projects with {dashboardMetrics.completionRate}% completion rate.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() => setIsCreateProjectOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-2xl bg-white/15 px-3.5 py-2.5 text-xs font-bold text-white backdrop-blur-md hover:bg-white/25 active:scale-95 transition"
                    >
                      <FolderPlus className="h-4 w-4" />
                      New Project
                    </button>
                    <button
                      type="button"
                      onClick={() => openCreateTaskModal()}
                      className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-md hover:bg-rose-50 active:scale-95 transition"
                    >
                      <Plus className="h-4 w-4 text-slate-900" />
                      Create Task
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 High-Level Metric KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-3xl bg-white p-5 border border-slate-100 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Connected Projects</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <FolderKanban className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-black text-slate-900">{dashboardMetrics.totalProjects}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">Active workspace initiatives</p>
                </div>

                <div className="rounded-3xl bg-white p-5 border border-slate-100 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Total Project Tasks</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <CheckSquare className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-black text-slate-900">{dashboardMetrics.totalTasks}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-emerald-600">{dashboardMetrics.completedTasks} completed</span>
                    <span className="text-[11px] text-slate-300">•</span>
                    <span className="text-[11px] font-medium text-slate-400">{dashboardMetrics.completionRate}% rate</span>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-5 border border-slate-100 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">In Progress & Review</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                      <Clock className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-black text-slate-900">{dashboardMetrics.ongoingTasks + dashboardMetrics.inReviewTasks}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">{dashboardMetrics.inReviewTasks} ready for sprint review</p>
                </div>

                <div className="rounded-3xl bg-white p-5 border border-slate-100 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Pending & Overdue</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-black text-slate-900">{dashboardMetrics.overdueTasks}</p>
                  <p className="mt-1 text-[11px] font-medium text-rose-500">Needs immediate attention</p>
                </div>
              </div>

              {/* Projects Breakdown & Progress */}
              <div className="rounded-3xl bg-white p-6 border border-slate-100 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Projects Progress & Workload</h3>
                    <p className="text-xs text-slate-400 font-medium">Real-time status across each active project sprint</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMainView('projects')}
                    className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
                  >
                    View All Projects <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {projectStats.map((proj) => (
                    <div
                      key={proj.id}
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setMainView('tasks');
                      }}
                      className="group cursor-pointer rounded-2xl bg-slate-50/70 p-4 border border-slate-100 hover:bg-slate-100/80 hover:border-slate-200 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-brand-600 transition">
                            {proj.name}
                          </h4>
                          <p className="text-xs text-slate-400 font-medium">{proj.description || 'Sprint & tasks container'}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-900">{proj.progressPct}%</span>
                          <p className="text-[10px] text-slate-400">{proj.doneTasks}/{proj.totalTasks} tasks done</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-gradient-to-r from-brand-600 to-indigo-600 transition-all duration-300"
                          style={{ width: `${proj.progressPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              VIEW 2: PROJECTS VIEW (PROJECTS GRID / MANAGEMENT)
             ========================================================= */}
          {mainView === 'projects' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">Projects Directory</h2>
                  <p className="text-xs font-medium text-slate-400">
                    Select a project to inspect its tasks, kanban board, and delivery timeline.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-slate-800 active:scale-95 transition self-start"
                >
                  <Plus className="h-4 w-4" />
                  Create New Project
                </button>
              </div>

              {/* Projects Grid */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {projectStats.map((proj) => {
                  const isSelected = selectedProjectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      className={cn(
                        'group rounded-3xl bg-white p-5 shadow-sm border transition flex flex-col justify-between gap-4',
                        isSelected ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200/90 hover:border-slate-300 hover:shadow-md'
                      )}
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 font-extrabold text-base border border-brand-100 shadow-2xs">
                              📁
                            </span>
                            <div>
                              <h3 className="text-sm font-black text-slate-900 group-hover:text-brand-600 transition">
                                {proj.name}
                              </h3>
                              <p className="text-[11px] text-slate-400 font-medium">Created: {formatDateDisplay(proj.createdAt)}</p>
                            </div>
                          </div>

                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {proj.totalTasks} Tasks
                          </span>
                        </div>

                        <p className="mt-3 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {proj.description || 'Active product initiative with full task management.'}
                        </p>

                        {/* Progress */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1.5">
                            <span>Completion</span>
                            <span>{proj.progressPct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full bg-brand-600 transition-all duration-300"
                              style={{ width: `${proj.progressPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Task Breakdown Pills */}
                        <div className="mt-3 flex items-center gap-2 text-[10px] font-bold">
                          <span className="rounded-md bg-teal-50 px-2 py-0.5 text-teal-700">{proj.todoTasks} Todo</span>
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-blue-700">{proj.inProgressTasks} Ongoing</span>
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">{proj.doneTasks} Done</span>
                        </div>
                      </div>

                      {/* Card Action Footer */}
                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            setMainView('tasks');
                          }}
                          className="inline-flex items-center gap-1 text-xs font-extrabold text-brand-600 hover:text-brand-800 transition"
                        >
                          Open Tasks Board <ArrowRight className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToDelete(proj);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title={`Delete ${proj.name} & all tasks`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(proj.id);
                              openCreateTaskModal('todo', proj.id);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
                            title="Add Task to this Project"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================
              VIEW 3: TASKS VIEW (INSIDE PROJECT) - BOARD / LIST / CALENDAR
             ========================================================= */}
          {mainView === 'tasks' && (
            <div className="space-y-5">
              {/* Project Title Banner */}
              <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#800F2F] via-[#90133B] to-[#5C0A22] p-6 text-white shadow-sm flex flex-col justify-center min-h-[140px]">
                <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-rose-500/20 blur-3xl" />
                <div className="pointer-events-none absolute right-40 -bottom-10 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />

                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-rose-200 tracking-wide">
                      Dashboard &gt; Projects &gt; {activeProject?.name || (projects.length === 0 ? 'No Projects' : 'All Projects')} &gt; Tasks
                    </p>
                    <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl">
                      {activeProject ? activeProject.name : `${timeGreeting}, ${displayName || 'Naman'}`}
                    </h1>
                    <p className="mt-1 text-xs font-medium text-rose-100">
                      {projects.length === 0
                        ? 'Create a project to start organizing tasks, sprints, and deliverables.'
                        : activeProject?.description || 'What do you plan to do today?'}
                    </p>
                  </div>

                  {projects.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setIsCreateProjectOpen(true)}
                      className="inline-flex items-center gap-2 self-start rounded-2xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-md hover:bg-rose-50 active:scale-95 transition"
                    >
                      <Plus className="h-4 w-4 text-slate-900" />
                      Create Project
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCreateTaskModal()}
                      className="inline-flex items-center gap-2 self-start rounded-2xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-md hover:bg-rose-50 active:scale-95 transition"
                    >
                      <Plus className="h-4 w-4 text-slate-900" />
                      Create Task
                    </button>
                  )}
                </div>
              </div>

              {projects.length === 0 ? (
                <div className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white p-8 text-center shadow-xs">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-3xl text-brand-600 mb-4 border border-brand-100 shadow-2xs">
                    📁
                  </div>
                  <h3 className="text-lg font-black text-slate-900">No Projects Created Yet</h3>
                  <p className="mt-1.5 max-w-md text-xs font-medium text-slate-500 leading-relaxed">
                    Tasks live inside projects. Create your first project to start organizing your sprints, assigning team tasks, and tracking completion rates.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsCreateProjectOpen(true)}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-slate-800 active:scale-95 transition"
                  >
                    <Plus className="h-4 w-4" />
                    Create First Project
                  </button>
                </div>
              ) : (
                <>

              {/* View Switchers & Filter Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center rounded-2xl bg-white p-1 border border-slate-200/90 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('board')}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition',
                      activeTab === 'board'
                        ? 'bg-[#F1F5F9] text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <Kanban className="h-4 w-4 text-slate-700" />
                    Board
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition',
                      activeTab === 'list'
                        ? 'bg-[#F1F5F9] text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <List className="h-4 w-4 text-slate-700" />
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('calendar')}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition',
                      activeTab === 'calendar'
                        ? 'bg-[#F1F5F9] text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 text-slate-700" />
                    Calendar
                  </button>
                </div>

                {/* Right Toolbar Actions */}
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  {selectedUserFilter !== 'all' && (
                    <span className="flex items-center gap-1 rounded-xl bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-700 border border-brand-200">
                      <UserCheck className="h-3.5 w-3.5" />
                      {selectedUserFilter}
                      <button
                        type="button"
                        onClick={() => setSelectedUserFilter('all')}
                        className="ml-1 text-brand-500 hover:text-brand-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}

                  {/* Sort Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setSortMenuOpen(!sortMenuOpen);
                        setFilterMenuOpen(false);
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 border border-slate-200 hover:bg-slate-50 shadow-2xs transition"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
                      Sort
                    </button>

                    {sortMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 mt-2 w-44 rounded-2xl bg-white p-2 shadow-xl border border-slate-200 z-30 space-y-1 text-xs animate-in fade-in"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSortBy('date');
                            setSortMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-medium transition',
                            sortBy === 'date' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          <span>Due Date</span>
                          {sortBy === 'date' && <Check className="h-3.5 w-3.5 text-brand-600" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSortBy('priority');
                            setSortMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-medium transition',
                            sortBy === 'priority' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          <span>Priority Level</span>
                          {sortBy === 'priority' && <Check className="h-3.5 w-3.5 text-brand-600" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSortBy('title');
                            setSortMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-medium transition',
                            sortBy === 'title' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          <span>Alphabetical</span>
                          {sortBy === 'title' && <Check className="h-3.5 w-3.5 text-brand-600" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filter Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterMenuOpen(!filterMenuOpen);
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 border border-slate-200 hover:bg-slate-50 shadow-2xs transition',
                        (selectedPriority !== 'all' || selectedModule !== 'all' || selectedUserFilter !== 'all') &&
                          'border-brand-500 text-brand-700 bg-brand-50/50'
                      )}
                    >
                      <Filter className="h-3.5 w-3.5 text-slate-500" />
                      Filter
                    </button>

                    {filterMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 mt-2 w-56 rounded-2xl bg-white p-3.5 shadow-xl border border-slate-200 z-30 space-y-3 text-xs animate-in fade-in"
                      >
                        <div>
                          <span className="block font-bold text-slate-400 text-[10px] uppercase">Assignee / User</span>
                          <select
                            value={selectedUserFilter}
                            onChange={(e) => setSelectedUserFilter(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-1.5 text-xs font-semibold focus:outline-hidden"
                          >
                            <option value="all">All Team Members</option>
                            {teamMembers.map((m) => (
                              <option key={m.userId} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <span className="block font-bold text-slate-400 text-[10px] uppercase">Priority</span>
                          <select
                            value={selectedPriority}
                            onChange={(e) => setSelectedPriority(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-1.5 text-xs font-semibold focus:outline-hidden"
                          >
                            <option value="all">All Priorities</option>
                            <option value="urgent">Urgent</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </div>

                        <div>
                          <span className="block font-bold text-slate-400 text-[10px] uppercase">Module</span>
                          <select
                            value={selectedModule}
                            onChange={(e) => setSelectedModule(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-1.5 text-xs font-semibold focus:outline-hidden"
                          >
                            <option value="all">All Modules</option>
                            <option value="Web Push">Web Push</option>
                            <option value="Campaigns">Campaigns</option>
                            <option value="Audiences">Audiences</option>
                            <option value="Schemas">Schemas</option>
                            <option value="Journeys">Journeys</option>
                            <option value="General">General</option>
                          </select>
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPriority('all');
                              setSelectedModule('all');
                              setSelectedUserFilter('all');
                              setFilterMenuOpen(false);
                            }}
                            className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                          >
                            Reset Filters
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Kanban Board View */}
              {activeTab === 'board' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 flex-1">
                  {KANBAN_COLUMNS.map((col) => {
                    const colTasks = filteredTasks.filter((t) => t.status === col.id);
                    const isDragOver = dragOverColId === col.id;

                    return (
                      <div
                        key={col.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverColId(col.id);
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setDragOverColId(col.id);
                        }}
                        onDragLeave={(e) => {
                          if (e.currentTarget === e.target) {
                            setDragOverColId(null);
                          }
                        }}
                        onDrop={(e) => handleColumnDrop(e, col.id)}
                        className={cn(
                          'flex flex-col rounded-[22px] bg-[#F1F3F9]/70 p-3.5 transition-colors duration-150',
                          isDragOver && 'bg-blue-100/70 ring-2 ring-blue-500 ring-inset'
                        )}
                      >
                        {/* Column Header */}
                        <div className="mb-3.5 flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex h-5.5 w-5.5 items-center justify-center rounded-full text-xs font-black shadow-2xs',
                                col.badgeBg,
                                col.badgeText
                              )}
                            >
                              {colTasks.length}
                            </span>
                            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                              {col.label}
                            </h3>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openCreateTaskModal(col.id)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                              title={`Add task to ${col.label}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Column Task Cards */}
                        <div className="flex-1 space-y-3 overflow-y-auto pr-0.5">
                          {colTasks.length === 0 ? (
                            <div className="flex h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/40 p-4 text-center">
                              <p className="text-xs font-bold text-slate-400">No tasks in {col.label}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Drag tasks here</p>
                            </div>
                          ) : (
                            colTasks.map((task) => {
                              const visual = getTaskVisual(task.title, task.module, task.iconEmoji);
                              const totalSt = task.subtasks?.length || 0;
                              const completedSt = task.subtasks?.filter((s) => s.completed).length || 0;
                              const attachCount = task.attachmentsCount ?? 0;
                              const commentsCount = task.commentsCount ?? (task.comments ? task.comments.length : 0);
                              const assignedMember = teamMembers.find(
                                (m) => m.name.toLowerCase() === task.assignee.toLowerCase()
                              );

                              const priorityStyle =
                                task.priority === 'urgent' || task.priority === 'high'
                                ? 'bg-[#FFF4ED] text-[#E05638] border border-[#FFD4C2]'
                                : task.priority === 'medium'
                                ? 'bg-[#E8FBFB] text-[#0D9488] border border-[#BCEAEA]'
                                : 'bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]';

                              return (
                                <div
                                  key={task.id}
                                  draggable={true}
                                  onDragStart={(e) => handleTaskDragStart(e, task.id)}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'copy';
                                  }}
                                  onDrop={(e) => handleTaskCardDrop(e, task)}
                                  onClick={() => openDetailModal(task)}
                                  className={cn(
                                    'group cursor-grab active:cursor-grabbing rounded-[20px] bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-slate-100/90 transition-all duration-150',
                                    'hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 flex flex-col justify-between gap-3.5',
                                    draggedTaskId === task.id && 'opacity-50 scale-95'
                                  )}
                                >
                                  <div className="flex items-start gap-3">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openAvatarModal(task, 'icon');
                                      }}
                                      className={cn(
                                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl shadow-2xs border transition hover:scale-110 active:scale-95 cursor-pointer',
                                        visual.bg,
                                        visual.border
                                      )}
                                      title="Task Avatar (Click for 3D emoji customizer)"
                                    >
                                      {visual.emoji}
                                    </button>

                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-black text-slate-900 leading-snug truncate group-hover:text-brand-600 transition">
                                        {task.title}
                                      </h4>
                                      <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                                        {formatDateDisplay(task.dueDate)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-4 text-[11px] font-bold text-slate-600">
                                    <div className="flex items-center gap-1" title="Attached assets">
                                      <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                                      <span>{attachCount}</span>
                                    </div>

                                    <div className="flex items-center gap-1" title="Subtasks completed">
                                      <CheckSquare className="h-3.5 w-3.5 text-slate-400" />
                                      <span>{`${completedSt}/${totalSt}`}</span>
                                    </div>

                                    <div className="flex items-center gap-1" title="Comments & Discussions">
                                      <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                                      <span>{commentsCount}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                                    <span
                                      className={cn(
                                        'rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize',
                                        priorityStyle
                                      )}
                                    >
                                      {task.priority}
                                    </span>

                                    {/* Assignee Avatar from Access Management + 1-Click Status Dropdown */}
                                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openAvatarModal(task, 'assignee');
                                        }}
                                        title={`Assigned to ${task.assignee} (Click to open team profile & 1-click reassign)`}
                                        className="cursor-pointer hover:scale-115 transition transform active:scale-95"
                                      >
                                        <Avatar
                                          name={task.assignee}
                                          seed={task.assignee}
                                          src={assignedMember?.avatarUrl}
                                          size="xs"
                                        />
                                      </button>

                                      <select
                                        value={task.status}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          const nextStatus = e.target.value as TaskStatus;
                                          queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
                                            old.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
                                          );
                                          saveMutation.mutate({
                                            ...task,
                                            status: nextStatus,
                                          });
                                        }}
                                        className="rounded-lg border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] font-bold text-slate-600 focus:outline-hidden"
                                      >
                                        <option value="todo">To-do</option>
                                        <option value="in_progress">Ongoing</option>
                                        <option value="in_review">In review</option>
                                        <option value="done">Completed</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* List View */}
              {activeTab === 'list' && (
                <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Task Title</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Due Date</th>
                        <th className="px-4 py-3">Assignee</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {filteredTasks.map((t) => {
                        const assignedMember = teamMembers.find(
                          (m) => m.name.toLowerCase() === t.assignee.toLowerCase()
                        );
                        return (
                          <tr
                            key={t.id}
                            onClick={() => openDetailModal(t)}
                            className="hover:bg-slate-50 cursor-pointer transition"
                          >
                            <td className="px-4 py-3.5 font-bold text-slate-900">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAvatarModal(t, 'icon');
                                  }}
                                  className="text-base hover:scale-125 transition cursor-pointer"
                                  title="Change task emoji avatar"
                                >
                                  {getTaskVisual(t.title, t.module, t.iconEmoji).emoji}
                                </button>
                                <span>{t.title}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold capitalize text-slate-800">
                                {t.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 capitalize font-bold">{t.priority}</td>
                            <td className="px-4 py-3.5">{formatDateDisplay(t.dueDate)}</td>
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAvatarModal(t, 'assignee');
                                }}
                                className="flex items-center gap-2 hover:opacity-80 transition cursor-pointer"
                                title="Click to view assignee profile and 1-click reassign"
                              >
                                <Avatar
                                  name={t.assignee}
                                  seed={t.assignee}
                                  src={assignedMember?.avatarUrl}
                                  size="xs"
                                />
                                <span className="font-semibold text-slate-800">{t.assignee}</span>
                              </button>
                            </td>
                            <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => deleteMutation.mutate(t.id)}
                                  className="p-1 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Calendar View */}
              {activeTab === 'calendar' && (
                <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">Project Delivery Calendar</h3>
                    <span className="text-xs font-semibold text-slate-500">
                      {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>

                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 border-b border-slate-100 pb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2 pt-3">
                    {Array.from({ length: 31 }).map((_, i) => {
                      const dayNum = i + 1;
                      const hasTasks = filteredTasks.filter((t) => {
                        const d = new Date(t.dueDate);
                        return d.getDate() === dayNum;
                      });

                      return (
                        <div
                          key={dayNum}
                          className={cn(
                            'h-20 rounded-2xl border p-1.5 text-left flex flex-col justify-between transition',
                            hasTasks.length > 0
                              ? 'border-brand-300 bg-brand-50/40'
                              : 'border-slate-100 bg-slate-50/50'
                          )}
                        >
                          <span className="text-[10px] font-bold text-slate-500">{dayNum}</span>
                          {hasTasks.map((ht) => (
                            <div
                              key={ht.id}
                              onClick={() => openDetailModal(ht)}
                              className="cursor-pointer rounded-md bg-white p-1 text-[9px] font-bold text-slate-800 shadow-2xs truncate hover:text-brand-600"
                            >
                              {ht.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
        </main>
      </div>

      {/* Task Detail Modal */}
      {detailTask && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs" onClick={() => setDetailTask(null)} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 z-10 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openAvatarModal(detailTask, 'icon')}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl text-2xl border shadow-2xs hover:scale-110 active:scale-95 transition cursor-pointer',
                    getTaskVisual(detailTask.title, detailTask.module, detailTask.iconEmoji).bg,
                    getTaskVisual(detailTask.title, detailTask.module, detailTask.iconEmoji).border
                  )}
                  title="Click to customize task emoji avatar"
                >
                  {getTaskVisual(detailTask.title, detailTask.module, detailTask.iconEmoji).emoji}
                </button>
                <div>
                  <h3 className="text-lg font-black text-slate-900">{detailTask.title}</h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Due: {formatDateDisplay(detailTask.dueDate)} • {detailTask.module}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    deleteMutation.mutate(detailTask.id);
                    setDetailTask(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition"
                  title="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTask(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl bg-slate-50 p-2.5 border border-slate-100">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Project</label>
                <select
                  value={detailTask.projectId || ''}
                  onChange={(e) => {
                    const nextProjId = e.target.value;
                    const updated = { ...detailTask, projectId: nextProjId };
                    setDetailTask(updated);
                    queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
                      old.map((t) => (t.id === updated.id ? { ...t, projectId: nextProjId } : t))
                    );
                    saveMutation.mutate(updated);
                  }}
                  className="mt-1 w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden truncate cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl bg-slate-50 p-2.5 border border-slate-100">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Column</label>
                <select
                  value={detailTask.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as TaskStatus;
                    const updated = { ...detailTask, status: nextStatus };
                    setDetailTask(updated);
                    queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
                      old.map((t) => (t.id === updated.id ? { ...t, status: nextStatus } : t))
                    );
                    saveMutation.mutate(updated);
                  }}
                  className="mt-1 w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                >
                  <option value="todo">To-do</option>
                  <option value="in_progress">Ongoing</option>
                  <option value="in_review">In review</option>
                  <option value="done">Completed</option>
                </select>
              </div>

              <div className="rounded-2xl bg-slate-50 p-2.5 border border-slate-100">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Priority</label>
                <select
                  value={detailTask.priority}
                  onChange={(e) => {
                    const nextPriority = e.target.value as TaskPriority;
                    const updated = { ...detailTask, priority: nextPriority };
                    setDetailTask(updated);
                    queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
                      old.map((t) => (t.id === updated.id ? { ...t, priority: nextPriority } : t))
                    );
                    saveMutation.mutate(updated);
                  }}
                  className="mt-1 w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className="rounded-2xl bg-slate-50 p-2.5 border border-slate-100">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Assignee</label>
                <select
                  value={detailTask.assignee}
                  onChange={(e) => {
                    const nextAssignee = e.target.value;
                    const nextUid = memberByName(nextAssignee)?.userId ?? null;
                    const updated = { ...detailTask, assignee: nextAssignee, assigneeUserId: nextUid };
                    setDetailTask(updated);
                    queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
                      old.map((t) => (t.id === updated.id ? { ...t, assignee: nextAssignee, assigneeUserId: nextUid } : t))
                    );
                    saveMutation.mutate(updated);
                    notifyAssignee(updated, nextAssignee);
                  }}
                  className="mt-1 w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                >
                  {teamMembers.map((m) => (
                    <option key={m.userId} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-bold text-slate-700">Description & Scope</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                {detailTask.description || 'No detailed description provided for this project item.'}
              </p>
            </div>

            <div className="mt-5">
              <h4 className="text-xs font-bold text-slate-800">
                Checklist Subtasks ({detailTask.subtasks?.filter((s) => s.completed).length || 0}/
                {detailTask.subtasks?.length || 0})
              </h4>

              <div className="mt-2.5 space-y-2">
                {(detailTask.subtasks || []).map((st) => (
                  <div
                    key={st.id}
                    onClick={() => toggleDetailSubtask(st.id)}
                    className={cn(
                      'flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer border transition',
                      st.completed
                        ? 'bg-emerald-50/40 border-emerald-200 text-slate-400 line-through'
                        : 'bg-white border-slate-200/80 text-slate-800 hover:border-slate-400'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'h-4 w-4 rounded-md border flex items-center justify-center text-[10px]',
                          st.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                        )}
                      >
                        {st.completed && <Check className="h-3 w-3" />}
                      </div>
                      <span className="text-xs font-semibold">{st.title}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Add a new checklist step…"
                  value={newSubtaskInput}
                  onChange={(e) => setNewSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubtaskToDetail(newSubtaskInput);
                      setNewSubtaskInput('');
                    }
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    addSubtaskToDetail(newSubtaskInput);
                    setNewSubtaskInput('');
                  }}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Add Step
                </button>
              </div>
            </div>

            {/* Discussion & Mentions */}
            <div className="mt-6 border-t border-slate-100 pt-4 relative">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800">Team Activity & Discussion</h4>
                <span className="text-[10px] text-slate-400 font-medium">Type @ to mention & assign teammate</span>
              </div>

              <div className="mt-3 space-y-2 max-h-36 overflow-y-auto">
                {taskComments.map((c) => {
                  const commentAuthor = teamMembers.find(
                    (m) => m.name.toLowerCase() === c.user.toLowerCase()
                  );
                  return (
                    <div key={c.id} className="rounded-2xl bg-slate-50 p-2.5 border border-slate-100">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Avatar
                            name={c.user}
                            seed={c.user}
                            src={commentAuthor?.avatarUrl}
                            size="xs"
                          />
                          <span className="font-bold text-slate-800">{c.user}</span>
                        </div>
                        <span className="text-slate-400">{c.time}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600 pl-6">{c.text}</p>
                    </div>
                  );
                })}
              </div>

              {/* @ Mention Menu */}
              {showMentionMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-12 left-0 w-64 rounded-2xl bg-white p-2 shadow-2xl border border-slate-200 z-40 animate-in fade-in"
                >
                  <span className="block px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">
                    Mention & Assign Teammate
                  </span>
                  <div className="space-y-0.5 mt-1 max-h-32 overflow-y-auto">
                    {teamMembers
                      .filter(
                        (m) =>
                          !mentionQuery ||
                          m.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                          m.email.toLowerCase().includes(mentionQuery.toLowerCase())
                      )
                      .map((m) => (
                        <button
                          key={m.userId}
                          type="button"
                          onClick={() => selectMentionMember(m)}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 transition"
                        >
                          <Avatar
                            name={m.name}
                            email={m.email}
                            seed={m.userId}
                            src={m.avatarUrl}
                            size="xs"
                          />
                          <div className="truncate">
                            <span className="font-bold text-slate-900 block">{m.name}</span>
                            <span className="text-[9px] text-slate-400">{m.roleName}</span>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Write comment or type @ to mention/assign teammate…"
                    value={newCommentInput}
                    onChange={(e) => handleCommentChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !showMentionMenu) {
                        e.preventDefault();
                        postComment();
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={postComment}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 transition"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Creation Modal */}
      {isCreateProjectOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs" onClick={() => setIsCreateProjectOpen(false)} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 z-10 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-brand-600" />
                <h3 className="text-base font-extrabold text-slate-900">Create New Project</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateProjectOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mobile App Redesign / Web Push Expansion"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Objectives, deliverables, or team scope…"
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-hidden"
                />
              </div>

              {projectSaveError && (
                <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700">
                  {projectSaveError}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingProject || !newProjectName.trim()}
                  className="rounded-xl bg-slate-950 px-5 py-2 font-bold text-white shadow-md hover:bg-slate-800 transition disabled:opacity-50"
                >
                  {creatingProject ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Creation Modal */}
      {isCreateTaskOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs" onClick={() => setIsCreateTaskOpen(false)} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 z-10 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-brand-50 text-brand-600 text-sm">
                  {taskForm.iconEmoji || '✨'}
                </span>
                <h3 className="text-base font-extrabold text-slate-900">Create Project Task</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateTaskOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="mt-4 space-y-3.5 text-xs">
              {/* Assigned Project */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Assigned Project *</label>
                {projects.length === 0 ? (
                  <div className="rounded-xl bg-amber-50 p-2.5 border border-amber-200 text-amber-800 font-medium text-xs flex items-center justify-between">
                    <span>No projects found. Please create a project first.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateTaskOpen(false);
                        setIsCreateProjectOpen(true);
                      }}
                      className="font-bold underline text-amber-900"
                    >
                      Create Project
                    </button>
                  </div>
                ) : (
                  <select
                    required
                    value={taskForm.projectId || projects[0]?.id || ''}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, projectId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-hidden"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Productivity Task / Campaign Setup"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden"
                />
              </div>

              {/* Task Icon / Avatar Selector (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-slate-700">
                    Task Icon / Avatar <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  {taskForm.iconEmoji && (
                    <button
                      type="button"
                      onClick={() => setTaskForm((prev) => ({ ...prev, iconEmoji: '' }))}
                      className="text-[10px] font-bold text-brand-600 hover:text-brand-800"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-50 p-2 border border-slate-200/80">
                  {['📓', '🚀', '🎨', '📱', '💳', '📊', '🛡️', '💻', '⚡', '🔔', '🎯', '👥', '💡', '🛍️', '⚙️', '📝', '❤️', '🏀', '📖', '✨'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setTaskForm((prev) => ({ ...prev, iconEmoji: emoji }))}
                      className={cn(
                        'flex h-7.5 w-7.5 items-center justify-center rounded-xl text-sm transition hover:scale-110 active:scale-95',
                        taskForm.iconEmoji === emoji
                          ? 'bg-white shadow-md ring-2 ring-brand-500 scale-110 font-bold'
                          : 'hover:bg-white/80 text-slate-700'
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Provide details or scope for this task…"
                  value={taskForm.description}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Column Status</label>
                  <select
                    value={taskForm.status}
                    onChange={(e) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        status: e.target.value as TaskStatus,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-hidden"
                  >
                    <option value="todo">To-do</option>
                    <option value="in_progress">Ongoing</option>
                    <option value="in_review">In review</option>
                    <option value="done">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        priority: e.target.value as TaskPriority,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-hidden"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Module / Scope</label>
                  <select
                    value={taskForm.module}
                    onChange={(e) =>
                      setTaskForm((prev) => ({
                        ...prev,
                        module: e.target.value as TaskItem['module'],
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold focus:outline-hidden"
                  >
                    <option value="Web Push">Web Push</option>
                    <option value="Campaigns">Campaigns</option>
                    <option value="Audiences">Audiences</option>
                    <option value="Schemas">Schemas</option>
                    <option value="Journeys">Journeys</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assignee</label>
                <select
                  value={taskForm.assignee}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, assignee: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:outline-hidden"
                >
                  {teamMembers.map((m) => (
                    <option key={m.userId} value={m.name}>
                      {m.name} ({m.roleName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3.5">
                <button
                  type="button"
                  onClick={() => setIsCreateTaskOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={projects.length === 0}
                  className="rounded-xl bg-slate-950 px-5 py-2 font-bold text-white shadow-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Create Project Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" onClick={() => setProjectToDelete(null)} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 z-10 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 shadow-2xs shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Project?</h3>
                <p className="text-xs text-slate-500 font-medium">This will delete the project and all tasks inside it.</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-rose-50/60 p-3.5 border border-rose-100 text-xs text-rose-800">
              <p className="font-bold">Warning: Permanent deletion</p>
              <p className="mt-1 text-[11px] text-rose-700 leading-relaxed">
                You are about to delete <strong>"{projectToDelete.name}"</strong>. All associated tasks, subtasks, checklists, and discussions will be permanently deleted.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteProject(projectToDelete)}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-extrabold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition"
              >
                Delete Project & All Tasks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Glassmorphic Task Avatar Modal */}
      {avatarModal.isOpen && avatarModal.task && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
          {/* Glass Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md transition-all animate-in fade-in duration-200"
            onClick={() => setAvatarModal({ isOpen: false, task: null, type: 'assignee' })}
          />

          {/* Glassmorphism Card */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white/80 dark:bg-slate-900/85 backdrop-blur-2xl p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] border border-white/70 dark:border-white/10 z-10 animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Ambient colorful glow spheres */}
            <div className="pointer-events-none absolute -top-12 -left-12 h-44 w-44 rounded-full bg-rose-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-36 w-36 rounded-full bg-amber-400/15 blur-2xl" />

            <div className="relative z-10">
              {/* Header with Switcher Tabs & Close */}
              <div className="flex items-center justify-between border-b border-slate-200/50 pb-3.5">
                <div className="flex items-center gap-1 rounded-2xl bg-slate-100/80 p-1 border border-white/60 backdrop-blur-xs">
                  <button
                    type="button"
                    onClick={() => setAvatarModal((prev) => ({ ...prev, type: 'assignee' }))}
                    className={cn(
                      'rounded-xl px-3 py-1.5 text-xs font-black transition',
                      avatarModal.type === 'assignee'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    👤 Team Assignee
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarModal((prev) => ({ ...prev, type: 'icon' }))}
                    className={cn(
                      'rounded-xl px-3 py-1.5 text-xs font-black transition',
                      avatarModal.type === 'icon'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    ✨ Task Avatar
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setAvatarModal({ isOpen: false, task: null, type: 'assignee' })}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* VIEW 1: ASSIGNEE PROFILE & 1-CLICK REASSIGN */}
              {avatarModal.type === 'assignee' && (() => {
                const assignedMember = teamMembers.find(
                  (m) => m.name.toLowerCase() === avatarModal.task!.assignee.toLowerCase()
                );
                const memberTasks = validTasks.filter(
                  (t) => t.assignee.toLowerCase() === avatarModal.task!.assignee.toLowerCase()
                );
                const doneCount = memberTasks.filter((t) => t.status === 'done').length;

                return (
                  <div className="mt-4 space-y-4">
                    {/* Glass Profile Header */}
                    <div className="flex items-center gap-4 rounded-2xl bg-white/70 p-4 border border-white/90 shadow-xs backdrop-blur-xs">
                      <div className="relative">
                        <div className="p-1 rounded-full bg-gradient-to-tr from-brand-500 to-rose-400 shadow-md">
                          <Avatar
                            name={avatarModal.task!.assignee}
                            seed={avatarModal.task!.assignee}
                            src={assignedMember?.avatarUrl}
                            size="lg"
                          />
                        </div>
                        <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-slate-900 truncate">
                            {avatarModal.task!.assignee}
                          </h4>
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-extrabold text-brand-700 border border-brand-200">
                            {assignedMember?.roleName || 'Team Member'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 truncate font-medium">
                          {assignedMember?.email || `${avatarModal.task!.assignee.toLowerCase().replace(/\s+/g, '.')}@company.com`}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-slate-400">
                          {memberTasks.length} tasks assigned • {doneCount} completed
                        </p>
                      </div>
                    </div>

                    {/* Quick Reassign Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                          1-Click Reassign Task
                        </label>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          Click any team member
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {teamMembers.map((m) => {
                          const isCurrent = m.name.toLowerCase() === avatarModal.task!.assignee.toLowerCase();
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              onClick={() => {
                                if (!avatarModal.task) return;
                                const updated = { ...avatarModal.task, assignee: m.name, assigneeUserId: m.userId };
                                setAvatarModal((prev) => ({ ...prev, task: updated }));
                                queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
                                  old.map((t) => (t.id === updated.id ? { ...t, assignee: m.name, assigneeUserId: m.userId } : t))
                                );
                                if (detailTask?.id === updated.id) {
                                  setDetailTask({ ...detailTask, assignee: m.name, assigneeUserId: m.userId });
                                }
                                saveMutation.mutate(updated);
                                notifyAssignee(updated, m.name);
                              }}
                              className={cn(
                                'flex items-center gap-2.5 rounded-2xl p-2.5 text-left text-xs transition border cursor-pointer',
                                isCurrent
                                  ? 'bg-brand-50/90 border-brand-300 ring-2 ring-brand-500/20 text-brand-900 font-extrabold shadow-2xs'
                                  : 'bg-white/60 hover:bg-white/95 border-white/80 text-slate-700 font-semibold hover:border-slate-300 shadow-2xs'
                              )}
                            >
                              <Avatar name={m.name} seed={m.name} src={m.avatarUrl} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold leading-tight">{m.name}</p>
                                <p className="truncate text-[10px] text-slate-400 font-medium">{m.roleName}</p>
                              </div>
                              {isCurrent && <Check className="h-4 w-4 text-brand-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Filter quick action */}
                    <div className="flex items-center gap-2 border-t border-slate-200/60 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserFilter(avatarModal.task!.assignee);
                          setAvatarModal({ isOpen: false, task: null, type: 'assignee' });
                        }}
                        className="w-full rounded-2xl bg-white/80 hover:bg-white border border-white/80 py-2.5 text-xs font-extrabold text-slate-800 shadow-sm transition active:scale-95 cursor-pointer"
                      >
                        🎯 Filter Board to {avatarModal.task!.assignee.split(' ')[0]}'s Tasks
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* VIEW 2: TASK ICON / AVATAR SELECTOR */}
              {avatarModal.type === 'icon' && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl bg-white/70 p-3.5 border border-white/90 shadow-xs backdrop-blur-xs">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl border border-brand-200 shadow-xs">
                      {avatarModal.task.iconEmoji || getTaskVisual(avatarModal.task.title, avatarModal.task.module).emoji}
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">{avatarModal.task.title}</h4>
                      <p className="text-[11px] text-slate-400 font-medium">Select a 3D avatar emoji for this task</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                      Choose 3D Emoji Avatar
                    </label>
                    <div className="grid grid-cols-6 gap-2 rounded-2xl bg-white/60 p-3 border border-white/80 backdrop-blur-xs">
                      {[
                        '📓', '🚀', '🎨', '📱', '💳', '📊',
                        '🛡️', '💻', '⚡', '🔔', '🎯', '👥',
                        '💡', '🛍️', '⚙️', '📝', '❤️', '🏀',
                        '📖', '🏕️', '🔥', '🧩', '🏆', '✨'
                      ].map((emoji) => {
                        const currentEmoji = avatarModal.task?.iconEmoji || getTaskVisual(avatarModal.task!.title, avatarModal.task!.module).emoji;
                        const isSelected = currentEmoji === emoji;

                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              if (!avatarModal.task) return;
                              const updated = { ...avatarModal.task, iconEmoji: emoji };
                              setAvatarModal((prev) => ({ ...prev, task: updated }));
                              queryClient.setQueryData<TaskItem[]>(['tasks', tenantId, environment], (old = []) =>
                                old.map((t) => (t.id === updated.id ? { ...t, iconEmoji: emoji } : t))
                              );
                              if (detailTask?.id === updated.id) {
                                setDetailTask({ ...detailTask, iconEmoji: emoji });
                              }
                              saveMutation.mutate(updated);
                            }}
                            className={cn(
                              'flex h-11 w-11 items-center justify-center rounded-2xl text-xl transition hover:scale-115 active:scale-95 cursor-pointer',
                              isSelected
                                ? 'bg-white ring-2 ring-brand-500 shadow-md font-bold scale-110'
                                : 'bg-white/60 hover:bg-white hover:shadow-sm'
                            )}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-200/60 pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setAvatarModal({ isOpen: false, task: null, type: 'assignee' })}
                      className="rounded-2xl bg-slate-950 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-95 transition cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // If embedded in dedicated page route (/projects)
  if (isEmbedded) {
    return mainPortalContent;
  }

  // Modal Render with backdrop
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      {/* Dark backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      {mainPortalContent}
    </div>
  );
}
