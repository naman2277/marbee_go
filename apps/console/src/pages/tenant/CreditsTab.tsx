import { useState, type FormEvent } from 'react';
import { api, type LedgerEntry, type Tenant, type Wallet } from '@/lib/api';
import { useAdmin } from '@/auth/AuthGate';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Notice, Select, Stat, Table, td, useLoad } from '@/components/ui';
import { credits, date, newKey } from '@/lib/format';

const LARGE = 10_000;

const ENTRY_LABEL: Record<LedgerEntry['entry_type'], string> = {
  grant: 'Grant', adjustment: 'Correction', allowance_reset: 'Monthly reset', debit: 'Usage', expiry: 'Expiry',
};

export function CreditsTab({ tenant, wallet, onChanged }: { tenant: Tenant; wallet: Wallet | null; onChanged: () => void }) {
  const ledger = useLoad(() => api.ledger(tenant.id), [tenant.id]);
  const refreshAll = () => {
    onChanged();
    void ledger.reload();
  };
  const total = Number(wallet?.allowance_balance ?? 0) + Number(wallet?.topup_balance ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available" value={credits(total)} sub="1 credit = ₹1" />
        <Stat label="Monthly allowance left" value={credits(wallet?.allowance_balance)} sub={`of ${credits(wallet?.monthly_allowance)} / month`} />
        <Stat label="Top-up balance" value={credits(wallet?.topup_balance)} sub="valid 12 months" />
        <Stat label="Overdraft limit" value={credits(wallet?.overdraft_limit)} sub="transactional sends only" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GrantForm tenant={tenant} onDone={refreshAll} />
        <PlanForm tenantId={tenant.id} wallet={wallet} onDone={refreshAll} />
      </div>

      <Card title="Ledger">
        {ledger.loading && !ledger.data && <Loading />}
        {ledger.error && <ErrorBox message={ledger.error} onRetry={ledger.reload} />}
        {ledger.data && ledger.data.entries.length === 0 && <Empty title="No credit movements yet" />}
        {ledger.data && ledger.data.entries.length > 0 && (
          <Table head={['When', 'Type', 'Bucket', 'Amount', 'Allowance after', 'Top-up after', 'Detail']}>
            {ledger.data.entries.map((e) => (
              <tr key={e.id}>
                <td className={td}>{date(e.created_at, true)}</td>
                <td className={td}><Badge tone={e.entry_type === 'debit' ? undefined : 'active'}>{ENTRY_LABEL[e.entry_type]}</Badge></td>
                <td className={`${td} capitalize`}>{e.bucket}</td>
                <td className={`${td} tabular-nums ${Number(e.amount) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {Number(e.amount) > 0 ? '+' : ''}{credits(e.amount)}
                </td>
                <td className={`${td} tabular-nums`}>{credits(e.allowance_after)}</td>
                <td className={`${td} tabular-nums`}>{credits(e.topup_after)}</td>
                <td className={`${td} max-w-xs truncate`} title={e.reason ?? e.service ?? ''}>
                  {e.reason ?? (e.service ? `${e.service}${e.transactional ? ' · transactional' : ''}` : '—')}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function GrantForm({ tenant, onDone }: { tenant: Tenant; onDone: () => void }) {
  const { admin } = useAdmin();
  const [amount, setAmount] = useState('');
  const [bucket, setBucket] = useState<'topup' | 'allowance'>('topup');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  // One key per intended grant: a double-click or retry can't grant twice.
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const value = Number(amount);
  const valid = Number.isFinite(value) && value !== 0;
  const large = Math.abs(value) > LARGE;
  const negative = value < 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.grantCredits({
        tenant_id: tenant.id, amount: value, bucket, reason, idempotency_key: key, confirm: large ? confirm : undefined,
      });
      setMsg({ ok: true, text: r.duplicate ? 'Already applied (duplicate request ignored).' : `Done. Balance now ${credits(Number(r.allowance_balance) + Number(r.topup_balance))}.` });
      setAmount('');
      setReason('');
      setConfirm('');
      setKey(newKey());
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Grant failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Grant or correct credits">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Credits" hint={admin.role === 'owner' ? 'Negative amount = correction' : 'Positive amounts only'}>
            <Input type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Bucket">
            <Select value={bucket} onChange={(e) => setBucket(e.target.value as 'topup' | 'allowance')}>
              <option value="topup">Top-up (purchased, 12 months)</option>
              <option value="allowance">Allowance (this month only)</option>
            </Select>
          </Field>
        </div>
        <Field label="Reason (logged)" hint="e.g. Razorpay payment pay_XXXX, invoice INV-0012">
          <Input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {large && (
          <Field label={`Large amount — type "${tenant.slug}" to confirm`}>
            <Input required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        )}
        {negative && admin.role !== 'owner' && <Notice tone="warning">Only owners can make negative corrections.</Notice>}
        {msg && (msg.ok ? <Notice tone="success">{msg.text}</Notice> : <ErrorBox message={msg.text} />)}
        <Button type="submit" busy={busy} disabled={!valid || (large && confirm !== tenant.slug) || (negative && admin.role !== 'owner')}>
          {negative ? 'Apply correction' : 'Grant credits'}
        </Button>
      </form>
    </Card>
  );
}

function PlanForm({ tenantId, wallet, onDone }: { tenantId: string; wallet: Wallet | null; onDone: () => void }) {
  const [allowance, setAllowance] = useState(String(wallet?.monthly_allowance ?? 0));
  const [overdraft, setOverdraft] = useState(String(wallet?.overdraft_limit ?? 0));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.setCreditPlan(tenantId, Number(allowance), Number(overdraft));
      setMsg({ ok: true, text: 'Saved. The new allowance applies from the next monthly reset.' });
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Credit plan">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Monthly allowance (credits)" hint="Included with the plan fee; resets on the 1st (IST); unused allowance lapses.">
          <Input type="number" min={0} step="0.01" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
        </Field>
        <Field label="Overdraft limit (credits)" hint="Only transactional sends (OTP, order updates) may use it when the balance is zero.">
          <Input type="number" min={0} step="0.01" value={overdraft} onChange={(e) => setOverdraft(e.target.value)} />
        </Field>
        {msg && (msg.ok ? <Notice tone="success">{msg.text}</Notice> : <ErrorBox message={msg.text} />)}
        <Button type="submit" variant="secondary" busy={busy}>Save credit plan</Button>
      </form>
    </Card>
  );
}
