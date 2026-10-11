import { useMemo, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader, Card, Badge, Button } from '@/components/ui';
import { BulkActionBar } from '@/components/bulk/BulkActionBar';
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog';
import { SelectCheckbox } from '@/components/bulk/SelectCheckbox';
import { ConfirmDialog } from '@/components/audiences/ConfirmDialog';
import { SchemaRelationshipExplorer } from '@/components/schemas/SchemaRelationshipExplorer';
import { SchemaStorageMeter } from '@/components/schemas/SchemaStorageMeter';
import { SchemaListToolbar } from '@/components/schemas/SchemaListToolbar';
import { SchemaSortHeader } from '@/components/schemas/SchemaSortHeader';
import { CreateSchemaModal } from '@/components/schemas/CreateSchemaModal';
import { SchemaDataExplorerPanel } from '@/components/schemas/SchemaDataExplorerPanel';
import { SchemaRegistryPanel } from '@/pages/SchemaRegistryPage';
import { useAuth } from '@/contexts/AuthContext';
import { useListBulkDelete } from '@/hooks/useListBulkDelete';
import { useModuleDeleteAccess } from '@/hooks/useModuleDeleteAccess';
import { fetchSchemasWithFields } from '@/lib/fetch-schemas';
import { fetchSchemaTableStats, formatSchemaDate } from '@/lib/schema-stats';
import { canDeleteDraftSchema, deleteDraftSchema } from '@/lib/schema-metadata';
import {
  DEFAULT_SCHEMA_LIST_FILTERS,
  filterAndSortSchemas,
  toggleSchemaSort,
  type SchemaListFilters,
  type SchemaSortField,
} from '@/lib/schema-list-filters';
import { getSupabaseErrorMessage } from '@/lib/schema-queries';
import {
  getSchemaStatusBadgeVariant,
  getSchemaStatusLabel,
  getSchemaTypeBadgeVariant,
  getSchemaTypeLabel,
} from '@/lib/schema-labels';

type SchemasTab = 'list' | 'erd' | 'explorer' | 'builder' | 'registry';

const TAB_LABELS: Record<SchemasTab, string> = {
  list: 'Schema list',
  erd: 'Relationship diagram',
  explorer: 'Data explorer',
  builder: 'Custom schemas',
  registry: 'Registry & versions',
};

export function SchemasPage() {
  const { tenantId, environment } = useAuth();
  const { canDelete, deleteDeniedReason } = useModuleDeleteAccess('data.schemas');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: SchemasTab =
    tabParam === 'erd' || tabParam === 'explorer' || tabParam === 'builder' || tabParam === 'registry'
      ? tabParam
      : 'list';
  const explorerSchema = searchParams.get('schema') ?? '';

  const setTab = (next: SchemasTab) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'list') {
          params.delete('tab');
          params.delete('schema');
        } else {
          params.set('tab', next);
          if (next !== 'explorer') params.delete('schema');
        }
        return params;
      },
      { replace: true },
    );
  };

  const selectExplorerSchema = useCallback(
    (slug: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', 'explorer');
          params.set('schema', slug);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [showCreate, setShowCreate] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [singleDelete, setSingleDelete] = useState<{ id: string; name: string } | null>(null);
  const [listFilters, setListFilters] = useState<SchemaListFilters>(DEFAULT_SCHEMA_LIST_FILTERS);

  const { data: schemas, isLoading, error, isError } = useQuery({
    queryKey: ['schemas', tenantId, environment],
    queryFn: () => fetchSchemasWithFields(tenantId, environment),
  });

  const { data: statsMap } = useQuery({
    queryKey: ['schema-stats', tenantId, environment, schemas?.map((s) => s.slug).join(',')],
    queryFn: () =>
      fetchSchemaTableStats(
        tenantId,
        environment,
        (schemas ?? []).map((s) => ({ slug: s.slug, table_name: s.table_name })),
      ),
    enabled: Boolean(schemas?.length),
  });

  const erdSchemas = schemas?.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    table_name: s.table_name,
    is_system: s.is_system,
    status: s.status,
    schema_fields: s.schema_fields as Array<{
      name: string;
      field_type: string;
      is_primary_key?: boolean;
      is_pii?: boolean;
      references_schema_id?: string | null;
    }>,
  }));

  const systemSchemas = schemas?.filter((s) => s.is_system) ?? [];
  const customSchemas = schemas?.filter((s) => !s.is_system) ?? [];

  const filteredSchemas = useMemo(
    () => filterAndSortSchemas(schemas ?? [], listFilters, statsMap),
    [schemas, listFilters, statsMap],
  );

  const deletableSchemas = useMemo(
    () =>
      filteredSchemas.filter((s) =>
        canDeleteDraftSchema({
          isSystem: s.is_system,
          status: s.status,
          tableName: s.table_name,
          currentVersion: s.current_version,
        }),
      ),
    [filteredSchemas],
  );

  const bulk = useListBulkDelete({
    module: 'data.schemas',
    items: deletableSchemas.map((s) => ({ id: s.id, label: s.name })),
    deleteFn: deleteDraftSchema,
    onComplete: () => {
      queryClient.invalidateQueries({ queryKey: ['schemas', tenantId, environment] });
      queryClient.invalidateQueries({ queryKey: ['schema-stats', tenantId, environment] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDraftSchema,
    onSuccess: (result) => {
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteError('');
      queryClient.invalidateQueries({ queryKey: ['schemas', tenantId, environment] });
      queryClient.invalidateQueries({ queryKey: ['schema-stats', tenantId, environment] });
    },
    onError: (e: Error) => setDeleteError(e.message),
  });

  const handleDeleteDraft = (name: string, schemaId: string) => {
    setSingleDelete({ id: schemaId, name });
  };

  const confirmSingleDelete = () => {
    if (!singleDelete) return;
    deleteMutation.mutate(singleDelete.id, {
      onSuccess: () => setSingleDelete(null),
    });
  };

  const handleColumnSort = (field: SchemaSortField) => {
    setListFilters((prev) => toggleSchemaSort(prev, field));
  };

  return (
    <div>
      <PageHeader
        title="Schemas"
        description="OOTB data models, relationships, custom schema definitions, and data explorer"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New schema
          </Button>
        }
      />

      <div className="mb-6 flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {(['list', 'erd', 'explorer', 'builder', 'registry'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <Card>
          {!canDelete && deleteDeniedReason && (
            <div className="border-b border-amber-100 bg-amber-50 px-6 py-3 text-sm text-amber-900">
              {deleteDeniedReason}
            </div>
          )}
          {isError && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
              Failed to load schemas: {getSupabaseErrorMessage(error)}
            </div>
          )}

          {!isLoading && !isError && !schemas?.length && (
            <div className="border-b border-amber-100 bg-amber-50 px-6 py-4 text-sm text-amber-900">
              <p className="font-medium">No schemas found for this environment.</p>
              <p className="mt-1 text-amber-800">
                Viewing <strong>{environment}</strong> · tenant{' '}
                <code className="rounded bg-amber-100 px-1 text-xs">{tenantId}</code>
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-amber-800">
                <li>
                  Switch the environment dropdown (top bar) to <strong>Production</strong> — OOTB schemas
                  are seeded there by default.
                </li>
                <li>
                  Run <code className="rounded bg-amber-100 px-1">10_fix_ootb_schemas.sql</code> in Supabase
                  SQL Editor to seed all environments and link your user.
                </li>
                <li>
                  If fields show 0, also run <code className="rounded bg-amber-100 px-1">07_all_schema_fields.sql</code>.
                </li>
              </ul>
            </div>
          )}

          {(schemas?.length ?? 0) > 0 && (
            <SchemaListToolbar
              filters={listFilters}
              onChange={setListFilters}
              totalCount={schemas?.length ?? 0}
              filteredCount={filteredSchemas.length}
            />
          )}

          {!isLoading && (schemas?.length ?? 0) > 0 && filteredSchemas.length === 0 && (
            <div className="border-b border-slate-100 px-6 py-8 text-center text-sm text-slate-500">
              No schemas match your search or filters.{' '}
              <button
                type="button"
                onClick={() => setListFilters(DEFAULT_SCHEMA_LIST_FILTERS)}
                className="text-brand-600 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          <BulkActionBar
            count={bulk.selection.count}
            resourceLabel={bulk.resourceLabel}
            onDelete={bulk.openDeleteConfirm}
            onClear={bulk.selection.clear}
            disabled={!canDelete || bulk.deleting}
          />

          {(deleteError || bulk.lastError) && (
            <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
              {bulk.lastError || deleteError}
            </div>
          )}

          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-sm">
            <colgroup>
              {canDelete && <col className="w-10" />}
              <col />
              <col className="w-28" />
              <col className="w-20" />
              <col className="w-32" />
              <col className="w-32" />
              <col className="w-44" />
              <col className="w-28" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                {canDelete && (
                  <th className="w-10 px-4 py-3 align-middle">
                    <SelectCheckbox
                      checked={bulk.selection.allSelected && deletableSchemas.length > 0}
                      indeterminate={bulk.selection.someSelected && !bulk.selection.allSelected}
                      onChange={() => bulk.selection.toggleAll(deletableSchemas.map((s) => s.id))}
                      aria-label="Select all deletable schemas"
                    />
                  </th>
                )}
                <th className="px-6 py-3 font-medium">
                  <SchemaSortHeader
                    label="Schema name"
                    field="name"
                    sortField={listFilters.sortField}
                    sortDir={listFilters.sortDir}
                    onSort={handleColumnSort}
                  />
                </th>
                <th className="w-28 px-4 py-3 font-medium">
                  <SchemaSortHeader
                    label="Type"
                    field="type"
                    sortField={listFilters.sortField}
                    sortDir={listFilters.sortDir}
                    onSort={handleColumnSort}
                  />
                </th>
                <th className="w-20 px-4 py-3 font-medium">
                  <SchemaSortHeader
                    label="Fields"
                    field="fields"
                    sortField={listFilters.sortField}
                    sortDir={listFilters.sortDir}
                    onSort={handleColumnSort}
                  />
                </th>
                <th className="w-32 px-4 py-3 font-medium whitespace-nowrap">
                  <SchemaSortHeader
                    label="Created on"
                    field="created_at"
                    sortField={listFilters.sortField}
                    sortDir={listFilters.sortDir}
                    onSort={handleColumnSort}
                  />
                </th>
                <th className="w-32 px-4 py-3 font-medium whitespace-nowrap">
                  <SchemaSortHeader
                    label="Last modified"
                    field="updated_at"
                    sortField={listFilters.sortField}
                    sortDir={listFilters.sortDir}
                    onSort={handleColumnSort}
                  />
                </th>
                <th className="min-w-[11rem] px-4 py-3 font-medium whitespace-nowrap">
                  <SchemaSortHeader
                    label="Records / Storage"
                    field="records"
                    sortField={listFilters.sortField}
                    sortDir={listFilters.sortDir}
                    onSort={handleColumnSort}
                  />
                </th>
                <th className="w-28 px-4 py-3 font-medium">
                  <SchemaSortHeader
                    label="Status"
                    field="status"
                    sortField={listFilters.sortField}
                    sortDir={listFilters.sortDir}
                    onSort={handleColumnSort}
                  />
                </th>
                <th className="w-12 px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredSchemas.map((s) => {
                const stats = statsMap?.get(s.slug);
                const isRowDeletable = canDeleteDraftSchema({
                  isSystem: s.is_system,
                  status: s.status,
                  tableName: s.table_name,
                  currentVersion: s.current_version,
                });
                return (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  {canDelete && (
                    <td className="w-10 px-4 py-3 align-middle">
                      {isRowDeletable ? (
                        <SelectCheckbox
                          checked={bulk.selection.isSelected(s.id)}
                          onChange={() => bulk.selection.toggle(s.id)}
                          aria-label={`Select ${s.name}`}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-6 py-3 align-middle font-medium text-slate-900">
                    <Link
                      to={`/data/schemas/${s.slug}`}
                      className="text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      {s.name}
                    </Link>
                    {s.table_name && (
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{s.table_name}</p>
                    )}
                    {s.description && (
                      <p className="mt-0.5 text-xs font-normal text-slate-400 line-clamp-1">{s.description}</p>
                    )}
                  </td>
                  <td className="w-28 px-4 py-3 align-middle">
                    <Badge variant={getSchemaTypeBadgeVariant(s.is_system)}>
                      {getSchemaTypeLabel(s.is_system)}
                    </Badge>
                  </td>
                  <td className="w-20 px-4 py-3 align-middle text-slate-600">{s.schema_fields?.length ?? 0}</td>
                  <td className="w-32 px-4 py-3 align-middle whitespace-nowrap text-slate-600" title={s.created_at ?? undefined}>
                    {formatSchemaDate(s.created_at)}
                  </td>
                  <td className="w-32 px-4 py-3 align-middle whitespace-nowrap text-slate-600" title={s.updated_at ?? undefined}>
                    {formatSchemaDate(s.updated_at)}
                  </td>
                  <td className="min-w-[11rem] px-4 py-3 align-middle">
                    <SchemaStorageMeter
                      stats={stats}
                      fieldCount={s.schema_fields?.length ?? 0}
                    />
                  </td>
                  <td className="w-28 px-4 py-3 align-middle">
                    <Badge variant={getSchemaStatusBadgeVariant(s.is_system, s.status)}>
                      {getSchemaStatusLabel(s.is_system, s.status)}
                    </Badge>
                  </td>
                  <td className="w-12 px-4 py-3 align-middle">
                    {isRowDeletable && (
                      <button
                        type="button"
                        title="Delete draft"
                        onClick={() => handleDeleteDraft(s.name, s.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {tab === 'erd' && (
        <Card className="overflow-hidden p-4 md:p-6">
          {!isLoading && !schemas?.length && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Schema metadata not loaded — run <code className="rounded bg-amber-100 px-1">10_fix_ootb_schemas.sql</code>.
              The diagram below uses built-in table definitions.
            </div>
          )}
          <SchemaRelationshipExplorer schemas={erdSchemas} />
        </Card>
      )}

      {tab === 'explorer' && (
        <SchemaDataExplorerPanel
          tenantId={tenantId}
          environment={environment}
          selectedSlug={explorerSchema}
          onSelectSchema={selectExplorerSchema}
        />
      )}

      {tab === 'builder' && (
        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900">System schemas (read-only)</h3>
            <p className="mt-1 text-sm text-slate-500">
              {systemSchemas.length} OOTB schemas backed by Postgres tables with RLS.
            </p>
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="font-semibold text-slate-900">Custom schemas</h3>
              <p className="text-sm text-slate-500">Define fields, publish to Postgres, then manage records in the Data tab.</p>
            </div>
            {customSchemas.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="px-6 py-3 font-medium">Schema</th>
                    <th className="px-6 py-3 font-medium">Fields</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {customSchemas.map((s) => {
                    const canDelete = canDeleteDraftSchema({
                      isSystem: s.is_system,
                      status: s.status,
                      tableName: s.table_name,
                      currentVersion: s.current_version,
                    });
                    return (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <Link to={`/data/schemas/${s.slug}`} className="font-medium text-brand-600 hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate-500">{s.schema_fields?.length ?? 0} fields</td>
                      <td className="px-6 py-3">
                        <Badge variant={getSchemaStatusBadgeVariant(false, s.status)}>
                          {getSchemaStatusLabel(false, s.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        {canDelete && (
                          <button
                            type="button"
                            title="Delete draft"
                            onClick={() => handleDeleteDraft(s.name, s.id)}
                            disabled={deleteMutation.isPending}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">
                No custom schemas yet.{' '}
                <button type="button" onClick={() => setShowCreate(true)} className="text-brand-600 hover:underline">
                  Create one
                </button>
              </p>
            )}
          </Card>
        </div>
      )}

      {tab === 'registry' && <SchemaRegistryPanel />}

      {showCreate && <CreateSchemaModal onClose={() => setShowCreate(false)} />}

      <BulkDeleteDialog
        open={bulk.confirmOpen}
        title="Delete draft schemas"
        resourceLabel={bulk.resourceLabel}
        items={bulk.selectedItems}
        loading={bulk.deleting}
        onConfirm={bulk.confirmBulkDelete}
        onCancel={() => bulk.setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(singleDelete)}
        title="Delete draft schema"
        message={
          singleDelete
            ? `You are about to permanently delete the draft schema "${singleDelete.name}". This cannot be undone.`
            : ''
        }
        loading={deleteMutation.isPending}
        onConfirm={confirmSingleDelete}
        onCancel={() => setSingleDelete(null)}
      />
    </div>
  );
}
