import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types returned by the platform-admin edge function
// ---------------------------------------------------------------------------
export type Admin = { user_id: string; email: string; role: 'owner' | 'operator' };

export type TenantStatus = 'active' | 'suspended' | 'trial';
export type Plan = 'starter' | 'growth' | 'enterprise';
export type Region = 'in' | 'mena' | 'apac' | 'emea' | 'na';

export type Account = {
  tenant_id: string;
  region: Region;
  monthly_fee_inr: number;
  billing_email: string | null;
  legal_name: string | null;
  gstin: string | null;
  billing_address: string | null;
  notes: string | null;
  updated_at?: string;
};

export type Stats = {
  tenant_id: string;
  users_total: number;
  users_active: number;
  profiles_total: number;
  events_30d: number;
  deliveries_30d: number;
  est_bytes: number;
  table_rows?: Record<string, number>;
  refreshed_at: string;
};

export type Wallet = {
  tenant_id: string;
  allowance_balance: number;
  topup_balance: number;
  monthly_allowance: number;
  overdraft_limit: number;
  allowance_reset_at?: string | null;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  status: TenantStatus;
  created_at: string;
};

export type TenantRow = Tenant & { account: Account | null; stats: Stats | null; wallet: Wallet | null };

export type TenantDetail = {
  tenant: Tenant;
  account: Account | null;
  stats: Stats | null;
  wallet: Wallet | null;
  environments: { id: string; name?: string; slug?: string }[];
};

export type LedgerEntry = {
  id: string;
  created_at: string;
  entry_type: 'grant' | 'adjustment' | 'allowance_reset' | 'debit' | 'expiry';
  bucket: 'allowance' | 'topup' | 'mixed';
  amount: number;
  allowance_after: number;
  topup_after: number;
  service: string | null;
  quantity: number | null;
  transactional: boolean;
  reason: string | null;
  actor_id: string | null;
  expires_at: string | null;
};

export type Usage = {
  month: string;
  deliveries: { channel: string; status: string; count: number }[];
  realtime: { channel: string; sent: number; delivered: number; failed: number; suppressed: number }[];
  credit_debits: { service: string; credits: number; quantity: number | null; entries: number }[];
  credit_movements: { topup_granted: number; allowance_granted: number; adjustments: number };
};

export type Member = {
  user_id: string;
  status: string;
  created_at: string;
  role: string | null;
  role_slug: string | null;
  email: string | null;
  name: string | null;
  last_login_at: string | null;
};

export type Rate = {
  service: string;
  unit: string;
  unit_size: number;
  credits_per_unit: number;
  description: string | null;
  updated_at: string;
};

export type BillSummary = {
  tenant: { id: string; name: string; slug: string; plan: Plan };
  account: Account | null;
  month: string;
  lines: { label: string; amount_inr: number }[];
  subtotal_inr: number;
  gst_note: string;
  usage: Usage;
  rate_card: Rate[];
};

export type AuditEntry = {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  tenant_id: string | null;
  target: string | null;
  details: Record<string, unknown>;
  ip: string | null;
};

// ---------------------------------------------------------------------------
// Call wrapper — the console's only path to data
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function call<T>(op: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new ApiError(401, 'Not signed in');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-admin`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ op, ...params }),
    });
  } catch {
    throw new ApiError(0, 'Network error — is the platform-admin function deployed?');
  }
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body.data as T;
}

export type NewTenant = {
  name: string;
  slug: string;
  plan: Plan;
  status: 'trial' | 'active';
  region: Region;
  owner_name: string;
  owner_email: string;
};

export type InviteResult = { sent: boolean; existing_account?: boolean; error?: string };

export type CreateTenantResult = {
  tenant_id: string;
  slug: string;
  provisioned: { roles: number; schemas: number; fields: number };
  invite: InviteResult;
};

export const api = {
  createTenant: (p: NewTenant) => call<CreateTenantResult>('create_tenant', p),
  inviteOwner: (tenant_id: string, owner_name: string, owner_email: string) =>
    call<InviteResult>('invite_owner', { tenant_id, owner_name, owner_email }),
  me: () => call<{ admin: Admin }>('me'),
  listTenants: () => call<{ tenants: TenantRow[] }>('list_tenants'),
  getTenant: (tenant_id: string) => call<TenantDetail>('get_tenant', { tenant_id }),
  refreshStats: (tenant_id?: string) => call<{ refreshed: number }>('refresh_stats', tenant_id ? { tenant_id } : {}),
  usage: (tenant_id: string, month: string) => call<Usage>('tenant_usage', { tenant_id, month }),
  ledger: (tenant_id: string, before?: string) => call<{ entries: LedgerEntry[] }>('list_ledger', { tenant_id, before, limit: 50 }),
  grantCredits: (p: { tenant_id: string; amount: number; bucket: 'allowance' | 'topup'; reason: string; idempotency_key: string; confirm?: string }) =>
    call<{ ok: boolean; duplicate: boolean; allowance_balance: number; topup_balance: number }>('grant_credits', p),
  setCreditPlan: (tenant_id: string, monthly_allowance: number, overdraft_limit: number) =>
    call<Wallet>('set_credit_plan', { tenant_id, monthly_allowance, overdraft_limit }),
  setStatus: (tenant_id: string, status: TenantStatus, confirm?: string, reason?: string) =>
    call<{ status: TenantStatus }>('set_tenant_status', { tenant_id, status, confirm, reason }),
  setPlan: (tenant_id: string, plan: Plan) => call<{ plan: Plan }>('set_tenant_plan', { tenant_id, plan }),
  updateAccount: (tenant_id: string, patch: Partial<Account>) => call<Account>('update_account', { tenant_id, ...patch }),
  members: (tenant_id: string) => call<{ members: Member[] }>('list_members', { tenant_id }),
  sendReset: (tenant_id: string, user_id: string) => call<{ sent: boolean }>('send_password_reset', { tenant_id, user_id }),
  bill: (tenant_id: string, month: string) => call<BillSummary>('bill_summary', { tenant_id, month }),
  rates: () => call<{ rates: Rate[] }>('rate_card'),
  setRate: (service: string, credits_per_unit: number) => call<Rate>('set_rate', { service, credits_per_unit }),
  audit: (tenant_id?: string) => call<{ entries: AuditEntry[] }>('audit_log', tenant_id ? { tenant_id } : {}),
};
