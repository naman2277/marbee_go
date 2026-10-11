// Shared password rules — mirrors apps/web/src/lib/password-policy.ts
// Never log or return passwords from edge functions.

export function validatePassword(password: string, email?: string): string | null {
  if (!password || password.length < 12) return 'Password must be at least 12 characters';
  if (password.length > 128) return 'Password must be 128 characters or fewer';
  if (!/[A-Z]/.test(password)) return 'Include at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Include at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Include at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Include at least one special character';

  const normalized = password.toLowerCase();
  const common = new Set(['password', 'password123', '12345678', 'admin123', 'welcome123']);
  if (common.has(normalized)) return 'Password is too common';

  if (email) {
    const e = email.toLowerCase();
    const local = e.split('@')[0] ?? '';
    if (normalized === e) return 'Password must not be your email address';
    if (local.length >= 3 && normalized.includes(local)) return 'Password must not contain your email';
  }

  return null;
}

export async function requireManagePermission(
  service: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2').createClient>,
  actorId: string,
  tenantId: string,
): Promise<string | null> {
  const { data: allowed, error } = await service.rpc('user_has_permission_as', {
    p_user_id: actorId,
    p_tenant_id: tenantId,
    p_permission: 'access.manage',
  });
  if (error) return error.message;
  if (!allowed) return 'Permission denied — access.manage required';
  return null;
}
