// Build 01..86 on PGlite (dry-run stand-ins), then prove tenant isolation on the 7 tables 86 protects.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 15, src.indexOf('`);', src.indexOf('await db.exec(`')));
const db = new PGlite();
await db.exec(stub);
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
for (const f of readdirSync('supabase/sql').filter((f) => /^\d+_.*\.sql$/.test(f) && !/^0[03]_/.test(f)).sort()) {
  await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
}
ok(true, 'full chain 01..86 builds');
await db.exec(strip(readFileSync('supabase/sql/86_rls_missing_tables.sql', 'utf8')));
ok(true, '86 re-runs safely');

const TABLES = ['coupon_campaigns', 'coupon_codes', 'voice_agents', 'autonomous_agent_tasks', 'web_analytics_sites', 'web_analytics_events', 'web_analytics_sessions'];
const off = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition AND NOT c.relrowsecurity`);
ok(off.rows.length === 0, `no public table left without RLS (${off.rows.map((r) => r.relname).join(', ') || 'none'})`);

// Two tenants, two users, one membership each.
const A = 'aaaaaaaa-0000-0000-0000-00000000000a', B = 'bbbbbbbb-0000-0000-0000-00000000000b';
const UA = 'a1a1a1a1-0000-0000-0000-0000000000a1', UB = 'b1b1b1b1-0000-0000-0000-0000000000b1';
await db.exec(`
  INSERT INTO tenants (id, name, slug) VALUES ('${A}','A','tenant-a'), ('${B}','B','tenant-b') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES ('${UA}','a@test'), ('${UB}','b@test') ON CONFLICT DO NOTHING;
  INSERT INTO roles (id, tenant_id, name, slug) VALUES ('${A.slice(0, 35)}1','${A}','Admin','admin-a'), ('${B.slice(0, 35)}1','${B}','Admin','admin-b') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES ('${A}','${UA}','${A.slice(0, 35)}1','active'), ('${B}','${UB}','${B.slice(0, 35)}1','active') ON CONFLICT DO NOTHING;
  INSERT INTO web_analytics_sites (tenant_id, environment, site_id, name, domain, write_key, verification_token)
    VALUES ('${A}','production','site_aaaaaaaaaaaa','A site','a.test','mb_live_aaaaaaaaaaaaaaaa','vtok_a'),
           ('${B}','production','site_bbbbbbbbbbbb','B site','b.test','mb_live_bbbbbbbbbbbbbbbb','vtok_b');
`);
const asUser = async (uid, sql) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await db.query(sql); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
};
let r = await asUser(UA, `SELECT name FROM web_analytics_sites`);
ok(r.rows.length === 1 && r.rows[0].name === 'A site', 'user A sees ONLY tenant A\x27s website');
r = await asUser(UA, `SELECT write_key FROM web_analytics_sites WHERE site_id = 'site_bbbbbbbbbbbb'`);
ok(r.rows.length === 0, 'user A cannot read tenant B\x27s write key even by asking for it');
try { await asUser(UA, `INSERT INTO web_analytics_sites (tenant_id, environment, site_id, name, domain, write_key, verification_token) VALUES ('${B}','production','site_cccccccccccc','evil','e.test','mb_live_cccccccccccccccc','v')`); ok(false, 'insert into B must fail'); }
catch (e) { ok(/row-level security/.test(e.message), 'user A cannot create rows in tenant B'); }
try { await asUser(UA, `INSERT INTO web_analytics_sites (tenant_id, environment, site_id, name, domain, write_key, verification_token) VALUES ('${A}','production','site_dddddddddddd','mine','m.test','mb_live_dddddddddddddddd','v')`); ok(true, 'user A CAN register a website in its own tenant (the "Add website" bug is gone)'); }
catch (e) { ok(false, `own-tenant insert failed → ${e.message}`); }
r = await asUser(UA, `UPDATE web_analytics_sites SET name = 'hacked' WHERE tenant_id = '${B}' RETURNING id`);
ok(r.rows.length === 0, 'user A cannot modify tenant B\x27s rows');
r = await asUser(UB, `DELETE FROM web_analytics_sites WHERE tenant_id = '${A}' RETURNING id`);
ok(r.rows.length === 0, 'user B cannot delete tenant A\x27s rows');
for (const t of TABLES) {
  await db.exec('SET ROLE anon');
  try { await db.query(`SELECT 1 FROM public.${t} LIMIT 1`); ok(false, `anon must not read ${t}`); }
  catch (e) { ok(/permission denied/.test(e.message), `anon (public key, not signed in) cannot read ${t}`); }
  finally { await db.exec('RESET ROLE'); }
}
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
