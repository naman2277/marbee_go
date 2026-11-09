import { useMemo, useState } from 'react';
import { api, type Usage } from '@/lib/api';
import { Card, Empty, ErrorBox, Field, Input, Loading, Table, td, useLoad } from '@/components/ui';
import { credits, currentMonth, n } from '@/lib/format';

const CHANNEL_LABEL: Record<string, string> = {
  web_push: 'Web Push', email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS', rcs: 'RCS',
};

export function UsageTab({ tenantId }: { tenantId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const { data, error, loading, reload } = useLoad(() => api.usage(tenantId, month), [tenantId, month]);

  return (
    <div className="space-y-6">
      <div className="w-48">
        <Field label="Month"><Input type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && <UsageTables usage={data} />}
    </div>
  );
}

export function UsageTables({ usage }: { usage: Usage }) {
  const pivot = useMemo(() => {
    const statuses = Array.from(new Set(usage.deliveries.map((d) => d.status))).sort();
    const byChannel = new Map<string, Record<string, number>>();
    for (const d of usage.deliveries) {
      const row = byChannel.get(d.channel) ?? {};
      row[d.status] = Number(d.count);
      byChannel.set(d.channel, row);
    }
    return { statuses, rows: Array.from(byChannel.entries()) };
  }, [usage]);

  return (
    <div className="space-y-6">
      <Card title="Journey & campaign deliveries by channel">
        {pivot.rows.length === 0 ? (
          <Empty title="No deliveries this month" />
        ) : (
          <Table head={['Channel', ...pivot.statuses, 'Total']}>
            {pivot.rows.map(([ch, row]) => (
              <tr key={ch}>
                <td className={`${td} font-medium`}>{CHANNEL_LABEL[ch] ?? ch}</td>
                {pivot.statuses.map((s) => <td key={s} className={`${td} tabular-nums`}>{n(row[s] ?? 0)}</td>)}
                <td className={`${td} tabular-nums font-medium`}>{n(Object.values(row).reduce((a, b) => a + b, 0))}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Real-time messages">
        {usage.realtime.length === 0 ? (
          <Empty title="No real-time messages this month" />
        ) : (
          <Table head={['Channel', 'Sent', 'Delivered', 'Failed', 'Suppressed']}>
            {usage.realtime.map((r) => (
              <tr key={r.channel}>
                <td className={`${td} font-medium`}>{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
                <td className={`${td} tabular-nums`}>{n(r.sent)}</td>
                <td className={`${td} tabular-nums`}>{n(r.delivered)}</td>
                <td className={`${td} tabular-nums`}>{n(r.failed)}</td>
                <td className={`${td} tabular-nums`}>{n(r.suppressed)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Credits used (email, AI)">
        {usage.credit_debits.length === 0 ? (
          <Empty title="No credit usage this month" description="Email and AI senders debit credits once the Wave 1 workers ship." />
        ) : (
          <Table head={['Service', 'Quantity', 'Credits', 'Entries']}>
            {usage.credit_debits.map((r) => (
              <tr key={r.service}>
                <td className={`${td} font-medium`}>{r.service}</td>
                <td className={`${td} tabular-nums`}>{n(r.quantity ?? 0)}</td>
                <td className={`${td} tabular-nums`}>{credits(r.credits)}</td>
                <td className={`${td} tabular-nums`}>{n(r.entries)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
