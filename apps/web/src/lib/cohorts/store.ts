/**
 * Cohort persistence.
 *
 * Builds on the existing `audiences` table rather than replacing it — every
 * save dual-writes the IR (`ir_json`) and a best-effort legacy `filter_json`,
 * so campaigns, journeys and the old audience evaluator keep working against
 * cohorts authored in the new studio.
 *
 * The extra columns and tables come from `supabase/sql/64_cohorts.sql`. Every
 * read here degrades gracefully when that script has not been run yet.
 */
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import {
  createCohortIR,
  filterRootFromIR,
  irNeedsIrEvaluation,
  parseCohortIR,
  type CohortIR,
} from './ir';
import { parseFilterRoot, slugifyAudienceName, type Audience } from '@/lib/audiences';
import type { CatalogCohortRef } from './catalog';

export type CohortType = 'dynamic' | 'static';
export type CohortVisibility = 'private' | 'team';
export type CohortStatus = 'draft' | 'active' | 'archived';

export type Cohort = Audience & {
  ir_json: CohortIR;
  cohort_type: CohortType;
  entity: 'user' | 'account';
  tags: string[];
  folder: string | null;
  is_favorite: boolean;
  visibility: CohortVisibility;
  owner_id: string | null;
  /** Snapshot timestamp for static cohorts. */
  snapshot_at: string | null;
  version_number: number;
};

export type CohortVersion = {
  id: string;
  cohort_id: string;
  version_number: number;
  ir_json: CohortIR;
  name: string;
  summary: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  member_count: number | null;
  created_at: string;
};

export type CohortComment = {
  id: string;
  cohort_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  mentions: string[];
  resolved: boolean;
  created_at: string;
};

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

function normalizeCohort(row: Record<string, unknown>): Cohort {
  const filterRoot = parseFilterRoot(row.filter_json);
  const schemaSlug = (row.schema_slug as string) ?? 'customer';
  return {
    ...(row as unknown as Audience),
    filter_json: filterRoot,
    quick_search: (row.quick_search as string) ?? '',
    auto_refresh: Boolean(row.auto_refresh),
    refresh_cron: (row.refresh_cron as string) ?? null,
    last_refreshed_at: (row.last_refreshed_at as string) ?? null,
    ir_json: parseCohortIR(row.ir_json, filterRoot, schemaSlug),
    cohort_type: (row.cohort_type as CohortType) ?? 'dynamic',
    entity: (row.entity as 'user' | 'account') ?? 'user',
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    folder: (row.folder as string) ?? null,
    is_favorite: Boolean(row.is_favorite),
    visibility: (row.visibility as CohortVisibility) ?? 'team',
    owner_id: (row.owner_id as string) ?? null,
    snapshot_at: (row.snapshot_at as string) ?? null,
    version_number: Number(row.version_number ?? 1),
  };
}

export async function fetchCohorts(tenantId: string, environment: string): Promise<Cohort[]> {
  const { data, error } = await supabase
    .from('audiences')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeCohort);
}

export async function fetchCohort(id: string): Promise<Cohort | null> {
  const { data, error } = await supabase.from('audiences').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeCohort(data) : null;
}

/** Lightweight refs for the `cohort` membership condition and the catalog. */
export async function fetchCohortRefs(
  tenantId: string,
  environment: string,
  excludeId?: string,
): Promise<CatalogCohortRef[]> {
  const { data, error } = await supabase
    .from('audiences')
    .select('id, slug, name, member_count')
    .eq('tenant_id', tenantId)
    .eq('environment', environment)
    .order('name');
  if (error) return [];
  return (data ?? [])
    .filter((r) => r.id !== excludeId)
    .map((r) => ({
      slug: r.slug as string,
      name: r.name as string,
      memberCount: Number(r.member_count ?? 0),
    }));
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export type SaveCohortInput = {
  tenant_id: string;
  environment: string;
  name: string;
  description?: string;
  ir: CohortIR;
  cohort_type?: CohortType;
  tags?: string[];
  folder?: string | null;
  visibility?: CohortVisibility;
  status?: CohortStatus;
  creation_mode?: Audience['creation_mode'];
  ai_prompt?: string;
  member_count?: number;
  quick_search?: string;
};

/**
 * Columns added by 64_cohorts.sql. Stripped and retried once if the script has
 * not been run, so the studio still saves against the original schema.
 */
const EXTENDED_COLUMNS = [
  'ir_json',
  'cohort_type',
  'entity',
  'tags',
  'folder',
  'is_favorite',
  'visibility',
  'owner_id',
  'snapshot_at',
  'version_number',
] as const;

function stripExtendedColumns<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!(EXTENDED_COLUMNS as readonly string[]).includes(k)) out[k] = v;
  }
  return out as Partial<T>;
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    Boolean(error.message && /column .* does not exist|could not find the .* column/i.test(error.message))
  );
}

export async function createCohort(input: SaveCohortInput): Promise<Cohort> {
  const payload = {
    tenant_id: input.tenant_id,
    environment: input.environment,
    name: input.name,
    slug: slugifyAudienceName(input.name),
    description: input.description ?? null,
    schema_slug: input.ir.schemaSlug,
    filter_json: filterRootFromIR(input.ir),
    quick_search: input.quick_search ?? '',
    creation_mode: input.creation_mode ?? 'diy',
    ai_prompt: input.ai_prompt ?? null,
    member_count: input.member_count ?? 0,
    status: input.status ?? 'active',
    ir_json: input.ir,
    cohort_type: input.cohort_type ?? 'dynamic',
    entity: input.ir.entity,
    tags: input.tags ?? [],
    folder: input.folder ?? null,
    visibility: input.visibility ?? 'team',
    version_number: 1,
  };

  let { data, error } = await supabase.from('audiences').insert(payload).select().single();

  if (isMissingColumnError(error)) {
    ({ data, error } = await supabase
      .from('audiences')
      .insert(stripExtendedColumns(payload))
      .select()
      .single());
  }
  if (error) throw error;

  const cohort = normalizeCohort(data);
  void logAudit({
    tenantId: input.tenant_id,
    environment: input.environment,
    action: 'create',
    resourceType: 'audience',
    resourceId: cohort.id,
    resourceName: cohort.name,
    summary: `Created cohort (${payload.creation_mode})`,
  });
  void recordVersion(cohort, 'Created cohort');
  return cohort;
}

export type UpdateCohortPatch = Partial<{
  name: string;
  description: string;
  ir: CohortIR;
  cohort_type: CohortType;
  tags: string[];
  folder: string | null;
  is_favorite: boolean;
  visibility: CohortVisibility;
  status: CohortStatus;
  member_count: number;
  auto_refresh: boolean;
  refresh_cron: string | null;
  last_refreshed_at: string;
  snapshot_at: string | null;
  quick_search: string;
}>;

export async function updateCohort(
  id: string,
  patch: UpdateCohortPatch,
  versionSummary?: string,
): Promise<Cohort> {
  const prev = await fetchCohort(id);

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'ir') continue;
    payload[key] = value;
  }
  if (patch.ir) {
    payload.ir_json = patch.ir;
    payload.filter_json = filterRootFromIR(patch.ir);
    payload.schema_slug = patch.ir.schemaSlug;
    payload.entity = patch.ir.entity;
    payload.version_number = (prev?.version_number ?? 1) + 1;
  }

  let { data, error } = await supabase
    .from('audiences')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (isMissingColumnError(error)) {
    ({ data, error } = await supabase
      .from('audiences')
      .update(stripExtendedColumns(payload))
      .eq('id', id)
      .select()
      .single());
  }
  if (error) throw error;

  const updated = normalizeCohort(data);
  const auditKeys = Object.keys(patch).filter(
    (k) => !['member_count', 'last_refreshed_at'].includes(k),
  );
  if (prev && auditKeys.length) {
    void logAudit({
      tenantId: updated.tenant_id,
      environment: updated.environment,
      action: 'update',
      resourceType: 'audience',
      resourceId: updated.id,
      resourceName: updated.name,
      summary: versionSummary ?? `Updated ${auditKeys.join(', ')}`,
    });
  }
  if (patch.ir) void recordVersion(updated, versionSummary ?? 'Updated cohort logic');
  return updated;
}

export async function deleteCohort(id: string): Promise<void> {
  const prev = await fetchCohort(id);
  const { error } = await supabase.from('audiences').delete().eq('id', id);
  if (error) throw error;
  if (prev) {
    void logAudit({
      tenantId: prev.tenant_id,
      environment: prev.environment,
      action: 'delete',
      resourceType: 'audience',
      resourceId: id,
      resourceName: prev.name,
    });
  }
}

export async function duplicateCohort(cohort: Cohort, name?: string): Promise<Cohort> {
  return createCohort({
    tenant_id: cohort.tenant_id,
    environment: cohort.environment,
    name: name ?? `${cohort.name} (copy)`,
    description: cohort.description ?? undefined,
    ir: cohort.ir_json,
    cohort_type: cohort.cohort_type,
    tags: cohort.tags,
    folder: cohort.folder,
    visibility: cohort.visibility,
    status: 'draft',
    creation_mode: cohort.creation_mode,
    member_count: cohort.member_count,
  });
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
  const { error } = await supabase.from('audiences').update({ is_favorite: isFavorite }).eq('id', id);
  if (error && !isMissingColumnError(error)) throw error;
}

export async function archiveCohort(id: string): Promise<void> {
  await updateCohort(id, { status: 'archived' }, 'Archived cohort');
}

/* ------------------------------------------------------------------ *
 * Versions
 * ------------------------------------------------------------------ */

async function recordVersion(cohort: Cohort, summary: string): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from('cohort_versions').insert({
      cohort_id: cohort.id,
      version_number: cohort.version_number,
      ir_json: cohort.ir_json,
      name: cohort.name,
      summary,
      changed_by: userRes?.user?.id ?? null,
      changed_by_name:
        (userRes?.user?.user_metadata?.full_name as string) ?? userRes?.user?.email ?? null,
      member_count: cohort.member_count,
    });
  } catch {
    // 64_cohorts.sql not applied — versioning is best-effort.
  }
}

export async function fetchCohortVersions(cohortId: string, limit = 25): Promise<CohortVersion[]> {
  const { data, error } = await supabase
    .from('cohort_versions')
    .select('*')
    .eq('cohort_id', cohortId)
    .order('version_number', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((row) => ({
    ...(row as unknown as CohortVersion),
    ir_json: parseCohortIR(row.ir_json, { type: 'group', id: 'r', logic: 'and', children: [] }),
  }));
}

export async function restoreCohortVersion(
  cohortId: string,
  version: CohortVersion,
): Promise<Cohort> {
  return updateCohort(
    cohortId,
    { ir: version.ir_json },
    `Restored version ${version.version_number}`,
  );
}

/* ------------------------------------------------------------------ *
 * Static cohorts (snapshots)
 * ------------------------------------------------------------------ */

/**
 * Freeze the current membership. Static cohorts keep their member list even as
 * the underlying data changes — used for experiment audiences and holdouts.
 */
export async function snapshotCohort(
  cohort: Cohort,
  memberIds: string[],
): Promise<{ snapshotAt: string; count: number }> {
  const snapshotAt = new Date().toISOString();
  try {
    await supabase.from('cohort_snapshots').insert({
      cohort_id: cohort.id,
      tenant_id: cohort.tenant_id,
      environment: cohort.environment,
      member_ids: memberIds,
      member_count: memberIds.length,
      captured_at: snapshotAt,
    });
  } catch {
    // best-effort
  }
  await updateCohort(
    cohort.id,
    { cohort_type: 'static', snapshot_at: snapshotAt, member_count: memberIds.length },
    `Snapshot of ${memberIds.length.toLocaleString()} members`,
  );
  return { snapshotAt, count: memberIds.length };
}

export async function fetchSnapshotMembers(cohortId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('cohort_snapshots')
    .select('member_ids')
    .eq('cohort_id', cohortId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return new Set();
  return new Set((data.member_ids as string[]) ?? []);
}

/**
 * Membership map for `cohort` conditions. Static cohorts read their frozen
 * snapshot; dynamic ones are resolved by the caller re-evaluating their IR.
 */
export async function loadMembershipMap(cohorts: Cohort[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const statics = cohorts.filter((c) => c.cohort_type === 'static');
  await Promise.all(
    statics.map(async (c) => {
      map.set(c.slug, await fetchSnapshotMembers(c.id));
    }),
  );
  return map;
}

/* ------------------------------------------------------------------ *
 * Collaboration
 * ------------------------------------------------------------------ */

export async function fetchCohortComments(cohortId: string): Promise<CohortComment[]> {
  const { data, error } = await supabase
    .from('cohort_comments')
    .select('*')
    .eq('cohort_id', cohortId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as CohortComment[];
}

export async function addCohortComment(cohortId: string, body: string): Promise<CohortComment | null> {
  const mentions = [...body.matchAll(/@([\w.+-]+)/g)].map((m) => m[1]);
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('cohort_comments')
      .insert({
        cohort_id: cohortId,
        author_id: userRes?.user?.id ?? null,
        author_name:
          (userRes?.user?.user_metadata?.full_name as string) ?? userRes?.user?.email ?? null,
        body,
        mentions,
      })
      .select()
      .single();
    if (error) return null;
    return data as unknown as CohortComment;
  } catch {
    return null;
  }
}

export async function resolveCohortComment(id: string, resolved: boolean): Promise<void> {
  try {
    await supabase.from('cohort_comments').update({ resolved }).eq('id', id);
  } catch {
    // best-effort
  }
}

/* ------------------------------------------------------------------ *
 * Folders & tags — derived from what already exists, no extra table
 * ------------------------------------------------------------------ */

export function listFolders(cohorts: Cohort[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cohorts) {
    if (!c.folder) continue;
    counts.set(c.folder, (counts.get(c.folder) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listTags(cohorts: Cohort[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cohorts) {
    for (const tag of c.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

const RECENT_KEY = 'marbee.cohorts.recent';

export function markCohortUsed(id: string): void {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...list.filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — recency is a convenience, not state we depend on
  }
}

export function recentCohortIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** True when this cohort's rules cannot be run by the legacy evaluator. */
export function needsStudioEvaluation(cohort: Cohort): boolean {
  return irNeedsIrEvaluation(cohort.ir_json);
}

export function emptyCohortIR(schemaSlug = 'customer'): CohortIR {
  return createCohortIR('user', schemaSlug);
}
