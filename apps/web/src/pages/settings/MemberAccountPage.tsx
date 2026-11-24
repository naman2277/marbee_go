import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, Save, Shield, UserMinus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Avatar } from '@/components/ui';
import { AvatarPicker } from '@/components/profile/AvatarPicker';
import { InstanceAccessPanel } from '@/components/profile/InstanceAccessPanel';
import { LastLoginCard } from '@/components/profile/LastLoginCard';
import { useAuth } from '@/contexts/AuthContext';
import { PERMISSIONS } from '@/lib/permissions';
import {
  disableMember,
  fetchMemberDetail,
  fetchRolesWithPermissions,
  resetTenantUserPassword,
  updateMemberAccount,
  updateMemberRole,
} from '@/lib/access-management';
import { fetchAssetFolders } from '@/lib/assets';
import { fetchJourneyFolders } from '@/lib/journeys';
import { uploadAvatarImage } from '@/lib/profile';
import {
  EMPTY_MEMBER_SETTINGS,
  formatIpList,
  parseIpList,
  toggleFolderPath,
  type MemberAccountSettings,
} from '@/lib/member-settings';

type Tab = 'profile' | 'security' | 'folders';

export function MemberAccountPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantId, environment, user, hasPermission, accessLoading } = useAuth();

  const canManage = hasPermission(PERMISSIONS.ACCESS_MANAGE);
  const [tab, setTab] = useState<Tab>('profile');
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<MemberAccountSettings>(EMPTY_MEMBER_SETTINGS);
  const [ipInput, setIpInput] = useState('');
  const [ipError, setIpError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const memberQuery = useQuery({
    queryKey: ['member-detail', tenantId, userId],
    queryFn: () => fetchMemberDetail(tenantId, userId!),
    enabled: Boolean(tenantId && userId && canManage),
  });

  const rolesQuery = useQuery({
    queryKey: ['access-roles', tenantId],
    queryFn: () => fetchRolesWithPermissions(tenantId),
    enabled: Boolean(tenantId) && canManage,
  });

  const journeyFoldersQuery = useQuery({
    queryKey: ['journey-folders', tenantId, environment],
    queryFn: () => fetchJourneyFolders(tenantId, environment),
    enabled: Boolean(tenantId) && tab === 'folders',
  });

  const assetFoldersQuery = useQuery({
    queryKey: ['asset-folders', tenantId, environment],
    queryFn: () => fetchAssetFolders(tenantId, environment),
    enabled: Boolean(tenantId) && tab === 'folders',
  });

  const member = memberQuery.data;
  const roles = rolesQuery.data ?? [];

  useEffect(() => {
    if (!member) return;
    setName(member.name ?? '');
    setAvatarUrl(member.avatarUrl ?? null);
    setSettings(member.settings);
    setIpInput(formatIpList(member.settings.allowed_ips));
  }, [member]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!member) throw new Error('Member not loaded');
      const parsed = parseIpList(ipInput);
      if (parsed.invalid.length) {
        throw new Error(`Invalid IP entries: ${parsed.invalid.join(', ')}`);
      }
      return updateMemberAccount(tenantId, environment, {
        userId: member.userId,
        memberEmail: member.email,
        name,
        avatarUrl,
        settings: { ...settings, allowed_ips: parsed.ips },
      });
    },
    onSuccess: (updated) => {
      setSaveMessage('Account settings saved.');
      setError(null);
      setIpError(null);
      setSettings(updated.settings);
      setAvatarUrl(updated.avatarUrl ?? null);
      setIpInput(formatIpList(updated.settings.allowed_ips));
      void queryClient.invalidateQueries({ queryKey: ['member-detail', tenantId, userId] });
      void queryClient.invalidateQueries({ queryKey: ['access-members', tenantId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const roleMutation = useMutation({
    mutationFn: (roleId: string) => {
      if (!member) throw new Error('Member not loaded');
      return updateMemberRole(tenantId, environment, member.userId, roleId, member.email);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['member-detail', tenantId, userId] });
      void queryClient.invalidateQueries({ queryKey: ['access-members', tenantId] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => {
      if (!member) throw new Error('Member not loaded');
      return resetTenantUserPassword(tenantId, environment, {
        userId: member.userId,
        memberEmail: member.email,
      });
    },
    onSuccess: (result) => {
      setResetSuccess(result.message);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['member-detail', tenantId, userId] });
      void queryClient.invalidateQueries({ queryKey: ['access-members', tenantId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: () => {
      if (!member) throw new Error('Member not loaded');
      return disableMember(tenantId, environment, member.userId, member.email);
    },
    onSuccess: () => navigate('/settings/access'),
  });

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        Checking permissions…
      </div>
    );
  }

  if (!canManage) {
    return (
      <Card className="mx-auto mt-12 max-w-lg p-8 text-center">
        <Shield className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="mt-2 text-sm text-slate-500">You need access.manage to edit member accounts.</p>
        <Link to="/settings/access" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          Back to access management
        </Link>
      </Card>
    );
  }

  if (memberQuery.isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-slate-500">Loading member account…</p>
      </div>
    );
  }

  if (memberQuery.error || !member) {
    return (
      <EmptyState
        title="Member not found"
        description="This account does not exist in your workspace or you cannot view it."
        action={
          <Link to="/settings/access" className="text-sm font-medium text-brand-600 hover:underline">
            Back to access management
          </Link>
        }
      />
    );
  }

  const isSelf = member.userId === user?.id;
  const journeyFolders = journeyFoldersQuery.data ?? [];
  const assetFolders = assetFoldersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/settings/access"
        className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Access management
      </Link>

      <PageHeader
        title={member.name ?? member.email}
        description={member.name ? member.email : 'Workspace member account'}
        action={
          <div className="flex items-center gap-2">
            <Avatar
              name={member.name}
              email={member.email}
              seed={member.userId}
              src={avatarUrl}
              size="lg"
            />
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
            <Badge>{member.roleName}</Badge>
          </div>
        }
      />

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {([
          ['profile', 'User'],
          ['security', 'Security & access'],
          ['folders', 'Folder access'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <Card className="space-y-6 p-6">
          <AvatarPicker
            name={name}
            email={member.email}
            seed={member.userId}
            value={avatarUrl}
            onChange={async (url) => setAvatarUrl(url)}
            onUpload={(file) => uploadAvatarImage(member.userId, file)}
          />

          <LastLoginCard lastLoginAt={member.lastLoginAt} memberSince={member.memberSince} />

          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold text-slate-900">Instance access</h3>
            <p className="mt-1 text-xs text-slate-500">
              Control which Dev, Stage, and Prod instances this user can access and what they can do.
            </p>
            <div className="mt-4">
              <InstanceAccessPanel
                value={settings.instance_access}
                onChange={(next) => setSettings((s) => ({ ...s, instance_access: next }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                readOnly
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                value={member.email}
              />
            </Field>
            <Field label="Role">
              {isSelf ? (
                <input
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  value={member.roleName}
                />
              ) : (
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={member.roleId}
                  disabled={roleMutation.isPending}
                  onChange={(e) => roleMutation.mutate(e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.roleId} value={r.roleId}>{r.name}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Member since">
              <input
                readOnly
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                value={new Date(member.memberSince).toLocaleString()}
              />
            </Field>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold text-slate-900">Organization details</h3>
            <p className="mt-1 text-xs text-slate-500">Company and contact info for this member within your workspace.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Company">
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={settings.company}
                  onChange={(e) => setSettings((s) => ({ ...s, company: e.target.value }))}
                  placeholder="Acme Corp"
                />
              </Field>
              <Field label="Department">
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={settings.department}
                  onChange={(e) => setSettings((s) => ({ ...s, department: e.target.value }))}
                  placeholder="Marketing"
                />
              </Field>
              <Field label="Job title">
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={settings.job_title}
                  onChange={(e) => setSettings((s) => ({ ...s, job_title: e.target.value }))}
                  placeholder="Campaign Manager"
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={settings.phone}
                  onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="+1 555 0100"
                />
              </Field>
            </div>
            <Field label="Internal notes" className="mt-4">
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={settings.notes}
                onChange={(e) => setSettings((s) => ({ ...s, notes: e.target.value }))}
                placeholder="Onboarding notes, manager, region, etc."
              />
            </Field>
          </div>
        </Card>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          <Card className="space-y-4 p-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Allowed IP addresses</h3>
              <p className="mt-1 text-xs text-slate-500">
                One IP or CIDR per line (e.g. 203.0.113.45 or 10.0.0.0/24). Leave empty to allow any IP.
                Enforcement at login can be enabled later — settings are saved now for your records.
              </p>
            </div>
            <textarea
              rows={5}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
              value={ipInput}
              onChange={(e) => {
                setIpInput(e.target.value);
                setIpError(null);
              }}
              placeholder={'203.0.113.10\n10.0.0.0/24'}
            />
            {ipError && <p className="text-sm text-red-600">{ipError}</p>}
          </Card>

          {!isSelf && (
            <Card className="space-y-4 p-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Password</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Email this member a one-time link to choose a new password. Only they can use it — admins never see or set passwords.
                </p>
              </div>
              {!resetSuccess ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={resetPasswordMutation.isPending}
                    onClick={() => resetPasswordMutation.mutate()}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    {resetPasswordMutation.isPending ? 'Sending…' : 'Send reset link'}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-emerald-700">{resetSuccess}</p>
              )}
            </Card>
          )}

          {!isSelf && member.status !== 'disabled' && (
            <Card className="border-red-100 p-6">
              <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
              <p className="mt-1 text-xs text-slate-500">Disable this member&apos;s access to the workspace.</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 text-red-600 hover:bg-red-50"
                disabled={disableMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Disable access for ${member.email}?`)) {
                    disableMutation.mutate();
                  }
                }}
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Disable member
              </Button>
            </Card>
          )}
        </div>
      )}

      {tab === 'folders' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Journey folders</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Limit which campaign/journey folders this member can access.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={settings.restrict_journey_folders}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, restrict_journey_folders: e.target.checked }))
                  }
                />
                Restrict access
              </label>
            </div>
            <div className={`mt-4 max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3 ${
              settings.restrict_journey_folders ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-60'
            }`}>
              <FolderCheckbox
                label="All campaigns & journeys (root)"
                path="/"
                disabled={!settings.restrict_journey_folders}
                checked={settings.journey_folder_paths.includes('/')}
                onChange={(checked) =>
                  setSettings((s) => ({
                    ...s,
                    journey_folder_paths: toggleFolderPath(s.journey_folder_paths, '/', checked),
                  }))
                }
              />
              {journeyFolders.map((folder) => (
                <FolderCheckbox
                  key={folder.id}
                  label={folder.path}
                  path={folder.path}
                  disabled={!settings.restrict_journey_folders}
                  checked={settings.journey_folder_paths.includes(folder.path)}
                  onChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      journey_folder_paths: toggleFolderPath(s.journey_folder_paths, folder.path, checked),
                    }))
                  }
                />
              ))}
              {!journeyFolders.length && (
                <p className="text-xs text-slate-400">No journey folders created yet.</p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Asset folders</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Limit which asset library folders this member can browse.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={settings.restrict_asset_folders}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, restrict_asset_folders: e.target.checked }))
                  }
                />
                Restrict access
              </label>
            </div>
            <div className={`mt-4 max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3 ${
              settings.restrict_asset_folders ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-60'
            }`}>
              <FolderCheckbox
                label="All assets (root)"
                path="/"
                disabled={!settings.restrict_asset_folders}
                checked={settings.asset_folder_paths.includes('/')}
                onChange={(checked) =>
                  setSettings((s) => ({
                    ...s,
                    asset_folder_paths: toggleFolderPath(s.asset_folder_paths, '/', checked),
                  }))
                }
              />
              {assetFolders.map((folder) => (
                <FolderCheckbox
                  key={folder.id}
                  label={folder.path}
                  path={folder.path}
                  disabled={!settings.restrict_asset_folders}
                  checked={settings.asset_folder_paths.includes(folder.path)}
                  onChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      asset_folder_paths: toggleFolderPath(s.asset_folder_paths, folder.path, checked),
                    }))
                  }
                />
              ))}
              {!assetFolders.length && (
                <p className="text-xs text-slate-400">No asset folders created yet.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {(tab === 'profile' || tab === 'folders' || tab === 'security') && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div>
            {saveMessage && <p className="text-sm text-emerald-700">{saveMessage}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <Button
            disabled={saveMutation.isPending || !name.trim()}
            onClick={() => {
              setSaveMessage(null);
              saveMutation.mutate();
            }}
          >
            <Save className="mr-2 h-4 w-4" />
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FolderCheckbox({
  label,
  disabled,
  checked,
  onChange,
}: {
  label: string;
  path: string;
  disabled: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="font-mono text-xs">{label}</span>
    </label>
  );
}
