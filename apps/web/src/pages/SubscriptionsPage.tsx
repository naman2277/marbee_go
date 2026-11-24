import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Globe,
  Layers,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Trash2,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { Badge, Button, EmptyState } from '@/components/ui';
import { CreateServiceModal } from '@/components/subscriptions/CreateServiceModal';
import { useAuth } from '@/contexts/AuthContext';
import {
  channelLabel,
  createInformationService,
  deleteInformationService,
  fetchInformationServices,
  validityLabel,
  type InformationService,
  type ServiceChannel,
} from '@/lib/subscriptions';
import { cn } from '@/lib/utils';

type WorkspaceTab = 'overview' | 'services' | 'analytics';

const CHANNEL_ICONS: Record<ServiceChannel, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  web_push: Bell,
  whatsapp: MessageSquare,
  mobile_app: Smartphone,
};

const CHANNEL_COLORS: Record<ServiceChannel, { bg: string; text: string; ring: string; gradient: string }> = {
  email: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-200', gradient: 'from-blue-500 to-indigo-600' },
  sms: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-200', gradient: 'from-emerald-500 to-teal-600' },
  web_push: { bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-200', gradient: 'from-violet-500 to-purple-600' },
  whatsapp: { bg: 'bg-green-50', text: 'text-green-600', ring: 'ring-green-200', gradient: 'from-green-500 to-emerald-600' },
  mobile_app: { bg: 'bg-orange-50', text: 'text-orange-600', ring: 'ring-orange-200', gradient: 'from-orange-500 to-red-500' },
};

export function SubscriptionsPage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  const tabParam = searchParams.get('tab');
  const tab: WorkspaceTab = tabParam === 'services' || tabParam === 'analytics' ? tabParam : 'overview';
  const setTab = (t: WorkspaceTab) => setSearchParams(t === 'overview' ? {} : { tab: t }, { replace: true });

  const { data: services, isLoading } = useQuery({
    queryKey: ['information-services', tenantId, environment],
    queryFn: () => fetchInformationServices(tenantId, environment),
  });

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createInformationService>[0]) => createInformationService(input),
    onSuccess: (service) => {
      queryClient.invalidateQueries({ queryKey: ['information-services'] });
      setCreateOpen(false);
      navigate(`/subscriptions/${service.id}`);
    },
  });

  const totalSubscribers = services?.reduce((s, svc) => s + svc.subscriber_count, 0) ?? 0;
  const activeServices = services?.filter((s) => s.status === 'active').length ?? 0;
  const channelBreakdown = useMemo(() => {
    if (!services) return [];
    const map = new Map<ServiceChannel, { count: number; subscribers: number }>();
    for (const svc of services) {
      const entry = map.get(svc.channel) ?? { count: 0, subscribers: 0 };
      entry.count++;
      entry.subscribers += svc.subscriber_count;
      map.set(svc.channel, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].subscribers - a[1].subscribers);
  }, [services]);

  const tabs: { id: WorkspaceTab; label: string; icon: typeof Layers }[] = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'services', label: 'Services', icon: Bell },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
              <p className="text-sm text-gray-500 mt-1">Manage information services, opt-in/opt-out preferences, and subscriber lists</p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New service
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                  tab === id
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : tab === 'overview' ? (
            <OverviewTab
              services={services ?? []}
              totalSubscribers={totalSubscribers}
              activeServices={activeServices}
              channelBreakdown={channelBreakdown}
              onNavigateService={(id) => navigate(`/subscriptions/${id}`)}
              onCreateService={() => setCreateOpen(true)}
            />
          ) : tab === 'services' ? (
            <ServicesTab
              services={services ?? []}
              tenantId={tenantId}
              environment={environment}
              onNavigateService={(id) => navigate(`/subscriptions/${id}`)}
              onCreateService={() => setCreateOpen(true)}
            />
          ) : (
            <AnalyticsTab services={services ?? []} totalSubscribers={totalSubscribers} />
          )}
        </div>
      </div>

      <CreateServiceModal
        open={createOpen}
        loading={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => createMutation.mutate({ ...input, tenantId, environment })}
      />
    </div>
  );
}

/* ─── Overview Tab ─────────────────────────────────────────────── */

function OverviewTab({
  services,
  totalSubscribers,
  activeServices,
  channelBreakdown,
  onNavigateService,
  onCreateService,
}: {
  services: InformationService[];
  totalSubscribers: number;
  activeServices: number;
  channelBreakdown: [ServiceChannel, { count: number; subscribers: number }][];
  onNavigateService: (id: string) => void;
  onCreateService: () => void;
}) {
  if (!services.length) {
    return (
      <EmptyState
        title="No information services"
        description="Create a service to manage subscriptions, opt-in/opt-out preferences, and subscriber history across all channels."
        action={
          <Button onClick={onCreateService}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create your first service
          </Button>
        }
      />
    );
  }

  const topServices = [...services].sort((a, b) => b.subscriber_count - a.subscriber_count).slice(0, 5);
  const doubleOptInCount = services.filter((s) => s.confirmation_mode === 'double_opt_in').length;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total subscribers" value={totalSubscribers.toLocaleString()} icon={Users} color="indigo" />
        <StatTile label="Active services" value={String(activeServices)} sub={`of ${services.length} total`} icon={Bell} color="emerald" />
        <StatTile label="Channels in use" value={String(channelBreakdown.length)} sub={channelBreakdown.map(([c]) => channelLabel(c)).join(', ')} icon={Zap} color="violet" />
        <StatTile label="Double opt-in" value={String(doubleOptInCount)} sub={`${services.length ? Math.round((doubleOptInCount / services.length) * 100) : 0}% of services`} icon={UserCheck} color="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Channel breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Subscribers by channel</h3>
          <div className="space-y-3">
            {channelBreakdown.map(([channel, { subscribers }]) => {
              const Icon = CHANNEL_ICONS[channel];
              const colors = CHANNEL_COLORS[channel];
              const pct = totalSubscribers > 0 ? Math.round((subscribers / totalSubscribers) * 100) : 0;
              return (
                <div key={channel}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', colors.bg)}>
                        <Icon className={cn('h-3.5 w-3.5', colors.text)} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{channelLabel(channel)}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-gray-900">{subscribers.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full bg-gradient-to-r', colors.gradient)} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              );
            })}
            {channelBreakdown.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No channel data</p>}
          </div>
        </div>

        {/* Top services */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Top services by subscribers</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {topServices.map((svc, i) => {
              const Icon = CHANNEL_ICONS[svc.channel];
              const colors = CHANNEL_COLORS[svc.channel];
              return (
                <button
                  key={svc.id}
                  onClick={() => onNavigateService(svc.id)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-xs font-bold text-gray-300 w-5 text-center">{i + 1}</span>
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', colors.bg)}>
                    <Icon className={cn('h-4 w-4', colors.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{svc.name}</p>
                    <p className="text-xs text-gray-500">{channelLabel(svc.channel)} · {validityLabel(svc)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-gray-900">{svc.subscriber_count.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">subscribers</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick actions</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <button onClick={onCreateService} className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-left">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Plus className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Create service</p>
              <p className="text-xs text-gray-500">New information service</p>
            </div>
          </button>
          <button onClick={() => {}} className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors text-left">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Users className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Import subscribers</p>
              <p className="text-xs text-gray-500">Bulk import from CSV</p>
            </div>
          </button>
          <button onClick={() => {}} className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-200 hover:border-violet-300 hover:bg-violet-50/30 transition-colors text-left">
            <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
              <Globe className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Preference page</p>
              <p className="text-xs text-gray-500">Public opt-in/out page</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Services Tab ─────────────────────────────────────────────── */

function ServicesTab({
  services,
  tenantId,
  environment,
  onNavigateService,
  onCreateService,
}: {
  services: InformationService[];
  tenantId: string;
  environment: string;
  onNavigateService: (id: string) => void;
  onCreateService: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<ServiceChannel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [, setDeletingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: ({ service }: { service: InformationService }) =>
      deleteInformationService(service, tenantId, environment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['information-services'] });
      setDeletingId(null);
    },
    onError: () => setDeletingId(null),
  });

  const filtered = useMemo(() => {
    let list = services;
    if (channelFilter !== 'all') list = list.filter((s) => s.channel === channelFilter);
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [services, channelFilter, statusFilter, search]);

  const channels = useMemo(() => {
    const set = new Set(services.map((s) => s.channel));
    return Array.from(set);
  }, [services]);

  if (!services.length) {
    return (
      <EmptyState
        title="No information services"
        description="Create your first service to start managing subscriptions."
        action={<Button onClick={onCreateService}><Plus className="mr-1.5 h-4 w-4" />Create service</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ServiceChannel | 'all')}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All channels</option>
            {channels.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'archived')}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setViewMode('grid')} className={cn('px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors', viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>Grid</button>
          <button onClick={() => setViewMode('table')} className={cn('px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors', viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>Table</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500">No services match your filters.</div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((svc) => {
            const Icon = CHANNEL_ICONS[svc.channel];
            const colors = CHANNEL_COLORS[svc.channel];
            return (
              <div key={svc.id} className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all">
                {/* Header strip */}
                <div className={cn('h-1.5 bg-gradient-to-r', colors.gradient)} />
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', colors.bg)}>
                      <Icon className={cn('h-5 w-5', colors.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => onNavigateService(svc.id)} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate block text-left w-full">
                        {svc.name}
                      </button>
                      <p className="text-xs text-gray-500 mt-0.5">{channelLabel(svc.channel)} · {validityLabel(svc)}</p>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === svc.id ? null : svc.id)}
                        className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuOpenId === svc.id && (
                        <>
                          <button className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                            <button onClick={() => { setMenuOpenId(null); onNavigateService(svc.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                              <Settings2 className="h-3.5 w-3.5" /> Manage
                            </button>
                            <button
                              onClick={() => { setMenuOpenId(null); setDeletingId(svc.id); deleteMutation.mutate({ service: svc }); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {svc.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">{svc.description}</p>
                  )}

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-gray-900">{svc.subscriber_count.toLocaleString()}</p>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mt-0.5">subscribers</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge variant={svc.status === 'active' ? 'success' : 'default'}>{svc.status}</Badge>
                      {svc.confirmation_mode === 'double_opt_in' && <Badge variant="warning">DOI</Badge>}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 px-5 py-3">
                  <button onClick={() => onNavigateService(svc.id)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                    Manage subscribers <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table view */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Channel</th>
                <th className="px-5 py-3">Subscribers</th>
                <th className="px-5 py-3">Confirmation</th>
                <th className="px-5 py-3">Validity</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((svc) => {
                const Icon = CHANNEL_ICONS[svc.channel];
                const colors = CHANNEL_COLORS[svc.channel];
                return (
                  <tr key={svc.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <button onClick={() => onNavigateService(svc.id)} className="text-left">
                        <p className="font-medium text-gray-900 hover:text-indigo-600">{svc.name}</p>
                        {svc.description && <p className="text-xs text-gray-500 truncate max-w-[260px]">{svc.description}</p>}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className={cn('w-6 h-6 rounded flex items-center justify-center', colors.bg)}>
                          <Icon className={cn('h-3 w-3', colors.text)} />
                        </div>
                        <span className="text-gray-700">{channelLabel(svc.channel)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-bold tabular-nums text-gray-900">{svc.subscriber_count.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-gray-600 capitalize">{svc.confirmation_mode.replace('_', ' ')}</td>
                    <td className="px-5 py-3.5 text-gray-600">{validityLabel(svc)}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={svc.status === 'active' ? 'success' : 'default'}>{svc.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={() => onNavigateService(svc.id)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Analytics Tab ────────────────────────────────────────────── */

function AnalyticsTab({ services, totalSubscribers }: { services: InformationService[]; totalSubscribers: number }) {
  const activeServices = services.filter((s) => s.status === 'active').length;
  const archivedServices = services.filter((s) => s.status === 'archived').length;
  const doubleOptIn = services.filter((s) => s.confirmation_mode === 'double_opt_in').length;
  const simpleConfirm = services.filter((s) => s.confirmation_mode === 'simple').length;
  const noConfirm = services.filter((s) => s.confirmation_mode === 'none').length;

  const avgSubscribers = services.length > 0 ? Math.round(totalSubscribers / services.length) : 0;
  const maxSvc = services.reduce<InformationService | null>((best, s) => (!best || s.subscriber_count > best.subscriber_count ? s : best), null);
  const minSvc = services.filter((s) => s.status === 'active').reduce<InformationService | null>((worst, s) => (!worst || s.subscriber_count < worst.subscriber_count ? s : worst), null);

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total subscribers" value={totalSubscribers.toLocaleString()} icon={Users} color="indigo" />
        <StatTile label="Avg per service" value={avgSubscribers.toLocaleString()} icon={BarChart3} color="blue" />
        <StatTile label="Highest" value={maxSvc ? maxSvc.subscriber_count.toLocaleString() : '—'} sub={maxSvc?.name} icon={TrendingUp} color="emerald" />
        <StatTile label="Lowest (active)" value={minSvc ? minSvc.subscriber_count.toLocaleString() : '—'} sub={minSvc?.name} icon={TrendingDown} color="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Service status breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Service status</h3>
          <div className="space-y-4">
            <BarStat label="Active" value={activeServices} total={services.length} color="bg-emerald-500" />
            <BarStat label="Archived" value={archivedServices} total={services.length} color="bg-gray-400" />
          </div>
        </div>

        {/* Confirmation modes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Confirmation modes</h3>
          <div className="space-y-4">
            <BarStat label="Double opt-in" value={doubleOptIn} total={services.length} color="bg-amber-500" />
            <BarStat label="Simple" value={simpleConfirm} total={services.length} color="bg-blue-500" />
            <BarStat label="None" value={noConfirm} total={services.length} color="bg-gray-400" />
          </div>
        </div>
      </div>

      {/* All services ranked */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">All services ranked by subscribers</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {[...services].sort((a, b) => b.subscriber_count - a.subscriber_count).map((svc, i) => {
            const Icon = CHANNEL_ICONS[svc.channel];
            const colors = CHANNEL_COLORS[svc.channel];
            const pct = totalSubscribers > 0 ? (svc.subscriber_count / totalSubscribers * 100) : 0;
            return (
              <div key={svc.id} className="flex items-center gap-4 px-5 py-3">
                <span className="text-xs font-bold text-gray-300 w-5 text-center">{i + 1}</span>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colors.bg)}>
                  <Icon className={cn('h-4 w-4', colors.text)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{svc.name}</p>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[200px]">
                    <div className={cn('h-full rounded-full bg-gradient-to-r', colors.gradient)} style={{ width: `${Math.max(pct, 1)}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-gray-900">{svc.subscriber_count.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">{pct.toFixed(1)}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared components ────────────────────────────────────────── */

const STAT_COLORS: Record<string, { bg: string; text: string; iconBg: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', iconBg: 'bg-indigo-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600', iconBg: 'bg-violet-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', iconBg: 'bg-amber-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100' },
};

function StatTile({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: typeof Users; color: string;
}) {
  const c = STAT_COLORS[color] ?? STAT_COLORS.indigo;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', c.iconBg)}>
        <Icon className={cn('h-5 w-5', c.text)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-xl font-bold tabular-nums text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function BarStat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-bold tabular-nums text-gray-900">{value} <span className="text-gray-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}
