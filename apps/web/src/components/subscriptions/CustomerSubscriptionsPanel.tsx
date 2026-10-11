import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui';
import {
  channelLabel,
  fetchCustomerSubscriptions,
  formatRelativeTime,
} from '@/lib/subscriptions';

export function CustomerSubscriptionsPanel({ customerId }: { customerId: string }) {
  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ['customer-subscriptions', customerId],
    queryFn: () => fetchCustomerSubscriptions(customerId),
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading subscriptions…</p>;
  }

  if (!subscriptions?.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-900">Information services</h3>
        <p className="text-sm text-slate-500">This profile is not subscribed to any information services.</p>
        <Link to="/subscriptions" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">
          Manage services
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Information services</h3>
        <Link to="/subscriptions" className="text-xs font-medium text-blue-600 hover:underline">
          All services
        </Link>
      </div>
      <div className="space-y-3">
        {subscriptions.map((sub) => {
          const service = sub.information_services;
          const variant =
            sub.status === 'active' ? 'success' :
            sub.status === 'pending' ? 'warning' :
            sub.status === 'expired' ? 'error' : 'default';

          return (
            <div key={sub.id} className="flex items-start justify-between rounded-lg border border-slate-100 p-3">
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  {service ? (
                    <Link
                      to={`/subscriptions/${service.id}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {service.name}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-slate-900">Unknown service</p>
                  )}
                  <p className="text-xs text-slate-500">
                    {service ? channelLabel(service.channel) : ''}
                    {sub.source ? ` · ${sub.source}` : ''}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Subscribed {formatRelativeTime(sub.subscribed_at)}
                    {sub.expires_at && ` · Expires ${new Date(sub.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <Badge variant={variant}>{sub.status}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
