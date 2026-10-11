import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PipelineRunLog } from '@/lib/pipeline-runs';

const LEVELS = ['all', 'info', 'warn', 'error'] as const;
type LevelFilter = (typeof LEVELS)[number];

const LEVEL_STYLE: Record<string, string> = {
  debug: 'text-slate-400',
  info: 'text-slate-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
};

/** Structured run-log viewer with a level filter and click-to-focus-node. */
export function RunLogViewer({
  logs,
  nodeLabels,
  onFocusNode,
  activeNodeId,
}: {
  logs: PipelineRunLog[];
  /** node_id → human label, for the node column */
  nodeLabels?: Map<string, string>;
  onFocusNode?: (nodeId: string) => void;
  activeNodeId?: string | null;
}) {
  const [level, setLevel] = useState<LevelFilter>('all');

  const counts = useMemo(() => {
    const c = { info: 0, warn: 0, error: 0 };
    for (const l of logs) {
      if (l.level === 'warn') c.warn++;
      else if (l.level === 'error') c.error++;
      else c.info++;
    }
    return c;
  }, [logs]);

  const shown = useMemo(() => {
    if (level === 'all') return logs;
    if (level === 'info') return logs.filter((l) => l.level === 'info' || l.level === 'debug');
    return logs.filter((l) => l.level === level);
  }, [logs, level]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-900">
          Logs <span className="ml-1 font-mono text-xs text-slate-400">{logs.length}</span>
        </h3>
        <div className="flex items-center gap-1">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLevel(lv)}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium capitalize',
                level === lv ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100',
              )}
            >
              {lv}
              {lv === 'warn' && counts.warn > 0 && <span className="ml-1 text-amber-500">{counts.warn}</span>}
              {lv === 'error' && counts.error > 0 && <span className="ml-1 text-red-500">{counts.error}</span>}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          {logs.length === 0 ? 'No logs yet — the run has not produced output.' : `No ${level} lines.`}
        </p>
      ) : (
        <ul className="max-h-[360px] divide-y divide-slate-50 overflow-y-auto font-mono text-xs">
          {shown.map((l) => (
            <li
              key={l.id}
              className={cn(
                'flex items-baseline gap-3 px-4 py-1.5',
                l.node_id && activeNodeId === l.node_id && 'bg-brand-50',
              )}
            >
              <span className="shrink-0 tabular-nums text-slate-400">{timeOf(l.logged_at)}</span>
              <span className={cn('w-10 shrink-0 uppercase', LEVEL_STYLE[l.level] ?? 'text-slate-500')}>{l.level}</span>
              {l.node_id ? (
                <button
                  type="button"
                  onClick={() => onFocusNode?.(l.node_id as string)}
                  className="shrink-0 text-brand-600 hover:underline"
                  title="Focus this node"
                >
                  {nodeLabels?.get(l.node_id) ?? l.node_id}
                </button>
              ) : (
                <span className="w-0 shrink-0" />
              )}
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-700">{l.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleTimeString(undefined, { hour12: false });
}
