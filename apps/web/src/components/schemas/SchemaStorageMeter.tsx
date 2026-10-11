import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HardDrive } from 'lucide-react';
import {
  formatBytes,
  formatRecordCount,
  TENANT_STORAGE_QUOTA_BYTES,
  type SchemaTableStats,
} from '@/lib/schema-stats';

type Props = {
  stats?: SchemaTableStats | null;
  fieldCount?: number;
  quotaBytes?: number;
};

function usagePercent(used: number, quota: number) {
  if (quota <= 0) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

function usageColor(pct: number) {
  if (pct >= 90) return 'text-rose-600';
  if (pct >= 70) return 'text-amber-600';
  return 'text-indigo-600';
}

function ringColor(pct: number) {
  if (pct >= 90) return '#e11d48';
  if (pct >= 70) return '#d97706';
  return '#6366f1';
}

export function SchemaStorageMeter({ stats, fieldCount = 0, quotaBytes = TENANT_STORAGE_QUOTA_BYTES }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);

  const dataBytes =
    stats && stats.size_bytes > 0 ? stats.size_bytes - stats.index_bytes : (stats?.size_bytes ?? 0);
  const used = stats?.size_bytes || 0;
  const pct = usagePercent(used, quotaBytes);
  const tableBytes = Math.max(0, dataBytes);
  const ringCircumference = 2 * Math.PI * 15.5;
  const ringDash = (pct / 100) * ringCircumference;

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      left: Math.min(rect.left, window.innerWidth - 280),
    });
  }, [open]);

  if (!stats?.table_name) {
    return <span className="text-slate-300">—</span>;
  }

  const tooltip = open ? (
    <div
      className="fixed z-[100] w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Storage details</p>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Table data</span>
          <span className="font-medium text-slate-800">{formatBytes(tableBytes)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Indexes</span>
          <span className="font-medium text-slate-800">{formatBytes(stats.index_bytes)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Total on disk</span>
          <span className="font-medium text-slate-800">{formatBytes(used)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Records</span>
          <span className="font-medium text-slate-800">{stats.record_count.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Fields defined</span>
          <span className="font-medium text-slate-800">{fieldCount}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-100 pt-2">
          <span className="text-slate-500">Tenant quota</span>
          <span className="font-medium text-slate-800">{formatBytes(quotaBytes)}</span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: ringColor(pct) }}
        />
      </div>
      <p className="mt-1 text-center text-[10px] text-slate-400">{pct}% of tenant allocation</p>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="group flex items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-slate-50"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={ringColor(pct)}
              strokeWidth="3"
              strokeDasharray={`${ringDash} ${ringCircumference}`}
              strokeLinecap="round"
            />
          </svg>
          <HardDrive className={`absolute h-3.5 w-3.5 ${usageColor(pct)}`} />
        </span>
        <span className="min-w-0">
          <span className={`block text-xs font-semibold tabular-nums ${usageColor(pct)}`}>
            {formatRecordCount(stats.record_count)} / {formatBytes(used)}
          </span>
          <span className="block text-[10px] text-slate-400">of {formatBytes(quotaBytes)}</span>
        </span>
      </button>
      {typeof document !== 'undefined' && tooltip ? createPortal(tooltip, document.body) : null}
    </>
  );
}
