import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CalendarClock, History, Play } from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { cronDescribe } from '@/lib/cron';
import { DataTable, type Column } from '@/components/data/DataTable';
import { StatusPill } from '@/components/data/StatusPill';
import { usePipelineSchedules, useToggleSchedule, useBackfillPipeline, type ScheduleRow } from '@/lib/schedules';

export function SchedulesPage() {
  const { tenantId, environment } = useAuth();
  const { data, isLoading, isError, refetch } = usePipelineSchedules(tenantId, environment);
  const toggle = useToggleSchedule();
  const backfill = useBackfillPipeline();
  const [backfillFor, setBackfillFor] = useState<ScheduleRow | null>(null);

  const columns = useMemo<Column<ScheduleRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Pipeline',
        width: 220,
        render: (r) => (
          <Link to={`/data/jobs/${r.id}`} className="font-medium text-slate-900 hover:text-brand-700">
            {r.name}
          </Link>
        ),
        exportValue: (r) => r.name,
      },
      {
        key: 'cron',
        header: 'Schedule',
        width: 200,
        render: (r) => (
          <span className="text-slate-600">
            {cronDescribe(r.schedule_cron)}
            <span className="ml-1.5 font-mono text-[10px] text-slate-400">{r.schedule_cron}</span>
          </span>
        ),
        exportValue: (r) => r.schedule_cron,
      },
      {
        key: 'next',
        header: 'Next run',
        width: 160,
        render: (r) =>
          r.schedule_enabled ? (
            <span className="text-xs tabular-nums text-slate-600">{r.next_run_at ? when(r.next_run_at) : '—'}</span>
          ) : (
            <span className="text-xs text-slate-400">paused</span>
          ),
        exportValue: (r) => r.next_run_at ?? '',
      },
      {
        key: 'last',
        header: 'Last run',
        width: 150,
        render: (r) => (
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            {r.lastRunStatus && <StatusPill status={r.lastRunStatus} />}
            {r.last_run_at ? when(r.last_run_at) : r.lastRunStatus ? '' : 'never'}
          </span>
        ),
        exportValue: (r) => r.last_run_at ?? '',
      },
      {
        key: 'enabled',
        header: 'Enabled',
        width: 90,
        align: 'center',
        render: (r) => (
          <button
            type="button"
            onClick={() => toggle.mutate({ id: r.id, enabled: !r.schedule_enabled, cron: r.schedule_cron })}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              r.schedule_enabled ? 'bg-brand-600' : 'bg-slate-300',
            )}
            aria-pressed={r.schedule_enabled}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                r.schedule_enabled ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: 130,
        render: (r) => (
          <button
            type="button"
            onClick={() => setBackfillFor(r)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <History className="h-3 w-3" />
            Backfill
          </button>
        ),
      },
    ],
    [toggle],
  );

  return (
    <div>
      <PageHeader
        title="Schedules"
        description="Every pipeline with a cron trigger — next run, last run, and backfill in one place."
        action={
          <Link
            to="/data/runs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Play className="h-4 w-4" />
            Job Center
          </Link>
        }
      />

      {isError ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <button type="button" onClick={() => refetch()} className="underline">
            Retry
          </button>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(r) => r.id}
          totalCount={data?.length ?? 0}
          loading={isLoading}
          emptyState={
            <span className="flex flex-col items-center gap-1">
              <CalendarClock className="h-6 w-6 text-slate-300" />
              No scheduled pipelines. Add a cron expression on a pipeline&apos;s Schedule tab.
            </span>
          }
        />
      )}

      {backfillFor && (
        <BackfillDialog
          row={backfillFor}
          onClose={() => setBackfillFor(null)}
          onRun={(start, end) => {
            if (!tenantId) return;
            backfill.mutate(
              {
                jobId: backfillFor.id,
                tenantId,
                environment,
                currentVersion: backfillFor.current_version,
                start,
                end,
              },
              { onSuccess: () => setBackfillFor(null) },
            );
          }}
          pending={backfill.isPending}
        />
      )}
    </div>
  );
}

function BackfillDialog({
  row,
  onClose,
  onRun,
  pending,
}: {
  row: ScheduleRow;
  onClose: () => void;
  onRun: (start: string, end: string) => void;
  pending: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-slate-900">Backfill “{row.name}”</h3>
        <p className="mt-1 text-sm text-slate-500">
          Queues one run per day in the range (max 90). Runs are marked <code>backfill</code> and picked up by the worker.
        </p>
        <div className="mt-4 flex gap-3">
          <label className="flex-1 text-xs font-medium text-slate-600">
            From
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex-1 text-xs font-medium text-slate-600">
            To
            <input
              type="date"
              value={end}
              min={start}
              max={today}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onRun(start, end)}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Queue backfill
          </button>
        </div>
      </div>
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const rel =
    mins < 1 ? 'now' : mins < 60 ? `${mins}m` : abs < 864e5 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return `${diff >= 0 ? 'in ' : ''}${rel}${diff < 0 ? ' ago' : ''} · ${d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}
