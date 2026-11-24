// Regression test: script 46's customer-email unique index + the dev dedupe tool (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const s46 = readFileSync('supabase/sql/46_api_hub.sql', 'utf8');
// Isolate the email-index section of 46 (from its comment to the CREATE UNIQUE INDEX statement).
const start = s46.indexOf('-- Unique email per tenant/env');
const end = s46.indexOf(';', s46.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_env_email_unique')) + 1;
const indexSection = s46.slice(start, end);
const tool = readFileSync('supabase/sql/tools/dev_dedupe_customer_emails.sql', 'utf8');
const undo = `DROP INDEX IF EXISTS public.idx_customers_tenant_env_email_unique;
  UPDATE public.customers c SET email = b.email FROM public._dev_dedupe_backup_20261120 b WHERE c.id = b.customer_id AND c.email IS NULL;
  DROP TABLE public._dev_dedupe_backup_20261120;`;

const db = new PGlite();
await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, environment text,
    email text, created_at timestamptz DEFAULT now(), deleted_at timestamptz, first_name text);
  INSERT INTO customers (tenant_id, environment, email, created_at, first_name) VALUES
    ('00000000-0000-0000-0000-000000000001','production','kishor@hitech.test', now() - interval '3 days', 'oldest'),
    ('00000000-0000-0000-0000-000000000001','production','kishor@hitech.test', now() - interval '1 day', 'copy1'),
    ('00000000-0000-0000-0000-000000000001','production','kishor@hitech.test', now(), 'copy2'),
    ('00000000-0000-0000-0000-000000000001','staging','kishor@hitech.test', now(), 'other-env-ok'),
    ('00000000-0000-0000-0000-000000000001','production', NULL, now(), 'no-email-1'),
    ('00000000-0000-0000-0000-000000000001','production', NULL, now(), 'no-email-2'),
    ('00000000-0000-0000-0000-000000000002','production','kishor@hitech.test', now(), 'other-tenant-ok');`);

try { await db.exec(indexSection); ok(false, '46 must stop on duplicates'); }
catch (e) { ok(/duplicated within a tenant\/environment.*dev_dedupe_customer_emails/.test(e.message), '46 stops with a clear message pointing to the dev tool'); }

await db.exec(tool);
const kept = await db.query(`SELECT first_name FROM customers WHERE email='kishor@hitech.test' AND environment='production' AND tenant_id='00000000-0000-0000-0000-000000000001'`);
ok(kept.rows.length === 1 && kept.rows[0].first_name === 'oldest', 'dedupe keeps the OLDEST profile per email');
ok(Number((await db.query(`SELECT count(*) FROM customers`)).rows[0].count) === 7, 'no customer rows deleted');
ok(Number((await db.query(`SELECT count(*) FROM _dev_dedupe_backup_20261120`)).rows[0].count) === 2, 'the 2 extra copies are backed up');
await db.exec(tool);
ok(Number((await db.query(`SELECT count(*) FROM _dev_dedupe_backup_20261120`)).rows[0].count) === 2, 'running the tool again changes nothing');

try { await db.exec(indexSection); await db.exec(indexSection); ok(true, '46 index section succeeds after dedupe (and re-runs)'); }
catch (e) { ok(false, `46 failed after dedupe → ${e.message}`); }

// What PostgREST/tenant-api sends: ON CONFLICT (tenant_id, environment, email) — must now work.
try {
  await db.exec(`INSERT INTO customers (tenant_id, environment, email, first_name) VALUES
    ('00000000-0000-0000-0000-000000000001','production','kishor@hitech.test','updated')
    ON CONFLICT (tenant_id, environment, email) DO UPDATE SET first_name = EXCLUDED.first_name`);
  const r = await db.query(`SELECT first_name FROM customers WHERE email='kishor@hitech.test' AND environment='production' AND tenant_id='00000000-0000-0000-0000-000000000001'`);
  ok(r.rows.length === 1 && r.rows[0].first_name === 'updated', 'API-style upsert by email works (updates the kept profile)');
} catch (e) { ok(false, `API-style upsert failed → ${e.message}`); }
try { await db.exec(`INSERT INTO customers (tenant_id, environment, email) VALUES ('00000000-0000-0000-0000-000000000001','production', NULL)`); ok(true, 'customers without email still allowed'); }
catch (e) { ok(false, `NULL email rejected → ${e.message}`); }

await db.exec(undo);
ok(Number((await db.query(`SELECT count(*) FROM customers WHERE email='kishor@hitech.test' AND environment='production' AND tenant_id='00000000-0000-0000-0000-000000000001'`)).rows[0].count) === 3, 'undo restores the original duplicate emails');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
