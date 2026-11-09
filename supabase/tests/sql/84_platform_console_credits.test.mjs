// Regression test for supabase/sql/84_platform_console_credits.sql — runs on PGlite (real Postgres in WASM).
// Run: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const sqlPath = process.argv[2];
const script = readFileSync(sqlPath, 'utf8');
const db = new PGlite();
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
};
const one = async (q, p) => (await db.query(q, p)).rows[0];
const throws = async (q, label, match) => {
  try {
    await db.query(q);
    ok(false, `${label} (expected error)`);
  } catch (e) {
    ok(!match || String(e.message).includes(match), `${label} → "${e.message}"`);
  }
};

// --- Supabase-like stubs ------------------------------------------------------
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  -- mimic Supabase default privileges (the reason the script must REVOKE)
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE TABLE public.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, slug text UNIQUE,
    plan text DEFAULT 'starter', status text DEFAULT 'trial', created_at timestamptz DEFAULT now());
  CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, name text, slug text);
  CREATE TABLE public.tenant_users (tenant_id uuid, user_id uuid, role_id uuid, status text DEFAULT 'active', created_at timestamptz DEFAULT now());
  CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, email text);
  CREATE TABLE public.events (id uuid DEFAULT gen_random_uuid(), tenant_id uuid, "timestamp" timestamptz NOT NULL, payload text)
    PARTITION BY RANGE ("timestamp");
  CREATE TABLE public.events_p1 PARTITION OF public.events FOR VALUES FROM ('2000-01-01') TO ('2100-01-01');
  CREATE TABLE public.customer_delivery_log (id uuid DEFAULT gen_random_uuid(), tenant_id uuid, channel text, status text, "timestamp" timestamptz DEFAULT now());
  CREATE TABLE public.rtm_usage_daily (tenant_id uuid, environment text, definition_id uuid, day date, channel text,
    accepted bigint DEFAULT 0, sent bigint DEFAULT 0, delivered bigint DEFAULT 0, failed bigint DEFAULT 0, suppressed bigint DEFAULT 0, credits bigint DEFAULT 0);
  CREATE TABLE public.assets (id uuid DEFAULT gen_random_uuid(), name text); -- no tenant_id: must be skipped
`);

// --- Run the script twice (idempotency) ---------------------------------------
await db.exec(script);
await db.exec(script);
ok(true, 'script runs twice without error');

const A = (await one(`INSERT INTO tenants (name, slug) VALUES ('Acme', 'acme') RETURNING id`)).id;
const B = (await one(`INSERT INTO tenants (name, slug) VALUES ('Beta', 'beta') RETURNING id`)).id;
await db.exec(`
  INSERT INTO customers (tenant_id) SELECT '${A}' FROM generate_series(1, 30);
  INSERT INTO customers (tenant_id) SELECT '${B}' FROM generate_series(1, 5);
  INSERT INTO events (tenant_id, "timestamp") SELECT '${A}', now() - (g || ' days')::interval FROM generate_series(1, 40) g;
  INSERT INTO customer_delivery_log (tenant_id, channel, status) VALUES ('${A}','email','sent'),('${A}','email','sent'),('${A}','web_push','failed');
  INSERT INTO tenant_users (tenant_id, user_id) VALUES ('${A}', gen_random_uuid()), ('${A}', gen_random_uuid());
`);

// --- Credits ------------------------------------------------------------------
let r = await one(`SELECT credit_adjust('${A}', 100, 'topup', 'Payment pay_1', NULL, 'key-grant-0001') AS r`);
ok(r.r.ok && Number(r.r.topup_balance) === 100, 'grant 100 top-up');
r = await one(`SELECT credit_adjust('${A}', 100, 'topup', 'Payment pay_1', NULL, 'key-grant-0001') AS r`);
ok(r.r.duplicate === true, 'same idempotency key → duplicate, no double grant');
ok(Number((await one(`SELECT topup_balance FROM credit_wallets WHERE tenant_id='${A}'`)).topup_balance) === 100, 'balance still 100');
ok(Number((await one(`SELECT count(*) FROM credit_ledger WHERE tenant_id='${A}'`)).count) === 1, 'one ledger row');

await throws(`SELECT credit_adjust('${A}', -500, 'topup', 'oops fix', NULL, 'key-neg-00001')`, 'correction below zero rejected', 'exceeds');
await throws(`SELECT credit_adjust('${A}', 10, 'topup', '', NULL, 'key-noreason1')`, 'grant without reason rejected', 'reason');

await one(`SELECT credit_set_plan('${A}', 50, 20)`);
r = await one(`SELECT credit_reset_allowance('${A}', '2026-11') AS r`);
ok(Number(r.r.allowance_balance) === 50, 'allowance reset to 50');
r = await one(`SELECT credit_reset_allowance('${A}', '2026-11') AS r`);
ok(r.r.duplicate === true, 'second reset same period is a no-op');

r = await one(`SELECT credit_debit('${A}', 'email', 30, 1666, false, 'debit-000001') AS r`);
ok(r.r.ok && Number(r.r.allowance_balance) === 20 && Number(r.r.topup_balance) === 100, 'debit 30 comes from allowance first');
r = await one(`SELECT credit_debit('${A}', 'email', 50, 2777, false, 'debit-000002') AS r`);
ok(r.r.ok && Number(r.r.allowance_balance) === 0 && Number(r.r.topup_balance) === 70, 'debit 50 spans allowance 20 + top-up 30');
ok((await one(`SELECT bucket FROM credit_ledger WHERE idempotency_key='debit-000002'`)).bucket === 'mixed', 'ledger bucket = mixed');
r = await one(`SELECT credit_debit('${A}', 'email', 80, 4444, false, 'debit-000003') AS r`);
ok(r.r.ok === false && r.r.reason === 'insufficient_credits', 'marketing debit beyond balance refused');
ok(Number((await one(`SELECT topup_balance FROM credit_wallets WHERE tenant_id='${A}'`)).topup_balance) === 70, 'refused debit changed nothing');
r = await one(`SELECT credit_debit('${A}', 'email', 85, 4722, true, 'debit-000004') AS r`);
ok(r.r.ok && Number(r.r.topup_balance) === -15, 'transactional debit may use overdraft (70 → -15)');
r = await one(`SELECT credit_debit('${A}', 'email', 10, 555, true, 'debit-000005') AS r`);
ok(r.r.ok === false, 'transactional debit beyond overdraft (-20) refused');
r = await one(`SELECT credit_debit('${A}', 'email', 85, 4722, true, 'debit-000004') AS r`);
ok(r.r.duplicate === true, 'debit retry with same key is idempotent');
r = await one(`SELECT credit_debit('${B}', 'email', 1, 1, false, 'debit-nowallet') AS r`);
ok(r.r.ok === false && r.r.reason === 'no_wallet', 'tenant without wallet refused');
r = await one(`SELECT credit_adjust('${A}', 40, 'topup', 'Payment pay_2', NULL, 'key-grant-0002') AS r`);
ok(Number(r.r.topup_balance) === 25, 'top-up recovers overdraft (-15 + 40 = 25)');

// --- Immutability ---------------------------------------------------------------
await throws(`UPDATE credit_ledger SET amount = 999999`, 'ledger UPDATE blocked', 'append-only');
await throws(`DELETE FROM credit_ledger`, 'ledger DELETE blocked', 'append-only');
await db.query(`INSERT INTO platform_audit_log (action) VALUES ('test')`);
await throws(`UPDATE platform_audit_log SET action = 'x'`, 'audit UPDATE blocked', 'append-only');
await throws(`DELETE FROM platform_audit_log`, 'audit DELETE blocked', 'append-only');

// --- Stats & usage -----------------------------------------------------------------
await db.exec('ANALYZE');
r = await one(`SELECT platform_refresh_tenant_stats(NULL) AS n`);
ok(Number(r.n) === 2, 'stats refreshed for 2 tenants');
const s = await one(`SELECT * FROM platform_tenant_stats WHERE tenant_id='${A}'`);
ok(Number(s.profiles_total) === 30 && Number(s.users_total) === 2, `tenant A profiles=30 users=2 (got ${s.profiles_total}/${s.users_total})`);
ok(Number(s.events_30d) === 29, `events_30d counts last 30 days on partitioned table (got ${s.events_30d})`);
ok(Number(s.est_bytes) > 0, `estimated bytes > 0 (got ${s.est_bytes})`);
ok(!('assets' in s.table_rows), 'table without tenant_id skipped');
r = await one(`SELECT platform_refresh_tenant_stats('${B}') AS n`);
ok(Number(r.n) === 1, 'single-tenant refresh');
const u = (await one(`SELECT platform_tenant_usage('${A}', current_date) AS u`)).u;
ok(u.deliveries.length === 2, 'usage groups deliveries by channel/status');
ok(Number(u.credit_debits[0]?.credits) === 165, `credit debits this month = 165 (got ${u.credit_debits[0]?.credits})`);

// --- Privileges: anon / authenticated get nothing ----------------------------------
for (const role of ['anon', 'authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  for (const t of ['platform_admins', 'platform_audit_log', 'credit_wallets', 'credit_ledger', 'credit_rate_card', 'platform_tenant_stats', 'platform_tenant_accounts']) {
    await throws(`SELECT * FROM public.${t}`, `${role} cannot read ${t}`, 'permission denied');
  }
  await throws(`SELECT public.credit_adjust('${A}', 1000, 'topup', 'self grant', NULL, 'key-attack-001')`, `${role} cannot grant credits`, 'permission denied');
  await throws(`SELECT public.credit_debit('${A}', 'email', 1, 1, false, 'key-attack-002')`, `${role} cannot debit`, 'permission denied');
  await throws(`SELECT public.platform_tenant_usage('${A}', current_date)`, `${role} cannot read usage`, 'permission denied');
  await db.exec('RESET ROLE');
}
await db.exec('SET ROLE service_role');
ok(Number((await one(`SELECT count(*) FROM public.credit_ledger`)).count) > 0, 'service_role can read ledger');
r = await one(`SELECT public.credit_adjust('${B}', 5, 'topup', 'svc grant', NULL, 'key-svc-00001') AS r`);
ok(r.r.ok, 'service_role can grant');
await db.exec('RESET ROLE');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
