import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Columns3,
  Loader2,
  Pin,
  PinOff,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';

/* ================================================================
   Enterprise data table — built for server-backed datasets that
   may hold millions of rows. It NEVER renders the whole dataset:
   rows are virtualized to a scroll window, sort/filter/search are
   the caller's responsibility (server-side), and the footer states
   the real total against what is on screen.
   ================================================================ */

export type SortDir = 'asc' | 'desc';
export type SortRule = { key: string; dir: SortDir };

export type Column<T> = {
  key: string;
  header: string;
  /** px width; resizable at runtime. */
  width?: number;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  pinnable?: boolean;
  /** Hidden by default (still toggleable in the column menu). */
  defaultHidden?: boolean;
  render: (row: T) => ReactNode;
  /** Plain-text value for exports. Falls back to String(render). */
  exportValue?: (row: T) => string | number;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Server-reported total (exact or estimated). */
  totalCount?: number;
  totalIsEstimate?: boolean;
  loading?: boolean;
  /** More pages available on the server. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Multi-sort state (shift-click headers to add). Server applies it. */
  sort?: SortRule[];
  onSortChange?: (next: SortRule[]) => void;
  onRowClick?: (row: T) => void;
  /** Enables the selection column + bulk bar. */
  selectable?: boolean;
  bulkActions?: { label: string; icon?: ReactNode; onRun: (rows: T[]) => void; tone?: 'default' | 'danger' }[];
  rowHeight?: number;
  /** Controlled column visibility (keys). Uncontrolled if omitted. */
  emptyState?: ReactNode;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  className?: string;
};

const OVERSCAN = 8;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  totalCount,
  totalIsEstimate,
  loading,
  hasMore,
  onLoadMore,
  sort = [],
  onSortChange,
  onRowClick,
  selectable,
  bulkActions = [],
  rowHeight = 44,
  emptyState,
  toolbarLeft,
  toolbarRight,
  className,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const visibleCols = useMemo(() => {
    const shown = columns.filter((c) => !hidden.has(c.key));
    const isPinned = (c: Column<T>) => pinned.has(c.key);
    return [...shown.filter(isPinned), ...shown.filter((c) => !isPinned(c))];
  }, [columns, hidden, pinned]);

  const colWidth = useCallback(
    (c: Column<T>) => widths[c.key] ?? c.width ?? 160,
    [widths],
  );

  /* ---- virtualization ---- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = rows.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const endIndex = Math.min(total, Math.ceil((scrollTop + viewportH) / rowHeight) + OVERSCAN);
  const slice = rows.slice(startIndex, endIndex);
  const padTop = startIndex * rowHeight;
  const padBottom = (total - endIndex) * rowHeight;

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      setScrollTop(el.scrollTop);
      if (hasMore && onLoadMore && el.scrollHeight - el.scrollTop - el.clientHeight < rowHeight * 12) {
        onLoadMore();
      }
    },
    [hasMore, onLoadMore, rowHeight],
  );

  /* ---- sorting ---- */
  const toggleSort = (col: Column<T>, additive: boolean) => {
    if (!col.sortable || !onSortChange) return;
    const existing = sort.find((s) => s.key === col.key);
    let next: SortRule[];
    if (!existing) {
      const rule: SortRule = { key: col.key, dir: 'asc' };
      next = additive ? [...sort, rule] : [rule];
    } else if (existing.dir === 'asc') {
      next = sort.map((s) => (s.key === col.key ? { ...s, dir: 'desc' as const } : s));
      if (!additive) next = next.filter((s) => s.key === col.key);
    } else {
      next = sort.filter((s) => s.key !== col.key);
    }
    onSortChange(next);
  };

  /* ---- resize ---- */
  const startResize = (key: string, startX: number, startW: number) => {
    const onMove = (ev: MouseEvent) => {
      setWidths((w) => ({ ...w, [key]: Math.max(64, startW + (ev.clientX - startX)) }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /* ---- selection ---- */
  const allInViewSelected = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    setSelected(() => (allInViewSelected ? new Set<string>() : new Set(rows.map(rowKey))));
  };
  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(rowKey(r))), [rows, selected, rowKey]);

  const gridTemplate = [
    selectable ? '40px' : null,
    ...visibleCols.map((c) => `${colWidth(c)}px`),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('flex flex-col rounded-xl border border-slate-200 bg-white', className)}>
      {/* toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">{toolbarLeft}</div>
        <div className="flex items-center gap-2">
          {toolbarRight}
          <div className="relative">
            <button
              type="button"
              onClick={() => setColMenuOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </button>
            {colMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setColMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                  {columns.map((c) => (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.key)}
                        onChange={() =>
                          setHidden((h) => {
                            const next = new Set(h);
                            if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                            return next;
                          })
                        }
                      />
                      <span className="flex-1 truncate text-slate-700">{c.header}</span>
                      {c.pinnable && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setPinned((p) => {
                              const next = new Set(p);
                              if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                              return next;
                            });
                          }}
                          className="text-slate-400 hover:text-slate-600"
                          title={pinned.has(c.key) ? 'Unpin' : 'Pin left'}
                        >
                          {pinned.has(c.key) ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* bulk bar */}
      {selectable && selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-800">{formatNumber(selected.size)} selected</span>
          <div className="flex items-center gap-1.5">
            {bulkActions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => a.onRun(selectedRows)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
                  a.tone === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-700">
            Clear
          </button>
        </div>
      )}

      {/* header */}
      <div className="overflow-hidden border-b border-slate-200 bg-slate-50">
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {selectable && (
            <div className="flex items-center justify-center px-2 py-2">
              <input type="checkbox" checked={allInViewSelected} onChange={toggleAll} aria-label="Select all rows in view" />
            </div>
          )}
          {visibleCols.map((c) => {
            const rule = sort.find((s) => s.key === c.key);
            const rank = sort.length > 1 && rule ? sort.findIndex((s) => s.key === c.key) + 1 : null;
            return (
              <div
                key={c.key}
                className={cn(
                  'group relative flex items-center gap-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500',
                  c.align === 'right' && 'justify-end',
                  c.align === 'center' && 'justify-center',
                  c.sortable && 'cursor-pointer select-none hover:text-slate-800',
                )}
                onClick={(e) => toggleSort(c, e.shiftKey)}
              >
                <span className="truncate">{c.header}</span>
                {c.sortable &&
                  (rule ? (
                    rule.dir === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : (
                    <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />
                  ))}
                {rank && <span className="font-mono text-[9px] text-brand-500">{rank}</span>}
                <span
                  role="separator"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    startResize(c.key, e.clientX, colWidth(c));
                  }}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-brand-300"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* body */}
      <div ref={scrollRef} onScroll={handleScroll} className="max-h-[560px] min-h-[200px] overflow-auto">
        {rows.length === 0 && !loading ? (
          <div className="py-16 text-center text-sm text-slate-500">{emptyState ?? 'No rows.'}</div>
        ) : (
          <>
            <div style={{ height: padTop }} />
            <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
              {slice.map((row) => {
                const key = rowKey(row);
                const isSel = selected.has(key);
                return (
                  <div key={key} className="contents">
                    {selectable && (
                      <div
                        className={cn(
                          'flex items-center justify-center border-b border-slate-50',
                          isSel && 'bg-brand-50/60',
                        )}
                        style={{ height: rowHeight }}
                      >
                        <input type="checkbox" checked={isSel} onChange={() => toggleRow(key)} aria-label="Select row" />
                      </div>
                    )}
                    {visibleCols.map((c) => (
                      <div
                        key={c.key}
                        onClick={() => onRowClick?.(row)}
                        className={cn(
                          'flex items-center gap-1 truncate border-b border-slate-50 px-3 text-sm text-slate-700',
                          c.align === 'right' && 'justify-end tabular-nums',
                          c.align === 'center' && 'justify-center',
                          onRowClick && 'cursor-pointer',
                          isSel && 'bg-brand-50/60',
                        )}
                        style={{ height: rowHeight }}
                      >
                        <span className="min-w-0 truncate">{c.render(row)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div style={{ height: padBottom }} />
            {loading && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            )}
          </>
        )}
      </div>

      {/* footer — the server-backed contract */}
      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        <span className="tabular-nums">
          {totalCount !== undefined ? (
            <>
              <span className="font-mono text-slate-700">
                {totalIsEstimate ? '~' : ''}
                {formatNumber(totalCount)}
              </span>{' '}
              records · showing {formatNumber(rows.length)}
            </>
          ) : (
            <>{formatNumber(rows.length)} loaded</>
          )}
        </span>
        {hasMore && (
          <button type="button" onClick={onLoadMore} className="font-medium text-brand-600 hover:text-brand-700">
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

/* ---- CSV export of the currently loaded rows ---- */
export function exportRowsToCsv<T>(filename: string, columns: Column<T>[], rows: T[]) {
  const cols = columns.filter((c) => !c.defaultHidden);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => escape(c.header)).join(',');
  const body = rows
    .map((r) => cols.map((c) => escape(c.exportValue ? c.exportValue(r) : plain(c.render(r)))).join(','))
    .join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function plain(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plain).join(' ');
  if (typeof node === 'object' && 'props' in (node as never)) {
    return plain((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}
