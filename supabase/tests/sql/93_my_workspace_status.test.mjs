// TD-20: my_workspace_status() tells a signed-in user about THEIR OWN workspaces only.
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
for (const f of files.filter((f) => f < '93_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
await db.exec(strip(readFileSync('supabase/sql/93_my_workspace_status.sql', 'utf8')));
await db.exec(strip(readFileSync('supabase/sql/93_my_workspace_status.sql', 'utf8')));
ok(true, '93 runs (twice)');

const A = 'aaaaaaaa-0000-0000-0000-00000000000a', B = 'bbbbbbbb-0000-0000-0000-00000000000b', C = 'cccccccc-0000-0000-0000-00000000000c';
const U = 'a1a1a1a1-0000-0000-0000-0000000000a1', V = 'b2b2b2b2-0000-0000-0000-0000000000b2', N = 'c3c3c3c3-0000-0000-0000-0000000000c3';
await db.exec(`
  INSERT INTO tenants (id, name, slug, status) VALUES ('${A}','Acme','acme','active'), ('${B}','Bolt','bolt','suspended'), ('${C}','Crest','crest','suspended');
  INSERT INTO auth.users (id, email) VALUES ('${U}','u@test'), ('${V}','v@test'), ('${N}','n@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES
    ('aaaaaaaa-0000-0000-0000-0000000000a1','${A}','Admin','tenant_admin'),
    ('bbbbbbbb-0000-0000-0000-0000000000b1','${B}','Admin','tenant_admin'),
    ('cccccccc-0000-0000-0000-0000000000c1','${C}','Admin','tenant_admin');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES
    ('${A}','${U}','aaaaaaaa-0000-0000-0000-0000000000a1','active'),
    ('${B}','${U}','bbbbbbbb-0000-0000-0000-0000000000b1','active'),
    ('${C}','${V}','cccccccc-0000-0000-0000-0000000000c1','active');`);
const as = async (uid) => {
  await db.exec(`SET ROLE ${uid ? 'authenticated' : 'anon'}; SELECT set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { return (await db.query(`SELECT my_workspace_status() AS s`)).rows[0].s; } finally { await db.exec('RESET ROLE'); }
};
let s = await as(U);
ok(s.active === 1 && JSON.stringify(s.suspended) === '["Bolt"]', 'user in one active + one suspended workspace: {active:1, suspended:["Bolt"]}');
s = await as(V);
ok(s.active === 0 && JSON.stringify(s.suspended) === '["Crest"]', 'user whose only workspace is suspended: {active:0, suspended:["Crest"]}');
ok(!JSON.stringify(s).includes('Bolt') && !JSON.stringify(s).includes('Acme'), 'never reveals other users\' workspaces');
s = await as(N);
ok(s.active === 0 && s.suspended.length === 0, 'user with no workspace: {active:0, suspended:[]}');
try { await as(null); ok(false, 'anonymous callers must be refused'); }
catch (e) { ok(/permission denied/.test(e.message), 'anonymous callers cannot call it'); }

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
