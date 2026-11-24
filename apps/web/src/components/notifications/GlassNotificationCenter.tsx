import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  ExternalLink,
  Sparkles,
  Zap,
  Globe,
  ShieldCheck,
  Megaphone,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchNotifications,
  markNotificationAsRead as markReadApi,
  markAllNotificationsAsRead as markAllReadApi,
  deleteNotification as deleteNotifApi,
  clearAllNotifications as clearNotifsApi,
  subscribeNotifications,
} from '@/lib/notifications';

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const CATEGORY_META = {
  web_push: {
    icon: Globe,
    label: 'Web Push',
    color: 'text-purple-600 bg-purple-100/70 border-purple-200',
    dot: 'bg-purple-500',
  },
  campaign: {
    icon: Megaphone,
    label: 'Campaign',
    color: 'text-blue-600 bg-blue-100/70 border-blue-200',
    dot: 'bg-blue-500',
  },
  system: {
    icon: Zap,
    label: 'System',
    color: 'text-emerald-600 bg-emerald-100/70 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  audience: {
    icon: Layers,
    label: 'Audience',
    color: 'text-indigo-600 bg-indigo-100/70 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  security: {
    icon: ShieldCheck,
    label: 'Security',
    color: 'text-amber-600 bg-amber-100/70 border-amber-200',
    dot: 'bg-amber-500',
  },
};

type FilterCategory = 'all' | 'unread' | 'web_push' | 'campaign' | 'system';

export function GlassNotificationCenter({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { tenantId, environment, user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterCategory>('all');

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', tenantId, environment, userId],
    queryFn: () => fetchNotifications(tenantId, environment, userId),
    enabled: Boolean(tenantId),
    refetchInterval: isOpen ? 30000 : false,
  });

  // Live INSERT stream — refresh the list the instant a notification lands
  useEffect(() => {
    if (!tenantId) return;
    const unsub = subscribeNotifications(tenantId, userId, () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return unsub;
  }, [tenantId, userId, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markReadApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllReadApi(tenantId, environment, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotifApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => clearNotifsApi(tenantId, environment, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    markReadMutation.mutate(id);
  };

  const markAllAsRead = () => {
    markAllReadMutation.mutate();
  };

  const deleteNotification = (id: string) => {
    deleteMutation.mutate(id);
  };

  const clearAll = () => {
    clearAllMutation.mutate();
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'all') return true;
    return n.category === filter;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Soft glassmorphism backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Frosted Glass Container */}
      <div
        className={cn(
          'relative w-full max-w-md overflow-hidden rounded-3xl',
          'bg-white/85 backdrop-blur-2xl',
          'border border-white/60 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25)]',
          'ring-1 ring-slate-900/10 flex flex-col max-h-[88vh] z-10'
        )}
      >
        {/* Ambient Gradient Glow Accents */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-purple-400/20 blur-3xl" />

        {/* Header */}
        <div className="relative border-b border-slate-200/60 p-5 bg-white/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-purple-600 text-white shadow-md shadow-brand-500/25">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">Notification Centre</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 border border-brand-200/60">
                    <Sparkles className="h-2.5 w-2.5" /> Live
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 border border-transparent hover:border-brand-200 transition"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Read all
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                  title="Clear all notifications"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'unread', label: `Unread (${unreadCount})` },
                { id: 'web_push', label: 'Web Push' },
                { id: 'campaign', label: 'Campaigns' },
                { id: 'system', label: 'System' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  'rounded-xl px-3 py-1 font-semibold whitespace-nowrap transition-all text-[11px]',
                  filter === item.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white/70 hover:bg-white text-slate-600 border border-slate-200/70'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredNotifications.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100/80 text-slate-400 shadow-inner">
                <Bell className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-800">No notifications in this view</p>
              <p className="mt-1 text-xs text-slate-500">
                You will receive alerts here when events, campaigns, or subscribers update.
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const meta = CATEGORY_META[n.category] || CATEGORY_META.system;
              const Icon = meta.icon;

              return (
                <div
                  key={n.id}
                  className={cn(
                    'group relative rounded-2xl p-3.5 transition-all duration-200',
                    'border backdrop-blur-md',
                    n.read
                      ? 'bg-white/50 border-slate-200/50 hover:bg-white/80 hover:border-slate-300'
                      : 'bg-white/90 border-brand-200/80 shadow-xs shadow-brand-500/5 ring-1 ring-brand-500/10 hover:bg-white'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Category Icon */}
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border',
                        meta.color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!n.read && (
                            <span className="h-2 w-2 rounded-full bg-brand-600 shrink-0" />
                          )}
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {n.title}
                          </h4>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                          {formatTimeAgo(n.timestamp)}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {n.message}
                      </p>

                      {/* Footer Actions */}
                      <div className="mt-2.5 flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold border',
                              meta.color
                            )}
                          >
                            {meta.label}
                          </span>
                          {n.badge && (
                            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                              {n.badge}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {n.actionUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                markAsRead(n.id);
                                onClose();
                                navigate(n.actionUrl!);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800 transition"
                            >
                              {n.actionLabel || 'View'}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </button>
                          )}
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => markAsRead(n.id)}
                              className="rounded p-1 text-slate-400 hover:text-brand-600 transition"
                              title="Mark as read"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteNotification(n.id)}
                            className="rounded p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                            title="Delete notification"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/60 p-3 bg-white/40 text-center">
          <p className="text-[11px] font-medium text-slate-400">
            Real-time feed connected · Marbee Engine
          </p>
        </div>
      </div>
    </div>
  );
}
