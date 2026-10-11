import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { fetchSchemaVersions, type SchemaVersion } from '@/lib/schema-publish';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';

/* ================================================================
   Schema Registry — schemas as versioned contracts. Version diff
   compares two `schema_versions.snapshot` payloads field-by-field
   so a source changing shape is a reviewable event, never a
   silent break.
   ================================================================ */

export type SnapshotField = {
  name: string;
  field_type: string;
  is_required: boolean;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_pii: boolean;
  description: string | null;
};

export type RegistryEntry = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isSystem: boolean;
  currentVersion: number;
  fieldCount: number;
  versionCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
  tableName: string | null;
  usedBy: { connectorId: string; connectorName: string; direction: string }[];
};

export type FieldChangeKind =
  | 'added'
  | 'removed'
  | 'type'
  | 'nullability'
  | 'required'
  | 'primary_key'
  | 'pii';

export type FieldDiff = {
  name: string;
  kind: FieldChangeKind;
  before?: string;
  after?: string;
  /** true when this change can silently break an existing sync. */
  breaking: boolean;
};

export type ImpactRow = {
  connectorId: string;
  connectorName: string;
  direction: string;
  severity: 'safe' | 'review' | 'break';
  note: string;
};

/* ---------------- snapshot helpers ---------------- */

export function snapshotFields(snapshot: Record<string, unknown> | undefined): SnapshotField[] {
  const raw = (snapshot?.fields as Array<Record<string, unknown>> | undefined) ?? [];
  return raw.map((f) => ({
    name: String(f.name ?? ''),
    field_type: String(f.field_type ?? 'text'),
    is_required: Boolean(f.is_required),
    is_nullable: f.is_nullable === undefined ? true : Boolean(f.is_nullable),
    is_primary_key: Boolean(f.is_primary_key),
    is_pii: Boolean(f.is_pii),
    description: (f.description as string) ?? null,
  }));
}

/** Diff FROM older `a` TO newer `b`. */
export function diffSnapshots(a: SnapshotField[], b: SnapshotField[]): FieldDiff[] {
  const aMap = new Map(a.map((f) => [f.name, f]));
  const bMap = new Map(b.map((f) => [f.name, f]));
  const out: FieldDiff[] = [];

  for (const f of b) {
    if (!aMap.has(f.name)) {
      out.push({
        name: f.name,
        kind: 'added',
        after: f.field_type,
        breaking: f.is_required && !f.is_nullable, // new required col breaks writers that don't send it
      });
    }
  }
  for (const f of a) {
    if (!bMap.has(f.name)) {
      out.push({ name: f.name, kind: 'removed', before: f.field_type, breaking: true });
    }
  }
  for (const f of b) {
    const prev = aMap.get(f.name);
    if (!prev) continue;
    if (prev.field_type !== f.field_type)
      out.push({ name: f.name, kind: 'type', before: prev.field_type, after: f.field_type, breaking: true });
    if (prev.is_nullable !== f.is_nullable)
      out.push({
        name: f.name,
        kind: 'nullability',
        before: prev.is_nullable ? 'nullable' : 'not null',
        after: f.is_nullable ? 'nullable' : 'not null',
        breaking: !f.is_nullable, // tightening to NOT NULL can break
      });
    if (prev.is_required !== f.is_required)
      out.push({
        name: f.name,
        kind: 'required',
        before: prev.is_required ? 'required' : 'optional',
        after: f.is_required ? 'required' : 'optional',
        breaking: f.is_required,
      });
    if (prev.is_primary_key !== f.is_primary_key)
      out.push({
        name: f.name,
        kind: 'primary_key',
        before: String(prev.is_primary_key),
        after: String(f.is_primary_key),
        breaking: true,
      });
    if (prev.is_pii !== f.is_pii)
      out.push({
        name: f.name,
        kind: 'pii',
        before: String(prev.is_pii),
        after: String(f.is_pii),
        breaking: false,
      });
  }
  return out.sort((x, y) => Number(y.breaking) - Number(x.breaking) || x.name.localeCompare(y.name));
}

/* ---------------- impact ---------------- */

function mappingRows(mapping: unknown): ConnectorMappingRow[] {
  return Array.isArray(mapping) ? (mapping as ConnectorMappingRow[]) : [];
}

export function computeImpact(
  entry: RegistryEntry,
  diff: FieldDiff[],
  connectors: { id: string; name: string; direction: string; mapping: unknown }[],
): ImpactRow[] {
  const users = connectors.filter((c) => entry.usedBy.some((u) => u.connectorId === c.id));
  const removed = new Set(diff.filter((d) => d.kind === 'removed').map((d) => d.name));
  const addedRequired = diff.filter((d) => d.kind === 'added' && d.breaking).map((d) => d.name);
  const typeChanged = new Set(diff.filter((d) => d.kind === 'type').map((d) => d.name));

  return users.map((c) => {
    const rows = mappingRows(c.mapping);
    const targets = new Set(rows.map((r) => r.target_field));
    const hitsRemoved = [...removed].filter((n) => targets.has(n));
    const hitsType = [...typeChanged].filter((n) => targets.has(n));
    const missingRequired = addedRequired.filter((n) => !targets.has(n));

    if (hitsRemoved.length)
      return {
        connectorId: c.id,
        connectorName: c.name,
        direction: c.direction,
        severity: 'break' as const,
        note: `maps removed field${hitsRemoved.length > 1 ? 's' : ''}: ${hitsRemoved.join(', ')}`,
      };
    if (missingRequired.length)
      return {
        connectorId: c.id,
        connectorName: c.name,
        direction: c.direction,
        severity: 'review' as const,
        note: `no mapping for new required field${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.join(', ')}`,
      };
    if (hitsType.length)
      return {
        connectorId: c.id,
        connectorName: c.name,
        direction: c.direction,
        severity: 'review' as const,
        note: `type changed on mapped field${hitsType.length > 1 ? 's' : ''}: ${hitsType.join(', ')}`,
      };
    return {
      connectorId: c.id,
      connectorName: c.name,
      direction: c.direction,
      severity: 'safe' as const,
      note: 'mapping unaffected',
    };
  });
}

/* ---------------- hooks ---------------- */

export function useSchemaRegistry(tenantId: string | null | undefined, environment: string) {
  return useQuery({
    queryKey: ['schema-registry', tenantId, environment],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<{
      entries: RegistryEntry[];
      connectors: { id: string; name: string; direction: string; mapping: unknown }[];
    }> => {
      const [schemas, versionRows, connectorRows] = await Promise.all([
        fetchSchemasWithFields(tenantId as string, environment),
        supabase.from('schema_versions').select('schema_id, version_number'),
        supabase
          .from('connectors')
          .select('id, name, direction, mapping')
          .eq('tenant_id', tenantId as string)
          .eq('environment', environment),
      ]);

      const versionCount = new Map<string, number>();
      for (const v of versionRows.data ?? []) {
        versionCount.set(v.schema_id as string, (versionCount.get(v.schema_id as string) ?? 0) + 1);
      }

      const connectors = (connectorRows.data ?? []) as {
        id: string;
        name: string;
        direction: string;
        mapping: unknown;
      }[];

      const entries: RegistryEntry[] = schemas.map((s) => {
        const usedBy = connectors
          .filter((c) => {
            const rows = mappingRows(c.mapping);
            return rows.some(
              (r) => r.target_schema === s.slug || r.target_schema === s.name || r.target_schema === s.table_name,
            );
          })
          .map((c) => ({ connectorId: c.id, connectorName: c.name, direction: c.direction }));

        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          status: s.status,
          isSystem: s.is_system,
          currentVersion: s.current_version ?? 0,
          fieldCount: s.schema_fields.length,
          versionCount: versionCount.get(s.id) ?? 0,
          publishedAt: s.published_at ?? null,
          updatedAt: s.updated_at ?? null,
          tableName: s.table_name,
          usedBy,
        };
      });

      return { entries, connectors };
    },
  });
}

export function useSchemaVersionList(schemaId: string | undefined) {
  return useQuery({
    queryKey: ['schema-version-list', schemaId],
    enabled: Boolean(schemaId),
    queryFn: () => fetchSchemaVersions(schemaId as string),
  });
}

export type { SchemaVersion };
