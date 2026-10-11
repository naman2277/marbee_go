import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { CRON_PRESETS } from '@/lib/connector-meta';

type Run = {
  id: string;
  status: string;
  records_processed: number | null;
  records_failed: number | null;
  started_at: string;
  completed_at: string | null;
  error_log?: unknown;
};

type Props = {
  connectorId: string;
  connectorName?: string;
  tenantId?: string;
  environment?: string;
  scheduleCron: string | null;
  runs: Run[];
};

export function ConnectorRunsPanel({
  connectorId,
  connectorName,
  tenantId,
  environment,
  scheduleCron,
  runs,
}: Props) {
  const queryClient = useQueryClient();

  const scheduleMutation = useMutation({
    mutationFn: async (cron: string | null) => {
      const { error } = await supabase
        .from('connectors')
        .update({ schedule_cron: cron || null, updated_at: new Date().toISOString() })
        .eq('id', connectorId);
      if (error) throw error;
    },
    onSuccess: (_data, cron) => {
      queryClient.invalidateQueries({ queryKey: ['connector'] });
      if (tenantId && environment) {
        void logAudit({
          tenantId,
          environment,
          action: 'update',
          resourceType: 'connector',
          resourceId: connectorId,
          resourceName: connectorName,
          summary: cron ? `Schedule: ${cron}` : 'Schedule cleared',
        });
      }
    },
  });

  const totalProcessed = runs.reduce((s, r) => s + (r.records_processed ?? 0), 0);
  const totalFailed = runs.reduce((s, r) => s + (r.records_failed ?? 0), 0);
  const successRate = totalProcessed + totalFailed > 0
    ? Math.round((totalProcessed / (totalProcessed + totalFailed)) * 100)
    : 100;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Schedule</h3>
          <p className="mt-1 text-xs text-slate-500">Automated sync via pg_cron (after Edge Function deploy)</p>
          <select
            value={scheduleCron ?? ''}
            onChange={(e) => scheduleMutation.mutate(e.target.value || null)}
            className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            {CRON_PRESETS.map((p) => (
              <option key={p.label} value={p.value}>{p.label}</option>
            ))}
          </select>
          {scheduleCron && (
            <p className="mt-2 font-mono text-xs text-slate-500">{scheduleCron}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Total synced" value={String(totalProcessed)} />
          <StatBox label="Success rate" value={`${successRate}%`} accent={successRate >= 95 ? 'emerald' : 'amber'} />
          <StatBox label="Failed rows" value={String(totalFailed)} accent={totalFailed > 0 ? 'red' : undefined} />
          <StatBox label="Total runs" value={String(runs.length)} />
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="font-semibold text-slate-900">Sync timeline</h3>
          </div>

          {!runs.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="h-10 w-10 text-slate-300" />
              <p className="mt-4 font-medium text-slate-700">No sync runs yet</p>
              <p className="mt-1 text-sm text-slate-500">Click Run sync to start your first sync</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {runs.map((run, idx) => (
                <RunRow key={run.id} run={run} isLatest={idx === 0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const color = accent === 'emerald' ? 'text-emerald-600' : accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function RunRow({ run, isLatest }: { run: Run; isLatest: boolean }) {
  const StatusIcon =
    run.status === 'completed' ? CheckCircle2 :
    run.status === 'running' ? Loader2 :
    run.status === 'failed' ? XCircle : AlertCircle;

  const iconColor =
    run.status === 'completed' ? 'text-emerald-500' :
    run.status === 'running' ? 'text-blue-500 animate-spin' :
    run.status === 'failed' ? 'text-red-500' : 'text-amber-500';

  const duration = run.completed_at
    ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
    : '—';

  return (
    <div className={`flex items-start gap-4 px-6 py-4 ${isLatest ? 'bg-teal-50/30' : ''}`}>
      <div className="relative flex flex-col items-center">
        <StatusIcon className={`h-5 w-5 ${iconColor}`} />
        <div className="mt-1 h-full w-px bg-slate-200" />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">
            {new Date(run.started_at).toLocaleString()}
          </span>
          {isLatest && <Badge variant="success">Latest</Badge>}
          <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'default'}>
            {run.status}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          <span><strong className="text-slate-700">{run.records_processed ?? 0}</strong> processed</span>
          <span><strong className="text-slate-700">{run.records_failed ?? 0}</strong> failed</span>
          <span>Duration: {duration}</span>
        </div>
      </div>
    </div>
  );
}
