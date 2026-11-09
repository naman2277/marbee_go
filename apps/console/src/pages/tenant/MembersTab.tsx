import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, type Member } from '@/lib/api';
import { Badge, Button, Empty, ErrorBox, Loading, Modal, Notice, Table, td, useLoad } from '@/components/ui';
import { date } from '@/lib/format';

export function MembersTab({ tenantId }: { tenantId: string }) {
  const { data, error, loading, reload } = useLoad(() => api.members(tenantId), [tenantId]);
  const [target, setTarget] = useState<Member | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Notice>
        Password help is done by sending the member a reset link to their own email. The console can't see or set passwords.
      </Notice>
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
