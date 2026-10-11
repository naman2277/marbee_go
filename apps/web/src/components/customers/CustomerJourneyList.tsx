import { Link } from 'react-router-dom';
import { ChevronRight, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { CustomerJourneyInstance } from '@/lib/customers';
import { formatSchemaDate } from '@/lib/schema-stats';
import {
  formatJourneyStatus,
  getJourneyName,
  groupJourneyInstances,
  journeyStatusVariant,
  journeySummaryText,
} from '@/lib/customer-journeys';

type Props = {
  instances: CustomerJourneyInstance[];
  /** compact: single column cards; full: grouped sections with stats */
  variant?: 'compact' | 'full';
  title?: string;
  showViewAllLink?: boolean;
  emptyMessage?: string;
};

export function CustomerJourneyList({
  instances,
  variant = 'compact',
  title = 'Journey enrollment',
  showViewAllLink = true,
  emptyMessage = 'Not enrolled in any journeys yet.',
}: Props) {
  const { active, completed, other } = groupJourneyInstances(instances);
  const hasJourneys = instances.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-brand-600" />
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        {showViewAllLink && hasJourneys && (
          <Link to="/journeys" className="inline-flex items-center text-xs font-medium text-brand-600 hover:underline">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {variant === 'full' && (
        <p className="mb-4 text-xs text-slate-500">{journeySummaryText(instances)}</p>
      )}

      {!hasJourneys ? (
        <p className="py-2 text-sm text-slate-500">{emptyMessage}</p>
      ) : variant === 'full' ? (
        <div className="space-y-5">
          {active.length > 0 && (
            <JourneyGroup label="Active" instances={active} />
          )}
          {completed.length > 0 && (
            <JourneyGroup label="Completed" instances={completed} />
          )}
          {other.length > 0 && (
            <JourneyGroup label="Other" instances={other} />
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {instances.map((j) => (
            <JourneyCard key={j.id} instance={j} />
          ))}
        </div>
      )}
    </div>
  );
}

function JourneyGroup({ label, instances }: { label: string; instances: CustomerJourneyInstance[] }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="space-y-2">
        {instances.map((j) => (
          <JourneyCard key={j.id} instance={j} />
        ))}
      </div>
    </div>
  );
}

function JourneyCard({ instance }: { instance: CustomerJourneyInstance }) {
  const name = getJourneyName(instance);
  const journeyId = instance.journey_id ?? instance.journeys?.id;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition hover:border-brand-200 hover:bg-brand-50/30">
      <div className="flex items-start justify-between gap-2">
        {journeyId ? (
          <Link
            to={`/journeys/${journeyId}`}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {name}
          </Link>
        ) : (
          <p className="text-sm font-medium text-slate-900">{name}</p>
        )}
        <Badge variant={journeyStatusVariant(instance.status)}>
          {formatJourneyStatus(instance.status)}
        </Badge>
      </div>
      <dl className="mt-2 grid gap-1 text-xs text-slate-500">
        <div className="flex justify-between gap-2">
          <dt>Entered</dt>
          <dd className="text-slate-700">{formatSchemaDate(instance.entered_at)}</dd>
        </div>
        {instance.completed_at && (
          <div className="flex justify-between gap-2">
            <dt>Completed</dt>
            <dd className="text-slate-700">{formatSchemaDate(instance.completed_at)}</dd>
          </div>
        )}
        {instance.current_node_id && (
          <div className="flex justify-between gap-2">
            <dt>Current node</dt>
            <dd className="font-mono text-[10px] text-slate-700">{instance.current_node_id}</dd>
          </div>
        )}
        {instance.journeys?.status && (
          <div className="flex justify-between gap-2">
            <dt>Journey definition</dt>
            <dd className="capitalize text-slate-700">{instance.journeys.status}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function CustomerJourneyPills({ instances }: { instances: CustomerJourneyInstance[] }) {
  const { active } = groupJourneyInstances(instances);
  if (!active.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {active.slice(0, 3).map((j) => (
        <span
          key={j.id}
          className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-medium text-brand-800"
        >
          <GitBranch className="h-3 w-3" />
          {getJourneyName(j)}
        </span>
      ))}
      {active.length > 3 && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          +{active.length - 3} more
        </span>
      )}
    </div>
  );
}
