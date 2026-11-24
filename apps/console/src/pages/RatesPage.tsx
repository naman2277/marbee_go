import { useState } from 'react';
import { api, type Rate } from '@/lib/api';
import { useAdmin } from '@/auth/AuthGate';
import { PageHeader } from '@/components/Layout';
import { Button, Empty, ErrorBox, Input, Loading, Notice, Table, td, useLoad } from '@/components/ui';
import { credits, date, n } from '@/lib/format';

export function RatesPage() {
  const { admin } = useAdmin();
  const { data, error, loading, reload } = useLoad(() => api.rates(), []);

  return (
    <>
      <PageHeader title="Rate card" description="Credits charged per unit of usage. 1 credit = ₹1, before GST." />
      <div className="mb-4">
        <Notice tone="warning">Seeded values are placeholders. Set final prices before the first customer sends (D-015).</Notice>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.rates.length === 0 && <Empty title="No rates configured" />}
      {data && data.rates.length > 0 && (
        <Table head={['Service', 'Unit', 'Credits per unit', 'Description', 'Updated', '']}>
          {data.rates.map((r) => <RateRow key={r.service} rate={r} canEdit={admin.role === 'owner'} onSaved={reload} />)}
        </Table>
      )}
    </>
  );
}

function RateRow({ rate, canEdit, onSaved }: { rate: Rate; canEdit: boolean; onSaved: () => void }) {
  const [value, setValue] = useState(String(rate.credits_per_unit));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = Number(value) !== Number(rate.credits_per_unit);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.setRate(rate.service, Number(value));
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td className={`${td} font-medium`}>{rate.service}</td>
      <td className={td}>{rate.unit_size > 1 ? `per ${n(rate.unit_size)} ${rate.unit}s` : `per ${rate.unit}`}</td>
      <td className={td}>
        {canEdit ? (
          <Input type="number" min={0} step="0.0001" value={value} onChange={(e) => setValue(e.target.value)} className="w-28" aria-label={`Credits for ${rate.service}`} />
        ) : (
          credits(rate.credits_per_unit)
        )}
      </td>
      <td className={`${td} max-w-sm whitespace-normal text-slate-500`}>{rate.description}{err && <div className="text-red-600">{err}</div>}</td>
      <td className={td}>{date(rate.updated_at)}</td>
      <td className={td}>{canEdit && <Button variant="secondary" className="px-2.5 py-1.5 text-xs" disabled={!dirty} busy={busy} onClick={save}>Save</Button>}</td>
    </tr>
  );
}
