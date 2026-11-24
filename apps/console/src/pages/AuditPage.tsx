import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/Layout';
import { Empty, ErrorBox, Input, Loading, Table, td, useLoad } from '@/components/ui';
import { date } from '@/lib/format';

export function AuditPage() {
  const { data, error, loading, reload } = useLoad(() => api.audit(), []);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.entries ?? []).filter((e) =>
      !term || [e.action, e.actor_email, e.tenant_id, e.target].some((v) => v?.toLowerCase().includes(term)));
  }, [data, q]);

  return (
    <>
      <PageHeader title="Audit log" description="Every console action. Append-only — entries can't be edited or deleted." />
      <div className="mb-4 max-w-sm">
        <Input placeholder="Filter by action, admin or tenant ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter audit log" />
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && rows.length === 0 && <Empty title="No audit entries" />}
      {data && rows.length > 0 && (
        <Table head={['When', 'Admin', 'Action', 'Tenant', 'Target', 'Details', 'IP']}>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className={td}>{date(e.created_at, true)}</td>
              <td className={td}>{e.actor_email}</td>
              <td className={`${td} font-mono text-xs`}>{e.action}</td>
              <td className={`${td} font-mono text-xs`}>{e.tenant_id?.slice(0, 8) ?? '—'}</td>
              <td className={td}>{e.target ?? '—'}</td>
              <td className={`${td} max-w-md truncate font-mono text-xs`} title={JSON.stringify(e.details)}>{JSON.stringify(e.details)}</td>
              <td className={td}>{e.ip ?? '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
