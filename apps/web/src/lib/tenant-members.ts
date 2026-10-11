import { supabase } from './supabase';

export type TenantMember = {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl?: string | null;
  roleName: string | null;
  roleId?: string;
  roleSlug?: string;
  status?: string;
};

export function memberDisplayLabel(member: Pick<TenantMember, 'name' | 'email'>): string {
  if (member.name?.trim()) return `${member.name.trim()} (${member.email})`;
  return member.email;
}

export async function fetchTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const { data, error } = await supabase.rpc('list_tenant_members', {
    p_tenant_id: tenantId,
  });

  if (error) {
    if (error.message.includes('list_tenant_members')) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((row: {
    user_id: string;
    email: string;
    name: string | null;
    avatar_url?: string | null;
    role_name: string | null;
    role_id?: string;
    role_slug?: string;
    status?: string;
  }) => ({
    userId: row.user_id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url ?? null,
    roleName: row.role_name,
    roleId: row.role_id,
    roleSlug: row.role_slug,
    status: row.status,
  }));
}

export function filterTenantMembers(members: TenantMember[], query: string): TenantMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter(
    (m) =>
      m.email.toLowerCase().includes(q) ||
      (m.name ?? '').toLowerCase().includes(q) ||
      (m.roleName ?? '').toLowerCase().includes(q),
  );
}
