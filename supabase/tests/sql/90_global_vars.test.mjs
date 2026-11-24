// Build 01..90 on PGlite; prove app users can't read/write variable values but can still list metadata.
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
for (const f of files.filter((f) => f < '90_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
const T = 'aaaaaaaa-0000-0000-0000-00000000000a', U = 'a1a1a1a1-0000-0000-0000-0000000000a1', R = 'aaaaaaaa-0000-0000-0000-0000000000a1';
await db.exec(`INSERT INTO tenants (id, name, slug) VALUES ('${T}','A','tenant-a');
  INSERT INTO auth.users (id, email) VALUES ('${U}','a@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES ('${R}','${T}','Admin','admin-a');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES ('${T}','${U}','${R}','active');
  -- Supabase grants new public tables to authenticated by default; mirror that here.
  GRANT SELECT, INSERT, UPDATE, DELETE ON global_variables TO authenticated;
  INSERT INTO global_variables (tenant_id, environment, name, kind, value) VALUES ('${T}','production','HCAPTCHA_SECRET','secret','mbs1.iv.ct');`);
const asUser = async (sql) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U}', false);`);
  try { return await db.query(sql); } finally { await db.exec('RESET ROLE'); }
};
let r = await asUser(`SELECT value FROM global_variables`);
ok(r.rows[0]?.value === 'mbs1.iv.ct', 'BEFORE 90: members can read the value column');
await db.exec(strip(readFileSync('supabase/sql/90_global_variables_server_only.sql', 'utf8')));
await db.exec(strip(readFileSync('supabase/sql/90_global_variables_server_only.sql', 'utf8')));
ok(true, '90 runs (twice)');
try { await asUser(`SELECT value FROM global_variables`); ok(false, 'reading value must fail'); }
catch (e) { ok(/permission denied/.test(e.message), 'AFTER 90: members cannot read values'); }
r = await asUser(`SELECT name, kind, scopes, fingerprint FROM global_variables`);
ok(r.rows.length === 1 && r.rows[0].name === 'HCAPTCHA_SECRET', 'members can still see variable metadata');
for (const [label, sql] of [
  ['insert', `INSERT INTO global_variables (tenant_id, environment, name, kind, value) VALUES ('${T}','production','EVIL','plain','x')`],
  ['update', `UPDATE global_variables SET value = 'x' WHERE tenant_id = '${T}'`],
  ['delete', `DELETE FROM global_variables WHERE tenant_id = '${T}'`],
]) {
  try { await asUser(sql); ok(false, `${label} must fail`); }
  catch (e) { ok(/permission denied/.test(e.message), `members cannot ${label} directly (only via the edge function)`); }
}
await db.exec('SET ROLE service_role');
ok((await db.query(`SELECT value FROM global_variables`)).rows[0].value === 'mbs1.iv.ct', 'service role (edge functions) can still read values');
await db.exec('RESET ROLE');
for (const f of files.filter((f) => f > '90_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
