// TD-17: build 01..91 on PGlite, then prove script 92 makes customer emails
// case-insensitive on every write path, refuses to run over case-duplicates, and
// that the dev dedupe tool clears the way.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 15, src.indexOf('`);', src.indexOf('await db.exec(`')));
const db = new PGlite();
await db.exec(stub);
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
const files = readdirSync('supabase/sql').filter((f) => /^\d+_.*\.sql$/.test(f) && !/^0[03]_/.test(f)).sort();
for (const f of files.filter((f) => f < '92_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const S92 = strip(readFileSync('supabase/sql/92_customer_email_case.sql', 'utf8'));
const TOOL = readFileSync('supabase/sql/tools/dev_dedupe_customer_emails.sql', 'utf8');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a', B = 'bbbbbbbb-0000-0000-0000-00000000000b';
await db.exec(`INSERT INTO tenants (id, name, slug) VALUES ('${A}','A','tenant-a'), ('${B}','B','tenant-b');
  INSERT INTO customers (tenant_id, environment, email, first_name, created_at) VALUES
    ('${A}','production','Priya@Shop.in','Priya', now() - interval '2 days'),
    ('${A}','production','priya@shop.in ','Priya copy', now() - interval '1 day'),
    ('${A}','production','  Ravi@Shop.IN  ','Ravi', now()),
    ('${A}','production','   ','Blank', now()),
    ('${A}','staging','priya@shop.in','Priya staging', now()),
    ('${B}','production','PRIYA@SHOP.IN','Priya other workspace', now());`);
const q = async (sql) => (await db.query(sql)).rows;
const count = async (where) => (await q(`SELECT count(*)::int n FROM customers WHERE ${where}`))[0].n;

// 1. Case-duplicates present → script refuses and changes nothing
try { await db.exec(S92); ok(false, '92 must refuse while case-duplicates exist'); }
catch (e) { ok(/differ only by upper\/lower case/.test(e.message), '92 refuses over case-duplicates with a clear message'); }
ok(await count(`email = 'Priya@Shop.in'`) === 1, 'refusal changed nothing (original casing intact)');
ok((await q(`SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'customers_normalize_email'`))[0].n === 0, 'refusal installed no trigger');

// 2. Dev tool resolves (keeps the oldest, backs up the other)
await db.exec(TOOL);
ok(await count(`first_name = 'Priya copy' AND email IS NULL`) === 1, 'dev tool: newer copy cleared, oldest kept');
ok((await q(`SELECT count(*)::int n FROM _dev_dedupe_backup_20261120`))[0].n === 1, 'dev tool: cleared email backed up');

// 3. Script runs (twice)
await db.exec(S92); await db.exec(S92);
ok(true, '92 runs (twice)');
ok(await count(`email IS NOT NULL AND email <> lower(btrim(email))`) === 0, 'existing emails normalised (lower-case, trimmed)');
ok(await count(`first_name = 'Ravi' AND email = 'ravi@shop.in'`) === 1, 'padded mixed-case email normalised');
ok(await count(`first_name = 'Blank' AND email IS NULL`) === 1, 'blank email became NULL');
ok(await count(`tenant_id = '${B}' AND email = 'priya@shop.in'`) === 1, 'same email in another workspace kept (isolation)');
ok(await count(`environment = 'staging' AND email = 'priya@shop.in'`) === 1, 'same email in another environment kept');

// 4. Every write path: insert, update, upsert
await db.exec(`INSERT INTO customers (tenant_id, environment, email, first_name) VALUES ('${A}','production','  New@Person.COM ','New')`);
ok(await count(`first_name = 'New' AND email = 'new@person.com'`) === 1, 'insert: stored lower-case');
await db.exec(`UPDATE customers SET email = 'Ravi.New@Shop.IN' WHERE first_name = 'Ravi'`);
ok(await count(`first_name = 'Ravi' AND email = 'ravi.new@shop.in'`) === 1, 'update: stored lower-case');
await db.exec(`INSERT INTO customers (tenant_id, environment, email, first_name) VALUES ('${A}','production','PRIYA@shop.IN','Priya (API upsert)')
  ON CONFLICT (tenant_id, environment, email) DO UPDATE SET first_name = EXCLUDED.first_name`);
ok(await count(`tenant_id = '${A}' AND environment = 'production' AND email = 'priya@shop.in'`) === 1, 'upsert with different case: no second customer');
ok(await count(`first_name = 'Priya (API upsert)'`) === 1, 'upsert with different case: updated the existing customer');
try { await db.exec(`INSERT INTO customers (tenant_id, environment, email) VALUES ('${A}','production','NEW@person.com')`); ok(false, 'plain insert of a case-variant must conflict'); }
catch (e) { ok(/duplicate key|unique/i.test(e.message), 'plain insert of a case-variant hits the unique key'); }

// 5. Guarantee holds even with the trigger off
await db.exec(`ALTER TABLE customers DISABLE TRIGGER customers_normalize_email`);
try { await db.exec(`INSERT INTO customers (tenant_id, environment, email) VALUES ('${A}','production','Bypass@X.com')`); ok(false, 'mixed-case must be rejected without the trigger'); }
catch (e) { ok(/customers_email_normalized/.test(e.message), 'CHECK rejects mixed-case even with the trigger disabled'); }
await db.exec(`ALTER TABLE customers ENABLE TRIGGER customers_normalize_email`);

for (const f of files.filter((f) => f > '92_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
