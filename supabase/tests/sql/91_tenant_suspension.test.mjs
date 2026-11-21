// TD-12: build 01..90 on PGlite, apply 91, prove a suspended workspace loses all access
// (members, API keys, website keys, scheduled engine) while other workspaces are untouched
// and reactivation restores everything. Then apply v2/52 and prove the JWT fast path
// and token hook respect suspension too.
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
for (const f of files.filter((f) => f < '91_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));

const A = 'aaaaaaaa-0000-0000-0000-00000000000a';   // will be suspended
const C = 'cccccccc-0000-0000-0000-00000000000c';   // stays active (trial)
const U = 'a1a1a1a1-0000-0000-0000-0000000000a1';   // admin of A, analyst of C
const RA = 'aaaaaaaa-0000-0000-0000-0000000000a1', RC = 'cccccccc-0000-0000-0000-0000000000c1';
await db.exec(`
  INSERT INTO tenants (id, name, slug, status) VALUES ('${A}','A','tenant-a','active'), ('${C}','C','tenant-c','trial');
  INSERT INTO auth.users (id, email) VALUES ('${U}','u@test');
  INSERT INTO roles (id, tenant_id, name, slug) VALUES ('${RA}','${A}','Admin','tenant_admin'), ('${RC}','${C}','Analyst','analyst-c');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status) VALUES ('${A}','${U}','${RA}','active'), ('${C}','${U}','${RC}','active');
  INSERT INTO api_keys (tenant_id, environment, name, key_prefix, key_hash, scopes)
    VALUES ('${A}','production','k','mbk_aaaa', md5('mbk_aaaa_0123456789abcdef'), ARRAY['events:write']);
  INSERT INTO web_analytics_sites (tenant_id, environment, site_id, name, domain, write_key, verification_token, status)
    VALUES ('${A}','production','site_aaaa1111','Site A','a.test','wk_123456789','vt_test','active');
  INSERT INTO data_jobs (id, tenant_id, name, job_type, schedule_cron, schedule_enabled, next_run_at)
    VALUES ('aaaaaaaa-0000-0000-0000-0000000000f1','${A}','job A','pipeline','* * * * *', true, now() - interval '1 minute'),
           ('cccccccc-0000-0000-0000-0000000000f1','${C}','job C','pipeline','* * * * *', true, now() - interval '1 minute');
`);
const asUser = async (sql, claims) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U}', false);
    SELECT set_config('request.jwt.claims', '${JSON.stringify(claims ?? { sub: U })}', false);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', false);`); }
};
const svc = async (sql) => (await db.query(sql)).rows;
const access = async (claims) => {
  const [r] = await asUser(`SELECT
      (SELECT count(*)::int FROM tenants WHERE id = '${A}') AS see_a,
      (SELECT count(*)::int FROM tenants WHERE id = '${C}') AS see_c,
      (SELECT count(*)::int FROM roles WHERE tenant_id = '${A}') AS roles_a,
      (SELECT count(*)::int FROM api_keys WHERE tenant_id = '${A}') AS keys_a,
      user_has_tenant_access('${A}') AS acc_a, user_is_tenant_admin('${A}') AS adm_a,
      user_has_permission('${A}', 'access.manage') AS perm_a, user_has_tenant_access('${C}') AS acc_c`, claims);
  return r;
};

let r = await access();
ok(r.see_a === 1 && r.acc_a && r.adm_a && r.perm_a, 'BEFORE 91: member of A has access');
await db.exec(strip(readFileSync('supabase/sql/91_tenant_suspension.sql', 'utf8')));
await db.exec(strip(readFileSync('supabase/sql/91_tenant_suspension.sql', 'utf8')));
ok(true, '91 runs (twice)');

r = await access();
ok(r.see_a === 1 && r.roles_a === 1 && r.acc_a && r.adm_a && r.perm_a, 'active workspace: access unchanged');
ok(r.see_c === 1 && r.acc_c, 'trial workspace: access unchanged');
ok((await svc(`SELECT * FROM verify_api_key('mbk_aaaa_0123456789abcdef')`)).length === 1, 'active workspace: API key verifies');
ok((await svc(`SELECT resolve_ingest_site('site_aaaa1111','wk_123456789',NULL) AS j`))[0].j.ok === true, 'active workspace: website key verifies');

await db.exec(`UPDATE tenants SET status = 'suspended' WHERE id = '${A}'`);
r = await access();
ok(r.see_a === 0 && r.roles_a === 0 && r.keys_a === 0, 'SUSPENDED: member sees none of the workspace rows');
ok(!r.acc_a && !r.adm_a && !r.perm_a, 'SUSPENDED: access, admin and permission checks all false');
ok(r.see_c === 1 && r.acc_c, 'SUSPENDED A: same user keeps access to their other workspace C');
ok((await svc(`SELECT user_has_permission_as('${U}','${A}','access.manage') AS v`))[0].v === false, 'SUSPENDED: service-side permission check (edge functions) false');
ok((await svc(`SELECT tenant_is_active('${A}') AS a, tenant_is_active('${C}') AS c, tenant_is_active(gen_random_uuid()) AS x`))
  .every((x) => x.a === false && x.c === true && x.x === false), 'tenant_is_active: suspended=false, trial=true, unknown=false');
ok((await svc(`SELECT * FROM verify_api_key('mbk_aaaa_0123456789abcdef')`)).length === 0, 'SUSPENDED: API key no longer verifies');
let j = (await svc(`SELECT resolve_ingest_site('site_aaaa1111','wk_123456789',NULL) AS j`))[0].j;
ok(j.ok === false && j.reason === 'tenant_suspended', 'SUSPENDED: website key refused (tenant_suspended)');
j = (await svc(`SELECT resolve_ingest_site('site_aaaa1111','wrong-key-123',NULL) AS j`))[0].j;
ok(j.reason === 'invalid_key', 'wrong key still answers invalid_key (suspension not revealed without the key)');

const n = (await svc(`SELECT enqueue_due_pipeline_runs() AS n`))[0].n;
const runs = await svc(`SELECT tenant_id FROM data_job_runs`);
ok(n === 1 && runs.length === 1 && runs[0].tenant_id === C, 'engine: only the active workspace gets a scheduled run');
ok((await svc(`SELECT next_run_at FROM data_jobs WHERE tenant_id = '${A}'`))[0].next_run_at !== null, 'engine: suspended job keeps next_run_at (held, not lost)');
try { await asUser(`SELECT tenant_is_active('${A}')`); ok(false, 'app users must not call tenant_is_active directly'); }
catch (e) { ok(/permission denied/.test(e.message), 'app users cannot call tenant_is_active directly'); }

await db.exec(`UPDATE tenants SET status = 'active' WHERE id = '${A}'`);
r = await access();
ok(r.see_a === 1 && r.acc_a && r.perm_a, 'REACTIVATED: access restored');
ok((await svc(`SELECT enqueue_due_pipeline_runs() AS n`))[0].n === 1, 'REACTIVATED: held scheduled job runs');

// ---- v2/52 (JWT fast path + token hook) must keep the same guarantee --------------------
let v2ok = true;
// Whole v2/52 needs real extensions; load just its helper section (jwt_claims … user_is_tenant_admin).
const v2 = readFileSync('supabase/sql/v2/52_extensions_helpers.sql', 'utf8');
const v2helpers = v2.slice(v2.indexOf('CREATE OR REPLACE FUNCTION public.jwt_claims()'), v2.indexOf('-- 3d.'));
try { await db.exec(v2helpers); }
catch (e) { v2ok = false; console.log(`SKIP  v2/52 does not load on PGlite: ${e.message.slice(0, 120)}`); }
if (v2ok) {
  const claimsA = { sub: U, tenant_id: A, app_role: 'tenant_admin', perms: ['access.manage'] };
  r = await access(claimsA);
  ok(r.see_a === 1 && r.acc_a && r.adm_a && r.perm_a, 'v2 fast path: active workspace has access');
  await db.exec(`UPDATE tenants SET status = 'suspended' WHERE id = '${A}'`);
  r = await access(claimsA);
  ok(r.see_a === 0 && !r.adm_a && !r.perm_a, 'v2 fast path: token still names A but suspension applies immediately');
  ok(r.see_c === 1, 'v2 fast path: falls back to the user\'s other active workspace');
  const ev = (await svc(`SELECT custom_access_token_hook(jsonb_build_object('user_id','${U}','claims','{}'::jsonb)) AS e`))[0].e;
  ok(ev.claims.tenant_id === C, 'v2 token hook: never issues a token scoped to a suspended workspace');
  await db.exec(`UPDATE tenants SET status = 'active' WHERE id = '${A}'`);
}

for (const f of files.filter((f) => f > '91_')) await db.exec(strip(readFileSync(`supabase/sql/${f}`, 'utf8')));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
