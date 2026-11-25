import { useState } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { api, type Member } from '@/lib/api';
import { useAdmin } from '@/auth/AuthGate';
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, Notice, Table, td, useLoad } from '@/components/ui';
import { date } from '@/lib/format';

export function MembersTab({ tenantId }: { tenantId: string }) {
  const { data, error, loading, reload } = useLoad(() => api.members(tenantId), [tenantId]);
  const [target, setTarget] = useState<Member | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const { admin } = useAdmin();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Notice>
          Password help is done by sending the member a reset link to their own email. The console can't see or set passwords.
        </Notice>
        {admin.role === 'owner' && (
          <Button variant="secondary" className="shrink-0" onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" aria-hidden /> Invite admin
          </Button>
        )}
      </div>
      {flash && <Notice tone="success">{flash}</Notice>}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.members.length === 0 && <Empty title="No members" />}
      {data && data.members.length > 0 && (
        <Table head={['Member', 'Role', 'Status', 'Last login', 'Joined', '']}>
          {data.members.map((m) => (
            <tr key={m.user_id}>
              <td className={td}>
                <div className="font-medium text-slate-900">{m.name ?? '—'}</div>
                <div className="text-xs text-slate-500">{m.email ?? '—'}</div>
              </td>
              <td className={td}>{m.role ?? '—'}</td>
              <td className={td}><Badge tone={m.status}>{m.status}</Badge></td>
              <td className={td}>{date(m.last_login_at, true)}</td>
              <td className={td}>{date(m.created_at)}</td>
              <td className={`${td} text-right`}>
                <Button variant="secondary" className="px-2.5 py-1.5 text-xs" disabled={!m.email} onClick={() => setTarget(m)}>
                  <KeyRound className="h-3.5 w-3.5" aria-hidden /> Send reset link
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {inviting && (
        <InviteAdminModal
          tenantId={tenantId}
          onClose={() => setInviting(false)}
          onSent={(msg) => { setFlash(msg); void reload(); }}
        />
      )}
      {target && (
        <ResetModal
          tenantId={tenantId}
          member={target}
          onClose={() => setTarget(null)}
          onSent={() => setFlash(`Reset link sent to ${target.email}.`)}
        />
      )}
    </div>
  );
}

function ResetModal({ tenantId, member, onClose, onSent }: { tenantId: string; member: Member; onClose: () => void; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.sendReset(tenantId, member.user_id);
      onSent();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Send password reset link" onClose={onClose}>
      <div className="space-y-4">
        {err && <ErrorBox message={err} />}
        <p className="text-sm text-slate-600">
          A one-time reset link will be emailed to <strong>{member.email}</strong>. Only they can use it. This action is logged.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={send} busy={busy}>Send link</Button>
        </div>
      </div>
    </Modal>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function InviteAdminModal({ tenantId, onClose, onSent }: { tenantId: string; onClose: () => void; onSent: (message: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = name.trim().length >= 2 && EMAIL_RE.test(email.trim());

  const send = async () => {
    setBusy(true);
    setErr(null);
    const addr = email.trim().toLowerCase();
    try {
      const r = await api.inviteOwner(tenantId, name.trim(), addr);
      onSent(r.existing_account
        ? `${addr} already has a Marbee account — added as Tenant Admin and emailed a link to join.`
        : `Invitation emailed to ${addr}.`);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the invitation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Invite a Tenant Admin" onClose={onClose}>
      <div className="space-y-4">
        {err && <ErrorBox message={err} />}
        <p className="text-sm text-slate-600">
          Use this for the workspace owner, or to resend an invitation that didn't arrive. They join with full access and
          set their own password from the email. This action is logged.
        </p>
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={send} busy={busy} disabled={!valid}>Send invitation</Button>
        </div>
      </div>
    </Modal>
  );
}
