import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Check,
  Copy,
  Globe,
  History,
  Monitor,
  Plus,
  Send,
  Settings,
  Shield,
  Smartphone,
  Tablet,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { AuditTrailPanel } from '@/components/audit/AuditTrailPanel';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { SubscriberPickerModal } from '@/components/subscriptions/SubscriberPickerModal';
import { useAuth } from '@/contexts/AuthContext';
import { getCustomerDisplayName } from '@/lib/customers';
import { deleteWebPushSubscriber, sendTestWebPushNotification } from '@/lib/web-analytics';
import {
  CONFIRMATION_MODES,
  DELIVERY_MODES,
  SERVICE_CHANNELS,
  channelLabel,
  confirmSubscription,
  deleteInformationService,
  fetchInformationService,
  fetchServiceStats,
  fetchServiceSubscriptions,
  fetchSubscriptionEvents,
  formatRelativeTime,
  subscribeCustomers,
  unsubscribeCustomers,
  updateInformationService,
  validityLabel,
  type ConfirmationMode,
  type DeliveryMode,
  type ServiceChannel,
  type SubscriptionStatus,
} from '@/lib/subscriptions';

type DetailTab = 'subscribers' | 'history' | 'reports' | 'settings' | 'audit';

const STATUS_VARIANT: Record<SubscriptionStatus, 'success' | 'warning' | 'default' | 'error'> = {
  active: 'success',
  pending: 'warning',
  unsubscribed: 'default',
  expired: 'error',
};

export function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tenantId, environment } = useAuth();
  const queryClient = useQueryClient();

  const tabParam = searchParams.get('tab');
  const tab: DetailTab =
    tabParam === 'history' || tabParam === 'reports' || tabParam === 'settings' || tabParam === 'audit'
      ? tabParam
      : 'subscribers';

  const [subscriberFilter, setSubscriberFilter] = useState<SubscriptionStatus | 'all'>('active');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnsub, setConfirmUnsub] = useState(false);

  const setTab = (t: DetailTab) => {
    setSearchParams(t === 'subscribers' ? {} : { tab: t }, { replace: true });
  };

  const { data: service, isLoading } = useQuery({
    queryKey: ['information-service', id],
    queryFn: () => fetchInformationService(id!),
    enabled: Boolean(id),
  });

  const { data: subscriptions, refetch: refetchSubs } = useQuery({
    queryKey: ['service-subscriptions', id, subscriberFilter, tenantId, environment],
    queryFn: () => fetchServiceSubscriptions(id!, subscriberFilter, tenantId, environment),
    enabled: Boolean(id),
  });

  const { data: events } = useQuery({
    queryKey: ['subscription-events', id, tenantId, environment],
    queryFn: () => fetchSubscriptionEvents(id!),
    enabled: Boolean(id) && (tab === 'history' || tab === 'reports'),
  });

  const { data: stats } = useQuery({
    queryKey: ['service-stats', id, tenantId, environment],
    queryFn: () => fetchServiceStats(id!, tenantId, environment),
    enabled: Boolean(id),
  });

  const activeCustomerIds = useMemo(
    () =>
      (subscriptions ?? [])
        .filter((s) => s.status === 'active' || s.status === 'pending')
        .map((s) => s.customer_id),
    [subscriptions],
  );

  const subscribeMutation = useMutation({
    mutationFn: (customerIds: string[]) =>
      subscribeCustomers({ service: service!, tenantId, environment, customerIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['information-service'] });
      queryClient.invalidateQueries({ queryKey: ['information-services'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-events'] });
      queryClient.invalidateQueries({ queryKey: ['service-stats'] });
      setPickerOpen(false);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: (subscriptionIds: string[]) =>
      unsubscribeCustomers({ service: service!, tenantId, environment, subscriptionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['information-service'] });
      queryClient.invalidateQueries({ queryKey: ['information-services'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-events'] });
      queryClient.invalidateQueries({ queryKey: ['service-stats'] });
      setSelectedSubs(new Set());
      setConfirmUnsub(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInformationService(service!, tenantId, environment),
    onSuccess: () => navigate('/subscriptions'),
  });

  const confirmMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      confirmSubscription({ service: service!, tenantId, environment, subscriptionId }),
    onSuccess: () => {
      refetchSubs();
      queryClient.invalidateQueries({ queryKey: ['service-stats'] });
      queryClient.invalidateQueries({ queryKey: ['information-service'] });
    },
  });

  const [testingToken, setTestingToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestWebPush = async (fcmToken?: string) => {
    if (!fcmToken) return;
    setTestingToken(fcmToken);
    try {
      await sendTestWebPushNotification({
        title: '🔔 Marbee Web Push Test',
        body: 'Live test notification dispatched to subscriber device',
        clickUrl: window.location.href,
        tenantId,
        environment,
        fcmToken,
      });
      queryClient.invalidateQueries({ queryKey: ['service-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['service-stats'] });
      refetchSubs();
    } catch {}
    finally {
      setTestingToken(null);
    }
  };

  const handleDeletePushToken = async (subId: string, fcmToken?: string) => {
    await deleteWebPushSubscriber(tenantId, environment, subId, fcmToken);
    queryClient.invalidateQueries({ queryKey: ['service-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['service-stats'] });
    refetchSubs();
  };

  if (isLoading || !service) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-slate-500">{isLoading ? 'Loading…' : 'Service not found.'}</p>
      </div>
    );
  }

  const tabs: { id: DetailTab; label: string; icon: typeof Users }[] = [
    { id: 'subscribers', label: 'Active subscriptions', icon: Users },
    { id: 'history', label: 'History', icon: History },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'audit', label: 'Audit trail', icon: Shield },
  ];

  const toggleSub = (subId: string) => {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link to="/subscriptions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" />
        All services
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{service.name}</h1>
              <p className="text-sm text-slate-500">
                {channelLabel(service.channel)}
                {service.delivery_mode ? ` · ${service.delivery_mode}` : ''}
                · {validityLabel(service)}
              </p>
            </div>
          </div>
          {service.description && (
            <p className="mt-3 max-w-2xl text-sm text-slate-600">{service.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Active', value: stats?.activeCount ?? service.subscriber_count },
          { label: 'Pending', value: stats?.pendingCount ?? 0 },
          { label: 'Unsubscribed', value: stats?.unsubscribedCount ?? 0 },
          { label: 'New (30d)', value: stats?.subscribedLast30Days ?? 0 },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === tabId
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'subscribers' && (
        <Card>
          <CardHeader
            title="Subscribers"
            subtitle={service.channel === 'web_push' ? 'Live browser subscriber tokens and opt-in origins' : 'Add or remove profiles subscribed to this information service'}
            action={
              service.channel !== 'web_push' ? (
                <div className="flex gap-2">
                  {selectedSubs.size > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-red-600"
                      onClick={() => setConfirmUnsub(true)}
                    >
                      <UserMinus className="mr-1 h-3.5 w-3.5" />
                      Unsubscribe ({selectedSubs.size})
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setPickerOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add subscribers
                  </Button>
                </div>
              ) : null
            }
          />
          <div className="flex gap-2 border-b border-slate-100 px-6 py-3">
            {(['active', 'pending', 'unsubscribed', 'expired', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSubscriberFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  subscriberFilter === f ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            {service.channel === 'web_push' ? (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Device & Browser</th>
                    <th className="px-4 py-2.5">Origin Website</th>
                    <th className="px-4 py-2.5">Opt-in Page</th>
                    <th className="px-4 py-2.5">Opt-in</th>
                    <th className="px-4 py-2.5">Delivery Status</th>
                    <th className="px-4 py-2.5">Test Token</th>
                    <th className="px-4 py-2.5">Push Token</th>
                    <th className="px-4 py-2.5">Subscribed</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {!subscriptions?.length ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                        No web push subscribers in this view.
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((sub) => {
                      const isFailed = sub.status === 'unsubscribed' || sub.lastDeliveryStatus === 'failed';
                      const isTest = Boolean(sub.isTestToken || sub.fcmToken?.startsWith('TEST_TOKEN_') || sub.fcmToken?.startsWith('fcm_sim_'));
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/80 transition">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {sub.device === 'mobile' ? (
                                <Smartphone className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                              ) : sub.device === 'tablet' ? (
                                <Tablet className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                              ) : (
                                <Monitor className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                              )}
                              <div>
                                <span className="font-bold text-slate-900 block">{sub.browser || 'Browser'}</span>
                                <span className="text-[10px] text-slate-400">{sub.os || 'Desktop'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            <div className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-slate-400" />
                              <span>{sub.websiteDomain || 'Website'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5">
                              {sub.optinPage || '/'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {sub.optinStatus === 'denied' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                                <X className="h-2.5 w-2.5" />
                                No
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                <Check className="h-2.5 w-2.5" />
                                Yes
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isFailed ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200" title={sub.lastFailureReason || 'Delivery failed'}>
                                <X className="h-2.5 w-2.5 text-red-500" />
                                Inactive (Failed)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {isTest ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200" title="Diagnostic test token">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200" title="Real browser subscriber token">
                                <Check className="h-2.5 w-2.5 text-blue-600" />
                                Live Device
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px]">
                            {sub.fcmToken ? (
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-mono text-[10px] max-w-[130px] truncate" title={sub.fcmToken}>
                                  {sub.fcmToken.length > 18 ? `${sub.fcmToken.substring(0, 15)}…` : sub.fcmToken}
                                </span>
                                <span className="text-[9px] font-semibold text-slate-400">
                                  ({sub.fcmToken.length}c)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(`tok_${sub.id}`, sub.fcmToken!)}
                                  className="text-slate-400 hover:text-indigo-600 p-0.5 transition"
                                  title="Copy full token string"
                                >
                                  {copiedKey === `tok_${sub.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 text-[11px] whitespace-nowrap">
                            {new Date(sub.subscribed_at || sub.created_at).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {sub.fcmToken && (
                                <button
                                  type="button"
                                  onClick={() => handleTestWebPush(sub.fcmToken)}
                                  disabled={testingToken === sub.fcmToken}
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 shadow-2xs hover:scale-105 active:scale-95 transition"
                                  title="Test Push Notification on this Device"
                                >
                                  <Send className={`h-3.5 w-3.5 ${testingToken === sub.fcmToken ? 'animate-pulse text-purple-400' : ''}`} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeletePushToken(sub.id, sub.fcmToken)}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition"
                                title="Delete token"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-6 py-3 w-10" />
                    <th className="px-6 py-3">Profile</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Source</th>
                    <th className="px-6 py-3">Subscribed</th>
                    <th className="px-6 py-3">Expires</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {!subscriptions?.length ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        No subscribers in this view.
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((sub) => {
                      const customer = sub.customers;
                      const name = customer ? getCustomerDisplayName(customer) : 'Unknown';
                      return (
                        <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-6 py-3">
                            {sub.status === 'active' || sub.status === 'pending' ? (
                              <input
                                type="checkbox"
                                checked={selectedSubs.has(sub.id)}
                                onChange={() => toggleSub(sub.id)}
                                className="rounded border-slate-300"
                              />
                            ) : null}
                          </td>
                          <td className="px-6 py-3">
                            {customer ? (
                              <Link to={`/customers/${customer.id}`} className="font-medium text-blue-600 hover:underline">
                                {name}
                              </Link>
                            ) : (
                              name
                            )}
                            {customer?.email && (
                              <p className="text-xs text-slate-500">{customer.email}</p>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <Badge variant={STATUS_VARIANT[sub.status]}>{sub.status}</Badge>
                          </td>
                          <td className="px-6 py-3 capitalize text-slate-600">{sub.source}</td>
                          <td className="px-6 py-3 text-slate-600">
                            {formatRelativeTime(sub.subscribed_at)}
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            {sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-6 py-3">
                            {sub.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={confirmMutation.isPending}
                                onClick={() => confirmMutation.mutate(sub.id)}
                              >
                                Confirm
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader title="Subscription history" subtitle="Subscribe, unsubscribe, and confirmation events" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3">Event</th>
                  <th className="px-6 py-3">Profile</th>
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">By</th>
                  <th className="px-6 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {!events?.length ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No history yet.</td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr key={ev.id} className="border-b border-slate-50">
                      <td className="px-6 py-3 capitalize font-medium text-slate-900">{ev.event_type.replace('_', ' ')}</td>
                      <td className="px-6 py-3">
                        {ev.customers ? getCustomerDisplayName(ev.customers) : 'Unknown'}
                      </td>
                      <td className="px-6 py-3 capitalize text-slate-600">{ev.source}</td>
                      <td className="px-6 py-3 text-slate-600">{ev.actor_email ?? '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{formatRelativeTime(ev.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'reports' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900">Subscription trends (30 days)</h3>
            <dl className="mt-4 space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">New subscriptions</dt>
                <dd className="font-semibold text-emerald-600">{stats?.subscribedLast30Days ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Unsubscriptions</dt>
                <dd className="font-semibold text-red-600">{stats?.unsubscribedLast30Days ?? 0}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <dt className="text-sm text-slate-500">Net change</dt>
                <dd className="font-semibold text-slate-900">
                  {(stats?.subscribedLast30Days ?? 0) - (stats?.unsubscribedLast30Days ?? 0)}
                </dd>
              </div>
            </dl>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900">Loyalty snapshot</h3>
            <dl className="mt-4 space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Active subscribers</dt>
                <dd className="font-semibold">{stats?.activeCount ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Pending confirmation</dt>
                <dd className="font-semibold">{stats?.pendingCount ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Churn (unsubscribed)</dt>
                <dd className="font-semibold">{stats?.unsubscribedCount ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Expired (limited-time)</dt>
                <dd className="font-semibold">{stats?.expiredCount ?? 0}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {tab === 'settings' && service && (
        <ServiceSettingsForm
          service={service}
          tenantId={tenantId}
          environment={environment}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['information-service', id] });
            queryClient.invalidateQueries({ queryKey: ['information-services'] });
          }}
        />
      )}

      {tab === 'audit' && (
        <AuditTrailPanel
          tenantId={tenantId}
          environment={environment}
          resourceType="information_service"
          resourceId={service.id}
        />
      )}

      <SubscriberPickerModal
        open={pickerOpen}
        tenantId={tenantId}
        environment={environment}
        loading={subscribeMutation.isPending}
        excludeCustomerIds={activeCustomerIds}
        onClose={() => setPickerOpen(false)}
        onConfirm={(ids) => subscribeMutation.mutate(ids)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete information service?"
        message={`"${service.name}" and all subscriber data will be permanently removed.`}
        loading={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      />

      <ConfirmDialog
        open={confirmUnsub}
        title="Unsubscribe selected profiles?"
        message={`Remove ${selectedSubs.size} profile(s) from "${service.name}"?`}
        confirmLabel="Unsubscribe"
        loading={unsubscribeMutation.isPending}
        onCancel={() => setConfirmUnsub(false)}
        onConfirm={() => unsubscribeMutation.mutate([...selectedSubs])}
      />
    </div>
  );
}

function ServiceSettingsForm({
  service,
  tenantId,
  environment,
  onSaved,
}: {
  service: NonNullable<Awaited<ReturnType<typeof fetchInformationService>>>;
  tenantId: string;
  environment: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [channel, setChannel] = useState<ServiceChannel>(service.channel);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode | ''>(service.delivery_mode ?? 'newsletter');
  const [confirmationMode, setConfirmationMode] = useState<ConfirmationMode>(service.confirmation_mode);
  const [sendSubscribeConfirmation, setSendSubscribeConfirmation] = useState(service.send_subscribe_confirmation);
  const [sendUnsubscribeConfirmation, setSendUnsubscribeConfirmation] = useState(service.send_unsubscribe_confirmation);
  const [subscribeTemplate, setSubscribeTemplate] = useState(service.subscribe_template ?? '');
  const [unsubscribeTemplate, setUnsubscribeTemplate] = useState(service.unsubscribe_template ?? '');
  const [unlimited, setUnlimited] = useState(service.unlimited);
  const [validityValue, setValidityValue] = useState(service.validity_value ?? 30);
  const [validityUnit, setValidityUnit] = useState<'days' | 'months'>(service.validity_unit ?? 'days');
  const [status, setStatus] = useState(service.status);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateInformationService(service, {
        id: service.id,
        tenantId,
        environment,
        name,
        description,
        channel,
        deliveryMode: channel === 'email' ? (deliveryMode as DeliveryMode) : null,
        confirmationMode,
        sendSubscribeConfirmation,
        sendUnsubscribeConfirmation,
        subscribeTemplate,
        unsubscribeTemplate,
        unlimited,
        validityValue: unlimited ? null : validityValue,
        validityUnit: unlimited ? null : validityUnit,
        status,
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Service configuration" subtitle="Channel, confirmations, validity, and delivery templates" />
      <form onSubmit={handleSave} className="space-y-4 p-6">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Label</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as ServiceChannel)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {SERVICE_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          {channel === 'email' && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Delivery mode</span>
              <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {DELIVERY_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Confirmation mechanism</span>
          <select value={confirmationMode} onChange={(e) => setConfirmationMode(e.target.value as ConfirmationMode)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {CONFIRMATION_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subscription template</span>
            <input
              type="text"
              value={subscribeTemplate}
              onChange={(e) => setSubscribeTemplate(e.target.value)}
              placeholder="Delivery template name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Unsubscription template</span>
            <input
              type="text"
              value={unsubscribeTemplate}
              onChange={(e) => setUnsubscribeTemplate(e.target.value)}
              placeholder="Delivery template name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendSubscribeConfirmation} onChange={(e) => setSendSubscribeConfirmation(e.target.checked)} />
            Send subscription confirmation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sendUnsubscribeConfirmation} onChange={(e) => setSendUnsubscribeConfirmation(e.target.checked)} />
            Send unsubscription confirmation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
            Unlimited duration
          </label>
          {!unlimited && (
            <div className="flex gap-2 pt-1">
              <input type="number" min={1} value={validityValue} onChange={(e) => setValidityValue(Number(e.target.value))} className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <select value={validityUnit} onChange={(e) => setValidityUnit(e.target.value as 'days' | 'months')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="days">Days</option>
                <option value="months">Months</option>
              </select>
            </div>
          )}
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'archived')} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </form>
    </Card>
  );
}
