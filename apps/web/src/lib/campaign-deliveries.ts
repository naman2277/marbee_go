import { supabase } from './supabase';
import type { NodePopulationResult } from './workflow-engine';

export type DeployedDelivery = {
  id: string;
  nodeId: string;
  name: string;
  label: string;
  channel: string;
  stepType: string;
  confirmedAt: string;
  sentCount: number;
  excludedCount: number;
  templateName?: string;
  customerIds: string[];
};

export type EngagementLogRow = {
  id: string;
  customer_id: string | null;
  channel: string;
  message_id: string;
  event: string;
  timestamp: string;
  metadata: Record<string, unknown>;
};

export type DeliveryEngagementStats = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  other: number;
  total: number;
};

export type DeliveryEngagementReport = {
  delivery: DeployedDelivery;
  stats: DeliveryEngagementStats;
  logs: EngagementLogRow[];
};

export function extractDeployedDeliveries(
  nodeResults: Record<string, NodePopulationResult>,
): DeployedDelivery[] {
  const byNode = new Map<string, DeployedDelivery>();

  for (const result of Object.values(nodeResults)) {
    if (!result.delivery) continue;
    const deliveryName = result.delivery.name || result.label || 'Delivery';
    const deployed: DeployedDelivery = {
      id: result.delivery.id,
      nodeId: result.nodeId,
      name: deliveryName,
      label: deliveryName,
      channel: result.delivery.channel,
      stepType: result.delivery.stepType,
      confirmedAt: result.delivery.confirmedAt,
      sentCount: result.count,
      excludedCount: result.delivery.excludedCount,
      templateName: result.delivery.templateName,
      customerIds: result.customerIds,
    };
    const existing = byNode.get(result.nodeId);
    if (!existing || deployed.confirmedAt > existing.confirmedAt) {
      byNode.set(result.nodeId, deployed);
    }
  }

  return [...byNode.values()].sort(
    (a, b) => new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime(),
  );
}

/** Per-recipient funnel: sent ≥ delivered ≥ opened ≥ clicked (one row per customer/message). */
export function summarizeEngagement(logs: EngagementLogRow[]): DeliveryEngagementStats {
  type Recipient = {
    attempted: boolean;
    delivered: boolean;
    failed: boolean;
    opened: boolean;
    clicked: boolean;
  };

  const recipients = new Map<string, Recipient>();

  for (const log of logs) {
    const key = log.customer_id ?? `msg:${log.message_id}`;
    let r = recipients.get(key);
    if (!r) {
      r = { attempted: false, delivered: false, failed: false, opened: false, clicked: false };
      recipients.set(key, r);
    }
    switch (log.event) {
      case 'sent':
        r.attempted = true;
        break;
      case 'delivered':
        r.attempted = true;
        r.delivered = true;
        break;
      case 'failed':
        r.attempted = true;
        r.failed = true;
        break;
      case 'opened':
        r.opened = true;
        break;
      case 'clicked':
      case 'converted':
        r.clicked = true;
        r.opened = true;
        break;
      default:
        break;
    }
  }

  let sent = 0;
  let delivered = 0;
  let opened = 0;
  let clicked = 0;
  let failed = 0;

  for (const r of recipients.values()) {
    const wasSent = r.attempted || r.delivered || r.failed;
    if (!wasSent) continue;

    sent += 1;
    if (r.failed && !r.delivered) {
      failed += 1;
    }
    if (r.delivered) {
      delivered += 1;
    } else if (r.attempted && !r.failed) {
      delivered += 1;
    }
    if (r.opened) {
      opened += 1;
    }
    if (r.clicked) {
      clicked += 1;
    }
  }

  return enforceFunnelOrder({
    sent,
    delivered,
    opened,
    clicked,
    failed,
    other: 0,
    total: logs.length,
  });
}

export function enforceFunnelOrder(stats: DeliveryEngagementStats): DeliveryEngagementStats {
  let { sent, delivered, opened, clicked, failed, other, total } = stats;
  delivered = Math.min(delivered, sent);
  opened = Math.min(opened, delivered);
  clicked = Math.min(clicked, opened);
  failed = Math.min(failed, sent);
  return { sent, delivered, opened, clicked, failed, other, total };
}

/** Merge stats across deliveries without breaking funnel monotonicity. */
export function aggregateEngagementStats(reports: DeliveryEngagementReport[]): DeliveryEngagementStats {
  const combined = reports.reduce(
    (acc, r) => {
      acc.sent += r.stats.sent;
      acc.delivered += r.stats.delivered;
      acc.opened += r.stats.opened;
      acc.clicked += r.stats.clicked;
      acc.failed += r.stats.failed;
      acc.total += r.stats.total;
      return acc;
    },
    { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, other: 0, total: 0 },
  );
  return enforceFunnelOrder(combined);
}

/** Keep only logs belonging to this delivery's audience (by delivery_id + target customer ids). */
export function scopeLogsToDelivery(
  logs: EngagementLogRow[],
  delivery: DeployedDelivery,
): EngagementLogRow[] {
  const deliveryId = delivery.id;
  const scoped = logs.filter((log) => {
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    const logDeliveryId = meta.delivery_id ?? meta.deliveryId;
    if (logDeliveryId != null && String(logDeliveryId) !== deliveryId) return false;
    return true;
  });

  if (!delivery.customerIds.length) return scoped;

  const allowed = new Set(delivery.customerIds);
  return scoped.filter((log) => log.customer_id == null || allowed.has(log.customer_id));
}

export async function fetchDeliveryEngagementReport(
  tenantId: string,
  environment: string,
  delivery: DeployedDelivery,
  journeyId?: string,
): Promise<DeliveryEngagementReport> {
  let logQuery = supabase
    .from('engagement_log')
    .select('id, customer_id, channel, message_id, event, timestamp, metadata')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .eq('metadata->>delivery_id', delivery.id);

  if (journeyId) logQuery = logQuery.eq('journey_id', journeyId);

  const { data, error } = await logQuery
    .order('timestamp', { ascending: false })
    .limit(500);

  if (error) throw error;

  let logs = scopeLogsToDelivery((data ?? []) as EngagementLogRow[], delivery);
  let stats = summarizeEngagement(logs);

  const targetCount = delivery.sentCount || delivery.customerIds.length;
  if (targetCount > stats.sent) {
    stats = enforceFunnelOrder({
      ...stats,
      sent: targetCount,
    });
  }

  if (!logs.length && targetCount > 0) {
    return {
      delivery,
      stats: enforceFunnelOrder({
        sent: targetCount,
        delivered: targetCount,
        opened: 0,
        clicked: 0,
        failed: 0,
        other: 0,
        total: 0,
      }),
      logs: [],
    };
  }

  return {
    delivery,
    stats,
    logs,
  };
}

export function mergeCampaignDeliveries(
  session: DeployedDelivery[],
  persisted: DeployedDelivery[],
): DeployedDelivery[] {
  const byId = new Map<string, DeployedDelivery>();
  for (const d of persisted) byId.set(d.id, d);
  for (const d of session) {
    const existing = byId.get(d.id);
    if (!existing) {
      byId.set(d.id, d);
      continue;
    }
    const name = pickDeliveryDisplayName(d.name, existing.name);
    byId.set(d.id, {
      ...existing,
      ...d,
      name,
      label: name,
      sentCount: Math.max(existing.sentCount, d.sentCount),
      excludedCount: Math.max(existing.excludedCount, d.excludedCount),
      customerIds: [...new Set([...existing.customerIds, ...d.customerIds])],
    });
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime(),
  );
}

function pickDeliveryDisplayName(primary: string, fallback: string): string {
  const generic = new Set(['delivery', 'untitled delivery', '']);
  const a = primary.trim();
  const b = fallback.trim();
  if (a && !generic.has(a.toLowerCase())) return a;
  if (b && !generic.has(b.toLowerCase())) return b;
  return a || b || 'Delivery';
}

export async function fetchPersistedCampaignDeliveries(
  tenantId: string,
  environment: string,
  journeyId?: string,
): Promise<DeployedDelivery[]> {
  let query = supabase
    .from('engagement_log')
    .select('customer_id, channel, message_id, event, timestamp, metadata, journey_id')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .not('metadata->delivery_id', 'is', null)
    .in('event', ['sent', 'delivered', 'opened', 'clicked', 'failed'])
    .order('timestamp', { ascending: false })
    .limit(2000);

  if (journeyId) query = query.eq('journey_id', journeyId);

  const { data, error } = await query;
  if (error) throw error;

  const byDelivery = new Map<
    string,
    DeployedDelivery & { recipientKeys: Set<string> }
  >();

  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const deliveryId = meta.delivery_id ?? meta.deliveryId;
    if (!deliveryId) continue;

    const id = String(deliveryId);
    const confirmedAt = row.timestamp as string;
    const customerId = row.customer_id as string | null;
    const messageId = row.message_id as string;

    let entry = byDelivery.get(id);
    if (!entry) {
      entry = {
        id,
        nodeId: id,
        name: String(meta.delivery_name ?? meta.deliveryName ?? 'Delivery'),
        label: String(meta.delivery_name ?? meta.deliveryName ?? 'Delivery'),
        channel: row.channel as string,
        stepType: `send_${row.channel}`,
        confirmedAt,
        sentCount: 0,
        excludedCount: 0,
        templateName: meta.template_name ? String(meta.template_name) : undefined,
        customerIds: [],
        recipientKeys: new Set(),
      };
      byDelivery.set(id, entry);
    }

    const rowName = String(meta.delivery_name ?? meta.deliveryName ?? '').trim();
    if (rowName) {
      entry.name = pickDeliveryDisplayName(rowName, entry.name);
      entry.label = entry.name;
    }

    if (row.event === 'sent' || row.event === 'delivered' || row.event === 'failed') {
      const recipientKey = customerId ?? messageId;
      if (!entry.recipientKeys.has(recipientKey)) {
        entry.recipientKeys.add(recipientKey);
        entry.sentCount = entry.recipientKeys.size;
        if (customerId && !entry.customerIds.includes(customerId)) {
          entry.customerIds.push(customerId);
        }
      }
    }

    if (new Date(confirmedAt).getTime() < new Date(entry.confirmedAt).getTime()) {
      entry.confirmedAt = confirmedAt;
    }
  }

  return [...byDelivery.values()]
    .map(({ recipientKeys: _r, ...delivery }) => delivery)
    .sort((a, b) => new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime());
}

export async function fetchAllDeliveryReports(
  tenantId: string,
  environment: string,
  deliveries: DeployedDelivery[],
  journeyId?: string,
): Promise<DeliveryEngagementReport[]> {
  return Promise.all(
    deliveries.map((delivery) =>
      fetchDeliveryEngagementReport(tenantId, environment, delivery, journeyId),
    ),
  );
}
