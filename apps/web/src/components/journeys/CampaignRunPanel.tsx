import { RefreshCw, Rocket, Zap } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import type { CampaignRunStats, RunResult } from '@/lib/journey-runner';

type Props = {
  stats?: CampaignRunStats;
  lastResult?: RunResult | null;
  loading?: boolean;
  onLaunch: () => void;
  onTest: () => void;
  onTick: () => void;
  onPublish: () => void;
  publishPending?: boolean;
  isPublished?: boolean;
};

export function CampaignRunPanel({
  stats,
  lastResult,
  loading,
  onLaunch,
  onTest,
  onTick,
  onPublish,
  publishPending,
  isPublished,
}: Props) {
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <Stat label="Enrolled" value={stats?.total ?? 0} />
          <Stat label="Active" value={stats?.active ?? 0} color="text-blue-600" />
          <Stat label="Waiting" value={stats?.waiting ?? 0} color="text-purple-600" />
          <Stat label="Completed" value={(stats?.completed ?? 0) + (stats?.exited ?? 0)} color="text-emerald-600" />
        </div>
        <div className="flex flex-wrap gap-2">
          {!isPublished && (
            <Button size="sm" variant="secondary" disabled={publishPending} onClick={onPublish}>
              Publish
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={loading} onClick={onTest}>
            <Zap className="mr-1 h-3.5 w-3.5" />
            Test (5 profiles)
          </Button>
          <Button size="sm" variant="secondary" disabled={loading} onClick={onTick}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Process tick
          </Button>
          <Button size="sm" disabled={loading} onClick={onLaunch}>
            <Rocket className="mr-1 h-3.5 w-3.5" />
            Start journey
          </Button>
        </div>
      </div>
      {lastResult && (
        <p className="mt-3 text-xs text-slate-500">
          Last run: enrolled {lastResult.enrolled}, advanced {lastResult.advanced} steps, completed {lastResult.completed}
          {lastResult.errors.length > 0 && (
            <span className="text-amber-600"> · {lastResult.errors.length} error(s)</span>
          )}
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value, color = 'text-slate-900' }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
