// D-017: build the core chain on PGlite (01 … 94) and prove platform_provision_tenant creates a
// complete, isolated, empty workspace — and refuses bad input without leaving partial rows.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { loadPlan } from '../../../scripts/db/core.mjs';

let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures += 1; };
const throwsWith = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message); } };

const src = readFileSync('supabase/tests/sql/dryrun_chain.mjs', 'utf8');
const stub = src.slice(src.indexOf('await db.exec(`') + 15, src.indexOf('`);', src.indexOf('await db.exec(`')));
const strip = (s) => s.replace(/CREATE\s+EXTENSION[^;]*;/gi, ';').replace(/^\s*ALTER\s+DEFAULT\s+PRIVILEGES[^;]*;/gim, ';');
const db = new PGlite();
await db.exec(stub);
for (const s of loadPlan('.').plan.filter((s) => s.phase === 'core')) await db.exec(strip(s.sql));
await db.exec(strip(readFileSync('supabase/sql/94_tenant_provisioning.sql', 'utf8'))); // re-runnable
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const DEMO = '00000000-0000-0000-0000-000000000001';

// Guard: if schema_fields gains a column, the copy in 94 must be updated deliberately.
const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schema_fields' ORDER BY ordinal_position`)).map((r) => r.column_name).join(',');
ok(cols === 'id,schema_id,name,field_type,is_required,is_primary_key,is_nullable,is_pii,is_indexed,default_value,description,sort_order,references_schema_id,references_field',
  'schema_fields columns match what 94 copies (update 94 if this fails)');

// A demo-only, non-system row that must NOT be copied
await db.exec(`INSERT INTO roles (tenant_id, name, slug, is_system) VALUES ('${DEMO}', 'Demo custom', 'demo_custom', FALSE)`);

// 1) Provision
const res = (await one(`SELECT platform_provision_tenant('Acme Retail', 'acme-retail', 'growth', 'trial', 'in') AS r`)).r;
const T = res.tenant_id;
ok(!!T && res.slug === 'acme-retail', `workspace created (${JSON.stringify(res)})`);
const t = await one(`SELECT name, slug, plan, status FROM tenants WHERE id = $1`, [T]);
ok(t.name === 'Acme Retail' && t.plan === 'growth' && t.status === 'trial', 'tenant row has name, plan and status');
const envs = (await q(`SELECT name, is_default FROM environments WHERE tenant_id = $1 ORDER BY name`, [T]));
ok(envs.map((e) => e.name).join() === 'development,production,staging' && envs.find((e) => e.name === 'production').is_default, 'three environments, production is default');

const demoRoles = (await q(`SELECT slug FROM roles WHERE tenant_id = $1 AND is_system ORDER BY slug`, [DEMO])).map((r) => r.slug).join();
const newRoles = (await q(`SELECT slug FROM roles WHERE tenant_id = $1 ORDER BY slug`, [T])).map((r) => r.slug).join();
ok(newRoles === demoRoles && !newRoles.includes('demo_custom'), `system roles copied, custom demo roles not (${newRoles})`);
const permCount = (await one(`SELECT count(*)::int n FROM permissions`)).n;
const adminPerms = (await one(`SELECT count(*)::int n FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.tenant_id = $1 AND r.slug = 'tenant_admin'`, [T])).n;
ok(adminPerms === permCount && res.tenant_admin_role_id, `Tenant Admin has every permission (${adminPerms}/${permCount})`);
const matrix = async (tid) => (await q(`SELECT r.slug || ':' || p.slug AS k FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE r.tenant_id = $1 AND r.slug <> 'tenant_admin' AND r.is_system ORDER BY 1`, [tid])).map((r) => r.k).join();
ok(await matrix(T) === await matrix(DEMO), 'other roles have exactly the template permission matrix');

const prodSchemas = (await one(`SELECT count(*)::int n FROM schema_definitions WHERE tenant_id = $1 AND environment = 'production' AND is_system`, [DEMO])).n;
const prodFields = (await one(`SELECT count(*)::int n FROM schema_fields f JOIN schema_definitions d ON d.id = f.schema_id WHERE d.tenant_id = $1 AND d.environment = 'production' AND d.is_system`, [DEMO])).n;
const per = await q(`SELECT d.environment, count(DISTINCT d.id)::int s, count(f.id)::int f FROM schema_definitions d LEFT JOIN schema_fields f ON f.schema_id = d.id WHERE d.tenant_id = $1 GROUP BY 1 ORDER BY 1`, [T]);
ok(per.length === 3 && per.every((p) => p.s === prodSchemas && p.f === prodFields), `every environment gets the full production set (${prodSchemas} schemas / ${prodFields} fields each)`);
ok(res.schemas === prodSchemas * 3 && res.fields === prodFields * 3, 'returned counts match');
const custFields = (await one(`SELECT count(*)::int n FROM schema_fields f JOIN schema_definitions d ON d.id = f.schema_id WHERE d.tenant_id = $1 AND d.environment = 'development' AND d.slug = 'customer'`, [T])).n;
const demoDevCust = (await one(`SELECT count(*)::int n FROM schema_fields f JOIN schema_definitions d ON d.id = f.schema_id WHERE d.tenant_id = $1 AND d.environment = 'development' AND d.slug = 'customer'`, [DEMO])).n;
ok(custFields >= demoDevCust, `development Customer schema is complete (${custFields} fields; demo dev has ${demoDevCust})`);

ok((await one(`SELECT count(*)::int n FROM file_folders WHERE tenant_id = $1`, [T])).n === 6, 'default file folders');
ok((await one(`SELECT count(*)::int n FROM credit_wallets WHERE tenant_id = $1`, [T])).n === 1, 'credit wallet');
ok((await one(`SELECT region FROM platform_tenant_accounts WHERE tenant_id = $1`, [T]))?.region === 'in', 'platform account with region');
for (const tbl of ['customers', 'journeys', 'forms', 'connectors', 'data_jobs', 'audiences', 'tenant_users']) {
  const n = (await one(`SELECT count(*)::int n FROM ${tbl} WHERE tenant_id = $1`, [T])).n;
  ok(n === 0, `no demo content copied: ${tbl} = 0`);
}

// Field references re-pointed inside the new workspace (synthetic reference on the template)
await db.exec(`UPDATE schema_fields SET references_schema_id = (SELECT id FROM schema_definitions WHERE tenant_id = '${DEMO}' AND environment='production' AND slug='customer'), references_field = 'id'
  WHERE schema_id = (SELECT id FROM schema_definitions WHERE tenant_id = '${DEMO}' AND environment='production' AND slug='events') AND name = (
    SELECT name FROM schema_fields WHERE schema_id = (SELECT id FROM schema_definitions WHERE tenant_id = '${DEMO}' AND environment='production' AND slug='events') ORDER BY sort_order LIMIT 1)`);
const r2 = (await one(`SELECT platform_provision_tenant('Beta Co', 'beta-co') AS r`)).r;
const ref = await one(`SELECT rd.tenant_id, rd.environment, rd.slug FROM schema_fields f JOIN schema_definitions d ON d.id = f.schema_id JOIN schema_definitions rd ON rd.id = f.references_schema_id
  WHERE d.tenant_id = $1 AND d.environment = 'staging' AND d.slug = 'events'`, [r2.tenant_id]);
ok(ref?.tenant_id === r2.tenant_id && ref.environment === 'staging' && ref.slug === 'customer', 'schema references point at the new workspace\'s own schema, same environment');
const d2 = await one(`SELECT plan, status FROM tenants WHERE id = $1`, [r2.tenant_id]);
ok(d2.plan === 'starter' && d2.status === 'trial', 'defaults: starter plan, trial status');

// 2) Refusals — and nothing half-made
const before = (await one(`SELECT count(*)::int n FROM tenants`)).n;
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Acme 2', 'acme-retail')`), /already exists/), 'duplicate slug refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Demo 2', 'demo')`), /reserved/), 'reserved slug refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Bad', 'Bad Slug!')`), /Slug must be/), 'invalid slug refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Bad', 'a--b')`), /Slug must be/), 'double hyphen refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('X', 'valid-slug')`), /name must be/), 'too-short name refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Okay', 'okay-co', 'gold')`), /Plan must be/), 'unknown plan refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Okay', 'okay-co', 'starter', 'suspended')`), /trial or active/), 'cannot start suspended');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Okay', 'okay-co', 'starter', 'trial', 'mars')`), /Region must be/), 'unknown region refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Okay', 'okay-co', NULL)`), /Plan must be/) && await throwsWith(db.query(`SELECT platform_provision_tenant('Okay', 'okay-co', 'starter', 'trial', NULL)`), /Region must be/), 'NULL plan / region refused');
ok(await throwsWith(db.query(`SELECT platform_provision_tenant('Okay', 'okay-co', 'starter', 'trial', 'in', gen_random_uuid())`), /template/), 'missing template refused');
ok((await one(`SELECT count(*)::int n FROM tenants`)).n === before && (await one(`SELECT count(*)::int n FROM tenants WHERE slug = 'okay-co'`)).n === 0, 'refusals leave no partial workspace');

// 3) Only the service role may call it
let denied = 0;
for (const role of ['authenticated', 'anon']) {
  await db.exec(`SET ROLE ${role}`);
  try { await db.query(`SELECT platform_provision_tenant('Evil', 'evil-co')`); } catch (e) { if (/permission denied/.test(e.message)) denied += 1; }
  await db.exec('RESET ROLE');
}
ok(denied === 2, 'app users (authenticated, anon) cannot call it');

// 4) Isolation: an admin of the demo workspace sees nothing of the new one
const U = 'a1a1a1a1-0000-0000-0000-0000000000a1';
await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${U}', 'demo-admin@test');
  INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
  SELECT '${DEMO}', '${U}', id, 'active' FROM roles WHERE tenant_id = '${DEMO}' AND slug = 'tenant_admin'
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active', role_id = EXCLUDED.role_id;`);
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U}', false); SELECT set_config('request.jwt.claims', '{"sub":"${U}"}', false);`);
const seen = await one(`SELECT (SELECT count(*)::int FROM tenants WHERE id = '${T}') t, (SELECT count(*)::int FROM roles WHERE tenant_id = '${T}') r,
  (SELECT count(*)::int FROM schema_definitions WHERE tenant_id = '${T}') s, (SELECT count(*)::int FROM tenants WHERE id = '${DEMO}') own`);
await db.exec('RESET ROLE');
ok(seen.own === 1 && seen.t === 0 && seen.r === 0 && seen.s === 0, 'demo admin cannot see the new workspace, its roles or schemas');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
