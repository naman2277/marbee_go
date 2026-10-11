import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlugZap,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import {
  fetchTestLogs,
  testConnector,
  type ConnectionTestResult,
  type ConnectorTestLog,
} from '@/lib/connector-test';
import type { ConnectorMappingRow } from '@/lib/connector-mapping';

type Props = {
  tenantId: string;
  environment: string;
  connectorId: string;
  connectorType: string;
  direction: string;
  config: Record<string, unknown>;
  mapping: ConnectorMappingRow[];
};

export function ConnectorTestPanel({
  tenantId,
  environment,
  connectorId,
  connectorType,
  direction,
  config,
  mapping,
}: Props) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  const { data: logs } = useQuery({
    queryKey: ['connector-test-logs', connectorId],
    queryFn: () => fetchTestLogs({ connectorId, limit: 8 }),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      testConnector({
        tenantId,
        environment,
        connectorId,
        connectorType,
        direction,
        config,
        mapping,
      }),
    onSuccess: (r) => {
      setResult(r);
      queryClient.invalidateQueries({ queryKey: ['connector-test-logs'] });
      queryClient.invalidateQueries({ queryKey: ['connector'] });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <PlugZap className="h-5 w-5 text-teal-600" />
                Test connection
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Verify credentials, URL reachability, and mapping configuration
              </p>
            </div>
            <Button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className="shrink-0 bg-teal-600 hover:bg-teal-500"
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Testing…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Run test
                </>
              )}
            </Button>
          </div>

          {result && <TestResultCard result={result} />}

          {!result && !testMutation.isPending && (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
              <PlugZap className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-600">Run a test to validate this connector</p>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h4 className="text-sm font-semibold text-slate-900">Test history</h4>
          </div>
          {!logs?.length ? (
            <p className="p-5 text-sm text-slate-500">No tests yet</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {logs.map((log) => (
                <TestLogRow key={log.id} log={log} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function TestResultCard({ result }: { result: ConnectionTestResult }) {
  const StatusIcon =
    result.status === 'success' ? CheckCircle2 :
    result.status === 'warning' ? AlertTriangle : XCircle;
  const statusColor =
    result.status === 'success' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    result.status === 'warning' ? 'text-amber-600 bg-amber-50 border-amber-200' :
    'text-red-600 bg-red-50 border-red-200';

  return (
    <div className={`mt-6 rounded-xl border p-5 ${statusColor}`}>
      <div className="flex items-center gap-3">
        <StatusIcon className="h-6 w-6 shrink-0" />
        <div>
          <p className="font-semibold capitalize">{result.status}</p>
          <p className="text-sm opacity-90">{result.message}</p>
        </div>
        <span className="ml-auto font-mono text-xs opacity-70">{result.latencyMs}ms</span>
      </div>

      <ul className="mt-4 space-y-2">
        {result.checks.map((check, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg bg-white/60 px-3 py-2 text-sm">
            {check.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-red-500" />
            )}
            <span className="font-medium text-slate-800">{check.label}</span>
            {check.detail && <span className="ml-auto truncate text-xs text-slate-500">{check.detail}</span>}
          </li>
        ))}
      </ul>

      {result.source && (
        <p className="mt-3 text-[10px] uppercase tracking-wider opacity-60">
          via {result.source === 'edge' ? 'live HTTP probe' : 'local validation'}
        </p>
      )}
    </div>
  );
}

function TestLogRow({ log }: { log: ConnectorTestLog }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3 text-sm">
      {log.status === 'success' ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-slate-700">{log.message}</p>
        <p className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</p>
      </div>
      {log.latency_ms != null && (
        <span className="font-mono text-xs text-slate-400">{log.latency_ms}ms</span>
      )}
    </li>
  );
}
