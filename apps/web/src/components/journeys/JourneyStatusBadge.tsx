import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import {
  JOURNEY_DISPLAY_STATUS_LABELS,
  type JourneyDisplayStatus,
} from '@/lib/journeys';

const STATUS_CONFIG: Record<
  JourneyDisplayStatus,
  { icon: typeof PlayCircle; className: string }
> = {
  started: {
    icon: PlayCircle,
    className: 'bg-emerald-100 text-emerald-700',
  },
  finished: {
    icon: CheckCircle2,
    className: 'bg-indigo-100 text-indigo-700',
  },
  scheduled: {
    icon: CalendarClock,
    className: 'bg-sky-100 text-sky-700',
  },
  draft: {
    icon: CircleDashed,
    className: 'bg-amber-100 text-amber-700',
  },
  published: {
    icon: PlayCircle,
    className: 'bg-emerald-100 text-emerald-700',
  },
  paused: {
    icon: PauseCircle,
    className: 'bg-orange-100 text-orange-700',
  },
  archived: {
    icon: CircleDashed,
    className: 'bg-slate-100 text-slate-600',
  },
};

type Props = {
  status: JourneyDisplayStatus;
  compact?: boolean;
};

export function JourneyStatusBadge({ status, compact = false }: Props) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const label = JOURNEY_DISPLAY_STATUS_LABELS[status];

  if (compact) {
    return (
      <span
        title={label}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${config.className}`}
      >
        <Icon className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}
