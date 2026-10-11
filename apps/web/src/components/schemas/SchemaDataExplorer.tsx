import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, Copy, Download, Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { Card, CardHeader, Badge, Button } from '@/components/ui';
import { SchemaFilterEditor, applyQuickSearch } from '@/components/schemas/SchemaFilterEditor';
import { SchemaDataColumnsModal } from '@/components/schemas/SchemaDataColumnsModal';
import { DataExplorerSortHeader } from '@/components/schemas/DataExplorerSortHeader';
import { CustomRecordModal } from '@/components/schemas/CustomRecordModal';
import type { SchemaFieldRow } from '@/components/schemas/SchemaFieldsEditor';
import {
  SCHEMA_TABLE_CONFIG,
  formatCellValue,
  getColumnCellValue,
  getColumnHeaderLabel,
  listAvailableDataFields,
  resolveDataColumnSpecs,
  type DataColumnSpec,
} from '@/lib/schema-data';
import {
  applyFilterRoot,
  buildFilterFields,
  createFilterRoot,
  type FilterRoot,
} from '@/lib/schema-filters';
import { copyText, downloadTextFile, rowsToCsv, rowsToText } from '@/lib/schema-export';
import {
  applyOutputGrouping,
  columnsStorageKey,
  loadSavedColumns,
  mergeColumnFilterFields,
  normalizeColumnList,
  resolveColumnSourceKey,
  saveColumns,
  sortExplorerRows,
  type DataExplorerSortDir,
} from '@/lib/schema-explorer-columns';
import {
  createSchemaRecord,
  deleteSchemaRecord,
  fetchSchemaRows,
  updateSchemaRecord,
} from '@/lib/schema-records';

export type SchemaDataExplorerSchema = {
  id: string;
  name: string;
  slug: string;
  table_name: string;
  is_system: boolean;
  status: string;
  schema_fields: SchemaFieldRow[];
};

type Props = {
  schema: SchemaDataExplorerSchema;
  tenantId: string;
  environment: string;
  resetKey?: string;
};

export function SchemaDataExplorer({ schema, tenantId, environment, resetKey }: Props) {
  const queryClient = useQueryClient();
  const storageKey = columnsStorageKey(tenantId, environment, schema.slug);

  const [filterRoot, setFilterRoot] = useState<FilterRoot>(() => createFilterRoot());
  const [quickSearch, setQuickSearch] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [recordModal, setRecordModal] = useState<{ mode: 'create' | 'edit'; row?: Record<string, unknown> } | null>(null);
  const [outputColumns, setOutputColumns] = useState<DataColumnSpec[] | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<DataExplorerSortDir>('asc');

  const tableConfig = SCHEMA_TABLE_CONFIG[schema.table_name];
  const isCustomPublished = !schema.is_system && schema.status === 'published';

  const { data: rows, isLoading: dataLoading } = useQuery({
    queryKey: ['schema-data', schema.table_name, tenantId, environment],
    queryFn: () => fetchSchemaRows(schema.table_name, tenantId, environment),
  });

  const defaultColumns = useMemo(
    () => resolveDataColumnSpecs(schema.table_name, schema.schema_fields, rows, tableConfig, null),
    [schema, rows, tableConfig],
  );

  useEffect(() => {
    setFilterRoot(createFilterRoot());
    setQuickSearch('');
    setOutputColumns(loadSavedColumns(storageKey));
    setDownloadMenuOpen(false);
    setExportMsg('');
    setSortColumnId(null);
    setSortDir('asc');
  }, [resetKey ?? schema.slug, storageKey]);

  const dataColumns = useMemo(
    () => normalizeColumnList(outputColumns ?? defaultColumns),
    [outputColumns, defaultColumns],
  );

  const handleColumnsChange = (columns: DataColumnSpec[]) => {
    const normalized = normalizeColumnList(columns);
    setOutputColumns(normalized);
    saveColumns(storageKey, normalized);
  };

  const availableDataFields = useMemo(
    () => listAvailableDataFields(schema.table_name, schema.schema_fields, rows, tableConfig),
    [schema, rows, tableConfig],
  );

  const baseFilterFields = useMemo(
    () =>
      buildFilterFields(
        availableDataFields.map((f) => f.key),
        schema.schema_fields,
        tableConfig?.relationFields ?? [],
      ),
    [availableDataFields, schema.schema_fields, tableConfig],
  );

  const filterFields = useMemo(
    () => mergeColumnFilterFields(baseFilterFields, dataColumns),
    [baseFilterFields, dataColumns],
  );

  const exportFields = useMemo(
    () =>
      dataColumns.map((col) => ({
        key: col.alias || col.key,
        label: getColumnHeaderLabel(col, filterFields),
        type: 'string' as const,
        getValue: (row: Record<string, unknown>) => getColumnCellValue(row, col, baseFilterFields),
      })),
    [dataColumns, filterFields, baseFilterFields],
  );

  const filteredRows = useMemo(() => {
    const byRules = applyFilterRoot(rows ?? [], filterRoot, filterFields);
    return applyQuickSearch(byRules, quickSearch, filterFields);
  }, [rows, filterRoot, filterFields, quickSearch]);

  const displayedRows = useMemo(
    () => applyOutputGrouping(filteredRows, dataColumns, baseFilterFields),
    [filteredRows, dataColumns, baseFilterFields],
  );

  const sortedRows = useMemo(() => {
    if (!sortColumnId) return displayedRows;
    const column = dataColumns.find((col) => col.id === sortColumnId);
    if (!column) return displayedRows;
    return sortExplorerRows(displayedRows, column, sortDir, baseFilterFields);
  }, [displayedRows, sortColumnId, sortDir, dataColumns, baseFilterFields]);

  const handleColumnSort = (columnId: string) => {
    if (sortColumnId === columnId) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumnId(columnId);
    setSortDir('asc');
  };

  const isGrouped = dataColumns.some((c) => c.groupBy);
  const sampleRow = filteredRows[0] ?? rows?.[0];

  const exportFilenameBase = `${schema.slug}-${environment}-${new Date().toISOString().slice(0, 10)}`;

  const invalidateData = () =>
    queryClient.invalidateQueries({ queryKey: ['schema-data', schema.table_name] });

  const saveRecordMutation = useMutation({
    mutationFn: async (record: Record<string, unknown>) => {
      if (recordModal?.mode === 'edit' && recordModal.row?.id) {
        return updateSchemaRecord(schema.table_name, String(recordModal.row.id), record);
      }
      return createSchemaRecord(schema.table_name, tenantId, environment, record);
    },
    onSuccess: () => {
      invalidateData();
      setRecordModal(null);
    },
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string) => deleteSchemaRecord(schema.table_name, id),
    onSuccess: invalidateData,
  });

  const handleCopy = async (format: 'csv' | 'text') => {
    if (!sortedRows.length) {
      setExportMsg('Nothing to copy — adjust filters or load data first.');
      return;
    }
    const content =
      format === 'csv' ? rowsToCsv(sortedRows, exportFields) : rowsToText(sortedRows, exportFields);
    await copyText(content);
    setExportMsg(`Copied ${sortedRows.length} row(s) as ${format.toUpperCase()}.`);
    setTimeout(() => setExportMsg(''), 3000);
  };

  const handleDownload = (format: 'csv' | 'text') => {
    if (!sortedRows.length) {
      setExportMsg('Nothing to export — adjust filters or load data first.');
      return;
    }
    if (format === 'csv') {
      downloadTextFile(rowsToCsv(sortedRows, exportFields), `${exportFilenameBase}.csv`, 'text/csv');
    } else {
      downloadTextFile(rowsToText(sortedRows, exportFields), `${exportFilenameBase}.txt`, 'text/plain');
    }
    setExportMsg(`Downloaded ${sortedRows.length} row(s) as ${format.toUpperCase()}.`);
    setTimeout(() => setExportMsg(''), 3000);
  };

  return (
    <>
      <SchemaDataColumnsModal
        open={columnsModalOpen}
        onClose={() => setColumnsModalOpen(false)}
        schemaName={schema.name}
        availableFields={availableDataFields}
        columns={dataColumns}
        onApply={handleColumnsChange}
        filterFields={baseFilterFields}
      />

      <Card className="mb-4">
        <div className="px-5 py-3">
          <SchemaFilterEditor
            fields={filterFields}
            root={filterRoot}
            onChange={setFilterRoot}
            quickSearch={quickSearch}
            onQuickSearchChange={setQuickSearch}
            compact
            sampleRow={sampleRow}
            toolbarEnd={
              <button
                type="button"
                onClick={() => setColumnsModalOpen(true)}
                title={`Columns (${dataColumns.length})`}
                className="relative shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-brand-700"
              >
                <Columns3 className="h-3.5 w-3.5" />
                {dataColumns.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-slate-500 px-0.5 text-[9px] font-bold text-white">
                    {dataColumns.length}
                  </span>
                )}
              </button>
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={isGrouped ? 'Grouped records' : 'Records'}
          action={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="text-right">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-800">{sortedRows.length}</span>
                  {isGrouped ? ' groups' : ' rows'}
                  {!isGrouped && (
                    <>
                      {' '}of{' '}
                      <span className="font-semibold text-slate-800">{rows?.length ?? 0}</span>
                    </>
                  )}
                  {rows && rows.length >= 500 && (
                    <span className="text-slate-400"> · latest 500</span>
                  )}
                </p>
                {exportMsg && <p className="mt-0.5 text-xs text-emerald-600">{exportMsg}</p>}
              </div>

              <div className="flex items-center gap-1.5">
                {isCustomPublished && (
                  <Button size="sm" onClick={() => setRecordModal({ mode: 'create' })}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add record
                  </Button>
                )}

                <div className="relative">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDownloadMenuOpen((open) => !open)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                    <ChevronDown className="ml-1 h-3.5 w-3.5 text-slate-400" />
                  </Button>
                  {downloadMenuOpen && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-10 cursor-default"
                        aria-label="Close download menu"
                        onClick={() => setDownloadMenuOpen(false)}
                      />
                      <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            void handleCopy('csv');
                            setDownloadMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                          Copy CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleCopy('text');
                            setDownloadMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                          Copy text
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDownload('csv');
                            setDownloadMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-400" />
                          Download CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleDownload('text');
                            setDownloadMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-400" />
                          Download TXT
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          }
        />
        {dataLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading data...</p>
        ) : sortedRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  {dataColumns.map((col) => (
                    <th key={col.id} className="px-6 py-3 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <DataExplorerSortHeader
                          label={getColumnHeaderLabel(col, filterFields)}
                          columnId={col.id}
                          sortColumnId={sortColumnId}
                          sortDir={sortDir}
                          onSort={handleColumnSort}
                        />
                        {col.groupBy && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            GROUP
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] font-normal text-slate-400">{col.alias}</p>
                    </th>
                  ))}
                  {isGrouped && (
                    <th className="px-6 py-3 font-medium whitespace-nowrap text-slate-500">Count</th>
                  )}
                  {isCustomPublished && !isGrouped && (
                    <th className="px-6 py-3 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={String(row.id)} className="border-b border-slate-50 hover:bg-slate-50">
                    {dataColumns.map((col) => {
                      const raw = getColumnCellValue(row, col, baseFilterFields);
                      const sourceKey = resolveColumnSourceKey(col);
                      const display = formatCellValue(sourceKey, raw);
                      const isStatus = sourceKey.includes('status');
                      const agg = row[`${col.id}__agg`] as string | undefined;

                      return (
                        <td
                          key={col.id}
                          className="max-w-[220px] truncate px-6 py-3 text-slate-600"
                          title={raw != null ? String(raw) : undefined}
                        >
                          {isStatus && raw && !agg ? (
                            <Badge
                              variant={
                                String(raw) === 'active'
                                  ? 'success'
                                  : String(raw) === 'invalid' || String(raw) === 'failed'
                                    ? 'error'
                                    : 'default'
                              }
                            >
                              {String(raw)}
                            </Badge>
                          ) : (
                            <span className={sourceKey === 'fcm_token' ? 'font-mono text-xs' : ''}>
                              {display}
                              {agg === 'sum' && (
                                <span className="ml-1 text-[10px] text-slate-400">Σ</span>
                              )}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {isGrouped && (
                      <td className="px-6 py-3 text-slate-600">
                        {String(row.__group_count ?? '—')}
                      </td>
                    )}
                    {isCustomPublished && !isGrouped && (
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setRecordModal({ mode: 'edit', row })}
                            className="text-slate-400 hover:text-brand-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Delete this record?')) {
                                deleteRecordMutation.mutate(String(row.id));
                              }
                            }}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">
            {rows?.length ? 'No records match your filters.' : 'No data stored yet for this schema.'}
          </p>
        )}
      </Card>

      {recordModal && (
        <CustomRecordModal
          title={recordModal.mode === 'create' ? 'Add record' : 'Edit record'}
          fields={schema.schema_fields}
          initial={recordModal.row}
          onClose={() => setRecordModal(null)}
          onSave={async (record) => {
            await saveRecordMutation.mutateAsync(record);
          }}
        />
      )}
    </>
  );
}
