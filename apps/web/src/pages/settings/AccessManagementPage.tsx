import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, KeyRound, Mail, Pencil, Plus, Shield, UserMinus, UserPlus, Users } from 'lucide-react';
import { PageHeader, Card, Button, Badge, EmptyState, Avatar } from '@/components/ui';
import { RoleEditorModal, canManageRoles, type RoleEditorValues } from '@/components/settings/RoleEditorModal';
import { useAuth } from '@/contexts/AuthContext';
import { PERMISSIONS, PERMISSION_CATALOG, PERMISSION_CATEGORY_LABELS } from '@/lib/permissions';
import {
  disableMember,
  createTenantUser,
  createTenantRole,
  deleteTenantRole,
  fetchAccessMembers,
  fetchRolesWithPermissions,
  fetchTenantInvites,
  inviteMember,
  resetTenantUserPassword,
  revokeInvite,
  updateMemberRole,
  updateTenantRole,
} from '@/lib/access-management';
import type { TenantRole } from '@/lib/access-management';

type Tab = 'members' | 'roles' | 'invites';
type AddMode = 'invite' | 'create';
type CreateDelivery = 'password' | 'setup_link';

type ResetTarget = {
  userId: string;
  email: string;
  name: string | null;
  status: 'active' | 'invited';
};

export function AccessManagementPage() {
  const { tenantId, environment, user, refreshAccess, hasPermission, accessLoading, access } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('create');
  const [inviteEmail, setInviteEmail] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  // SEC-12: admins never set or know a member's password — new members get a setup link.
  const createDelivery = 'setup_link' as CreateDelivery;
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleEditorMode, setRoleEditorMode] = useState<'create' | 'edit'>('edit');
  const [editingRole, setEditingRole] = useState<TenantRole | null>(null);
  const [roleEditorError, setRoleEditorError] = useState<string | null>(null);

  const canManage = hasPermission(PERMISSIONS.ACCESS_MANAGE);
  const canInvite = hasPermission(PERMISSIONS.ACCESS_INVITE);
  const canEditRoles = canManageRoles(hasPermission, access.isAdmin);
  const canView = canManage || canInvite;

  const membersQuery = useQuery({
    queryKey: ['access-members', tenantId],
    queryFn: () => fetchAccessMembers(tenantId),
    enabled: Boolean(tenantId) && canManage,
  });

  const rolesQuery = useQuery({
    queryKey: ['access-roles', tenantId],
    queryFn: () => fetchRolesWithPermissions(tenantId),
    enabled: Boolean(tenantId),
  });

  const invitesQuery = useQuery({
    queryKey: ['access-invites', tenantId],
    queryFn: () => fetchTenantInvites(tenantId),
    enabled: Boolean(tenantId) && (canManage || canInvite) && tab === 'invites',
  });

  const roles = rolesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const resolvedRoleId = inviteRoleId || roles[0]?.roleId || '';

  const clearPasswordFields = () => {
    /* no password fields any more (SEC-12) */
  };

  const createUserMutation = useMutation({
    mutationFn: () =>
      createTenantUser(tenantId, environment, {
        email: inviteEmail,
        fullName: createFullName,
        roleId: resolvedRoleId,
        password: undefined,
      }),
    onSuccess: (result) => {
      setCreateSuccess(result.message);
      setInviteLink(result.setupLink ?? null);
      clearPasswordFields();
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['access-members', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['access-invites', tenantId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => {
      if (!resetTarget) throw new Error('No member selected');
      return resetTenantUserPassword(tenantId, environment, {
        userId: resetTarget.userId,
        memberEmail: resetTarget.email,
      });
    },
    onSuccess: (result) => {
      setResetSuccess(result.message);
      clearPasswordFields();
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['access-members', tenantId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const inviteMutation = useMutation({
    mutationFn: () => inviteMember(tenantId, environment, inviteEmail, resolvedRoleId),
    onSuccess: (result) => {
      setInviteLink(result.inviteUrl);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['access-invites', tenantId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, roleId, email }: { userId: string; roleId: string; email: string }) =>
      updateMemberRole(tenantId, environment, userId, roleId, email),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['access-members', tenantId] });
      void refreshAccess();
    },
  });

  const disableMutation = useMutation({
    mutationFn: ({ userId, email }: { userId: string; email: string }) =>
      disableMember(tenantId, environment, userId, email),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['access-members', tenantId] }),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ inviteId, email }: { inviteId: string; email: string }) =>
      revokeInvite(tenantId, environment, inviteId, email),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['access-invites', tenantId] }),
  });

  const saveRoleMutation = useMutation({
    mutationFn: (values: RoleEditorValues) => {
      if (roleEditorMode === 'create') {
        return createTenantRole(tenantId, environment, values).then(() => undefined);
      }
      if (!editingRole) throw new Error('No role selected');
      return updateTenantRole(tenantId, environment, editingRole.roleId, values);
    },
    onSuccess: () => {
      setRoleEditorOpen(false);
      setEditingRole(null);
      setRoleEditorError(null);
      void queryClient.invalidateQueries({ queryKey: ['access-roles', tenantId] });
      void refreshAccess();
    },
    onError: (err: Error) => setRoleEditorError(err.message),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: () => {
      if (!editingRole) throw new Error('No role selected');
      return deleteTenantRole(tenantId, environment, editingRole.roleId, editingRole.name);
    },
    onSuccess: () => {
      setRoleEditorOpen(false);
      setEditingRole(null);
      setRoleEditorError(null);
      void queryClient.invalidateQueries({ queryKey: ['access-roles', tenantId] });
    },
    onError: (err: Error) => setRoleEditorError(err.message),
  });

  const openCreateRole = () => {
    setRoleEditorMode('create');
    setEditingRole(null);
    setRoleEditorError(null);
    setRoleEditorOpen(true);
  };

  const openEditRole = (role: TenantRole) => {
    setRoleEditorMode('edit');
    setEditingRole(role);
    setRoleEditorError(null);
    setRoleEditorOpen(true);
  };

  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingInvites = (invitesQuery.data ?? []).filter((i) => i.status === 'pending');

  const permissionsByCategory = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_CATALOG>();
    for (const p of PERMISSION_CATALOG) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, []);

  useEffect(() => {
    if (roles.length && !inviteRoleId) {
      setInviteRoleId(roles[0].roleId);
    }
  }, [roles, inviteRoleId]);

  useEffect(() => {
    if (!canManage && canInvite && tab === 'members') {
      setTab('invites');
    }
  }, [canManage, canInvite, tab]);

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        Checking permissions…
      </div>
    );
  }

  if (!canView) {
    return (
      <Card className="max-w-lg mx-auto mt-12 p-8 text-center">
        <Shield className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="mt-2 text-sm text-slate-500">
          Your role ({access.roleName ?? 'unknown'}) cannot manage workspace access.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
          title="Access management"
          description="Members, roles, and workspace invitations"
          action={
            canInvite ? (
              <Button onClick={() => {
                setInviteOpen(true);
                setAddMode('create');
                setInviteLink(null);
                setCreateSuccess(null);
                setInviteEmail('');
                setCreateFullName('');
                clearPasswordFields();
                setError(null);
              }}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add member
              </Button>
            ) : undefined
          }
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Active members" value={String(activeMembers.length)} icon={Users} />
          <StatCard label="Roles" value={String(roles.length)} icon={Shield} />
          <StatCard label="Pending invites" value={String(pendingInvites.length)} icon={Mail} />
        </div>

        <div className="mb-4 flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {(['members', 'roles', 'invites'] as Tab[])
            .filter((t) => (t === 'members' || t === 'roles' ? canManage : canManage || canInvite))
            .map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'members' && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3 font-semibold">Member</th>
                    <th className="px-6 py-3 font-semibold">Role</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    {canManage && <th className="px-6 py-3 font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <tr key={member.userId} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <Link
                          to={`/settings/access/members/${member.userId}`}
                          className="group flex items-center gap-3 rounded-lg -mx-2 px-2 py-1 hover:bg-slate-100/80"
                        >
                          <Avatar
                            name={member.name}
                            email={member.email}
                            seed={member.userId}
                            src={member.avatarUrl}
                            size="sm"
                          />
                          <div>
                            <p className="font-medium text-slate-900 group-hover:text-brand-700">
                              {member.name ?? member.email}
                            </p>
                            {member.name && <p className="text-xs text-slate-500">{member.email}</p>}
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        {canManage && member.userId !== user?.id && member.status === 'active' ? (
                          <select
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                            value={member.roleId}
                            disabled={roleMutation.isPending}
                            onChange={(e) =>
                              roleMutation.mutate({
                                userId: member.userId,
                                roleId: e.target.value,
                                email: member.email,
                              })
                            }
                          >
                            {roles.map((r) => (
                              <option key={r.roleId} value={r.roleId}>{r.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span>{member.roleName}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            member.status === 'active'
                              ? 'success'
                              : member.status === 'invited'
                                ? 'warning'
                                : 'error'
                          }
                        >
                          {member.status === 'invited' ? 'Pending setup' : member.status}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            <Link to={`/settings/access/members/${member.userId}`}>
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="mr-1 h-4 w-4" />
                                Open account
                              </Button>
                            </Link>
                            {member.userId !== user?.id
                              && (member.status === 'active' || member.status === 'invited') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setResetTarget({
                                    userId: member.userId,
                                    email: member.email,
                                    name: member.name,
                                    status: member.status === 'invited' ? 'invited' : 'active',
                                  });
                                  setResetSuccess(null);
                                  clearPasswordFields();
                                  setError(null);
                                }}
                              >
                                <KeyRound className="mr-1 h-4 w-4" />
                                Send reset link
                              </Button>
                            )}
                            {member.userId !== user?.id && member.status === 'active' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:bg-red-50"
                                disabled={disableMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`Disable access for ${member.email}?`)) {
                                    disableMutation.mutate({ userId: member.userId, email: member.email });
                                  }
                                }}
                              >
                                <UserMinus className="mr-1 h-4 w-4" />
                                Disable
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!members.length && !membersQuery.isLoading && (
                <EmptyState title="No members" description="Invite teammates to collaborate in this workspace." />
              )}
            </div>
          </Card>
        )}

        {tab === 'roles' && (
          <div className="space-y-4">
            {canEditRoles && (
              <div className="flex justify-end">
                <Button onClick={openCreateRole}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create role
                </Button>
              </div>
            )}

            {roles.map((role) => (
              <Card key={role.roleId} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{role.name}</h3>
                      {role.isSystem && <Badge>System role</Badge>}
                    </div>
                    {role.description && (
                      <p className="mt-1 text-sm text-slate-500">{role.description}</p>
                    )}
                    <p className="mt-2 font-mono text-xs text-slate-400">{role.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{role.permissionSlugs.length} permissions</Badge>
                    {canEditRoles && (
                      <Button variant="secondary" size="sm" onClick={() => openEditRole(role)}>
                        <Pencil className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[...permissionsByCategory.entries()].map(([category, perms]) => {
                    const granted = perms.filter((p) =>
                      role.slug === 'tenant_admin' || role.permissionSlugs.includes(p.slug),
                    );
                    if (!granted.length) return null;
                    return (
                      <div key={category} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {PERMISSION_CATEGORY_LABELS[category] ?? category}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {granted.map((p) => (
                            <li key={p.slug} className="text-xs text-slate-700">{p.name}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            {!roles.length && !rolesQuery.isLoading && (
              <EmptyState
                title="No roles"
                description="Create a custom role to define granular access for your team."
                action={
                  canEditRoles ? (
                    <Button onClick={openCreateRole}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create role
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        )}

        {tab === 'invites' && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3 font-semibold">Email</th>
                    <th className="px-6 py-3 font-semibold">Name</th>
                    <th className="px-6 py-3 font-semibold">Type</th>
                    <th className="px-6 py-3 font-semibold">Role</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Expires</th>
                    {canInvite && <th className="px-6 py-3 font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(invitesQuery.data ?? []).map((invite) => (
                    <tr key={invite.id}>
                      <td className="px-6 py-4 font-medium">{invite.email}</td>
                      <td className="px-6 py-4 text-slate-600">{invite.fullName ?? '—'}</td>
                      <td className="px-6 py-4">
                        <Badge variant={invite.inviteKind === 'provisioned' ? 'default' : 'warning'}>
                          {invite.inviteKind === 'provisioned' ? 'Created user' : 'Invite link'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">{invite.roleName}</td>
                      <td className="px-6 py-4">
                        <Badge variant={invite.status === 'pending' ? 'warning' : 'default'}>
                          {invite.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </td>
                      {canInvite && (
                        <td className="px-6 py-4">
                          {invite.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeMutation.mutate({ inviteId: invite.id, email: invite.email })}
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!invitesQuery.data?.length && !invitesQuery.isLoading && (
                <EmptyState title="No invitations" description="Pending and past invitations appear here." />
              )}
            </div>
          </Card>
        )}

        {inviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-lg p-6">
              <h2 className="text-lg font-semibold text-slate-900">Add member</h2>
              <p className="mt-1 text-sm text-slate-500">
                Create a new login with email setup, or send an invite link for existing users.
              </p>

              {!inviteLink && !createSuccess ? (
                <>
                  <div className="mt-4 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => { setAddMode('create'); setError(null); }}
                      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                        addMode === 'create' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      Create user
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddMode('invite'); setError(null); }}
                      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                        addMode === 'invite' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      Invite link
                    </button>
                  </div>

                  <div className="mt-6 space-y-4">
                    {addMode === 'create' && (
                      <div>
                        <label className="text-xs font-medium text-slate-600">Full name</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          value={createFullName}
                          onChange={(e) => setCreateFullName(e.target.value)}
                          placeholder="Jane Smith"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-slate-600">Email</label>
                      <input
                        type="email"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Role</label>
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={resolvedRoleId}
                        onChange={(e) => setInviteRoleId(e.target.value)}
                      >
                        {roles.map((r) => (
                          <option key={r.roleId} value={r.roleId}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    {addMode === 'create' && createDelivery === 'setup_link' && (
                      <p className="text-xs text-slate-500">
                        The new member receives a setup link by email and chooses their own password. Admins never set or see member passwords.
                      </p>
                    )}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
                      {addMode === 'create' ? (
                        <Button
                          disabled={
                            !inviteEmail.trim()
                            || !createFullName.trim()
                            || !resolvedRoleId
                            || createUserMutation.isPending
                          }
                          onClick={() => createUserMutation.mutate()}
                        >
                          {createDelivery === 'password' ? 'Create user' : 'Create user & send setup link'}
                        </Button>
                      ) : (
                        <Button
                          disabled={!inviteEmail.trim() || !resolvedRoleId || inviteMutation.isPending}
                          onClick={() => inviteMutation.mutate()}
                        >
                          Send invite link
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-emerald-700">
                    {createSuccess ?? `Invitation created for ${inviteEmail}.`}
                  </p>
                  <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {inviteLink ? (
                      <>
                        Send the setup link below to <strong>{inviteEmail}</strong>. They open it once to
                        set their password. Do not open it yourself while logged in as admin — it is only
                        for the invited user.
                      </>
                    ) : (
                      <>
                        Share the login email and password with <strong>{inviteEmail}</strong> through a
                        secure channel. You cannot view the password again after creating the account.
                      </>
                    )}
                  </p>
                  {inviteLink && (
                    <>
                      <p className="text-xs font-medium text-slate-600">
                        Setup link for {inviteEmail}:
                      </p>
                      <div className="flex gap-2">
                        <input
                          readOnly
                          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
                          value={inviteLink}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void navigator.clipboard.writeText(inviteLink)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={() => setInviteOpen(false)}>Done</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {resetTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-lg p-6">
              <h2 className="text-lg font-semibold text-slate-900">Send password reset link</h2>
              <p className="mt-1 text-sm text-slate-500">
                {resetTarget.name ?? resetTarget.email} will get an email with a one-time link to choose a new password. Only they can use it — you never see or set their password.
              </p>

              {!resetSuccess ? (
                <div className="mt-6 space-y-4">
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => { setResetTarget(null); clearPasswordFields(); setError(null); }}>
                      Cancel
                    </Button>
                    <Button
                      disabled={resetPasswordMutation.isPending}
                      onClick={() => resetPasswordMutation.mutate()}
                    >
                      {resetPasswordMutation.isPending ? 'Sending…' : 'Send reset link'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-emerald-700">{resetSuccess}</p>
                  <div className="flex justify-end">
                    <Button onClick={() => { setResetTarget(null); setResetSuccess(null); setError(null); }}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        <RoleEditorModal
          open={roleEditorOpen}
          mode={roleEditorMode}
          role={editingRole}
          saving={saveRoleMutation.isPending}
          deleting={deleteRoleMutation.isPending}
          error={roleEditorError}
          onClose={() => {
            setRoleEditorOpen(false);
            setEditingRole(null);
            setRoleEditorError(null);
          }}
          onSave={(values) => saveRoleMutation.mutate(values)}
          onDelete={
            roleEditorMode === 'edit' && editingRole && !editingRole.isSystem
              ? () => {
                  if (window.confirm(`Delete role "${editingRole.name}"? This cannot be undone.`)) {
                    deleteRoleMutation.mutate();
                  }
                }
              : undefined
          }
        />
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <Icon className="h-4 w-4 text-violet-500 opacity-60" />
      </div>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
