import { useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, type Account, type Plan, type Region, type TenantDetail } from '@/lib/api';
import { useAdmin } from '@/auth/AuthGate';
import { Button, Card, ErrorBox, Field, Input, Modal, Notice, Select, Stat } from '@/components/ui';
import { bytes, date, n, REGION_LABEL } from '@/lib/format';

export function OverviewTab({ detail, onChanged }: { detail: TenantDetail; onChanged: () => void }) {
  const { admin } = useAdmin();
  const { tenant, stats, account } = detail;
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    setErr(null);
    try {
      await api.refreshStats(tenant.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const changePlan = async (plan: Plan) => {
    setErr(null);
    try {
      await api.setPlan(tenant.id, plan);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not change plan');
    }
  };

  const reactivate = async () => {
    setErr(null);
    try {
      await api.setStatus(tenant.id, 'active');
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not reactivate');
    }
  };

  const rows = Object.entries(stats?.table_rows ?? {}).sort((a, b) => Number(b[1]) - Number(a[1]));

  return (
    <div className="space-y-6">
      {err && <ErrorBox message={err} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Users" value={stats ? `${n(stats.users_active)} / ${n(stats.users_total)}` : '—'} sub="active / total" />
        <Stat label="Profiles" value={stats ? n(stats.profiles_total) : '—'} />
        <Stat label="Events 30d" value={stats ? n(stats.events_30d) : '—'} />
        <Stat label="Deliveries 30d" value={stats ? n(stats.deliveries_30d) : '—'} />
        <Stat label="Est. storage" value={stats ? bytes(stats.est_bytes) : '—'} sub="estimate" />
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>Stats as of {stats ? date(stats.refreshed_at, true) : 'never'}</span>
        <Button variant="ghost" onClick={refresh} busy={refreshing} className="px-2 py-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AccountForm tenantId={tenant.id} account={account} onSaved={onChanged} />

        <div className="space-y-6">
          <Card title="Plan & status">
            <div className="space-y-4">
              <Field label="Plan">
                <Select value={tenant.plan} onChange={(e) => void changePlan(e.target.value as Plan)}>
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </Select>
              </Field>
              <div className="text-sm text-slate-600">Created {date(tenant.created_at)}</div>
              {admin.role === 'owner' ? (
                tenant.status === 'suspended' ? (
                  <Button variant="secondary" onClick={reactivate}>Reactivate tenant</Button>
                ) : (
                  <Button variant="danger" onClick={() => setSuspendOpen(true)}>Suspend tenant…</Button>
                )
              ) : (
                <p className="text-xs text-slate-500">Only owners can suspend or reactivate.</p>
              )}
              <Notice tone="warning">
                Suspension is recorded and shown everywhere, but doesn't block the tenant's users yet. Enforcement ships with the Phase 0 security work (TD-12).
              </Notice>
            </div>
          </Card>

          <Card title="Data footprint (rows)">
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">No stats yet. Refresh to compute.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="truncate text-slate-500">{k}</dt>
                    <dd className="tabular-nums text-slate-800">{n(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3 text-xs text-slate-500">Counts only. The console never shows end-customer records.</p>
          </Card>
        </div>
      </div>

      {suspendOpen && <SuspendModal slug={tenant.slug} tenantId={tenant.id} onClose={() => setSuspendOpen(false)} onDone={onChanged} />}
    </div>
  );
}

function AccountForm({ tenantId, account, onSaved }: { tenantId: string; account: Account | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    region: (account?.region ?? 'in') as Region,
    monthly_fee_inr: String(account?.monthly_fee_inr ?? 0),
    billing_email: account?.billing_email ?? '',
    legal_name: account?.legal_name ?? '',
    gstin: account?.gstin ?? '',
    billing_address: account?.billing_address ?? '',
    notes: account?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.updateAccount(tenantId, { ...form, monthly_fee_inr: Number(form.monthly_fee_inr) });
      setMsg({ ok: true, text: 'Saved' });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Commercial account">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Region">
            <Select value={form.region} onChange={set('region')}>
              {Object.entries(REGION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Platform fee (₹ / month, before GST)">
            <Input type="number" min={0} step="0.01" value={form.monthly_fee_inr} onChange={set('monthly_fee_inr')} />
          </Field>
        </div>
        <Field label="Legal name"><Input value={form.legal_name} onChange={set('legal_name')} maxLength={200} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Billing email"><Input type="email" value={form.billing_email} onChange={set('billing_email')} /></Field>
          <Field label="GSTIN"><Input value={form.gstin} onChange={set('gstin')} maxLength={15} className="uppercase" /></Field>
        </div>
        <Field label="Billing address">
          <textarea value={form.billing_address} onChange={set('billing_address')} rows={2} maxLength={1000}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        </Field>
        <Field label="Internal notes">
          <textarea value={form.notes} onChange={set('notes')} rows={2} maxLength={1000}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        </Field>
        {msg && (msg.ok ? <Notice tone="success">{msg.text}</Notice> : <ErrorBox message={msg.text} />)}
        <Button type="submit" busy={busy}>Save account</Button>
      </form>
    </Card>
  );
}

function SuspendModal({ slug, tenantId, onClose, onDone }: { slug: string; tenantId: string; onClose: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.setStatus(tenantId, 'suspended', confirm, reason);
      onDone();
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not suspend');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Suspend tenant" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {err && <ErrorBox message={err} />}
        <Field label="Reason (logged)"><Input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label={`Type the slug "${slug}" to confirm`}><Input required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" busy={busy} disabled={confirm !== slug}>Suspend</Button>
        </div>
      </form>
    </Modal>
  );
}
