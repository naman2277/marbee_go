// Build 01..88 on PGlite (incl. 05's demo auto-link), then prove new users no longer join the demo tenant.
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
for (const f of files.filter((f) => f < '88_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const demo = '00000000-0000-0000-0000-000000000001';
const members = async (email) => Number((await db.query(
  `SELECT count(*) FROM tenant_users tu JOIN auth.users u ON u.id = tu.user_id WHERE u.email = $1 AND tu.tenant_id = $2`, [email, demo])).rows[0].count);
await db.exec(`INSERT INTO auth.users (email) VALUES ('before88@test')`);
ok(await members('before88@test') === 1, 'BEFORE 88: a brand-new signup is auto-added to the demo tenant (the hole)');
await db.exec(strip(readFileSync('supabase/sql/88_signup_no_auto_tenant.sql', 'utf8')));
await db.exec(strip(readFileSync('supabase/sql/88_signup_no_auto_tenant.sql', 'utf8')));
ok(true, '88 runs (twice)');
await db.exec(`INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('after88@test', '{"full_name":"Asha Rao"}')`);
ok(await members('after88@test') === 0, 'AFTER 88: a new signup joins NO tenant');
const p = (await db.query(`SELECT p.name FROM profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = 'after88@test'`)).rows[0];
ok(p?.name === 'Asha Rao', 'AFTER 88: profile still created (with full name)');
ok(Number((await db.query(`SELECT count(*) FROM tenant_users tu JOIN auth.users u ON u.id = tu.user_id WHERE u.email = 'after88@test'`)).rows[0].count) === 0, 'AFTER 88: no membership in ANY tenant');
for (const f of files.filter((f) => f > '88_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
