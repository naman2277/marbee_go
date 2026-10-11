import { Link } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  Clock,
  GitBranch,
  GripVertical,
  Megaphone,
  Pencil,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { JourneyChannelIcons } from '@/components/journeys/JourneyChannelIcons';
import { JourneyStatusBadge } from '@/components/journeys/JourneyStatusBadge';
import { journeyChannelsFromRow } from '@/lib/journey-channels';
import { JOURNEY_DRAG_MIME } from '@/lib/journey-folders';
import {
  journeyType,
  resolveJourneyDisplayStatus,
  type JourneyRow,
} from '@/lib/journeys';

type Props = {
  journey: JourneyRow;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRename?: () => void;
  onDelete?: () => void;
};

function formatScheduleRange(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt && !endsAt) return null;
  const fmt = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `Starts ${fmt(startsAt)}`;
  return `Ends ${fmt(endsAt!)}`;
}

export function JourneyCard({
  journey,
  isDragging,
  onDragStart,
  onDragEnd,
  onRename,
  onDelete,
}: Props) {
  const type = journeyType(journey);
  const isCampaignCard = type === 'campaign';
  const displayStatus = resolveJourneyDisplayStatus(journey);
  const channels = journeyChannelsFromRow(journey);
  const scheduleLabel = isCampaignCard
    ? formatScheduleRange(journey.starts_at, journey.ends_at)
    : null;

  const targetPath = isCampaignCard ? `/campaigns/${journey.id}` : `/journeys/${journey.id}`;
  const dashboardHref = `${targetPath}?tab=dashboard`;

  return (
    <div
      draggable
      onDragStart={(e: React.DragEvent) => {
        e.dataTransfer.setData(JOURNEY_DRAG_MIME, journey.id);
        e.dataTransfer.setData('text/plain', journey.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${
        isDragging ? 'opacity-40 ring-2 ring-brand-500' : ''
      }`}
    >
      <div className="p-5 space-y-3.5">
        {/* Top Bar: Drag Grip, Icon, Status, and Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
              title="Drag into folder"
            >
              <GripVertical className="h-4 w-4" />
            </div>

            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold shadow-2xs ${
                isCampaignCard
                  ? 'bg-blue-50 text-blue-600 border border-blue-100'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}
            >
              {isCampaignCard ? <Megaphone className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
            </div>

            <JourneyStatusBadge status={displayStatus} />
          </div>

          {/* Quick Action Icons */}
          <div className="flex items-center gap-1 shrink-0">
            {onRename && (
              <button
                type="button"
                title="Rename"
                onClick={onRename}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                title={`Delete ${isCampaignCard ? 'Campaign' : 'Journey'}`}
                onClick={onDelete}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            <Link
              to={dashboardHref}
              title="Analytics & Performance"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-1">
          <Link to={targetPath} className="block group-hover:text-brand-700 transition">
            <h3 className="text-sm font-bold text-slate-900 truncate leading-snug">
              {journey.name || 'Untitled'}
            </h3>
          </Link>

          {journey.description ? (
            <p className="line-clamp-2 text-xs text-slate-500 leading-relaxed">
              {journey.description}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 italic">No description provided</p>
          )}
        </div>
      </div>

      {/* Card Footer: Schedule & Channels */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3 rounded-b-2xl text-xs text-slate-500">
        <div className="flex items-center gap-1.5 truncate">
          {scheduleLabel ? (
            <>
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate text-[11px] font-medium text-slate-600">{scheduleLabel}</span>
            </>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {isCampaignCard ? 'Direct Broadcast' : 'Lifecycle Flow'}
            </span>
          )}
        </div>

        {channels.length > 0 ? (
          <div className="shrink-0">
            <JourneyChannelIcons channels={channels} size="sm" />
          </div>
        ) : (
          <span className="text-[10px] text-slate-400 font-mono">v1</span>
        )}
      </div>
    </div>
  );
}
