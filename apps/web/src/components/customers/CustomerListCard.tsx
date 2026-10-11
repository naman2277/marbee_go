import { Link } from 'react-router-dom';
import { ChevronRight, Mail, Phone } from 'lucide-react';
import { GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui';
import {
  getCustomerAvatarColor,
  getCustomerDisplayName,
  getCustomerInitials,
  formatRelativeTime,
  type CustomerRow,
} from '@/lib/customers';
import { formatSchemaDate } from '@/lib/schema-stats';

type Props = {
  customer: CustomerRow;
  lastActivity?: string | null;
  eventCount?: number;
  activeJourneyCount?: number;
  journeyNames?: string[];
};

export function CustomerListCard({ customer, lastActivity, eventCount = 0, activeJourneyCount = 0, journeyNames = [] }: Props) {
  const name = getCustomerDisplayName(customer);

  return (
    <Link
      to={`/customers/${customer.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-md ${getCustomerAvatarColor(customer.id)}`}
        >
          {getCustomerInitials(customer)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{name}</h3>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {customer.email ?? customer.mobile ?? 'No contact info'}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-brand-500" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={customer.status === 'active' ? 'success' : 'default'}>{customer.status}</Badge>
            {eventCount > 0 && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                {eventCount} events
              </span>
            )}
            {activeJourneyCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                <GitBranch className="h-3 w-3" />
                {activeJourneyCount} journey{activeJourneyCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {journeyNames.length > 0 && (
            <p className="mt-2 truncate text-[11px] text-brand-700">
              In: {journeyNames.join(', ')}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {customer.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3" /> {customer.email}
              </span>
            )}
            {customer.mobile && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {customer.mobile}
              </span>
            )}
          </div>

          <p className="mt-3 text-[10px] text-slate-400">
            Joined {formatSchemaDate(customer.created_at)}
            {lastActivity && <> · Active {formatRelativeTime(lastActivity)}</>}
          </p>
        </div>
      </div>
    </Link>
  );
}
