import { supabase } from './supabase';
import { fetchWebPushSubscribers } from './web-analytics';

export type SchemaTableStats = {
  slug: string;
  table_name: string;
  record_count: number;
  size_bytes: number;
  index_bytes: number;
};

/** Per-tenant storage quota shown in UI (1 GB default) */
export const TENANT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatSchemaDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRecordCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

async function countTableRecords(
  tableName: string,
  tenantId: string,
  environment: string,
): Promise<number> {
  const client = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

  const { count, error } = await client
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('environment', environment);

  if (error) return 0;
  return count ?? 0;
}

/** Client fallback when RPC is not deployed — record counts only */
async function fetchStatsFallback(
  tenantId: string,
  environment: string,
  schemas: Array<{ slug: string; table_name: string | null }>,
): Promise<SchemaTableStats[]> {
  const results: SchemaTableStats[] = [];

  for (const s of schemas) {
    if (!s.table_name) continue;
    const record_count = await countTableRecords(s.table_name, tenantId, environment);
    // Rough estimate: ~512 bytes per row when size RPC unavailable
    const size_bytes = record_count * 512;
    results.push({
      slug: s.slug,
      table_name: s.table_name,
      record_count,
      size_bytes,
      index_bytes: Math.round(size_bytes * 0.15),
    });
  }

  return results;
}

export async function fetchSchemaTableStats(
  tenantId: string,
  environment: string,
  schemas: Array<{ slug: string; table_name: string | null }>,
): Promise<Map<string, SchemaTableStats>> {
  const { data, error } = await supabase.rpc('get_schema_table_stats', {
    p_tenant_id: tenantId,
    p_environment: environment,
  });

  let stats: SchemaTableStats[];

  if (!error && Array.isArray(data)) {
    stats = data as SchemaTableStats[];
  } else {
    stats = await fetchStatsFallback(tenantId, environment, schemas);
  }

  // Ensure pushSubscribers has live count from Web Analytics feed
  try {
    const pushSubs = await fetchWebPushSubscribers(tenantId, environment);
    const existing = stats.find(
      (s) => s.slug === 'web_push_subscriber' || s.slug === 'pushSubscribers' || s.table_name === 'pushSubscribers',
    );
    if (existing) {
      existing.record_count = pushSubs.length;
      existing.size_bytes = pushSubs.length * 512;
    } else {
      stats.push({
        slug: 'web_push_subscriber',
        table_name: 'pushSubscribers',
        record_count: pushSubs.length,
        size_bytes: pushSubs.length * 512,
        index_bytes: Math.round(pushSubs.length * 512 * 0.15),
      });
    }
  } catch {}

  return new Map(stats.map((s) => [s.slug, s]));
}

export function estimateDataBytes(recordCount: number, fieldCount: number): number {
  return Math.max(recordCount * Math.max(64, fieldCount * 48), 0);
}
