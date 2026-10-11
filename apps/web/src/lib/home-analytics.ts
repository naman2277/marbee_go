import { supabase } from './supabase';

export type EngagementCounts = {
  sent: number;
  delivered: number;
  engaged: number;
  converted: number;
  failed: number;
};

export type ChannelStats = {
  channel: string;
  sent: number;
  delivered: number;
  engaged: number;
  converted: number;
};

export type DailyVolume = {
  date: string;
  label: string;
  sent: number;
  engaged: number;
};

export type JourneySummary = {
  id: string;
  name: string;
  status: string;
};

export type ActivityItem = {
  id: string;
  event: string;
  channel: string;
  timestamp: string;
};

export type PlatformSnapshot = {
  customers: number;
  events: number;
  journeys: number;
  audiences: number;
};

export type PulseMetrics = {
  today: EngagementCounts;
  yesterday: EngagementCounts;
  channels: ChannelStats[];
  journeys: JourneySummary[];
  recentActivity: ActivityItem[];
  customersLastDay: number;
  customersPreviousDay: number;
  totalCustomers: number;
};

export type InsightsMetrics = {
  period: EngagementCounts;
  previousPeriod: EngagementCounts;
  dailyVolume: DailyVolume[];
  channels: ChannelStats[];
  snapshot: PlatformSnapshot;
};

const EMPTY_COUNTS: EngagementCounts = {
  sent: 0,
  delivered: 0,
  engaged: 0,
  converted: 0,
  failed: 0,
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function countEngagement(rows: { event: string }[]): EngagementCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) {
    if (row.event === 'sent') counts.sent++;
    else if (row.event === 'delivered') counts.delivered++;
    else if (row.event === 'opened' || row.event === 'clicked') counts.engaged++;
    else if (row.event === 'converted') counts.converted++;
    else if (row.event === 'failed') counts.failed++;
  }
  return counts;
}

function groupByChannel(rows: { event: string; channel: string }[]): ChannelStats[] {
  const map = new Map<string, ChannelStats>();
  for (const row of rows) {
    const key = row.channel || 'unknown';
    const entry = map.get(key) ?? { channel: key, sent: 0, delivered: 0, engaged: 0, converted: 0 };
    if (row.event === 'sent') entry.sent++;
    else if (row.event === 'delivered') entry.delivered++;
    else if (row.event === 'opened' || row.event === 'clicked') entry.engaged++;
    else if (row.event === 'converted') entry.converted++;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.sent - a.sent);
}

function groupByDay(rows: { event: string; timestamp: string }[], days: number): DailyVolume[] {
  const today = startOfDay(new Date());
  const buckets: DailyVolume[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    buckets.push({
      date: iso,
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      sent: 0,
      engaged: 0,
    });
  }

  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const row of rows) {
    const day = row.timestamp.split('T')[0];
    const idx = index.get(day);
    if (idx === undefined) continue;
    if (row.event === 'sent') buckets[idx].sent++;
    if (row.event === 'opened' || row.event === 'clicked') buckets[idx].engaged++;
  }

  return buckets;
}

async function fetchEngagementRows(
  tenantId: string,
  environment: string,
  from: Date,
  to?: Date,
) {
  let query = supabase
    .from('engagement_log')
    .select('id, event, channel, timestamp')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .gte('timestamp', from.toISOString());

  if (to) {
    query = query.lt('timestamp', to.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Rollup-backed reads (v2). rollup_engagement_daily is maintained every ~2 min
// by refresh_rollups() so multi-day/multi-month windows never scan raw
// engagement_log. Returns null when the table is absent (pre-v2) so callers
// transparently fall back to the raw path.
// ---------------------------------------------------------------------------
type RollupRow = {
  day: string;
  channel: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  unsubscribed: number;
  converted: number;
};

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function fetchEngagementRollup(
  tenantId: string,
  environment: string,
  fromDay: string,
  toDayExclusive: string,
): Promise<RollupRow[] | null> {
  const { data, error } = await supabase
    .from('rollup_engagement_daily')
    .select('day, channel, sent, delivered, opened, clicked, failed, unsubscribed, converted')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .gte('day', fromDay)
    .lt('day', toDayExclusive);

  if (error) return null; // table not present yet -> caller uses raw path
  return (data ?? []) as RollupRow[];
}

function rollupCounts(rows: RollupRow[]): EngagementCounts {
  const c = { ...EMPTY_COUNTS };
  for (const r of rows) {
    if (r.channel !== 'all') continue;
    c.sent += r.sent;
    c.delivered += r.delivered;
    c.engaged += r.opened + r.clicked;
    c.converted += r.converted;
    c.failed += r.failed;
  }
  return c;
}

function rollupChannels(rows: RollupRow[]): ChannelStats[] {
  const map = new Map<string, ChannelStats>();
  for (const r of rows) {
    if (r.channel === 'all') continue;
    const key = r.channel || 'unknown';
    const entry = map.get(key) ?? { channel: key, sent: 0, delivered: 0, engaged: 0, converted: 0 };
    entry.sent += r.sent;
    entry.delivered += r.delivered;
    entry.engaged += r.opened + r.clicked;
    entry.converted += r.converted;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.sent - a.sent);
}

function rollupDailyVolume(rows: RollupRow[], days: number): DailyVolume[] {
  const today = startOfDay(new Date());
  const buckets: DailyVolume[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      date: toIsoDate(d),
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      sent: 0,
      engaged: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const r of rows) {
    if (r.channel !== 'all') continue;
    const idx = index.get(r.day);
    if (idx === undefined) continue;
    buckets[idx].sent += r.sent;
    buckets[idx].engaged += r.opened + r.clicked;
  }
  return buckets;
}

export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function deliveryRate(counts: EngagementCounts): number | null {
  if (!counts.sent) return null;
  return (counts.delivered / counts.sent) * 100;
}

export function engagementRate(counts: EngagementCounts): number | null {
  if (!counts.delivered) return null;
  return (counts.engaged / counts.delivered) * 100;
}

export function conversionRate(counts: EngagementCounts): number | null {
  if (!counts.engaged) return null;
  return (counts.converted / counts.engaged) * 100;
}

export async function fetchPulseMetrics(tenantId: string, environment: string): Promise<PulseMetrics> {
  const todayStart = startOfDay(new Date());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  const [
    todayRows,
    yesterdayRows,
    journeysResult,
    recentResult,
    customersLastDayResult,
    customersPreviousDayResult,
    totalCustomersResult,
  ] = await Promise.all([
    fetchEngagementRows(tenantId, environment, todayStart),
    fetchEngagementRows(tenantId, environment, yesterdayStart, todayStart),
    supabase
      .from('journeys')
      .select('id, name, status')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .in('status', ['published', 'draft', 'paused'])
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('engagement_log')
      .select('id, event, channel, timestamp')
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .order('timestamp', { ascending: false })
      .limit(10),
    supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .gte('created_at', twentyFourHoursAgo),
    supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .gte('created_at', fortyEightHoursAgo)
      .lt('created_at', twentyFourHoursAgo),
    supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('environment', environment)
      .is('deleted_at', null)
      .neq('status', 'merged'),
  ]);

  if (journeysResult.error) throw journeysResult.error;
  if (recentResult.error) throw recentResult.error;

  return {
    today: countEngagement(todayRows),
    yesterday: countEngagement(yesterdayRows),
    channels: groupByChannel(todayRows),
    journeys: journeysResult.data ?? [],
    recentActivity: recentResult.data ?? [],
    customersLastDay: customersLastDayResult.count ?? 0,
    customersPreviousDay: customersPreviousDayResult.count ?? 0,
    totalCustomers: totalCustomersResult.count ?? 0,
  };
}

async function fetchCount(
  table: string,
  tenantId: string,
  environment: string,
  mode: 'exact' | 'estimated' = 'exact',
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: mode, head: true })
    .eq('tenant_id', tenantId)
    .eq('environment', environment);
  if (error) throw error;
  return count ?? 0;
}

async function fetchSnapshot(tenantId: string, environment: string): Promise<PlatformSnapshot> {
  const [customers, events, journeys, audiences] = await Promise.all([
    fetchCount('customers', tenantId, environment),
    // events is partitioned & unbounded — an estimate is plenty for a KPI tile
    fetchCount('events', tenantId, environment, 'estimated'),
    fetchCount('journeys', tenantId, environment),
    fetchCount('audiences', tenantId, environment),
  ]);
  return { customers, events, journeys, audiences };
}

export async function fetchInsightsMetrics(
  tenantId: string,
  environment: string,
  days: 7 | 30 | 90,
): Promise<InsightsMetrics> {
  const periodEnd = startOfDay(new Date());
  periodEnd.setDate(periodEnd.getDate() + 1);
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - days);

  const prevEnd = new Date(periodStart);
  const prevStart = new Date(periodStart);
  prevStart.setDate(prevStart.getDate() - days);

  // Fast path: pre-aggregated daily rollups (v2). One query covers both periods.
  const [rollup, snapshot] = await Promise.all([
    fetchEngagementRollup(tenantId, environment, toIsoDate(prevStart), toIsoDate(periodEnd)),
    fetchSnapshot(tenantId, environment),
  ]);

  if (rollup) {
    const periodFrom = toIsoDate(periodStart);
    const inPeriod = rollup.filter((r) => r.day >= periodFrom);
    const inPrev = rollup.filter((r) => r.day < periodFrom);
    return {
      period: rollupCounts(inPeriod),
      previousPeriod: rollupCounts(inPrev),
      dailyVolume: rollupDailyVolume(inPeriod, Math.min(days, 14)),
      channels: rollupChannels(inPeriod),
      snapshot,
    };
  }

  // Fallback: raw engagement_log (pre-v2 databases).
  const [periodRows, prevRows] = await Promise.all([
    fetchEngagementRows(tenantId, environment, periodStart, periodEnd),
    fetchEngagementRows(tenantId, environment, prevStart, prevEnd),
  ]);

  return {
    period: countEngagement(periodRows),
    previousPeriod: countEngagement(prevRows),
    dailyVolume: groupByDay(periodRows, Math.min(days, 14)),
    channels: groupByChannel(periodRows),
    snapshot,
  };
}
