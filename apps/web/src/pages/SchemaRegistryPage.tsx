import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertCircle, Boxes } from 'lucide-react';
import { Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { formatNumber } from '@/lib/utils';
import { DataTable, type Column } from '@/components/data/DataTable';
import { StatusPill } from '@/components/data/StatusPill';
import { SchemaDiffView } from '@/components/data/SchemaDiffView';
import {
  computeImpact,
  diffSnapshots,
  snapshotFields,
  useSchemaRegistry,
  useSchemaVersionList,
  type RegistryEntry,
} from '@/lib/schema-registry';

/** Standalone route kept for old links — the registry now lives as a Schemas tab. */
export function SchemaRegistryPage() {
  return <Navigate to="/data/schemas?tab=registry" replace />;
}

/** Embedded panel rendered by SchemasPage under the "Registry" tab. */
export function SchemaRegistryPanel() {
  const { tenantId, environment } = useAuth();
  const { data, isLoading, isError, refetch } = useSchemaRegistry(tenantId, environment);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = data?.entries ?? [];
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const columns = useMemo<Column<RegistryEntry>[]>(
    () => [
      {
        key: 'name',
        header: 'Schema',
        width: 220,
        pinnable: true,
        render: (e) => (
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-slate-900">{e.name}</span>
            {e.isSystem && (
              <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] uppercase text-slate-500">sys</span>
            )}
          </span>
        ),
        exportValue: (e) => e.name,
      },
      { key: 'status', header: 'Status', width: 120, render: (e) => <StatusPill status={e.status} />, exportValue: (e) => e.status },
      {
        key: 'version',
        header: 'Version',
        width: 90,
        align: 'right',
        render: (e) => <span className="font-mono text-xs">v{e.currentVersion}</span>,
        exportValue: (e) => e.currentVersion,
      },
      {
        key: 'fields',
        header: 'Fields',
        width: 80,
        align: 'right',
        sortable: true,
        render: (e) => <span className="font-mono text-xs">{e.fieldCount}</span>,
        exportValue: (e) => e.fieldCount,
      },
      {
        key: 'versions',
        header: 'Versions',
        width: 90,
        align: 'right',
        render: (e) => <span className="font-mono text-xs">{e.versionCount}</span>,
        exportValue: (e) => e.versionCount,
      },
      {
        key: 'published',
        header: 'Last published',
        width: 130,
        sortable: true,
        render: (e) => <span className="text-xs text-slate-500">{e.publishedAt ? relTime(e.publishedAt) : 'unpublished'}</span>,
        exportValue: (e) => e.publishedAt ?? '',
      },
      {
        key: 'usedBy',
        header: 'Used by',
        width: 160,
        render: (e) =>
          e.usedBy.length === 0 ? (
            <span className="text-xs text-slate-400">—</span>
          ) : (
            <span className="truncate text-xs text-slate-600">
              {e.usedBy[0].connectorName}
              {e.usedBy.length > 1 && ` +${e.usedBy.length - 1}`}
            </span>
          ),
        exportValue: (e) => e.usedBy.map((u) => u.connectorName).join('; '),
      },
    ],
    [],
  );

  if (isError) {
    return (
      <Card className="flex items-center gap-3 p-6 text-sm text-red-700">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Couldn&apos;t load the registry.</p>
          <button type="button" onClick={() => refetch()} className="mt-1 text-red-600 underline">
            Retry
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Every schema as a versioned contract. Select a row to compare versions and see who a change affects.
      </p>
      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(e) => e.id}
        totalCount={entries.length}
        loading={isLoading}
        onRowClick={(e) => setSelectedId(e.id)}
        emptyState="No schemas defined yet."
      />

      {selected && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Boxes className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{selected.name}</h3>
            <Link to={`/data/schemas/${selected.slug}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              open
            </Link>
          </div>
          <VersionDiffPanel entry={selected} connectors={data?.connectors ?? []} />
        </Card>
      )}
    </div>
  );
}

function VersionDiffPanel({
  entry,
  connectors,
}: {
  entry: RegistryEntry;
  connectors: { id: string; name: string; direction: string; mapping: unknown }[];
}) {
  const { data: versions, isLoading } = useSchemaVersionList(entry.id);
  const [fromV, setFromV] = useState<number | null>(null);
  const [toV, setToV] = useState<number | null>(null);

  useEffect(() => {
    if (!versions || versions.length < 2) return;
    setToV(versions[0].version_number);
    setFromV(versions[1].version_number);
  }, [versions]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading versions…</p>;
  if (!versions || versions.length < 2) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
        {versions?.length === 1
          ? 'Only one published version. A diff needs two — publish again after changing fields.'
          : 'No published versions yet.'}
      </p>
    );
  }

  const from = versions.find((v) => v.version_number === fromV);
  const to = versions.find((v) => v.version_number === toV);
  if (!from || !to) return null;

  const diff = diffSnapshots(snapshotFields(from.snapshot), snapshotFields(to.snapshot));
  const impact = computeImpact(entry, diff, connectors);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-slate-500">
          From
          <select
            value={fromV ?? ''}
            onChange={(e) => setFromV(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.version_number}>
                v{v.version_number}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-500">
          To
          <select
            value={toV ?? ''}
            onChange={(e) => setToV(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.version_number}>
                v{v.version_number}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">
          {formatNumber(snapshotFields(to.snapshot).length)} fields at v{to.version_number}
        </span>
      </div>

      {to.change_notes && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-700">v{to.version_number} notes:</span> {to.change_notes}
        </p>
      )}

      <SchemaDiffView
        schemaName={entry.name}
        fromVersion={from.version_number}
        toVersion={to.version_number}
        diff={diff}
        impact={impact}
      />
    </div>
  );
}

function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
