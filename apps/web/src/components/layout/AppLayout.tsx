import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, TrendingUp, Sparkles, Users, Activity, Bell, Target,
  GitBranch, Zap, Radio, BarChart3, Image, FileInput, FileUp, Globe, LayoutTemplate,
  Database, Search, Plug, Clock, Workflow, ShieldCheck, Route,
  Megaphone, PieChart, IndianRupee, Settings, Share2, Key, Lock,
  Gauge, BookOpen, Shield, ChevronDown, Building2, LineChart,
  Award, Brain, Layers, Tag, LayoutGrid, Gift, Cpu, Bot, CheckSquare, BellRing,
} from 'lucide-react';
import { NAV_SECTIONS } from '@marbee/shared';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { MarbeeLogo } from '@/components/ui';
import { WebPushProvider } from '@/components/web-push/WebPushProvider';
import { UserMenu } from '@/components/layout/UserMenu';
import { useClock, useFormattedDate } from '@/hooks/useClock';
import { GlassNotificationCenter } from '@/components/notifications/GlassNotificationCenter';
import { TaskManagerPortal } from '@/components/tasks/TaskManagerPortal';
import { fetchNotifications, subscribeNotifications } from '@/lib/notifications';
import { fetchTasks } from '@/lib/tasks';
import { CommandPalette } from '@/components/CommandPalette';
import { AiAssistantPortal } from '@/pages/AiAssistantPage';
import {
  ENV_BADGE_CLASS,
  ENV_FULL_LABEL,
  ENV_SHORT_LABEL,
} from '@/lib/environment';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, TrendingUp, Sparkles, Users, Activity, Bell, Target,
  GitBranch, Zap, Radio, BarChart3, Image, FileInput, FileUp, Globe, LayoutTemplate,
  Database, Search, Plug, Clock, Workflow, ShieldCheck, Route,
  Megaphone, PieChart, IndianRupee, Settings, Share2, Key, Lock,
  Gauge, BookOpen, Shield, LineChart, Award, Brain, Layers, Tag, LayoutGrid,
  Gift, Cpu, Bot, CheckSquare, BellRing,
};

export function Sidebar() {
  const { tenantName, environment, setEnvironment } = useAuth();
  const location = useLocation();

  // Collapsed / Expanded state for each navigation section
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('marbee_nav_collapsed_v1');
      if (stored) return JSON.parse(stored);
    } catch {}
    return {};
  });

  // Auto-expand section containing current active path
  useEffect(() => {
    const currentSection = NAV_SECTIONS.find((sec) =>
      sec.items.some((item) =>
        'path' in item &&
        (location.pathname === item.path ||
          (item.path !== '/dashboard' && item.path !== '/loyalty' && location.pathname.startsWith(item.path)))
      )
    );
    if (currentSection && collapsedSections[currentSection.title]) {
      setCollapsedSections((prev) => {
        const next = { ...prev, [currentSection.title]: false };
        try { localStorage.setItem('marbee_nav_collapsed_v1', JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [location.pathname]);

  const toggleSection = (sectionTitle: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [sectionTitle]: !prev[sectionTitle] };
      try { localStorage.setItem('marbee_nav_collapsed_v1', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white select-none">
      <div className="border-b border-slate-100 px-4 py-4">
        <MarbeeLogo size="sm" />

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Instance</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset',
                  ENV_BADGE_CLASS[environment],
                )}
              >
                {ENV_SHORT_LABEL[environment]}
              </span>
              <div className="relative flex-1">
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as typeof environment)}
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-2 pr-7 text-xs font-medium text-slate-700"
                >
                  <option value="development">{ENV_FULL_LABEL.development}</option>
                  <option value="staging">{ENV_FULL_LABEL.staging}</option>
                  <option value="production">{ENV_FULL_LABEL.production}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Building2 className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="truncate text-sm font-medium text-slate-800">
                {tenantName ?? 'Workspace'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const isCollapsed = Boolean(collapsedSections[section.title]);
          const hasActiveItem = section.items.some(
            (item) =>
              'path' in item &&
              (location.pathname === item.path ||
                (item.path !== '/dashboard' && item.path !== '/loyalty' && location.pathname.startsWith(item.path)))
          );

          return (
            <div key={section.title} className="mb-4">
              {/* Collapsible Section Header with Folding Chevron Icon */}
              <button
                type="button"
                onClick={() => toggleSection(section.title)}
                className="group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                <span className={cn(hasActiveItem && 'text-brand-700 font-extrabold')}>
                  {section.title}
                </span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:text-slate-600',
                    isCollapsed && '-rotate-90'
                  )}
                />
              </button>

              {/* Sub-module Nav Links (Foldable) */}
              {!isCollapsed && (
                <ul className="mt-1 space-y-0.5 animate-in fade-in duration-150">
                  {section.items.map((item, i) => {
                    if (!('path' in item)) {
                      return (
                        <li
                          key={`sub-${item.subheader}-${i}`}
                          className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-300 first:pt-1"
                        >
                          {item.subheader}
                        </li>
                      );
                    }
                    const Icon = ICONS[item.icon] ?? LayoutDashboard;
                    return (
                      <li key={item.path}>
                        <NavLink
                          to={item.path}
                          end={item.path === '/dashboard' || item.path === '/loyalty'}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-brand-50 text-brand-700 font-semibold'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                            )
                          }
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function useBreadcrumbs() {
  const location = useLocation();
  const path = location.pathname;
  const crumbs: { label: string; path?: string }[] = [];

  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!('path' in item) || !item.path) continue;
      if (path === item.path || (item.path !== '/dashboard' && item.path !== '/loyalty' && path.startsWith(item.path))) {
        crumbs.push({ label: section.title, path: item.path });
        crumbs.push({ label: item.label, path: item.path });
        // If current path is deeper than the nav item (e.g. /data/jobs/:id), add the tail as a crumb
        if (path !== item.path) {
          const tail = path.slice(item.path.length).replace(/^\//, '');
          if (tail && !tail.includes('/')) {
            crumbs.push({ label: tail });
          }
        }
        return crumbs;
      }
    }
  }
  return crumbs;
}

export function TopBar() {
  const clock = useClock();
  const dateLabel = useFormattedDate();
  const { tenantId, environment, user } = useAuth();
  const breadcrumbs = useBreadcrumbs();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isTaskPortalOpen, setIsTaskPortalOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);

  // Badge counts come straight from the database (RLS-scoped, per user).
  // These mount on every page, so they must never retry-storm or throw when the
  // tables are missing (e.g. before 65_tasks_projects_notifications.sql is run).
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', tenantId, environment, userId],
    queryFn: () => fetchNotifications(tenantId, environment, userId).catch(() => []),
    enabled: Boolean(tenantId),
    staleTime: 15_000,
    retry: false,
  });
  const { data: myTasks = [] } = useQuery({
    queryKey: ['tasks', tenantId, environment],
    queryFn: () => fetchTasks(tenantId, environment).catch(() => []),
    enabled: Boolean(tenantId),
    staleTime: 15_000,
    retry: false,
  });

  const unreadNotifCount = notifications.filter((n) => !n.read).length;
  const activeTaskCount = myTasks.filter(
    (t) => t.status !== 'done' && (!userId || t.assigneeUserId === userId),
  ).length;

  // Live refresh of the badge the instant a notification lands
  useEffect(() => {
    if (!tenantId) return;
    return subscribeNotifications(tenantId, userId, () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [tenantId, userId]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <nav className="hidden md:flex items-center gap-1.5 text-sm text-slate-400">
        <Link to="/" className="font-medium text-slate-600 hover:text-slate-900 transition-colors">{environment === 'production' ? 'Prod' : environment === 'staging' ? 'Staging' : 'Dev'}</Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-slate-300">›</span>
            {crumb.path ? (
              <Link to={crumb.path} className="hover:text-slate-700 transition-colors">{crumb.label}</Link>
            ) : (
              <span className="font-medium text-slate-700 truncate max-w-[200px]">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2.5">
        {/* AI Assistant Portal Button (Beside Task Manager) */}
        <button
          type="button"
          onClick={() => setIsAiAssistantOpen(true)}
          className="relative inline-flex items-center justify-center h-8.5 w-8.5 rounded-xl border border-purple-200/90 bg-purple-50/80 hover:bg-purple-100 hover:border-purple-300 text-purple-600 hover:text-purple-900 shadow-2xs hover:scale-105 active:scale-95 transition cursor-pointer"
          title="AI Assistant · We are Buddy"
        >
          <Sparkles className="h-4 w-4 text-purple-600" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
        </button>

        {/* Task Manager Portal Button */}
        <button
          type="button"
          onClick={() => setIsTaskPortalOpen(true)}
          className="relative inline-flex items-center justify-center h-8.5 w-8.5 rounded-xl border border-slate-200/90 bg-slate-50/80 hover:bg-white hover:border-slate-300 text-slate-600 hover:text-slate-900 shadow-2xs hover:scale-105 active:scale-95 transition cursor-pointer"
          title="Task & Project Manager Portal"
        >
          <CheckSquare className="h-4 w-4" />
          {activeTaskCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white ring-2 ring-white">
              {activeTaskCount}
            </span>
          )}
        </button>

        {/* Notification Bell Button */}
        <button
          type="button"
          onClick={() => setIsNotifOpen(true)}
          className="relative inline-flex items-center justify-center h-8.5 w-8.5 rounded-xl border border-slate-200/90 bg-slate-50/80 hover:bg-white hover:border-slate-300 text-slate-600 hover:text-slate-900 shadow-2xs hover:scale-105 active:scale-95 transition cursor-pointer"
          title="Glassmorphism Notification Centre"
        >
          <Bell className="h-4 w-4" />
          {unreadNotifCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
              {unreadNotifCount}
            </span>
          )}
        </button>

        <span className="hidden h-7 w-px bg-slate-200 sm:block" />

        {/* Clock & Date Timer */}
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold tabular-nums text-slate-900">{clock}</p>
          <p className="text-[11px] text-slate-500">{dateLabel}</p>
        </div>

        <span className="hidden h-8 w-px bg-slate-200 sm:block" />
        <UserMenu />
      </div>

      {/* AI Assistant Modal Portal */}
      <AiAssistantPortal
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
      />

      {/* Glassmorphism Notification Centre */}
      <GlassNotificationCenter
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
      />

      {/* Task & Project Management Portal */}
      <TaskManagerPortal
        isOpen={isTaskPortalOpen}
        onClose={() => setIsTaskPortalOpen(false)}
      />
    </header>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isTemplateStudio =
    location.pathname.startsWith('/content/templates/') &&
    location.pathname !== '/content/templates';
  const isLandingStudio =
    location.pathname.startsWith('/content/landing-pages/') &&
    location.pathname !== '/content/landing-pages';
  const isFormStudio =
    location.pathname.startsWith('/content/forms/') &&
    location.pathname !== '/content/forms';
  const isChatBotStudio =
    location.pathname.startsWith('/content/chatbots/') &&
    location.pathname !== '/content/chatbots';

  // Fold sidebar and topbar completely for full-screen immersive studio mode
  if (isTemplateStudio || isLandingStudio || isFormStudio || isChatBotStudio) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-white">
        <WebPushProvider>
          <main className="h-full w-full overflow-hidden p-0">{children}</main>
        </WebPushProvider>
      </div>
    );
  }

  const isAiAssistant = location.pathname === '/ai-assistant';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <WebPushProvider>
          <main className={cn(
            "min-w-0 flex-1",
            isAiAssistant ? "h-full overflow-hidden p-4 sm:p-5" : "overflow-y-auto p-8"
          )}>
            {children}
          </main>
        </WebPushProvider>
      </div>
      <CommandPalette />
    </div>
  );
}
