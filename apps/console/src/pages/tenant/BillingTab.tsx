import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { api, type BillSummary } from '@/lib/api';
import { Button, Card, ErrorBox, Field, Input, Loading, Notice, useLoad } from '@/components/ui';
import { currentMonth, inr } from '@/lib/format';
import { UsageTables } from './UsageTab';

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(bill: BillSummary) {
  const rows: unknown[][] = [
    ['Tenant', bill.tenant.name],
    ['Legal name', bill.account?.legal_name ?? ''],
    ['GSTIN', bill.account?.gstin ?? ''],
    ['Billing email', bill.account?.billing_email ?? ''],
    ['Month', bill.month],
    [],
    ['Line', 'Amount (INR, before GST)'],
    ...bill.lines.map((l) => [l.label, l.amount_inr]),
    ['Subtotal', bill.subtotal_inr],
    [],
    ['Usage — channel', 'status', 'count'],
    ...bill.usage.deliveries.map((d) => [d.channel, d.status, d.count]),
    [],
    ['Credits used — service', 'quantity', 'credits'],
    ...bill.usage.credit_debits.map((d) => [d.service, d.quantity ?? 0, d.credits]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `marbee-bill-${bill.tenant.slug}-${bill.month}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function BillingTab({ tenantId }: { tenantId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const { data, error, loading, reload } = useLoad(() => api.bill(tenantId, month), [tenantId, month]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="w-48">
          <Field label="Month"><Input type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
        </div>
        {data && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => downloadCsv(data)}><Download className="h-4 w-4" aria-hidden /> CSV</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print</Button>
          </div>
        )}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <>
          <Card title={`Bill summary — ${data.month}`}>
            <div className="mb-4 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
              <div><span className="text-slate-500">Bill to:</span> {data.account?.legal_name || data.tenant.name}</div>
              <div><span className="text-slate-500">GSTIN:</span> {data.account?.gstin || '—'}</div>
              <div><span className="text-slate-500">Email:</span> {data.account?.billing_email || '—'}</div>
              <div><span className="text-slate-500">Plan:</span> <span className="capitalize">{data.tenant.plan}</span></div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.lines.map((l) => (
                  <tr key={l.label}>
                    <td className="py-2 text-slate-700">{l.label}</td>
                    <td className="py-2 text-right tabular-nums">{inr(l.amount_inr)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold text-slate-900">Subtotal (before GST)</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{inr(data.subtotal_inr)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 print:hidden">
              <Notice>{data.gst_note} Create the invoice there from this summary, then record the payment as a top-up grant with the payment ID as the reason.</Notice>
            </div>
          </Card>
          <UsageTables usage={data.usage} />
        </>
      )}
    </div>
  );
}
