import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err('Method not allowed', 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return err('Missing authorization', 401);

    const jwt = authHeader.slice(7);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: actor, error: actorErr } = await userClient.auth.getUser(jwt);
    if (actorErr || !actor.user) return err('Invalid session', 401);

    const body = await req.json() as {
      tenant_id?: string;
      user_id?: string;
      password?: string;
    };

    const tenantId = body.tenant_id?.trim();
    const userId = body.user_id?.trim();
    const password = body.password ?? '';

    if (!tenantId || !userId || !password) {
      return err('tenant_id, user_id, and password are required');
    }

    if (!isUuid(tenantId) || !isUuid(userId)) {
      return err('tenant_id and user_id must be valid UUIDs');
    }

    if (userId === actor.user.id) {
      return err('Use your profile settings to change your own password');
    }

    const service = createClient(supabaseUrl, serviceKey);

    const { data: allowed } = await service.rpc('user_has_permission_as', {
      p_user_id: actor.user.id,
      p_tenant_id: tenantId,
      p_permission: 'access.manage',
    });

    if (!allowed) return err('Permission denied — access.manage required', 403);

    const { data: member } = await service
      .from('tenant_users')
      .select('status, role_id, profiles(email)')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member || member.status === 'disabled') {
      return err('Member not found in this workspace');
    }

    const profile = member.profiles as { email?: string } | { email?: string }[] | null;
    const memberEmail = Array.isArray(profile) ? profile[0]?.email : profile?.email;

    const pwError = validatePassword(password, memberEmail ?? undefined);
    if (pwError) return err(pwError);

    const { error: updateErr } = await service.auth.admin.updateUserById(userId, {
      password,
    });

    if (updateErr) return err(updateErr.message, 500);

    if (member.status === 'invited' && member.role_id && memberEmail) {
      await service.rpc('link_active_tenant_user', {
        p_tenant_id: tenantId,
        p_auth_user_id: userId,
        p_email: memberEmail,
        p_full_name: '',
        p_role_id: member.role_id,
        p_created_by: actor.user.id,
      });
    }

    return json({
      success: true,
      message: 'Password updated. Share the new password securely with the user — it cannot be viewed again.',
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Unknown error', 500);
  }
});
