import { useQuery } from '@tanstack/react-query';
import { PageHeader, Card, Badge } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTenantScope } from '@/contexts/AuthContext';
import { getCustomerDisplayName } from '@/lib/customers';
import type { Customer } from '@marbee/shared';

export function EventsPage() {
  const { tenantId, environment } = useTenantScope();

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', tenantId, environment],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, customers(title, first_name, middle_name, last_name, email, mobile)')
        .eq('tenant_id', tenantId)
        .eq('environment', environment)
        .order('timestamp', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        title="Events"
        description="Behavioral event stream — cart, bookings, page views and more"
      />

      <Card>
        {isLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading events...</p>
        ) : events?.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-6 py-3 font-medium">Timestamp</th>
                <th className="px-6 py-3 font-medium">Event Type</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Source</th>
                <th className="px-6 py-3 font-medium">Properties</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const customer = e.customers as Pick<
                  Customer,
                  'title' | 'first_name' | 'middle_name' | 'last_name' | 'email' | 'mobile'
                > | null;
                const customerLabel = customer ? getCustomerDisplayName(customer) : null;
                return (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <Badge>{e.event_type}</Badge>
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {customerLabel && customerLabel !== 'Unknown customer'
                        ? customerLabel
                        : customer?.email ?? e.anonymous_id ?? e.ecid ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{e.source ?? '—'}</td>
                    <td className="max-w-xs truncate px-6 py-3 font-mono text-xs text-slate-500">
                      {JSON.stringify(e.properties)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">
            No events yet. Events appear when the SDK or API sends them.
          </p>
        )}
      </Card>
    </div>
  );
}
