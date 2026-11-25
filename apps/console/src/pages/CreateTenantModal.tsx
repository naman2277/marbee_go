import { useState, type FormEvent } from 'react';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { api, type CreateTenantResult, type NewTenant } from '@/lib/api';
import { Button, ErrorBox, Field, Input, Modal, Notice, Select } from '@/components/ui';
import { REGION_LABEL } from '@/lib/format';

/** "acme Retail Pvt. Ltd." → "acme-retail-pvt-ltd" (same rules the server enforces). */
export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: (tenantId: string) => void }) {
  const [f, setF] = useState<NewTenant>({ name: '', slug: '', plan: 'starter', status: 'trial', region: 'in', owner_name: '', owner_email: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<CreateTenantResult | null>(null);

  const set = <K extends keyof NewTenant>(k: K, v: NewTenant[K]) => setF((s) => ({ ...s, [k]: v }));
  const onName = (name: string) => setF((s) => ({ ...s, name, slug: slugEdited ? s.slug : slugify(name) }));

  const problems = [
    f.name.trim().length < 2 && 'Workspace name',
    (!SLUG_RE.test(f.slug) || f.slug.includes('--')) && 'Slug',
    f.owner_name.trim().length < 2 && 'Owner name',
    !EMAIL_RE.test(f.owner_email.trim()) && 'Owner email',
  ].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length) return;
    setBusy(true);
    setErr(null);
    try {
      setDone(await api.createTenant({ ...f, name: f.name.trim(), owner_name: f.owner_name.trim(), owner_email: f.owner_email.trim().toLowerCase() }));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create the workspace');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Workspace created" onClose={() => onCreated(done.tenant_id)}>
        <div className="space-y-4 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <p>
              <strong>{f.name}</strong> ({done.slug}) is ready: {done.provisioned.roles} standard roles, and{' '}
              {Math.round(done.provisioned.schemas / 3)} standard schemas in each of development, staging and production.
            </p>
          </div>
          {done.invite.sent ? (
            <Notice tone="success">
              {done.invite.existing_account
                ? `${f.owner_email} already has a Marbee account — they were added as Tenant Admin and emailed a link to join.`
                : `Invitation emailed to ${f.owner_email}. They set their own password from the link.`}
            </Notice>
          ) : (
            <Notice tone="warning">
              <span className="inline-flex items-start gap-2">
                <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>The workspace exists, but the owner invitation failed: {done.invite.error}. Fix the cause, then use
                  "Invite admin" on the workspace's Members tab.</span>
              </span>
            </Notice>
          )}
          <div className="flex justify-end">
            <Button onClick={() => onCreated(done.tenant_id)}>Open workspace</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New workspace" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {err && <ErrorBox message={err} />}
        <Field label="Workspace name" hint="Usually the customer's brand name.">
          <Input value={f.name} onChange={(e) => onName(e.target.value)} placeholder="Acme Retail" autoFocus maxLength={120} />
        </Field>
        <Field label="Slug" hint="Permanent short id: lowercase letters, digits and hyphens, 3–48 characters.">
          <Input value={f.slug} onChange={(e) => { setSlugEdited(true); set('slug', e.target.value.toLowerCase()); }} placeholder="acme-retail" maxLength={48} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Plan">
            <Select value={f.plan} onChange={(e) => set('plan', e.target.value as NewTenant['plan'])}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set('status', e.target.value as NewTenant['status'])}>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
            </Select>
          </Field>
          <Field label="Region">
            <Select value={f.region} onChange={(e) => set('region', e.target.value as NewTenant['region'])}>
              {Object.entries(REGION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <p className="mb-3 text-sm font-medium text-slate-900">Workspace owner (Tenant Admin)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={f.owner_name} onChange={(e) => set('owner_name', e.target.value)} placeholder="Priya Sharma" maxLength={120} />
            </Field>
            <Field label="Email">
              <Input type="email" value={f.owner_email} onChange={(e) => set('owner_email', e.target.value)} placeholder="priya@acme.com" maxLength={254} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">They get an email to set their own password. The console never sees it.</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{problems.length ? `Check: ${problems.join(', ')}` : 'This action is logged.'}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" busy={busy} disabled={problems.length > 0}>Create workspace</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
