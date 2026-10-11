import { supabase } from './supabase';
import { logAudit, diffChanges } from './audit';
import type { Customer } from '@marbee/shared';
import { fetchWebPushSubscribers } from './web-analytics';

export type ServiceChannel = 'email' | 'sms' | 'web_push' | 'whatsapp' | 'mobile_app';
export type DeliveryMode = 'newsletter' | 'viral';
export type ConfirmationMode = 'none' | 'simple' | 'double_opt_in';
export type SubscriptionStatus = 'pending' | 'active' | 'unsubscribed' | 'expired';
export type SubscriptionSource = 'manual' | 'import' | 'form' | 'workflow' | 'link';
export type SubscriptionEventType = 'subscribe' | 'unsubscribe' | 'confirm' | 'expire' | 'resubscribe';

export type InformationService = {
  id: string;
  tenant_id: string;
  environment: string;
  name: string;
  slug: string;
  description: string | null;
  channel: ServiceChannel;
  delivery_mode: DeliveryMode | null;
  confirmation_mode: ConfirmationMode;
  send_subscribe_confirmation: boolean;
  send_unsubscribe_confirmation: boolean;
  subscribe_template: string | null;
  unsubscribe_template: string | null;
  unlimited: boolean;
  validity_value: number | null;
  validity_unit: 'days' | 'months' | null;
  subscriber_count: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
};

export type ServiceSubscription = {
  id: string;
  tenant_id: string;
  environment: string;
  service_id: string;
  customer_id: string;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  subscribed_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  customers?: Pick<Customer, 'id' | 'email' | 'mobile' | 'first_name' | 'last_name' | 'title' | 'middle_name'> | null;
  browser?: string;
  os?: string;
  device?: 'mobile' | 'tablet' | 'desktop';
  websiteDomain?: string;
  optinPage?: string;
  optinStatus?: 'yes' | 'granted' | 'pending' | 'denied';
  fcmToken?: string;
  isTestToken?: boolean;
  lastDeliveryStatus?: 'delivered' | 'failed' | 'untested';
  lastFailureReason?: string | null;
};

export type SubscriptionEvent = {
  id: string;
  tenant_id: string;
  environment: string;
  service_id: string;
  subscription_id: string | null;
  customer_id: string;
  event_type: SubscriptionEventType;
  source: string;
  actor_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  customers?: Pick<Customer, 'id' | 'email' | 'mobile' | 'first_name' | 'last_name' | 'title' | 'middle_name'> | null;
};

export type ServiceStats = {
  activeCount: number;
  pendingCount: number;
  unsubscribedCount: number;
  expiredCount: number;
  subscribedLast30Days: number;
  unsubscribedLast30Days: number;
};

export const SERVICE_CHANNELS: { value: ServiceChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'web_push', label: 'Web push' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'mobile_app', label: 'Mobile app' },
];

export const DELIVERY_MODES: { value: DeliveryMode; label: string }[] = [
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'viral', label: 'Viral' },
];

export const CONFIRMATION_MODES: { value: ConfirmationMode; label: string }[] = [
  { value: 'none', label: 'No confirmation' },
  { value: 'simple', label: 'Simple confirmation' },
  { value: 'double_opt_in', label: 'Double opt-in' },
];

export const SUBSCRIPTION_SOURCES: { value: SubscriptionSource; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'import', label: 'Import' },
  { value: 'form', label: 'Web form' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'link', label: 'Unsubscribe link' },
];

export function slugifyServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'service';
}

export function channelLabel(channel: ServiceChannel): string {
  return SERVICE_CHANNELS.find((c) => c.value === channel)?.label ?? channel;
}

export function validityLabel(service: Pick<InformationService, 'unlimited' | 'validity_value' | 'validity_unit'>): string {
  if (service.unlimited) return 'Unlimited';
  if (!service.validity_value) return 'Limited';
  const unit = service.validity_unit === 'months' ? 'mo' : 'd';
  return `${service.validity_value}${unit}`;
}

function computeExpiresAt(
  service: Pick<InformationService, 'unlimited' | 'validity_value' | 'validity_unit'>,
  from = new Date(),
): string | null {
  if (service.unlimited || !service.validity_value) return null;
  const d = new Date(from);
  if (service.validity_unit === 'months') {
    d.setMonth(d.getMonth() + service.validity_value);
  } else {
    d.setDate(d.getDate() + service.validity_value);
  }
  return d.toISOString();
}

async function refreshSubscriberCount(serviceId: string): Promise<void> {
  await supabase.rpc('refresh_service_subscriber_count', { p_service_id: serviceId });
}

async function logSubscriptionEvent(input: {
  tenantId: string;
  environment: string;
  serviceId: string;
  subscriptionId: string | null;
  customerId: string;
  eventType: SubscriptionEventType;
  source: SubscriptionSource;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('service_subscription_events').insert({
    tenant_id: input.tenantId,
    environment: input.environment,
    service_id: input.serviceId,
    subscription_id: input.subscriptionId,
    customer_id: input.customerId,
    event_type: input.eventType,
    source: input.source,
    actor_email: input.actorEmail ?? user?.email ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function fetchInformationServices(
  tenantId: string,
  environment: string,
): Promise<InformationService[]> {
  const { data, error } = await supabase
    .from('information_services')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });

  if (error && error.code !== 'PGRST116') console.warn('Fetch services warning:', error);
  const list = (data ?? []) as InformationService[];

  // Fetch real-time web push subscribers
  let webPushSubs: Awaited<ReturnType<typeof fetchWebPushSubscribers>> = [];
  try {
    webPushSubs = await fetchWebPushSubscribers(tenantId, environment);
  } catch {}

  const activePushCount = webPushSubs.filter((s) => s.subscriptionStatus === 'active').length;

  const webPushService = list.find((s) => s.channel === 'web_push');
  if (webPushService) {
    webPushService.subscriber_count = activePushCount;
  } else {
    // Inject default Web Push service if not already manually created
    const defaultPushService: InformationService = {
      id: `svc_web_push_${(tenantId || 'default').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`,
      tenant_id: tenantId,
      environment,
      name: 'Website Web Push Notifications',
      slug: 'website-web-push',
      description: 'Real-time Web Push subscribers and browser notification tokens captured across your websites',
      channel: 'web_push',
      delivery_mode: null,
      confirmation_mode: 'simple',
      send_subscribe_confirmation: false,
      send_unsubscribe_confirmation: false,
      subscribe_template: null,
      unsubscribe_template: null,
      unlimited: true,
      validity_value: null,
      validity_unit: null,
      subscriber_count: activePushCount,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(defaultPushService);
  }

  return list;
}

export async function fetchInformationService(id: string): Promise<InformationService | null> {
  if (id.startsWith('svc_web_push')) {
    return {
      id,
      tenant_id: 'default',
      environment: 'production',
      name: 'Website Web Push Notifications',
      slug: 'website-web-push',
      description: 'Real-time Web Push subscribers and browser notification tokens captured across your websites',
      channel: 'web_push',
      delivery_mode: null,
      confirmation_mode: 'simple',
      send_subscribe_confirmation: false,
      send_unsubscribe_confirmation: false,
      subscribe_template: null,
      unsubscribe_template: null,
      unlimited: true,
      validity_value: null,
      validity_unit: null,
      subscriber_count: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('information_services')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as InformationService | null;
}

export type CreateServiceInput = {
  tenantId: string;
  environment: string;
  name: string;
  description?: string;
  channel: ServiceChannel;
  deliveryMode?: DeliveryMode | null;
  confirmationMode?: ConfirmationMode;
  sendSubscribeConfirmation?: boolean;
  sendUnsubscribeConfirmation?: boolean;
  subscribeTemplate?: string;
  unsubscribeTemplate?: string;
  unlimited?: boolean;
  validityValue?: number | null;
  validityUnit?: 'days' | 'months' | null;
};

export async function createInformationService(input: CreateServiceInput): Promise<InformationService> {
  const slug = slugifyServiceName(input.name);
  const row = {
    tenant_id: input.tenantId,
    environment: input.environment,
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || null,
    channel: input.channel,
    delivery_mode: input.channel === 'email' ? (input.deliveryMode ?? 'newsletter') : null,
    confirmation_mode: input.confirmationMode ?? 'simple',
    send_subscribe_confirmation: input.sendSubscribeConfirmation ?? false,
    send_unsubscribe_confirmation: input.sendUnsubscribeConfirmation ?? false,
    subscribe_template: input.subscribeTemplate?.trim() || null,
    unsubscribe_template: input.unsubscribeTemplate?.trim() || null,
    unlimited: input.unlimited ?? true,
    validity_value: input.unlimited === false ? input.validityValue ?? null : null,
    validity_unit: input.unlimited === false ? input.validityUnit ?? 'days' : null,
    status: 'active' as const,
  };

  const { data, error } = await supabase.from('information_services').insert(row).select('*').single();
  if (error) throw error;

  const service = data as InformationService;
  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'create',
    resourceType: 'information_service',
    resourceId: service.id,
    resourceName: service.name,
    summary: `Created information service "${service.name}"`,
  });

  return service;
}

export type UpdateServiceInput = Partial<Omit<CreateServiceInput, 'tenantId' | 'environment'>> & {
  id: string;
  tenantId: string;
  environment: string;
  status?: 'active' | 'archived';
};

export async function updateInformationService(
  existing: InformationService,
  input: UpdateServiceInput,
): Promise<InformationService> {
  const unlimited = input.unlimited ?? existing.unlimited;
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.deliveryMode !== undefined) patch.delivery_mode = input.deliveryMode;
  if (input.confirmationMode !== undefined) patch.confirmation_mode = input.confirmationMode;
  if (input.sendSubscribeConfirmation !== undefined) patch.send_subscribe_confirmation = input.sendSubscribeConfirmation;
  if (input.sendUnsubscribeConfirmation !== undefined) patch.send_unsubscribe_confirmation = input.sendUnsubscribeConfirmation;
  if (input.subscribeTemplate !== undefined) patch.subscribe_template = input.subscribeTemplate.trim() || null;
  if (input.unsubscribeTemplate !== undefined) patch.unsubscribe_template = input.unsubscribeTemplate.trim() || null;
  if (input.unlimited !== undefined) patch.unlimited = input.unlimited;
  if (input.validityValue !== undefined || input.unlimited !== undefined) {
    patch.validity_value = unlimited ? null : (input.validityValue ?? existing.validity_value);
    patch.validity_unit = unlimited ? null : (input.validityUnit ?? existing.validity_unit ?? 'days');
  }
  if (input.status !== undefined) patch.status = input.status;

  const channel = (patch.channel as ServiceChannel) ?? existing.channel;
  if (channel !== 'email') patch.delivery_mode = null;

  const { data, error } = await supabase
    .from('information_services')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) throw error;
  const updated = data as InformationService;

  const changes = diffChanges(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, [
    'name', 'description', 'channel', 'delivery_mode', 'confirmation_mode',
    'send_subscribe_confirmation', 'send_unsubscribe_confirmation', 'unlimited', 'validity_value', 'status',
  ]);

  void logAudit({
    tenantId: input.tenantId,
    environment: input.environment,
    action: 'update',
    resourceType: 'information_service',
    resourceId: updated.id,
    resourceName: updated.name,
    summary: `Updated information service "${updated.name}"`,
    changes,
  });

  return updated;
}

export async function deleteInformationService(
  service: InformationService,
  tenantId: string,
  environment: string,
): Promise<void> {
  const { error } = await supabase.from('information_services').delete().eq('id', service.id);
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'information_service',
    resourceId: service.id,
    resourceName: service.name,
    summary: `Deleted information service "${service.name}"`,
  });
}

const CUSTOMER_SELECT = 'id, email, mobile, first_name, last_name, title, middle_name';

export async function fetchServiceSubscriptions(
  serviceId: string,
  status?: SubscriptionStatus | 'all',
  tenantId = '00000000-0000-0000-0000-000000000001',
  environment = 'production'
): Promise<ServiceSubscription[]> {
  const isWebPushSvc = serviceId.startsWith('svc_web_push') || serviceId.includes('web_push');

  if (isWebPushSvc) {
    let pushSubs: Awaited<ReturnType<typeof fetchWebPushSubscribers>> = [];
    try {
      pushSubs = await fetchWebPushSubscribers(tenantId, environment);
    } catch {}

    const mapped: ServiceSubscription[] = pushSubs.map((s) => {
      const statusValue: SubscriptionStatus = s.subscriptionStatus === 'inactive' ? 'unsubscribed' : 'active';
      return {
        id: s.id,
        tenant_id: s.tenantId || tenantId,
        environment: s.environment || environment,
        service_id: serviceId,
        customer_id: s.customerId || `cust_${s.id}`,
        status: statusValue,
        source: 'form' as const,
        subscribed_at: s.createdAt,
        confirmed_at: s.createdAt,
        unsubscribed_at: s.subscriptionStatus === 'inactive' ? s.lastSeen : null,
        expires_at: null,
        created_at: s.createdAt,
        updated_at: s.lastSeen,
        browser: s.browser,
        os: s.os,
        device: s.device,
        websiteDomain: s.websiteDomain,
        optinPage: s.optinPage,
        optinStatus: s.optinStatus,
        fcmToken: s.fcmToken,
        isTestToken: s.isTestToken,
        lastDeliveryStatus: s.lastDeliveryStatus,
        lastFailureReason: s.lastFailureReason,
        customers: {
          id: s.customerId || `cust_${s.id}`,
          email: s.customerId ? `${s.customerId}@marbee.io` : `${s.browser.toLowerCase()}@${s.websiteDomain || 'web'}`,
          mobile: null,
          first_name: `${s.browser} (${s.device || 'desktop'})`,
          last_name: s.websiteDomain || 'Visitor',
          title: null,
          middle_name: null,
        },
      };
    });

    if (status && status !== 'all') {
      return mapped.filter((sub) => sub.status === status);
    }
    return mapped;
  }

  let query = supabase
    .from('service_subscriptions')
    .select(`*, customers (${CUSTOMER_SELECT})`)
    .eq('service_id', serviceId)
    .order('subscribed_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error && error.code !== 'PGRST116') console.warn('Fetch service subscriptions warning:', error);
  return (data ?? []) as ServiceSubscription[];
}

export async function fetchSubscriptionEvents(
  serviceId: string,
  limit = 100,
): Promise<SubscriptionEvent[]> {
  const { data, error } = await supabase
    .from('service_subscription_events')
    .select(`*, customers (${CUSTOMER_SELECT})`)
    .eq('service_id', serviceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error && error.code !== 'PGRST116') console.warn('Fetch events warning:', error);
  return (data ?? []) as SubscriptionEvent[];
}

export async function fetchCustomerSubscriptions(
  customerId: string,
): Promise<(ServiceSubscription & { information_services: InformationService | null })[]> {
  const { data, error } = await supabase
    .from('service_subscriptions')
    .select(`*, information_services (*)`)
    .eq('customer_id', customerId)
    .order('subscribed_at', { ascending: false });

  if (error && error.code !== 'PGRST116') console.warn('Fetch customer subscriptions warning:', error);
  return (data ?? []) as (ServiceSubscription & { information_services: InformationService | null })[];
}

export async function fetchServiceStats(
  serviceId: string,
  tenantId = '00000000-0000-0000-0000-000000000001',
  environment = 'production'
): Promise<ServiceStats> {
  const isWebPushSvc = serviceId.startsWith('svc_web_push') || serviceId.includes('web_push');

  if (isWebPushSvc) {
    let pushSubs: Awaited<ReturnType<typeof fetchWebPushSubscribers>> = [];
    try {
      pushSubs = await fetchWebPushSubscribers(tenantId, environment);
    } catch {}

    const activeCount = pushSubs.filter((s) => s.subscriptionStatus === 'active').length;
    const unsubscribedCount = pushSubs.filter((s) => s.subscriptionStatus === 'inactive').length;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return {
      activeCount,
      pendingCount: 0,
      unsubscribedCount,
      expiredCount: 0,
      subscribedLast30Days: pushSubs.filter((s) => new Date(s.createdAt).getTime() >= cutoff).length,
      unsubscribedLast30Days: 0,
    };
  }

  const { data, error } = await supabase
    .from('service_subscriptions')
    .select('status, subscribed_at, unsubscribed_at')
    .eq('service_id', serviceId);

  if (error && error.code !== 'PGRST116') console.warn('Fetch stats warning:', error);

  const rows = data ?? [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  return {
    activeCount: rows.filter((r) => r.status === 'active').length,
    pendingCount: rows.filter((r) => r.status === 'pending').length,
    unsubscribedCount: rows.filter((r) => r.status === 'unsubscribed').length,
    expiredCount: rows.filter((r) => r.status === 'expired').length,
    subscribedLast30Days: rows.filter(
      (r) => r.subscribed_at && new Date(r.subscribed_at).getTime() >= cutoff,
    ).length,
    unsubscribedLast30Days: rows.filter(
      (r) => r.unsubscribed_at && new Date(r.unsubscribed_at).getTime() >= cutoff,
    ).length,
  };
}

export async function subscribeCustomers(input: {
  service: InformationService;
  tenantId: string;
  environment: string;
  customerIds: string[];
  source?: SubscriptionSource;
  sendConfirmation?: boolean;
}): Promise<number> {
  const { service, tenantId, environment, customerIds } = input;
  const source = input.source ?? 'manual';
  let added = 0;

  for (const customerId of customerIds) {
    const isPending = service.confirmation_mode === 'double_opt_in';
    const status: SubscriptionStatus = isPending ? 'pending' : 'active';
    const now = new Date().toISOString();
    const expiresAt = computeExpiresAt(service);

    const { data: existing } = await supabase
      .from('service_subscriptions')
      .select('id, status')
      .eq('service_id', service.id)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (existing?.status === 'active') continue;

    const row = {
      tenant_id: tenantId,
      environment,
      service_id: service.id,
      customer_id: customerId,
      status,
      source,
      subscribed_at: now,
      confirmed_at: isPending ? null : now,
      unsubscribed_at: null,
      expires_at: expiresAt,
    };

    let subscriptionId: string;

    if (existing) {
      const { data, error } = await supabase
        .from('service_subscriptions')
        .update(row)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw error;
      subscriptionId = data.id;
    } else {
      const { data, error } = await supabase
        .from('service_subscriptions')
        .insert(row)
        .select('id')
        .single();
      if (error) throw error;
      subscriptionId = data.id;
    }

    const eventType: SubscriptionEventType =
      existing?.status === 'unsubscribed' || existing?.status === 'expired' ? 'resubscribe' : 'subscribe';

    await logSubscriptionEvent({
      tenantId,
      environment,
      serviceId: service.id,
      subscriptionId,
      customerId,
      eventType,
      source,
      metadata: {
        send_confirmation: input.sendConfirmation ?? service.send_subscribe_confirmation,
        confirmation_mode: service.confirmation_mode,
      },
    });

    added += 1;
  }

  if (added > 0) {
    await refreshSubscriberCount(service.id);
    void logAudit({
      tenantId,
      environment,
      action: 'create',
      resourceType: 'service_subscription',
      resourceId: service.id,
      resourceName: service.name,
      summary: `Subscribed ${added} profile(s) to "${service.name}"`,
      metadata: { customer_count: added, source },
    });
  }

  return added;
}

export async function unsubscribeCustomers(input: {
  service: InformationService;
  tenantId: string;
  environment: string;
  subscriptionIds: string[];
  source?: SubscriptionSource;
  sendConfirmation?: boolean;
}): Promise<number> {
  const { service, tenantId, environment, subscriptionIds } = input;
  const source = input.source ?? 'manual';
  const now = new Date().toISOString();
  let removed = 0;

  for (const subscriptionId of subscriptionIds) {
    const { data: sub, error: fetchErr } = await supabase
      .from('service_subscriptions')
      .select('id, customer_id, status')
      .eq('id', subscriptionId)
      .eq('service_id', service.id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!sub || sub.status === 'unsubscribed') continue;

    const { error } = await supabase
      .from('service_subscriptions')
      .update({ status: 'unsubscribed', unsubscribed_at: now })
      .eq('id', subscriptionId);

    if (error) throw error;

    await logSubscriptionEvent({
      tenantId,
      environment,
      serviceId: service.id,
      subscriptionId,
      customerId: sub.customer_id,
      eventType: 'unsubscribe',
      source,
      metadata: {
        send_confirmation: input.sendConfirmation ?? service.send_unsubscribe_confirmation,
      },
    });

    removed += 1;
  }

  if (removed > 0) {
    await refreshSubscriberCount(service.id);
    void logAudit({
      tenantId,
      environment,
      action: 'delete',
      resourceType: 'service_subscription',
      resourceId: service.id,
      resourceName: service.name,
      summary: `Unsubscribed ${removed} profile(s) from "${service.name}"`,
      metadata: { customer_count: removed, source },
    });
  }

  return removed;
}

export async function confirmSubscription(input: {
  service: InformationService;
  tenantId: string;
  environment: string;
  subscriptionId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data: sub, error: fetchErr } = await supabase
    .from('service_subscriptions')
    .select('id, customer_id, status')
    .eq('id', input.subscriptionId)
    .eq('service_id', input.service.id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!sub || sub.status !== 'pending') return;

  const { error } = await supabase
    .from('service_subscriptions')
    .update({ status: 'active', confirmed_at: now })
    .eq('id', input.subscriptionId);

  if (error) throw error;

  await logSubscriptionEvent({
    tenantId: input.tenantId,
    environment: input.environment,
    serviceId: input.service.id,
    subscriptionId: input.subscriptionId,
    customerId: sub.customer_id,
    eventType: 'confirm',
    source: 'manual',
  });

  await refreshSubscriberCount(input.service.id);
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
