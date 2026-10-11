import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, User, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import {
  fetchTenantMembers,
  filterTenantMembers,
  memberDisplayLabel,
  type TenantMember,
} from '@/lib/tenant-members';

type Props = {
  tenantId: string;
  label: string;
  hint?: string;
  icon?: typeof User;
  value: string;
  assignedUserId?: string;
  onAssign: (email: string, userId?: string) => void;
  onClear: () => void;
};

export function UserAssignField({
  tenantId,
  label,
  hint,
  icon: Icon = User,
  value,
  assignedUserId,
  onAssign,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTenantMembers(tenantId)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => filterTenantMembers(members, query), [members, query]);

  const assignedMember = members.find(
    (m) => m.userId === assignedUserId || m.email === value,
  );

  return (
    <div ref={containerRef} className="relative">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>

      {value && assignedMember ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
          <Avatar
            name={assignedMember.name}
            email={assignedMember.email}
            seed={assignedMember.userId}
            src={assignedMember.avatarUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {assignedMember.name ?? assignedMember.email}
            </p>
            <p className="truncate text-xs text-slate-500">
              {assignedMember.email}
              {assignedMember.roleName ? ` · ${assignedMember.roleName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClear();
              setQuery('');
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
            title="Remove assignment"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : value ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{value}</span>
          <button type="button" onClick={onClear} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2.5 text-left text-sm text-slate-500 transition hover:border-blue-300 hover:bg-blue-50/50 hover:text-slate-700"
        >
          <span>Search team members to assign…</span>
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {!assignedMember && value && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-medium text-blue-600 hover:underline"
        >
          Change assignment
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {loading ? (
              <li className="px-4 py-3 text-sm text-slate-500">Loading team…</li>
            ) : filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-500">
                {members.length === 0
                  ? 'Run supabase/sql/36_tenant_member_directory.sql to enable member search.'
                  : 'No members match your search.'}
              </li>
            ) : (
              filtered.map((member) => (
                <li key={member.userId}>
                  <button
                    type="button"
                    onClick={() => {
                      onAssign(member.email, member.userId);
                      setOpen(false);
                      setQuery('');
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <Avatar
                      name={member.name}
                      email={member.email}
                      seed={member.userId}
                      src={member.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {member.name ?? member.email}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {memberDisplayLabel(member)}
                        {member.roleName ? ` · ${member.roleName}` : ''}
                      </p>
                    </div>
                    {assignedUserId === member.userId && (
                      <Check className="h-4 w-4 text-emerald-600" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
