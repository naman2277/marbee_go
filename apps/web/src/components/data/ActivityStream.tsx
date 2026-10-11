import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Radio, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';
import { connectorMeta } from '@/lib/connector-meta';
import type { OverviewRun } from '@/lib/ingestion-overview';
import { StatusPill } from './StatusPill';

const MAX_ROWS = 100;

/**
 * Live activity feed — reads like a log, not a marketing feed. Each row links
 * to the connector that produced the run. Subscribes to `connector_runs`
 * changes over Supabase Realtime and shows a connection indicator; falls back
 * to the parent's polling when the socket drops.
 */
export function ActivityStream({
  runs,
  onLiveEvent,
}: {
  runs: OverviewRun[];
  onLiveEvent: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onLiveEvent);
  cbRef.current = onLiveEvent;

  useEffect(() => {
    const channel = supabase
      .channel('ingestion-overview-activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connector_runs' }, () => cbRef.current())
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const rows = runs.slice(0, MAX_ROWS);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900">Live activity</h3>
          <span className="text-xs text-slate-400">
            {runs.length > MAX_ROWS ? `latest ${MAX_ROWS} of ${formatNumber(runs.length)}` : `${runs.length} run${runs.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <Radio className="h-3.5 w-3.5" />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <RefreshCw className="h-3.5 w-3.5 animate-spin [animation-duration:2s]" />
            Reconnecting
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No ingestion runs in this window yet. Activity appears here the moment a connector syncs.
        </p>
      ) : (
        <ul className="max-h-[480px] divide-y divide-slate-50 overflow-y-auto">
          {rows.map((r) => {
            const meta = connectorMeta(r.connector?.connector_type ?? '');
            const channel = meta?.label ?? r.connector?.connector_type ?? 'Connector';
            const processed = Math.max(0, r.records_processed ?? 0);
            const failed = Math.max(0, r.records_failed ?? 0);
            return (
              <li key={r.id} className="group hover:bg-slate-50/70">
                <Link
                  to={r.connector?.id ? `/data/connectors/${r.connector.id}/monitor` : '/data/connectors'}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm"
                >
                  <span className="w-28 shrink-0 truncate font-mono text-[11px] uppercase tracking-wide text-slate-400">
                    {channel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    <span className="font-medium text-slate-900">{r.connector?.name ?? 'Unknown connector'}</span>
                  </span>
                  <span className="w-40 shrink-0 text-right font-mono text-xs tabular-nums text-slate-500">
                    {formatNumber(processed)} rec
                    {failed > 0 && <span className="text-red-600"> · {formatNumber(failed)} failed</span>}
                  </span>
                  <span className="w-32 shrink-0 text-right">
                    <StatusPill status={r.status} />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">{relTime(r.started_at)}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-slate-500" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
