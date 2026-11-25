// platform-admin — the ONLY backend for the Marbee Platform Console (D-016).
//
// Request:  POST { op: string, ...params }   Authorization: Bearer <user JWT>
// Gate (every request, in order):
//   1. Origin must be in CONSOLE_ORIGIN (comma-separated) for browser calls.
//   2. JWT verified with Supabase Auth (auth.getUser).
//   3. JWT must be MFA-verified (aal2).
//   4. Caller must have an ACTIVE row in public.platform_admins.
//   5. Per-admin rate limit.
//   6. `op` must be in the explicit allow-list below; owner-only ops checked.
// Only after the gate passes is the service-role client used. Every mutating
// op writes public.platform_audit_log. End-customer PII is never returned.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in), CONSOLE_ORIGIN, APP_URL.
// Deploy with JWT verification ON (default).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Json = Record<string, unknown>;
type Admin = { user_id: string; email: string; role: 'owner' | 'operator' };
type Ctx = { admin: Admin; db: SupabaseClient; ip: string | null; ua: string | null };
type Handler = (ctx: Ctx, p: Json) => Promise<unknown>;

// Exact scheme+host+port matches only; surrounding quotes/spaces, trailing slashes and case are ignored.
const normOrigin = (s: string) => s.trim().replace(/^["']+|["']+$/g, '').trim().replace(/\/+$/, '').toLowerCase();
const ALLOWED_ORIGINS = (Deno.env.get('CONSOLE_ORIGIN') ?? '')
  .split(',').map(normOrigin).filter(Boolean);
const originAllowed = (origin: string | null) => !!origin && ALLOWED_ORIGINS.includes(normOrigin(origin));
if (ALLOWED_ORIGINS.length === 0) console.error('CONSOLE_ORIGIN secret is not set — all browser requests will be refused');
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const LARGE_GRANT = 10_000;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ----------------------------------------------------------------------------
// HTTP helpers
// ----------------------------------------------------------------------------
function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (originAllowed(origin)) h['Access-Control-Allow-Origin'] = origin!;
  return h;
}

function reply(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(p: Json, key: string): string {
  const v = p[key];
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, `${key} must be a UUID`);
  return v.toLowerCase();
}
function num(p: Json, key: string, min: number, max: number): number {
  const v = typeof p[key] === 'string' ? Number(p[key]) : p[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new HttpError(400, `${key} must be a number between ${min} and ${max}`);
  }
  return Math.round(v * 100) / 100;
}
function str(p: Json, key: string, max: number, required = false): string | null {
  const v = p[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${key} is required`);
    return null;
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, `${key} must be text up to ${max} characters`);
  return v.trim();
}
function oneOf<T extends string>(p: Json, key: string, values: readonly T[]): T {
  const v = p[key];
  if (typeof v !== 'string' || !values.includes(v as T)) throw new HttpError(400, `${key} must be one of ${values.join(', ')}`);
  return v as T;
}
function month(p: Json): string {
  const v = p.month;
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new HttpError(400, 'month must be YYYY-MM');
  return `${v}-01`;
}
function limit(p: Json, def = 50, max = 200): number {
  const v = p.limit === undefined ? def : Number(p.limit);
  if (!Number.isInteger(v) || v < 1 || v > max) throw new HttpError(400, `limit must be 1–${max}`);
  return v;
}
function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    console.error('db error', res.error.message);
    throw new HttpError(500, 'Database error');
  }
  return res.data;
}
function ownerOnly(ctx: Ctx) {
  if (ctx.admin.role !== 'owner') throw new HttpError(403, 'Owner role required');
}

// ----------------------------------------------------------------------------
// Audit
// ----------------------------------------------------------------------------
async function audit(ctx: Ctx, action: string, tenantId: string | null, target: string | null, details: Json) {
  const { error } = await ctx.db.from('platform_audit_log').insert({
    actor_id: ctx.admin.user_id,
    actor_email: ctx.admin.email,
    action,
    tenant_id: tenantId,
    target,
    details,
    ip: ctx.ip,
    user_agent: ctx.ua?.slice(0, 300) ?? null,
  });
  // An action we can't audit must not be reported as done.
  if (error) {
    console.error('audit insert failed', error.message);
    throw new HttpError(500, 'Audit log write failed — action may need manual review');
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Escape LIKE wildcards so an ILIKE matches the text exactly (case-insensitively). */
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);

function ownerContact(p: Json): { email: string; name: string } {
  const email = str(p, 'owner_email', 254, true)!.toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'owner_email is not a valid email');
  const name = str(p, 'owner_name', 120, true)!;
  if (name.length < 2) throw new HttpError(400, 'owner_name must be at least 2 characters');
  return { email, name };
}

/**
 * Invite (or re-invite) a workspace's owner as Tenant Admin — same rules as create-tenant-user
 * (SEC-12): new people get Supabase's invite email; existing accounts are linked and emailed a
 * join link. No link or password is ever returned to the console.
 */
async function inviteOwner(ctx: Ctx, tenantId: string, owner: { email: string; name: string }) {
  if (!APP_URL) throw new HttpError(500, 'APP_URL secret is not set');
  const role = must(await ctx.db.from('roles').select('id')
    .eq('tenant_id', tenantId).eq('slug', 'tenant_admin').maybeSingle()) as { id: string } | null;
  if (!role) throw new HttpError(409, 'This workspace has no Tenant Admin role');
  const redirectTo = `${APP_URL}/setup-password?tenant=${tenantId}&email=${encodeURIComponent(owner.email)}`;

  const prof = must(await ctx.db.from('profiles').select('id')
    .ilike('email', escapeLike(owner.email)).maybeSingle()) as { id: string } | null;
  let userId = prof?.id;
  let created = false;
  if (userId) {
    const member = must(await ctx.db.from('tenant_users').select('status')
      .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle()) as { status: string } | null;
    if (member?.status === 'active') throw new HttpError(409, `${owner.email} is already an active member of this workspace`);
  } else {
    const { data, error } = await ctx.db.auth.admin.inviteUserByEmail(owner.email, {
      data: { name: owner.name, full_name: owner.name }, redirectTo,
    });
    if (error || !data?.user) {
      console.error('owner invite failed', error?.message);
      throw new HttpError(502, 'Could not send the invitation email — check the project\'s SMTP settings and Redirect URLs');
    }
    userId = data.user.id;
    created = true;
  }

  const { error: linkErr } = await ctx.db.rpc('link_provisioned_tenant_user', {
    p_tenant_id: tenantId, p_auth_user_id: userId, p_email: owner.email, p_full_name: owner.name,
    p_role_id: role.id, p_invited_by: ctx.admin.user_id, p_invite_token: null,
  });
  if (linkErr) {
    console.error('owner link failed', linkErr.message);
    if (created) await ctx.db.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new HttpError(500, 'Could not add the owner to the workspace');
  }
  if (!created) {
    const { error } = await ctx.db.auth.resetPasswordForEmail(owner.email, { redirectTo });
    if (error) {
      console.error('owner join email failed', error.message);
      throw new HttpError(502, 'Owner was added but the join email could not be sent — use "Resend invite"');
    }
  }
  return { user_id: userId, existing_account: !created };
}

async function tenantOr404(ctx: Ctx, tenantId: string) {
  const t = must(await ctx.db.from('tenants').select('id, name, slug, plan, status, created_at, updated_at')
    .eq('id', tenantId).maybeSingle());
  if (!t) throw new HttpError(404, 'Tenant not found');
  return t as { id: string; name: string; slug: string; plan: string; status: string; created_at: string };
}

// ----------------------------------------------------------------------------
// Operations (explicit allow-list)
// ----------------------------------------------------------------------------
const ops: Record<string, Handler> = {
  me: async (ctx) => ({ admin: ctx.admin }),

  list_tenants: async (ctx) => {
    const [tenants, accounts, stats, wallets] = await Promise.all([
      ctx.db.from('tenants').select('id, name, slug, plan, status, created_at').order('created_at', { ascending: false }).limit(2000),
      ctx.db.from('platform_tenant_accounts').select('tenant_id, region, monthly_fee_inr'),
      ctx.db.from('platform_tenant_stats').select('tenant_id, users_total, users_active, profiles_total, events_30d, deliveries_30d, est_bytes, refreshed_at'),
      ctx.db.from('credit_wallets').select('tenant_id, allowance_balance, topup_balance, monthly_allowance, overdraft_limit'),
    ]);
    const byId = <T extends { tenant_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.tenant_id, r]));
    const acc = byId(must(accounts) ?? []);
    const st = byId(must(stats) ?? []);
    const wl = byId(must(wallets) ?? []);
    return {
      tenants: (must(tenants) ?? []).map((t) => ({
        ...t,
        account: acc.get(t.id) ?? null,
        stats: st.get(t.id) ?? null,
        wallet: wl.get(t.id) ?? null,
      })),
    };
  },

  get_tenant: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    const tenant = await tenantOr404(ctx, tenantId);
    const [account, stats, wallet, envs] = await Promise.all([
      ctx.db.from('platform_tenant_accounts').select('*').eq('tenant_id', tenantId).maybeSingle(),
      ctx.db.from('platform_tenant_stats').select('*').eq('tenant_id', tenantId).maybeSingle(),
      ctx.db.from('credit_wallets').select('*').eq('tenant_id', tenantId).maybeSingle(),
      ctx.db.from('environments').select('*').eq('tenant_id', tenantId),
    ]);
    return {
      tenant,
      account: must(account),
      stats: must(stats),
      wallet: must(wallet),
      environments: envs.error ? [] : envs.data,
    };
  },

  refresh_stats: async (ctx, p) => {
    const tenantId = p.tenant_id === undefined ? null : uuid(p, 'tenant_id');
    const n = must(await ctx.db.rpc('platform_refresh_tenant_stats', { p_tenant_id: tenantId }));
    return { refreshed: n };
  },

  tenant_usage: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    await tenantOr404(ctx, tenantId);
    return must(await ctx.db.rpc('platform_tenant_usage', { p_tenant_id: tenantId, p_month: month(p) }));
  },

  list_ledger: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    let q = ctx.db.from('credit_ledger')
      .select('id, created_at, entry_type, bucket, amount, allowance_after, topup_after, service, quantity, transactional, reason, actor_id, expires_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limit(p));
    const before = str(p, 'before', 40);
    if (before) q = q.lt('created_at', before);
    return { entries: must(await q) };
  },

  grant_credits: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    const tenant = await tenantOr404(ctx, tenantId);
    const amount = num(p, 'amount', -10_000_000, 10_000_000);
    if (amount === 0) throw new HttpError(400, 'amount must not be zero');
    const bucket = oneOf(p, 'bucket', ['allowance', 'topup'] as const);
    const reason = str(p, 'reason', 500, true)!;
    if (reason.length < 3) throw new HttpError(400, 'reason is required');
    const key = str(p, 'idempotency_key', 100, true)!;
    if (amount < 0) ownerOnly(ctx);
    if (Math.abs(amount) > LARGE_GRANT && p.confirm !== tenant.slug) {
      throw new HttpError(400, `Amounts above ${LARGE_GRANT.toLocaleString('en-IN')} need confirm = tenant slug`);
    }
    const result = must(await ctx.db.rpc('credit_adjust', {
      p_tenant_id: tenantId, p_amount: amount, p_bucket: bucket, p_reason: reason,
      p_actor_id: ctx.admin.user_id, p_idempotency_key: `console:${key}`,
    })) as Json;
    if (!result?.duplicate) await audit(ctx, amount > 0 ? 'credits.grant' : 'credits.adjust', tenantId, bucket, { amount, reason, result });
    return result;
  },

  set_credit_plan: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    await tenantOr404(ctx, tenantId);
    const allowance = num(p, 'monthly_allowance', 0, 10_000_000);
    const overdraft = num(p, 'overdraft_limit', 0, 1_000_000);
    const before = must(await ctx.db.from('credit_wallets').select('monthly_allowance, overdraft_limit').eq('tenant_id', tenantId).maybeSingle());
    const after = must(await ctx.db.rpc('credit_set_plan', {
      p_tenant_id: tenantId, p_monthly_allowance: allowance, p_overdraft_limit: overdraft,
    }));
    await audit(ctx, 'credits.set_plan', tenantId, null, { before, after: { monthly_allowance: allowance, overdraft_limit: overdraft } });
    return after;
  },

  // D-017: create a complete empty workspace, then invite its owner as Tenant Admin.
  // The workspace is kept even if the email fails — the console offers "Resend invite".
  create_tenant: async (ctx, p) => {
    ownerOnly(ctx);
    const name = str(p, 'name', 120, true)!;
    const slug = str(p, 'slug', 48, true)!.toLowerCase();
    const plan = oneOf(p, 'plan', ['starter', 'growth', 'enterprise'] as const);
    const status = oneOf(p, 'status', ['trial', 'active'] as const);
    const region = oneOf(p, 'region', ['in', 'mena', 'apac', 'emea', 'na'] as const);
    const owner = ownerContact(p);

    const { data, error } = await ctx.db.rpc('platform_provision_tenant', {
      p_name: name, p_slug: slug, p_plan: plan, p_status: status, p_region: region,
    });
    if (error) {
      // Validation messages from the SQL function are safe and useful; anything else is not shown.
      console.error('provision failed', error.message);
      // Two simultaneous creates with one slug: the loser hits the unique index, not the check.
      if (/already exists|tenants_slug_key/.test(error.message)) {
        throw new HttpError(409, `A workspace with slug "${slug}" already exists`);
      }
      const known = /reserved|Slug must be|name must be|Plan must be|trial or active|Region must be/.test(error.message);
      throw new HttpError(known ? 400 : 500, known ? error.message : 'Could not create the workspace');
    }
    const created = data as { tenant_id: string; slug: string; roles: number; schemas: number; fields: number };
    await audit(ctx, 'tenant.create', created.tenant_id, slug, { name, plan, status, region, owner_email: owner.email, provisioned: created });

    let invite: { sent: boolean; existing_account?: boolean; error?: string; audit_failed?: boolean };
    let invited: { user_id: string; existing_account: boolean } | null = null;
    try {
      invited = await inviteOwner(ctx, created.tenant_id, owner);
      invite = { sent: true, existing_account: invited.existing_account };
    } catch (e) {
      invite = { sent: false, error: e instanceof HttpError ? e.message : 'Invitation failed' };
    }
    // Audited separately (Codex, PR #4): an audit failure must not read as "invite failed",
    // which would prompt a resend and a duplicate email.
    if (invited) {
      try {
        await audit(ctx, 'member.invite_owner', created.tenant_id, invited.user_id, { email: owner.email, existing_account: invited.existing_account });
      } catch {
        invite.audit_failed = true;
      }
    }
    return { tenant_id: created.tenant_id, slug: created.slug, provisioned: created, invite };
  },

  invite_owner: async (ctx, p) => {
    ownerOnly(ctx);
    const tenantId = uuid(p, 'tenant_id');
    const tenant = await tenantOr404(ctx, tenantId);
    if (tenant.status === 'suspended') throw new HttpError(409, 'Workspace is suspended — reactivate it first');
    const owner = ownerContact(p);
    const r = await inviteOwner(ctx, tenantId, owner);
    let auditFailed = false;
    try {
      await audit(ctx, 'member.invite_owner', tenantId, r.user_id, { email: owner.email, existing_account: r.existing_account });
    } catch {
      auditFailed = true; // the email already went out — say so instead of inviting a resend
    }
    return { sent: true, existing_account: r.existing_account, audit_failed: auditFailed };
  },

  set_tenant_status: async (ctx, p) => {
    ownerOnly(ctx);
    const tenantId = uuid(p, 'tenant_id');
    const tenant = await tenantOr404(ctx, tenantId);
    const status = oneOf(p, 'status', ['active', 'suspended', 'trial'] as const);
    if (status === 'suspended' && p.confirm !== tenant.slug) throw new HttpError(400, 'Suspending needs confirm = tenant slug');
    const reason = str(p, 'reason', 500, status === 'suspended');
    must(await ctx.db.from('tenants').update({ status }).eq('id', tenantId));
    await audit(ctx, 'tenant.set_status', tenantId, null, { before: tenant.status, after: status, reason });
    return { status };
  },

  set_tenant_plan: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    const tenant = await tenantOr404(ctx, tenantId);
    const plan = oneOf(p, 'plan', ['starter', 'growth', 'enterprise'] as const);
    must(await ctx.db.from('tenants').update({ plan }).eq('id', tenantId));
    await audit(ctx, 'tenant.set_plan', tenantId, null, { before: tenant.plan, after: plan });
    return { plan };
  },

  update_account: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    await tenantOr404(ctx, tenantId);
    const patch: Json = { tenant_id: tenantId, updated_at: new Date().toISOString() };
    if (p.region !== undefined) patch.region = oneOf(p, 'region', ['in', 'mena', 'apac', 'emea', 'na'] as const);
    if (p.monthly_fee_inr !== undefined) patch.monthly_fee_inr = num(p, 'monthly_fee_inr', 0, 100_000_000);
    if (p.billing_email !== undefined) {
      const e = str(p, 'billing_email', 254);
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'billing_email is not a valid email');
      patch.billing_email = e;
    }
    if (p.gstin !== undefined) {
      const g = str(p, 'gstin', 15)?.toUpperCase() ?? null;
      if (g && !/^[0-9]{2}[A-Z0-9]{13}$/.test(g)) throw new HttpError(400, 'gstin must be 15 characters');
      patch.gstin = g;
    }
    for (const k of ['legal_name', 'billing_address', 'notes'] as const) {
      if (p[k] !== undefined) patch[k] = str(p, k, k === 'legal_name' ? 200 : 1000);
    }
    const before = must(await ctx.db.from('platform_tenant_accounts').select('*').eq('tenant_id', tenantId).maybeSingle());
    const after = must(await ctx.db.from('platform_tenant_accounts').upsert(patch).select('*').single());
    await audit(ctx, 'tenant.update_account', tenantId, null, { before, after });
    return after;
  },

  list_members: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    await tenantOr404(ctx, tenantId);
    // tenant_users has no FK to profiles (both reference auth.users), so join in code.
    const rows = must(await ctx.db.from('tenant_users')
      .select('user_id, status, created_at, roles(name, slug)')
      .eq('tenant_id', tenantId).order('created_at').limit(500)) as Json[];
    const ids = (rows ?? []).map((r) => r.user_id as string);
    const profiles = ids.length
      ? (must(await ctx.db.from('profiles').select('id, email, name, last_login_at').in('id', ids)) as Json[])
      : [];
    const profById = new Map(profiles.map((pr) => [pr.id as string, pr]));
    return {
      members: (rows ?? []).map((r) => {
        const role = r.roles as Json | null;
        const prof = profById.get(r.user_id as string) ?? null;
        return {
          user_id: r.user_id, status: r.status, created_at: r.created_at,
          role: role?.name ?? null, role_slug: role?.slug ?? null,
          email: prof?.email ?? null, name: prof?.name ?? null, last_login_at: prof?.last_login_at ?? null,
        };
      }),
    };
  },

  // Sends Supabase's recovery email to the member. The console never sets or sees a password.
  send_password_reset: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    const userId = uuid(p, 'user_id');
    await tenantOr404(ctx, tenantId);
    const member = must(await ctx.db.from('tenant_users').select('user_id')
      .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle()) as Json | null;
    const prof = member
      ? (must(await ctx.db.from('profiles').select('email').eq('id', userId).maybeSingle()) as Json | null)
      : null;
    const email = prof?.email as string | undefined;
    if (!member || !email) throw new HttpError(404, 'Member not found in this tenant');
    if (!APP_URL) throw new HttpError(500, 'APP_URL secret is not set');
    const { error } = await ctx.db.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/setup-password` });
    if (error) {
      console.error('reset email failed', error.message);
      throw new HttpError(502, 'Could not send the reset email');
    }
    await audit(ctx, 'member.send_password_reset', tenantId, userId, {});
    return { sent: true };
  },

  bill_summary: async (ctx, p) => {
    const tenantId = uuid(p, 'tenant_id');
    const tenant = await tenantOr404(ctx, tenantId);
    const m = month(p);
    const [account, usage, rates] = await Promise.all([
      ctx.db.from('platform_tenant_accounts').select('*').eq('tenant_id', tenantId).maybeSingle(),
      ctx.db.rpc('platform_tenant_usage', { p_tenant_id: tenantId, p_month: m }),
      ctx.db.from('credit_rate_card').select('*').order('service'),
    ]);
    const acc = must(account) as Json | null;
    const use = must(usage) as Json;
    const moves = (use?.credit_movements ?? {}) as Json;
    const planFee = Number(acc?.monthly_fee_inr ?? 0);
    const topups = Number(moves.topup_granted ?? 0);
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
      account: acc,
      month: m.slice(0, 7),
      lines: [
        { label: `Platform fee — ${tenant.plan} plan`, amount_inr: planFee },
        { label: 'Credit top-ups granted this month (1 credit = ₹1)', amount_inr: topups },
      ],
      subtotal_inr: Math.round((planFee + topups) * 100) / 100,
      gst_note: 'GST is added by the invoicing system (Razorpay / Zoho Books).',
      usage: use,
      rate_card: must(rates),
    };
  },

  rate_card: async (ctx) => ({ rates: must(await ctx.db.from('credit_rate_card').select('*').order('service')) }),

  set_rate: async (ctx, p) => {
    ownerOnly(ctx);
    const service = str(p, 'service', 50, true)!;
    const credits = num(p, 'credits_per_unit', 0, 100_000);
    const before = must(await ctx.db.from('credit_rate_card').select('*').eq('service', service).maybeSingle());
    if (!before) throw new HttpError(404, 'Unknown service');
    const after = must(await ctx.db.from('credit_rate_card')
      .update({ credits_per_unit: credits, updated_at: new Date().toISOString() }).eq('service', service).select('*').single());
    await audit(ctx, 'rates.set', null, service, { before, after });
    return after;
  },

  audit_log: async (ctx, p) => {
    let q = ctx.db.from('platform_audit_log').select('*').order('created_at', { ascending: false }).limit(limit(p, 100, 500));
    if (p.tenant_id !== undefined) q = q.eq('tenant_id', uuid(p, 'tenant_id'));
    return { entries: must(await q) };
  },
};

// ----------------------------------------------------------------------------
// Rate limit (per admin, per isolate — a backstop, not the primary control)
// ----------------------------------------------------------------------------
const hits = new Map<string, number[]>();
function rateLimited(userId: string, max = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > max;
}

function jwtPayload(token: string): Json {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------------------
// Entry
// ----------------------------------------------------------------------------
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return reply(origin, { error: 'Method not allowed' }, 405);
  if (origin && ALLOWED_ORIGINS.length === 0) {
    return reply(origin, { error: 'Console origin not configured (CONSOLE_ORIGIN secret missing)' }, 503);
  }
  if (origin && !originAllowed(origin)) return reply(origin, { error: 'Origin not allowed' }, 403);

  try {
    const authz = req.headers.get('authorization') ?? '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
    if (!token) throw new HttpError(401, 'Not signed in');

    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. Verify the token with Auth (signature, expiry, revocation).
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData?.user) throw new HttpError(401, 'Session is invalid or expired');
    const user = userData.user;

    // 3. MFA. Safe to read claims now that Auth has validated this exact token.
    if (jwtPayload(token).aal !== 'aal2') throw new HttpError(403, 'Two-factor verification required');

    // 4. Platform admin allow-list.
    const { data: admin, error: adminErr } = await db.from('platform_admins')
      .select('user_id, email, role, status').eq('user_id', user.id).maybeSingle();
    if (adminErr) throw new HttpError(500, 'Database error');
    if (!admin || admin.status !== 'active') throw new HttpError(403, 'Not a platform admin');

    // 5. Rate limit.
    if (rateLimited(user.id)) throw new HttpError(429, 'Too many requests — slow down');

    // 6. Dispatch.
    const body = (await req.json().catch(() => null)) as Json | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'JSON body required');
    const op = typeof body.op === 'string' ? body.op : '';
    const handler = Object.prototype.hasOwnProperty.call(ops, op) ? ops[op] : undefined;
    if (!handler) throw new HttpError(400, 'Unknown operation');

    const ctx: Ctx = {
      admin: { user_id: admin.user_id, email: admin.email, role: admin.role },
      db,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      ua: req.headers.get('user-agent'),
    };
    return reply(origin, { data: await handler(ctx, body) });
  } catch (e) {
    if (e instanceof HttpError) return reply(origin, { error: e.message }, e.status);
    console.error('platform-admin unhandled', e instanceof Error ? e.message : e);
    return reply(origin, { error: 'Internal error' }, 500);
  }
});
