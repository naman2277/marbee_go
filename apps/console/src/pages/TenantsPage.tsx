import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/Layout';
import { Badge, Button, Empty, ErrorBox, Input, Loading, Select, Stat, Table, td, useLoad } from '@/components/ui';
import { credits, date, n, REGION_LABEL } from '@/lib/format';

export function TenantsPage() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api.listTenants(), []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.tenants ?? []).filter(
      (t) => (!status || t.status === status) && (!term || t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term)),
    );
  }, [data, q, status]);

  const totals = useMemo(() => {
    const all = data?.tenants ?? [];
    return {
      tenants: all.length,
      active: all.filter((t) => t.status === 'active').length,
      profiles: all.reduce((s, t) => s + Number(t.stats?.profiles_total ?? 0), 0),
      mrr: all.filter((t) => t.status === 'active').reduce((s, t) => s + Number(t.account?.monthly_fee_inr ?? 0), 0),
    };
  }, [data]);

  const refreshAll = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await api.refreshStats();
      await reload();
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every Marbee customer workspace. Counts refresh nightly; refresh now for the latest."
        action={
          <Button variant="secondary" onClick={refreshAll} busy={refreshing}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh stats
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tenants" value={n(totals.tenants)} />
        <Stat label="Active" value={n(totals.active)} />
        <Stat label="End-customer profiles" value={n(totals.profiles)} />
        <Stat label="Platform fees / month" value={`₹${n(totals.mrr)}`} sub="Active tenants, before GST" />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input placeholder="Search name or slug" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search tenants" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
        </Select>
      </div>

      {refreshError && <div className="mb-4"><ErrorBox message={refreshError} /></div>}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && rows.length === 0 && <Empty title="No tenants match" description={q || status ? 'Clear the search or filter.' : 'Tenants appear here once created.'} />}

      {data && rows.length > 0 && (
        <Table head={['Tenant', 'Plan', 'Status', 'Region', 'Users', 'Profiles', 'Credits', 'Deliveries 30d', 'Created']}>
          {rows.map((t) => {
            const bal = Number(t.wallet?.allowance_balance ?? 0) + Number(t.wallet?.topup_balance ?? 0);
            return (
              <tr key={t.id} onClick={() => nav(`/tenants/${t.id}`)} className="cursor-pointer hover:bg-slate-50">
                <td className={td}>
                  <button type="button" className="text-left" onClick={() => nav(`/tenants/${t.id}`)}>
                    <div className="font-medium text-slate-900">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.slug}</div>
                  </button>
                </td>
                <td className={`${td} capitalize`}>{t.plan}</td>
                <td className={td}><Badge tone={t.status}>{t.status}</Badge></td>
                <td className={td}>{REGION_LABEL[t.account?.region ?? 'in']}</td>
                <td className={`${td} tabular-nums`}>{t.stats ? `${n(t.stats.users_active)} / ${n(t.stats.users_total)}` : '—'}</td>
                <td className={`${td} tabular-nums`}>{t.stats ? n(t.stats.profiles_total) : '—'}</td>
                <td className={`${td} tabular-nums ${bal < 0 ? 'text-red-600' : ''}`}>{t.wallet ? credits(bal) : '—'}</td>
                <td className={`${td} tabular-nums`}>{t.stats ? n(t.stats.deliveries_30d) : '—'}</td>
                <td className={td}>{date(t.created_at)}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
