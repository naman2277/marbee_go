// DEV-ONLY UI harness. Loaded by main.tsx only when `vite dev` runs with
// VITE_CONSOLE_MOCK=1; the import is dead code in production builds.
// It fakes a signed-in MFA session and answers platform-admin calls with sample data.
// Nothing here is a real credential or real customer data.

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const userId = '00000000-0000-4000-8000-00000000c0de';
const token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: userId, aal: 'aal2', exp: now + 86400, role: 'authenticated', amr: [{ method: 'totp', timestamp: now }] })}.mock`;

sessionStorage.setItem('marbee-console-auth', JSON.stringify({
  access_token: token, refresh_token: 'mock', token_type: 'bearer', expires_in: 86400, expires_at: now + 86400,
  user: { id: userId, email: 'ceo@marbee.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
    factors: [{ id: 'f1', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }], created_at: '' },
}));

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const tenants = [
  { id: T1, name: 'Urban Threads', slug: 'urban-threads', plan: 'growth', status: 'active', created_at: '2026-11-02T10:00:00Z',
    account: { tenant_id: T1, region: 'in', monthly_fee_inr: 24999, billing_email: 'accounts@urbanthreads.test', legal_name: 'Urban Threads Pvt Ltd', gstin: '27ABCDE1234F1Z5', billing_address: 'Mumbai', notes: null },
    stats: { tenant_id: T1, users_total: 6, users_active: 5, profiles_total: 104230, events_30d: 1820400, deliveries_30d: 412300, est_bytes: 2.1e9, table_rows: { customers: 104230, events: 1820400, customer_delivery_log: 412300 }, refreshed_at: new Date().toISOString() },
    wallet: { tenant_id: T1, allowance_balance: 1200, topup_balance: 8800, monthly_allowance: 2000, overdraft_limit: 500 } },
  { id: T2, name: 'Glow Naturals', slug: 'glow-naturals', plan: 'starter', status: 'trial', created_at: '2026-11-08T10:00:00Z',
    account: null, stats: { tenant_id: T2, users_total: 2, users_active: 2, profiles_total: 98100, events_30d: 0, deliveries_30d: 0, est_bytes: 4.2e8, refreshed_at: new Date().toISOString() },
    wallet: null },
];
const usage = {
  month: '2026-11',
  deliveries: [
    { channel: 'email', status: 'delivered', count: 280100 }, { channel: 'email', status: 'failed', count: 1200 },
    { channel: 'web_push', status: 'delivered', count: 120000 }, { channel: 'whatsapp', status: 'delivered', count: 11000 },
  ],
  realtime: [{ channel: 'web_push', sent: 5000, delivered: 4800, failed: 50, suppressed: 150 }],
  credit_debits: [{ service: 'email', credits: 5063.6, quantity: 281300, entries: 290 }, { service: 'ai_generation', credits: 84, quantity: 42, entries: 42 }],
  credit_movements: { topup_granted: 10000, allowance_granted: 2000, adjustments: 0 },
};
const rates = [
  { service: 'email', unit: 'message', unit_size: 1000, credits_per_unit: 18, description: 'Marbee-managed email (SES), per 1,000 messages — placeholder', updated_at: '2026-11-10T00:00:00Z' },
  { service: 'ai_generation', unit: 'generation', unit_size: 1, credits_per_unit: 2, description: 'One AI generation — placeholder', updated_at: '2026-11-10T00:00:00Z' },
];

class MockError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function answer(op: string, p: Record<string, unknown>): unknown {
  const t = tenants.find((x) => x.id === p.tenant_id) ?? tenants[0];
  switch (op) {
    case 'me': return { admin: { user_id: userId, email: 'ceo@marbee.test', role: 'owner' } };
    case 'list_tenants': return { tenants };
    case 'get_tenant': return { tenant: t, account: t.account, stats: t.stats, wallet: t.wallet, environments: [] };
    case 'tenant_usage': return usage;
    case 'list_ledger': return { entries: [
      { id: 'l2', created_at: '2026-11-09T12:00:00Z', entry_type: 'debit', bucket: 'mixed', amount: -120.5, allowance_after: 1200, topup_after: 8800, service: 'email', quantity: 6694, transactional: false, reason: null, actor_id: null, expires_at: null },
      { id: 'l1', created_at: '2026-11-05T09:00:00Z', entry_type: 'grant', bucket: 'topup', amount: 10000, allowance_after: 2000, topup_after: 10000, service: null, quantity: null, transactional: false, reason: 'Razorpay pay_Mock123 / INV-0001', actor_id: userId, expires_at: '2027-11-05T09:00:00Z' },
    ] };
    case 'list_members': return { members: [
      { user_id: 'u1', status: 'active', created_at: '2026-11-02T10:00:00Z', role: 'Tenant Admin', role_slug: 'admin', email: 'priya@urbanthreads.test', name: 'Priya S', last_login_at: '2026-11-10T08:00:00Z' },
      { user_id: 'u2', status: 'invited', created_at: '2026-11-09T10:00:00Z', role: 'Marketer', role_slug: 'marketer', email: 'rahul@urbanthreads.test', name: null, last_login_at: null },
    ] };
    case 'bill_summary': return {
      tenant: t, account: t.account, month: '2026-11',
      lines: [{ label: `Platform fee — ${t.plan} plan`, amount_inr: t.account?.monthly_fee_inr ?? 0 }, { label: 'Credit top-ups granted this month (1 credit = ₹1)', amount_inr: 10000 }],
      subtotal_inr: (t.account?.monthly_fee_inr ?? 0) + 10000, gst_note: 'GST is added by the invoicing system (Razorpay / Zoho Books).', usage, rate_card: rates };
    case 'rate_card': return { rates };
    // Try slug "taken" for a 409, or an owner email containing "fail" for a failed invite.
    case 'create_tenant': {
      if (p.slug === 'taken' || tenants.some((x) => x.slug === p.slug)) throw new MockError(409, `A workspace with slug "${String(p.slug)}" already exists`);
      const id = crypto.randomUUID();
      tenants.unshift({ id, name: String(p.name), slug: String(p.slug), plan: String(p.plan), status: String(p.status), created_at: new Date().toISOString(),
        account: null, stats: null, wallet: { tenant_id: id, allowance_balance: 0, topup_balance: 0, monthly_allowance: 0, overdraft_limit: 0 } } as unknown as (typeof tenants)[number]);
      const fail = String(p.owner_email).includes('fail');
      return { tenant_id: id, slug: p.slug, provisioned: { roles: 4, schemas: 60, fields: 621 },
        invite: fail ? { sent: false, error: 'Could not send the invitation email — check the project’s SMTP settings and Redirect URLs' } : { sent: true, existing_account: false } };
    }
    case 'invite_owner':
      if (String(p.owner_email).includes('fail')) throw new MockError(502, 'Could not send the invitation email — check the project’s SMTP settings and Redirect URLs');
      return { sent: true, existing_account: String(p.owner_email).includes('existing') };
    case 'audit_log': return { entries: [
      { id: 'a1', created_at: '2026-11-05T09:00:00Z', actor_email: 'ceo@marbee.test', action: 'credits.grant', tenant_id: T1, target: 'topup', details: { amount: 10000, reason: 'Razorpay pay_Mock123' }, ip: '203.0.113.7' },
    ] };
    default: return { ok: true, refreshed: 2, sent: true, duplicate: false, allowance_balance: 1200, topup_balance: 8800 };
  }
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/functions/v1/platform-admin')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 150));
    try {
      return new Response(JSON.stringify({ data: answer(String(body.op), body) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      const status = e instanceof MockError ? e.status : 500;
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Mock error' }), { status, headers: { 'Content-Type': 'application/json' } });
    }
  }
  if (url.includes('/auth/v1/')) {
    return new Response(JSON.stringify({ id: userId, email: 'ceo@marbee.test', factors: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(input, init);
};

console.warn('[console] DEV MOCK MODE — sample data, no backend.');
