import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  User,
  X,
  Zap,
} from 'lucide-react';
import {
  auditActorLabel,
  auditEntrySubtitle,
  auditEntryTitle,
  AUDIT_ACTION_FILTER_OPTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_PAGE_SIZE_DEFAULT,
  AUDIT_PAGE_SIZE_OPTIONS,
  AUDIT_RESOURCE_FILTER_OPTIONS,
  AUDIT_RESOURCE_LABELS,
  AUDIT_RETENTION_DAYS,
  fetchAuditLogsPage,
  formatAuditTime,
  purgeOldAuditLogs,
  type AuditLog,
  type AuditResourceType,
  type AuditSortDir,
  type AuditSortField,
} from '@/lib/audit';

type Props = {
  tenantId: string;
  environment: string;
  resourceType?: AuditResourceType | string;
  resourceId?: string;
  title?: string;
  subtitle?: string;
  pageSize?: number;
  compact?: boolean;
  runPurgeOnMount?: boolean;
};

export function AuditTrailPanel({
  tenantId,
  environment,
  resourceType: scopedResourceType,
  resourceId,
  title = 'Audit trail',
  subtitle,
  pageSize: pageSizeProp,
  compact = false,
  runPurgeOnMount = false,
}: Props) {
  const [pageSize, setPageSize] = useState(pageSizeProp ?? (compact ? 10 : AUDIT_PAGE_SIZE_DEFAULT));
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<AuditSortField>('created_at');
  const [sortDir, setSortDir] = useState<AuditSortDir>('desc');

  const isScoped = Boolean(resourceId && scopedResourceType);
  const effectiveType = isScoped
    ? scopedResourceType
    : moduleFilter || scopedResourceType || undefined;

  const hasActiveFilters = Boolean(actionFilter || search || (!isScoped && moduleFilter));

  const defaultSubtitle = `Who changed what and when · ${AUDIT_RETENTION_DAYS}-day retention`;

  useEffect(() => {
    setPage(1);
  }, [effectiveType, resourceId, actionFilter, search, sortBy, sortDir, pageSize]);

  useEffect(() => {
    if (!runPurgeOnMount) return;
    void purgeOldAuditLogs();
  }, [runPurgeOnMount]);

  const applySearch = () => setSearch(searchInput.trim());

  const clearFilters = () => {
    setModuleFilter('');
    setActionFilter('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'audit-logs-page',
      tenantId,
      environment,
      effectiveType,
      resourceId,
      actionFilter,
      search,
      page,
      pageSize,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      fetchAuditLogsPage({
        tenantId,
        environment,
        resourceType: effectiveType,
        resourceId,
        actionFilter: actionFilter || undefined,
        search: search || undefined,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const grouped = useMemo(() => groupByDate(logs), [logs]);

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header + compact toolbar */}
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Shield className="h-4 w-4 shrink-0 text-violet-600" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
              {!compact && (
                <p className="truncate text-[11px] text-slate-500">{subtitle ?? defaultSubtitle}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-500">
            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">{AUDIT_RETENTION_DAYS}d</span>
            <span>{total.toLocaleString()} entries</span>
            {isFetching && !isLoading && <RefreshCw className="h-3 w-3 animate-spin text-violet-500" />}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {!isScoped && (
            <MiniSelect
              value={moduleFilter}
              onChange={setModuleFilter}
              options={AUDIT_RESOURCE_FILTER_OPTIONS}
              ariaLabel="Module"
            />
          )}
          <MiniSelect
            value={actionFilter}
            onChange={setActionFilter}
            options={AUDIT_ACTION_FILTER_OPTIONS}
            ariaLabel="Action"
          />
          <div className="relative min-w-[120px] flex-1 sm:max-w-[180px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              onBlur={applySearch}
              placeholder="Search…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-xs placeholder:text-slate-400"
            />
          </div>
          <MiniSelect
            value={`${sortBy}:${sortDir}`}
            onChange={(v) => {
              const [f, d] = v.split(':') as [AuditSortField, AuditSortDir];
              setSortBy(f);
              setSortDir(d);
            }}
            options={[
              { value: 'created_at:desc', label: 'Newest' },
              { value: 'created_at:asc', label: 'Oldest' },
              { value: 'action:asc', label: 'Action A–Z' },
              { value: 'resource_type:asc', label: 'Module A–Z' },
            ]}
            ariaLabel="Sort"
          />
          <MiniSelect
            value={String(pageSize)}
            onChange={(v) => setPageSize(Number(v))}
            options={AUDIT_PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n}/pg` }))}
            ariaLabel="Page size"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              title="Clear filters"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className={compact ? 'min-h-[160px] max-h-[360px] overflow-y-auto px-4 py-3' : 'min-h-[200px] max-h-[440px] overflow-y-auto px-4 py-3'}>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
          </div>
        ) : !logs.length ? (
          <p className="py-12 text-center text-sm text-slate-500">
            {hasActiveFilters
              ? 'No entries match your filters.'
              : `No audit entries in the last ${AUDIT_RETENTION_DAYS} days.`}
          </p>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([date, dayLogs]) => (
              <div key={date}>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{date}</p>
                <div className="relative space-y-0">
                  <div className="absolute bottom-2 left-[19px] top-2 w-px bg-slate-200" />
                  {dayLogs.map((log) => (
                    <AuditRow key={log.id} log={log} compact={compact} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination — always visible */}
      <AuditPagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        loading={isLoading}
        onPageChange={setPage}
      />
    </div>
  );
}

function MiniSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 max-w-[100px] rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700 sm:max-w-none sm:px-2"
    >
      {options.map((o) => (
        <option key={o.value || o.label} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function AuditPagination({
  page,
  totalPages,
  total,
  pageSize,
  loading,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(page * pageSize, total);

  const pages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const items: (number | 'ellipsis')[] = [1];
    if (page > 3) items.push('ellipsis');
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
      items.push(p);
    }
    if (page < totalPages - 2) items.push('ellipsis');
    items.push(totalPages);
    return items;
  }, [page, totalPages]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2">
      <p className="text-[11px] text-slate-500">
        {loading ? 'Loading…' : total === 0 ? 'No entries' : (
          <>Page {page}/{totalPages} · {from}–{to} of {total.toLocaleString()}</>
        )}
      </p>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-white disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-0.5 text-[10px] text-slate-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              disabled={loading}
              onClick={() => onPageChange(p)}
              className={`min-w-[1.5rem] rounded-md px-1 py-0.5 text-[11px] font-medium ${
                p === page ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-white'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-white disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AuditRow({ log, compact }: { log: AuditLog; compact?: boolean }) {
  const subtitle = auditEntrySubtitle(log);
  const Icon = actionIcon(log.action);

  return (
    <div className={`relative flex gap-3 pb-4 last:pb-0 ${compact ? 'pb-3' : ''}`}>
      <div className={`relative z-10 flex shrink-0 items-center justify-center rounded-lg border ${actionAccent(log.action)} ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
        <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{auditEntryTitle(log)}</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">
            {AUDIT_RESOURCE_LABELS[log.resource_type] ?? log.resource_type}
          </span>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
            {AUDIT_ACTION_LABELS[log.action] ?? log.action}
          </span>
        </div>

        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {auditActorLabel(log)}
          </span>
          <span>{formatAuditTime(log.created_at)}</span>
          <span>
            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {!compact && log.metadata && Object.keys(log.metadata).filter((k) => !['resource_name', 'summary', 'changes', 'user_email', 'user_name'].includes(k)).length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-violet-600 hover:underline">
              View details
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[10px] text-slate-100">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(log.metadata).filter(
                    ([k]) => !['user_email', 'user_name'].includes(k),
                  ),
                ),
                null,
                2,
              )}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function actionIcon(action: string) {
  switch (action) {
    case 'create': return Plus;
    case 'update': return Pencil;
    case 'delete': return Trash2;
    case 'publish': return FileText;
    case 'refresh': return RefreshCw;
    case 'run':
    case 'sync': return Play;
    case 'archive': return Archive;
    default: return Zap;
  }
}

function actionAccent(action: string): string {
  switch (action) {
    case 'create': return 'border-emerald-200 bg-emerald-50 text-emerald-600';
    case 'update': return 'border-blue-200 bg-blue-50 text-blue-600';
    case 'delete': return 'border-red-200 bg-red-50 text-red-600';
    case 'publish': return 'border-violet-200 bg-violet-50 text-violet-600';
    case 'refresh':
    case 'run':
    case 'sync': return 'border-amber-200 bg-amber-50 text-amber-600';
    default: return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function groupByDate(logs: AuditLog[]): Record<string, AuditLog[]> {
  const groups: Record<string, AuditLog[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const log of logs) {
    const d = new Date(log.created_at);
    let label: string;
    if (isSameDay(d, today)) label = 'Today';
    else if (isSameDay(d, yesterday)) label = 'Yesterday';
    else label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(log);
  }
  return groups;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
