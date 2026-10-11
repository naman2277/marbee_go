import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Square,
  TrendingUp,
} from 'lucide-react';
import { JourneyChannelIcons } from '@/components/journeys/JourneyChannelIcons';
import { JourneyStatusBadge } from '@/components/journeys/JourneyStatusBadge';
import { resolveCampaignLifecycle } from '@/lib/campaign-lifecycle';
import {
  enrichChannelsWithStatus,
  extractJourneyChannels,
} from '@/lib/journey-channels';
import {
  resolveJourneyDisplayStatus,
  type JourneyDisplayStatus,
} from '@/lib/journeys';
import { useCampaignEditorBridge } from './CampaignEditorBridge';

type Props = {
  campaignName: string;
  campaignId: string;
  versionNumber: number;
  journeyStatus: string;
  startsAt?: string | null;
  endsAt?: string | null;
  canvasJson?: unknown;
  onRename?: () => void;
  onOpenDashboard?: () => void;
};

function formatScheduleRange(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt && !endsAt) return null;
  const fmt = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `Starts ${fmt(startsAt)}`;
  return `Ends ${fmt(endsAt!)}`;
}

export function CampaignHeader({
  campaignName,
  versionNumber,
  journeyStatus,
  startsAt,
  endsAt,
  canvasJson,
  onRename,
  onOpenDashboard,
}: Props) {
  const bridge = useCampaignEditorBridge();
  const wf = bridge.workflow;

  const scheduleStatus = resolveJourneyDisplayStatus({
    status: journeyStatus,
    starts_at: startsAt,
    ends_at: endsAt,
    settings: { journey_type: 'campaign' },
  });
  const usesScheduleBadge = ['finished', 'started', 'scheduled'].includes(scheduleStatus);

  const lifecycle = scheduleStatus === 'finished'
    ? 'finished'
    : wf
      ? resolveCampaignLifecycle({
          executionPhase: wf.executionPhase,
          runStatus: wf.runState?.status,
          hasErrors: wf.errorNodeIds.size > 0 && wf.executionPhase === 'idle',
        })
      : 'editing';

  const scheduleLabel = formatScheduleRange(startsAt, endsAt);
  const channels = enrichChannelsWithStatus(
    extractJourneyChannels(canvasJson),
    {
      status: journeyStatus,
      starts_at: startsAt,
      ends_at: endsAt,
      settings: { journey_type: 'campaign' },
    },
  );

  const isActive = wf?.isWorkflowActive ?? false;
  const canStart = wf
    ? !isActive && wf.enabled && Boolean(wf.runState) && scheduleStatus !== 'finished'
    : false;

  const headerStatus: JourneyDisplayStatus = usesScheduleBadge
    ? scheduleStatus
    : lifecycle === 'finished'
      ? 'finished'
      : lifecycle === 'running'
        ? 'started'
        : 'draft';

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <Link
        to="/journeys"
        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        title="Back to journeys"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-base font-semibold text-slate-900">{campaignName}</h1>
          {onRename && (
            <button
              type="button"
              title="Rename campaign"
              onClick={onRename}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <JourneyStatusBadge status={headerStatus} />
          <span className="text-xs text-slate-400">v{versionNumber}</span>
          {scheduleLabel && (
            <span className="hidden text-xs text-slate-400 sm:inline">{scheduleLabel}</span>
          )}
          {channels.length > 0 && (
            <JourneyChannelIcons channels={channels} size="sm" />
          )}
          {onOpenDashboard && (
            <div className="ml-1 flex items-center gap-1 border-l border-slate-200 pl-2">
              <button
                type="button"
                title="Reports"
                onClick={onOpenDashboard}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
              >
                <BarChart3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Performance"
                onClick={onOpenDashboard}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600"
              >
                <TrendingUp className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {wf && (wf.populationTotal > 0 || wf.deployedDeliveries.length > 0) && (
          <p className="mt-0.5 text-xs text-slate-500">
            {wf.populationTotal > 0 && (
              <span>{wf.populationTotal.toLocaleString()} in population</span>
            )}
            {wf.populationTotal > 0 && wf.deployedDeliveries.length > 0 && ' · '}
            {wf.deployedDeliveries.length > 0 && (
              <span>{wf.deployedDeliveries.length} deliver{wf.deployedDeliveries.length === 1 ? 'y' : 'ies'}</span>
            )}
          </p>
        )}
      </div>

      {wf && (
        <div className="flex shrink-0 items-center gap-2">
          {wf.executionPhase === 'paused' ? (
            <button
              type="button"
              onClick={() => void wf.startWorkflow()}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
          ) : wf.isLoopActive && wf.executionPhase === 'running' ? (
            <>
              <button
                type="button"
                onClick={wf.pauseWorkflow}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
              <button
                type="button"
                onClick={wf.stopWorkflow}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!canStart || wf.runLoading}
              onClick={() => void wf.startWorkflow()}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {wf.runLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : lifecycle === 'finished' ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {lifecycle === 'finished' ? 'Restart' : 'Start'}
            </button>
          )}

          <button
            type="button"
            disabled={wf.resetMutation.isPending || isActive}
            onClick={() => wf.resetMutation.mutate()}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
            title="Reset workflow"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      )}
    </header>
  );
}
