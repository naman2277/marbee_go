// Paste into Supabase Dashboard → Edge Functions → create-tenant-user → Deploy
// Settings: turn OFF "Enforce JWT Verification"
// Secrets: APP_URL = https://your-marbee-app-domain (must match Auth → URL Configuration redirect allow list)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-environment',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

function rpcHint(message: string): string {
  if (
    message.includes('user_has_permission_as')
    || message.includes('link_provisioned_tenant_user')
    || message.includes('invite_kind')
    || message.includes('full_name')
    || message.includes('link_active_tenant_user')
  ) {
    return `${message} — Run supabase/sql/38_provisioned_users.sql and 40_admin_password_provision.sql in the SQL editor.`;
  }
  return message;
}

function authHint(message: string, redirectTo: string): string {
  if (
    message.toLowerCase().includes('redirect')
    || message.toLowerCase().includes('url')
  ) {
    return `${message} Add this URL under Authentication → URL Configuration → Redirect URLs: ${redirectTo}`;
  }
  return message;
}

type CreateUserBody = {
  tenant_id: string;
  email: string;
  full_name: string;
  role_id: string;
  password?: string;
};

function validatePassword(password: string, email?: string): string | null {
  if (!password || password.length < 12) return 'Password must be at least 12 characters';
  if (password.length > 128) return 'Password must be 128 characters or fewer';
  if (!/[A-Z]/.test(password)) return 'Include at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Include at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Include at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Include at least one special character';
  if (email) {
    const e = email.toLowerCase();
    const local = e.split('@')[0] ?? '';
    if (password.toLowerCase() === e) return 'Password must not be your email address';
    if (local.length >= 3 && password.toLowerCase().includes(local)) return 'Password must not contain your email';
  }
  return null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuid(value: string): boolean {
  // Accept standard UUID shape (includes demo tenant 00000000-0000-0000-0000-000000000001)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return err('Method not allowed', 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const appUrl = Deno.env.get('APP_URL') ?? Deno.env.get('SITE_URL') ?? 'http://localhost:5173';

    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return err('Edge function missing Supabase env vars (URL, ANON_KEY, SERVICE_ROLE_KEY)', 500);
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return err('Missing authorization', 401);
    }

    const jwt = authHeader.slice(7);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData.user) {
      return err(userError?.message ?? 'Invalid session', 401);
    }

    let body: CreateUserBody;
    try {
      body = (await req.json()) as CreateUserBody;
    } catch {
      return err('Invalid JSON body');
    }

    const tenantId = body.tenant_id?.trim();
    const email = body.email?.trim().toLowerCase();
    const fullName = body.full_name?.trim();
    const roleId = body.role_id?.trim();
    const password = body.password?.trim() ?? '';

    if (!tenantId || !email || !fullName || !roleId) {
      return err('tenant_id, email, full_name, and role_id are required');
    }

    if (!isUuid(tenantId) || !isUuid(roleId)) {
      return err('tenant_id and role_id must be valid UUIDs');
    }

    if (!isValidEmail(email)) {
      return err('Invalid email address');
    }

    if (fullName.length < 2 || fullName.length > 120) {
      return err('Full name must be between 2 and 120 characters');
    }

    const service = createClient(supabaseUrl, serviceKey);
    const redirectTo =
      `${appUrl.replace(/\/$/, '')}/setup-password?tenant=${tenantId}&email=${encodeURIComponent(email)}`;

    const { data: canManage, error: manageErr } = await service.rpc('user_has_permission_as', {
      p_user_id: userData.user.id,
      p_tenant_id: tenantId,
      p_permission: 'access.manage',
    });
    if (manageErr) return err(rpcHint(manageErr.message), 500);

    const { data: canInvite, error: invitePermErr } = await service.rpc('user_has_permission_as', {
      p_user_id: userData.user.id,
      p_tenant_id: tenantId,
      p_permission: 'access.invite',
    });
    if (invitePermErr) return err(rpcHint(invitePermErr.message), 500);

    if (!canManage && !canInvite) {
      return err('Permission denied — your role needs access.invite or access.manage', 403);
    }

    if (password && !canManage) {
      return err('Permission denied — access.manage required to set a password', 403);
    }

    const { data: profileRow } = await service
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    const existingUserId = profileRow?.id as string | undefined;

    if (existingUserId) {
      const { data: activeMember } = await service
        .from('tenant_users')
        .select('status')
        .eq('tenant_id', tenantId)
        .eq('user_id', existingUserId)
        .maybeSingle();

      if (activeMember?.status === 'active') {
        return err('User is already an active member in this workspace.');
      }
    }

    if (password) {
      const pwError = validatePassword(password, email);
      if (pwError) return err(pwError);

      let authUserId: string;

      if (existingUserId) {
        const { error: updateErr } = await service.auth.admin.updateUserById(existingUserId, {
          password,
          email_confirm: true,
          user_metadata: { name: fullName, full_name: fullName },
        });
        if (updateErr) return err(updateErr.message, 500);
        authUserId = existingUserId;
      } else {
        const { data: createData, error: createError } = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: fullName, full_name: fullName },
        });
        if (createError || !createData.user) {
          return err(createError?.message ?? 'Failed to create auth user', 500);
        }
        authUserId = createData.user.id;
      }

      const { error: activeLinkErr } = await service.rpc('link_active_tenant_user', {
        p_tenant_id: tenantId,
        p_auth_user_id: authUserId,
        p_email: email,
        p_full_name: fullName,
        p_role_id: roleId,
        p_created_by: userData.user.id,
      });

      if (activeLinkErr) {
        if (!existingUserId) {
          await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
        }
        return err(rpcHint(activeLinkErr.message), 500);
      }

      return json({
        success: true,
        mode: 'password',
        user_id: authUserId,
        email,
        full_name: fullName,
        message:
          'User is ready to sign in. Share the email and password securely — the password cannot be viewed again.',
      });
    }

    let authUserId: string;
    let setupLink: string | null = null;
    let emailSent = false;

    if (existingUserId) {
      const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo,
          data: { name: fullName, full_name: fullName },
        },
      });

      if (linkError || !linkData.user) {
        return err(authHint(linkError?.message ?? 'Failed to generate password setup link', redirectTo), 500);
      }

      authUserId = linkData.user.id;
      setupLink = linkData.properties?.action_link ?? null;
    } else {
      const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
        data: { name: fullName, full_name: fullName },
        redirectTo,
      });

      if (inviteError || !inviteData.user) {
        const { data: createData, error: createError } = await service.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: { name: fullName, full_name: fullName },
        });

        if (createError || !createData.user) {
          const msg = inviteError?.message ?? createError?.message ?? 'Failed to create auth user';
          return err(authHint(msg, redirectTo), 500);
        }

        authUserId = createData.user.id;

        const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { redirectTo, data: { name: fullName, full_name: fullName } },
        });

        if (linkError) {
          await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
          return err(authHint(linkError.message, redirectTo), 500);
        }

        setupLink = linkData.properties?.action_link ?? null;
      } else {
        authUserId = inviteData.user.id;
        emailSent = true;
        setupLink = inviteData.properties?.action_link ?? null;
      }
    }

    const { data: inviteId, error: linkError } = await service.rpc('link_provisioned_tenant_user', {
      p_tenant_id: tenantId,
      p_auth_user_id: authUserId,
      p_email: email,
      p_full_name: fullName,
      p_role_id: roleId,
      p_invited_by: userData.user.id,
      p_invite_token: null,
    });

    if (linkError) {
      if (!existingUserId) {
        await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
      }
      return err(rpcHint(linkError.message), 500);
    }

    return json({
      success: true,
      user_id: authUserId,
      invite_id: inviteId,
      email,
      full_name: fullName,
      email_sent: emailSent && !setupLink,
      setup_link: setupLink,
      message: setupLink
        ? 'User created. Copy the setup link below (or configure Supabase SMTP to email it automatically).'
        : 'User created. A password setup email was sent.',
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Unknown error', 500);
  }
});
