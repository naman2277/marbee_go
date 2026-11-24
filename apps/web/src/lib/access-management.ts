import { supabase } from './supabase';
import { logAudit } from './audit';
import { invokeFunction } from './functions';
import {
  parseMemberSettings,
  memberSettingsToPayload,
  type MemberAccountSettings,
  type TenantMemberDetail,
  type InstanceAccessMap,
} from './member-settings';

export type AccessSnapshot = {
  roleSlug: string | null;
  roleName: string | null;
  roleId: string | null;
  permissions: string[];
  isAdmin: boolean;
  instanceAccess: InstanceAccessMap | null;
};

export type TenantRole = {
  roleId: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionSlugs: string[];
};

export type TenantMemberRow = {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  roleId: string;
  roleName: string;
  roleSlug: string;
  status: 'active' | 'disabled' | 'invited';
};

export type TenantInvite = {
  id: string;
  email: string;
  fullName: string | null;
  inviteKind: 'link' | 'provisioned';
  roleName: string;
  roleSlug: string;
  status: string;
  invitedByEmail: string | null;
  expiresAt: string;
  createdAt: string;
};

export type CreateTenantUserResult = {
  userId: string;
  inviteId?: string;
  email: string;
  fullName: string;
  emailSent?: boolean;
  setupLink?: string | null;
  mode: 'password' | 'setup_link';
  message: string;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  environment: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export type InvitePreview = {
  valid: boolean;
  reason?: string;
  email?: string;
  tenantName?: string;
  roleName?: string;
  expiresAt?: string;
};

export async function fetchMyAccess(tenantId: string): Promise<AccessSnapshot> {
  const { data, error } = await supabase.rpc('get_my_access', { p_tenant_id: tenantId });
  if (error) {
    return { roleSlug: null, roleName: null, roleId: null, permissions: [], isAdmin: false, instanceAccess: null };
  }
  const row = data as {
    role_slug?: string;
    role_name?: string;
    role_id?: string;
    permissions?: string[];
    is_admin?: boolean;
    instance_access?: unknown;
  } | null;
  const settings = parseMemberSettings({ instance_access: row?.instance_access });
  return {
    roleSlug: row?.role_slug ?? null,
    roleName: row?.role_name ?? null,
    roleId: row?.role_id ?? null,
    permissions: Array.isArray(row?.permissions) ? row.permissions : [],
    isAdmin: Boolean(row?.is_admin),
    instanceAccess: settings.instance_access,
  };
}

export async function fetchRolesWithPermissions(tenantId: string): Promise<TenantRole[]> {
  const { data, error } = await supabase.rpc('list_roles_with_permissions', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []).map((row: {
    role_id: string;
    slug: string;
    name: string;
    description: string | null;
    is_system: boolean;
    permission_slugs: string[];
  }) => ({
    roleId: row.role_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    permissionSlugs: row.permission_slugs ?? [],
  }));
}

export async function fetchAccessMembers(tenantId: string): Promise<TenantMemberRow[]> {
  const { data, error } = await supabase.rpc('list_tenant_members', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []).map((row: {
    user_id: string;
    email: string;
    name: string | null;
    avatar_url?: string | null;
    role_id: string;
    role_name: string;
    role_slug: string;
    status: string;
  }) => ({
    userId: row.user_id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url ?? null,
    roleId: row.role_id,
    roleName: row.role_name,
    roleSlug: row.role_slug,
    status: row.status as 'active' | 'disabled' | 'invited',
  }));
}

export async function fetchTenantInvites(tenantId: string): Promise<TenantInvite[]> {
  const { data, error } = await supabase.rpc('list_tenant_invites', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []).map((row: {
    id: string;
    email: string;
    full_name: string | null;
    invite_kind: string;
    role_name: string;
    role_slug: string;
    status: string;
    invited_by_email: string | null;
    expires_at: string;
    created_at: string;
  }) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    inviteKind: (row.invite_kind ?? 'link') as 'link' | 'provisioned',
    roleName: row.role_name,
    roleSlug: row.role_slug,
    status: row.status,
    invitedByEmail: row.invited_by_email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export async function inviteMember(
  tenantId: string,
  environment: string,
  email: string,
  roleId: string,
): Promise<{ inviteId: string; token: string; inviteUrl: string }> {
  const { data, error } = await supabase.rpc('invite_tenant_member', {
    p_tenant_id: tenantId,
    p_email: email,
    p_role_id: roleId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const token = row.token as string;
  const inviteId = row.invite_id as string;
  const inviteUrl = `${window.location.origin}/invite/${token}`;

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'tenant_member',
    resourceId: inviteId,
    resourceName: email,
    summary: `Invited ${email}`,
    metadata: { invite_url: inviteUrl },
  });

  return { inviteId, token, inviteUrl };
}

export async function updateMemberRole(
  tenantId: string,
  environment: string,
  userId: string,
  roleId: string,
  memberEmail: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_tenant_member_role', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_role_id: roleId,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'tenant_member',
    resourceId: userId,
    resourceName: memberEmail,
    summary: 'Updated member role',
  });
}

export async function createTenantRole(
  tenantId: string,
  environment: string,
  input: { name: string; description: string; permissionSlugs: string[] },
): Promise<string> {
  const { data, error } = await supabase.rpc('create_tenant_role', {
    p_tenant_id: tenantId,
    p_name: input.name,
    p_description: input.description,
    p_permission_slugs: input.permissionSlugs,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'role',
    resourceId: data as string,
    resourceName: input.name,
    summary: `Created role ${input.name}`,
    metadata: { permission_count: input.permissionSlugs.length },
  });

  return data as string;
}

export async function updateTenantRole(
  tenantId: string,
  environment: string,
  roleId: string,
  input: { name: string; description: string; permissionSlugs: string[] },
): Promise<void> {
  const { error } = await supabase.rpc('update_tenant_role', {
    p_tenant_id: tenantId,
    p_role_id: roleId,
    p_name: input.name,
    p_description: input.description,
    p_permission_slugs: input.permissionSlugs,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'role',
    resourceId: roleId,
    resourceName: input.name,
    summary: `Updated role ${input.name}`,
    metadata: { permission_count: input.permissionSlugs.length },
  });
}

export async function deleteTenantRole(
  tenantId: string,
  environment: string,
  roleId: string,
  roleName: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_tenant_role', {
    p_tenant_id: tenantId,
    p_role_id: roleId,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'role',
    resourceId: roleId,
    resourceName: roleName,
    summary: `Deleted role ${roleName}`,
  });
}

export async function disableMember(
  tenantId: string,
  environment: string,
  userId: string,
  memberEmail: string,
): Promise<void> {
  const { error } = await supabase.rpc('disable_tenant_member', {
    p_tenant_id: tenantId,
    p_user_id: userId,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'tenant_member',
    resourceId: userId,
    resourceName: memberEmail,
    summary: 'Disabled member access',
  });
}

export async function revokeInvite(
  tenantId: string,
  environment: string,
  inviteId: string,
  email: string,
): Promise<void> {
  const { error } = await supabase.rpc('revoke_tenant_invite', {
    p_tenant_id: tenantId,
    p_invite_id: inviteId,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'tenant_member',
    resourceId: inviteId,
    resourceName: email,
    summary: 'Revoked invitation',
  });
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('get_invite_by_token', { p_token: token });
  if (error) return null;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    valid: Boolean(row.valid),
    reason: row.reason as string | undefined,
    email: row.email as string | undefined,
    tenantName: row.tenant_name as string | undefined,
    roleName: row.role_name as string | undefined,
    expiresAt: row.expires_at as string | undefined,
  };
}

export async function acceptInvite(token: string): Promise<{ tenantId: string; roleSlug: string }> {
  const { data, error } = await supabase.rpc('accept_tenant_invite', { p_token: token });
  if (error) throw error;
  const row = data as { tenant_id: string; role_slug: string };
  return { tenantId: row.tenant_id, roleSlug: row.role_slug };
}

export async function fetchApiKeys(tenantId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase.rpc('list_api_keys', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []).map((row: {
    id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    environment: string;
    expires_at: string | null;
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
  }) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes ?? [],
    environment: row.environment,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));
}

export async function createApiKey(
  tenantId: string,
  environment: string,
  input: { name: string; environment?: string; scopes?: string[]; expiresDays?: number | null },
): Promise<{ id: string; apiKey: string; keyPrefix: string }> {
  const { data, error } = await supabase.rpc('create_api_key', {
    p_tenant_id: tenantId,
    p_name: input.name,
    p_environment: input.environment ?? environment,
    p_scopes: input.scopes ?? ['events:write'],
    p_expires_days: input.expiresDays ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'api_key',
    resourceId: row.id as string,
    resourceName: input.name,
    summary: `Created API key ${row.key_prefix}…`,
  });

  return {
    id: row.id as string,
    apiKey: row.api_key as string,
    keyPrefix: row.key_prefix as string,
  };
}

export async function updateApiKey(
  tenantId: string,
  environment: string,
  keyId: string,
  input: { name: string; scopes: string[]; expiresAt?: string | null },
): Promise<void> {
  const { error } = await supabase.rpc('update_api_key', {
    p_tenant_id: tenantId,
    p_key_id: keyId,
    p_name: input.name.trim(),
    p_scopes: input.scopes,
    p_expires_at: input.expiresAt ?? null,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'api_key',
    resourceId: keyId,
    resourceName: input.name,
    summary: 'Updated API key metadata',
  });
}

export async function revokeApiKey(
  tenantId: string,
  environment: string,
  keyId: string,
  keyName: string,
): Promise<void> {
  const { error } = await supabase.rpc('revoke_api_key', {
    p_tenant_id: tenantId,
    p_key_id: keyId,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'delete',
    resourceType: 'api_key',
    resourceId: keyId,
    resourceName: keyName,
    summary: 'Revoked API key',
  });
}

export async function createTenantUser(
  tenantId: string,
  environment: string,
  input: { email: string; fullName: string; roleId: string; password?: string },
): Promise<CreateTenantUserResult> {
  const payload: Record<string, string> = {
    tenant_id: tenantId,
    email: input.email.trim(),
    full_name: input.fullName.trim(),
    role_id: input.roleId,
  };
  if (input.password) {
    payload.password = input.password;
  }

  const result = await invokeFunction<{
    user_id: string;
    invite_id?: string;
    email: string;
    full_name: string;
    email_sent?: boolean;
    setup_link?: string | null;
    mode?: 'password' | 'setup_link';
    message: string;
  }>('create-tenant-user', payload);

  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'Failed to create user');
  }

  const data = result.data;
  const mode = data.mode ?? (input.password ? 'password' : 'setup_link');

  void logAudit({
    tenantId,
    environment,
    action: 'create',
    resourceType: 'tenant_member',
    resourceId: data.invite_id ?? data.user_id,
    resourceName: input.email,
    summary: mode === 'password'
      ? `Created user ${input.fullName.trim()} with admin-set password`
      : `Provisioned user ${input.fullName.trim()}`,
    metadata: { provision_mode: mode },
  });

  return {
    userId: data.user_id,
    inviteId: data.invite_id,
    email: data.email,
    fullName: data.full_name,
    emailSent: Boolean(data.email_sent),
    setupLink: data.setup_link ?? null,
    mode,
    message: data.message,
  };
}

export async function resetTenantUserPassword(
  tenantId: string,
  environment: string,
  input: { userId: string; memberEmail: string },
): Promise<{ message: string }> {
  const result = await invokeFunction<{ message: string }>('reset-tenant-user-password', {
    tenant_id: tenantId,
    user_id: input.userId,
  });

  if (!result.ok || !result.data) {
    throw new Error(result.error ?? 'Failed to send the reset link');
  }

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'tenant_member',
    resourceId: input.userId,
    resourceName: input.memberEmail,
    summary: 'Admin sent password reset link',
  });

  return { message: result.data.message };
}

export type { MemberAccountSettings, TenantMemberDetail } from './member-settings';

export async function fetchMemberDetail(
  tenantId: string,
  userId: string,
): Promise<TenantMemberDetail> {
  const { data, error } = await supabase.rpc('get_tenant_member_detail', {
    p_tenant_id: tenantId,
    p_user_id: userId,
  });
  if (error) throw error;

  const row = data as Record<string, unknown>;
  return {
    userId: row.user_id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    roleId: row.role_id as string,
    roleName: row.role_name as string,
    roleSlug: row.role_slug as string,
    status: row.status as 'active' | 'disabled' | 'invited',
    memberSince: row.member_since as string,
    settings: parseMemberSettings(row.settings),
  };
}

export async function updateMemberAccount(
  tenantId: string,
  environment: string,
  input: {
    userId: string;
    memberEmail: string;
    name: string;
    avatarUrl?: string | null;
    settings: MemberAccountSettings;
  },
): Promise<TenantMemberDetail> {
  const { data, error } = await supabase.rpc('update_tenant_member_account', {
    p_tenant_id: tenantId,
    p_user_id: input.userId,
    p_name: input.name.trim(),
    p_settings: memberSettingsToPayload(input.settings),
    p_avatar_url: input.avatarUrl ?? null,
  });
  if (error) throw error;

  void logAudit({
    tenantId,
    environment,
    action: 'update',
    resourceType: 'tenant_member',
    resourceId: input.userId,
    resourceName: input.memberEmail,
    summary: 'Updated member account settings',
  });

  const row = data as Record<string, unknown>;
  return {
    userId: row.user_id as string,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    roleId: row.role_id as string,
    roleName: row.role_name as string,
    roleSlug: row.role_slug as string,
    status: row.status as 'active' | 'disabled' | 'invited',
    memberSince: row.member_since as string,
    settings: parseMemberSettings(row.settings),
  };
}

export async function activateProvisionedMembership(tenantId?: string): Promise<void> {
  const { error } = await supabase.rpc('activate_provisioned_membership', {
    p_tenant_id: tenantId ?? null,
  });
  if (error) throw error;
}
