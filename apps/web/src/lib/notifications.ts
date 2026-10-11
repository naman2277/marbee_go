import { supabase } from './supabase';

export type NotificationType =
  | 'task_assigned'
  | 'task_mention'
  | 'campaign_assigned'
  | 'system'
  | 'web_push';

export type NotificationCategory = 'web_push' | 'campaign' | 'system' | 'audience' | 'security';

export type AppNotification = {
  id: string;
  tenantId: string;
  environment: string;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  recipientUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorName?: string | null;
  timestamp: string;
  read: boolean;
  actionUrl?: string | null;
  actionLabel?: string | null;
  badge?: string | null;
};

const TYPE_DEFAULTS: Record<NotificationType, { category: NotificationCategory; badge: string }> = {
  task_assigned: { category: 'system', badge: 'Assigned' },
  task_mention: { category: 'system', badge: 'Mention' },
  campaign_assigned: { category: 'campaign', badge: 'Assigned' },
  system: { category: 'system', badge: '' },
  web_push: { category: 'web_push', badge: 'Live' },
};

function mapRow(d: Record<string, any>): AppNotification {
  const type = (d.type || 'system') as NotificationType;
  return {
    id: String(d.id),
    tenantId: d.tenant_id,
    environment: d.environment,
    title: d.title,
    message: d.message,
    type,
    category: (d.category || TYPE_DEFAULTS[type]?.category || 'system') as NotificationCategory,
    recipientUserId: d.recipient_user_id ?? null,
    entityType: d.entity_type ?? null,
    entityId: d.entity_id ?? null,
    actorName: d.actor_name ?? null,
    timestamp: d.created_at,
    read: Boolean(d.read),
    actionUrl: d.action_url ?? null,
    actionLabel: d.action_label ?? null,
    badge: d.badge ?? null,
  };
}

/**
 * Notifications visible to `userId`: tenant-wide broadcasts (recipient NULL)
 * plus notifications targeted directly at this user.
 */
export async function fetchNotifications(
  tenantId: string,
  environment: string,
  userId?: string | null,
): Promise<AppNotification[]> {
  if (!tenantId) return [];
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('created_at', { ascending: false })
    .limit(200);

  if (userId) {
    query = query.or(`recipient_user_id.is.null,recipient_user_id.eq.${userId}`);
  } else {
    query = query.is('recipient_user_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createNotification(
  notif: {
    title: string;
    message: string;
    type?: NotificationType;
    category?: NotificationCategory;
    recipientUserId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    actorName?: string | null;
    actionUrl?: string | null;
    actionLabel?: string | null;
    badge?: string | null;
    read?: boolean;
  },
  tenantId: string,
  environment: string,
): Promise<AppNotification | null> {
  if (!tenantId) return null;
  const type = notif.type ?? 'system';
  const defaults = TYPE_DEFAULTS[type];

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      tenant_id: tenantId,
      environment,
      title: notif.title,
      message: notif.message,
      type,
      category: notif.category ?? defaults.category,
      recipient_user_id: notif.recipientUserId ?? null,
      entity_type: notif.entityType ?? null,
      entity_id: notif.entityId ?? null,
      actor_name: notif.actorName ?? null,
      action_url: notif.actionUrl ?? null,
      action_label: notif.actionLabel ?? null,
      badge: notif.badge ?? (defaults.badge || null),
      read: Boolean(notif.read),
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data);
}

/** Create the same notification for many recipients (skips falsy ids, dedups). */
export async function notifyUsers(
  recipientUserIds: Array<string | null | undefined>,
  notif: Parameters<typeof createNotification>[0],
  tenantId: string,
  environment: string,
): Promise<void> {
  const ids = Array.from(new Set(recipientUserIds.filter(Boolean) as string[]));
  await Promise.all(
    ids.map((recipientUserId) =>
      createNotification({ ...notif, recipientUserId }, tenantId, environment).catch(() => null),
    ),
  );
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsAsRead(
  tenantId: string,
  environment: string,
  userId?: string | null,
): Promise<void> {
  let query = supabase
    .from('notifications')
    .update({ read: true })
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('read', false);
  if (userId) query = query.or(`recipient_user_id.is.null,recipient_user_id.eq.${userId}`);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

export async function clearAllNotifications(
  tenantId: string,
  environment: string,
  userId?: string | null,
): Promise<void> {
  let query = supabase
    .from('notifications')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (userId) query = query.or(`recipient_user_id.is.null,recipient_user_id.eq.${userId}`);
  const { error } = await query;
  if (error) throw error;
}

/**
 * Live INSERT subscription for the notification centre / header badge.
 * Returns an unsubscribe fn. Fires for any notification row in the tenant;
 * callers re-fetch (RLS already filters to what the user may see).
 */
export function subscribeNotifications(
  tenantId: string,
  _userId: string | null | undefined,
  onInsert: () => void,
): () => void {
  if (!tenantId) return () => {};
  // Unique channel name per subscriber — supabase-js keys channels by topic and
  // throws "cannot add postgres_changes callbacks after subscribe()" if two
  // callers (e.g. the header badge + the notification centre) share one name,
  // or when React re-mounts an effect before the old channel is torn down.
  // Wrapped defensively: this runs from an effect in the app shell, so a throw
  // here would take down the whole tree via the root ErrorBoundary.
  try {
    const channel = supabase
      .channel(`notifications-${tenantId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `tenant_id=eq.${tenantId}` },
        () => onInsert(),
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* already removed */
      }
    };
  } catch (err) {
    console.warn('[notifications] realtime subscribe unavailable:', err);
    return () => {};
  }
}
