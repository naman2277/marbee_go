import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Download, RefreshCw, Search } from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatNumber } from '@/lib/utils';
import { DataTable, exportRowsToCsv, type Column } from '@/components/data/DataTable';
import { StatusPill } from '@/components/data/StatusPill';
import {
  DEFAULT_JOB_FILTERS,
  useJobCenter,
  type JobCenterFilters,
  type JobRow,
} from '@/lib/job-center';

const STATUS_TABS: { key: JobCenterFilters['status']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'run', label: 'Running' },
  { key: 'ok', label: 'Completed' },
  { key: 'warn', label: 'Partial' },
  { key: 'fail', label: 'Failed' },
  { key: 'idle', label: 'Queued' },
];

export function JobCenterPage() {
  const { tenantId, environment } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<JobCenterFilters>(() => {
    const source = searchParams.get('source');
    return {
      ...DEFAULT_JOB_FILTERS,
      search: searchParams.get('q') ?? '',
      source: source === 'connector' || source === 'workflow' ? source : 'all',
    };
  });
  const [pages, setPages] = useState(1);

  const { data, isLoading, isError, isFetching, refetch } = useJobCenter(tenantId, environment, filters, pages);
  const rows = data?.rows ?? [];

  const columns = useMemo<Column<JobRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Job',
        width: 260,
        pinnable: true,
        render: (r) => (
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase',
                r.source === 'connector' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600',
              )}
            >
              {r.source === 'connector' ? 'Conn' : 'Flow'}
            </span>
            <span className="truncate font-medium text-slate-900">{r.name}</span>
            {r.versionNumber != null && (
              <span className="shrink-0 font-mono text-[10px] text-slate-400">v{r.versionNumber}</span>
            )}
            {r.triggerSource && r.triggerSource !== 'manual' && (
              <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] uppercase text-slate-500">
                {r.triggerSource}
              </span>
            )}
          </span>
        ),
        exportValue: (r) => r.name,
      },
      { key: 'kind', header: 'Type', width: 110, render: (r) => r.kind, exportValue: (r) => r.kind },
      {
        key: 'records',
        header: 'Records',
        width: 150,
        align: 'right',
        sortable: true,
        render: (r) => (
          <span className="font-mono text-xs">
            {formatNumber(r.recordsProcessed)}
            {r.recordsFailed > 0 && <span className="text-red-600"> · {formatNumber(r.recordsFailed)}✕</span>}
          </span>
        ),
        exportValue: (r) => r.recordsProcessed,
      },
      {
        key: 'status',
        header: 'Status',
        width: 130,
        render: (r) => <StatusPill status={r.status} />,
        exportValue: (r) => r.status,
      },
      {
        key: 'started',
        header: 'Started',
        width: 130,
        sortable: true,
        render: (r) => <span className="text-xs text-slate-500">{relTime(r.startedAt)}</span>,
        exportValue: (r) => r.startedAt,
      },
      {
        key: 'duration',
        header: 'Duration',
        width: 110,
        align: 'right',
        render: (r) => <span className="font-mono text-xs text-slate-500">{fmtDuration(r.durationSec)}</span>,
        exportValue: (r) => r.durationSec ?? '',
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Job Center"
        description="Every import, export, and sync run — tracked, filterable, and resumable from one place."
      />

      {/* status tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setFilters((f) => ({ ...f, status: t.key }));
              setPages(1);
            }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              filters.status === t.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isError ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Couldn&apos;t load jobs.</p>
            <button type="button" onClick={() => refetch()} className="mt-1 text-red-600 underline">
              Retry
            </button>
          </div>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.source}:${r.id}`}
          totalCount={rows.length}
          loading={isLoading || isFetching}
          hasMore={data?.hasMore}
          onLoadMore={() => setPages((p) => p + 1)}
          onRowClick={(r) => navigate(r.refRoute)}
          selectable
          bulkActions={[
            {
              label: 'Export selected',
              icon: <Download className="h-3.5 w-3.5" />,
              onRun: (sel) => exportRowsToCsv('marbee-jobs', columns, sel),
            },
          ]}
          emptyState={
            filters.status === 'all' && !filters.search
              ? 'No ingestion runs yet. They appear here the moment a connector or workflow runs.'
              : 'No jobs match these filters.'
          }
          toolbarLeft={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, search: e.target.value }));
                  setPages(1);
                }}
                placeholder="Search jobs…"
                className="w-56 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          }
          toolbarRight={
            <>
              <select
                value={filters.source}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, source: e.target.value as JobCenterFilters['source'] }));
                  setPages(1);
                }}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600"
              >
                <option value="all">All sources</option>
                <option value="connector">Connectors</option>
                <option value="workflow">Workflows</option>
              </select>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => exportRowsToCsv('marbee-jobs', columns, rows)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </>
          }
        />
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
